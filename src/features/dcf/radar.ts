// 机会雷达（规则第 2 版）：按《正念投资》的方法，先分类，再按类型各用各的买入检查。
// 两条主线：价值回归（第20章，稳健型/缓慢增长型）与快速增长（第21章，快速增长型）；
// 巴菲特的护城河与财务稳健（第23—24章）只作加减分，不单独成线。周期型、困境反转型、资产型不进主线（第19章 19.2–19.3）。
// 规则固定、可复核，只做研究短名单，不是买卖建议；缺数据就排除并写明原因，不补数。
import { autoDcfKey, type AutoDcf } from "./autoDcf.ts";
import type { PrefillItem } from "./autofill.ts";

/** 规则版本：信号台账按版本解读雷达列（第 1 版为“DCF + 历史 + 同行”的加分信号数） */
export const RADAR_VERSION = 2;

export const RADAR_RULES = {
  /** 20.3 历史估值带：自由现金流收益率高于近 5 年多少比例的月份（沿用第 1 版门槛；按财报约 4 个月后公开对齐，不偷看未来） */
  historyPct: 60,
  /** 站内快速增长门槛（scripts/lib/lynch-classify.mjs growthBucket）：有效增速 ≥20% 且营收增速 ≥10% */
  fastGrowth: 20,
  fastRevenue: 10,
  /** 站内增速标记（scripts/lib/lynch-inputs.mjs）：>50% 不可外推、按 50% 封顶；>80% 多为低基数或一次性 */
  extrapolateCap: 50,
  lowBase: 80,
  /** 21.7 压力算式：增速维持 3 年、第 3 年 PE 回到 15 倍，年化回报仍不低于 10%（20.4、24.3 的教学要求回报，未计分红）
   *  → 现价 PE ≤ (1+g)³ × 15 ÷ 1.10³ */
  stressYears: 3,
  stressExitPe: 15,
  requiredReturn: 10,
  /** 21.4 增长桥接：营收增速至少达到利润有效增速的一半，否则增长主要来自利润率，需先核查 */
  bridgeRatio: 0.5,
  /** 23.3 护城河迹象加分；24.4 财务不稳健扣分（不确定性越大，要求的折扣越大） */
  moatBonus: { wide: 1, narrow: 0.5 },
  healthBonus: 0.5,
  healthPenalty: -1,
  /** 21.3 股本变动 >25% 时每股增长可能被稀释 */
  dilutionPenalty: -1,
} as const;

/** 书中章节（站内阅读路径） */
export const RADAR_BOOK = {
  overview: "第19章-总纲.md",
  value: "第20章-价值回归.md",
  growth: "第21章-快速增长型.md",
  turnaround: "第22章-困境反转型.md",
  moat: "第23章-能力圈与护城河.md",
  margin: "第24章-安全边际与长期持有.md",
} as const;

/** 雷达用到的林奇数据字段（public/data/lynch.json，键为 market:code） */
export interface RadarLynch {
  t: string;
  pe?: number | null; g?: number | null; c?: number | null; rg?: number | null
  ph?: string | null
  w: string[]; f: string[]
  m: { s: number; n: number; l: string; i: [string, boolean | null, string][] } | null
  cyclical?: boolean
  peAsOf?: string | null
  /** 增速按新财报重算时才有：数据来源与三个窗口的截止日（新→旧） */
  inputSource?: string; inputWindows?: string[]
}

export type Lane = "value" | "growth";
export interface Check {
  id: string; label: string
  /** true 通过 / false 未通过 / null 无法判断（数据不足） */
  pass: boolean | null
  /** 计入总分的分值（可为负） */
  points: number
  detail: string
}
export interface RadarRow {
  key: string; lane: Lane; item: PrefillItem; lynch: RadarLynch
  /** 林奇数据键的市场（us/adr/ndx/cn/hk），用于公司页链接与候选池 */
  venue: string
  dcf: AutoDcf | null
  /** 必要条件（全部通过才进榜）与计分项、巴菲特加减分 */
  gates: Check[]; checks: Check[]; overlay: Check[]
  score: number
  /** 同分排序：数据可信度 0 = 高 */
  credRank: number
  /** 价格余量：价值回归 = 合理价 / 现价 − 1；快速增长 = PE 上限 / 现价 PE − 1 */
  headroom: number
  dates: { price: string | null; pe: string | null; growth: string; fy: string }
}
export type SideGroup = "cyclical" | "turnaround" | "asset" | "nodata";
export interface Exclusion { key: string; item: PrefillItem; group: Lane | SideGroup; type: string; reason: string }
export interface RadarResult {
  value: RadarRow[]; growth: RadarRow[]
  /** 进入某条主线、但没通过必要条件的公司（含原因） */
  excluded: Exclusion[]
  /** 不在主线的公司：周期型、困境反转型、资产型、无分类 */
  side: Exclusion[]
  /** 周期型里当前处于盈利低位的公司：选读观察，不排名 */
  cyclicalWatch: { item: PrefillItem; lynch: RadarLynch; venue: string }[]
}

