// 由 DCF 预填库的财报原值推导一组“合理起点”假设。每个字段附来源说明，用户可逐项改动。
// 规则刻意保守、可复核：近3年平均自由现金流、营收增速封顶15%、CAPM WACC 夹在 7%～12%。
import { calculateSheetDcf } from "./engine.ts";
import { calculateWacc } from "./wacc.ts";
import type { Currency, DcfSheetInput, Market } from "./types.ts";

export interface PrefillItem {
  m: "cn" | "hk" | "us"; c: string; n: string; g: string[]; px: number; pxDate: string | null; ccy: Currency
  fy: string; fin?: boolean; org?: string
  /** [财年, 营收, 经营现金流, 资本开支, 折旧摊销, 股权激励]，基础单位（元/港元/美元），新到旧；旧数据只有前四列 */
  years: [string, number | null, number | null, number | null, (number | null)?, (number | null)?][]
  cash: number | null; inv: number | null; debt: number | null; mi?: number | null; shares: number | null
  interest: number | null; pretax: number | null; tax: number | null; ebitda: number | null; ni: number | null
  beta: number | null; betaRaw: number | null; betaWeeks: number | null
  fx?: { from: string; rate: number; date: string }; notes?: string[]; src: string; at: string
  /** 行业（A股东财一级、港股二级、美股 SIC 归并） */
  ind?: string
  /** 近5年自由现金流收益率位置（%）：当前、分位、中位、最低、最高、样本月数 */
  fyh?: { now: number; pct: number; med: number; lo: number; hi: number; n: number }
}
export interface RiskFree { value: number; date: string | null; label: string }
export interface PrefillLibrary { schemaVersion: 1; generatedAt: string; riskFree: { cn: RiskFree; us: RiskFree }; universe: number; issues: string[]; items: PrefillItem[] }

export const AUTO_RULES = {
  fcfYears: 3,
  growthCap: 15,
  growthFloor: 0,
  perpetual: 2.5,
  /** 股权风险溢价：美股接近 Damodaran 隐含 ERP；A股、港股含新兴市场国家风险溢价 */
  erp: { cn: 6, hk: 6.5, us: 4.5 } as Record<"cn" | "hk" | "us", number>,
  debtSpread: 2,
  /** A股/港股的联营、股权及金融投资按账面值的 70% 计入（流动性、控制权与税务折价）；美股为有价证券，按 100% */
  investmentKeep: 0.7,
  /** 维持性口径与默认口径相差超过此比例才提示，避免无意义的选项 */
  altMinDiff: 0.1,
  /** 第 6 年起用多少年把增速线性降到永续（三阶段） */
  fadeYears: 5,
  /** 资本开支超过折旧摊销这个倍数，视为处于扩张投入期，提供维持性资本开支口径 */
  expansionRatio: 1.3,
  /** 折现率合理区间：A股、港股资金成本不宜低于 8%，避免低利率环境下系统性高估 */
  wacc: { cn: [8, 12], hk: [8, 13], us: [7, 12] } as Record<"cn" | "hk" | "us", [number, number]>,
} as const

export type AutoField = "baseFcf" | "growth" | "perpetualGrowth" | "discountRate" | "cash" | "debt" | "shares" | "currentPrice" | "fadeYears" | "minority"
  | "ebitda" | "marketCap" | "beta" | "interestExpense" | "pretaxIncome" | "taxPaid" | "riskFreeRate" | "marketReturn"
export type AutoStatus = "ok" | "financial" | "negativeFcf" | "incomplete"
export interface AutoFill {
  meta: { company: string; code: string; market: Market; currency: Currency; baseYear: string }
  /** 金额以“亿”、股本以“亿股”表示的字符串，可直接放进表单 */
  values: Partial<Record<AutoField, string>>
  sources: Partial<Record<AutoField, string>>
  status: AutoStatus
  statusText: string
  notes: string[]
  /** 可选的替代口径，例如扩张期公司的维持性资本开支自由现金流 */
  alternatives: { field: AutoField; value: string; label: string; reason: string }[]
}

const YI = 1e8
const yi = (v: number) => String(Number((v / YI).toFixed(v / YI >= 100 ? 1 : 2)))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round = (v: number, step: number) => Math.round(v / step) * step
const fmt = (v: number, d = 1) => Number(v.toFixed(d)).toString()

