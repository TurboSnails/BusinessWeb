// DCF 预填库：为指数成分与研究公司采集多年财报原值、行情与 β，发布为静态 JSON。
// 只保存可核对的原值（基础单位：元/港元/美元、股）；默认假设由前端 autofill 用同一规则推导，
// 用户随时可改。银行/保险等金融企业与自由现金流为负的公司照样发布原值，但标注不适用。
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cnEntries, hkEntries } from '../server/valuation/data/eastmoney.mjs'
import { annualFact } from '../server/valuation/data/normalize.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const OUT_FILE = join(ROOT, 'public/data/dcf-prefill.json')
const CACHE = process.env.DCF_CACHE_DIR || join(ROOT, '.cache/dcf-prefill')
const UA = 'Mozilla/5.0 (BusinessWeb DCF research)'
// SEC 要求 UA 写明联系邮箱（拒绝 noreply 与含 github 的写法）；生产用 SEC_USER_AGENT 密钥填真实联系方式
const SEC_UA = process.env.SEC_USER_AGENT || 'BusinessWeb DCF research contact@example.org'
export const FUNDAMENTAL_TTL_DAYS = 7
/** 缓存结构版本：新增采集字段时加一，旧缓存视为过期重采 */
const CACHE_SCHEMA = 3
const YEARS = 5
const EM_BASE = 'https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/'
const HK_API = 'https://datacenter.eastmoney.com/securities/api/data/v1/get'
// β 用 Yahoo 两年周线（复权收盘）：腾讯美股历史K线只返回最近一根，且批量请求后易被限流(501)
const BENCHMARK = { cn: '510300.SS', hk: '^HSI', us: 'SPY' } // Yahoo 的沪深300指数周线只有一根，用沪深300ETF代替
export const yahooSymbol = (market, code) => market === 'us' ? code.replace('.', '-')
  : market === 'hk' ? `${String(Number(code)).padStart(4, '0')}.HK` : /^[69]/.test(code) ? `${code}.SS` : /^[03]/.test(code) ? `${code}.SZ` : null