const has = (list: string[] | undefined, needle: string) => !!list?.some((x) => typeof x === "string" && x.includes(needle));
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const moatItem = (l: RadarLynch, name: string) => l.m?.i.find((x) => x[0] === name);
const pctTxt = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v)}%`;

/** 林奇键：预填库的美股可能在 lynch.json 里记为 us / adr / ndx */
export function lynchKeyOf(item: PrefillItem, lynch: Record<string, RadarLynch>): string | null {
  const keys = item.m === "us" ? [`us:${item.c}`, `adr:${item.c}`, `ndx:${item.c}`] : [`${item.m}:${item.c}`];
  return keys.find((k) => lynch[k]) ?? null;
}

/** 强周期：人工复核的 cyclical 布尔优先，否则看生成器的行业标记（与 lynch-classify isCyclical 同序） */
export function isCyclicalEntry(l: RadarLynch): boolean {
  if (typeof l.cyclical === "boolean") return l.cyclical;
  return has(l.w, "行业属强周期") || has(l.f, "所属行业有周期属性");
}

export function effectiveGrowth(l: RadarLynch): number | null {
  return fin(l.g) && fin(l.c) ? Math.min(l.g, l.c) : null;
}

/** 21.7：增速 g（按 50% 封顶）维持 3 年、届时 PE 回到 15 倍，年化回报仍有 10% 所允许的最高现价 PE */
export function stressPeCeiling(growthPct: number): number {
  const g = Math.min(growthPct, RADAR_RULES.extrapolateCap) / 100;
  const r = RADAR_RULES.requiredReturn / 100;
  return ((1 + g) / (1 + r)) ** RADAR_RULES.stressYears * RADAR_RULES.stressExitPe;
}

function growthDate(l: RadarLynch): string {
  return l.inputSource && l.inputWindows?.[0] ? `按新财报重算，窗口截至 ${l.inputWindows[0]}` : "原研究口径，核验日期缺失";
}

/** 巴菲特加减分：护城河迹象（23.3）与财务稳健（24.4）。能力圈因人而异，书与站内都没有给出统一的行业清单，雷达不评。 */
function overlayChecks(l: RadarLynch): Check[] {
  const label = l.m?.l ?? "数据不足";
  const wide = label.startsWith("宽"), narrow = label.startsWith("窄");
  const moatDetail = l.m ? `${label}（六项检查通过 ${l.m.s}/${l.m.n} 项可评项）` : "无护城河检查数据";
  const moat: Check = {
    id: "moat", label: "护城河迹象", pass: wide || narrow ? true : l.m && l.m.n > 3 ? false : null,
    points: wide ? RADAR_RULES.moatBonus.wide : narrow ? RADAR_RULES.moatBonus.narrow : 0, detail: moatDetail,
  };
  const h = moatItem(l, "财务稳健");
  const health: Check = {
    id: "health", label: "财务稳健", pass: h ? h[1] : null,
    points: h?.[1] === true ? RADAR_RULES.healthBonus : h?.[1] === false ? RADAR_RULES.healthPenalty : 0,
    detail: h ? h[2] : "无数据",
  };
  return [moat, health];
}

const sum = (cs: Check[]) => cs.reduce((s, c) => s + c.points, 0);

function valueRow(key: string, venue: string, item: PrefillItem, l: RadarLynch, dcf: AutoDcf | undefined): RadarRow | string {
  // 正常盈利（20.2、20.8）：周期顶点或正在下修的利润不能当正常盈利
  if (isCyclicalEntry(l)) return "强周期属性：最近利润可能是周期顶点，低估值会误导（20.8）";
  if (l.ph === "盈利高位" || l.ph === "盈利下行") return `盈利位置「${l.ph}」：正常盈利可能被下修（20.1、20.8）`;
  if (has(l.w, "波动 ≥1.6 倍")) return "近三个 TTM 利润大起大落，正常盈利无法确定（20.2）";
  const persist = moatItem(l, "盈利持续");
  if (!persist || persist[1] == null) return "缺三个 TTM 窗口利润，无法检查正常盈利（20.2）";
  if (persist[1] === false) return "近三个 TTM 利润萎缩或回撤超过 30%：正常盈利可能已下修，先核实是否一次性因素（20.2、20.10）";
  // 价格条件（20.4、24.4）：自动 DCF 的买入参考价已按可信度留出 20%/30% 安全边际
  if (!dcf) return "预填库没有自动 DCF";
  if (dcf.status === "financial") return "金融业：自动 DCF 不适用，雷达没有统一价格参考（去公司页看研究情景）";
  if (dcf.status === "negativeFcf") return "自由现金流为负：自动 DCF 不适用";
  if (dcf.status !== "ok" || dcf.fair == null || dcf.buyBelow == null) return "财报数据不全：自动 DCF 无法计算";
  if (dcf.credibility === "low") return "自动 DCF 可信度低：价格参考不足以作条件";
  if (!(dcf.current <= dcf.buyBelow)) return "价格条件未满足：现价高于 DCF 买入参考价";

  const gates: Check[] = [
    { id: "normal", label: "正常盈利依据", pass: true, points: 0, detail: `非强周期、盈利不在高位或下行；${persist[2]}` },
    { id: "price", label: "低于买入参考价", pass: true, points: 0, detail: `现价 ${dcf.current} ≤ 买入参考价 ${Number(dcf.buyBelow.toPrecision(4))}（可信度${dcf.credibility === "high" ? "高，留 20%" : "中，留 30%"}安全边际）` },
  ];
  const pct = item.fyh?.pct ?? null;
  const checks: Check[] = [
    {
      id: "history", label: "比自己过去便宜", pass: pct == null ? null : pct >= RADAR_RULES.historyPct, points: pct != null && pct >= RADAR_RULES.historyPct ? 1 : 0,
      detail: pct == null ? "历史不足两年" : `FCF 收益率高于近 5 年 ${pct}% 的月份（门槛 ${RADAR_RULES.historyPct}%）`,
    },
  ];
  const overlay = overlayChecks(l);
  return {
    key, lane: "value", item, lynch: l, venue, dcf, gates, checks, overlay, score: sum(checks) + sum(overlay),
    credRank: dcf.credibility === "high" ? 0 : 1, headroom: dcf.fair / dcf.current - 1,
    dates: { price: item.pxDate || null, pe: l.peAsOf ?? null, growth: growthDate(l), fy: item.fy },
  };
}

function growthRow(key: string, venue: string, item: PrefillItem, l: RadarLynch, dcf: AutoDcf | undefined): RadarRow | string {
  if (isCyclicalEntry(l)) return "强周期行业：连续高增可能是周期顶部（20.8）";
  if (l.ph === "盈利高位") return "盈利位置「盈利高位」";
  // 第21章的检查从单位经济与复制开始（21.2）；金融业利润随市场成交、利率与信用起落，这套检查不适用
  if (item.fin) return "金融业：利润随市场成交、利率与信用周期起落，单位经济与复制的检查不适用（21.2）";
  // 每股增长要持续（21.3）：近一年与两年年化都要有、都达标
  if (!fin(l.g) || !fin(l.c)) return "缺近一年或两年年化利润增速，无法验证增长是否持续";
  const eg = Math.min(l.g, l.c);
  if (eg < RADAR_RULES.fastGrowth) return `有效增速 ${pctTxt(eg)} 低于快速增长门槛 ${RADAR_RULES.fastGrowth}%`;
  if (!fin(l.rg) || l.rg < RADAR_RULES.fastRevenue) return `营收增速${fin(l.rg) ? ` ${pctTxt(l.rg)}` : "缺失"}，低于 ${RADAR_RULES.fastRevenue}%`;
  if (has(l.f, "明显放缓")) return "近一年增速较两年年化明显放缓：先查是爬坡还是破坏（21.8）";
  // 价格条件（21.7）：给价格设条件，不把 PEG 当买入按钮
  if (!fin(l.pe) || l.pe <= 0) return "PE 缺失，无法设价格条件";
  const ceiling = stressPeCeiling(eg);
  if (l.pe > ceiling) return `价格条件未满足：PE ${l.pe.toFixed(1)}× 高于压力上限 ${ceiling.toFixed(1)}×`;

  const gates: Check[] = [
    { id: "sustained", label: "增长持续", pass: true, points: 0, detail: `近一年 ${pctTxt(l.g)}、两年年化 ${pctTxt(l.c)}，有效增速 ${pctTxt(eg)}（门槛 ${RADAR_RULES.fastGrowth}%），营收 ${pctTxt(l.rg)}` },
    {
      id: "price", label: "PE 压力条件", pass: true, points: 0,
      detail: `PE ${l.pe.toFixed(1)}× ≤ (1+${Math.min(eg, RADAR_RULES.extrapolateCap)}%)³ ÷ 1.${RADAR_RULES.requiredReturn}³ × ${RADAR_RULES.stressExitPe} = ${ceiling.toFixed(1)}×：增速维持 3 年、PE 回到 ${RADAR_RULES.stressExitPe} 倍，年化仍有 ${RADAR_RULES.requiredReturn}%（未计分红）`,
    },
  ];
  const bridgeOk = l.rg >= eg * RADAR_RULES.bridgeRatio;
  const extrap = eg <= RADAR_RULES.extrapolateCap;
  const diluted = has(l.f, "隐含股本在近 5 个季度变动");
  const checks: Check[] = [
    {
      id: "bridge", label: "营收支撑利润", pass: bridgeOk, points: bridgeOk ? 1 : 0,
      detail: bridgeOk ? `营收 ${pctTxt(l.rg)} ≥ 有效增速的一半` : `营收 ${pctTxt(l.rg)} 不到有效增速 ${pctTxt(eg)} 的一半：增长主要来自利润率，先核查（21.4）`,
    },
    {
      id: "extrapolate", label: "增速可外推", pass: extrap, points: extrap ? 1 : 0,
      detail: extrap ? `有效增速 ≤${RADAR_RULES.extrapolateCap}%` : eg > RADAR_RULES.lowBase ? `有效增速 ${pctTxt(eg)} >${RADAR_RULES.lowBase}%：多来自低基数或一次性因素，待核` : `有效增速 ${pctTxt(eg)} >${RADAR_RULES.extrapolateCap}%：不可外推，价格条件按 ${RADAR_RULES.extrapolateCap}% 封顶`,
    },
    {
      id: "dilution", label: "股本稳定", pass: diluted ? false : venue === "cn" || venue === "hk" ? null : true, points: diluted ? RADAR_RULES.dilutionPenalty : 0,
      detail: diluted ? "隐含股本近 5 个季度变动 >25%：每股增长可能被稀释（21.3）" : venue === "cn" || venue === "hk" ? "A股/港股增速按归母净利润，未单独核对股本" : "增速按每股收益，未见股本大幅变动",
    },
  ];
  const overlay = overlayChecks(l);
  return {
    key, lane: "growth", item, lynch: l, venue, dcf: dcf ?? null, gates, checks, overlay, score: sum(checks) + sum(overlay),
    credRank: l.inputSource ? 0 : 1, headroom: ceiling / l.pe - 1,
    dates: { price: item.pxDate || null, pe: l.peAsOf ?? null, growth: growthDate(l), fy: item.fy },
  };
}

const VALUE_TYPES = new Set(["稳健型", "缓慢增长型"]);
const SIDE: Record<string, [SideGroup, string]> = {
  周期型: ["cyclical", "周期型：利润随供需与资本开支起落，低 PE 与 DCF 在景气顶点会误导；本书列为选读（19.2、20.8）"],
  困境反转型: ["turnaround", "困境反转型：先要现金生存期与改善节点的证据（第22章），雷达的估值数据回答不了"],
  资产型: ["asset", "资产型：资产变现价值需核查产权、负债与实现条件，本书不作核心方法（19.2–19.3）"],
};

export function buildRadar(items: PrefillItem[], auto: Map<string, AutoDcf>, lynch: Record<string, RadarLynch>): RadarResult {
  const out: RadarResult = { value: [], growth: [], excluded: [], side: [], cyclicalWatch: [] };
  for (const item of items) {
    const key = autoDcfKey(item.m, item.c);
    const lk = lynchKeyOf(item, lynch);
    if (!lk) { out.side.push({ key, item, group: "nodata", type: "未分类", reason: "没有林奇分类数据，无法先分类" }); continue; }
    const l = lynch[lk];
    const venue = lk.split(":")[0];
    const dcf = auto.get(key);
    const side = SIDE[l.t];
    if (side) {
      out.side.push({ key, item, group: side[0], type: l.t, reason: side[1] });
      if (l.t === "周期型" && l.ph === "盈利低位") out.cyclicalWatch.push({ item, lynch: l, venue });
      continue;
    }
    const lane: Lane | null = VALUE_TYPES.has(l.t) ? "value" : l.t === "快速增长型" ? "growth" : null;
    if (!lane) { out.side.push({ key, item, group: "nodata", type: l.t, reason: `${l.t}：分类所需数据不足` }); continue; }
    const row = lane === "value" ? valueRow(key, venue, item, l, dcf) : growthRow(key, venue, item, l, dcf);
    if (typeof row === "string") out.excluded.push({ key, item, group: lane, type: l.t, reason: row });
    else out[lane].push(row);
  }
  const order = (a: RadarRow, b: RadarRow) => b.score - a.score || a.credRank - b.credRank || b.headroom - a.headroom;
  out.value.sort(order);
  out.growth.sort(order);
  return out;
}

/** 信号台账的雷达列（第 2 版）：-1 不在雷达，1 价值回归，2 快速增长 */
export const RADAR_LEDGER_CODE: Record<Lane, number> = { value: 1, growth: 2 };
export function radarLedgerMap(result: RadarResult): Map<string, number> {
  const map = new Map<string, number>();
  for (const lane of ["value", "growth"] as Lane[]) for (const r of result[lane]) map.set(`${r.item.m}:${r.item.c.toUpperCase()}`, RADAR_LEDGER_CODE[lane]);
  return map;
}