export function deriveAutoFill(item: PrefillItem, riskFree: PrefillLibrary["riskFree"]): AutoFill {
  const values: AutoFill["values"] = {}, sources: AutoFill["sources"] = {}, notes: string[] = [...(item.notes ?? [])]
  const set = (field: AutoField, value: number | null, source: string, asYi = true) => {
    if (value == null || !Number.isFinite(value)) return
    values[field] = asYi ? yi(value) : String(value)
    sources[field] = source
  }
  const fyYear = item.fy.slice(0, 4)
  const report = item.m === "us" ? "10-K" : "年报"
  if (item.fx) notes.push(`财报以 ${item.fx.from} 披露，已按 ${item.fx.date} 汇率 ${fmt(item.fx.rate, 4)} 折算为 ${item.ccy}`)

  // ---- 起始自由现金流：近3年（经营现金流 − 资本开支 − 股权激励）平均 ----
  const usable = item.years.filter(([, , ocf, capex]) => ocf != null && capex != null).slice(0, AUTO_RULES.fcfYears)
  const sbcDeducted = usable.some(r => (r[5] ?? 0) > 0)
  const fcfs = usable.map(r => [r[0], r[2]! - r[3]! - (r[5] ?? 0)] as const)
  const avgFcf = fcfs.length >= 2 ? fcfs.reduce((s, [, v]) => s + v, 0) / fcfs.length : null
  const alternatives: AutoFill["alternatives"] = []
  // 金融企业的经营现金流含存贷款变动，不是自由现金流，不预填，避免算出无意义的价格
  if (avgFcf != null && !item.fin) {
    set("baseFcf", avgFcf, `近${fcfs.length}年平均（${fcfs[fcfs.length - 1][0]}–${fcfs[0][0]}${report}：${fcfs.map(([, v]) => yi(v)).join(" / ")} 亿${sbcDeducted ? "，已扣股权激励" : ""}）`)
    // 扩张投入期：资本开支明显高于折旧摊销时，多出的部分是为增长而投，可用“维持性资本开支≈折旧摊销”口径对照
    const withDa = usable.filter(r => r[4] != null && r[4]! > 0)
    if (withDa.length === usable.length && usable.length >= 2) {
      const capex = usable.reduce((s, r) => s + r[3]!, 0), da = withDa.reduce((s, r) => s + r[4]!, 0)
      if (capex > da * AUTO_RULES.expansionRatio) {
        const maint = usable.reduce((s, r) => s + r[2]! - Math.min(r[3]!, r[4]!) - (r[5] ?? 0), 0) / usable.length
        if (Math.abs(maint - avgFcf) > Math.abs(avgFcf) * AUTO_RULES.altMinDiff) alternatives.push({ field: "baseFcf", value: yi(maint), label: `维持性口径 ${yi(maint)} 亿`,
          reason: `近${usable.length}年资本开支是折旧摊销的 ${fmt(capex / da)} 倍，处于扩张投入期；把超出折旧的部分视为增长投资，自由现金流约 ${yi(maint)} 亿。该口径隐含这些投资能带来增长，适合投入期确定性较高的公司。` })
      }
    }
  }

  // ---- 五年成长率：营收复合增速，封顶 15%、不低于 0 ----
  const revs = item.years.filter(([, r]) => r != null && r > 0)
  if (revs.length >= 3) {
    const span = Number(revs[0][0]) - Number(revs[revs.length - 1][0])
    const cagr = ((revs[0][1]! / revs[revs.length - 1][1]!) ** (1 / span) - 1) * 100
    const g = round(clamp(cagr, AUTO_RULES.growthFloor, AUTO_RULES.growthCap), 0.5)
    set("growth", g, `近${span}年营收复合增速 ${fmt(cagr)}%${cagr > AUTO_RULES.growthCap ? `，按上限 ${AUTO_RULES.growthCap}%` : cagr < 0 ? "，下滑按 0%" : ""}`, false)
  } else {
    set("growth", 5, "营收历史不足3年，暂按 5%", false)
  }
  set("perpetualGrowth", AUTO_RULES.perpetual, "长期名义增长，不高于 GDP 增速", false)

  // ---- 资产负债表 ----
  const keep = item.m === "us" ? 1 : AUTO_RULES.investmentKeep
  const inv = Math.max(0, item.inv ?? 0) * keep
  const cashTotal = item.cash == null && item.inv == null ? null : (item.cash ?? 0) + inv
  set("cash", cashTotal, `${fyYear}${report}：现金 ${item.cash == null ? "—" : yi(item.cash)} 亿${inv ? item.m === "us" ? ` + 有价证券 ${yi(inv)} 亿` : ` + 金融及联营投资账面值 ${yi(item.inv!)} 亿 × ${keep * 100}%` : ""}`)
  if (item.m !== "us" && item.cash != null && inv > Math.max(item.cash, 0)) notes.push(`投资资产（按七折 ${yi(inv)} 亿）超过现金，估值对这部分很敏感；上市投资可按市值、非上市投资宜保守`)
  set("minority", item.mi ?? 0, item.mi ? `${fyYear}${report}少数股东权益（账面值），属于子公司其他股东` : "报表无少数股东权益")
  set("fadeYears", AUTO_RULES.fadeYears, `三阶段：高增长 5 年后，再用 ${AUTO_RULES.fadeYears} 年把增速降到永续增长率`, false)
  set("debt", item.debt, `${fyYear}${report}有息负债（借款、债券、租赁），不含应付账款等经营负债`)
  set("shares", item.shares, `${fyYear}${report}总股本`)
  set("currentPrice", item.px, `${item.pxDate ?? ""} 收盘价`, false)
  set("ebitda", item.ebitda, `${fyYear}${report}：经营利润 + 折旧摊销`)

  // ---- WACC 各项 ----
  const rf = item.m === "cn" ? riskFree.cn : riskFree.us
  const erp = AUTO_RULES.erp[item.m]
  set("riskFreeRate", Number(rf.value.toFixed(2)), `${rf.label}${rf.date ? ` ${rf.date}` : ""}${item.m === "hk" ? "（港元联系汇率，参照美债）" : ""}`, false)
  set("marketReturn", Number((rf.value + erp).toFixed(2)), `无风险利率 + 股权风险溢价 ${erp}%`, false)
  set("beta", item.beta ?? 1, item.beta != null ? `近${item.betaWeeks}周周线回归 ${fmt(item.betaRaw ?? item.beta, 2)}，经 Blume 调整` : "历史不足，按 1", false)
  if (item.shares != null) set("marketCap", item.px * item.shares, "现价 × 总股本")
  let interest = item.interest
  if ((interest == null || interest <= 0) && (item.debt ?? 0) > 0) {
    interest = item.debt! * (rf.value + AUTO_RULES.debtSpread) / 100
    set("interestExpense", interest, `未披露利息支出，按无风险利率 + ${AUTO_RULES.debtSpread}% 估算`)
  } else set("interestExpense", interest ?? 0, `${fyYear}${report}利息支出`)
  set("pretaxIncome", item.pretax, `${fyYear}${report}税前利润`)
  set("taxPaid", item.tax, `${fyYear}${report}所得税`)

  const draft: DcfSheetInput = {
    company: item.n, code: item.c, market: item.m, currency: item.ccy, moneyUnit: "yi", shareUnit: "yi", baseYear: Number(fyYear),
    baseFcf: null, growth: null, perpetualGrowth: null, discountRate: null, cash: null, shares: null, currentPrice: null, ebitda: null,
    marketCap: num(values.marketCap), beta: num(values.beta), debt: num(values.debt), interestExpense: num(values.interestExpense),
    pretaxIncome: num(values.pretaxIncome), taxPaid: num(values.taxPaid), riskFreeRate: num(values.riskFreeRate), marketReturn: num(values.marketReturn),
  }
  const wacc = calculateWacc(draft)
  if (wacc.status === "calculated" && wacc.wacc != null) {
    const [lo, hi] = AUTO_RULES.wacc[item.m]
    const r = round(clamp(wacc.wacc, lo, hi), 0.1)
    set("discountRate", Number(r.toFixed(1)), `WACC ${fmt(wacc.wacc, 2)}%${r !== round(wacc.wacc, 0.1) ? `，按 ${lo}%～${hi}% 合理区间取 ${fmt(r)}%` : ""}`, false)
  } else set("discountRate", 10, `WACC 无法计算（${wacc.reason}），暂按 10%`, false)

  let status: AutoStatus = "ok", statusText = "已按公开财报自动估算，可逐项修改"
  if (item.fin) { status = "financial"; statusText = `${item.org || "金融"}企业的现金流含存贷款等业务资金，不适用 DCF；建议改看市净率、股息率` }
  else if (avgFcf == null || item.shares == null) { status = "incomplete"; statusText = "关键财报数据不全，已填入可取得的部分，请补齐后再看结果" }
  else if (avgFcf <= 0) { status = "negativeFcf"; statusText = "近年平均自由现金流为负，DCF 不适用；可改看市销率或等待现金流转正" }
  return { meta: { company: item.n, code: item.c, market: item.m, currency: item.ccy, baseYear: fyYear }, values, sources, status, statusText, notes, alternatives }
}
const num = (s: string | undefined) => s == null || s === "" ? null : Number(s)