const weeklyUrl = symbol => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1wk`

const val = x => x != null && typeof x === 'object' ? x.value : x
const num = x => { const v = Number(val(x)); return x == null || val(x) == null || !Number.isFinite(v) ? null : v }
const sumOrNull = values => values.some(v => v != null) ? values.reduce((a, v) => a + (v ?? 0), 0) : null
const day = s => String(s ?? '').slice(0, 10)
export const tencentSymbol = (market, code) => market === 'us' ? `us${code}` : market === 'hk' ? `hk${code}`
  : `${/^[69]/.test(code) ? 'sh' : /^[48]/.test(code) ? 'bj' : 'sz'}${code}`

// ---------- universe ----------
export function parseNdxCodes(source) {
  const block = source.match(/NDX_CODES[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? ''
  return [...block.matchAll(/'([A-Z][A-Z0-9.]*)'/g)].map(m => m[1])
}
export function parseCompanyLines(source) {
  const out = []
  for (const line of source.split('\n')) {
    const parts = line.trim().split('|')
    if (parts.length < 4) continue
    if (/^\d{6}$/.test(parts[0])) out.push({ market: 'cn', code: parts[0], name: parts[1] })
    else if (/^\d{5}$/.test(parts[0])) out.push({ market: 'hk', code: parts[0], name: parts[1] })
    else if (/^[A-Z][A-Z.]{0,9}$/.test(parts[0])) out.push({ market: 'us', code: parts[0], name: parts[1] })
  }
  return out
}
export async function loadUniverse() {
  const universes = JSON.parse(await readFile(join(ROOT, 'public/data/market-cycle-universes.json'), 'utf8')).universes
  const items = new Map()
  const add = (market, code, group, name = '') => {
    const key = `${market}:${code}`
    const prev = items.get(key)
    items.set(key, { market, code, name: prev?.name || name, groups: [...new Set([...(prev?.groups ?? []), group])] })
  }
  for (const code of universes.csi300?.codes ?? []) add('cn', String(code).padStart(6, '0'), '沪深300')
  for (const code of universes.hsi?.codes ?? []) add('hk', String(code).padStart(5, '0'), '恒生指数')
  for (const code of universes.hstech?.codes ?? []) add('hk', String(code).padStart(5, '0'), '恒生科技')
  for (const code of parseNdxCodes(await readFile(join(ROOT, 'src/data/ndx100.ts'), 'utf8'))) add('us', code, '纳指100')
  for (const c of parseCompanyLines(await readFile(join(ROOT, 'src/data/companies.ts'), 'utf8'))) add(c.market, c.code, '研究公司', c.name)
  return [...items.values()]
}

// ---------- shared math ----------
/** OLS slope of weekly returns, Blume-adjusted (0.67β+0.33) and clamped to [0.3, 2.5]. */
export function weeklyBeta(stock, bench, { minWeeks = 52, maxWeeks = 104 } = {}) {
  const ret = rows => { const m = new Map(); for (let i = 1; i < rows.length; i++) m.set(rows[i][0], rows[i][1] / rows[i - 1][1] - 1); return m }
  const a = ret(stock), b = ret(bench)
  const pairs = [...a].filter(([d]) => b.has(d)).slice(-maxWeeks).map(([d, r]) => [r, b.get(d)])
  if (pairs.length < minWeeks) return null
  const mx = pairs.reduce((s, p) => s + p[1], 0) / pairs.length, my = pairs.reduce((s, p) => s + p[0], 0) / pairs.length
  let cov = 0, varx = 0
  for (const [y, x] of pairs) { cov += (x - mx) * (y - my); varx += (x - mx) ** 2 }
  if (!(varx > 0)) return null
  const raw = cov / varx
  return { raw: Number(raw.toFixed(3)), adjusted: Number(Math.min(2.5, Math.max(0.3, 0.67 * raw + 0.33)).toFixed(3)), weeks: pairs.length }
}

export function parseYahooWeekly(body) {
  const r = body?.chart?.result?.[0], ts = r?.timestamp, close = r?.indicators?.adjclose?.[0]?.adjclose
  if (!Array.isArray(ts) || !Array.isArray(close)) throw new Error('Yahoo周线无效')
  return ts.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), close[i]]).filter(([, c]) => Number(c) > 0)
}
/** 月末收盘价（未复权，用于与当期财报算收益率）：[[YYYY-MM, close]] */
export function parseYahooMonthly(body) {
  const r = body?.chart?.result?.[0], ts = r?.timestamp, close = r?.indicators?.quote?.[0]?.close
  if (!Array.isArray(ts) || !Array.isArray(close)) throw new Error('Yahoo月线无效')
  return ts.map((t, i) => [new Date(t * 1000 + 864e5).toISOString().slice(0, 7), close[i]]).filter(([, c]) => Number(c) > 0).map(([m, c]) => [m, Number(Number(c).toPrecision(6))])
}

/**
 * 近5年自由现金流收益率的位置：每个月用当时已公布（财年结束后4个月）的最近一年 FCF ÷（月末价 × 当前股本）。
 * 当前股本近似历史股本，回购多的公司历史收益率略被低估。分位 = 历史月份中收益率低于当前的比例（越高越便宜）。
 */
export function fcfYieldHistory(years, monthly, shares, fx, price) {
  if (!Array.isArray(monthly) || !(shares > 0) || !(price > 0)) return null
  const fcf = years.filter(y => y.ocf != null && y.capex != null).map(y => ({ avail: new Date(Date.parse(y.fy) + 122 * 864e5).toISOString().slice(0, 7), v: (y.ocf - y.capex - (y.sbc ?? 0)) * fx }))
  if (!fcf.length) return null
  const hist = monthly.map(([m, close]) => { const f = fcf.find(x => x.avail <= m); return f ? f.v / (close * shares) : null }).filter(v => v != null)
  if (hist.length < 24) return null
  const now = fcf[0].v / (price * shares)
  const sorted = [...hist].sort((a, b) => a - b)
  const below = hist.filter(v => v < now).length, equal = hist.filter(v => v === now).length
  const r4 = v => Number((v * 100).toFixed(2))
  return { now: r4(now), pct: Math.round((below + equal / 2) / hist.length * 100), med: r4(sorted[Math.floor(sorted.length / 2)]), lo: r4(sorted[0]), hi: r4(sorted[sorted.length - 1]), n: hist.length }
}

export function parseWeekly(body, symbol) {
  const d = body?.data?.[symbol]
  const rows = d?.qfqweek ?? d?.week
  if (body?.code !== 0 || !Array.isArray(rows)) throw new Error(`${symbol}周线无效`)
  return rows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r?.[0]) && Number(r[2]) > 0).map(r => [r[0], Number(r[2])])
}

/** Tencent qt batch: name, last price and quote date per symbol. */
export function parseQuotes(text) {
  const out = new Map()
  for (const m of text.matchAll(/v_([a-zA-Z]+[\w.]+)="([^"]*)"/g)) {
    const v = m[2].split('~')
    const price = Number(v[3])
    if (!(price > 0)) continue
    const raw = v[30] ?? ''
    const date = raw.replace(/\//g, '-').match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? (/^(\d{4})(\d{2})(\d{2})/.exec(raw)?.slice(1).join('-') ?? null)
    out.set(m[1], { name: v[1], price, date })
  }
  return out
}

// ---------- A 股 ----------
export async function collectCn(code, http) {
  const secu = (/^[69]/.test(code) ? 'SH' : /^[48]/.test(code) ? 'BJ' : 'SZ') + code
  const html = await http.text(`${EM_BASE}Index?type=web&code=${secu}`)
  let industry = null
  try { industry = String((await http.json(`https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${secu}`)).jbzl?.[0]?.EM2016 ?? '').split('-')[0] || null } catch { /* optional */ }
  const type = html.match(/id=["']hidctype["'][^>]*value=["'](\d+)["']/)?.[1]
  if (!type) throw new Error('公司类型字段缺失')
  const url = (path, extra = {}) => { const u = new URL(EM_BASE + path); for (const [k, v] of Object.entries({ ...extra, companyType: type, reportDateType: '1', code: secu })) u.searchParams.set(k, v); return u.toString() }
  const dates = ((await http.json(url('lrbDateAjaxNew'))).data ?? []).map(d => day(d.REPORT_DATE)).filter(d => d.endsWith('12-31')).slice(0, YEARS)
  if (!dates.length) throw new Error('未取得年报日期')
  const [lrb, zcfzb, xjllb] = await Promise.all(['lrb', 'zcfzb', 'xjllb'].map(p => http.json(url(`${p}AjaxNew`, { dates: dates.join(','), reportType: '1' }))))
  const pick = (res, d) => (res.data ?? []).find(x => day(x.REPORT_DATE) === d) ?? {}
  const orgType = pick(zcfzb, dates[0]).ORG_TYPE || pick(lrb, dates[0]).ORG_TYPE || ''
  const general = !orgType || orgType === '通用'
  const years = dates.map(d => {
    const e = cnEntries(pick(lrb, d), pick(zcfzb, d), pick(xjllb, d), general)
    return { fy: d, revenue: num(e.revenue), ocf: num(e.operatingCashflow), capex: num(e.capex), da: num(e.da), sbc: null }
  })
  const e = cnEntries(pick(lrb, dates[0]), pick(zcfzb, dates[0]), pick(xjllb, dates[0]), general)
  const z = pick(zcfzb, dates[0])
  const borrowings = ['SHORT_LOAN', 'LONG_LOAN', 'BOND_PAYABLE', 'NONCURRENT_LIAB_1YEAR', 'LEASE_LIAB'].map(k => num(z[k]))
  const notes = []
  const debt = num(e.debt) ?? (general ? sumOrNull(borrowings) ?? 0 : null)
  if (general && num(e.debt) == null) notes.push(debt ? '未见借款/债券科目，有息负债仅含租赁与一年内到期负债' : '报表未列示借款、债券科目，有息负债按0')
  return {
    currency: 'CNY', financial: !general, orgType, industry, years, notes,
    latest: {
      fy: dates[0], cash: num(e.cash), investments: num(e.nonOperating), debt, shares: num(e.shares), minority: num(e.minority),
      interest: num(e.interestExpense), pretax: num(e.pretaxProfit), tax: num(e.incomeTax),
      ebitda: num(e.ebit) != null && num(e.da) != null ? num(e.ebit) + num(e.da) : null, netIncome: num(e.netIncome),
    },
    source: `${EM_BASE}Index?type=web&code=${secu}`,
  }
}

// ---------- 港股 ----------
const hkUrl = (report, code, filter, extra = {}) => {
  const u = new URL(HK_API)
  for (const [k, v] of Object.entries({ reportName: report, columns: 'ALL', filter: `(SECUCODE="${code}.HK")${filter}`, pageSize: '200', sortColumns: 'REPORT_DATE', sortTypes: '-1', source: 'F10', client: 'PC', ...extra })) u.searchParams.set(k, v)
  return u.toString()
}
const byCode = rows => new Map((rows ?? []).map(r => [r.STD_ITEM_CODE, Number(r.AMOUNT)]))
const HK_CCY = { 人民币: 'CNY', 港元: 'HKD', 港币: 'HKD', 美元: 'USD', 欧元: 'EUR' }
export async function collectHk(code, http) {
  const main = (await http.json(hkUrl('RPT_HKF10_FN_MAININDICATOR', code, '(DATE_TYPE_CODE="001")', { pageSize: String(YEARS + 1) }))).result?.data ?? []
  const row = main[0]
  if (!row) throw new Error('未取得港股年度指标')
  const date = day(row.REPORT_DATE)
  const [summary, bal, inc, cf] = await Promise.all([
    http.json(hkUrl('RPT_CUSTOM_HKSK_APPFN_CASHFLOW_SUMMARY', code, '', { columns: 'SECUCODE,REPORT_DATE,CURRENCY,ACCOUNT_STANDARD,REPORT_TYPE', pageSize: '10' })),
    http.json(hkUrl('RPT_HKF10_FN_BALANCE_PC', code, `(REPORT_DATE='${date}')`)),
    http.json(hkUrl('RPT_HKF10_FN_INCOME_PC', code, `(REPORT_DATE='${date}')`)),
    http.json(hkUrl('RPT_HKF10_FN_CASHFLOW_PC', code, '(STD_ITEM_CODE in ("003999","005005","005007","001009"))(DATE_TYPE_CODE="001")', { columns: 'REPORT_DATE,STD_ITEM_CODE,AMOUNT' })),
  ])
  let industry = null
  try {
    const type = (await http.json(hkUrl('RPT_HKF10_INFO_ORGPROFILE', code, '', { columns: 'SECUCODE,INDUSTRY_TYPE,BELONG_INDUSTRY', pageSize: '1', sortColumns: 'SECUCODE' }))).result?.data?.[0]
    industry = String(type?.INDUSTRY_TYPE ?? '').split('-')[1] || type?.BELONG_INDUSTRY || null
  } catch { /* optional */ }
  const report = summary.result?.data?.[0]?.REPORT_LIST?.find(r => day(r.REPORT_DATE) === date)
  const currency = HK_CCY[report?.CURRENCY] ?? report?.CURRENCY
  if (!/^[A-Z]{3}$/.test(currency ?? '')) throw new Error('无法核实港股财报币种')
  const cfRows = cf.result?.data ?? []
  const cfAt = (d, c) => { const r = cfRows.find(x => day(x.REPORT_DATE) === d && x.STD_ITEM_CODE === c); return r ? Number(r.AMOUNT) : null }
  const years = main.slice(0, YEARS).map(r => {
    const d = day(r.REPORT_DATE), ppe = cfAt(d, '005005'), intangible = cfAt(d, '005007')
    return { fy: d, revenue: num(r.OPERATE_INCOME), ocf: num(r.NETCASH_OPERATE) ?? cfAt(d, '003999'), capex: ppe == null ? null : ppe + (intangible ?? 0), da: cfAt(d, '001009'), sbc: null }
  })
  const latestCf = new Map(['003999', '005005', '005007', '001009'].map(c => [c, cfAt(date, c)]).filter(([, v]) => v != null))
  const e = hkEntries(byCode(bal.result?.data), byCode(inc.result?.data), latestCf, row)
  const orgType = row.ORG_TYPE || ''
  const notes = []
  const debt = num(e.debt) ?? 0
  if (num(e.debt) == null) notes.push('报表未列示银行贷款或应付票据，有息负债按0')
  notes.push('港股标准化现金流量表未单列股权激励，自由现金流未扣除；科技公司可能因此偏高')
  return {
    currency, financial: !!orgType && orgType !== '一般企业', orgType, industry, years, notes,
    latest: {
      fy: date, cash: sumOrNull([num(e.cash), num(e.shortTermDeposits)]), investments: num(e.nonOperating) != null ? num(e.nonOperating) - (num(e.shortTermDeposits) ?? 0) : null,
      debt, shares: num(e.shares), minority: num(e.minority), interest: num(e.interestExpense), pretax: num(e.pretaxProfit), tax: num(e.incomeTax),
      ebitda: num(e.ebit) != null && num(e.da) != null ? num(e.ebit) + num(e.da) : null, netIncome: num(e.netIncome),
    },
    source: `https://emweb.securities.eastmoney.com/PC_HKF10/FinancialAnalysis/index?type=web&code=${code}`,
  }
}

// ---------- 美股（SEC companyfacts） ----------
const SEC = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  ocf: ['NetCashProvidedByUsedInOperatingActivities'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  da: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet'],
  sbc: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'],
}
/** Fiscal-year values from annual reports only: 10-Q filings also carry 12-month periods ending at quarter ends. */
function secAnnual(fact, asOf, currency) {
  const out = new Map()
  const rows = (fact?.units?.[currency] ?? []).filter(r => r.fp === 'FY' && /^(10-K|20-F|40-F)/.test(r.form ?? '') && r.filed <= asOf && Number.isFinite(r.val)
    && r.start && (Date.parse(r.end) - Date.parse(r.start)) / 864e5 >= 330 && (Date.parse(r.end) - Date.parse(r.start)) / 864e5 <= 380)
  for (const r of rows.sort((a, b) => a.filed.localeCompare(b.filed))) out.set(r.end, r.val)
  return out
}
/** Fiscal year end -> value, merged across tags (companies switch tags over time), in one reporting currency. */
function secSeries(gaap, tags, asOf, currency) {
  const out = new Map()
  for (const tag of tags) for (const [end, v] of secAnnual(gaap[tag], asOf, currency)) if (!out.has(end)) out.set(end, v)
  return out
}
function reportingCurrency(gaap, asOf) {
  for (const tags of [SEC.revenue, SEC.ocf]) for (const tag of tags) for (const unit of Object.keys(gaap[tag]?.units ?? {})) if (/^[A-Z]{3}$/.test(unit) && secAnnual(gaap[tag], asOf, unit).size) return unit
  return null
}
const secLatest = (gaap, tags, asOf, instant = false) => {
  for (const tag of tags) { const f = annualFact(gaap[tag], asOf, { instant }); if (f) return f }
  return null
}
export function secShares(dei) {
  const rows = Object.values(dei?.EntityCommonStockSharesOutstanding?.units ?? {}).flat().filter(r => Number.isFinite(r.val))
  if (!rows.length) return null
  const filed = rows.map(r => r.filed).sort().at(-1)
  const latest = rows.filter(r => r.filed === filed)
  const end = latest.map(r => r.end).sort().at(-1)
  return { value: latest.filter(r => r.end === end).reduce((s, r) => s + r.val, 0), date: end, classes: latest.filter(r => r.end === end).length }
}
export function collectUsFacts(raw, asOf) {
  const gaap = raw.facts?.['us-gaap']
  if (!gaap) throw new Error('无 US-GAAP 财报（可能为 IFRS 外国发行人）')
  const currency = reportingCurrency(gaap, asOf)
  if (!currency) throw new Error('SEC 无年度营收或经营现金流')
  const series = Object.fromEntries(Object.entries(SEC).map(([k, tags]) => [k, secSeries(gaap, tags, asOf, currency)]))
  const ends = [...series.revenue.keys(), ...series.ocf.keys()].filter((d, i, a) => a.indexOf(d) === i).sort().reverse().slice(0, YEARS)
  if (!ends.length) throw new Error('SEC 无年度营收或经营现金流')
  const years = ends.map(d => ({ fy: d, revenue: series.revenue.get(d) ?? null, ocf: series.ocf.get(d) ?? null, capex: series.capex.get(d) ?? null, da: series.da.get(d) ?? null, sbc: series.sbc.get(d) ?? null }))
  const L = (tags, instant = true) => {
    if (!instant) { for (const tag of tags) { const v = secAnnual(gaap[tag], asOf, currency).get(ends[0]); if (v != null) return v } return null }
    const f = secLatest(gaap, tags, asOf, true); return f?.currency === currency && (Date.parse(ends[0]) - Date.parse(f.periodEnd)) / 864e5 <= 120 ? f.value : null
  }
  const notes = []
  const longTerm = L(['LongTermDebt']) ?? sumOrNull([L(['LongTermDebtNoncurrent']), L(['LongTermDebtCurrent'])])
  const debt = sumOrNull([longTerm, L(['CommercialPaper']), L(['ShortTermBorrowings'])]) ?? 0
  notes.push('有息负债 = 长期债务（含一年内到期）+ 商业票据 + 短期借款；不含经营租赁，XBRL 标签由公司自选，可能有遗漏')
  const marketable = sumOrNull([L(['MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent', 'ShortTermInvestments']), L(['MarketableSecuritiesNoncurrent', 'AvailableForSaleSecuritiesDebtSecuritiesNoncurrent'])])
  let shares = secShares(raw.facts?.dei)
  if (shares?.classes > 1) notes.push(`股本为 ${shares.classes} 类普通股合计`)
  if (!shares) {
    const diluted = secLatest(gaap, ['WeightedAverageNumberOfDilutedSharesOutstanding'], asOf, false)
    if (diluted) { shares = { value: diluted.value, date: diluted.periodEnd, classes: 1 }; notes.push('封面未披露流通股数，按最近财年加权平均稀释股数') }
  }
  const ebit = L(['OperatingIncomeLoss'], false), da = L(['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet'], false)
  return {
    currency, financial: false, orgType: '', years, notes,
    latest: {
      fy: ends[0], minority: L(['MinorityInterest']), cash: L(['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']), investments: marketable, debt,
      shares: shares?.value ?? null, interest: L(['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt'], false),
      pretax: L(['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'], false),
      tax: L(['IncomeTaxExpenseBenefit'], false), ebitda: ebit != null && da != null ? ebit + da : null, netIncome: L(['NetIncomeLoss'], false),
    },
  }
}
// SEC SIC 过细（苹果单独一类），按三位数归并为常见行业，未列出的用英文描述
const SIC3 = { 737: '软件与互联网服务', 367: '半导体与电子元件', 357: '计算机与外设', 366: '通信设备', 283: '医药与生物科技', 384: '医疗器械', 382: '仪器仪表', 481: '电信服务', 483: '广播电视', 484: '有线与付费电视', 491: '电力', 492: '燃气', 493: '公用事业', 591: '药店', 596: '电商与零售', 531: '百货零售', 533: '综合零售', 541: '食品零售', 581: '餐饮', 701: '酒店', 451: '航空', 401: '铁路', 421: '货运物流', 731: '广告与营销', 781: '影视娱乐', 794: '娱乐服务', 801: '医疗服务', 806: '医院', 873: '研发与检测服务', 874: '咨询与外包服务', 371: '汽车', 372: '航空航天', 353: '工程机械', 356: '通用机械', 358: '暖通与制冷设备', 208: '饮料', 209: '食品', 284: '日化', 291: '能源', 131: '油气开采', 138: '油气服务', 671: '控股公司', 679: '投资控股', 602: '银行', 621: '证券', 631: '保险', 651: '房地产' }
export const sicIndustry = (sic, description) => { const n = Math.floor(Number(sic) / 10); return SIC3[n] ?? (description || null) }
let tickerMap
export async function collectUs(code, http, asOf) {
  tickerMap ??= http.json('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': SEC_UA } })
  const cik = Object.values(await tickerMap).find(t => t.ticker === code.replace('.', '-'))?.cik_str
  if (!cik) throw new Error('未找到 SEC CIK')
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`
  const facts = collectUsFacts(await http.json(url, { headers: { 'User-Agent': SEC_UA } }), asOf)
  let industry = null
  try { const sub = await http.json(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`, { headers: { 'User-Agent': SEC_UA } }); industry = sicIndustry(sub.sic, sub.sicDescription) } catch { /* optional */ }
  return { ...facts, industry, source: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K` }
}

// ---------- run ----------
function makeHttp(fetchImpl, concurrency = 3) {
  let active = 0
  const queue = []
  const slot = () => new Promise(resolve => { const go = () => { active++; resolve() }; active < concurrency ? go() : queue.push(go) })
  const release = () => { active--; queue.shift()?.() }
  const get = async (url, opts = {}) => {
    try { return await once(url, opts) } catch (e) {
      if (/HTTP (4\d\d)/.test(e.message) && !/HTTP 429/.test(e.message)) throw e
      await new Promise(r => setTimeout(r, 1500))
      return once(url, opts)
    }
  }
  const once = async (url, { headers = {}, as = 'json' } = {}) => {
    await slot()
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (as === 'gbk') return new TextDecoder('gbk').decode(await res.arrayBuffer())
      return as === 'text' ? res.text() : res.json()
    } finally { release() }
  }
  return { json: (u, o) => get(u, o), text: (u, o) => get(u, { ...o, as: 'text' }), gbk: (u, o) => get(u, { ...o, as: 'gbk' }) }
}
async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback } }
async function writeJson(path, data) { await writeFile(`${path}.tmp`, JSON.stringify(data)); await rename(`${path}.tmp`, path) }

async function fxRates(http, currencies, issues) {
  const rates = {}
  for (const [from, to] of currencies) {
    if (from === to || rates[`${from}${to}`]) continue
    try {
      const body = await http.json(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`)
      const rate = body?.rates?.[to]
      if (Number.isFinite(rate)) rates[`${from}${to}`] = { rate, date: body.date }
    } catch (e) { issues.push(`汇率 ${from}/${to} 获取失败：${e.message}`) }
  }
  return rates
}
async function riskFree() {
  const auto = await readJson(join(ROOT, 'public/data/market-cycle-auto.json'), { facts: [] })
  const cn = auto.facts.filter(f => f.metricId === 'cn10y').sort((a, b) => a.observationDate.localeCompare(b.observationDate)).at(-1)
  const us = (await readJson(join(ROOT, 'public/data/macro-us.json'), { series: {} })).series?.tenYear?.latest
  return {
    cn: cn ? { value: cn.value, date: cn.observationDate, label: '中国10年期国债' } : { value: 1.9, date: null, label: '中国10年期国债（默认值）' },
    us: us ? { value: us.value, date: us.date, label: '美国10年期国债' } : { value: 4.2, date: null, label: '美国10年期国债（默认值）' },
  }
}