/** 按名称或代码搜索：精确代码优先，其次代码前缀、名称前缀，再次名称包含 */
export function searchPrefill(items: PrefillItem[], query: string, limit = 8): PrefillItem[] {
  const q = query.trim().toLowerCase().replace(/^(sh|sz|hk|us)/, "")
  if (!q) return []
  const score = (i: PrefillItem) => {
    const code = i.c.toLowerCase(), name = i.n.toLowerCase()
    if (code === q || code.replace(/^0+/, "") === q.replace(/^0+/, "")) return 0
    if (code.startsWith(q)) return 1
    if (name.startsWith(q)) return 2
    if (name.includes(q)) return 3
    return 9
  }
  return items.map(i => [i, score(i)] as const).filter(([, s]) => s < 9).sort((a, b) => a[1] - b[1]).slice(0, limit).map(([i]) => i)
}

/**
 * 反向 DCF：其余假设不变，求使合理价等于现价的五年成长率（%）。
 * 合理价随成长率单调递增，用二分法；超出 -30%～60% 视为无法用成长解释，返回 null。
 */
export function impliedGrowth(input: DcfSheetInput): number | null {
  const price = input.currentPrice;
  if (price == null || price <= 0) return null;
  const at = (g: number) => calculateSheetDcf({ ...input, growth: g }).price;
  let lo = -30, hi = 60;
  const pLo = at(lo), pHi = at(hi);
  if (pLo == null || pHi == null || pLo > price || pHi < price) return null;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2, p = at(mid);
    if (p == null) return null;
    if (p < price) lo = mid; else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 10) / 10;
}