export async function run({ fetchImpl = fetch, now = new Date(), timeLimitMs = Number(process.env.DCF_TIME_LIMIT_MS) || 20 * 60e3, budget = Number(process.env.DCF_BUDGET) || Infinity, log = console.log } = {}) {
  const started = Date.now(), asOf = now.toISOString().slice(0, 10)
  const http = makeHttp(fetchImpl)
  await mkdir(CACHE, { recursive: true })
  const universe = await loadUniverse()
  const issues = []
  // 1) quotes for everyone, batched
  const quotes = new Map()
  const symbols = universe.map(u => tencentSymbol(u.market, u.code))
  for (let i = 0; i < symbols.length; i += 60) {
    try { for (const [k, v] of parseQuotes(await http.gbk(`https://qt.gtimg.cn/q=${symbols.slice(i, i + 60).join(',')}`))) quotes.set(k, v) }
    catch (e) { issues.push(`行情批次${i / 60 + 1}失败：${e.message}`) }
  }
  // 2) benchmarks for beta
  const bench = {}
  for (const [m, s] of Object.entries(BENCHMARK)) {
    try { bench[m] = parseYahooWeekly(await http.json(weeklyUrl(s))) } catch (e) { issues.push(`${s}基准周线失败：${e.message}`) }
  }
  // 3) fundamentals, stale-first, bounded by time and budget
  const cachePath = u => join(CACHE, `${u.market}-${u.code}.json`)
  const cached = new Map(await Promise.all(universe.map(async u => [`${u.market}:${u.code}`, await readJson(cachePath(u), null)])))
  const age = u => { const c = cached.get(`${u.market}:${u.code}`); return c?.fetchedAt && c.schema === CACHE_SCHEMA ? (now - Date.parse(c.fetchedAt)) / 864e5 : Infinity }
  const due = universe.filter(u => age(u) >= FUNDAMENTAL_TTL_DAYS).sort((a, b) => age(b) - age(a)).slice(0, budget)
  let next = 0, refreshed = 0, failed = 0
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < due.length && Date.now() - started < timeLimitMs) {
      const u = due[next++]
      try {
        const facts = u.market === 'cn' ? await collectCn(u.code, http) : u.market === 'hk' ? await collectHk(u.code, http) : await collectUs(u.code, http, asOf)
        const sym = yahooSymbol(u.market, u.code)
        let beta = null
        try { if (bench[u.market] && sym) beta = weeklyBeta(parseYahooWeekly(await http.json(weeklyUrl(sym))), bench[u.market]) } catch { /* beta optional */ }
        let monthly = null
        try { if (sym) monthly = parseYahooMonthly(await http.json(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1mo`)) } catch { /* optional */ }
        const entry = { ...facts, beta, monthly, schema: CACHE_SCHEMA, fetchedAt: now.toISOString() }
        await writeJson(cachePath(u), entry)
        cached.set(`${u.market}:${u.code}`, entry)
        refreshed++
      } catch (e) {
        failed++
        const prev = cached.get(`${u.market}:${u.code}`)
        cached.set(`${u.market}:${u.code}`, { ...(prev ?? {}), error: e.message, errorAt: now.toISOString() })
        if (!prev?.years) await writeJson(cachePath(u), { error: e.message, fetchedAt: now.toISOString() })
      }
    }
  }))
  if (next < due.length) issues.push(`时限内未刷新 ${due.length - next} 家，下次继续`)
  // 4) FX for statements reported in a currency other than the quote currency
  const quoteCcy = { cn: 'CNY', hk: 'HKD', us: 'USD' }
  const pairs = universe.map(u => [cached.get(`${u.market}:${u.code}`)?.currency, quoteCcy[u.market]]).filter(([a, b]) => a && a !== b)
  const fx = await fxRates(http, [...new Map(pairs.map(p => [p.join(''), p])).values()], issues)
  // 5) publish; a company not yet in this machine's cache keeps its last published entry (with today's price)
  const previous = new Map(((await readJson(OUT_FILE, null))?.items ?? []).map(i => [`${i.m}:${i.c}`, i]))
  const items = []
  let carried = 0
  for (const u of universe) {
    const c = cached.get(`${u.market}:${u.code}`), q = quotes.get(tencentSymbol(u.market, u.code))
    const old = previous.get(`${u.market}:${u.code}`)
    const conv = c?.years && c.currency !== quoteCcy[u.market] ? fx[`${c.currency}${quoteCcy[u.market]}`] : null
    const usable = c?.years && q && (c.currency === quoteCcy[u.market] || conv)
    if (!usable) {
      if (old) { items.push(q ? { ...old, px: q.price, pxDate: q.date } : old); carried++ }
      continue
    }
    const k = conv?.rate ?? 1, scale = v => v == null ? null : Math.round(v * k)
    items.push({
      m: u.market, c: u.code, n: (q.name || u.name).normalize('NFKC').replace(/\s+/g, ''), g: u.groups, px: q.price, pxDate: q.date, ccy: quoteCcy[u.market],
      fy: c.latest.fy, fin: c.financial || undefined, org: c.orgType || undefined,
      years: c.years.map(y => [y.fy.slice(0, 4), scale(y.revenue), scale(y.ocf), scale(y.capex), scale(y.da ?? null), scale(y.sbc ?? null)]),
      cash: scale(c.latest.cash), inv: scale(c.latest.investments), debt: scale(c.latest.debt), mi: scale(c.latest.minority ?? null), shares: c.latest.shares,
      interest: scale(c.latest.interest), pretax: scale(c.latest.pretax), tax: scale(c.latest.tax), ebitda: scale(c.latest.ebitda), ni: scale(c.latest.netIncome),
      beta: c.beta?.adjusted ?? null, betaRaw: c.beta?.raw ?? null, betaWeeks: c.beta?.weeks ?? null,
      fx: conv ? { from: c.currency, rate: conv.rate, date: conv.date } : undefined,
      ind: c.industry || undefined, fyh: fcfYieldHistory(c.years, c.monthly, c.latest.shares, k, q.price) || undefined,
      notes: c.notes?.length ? c.notes : undefined, src: c.source, at: c.fetchedAt.slice(0, 10),
    })
  }
  const out = { schemaVersion: 1, generatedAt: now.toISOString(), riskFree: await riskFree(), universe: universe.length, issues, items }
  await writeJson(OUT_FILE, out)
  log(`DCF预填：${items.length}/${universe.length} 家可用（沿用上次 ${carried}）；本次刷新 ${refreshed}、失败 ${failed}、待续 ${Math.max(0, due.length - next)}；用时 ${Math.round((Date.now() - started) / 1000)}s`)
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run().catch(e => { console.error(e); process.exitCode = 1 })
