import { assessManual } from './engine'
import type { Evidence, ManualDimension, Market } from './engine'

export interface AutomaticFact {
  metricId: string; market: Market | 'all'; value: number; observationDate: string; availableAt: string | null
  firstSeenAt: string; fetchedAt: string; source: string; unit: string; kind: 'observed' | 'proxy' | 'backfilled'
  frequency: 'daily' | 'weekly' | 'monthly'; description: string
}
export interface AutomaticSnapshot { schemaVersion: 1; generatedAt: string; facts: AutomaticFact[]; issues: string[] }
export interface BreadthMarket {
  universeId: string; universeDate: string; source: string; kind: 'observed' | 'proxy'; observationDate: string
  coverage: number; eligible: number; total: number; breadth: number | null; priorBreadth: number | null
  exclusions: Record<string, number>; detail: string
}
export interface BreadthSnapshot { schemaVersion: 1; generatedAt: string; markets: Partial<Record<Market, BreadthMarket>>; issues: string[] }
export interface ShadowState {
  version: 'cycle-shadow-v2'; valuationZone: string; trendState: string; riskGate: string; dataQuality: string
  confirmations: number; weakWeeks: number
}
export function factLabel(id: string): string {
  const names: Record<string, string> = { erp_z: 'ERP五年标准分', erp: '简化股债收益率差', pe: '指数市盈率', pe_history_5y_percentile: '恒指同源历史PE五年分位', cn10y: '中国10年国债收益率', financing_buy: '两市融资买入额', hk_south_20d: '南向20日净买入', turnover_ratio_52w: '指数周成交额/52周', cnh: '离岸人民币汇率', hkd: '港元汇率' }
  return names[id] ?? (id.startsWith('etf_shares_') ? `ETF ${id.slice(11)} 总份额` : id)
}
const dateOK = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
const timeOK = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d\d-\d\dT/.test(s) && Number.isFinite(Date.parse(s))
const urlOK = (s: unknown) => { try { return typeof s === 'string' && ['http:', 'https:'].includes(new URL(s).protocol) } catch { return false } }
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const markets = ['csi300', 'hsi', 'hstech']
const issuesOK = (x: unknown) => Array.isArray(x) && x.length <= 1000 && x.every(v => typeof v === 'string')

/** Shared by the browser and unattended review job. Unknown schemas fail closed. */
export function parseAutomaticSnapshot(input: unknown): AutomaticSnapshot {
  if (!obj(input) || input.schemaVersion !== 1 || !timeOK(input.generatedAt) || !issuesOK(input.issues) || !Array.isArray(input.facts) || input.facts.length > 2000) throw new Error('自动事实格式无效')
  const keys = new Set<string>()
  for (const f of input.facts) {
    if (!obj(f) || typeof f.metricId !== 'string' || ![...markets, 'all'].includes(String(f.market)) || !finite(f.value) || !dateOK(f.observationDate)
      || !timeOK(f.firstSeenAt) || !timeOK(f.fetchedAt) || !urlOK(f.source) || typeof f.unit !== 'string' || typeof f.description !== 'string'
      || !['observed', 'proxy', 'backfilled'].includes(String(f.kind)) || !['daily', 'weekly', 'monthly'].includes(String(f.frequency))
      || (f.availableAt !== null && !timeOK(f.availableAt)) || f.observationDate > input.generatedAt.slice(0, 10)
      || Date.parse(f.firstSeenAt) > Date.parse(f.fetchedAt) || Date.parse(f.fetchedAt) > Date.parse(input.generatedAt)) throw new Error('自动事实字段或时点无效')
    const key = `${f.market}:${f.metricId}:${f.observationDate}`
    if (keys.has(key)) throw new Error('自动事实ID重复')
    keys.add(key)
  }
  return input as unknown as AutomaticSnapshot
}

export function parseBreadthSnapshot(input: unknown): BreadthSnapshot {
  if (!obj(input) || input.schemaVersion !== 1 || !timeOK(input.generatedAt) || !issuesOK(input.issues) || !obj(input.markets)) throw new Error('宽度快照无效')
  for (const [market, b] of Object.entries(input.markets)) {
    if (!markets.includes(market) || !obj(b) || typeof b.universeId !== 'string' || !dateOK(b.universeDate) || !dateOK(b.observationDate)
      || b.universeDate > input.generatedAt.slice(0, 10) || b.observationDate > input.generatedAt.slice(0, 10) || !urlOK(b.source)
      || !['observed', 'proxy'].includes(String(b.kind)) || typeof b.detail !== 'string' || !finite(b.coverage) || b.coverage < 0 || b.coverage > 1
      || !finite(b.eligible) || !Number.isInteger(b.eligible) || !finite(b.total) || !Number.isInteger(b.total) || b.total < 0 || b.eligible < 0 || b.eligible > b.total
      || !obj(b.exclusions) || Object.values(b.exclusions).some(n => !finite(n) || n < 0)
      || [b.breadth, b.priorBreadth].some(n => n !== null && (!finite(n) || n < 0 || n > 100))) throw new Error('宽度范围或质量字段无效')
  }
  return input as unknown as BreadthSnapshot
}

export function factUsable(f: AutomaticFact, asOf: string): boolean {
  const age = (Date.parse(asOf) - Date.parse(f.observationDate)) / 86400000
  // Month-end PE is legitimately older than daily FX. availableAt remains unknown when the publisher gives no timestamp.
  return age >= 0 && age <= ({ daily: 14, weekly: 21, monthly: 75 }[f.frequency])
    && (f.availableAt === null || Date.parse(f.availableAt) < Date.parse(asOf) + 86400000)
    && Date.parse(f.firstSeenAt) < Date.parse(asOf) + 86400000
}

/** HK funding is "whole-market background, not the index" — automatic rows are wired but never power a vote.
 *  The detail must include the verified same-unit window and a clear "background" disclaimer, so the reader sees
 *  why the row is non-voting instead of a generic "data missing". The CSI300 source/download URL is reserved
 *  for the CSI300 market; HK funding cards must not borrow it. */


export function automaticRows(market: Market, snapshot: AutomaticSnapshot | null, breadth: BreadthSnapshot | null, asOf: string, newHigh = false): Partial<Record<ManualDimension, Evidence>> {
  const out: Partial<Record<ManualDimension, Evidence>> = {}
  const today = asOf.slice(0, 10)
  // Pick the freshest observed fact for the scope. The hk_south_20d metric lives under market='all' but is the
  // only funding signal we have for HK markets — accept it as the HK funding lookup. A-share financing_buy
  // (market='all') serves CSI300 only.
  const find = (metricId: string): AutomaticFact | undefined => {
    const candidates = (snapshot?.facts ?? [])
      .filter(f => f.metricId === metricId && (
        f.market === market ||
        (metricId === 'financing_buy' && market === 'csi300' && f.market === 'all') ||
        (metricId === 'hk_south_20d' && (market === 'hsi' || market === 'hstech') && f.market === 'all')
      ))
      .sort((a, b) => b.observationDate.localeCompare(a.observationDate))
    const latest = candidates[0]
    return latest && latest.kind === 'observed' && latest.observationDate <= today && factUsable(latest, asOf) ? latest : undefined
  }
  const erp = find('erp_z'), pe = find('pe'), peHistory = market === 'hsi' ? find('pe_history_5y_percentile') : undefined
  const financing = find('financing_buy'), south = find('hk_south_20d')
  const turnover = find('turnover_ratio_52w')
  // ---- valuation ----
  if (market === 'csi300' && erp) {
    out.valuation = { id: 'valuation', name: '估值与赔率', signal: erp.value >= 1.5 ? 'bottom' : erp.value <= -1 ? 'risk' : 'neutral', available: true, source: erp.source, date: erp.observationDate, detail: `自动 · 简化ERP z-score ${erp.value.toFixed(2)}。${erp.description}` }
  } else if (pe) {
    const reference = peHistory ? `同源第三方历史PE五年分位 ${peHistory.value.toFixed(1)}%（观测 ${peHistory.observationDate}）；其PE盈利/加权公式未公开，作为参考展示，不替代该指数TTM口径，不计估值票。` : '尚无合格的长期同口径分位，不计估值票。'
    out.valuation = { id: 'valuation', name: '估值与赔率', signal: 'missing', available: false, source: pe.source, date: pe.observationDate, detail: `自动 · PE ${pe.value.toFixed(2)}。${pe.description} ${reference}` }
  }
  // ---- funding: every market always emits a row, with a precise reason when data is missing ----
  if (market === 'csi300') {
    if (financing) {
      out.funding = { id: 'funding', name: '资金与杠杆', signal: 'missing', available: false, source: financing.source, date: financing.observationDate,
        detail: `自动 · 沪深两市合计融资买入额原值 ${financing.value.toLocaleString()} ${financing.unit}(东财RPTA_RZRQ_LSHJ.RZMRE，元÷1e8)；同覆盖成交额分母未核定，不计占比、不计票。` }
    } else {
      out.funding = { id: 'funding', name: '资金与杠杆', signal: 'missing', available: false,
        detail: `自动 · 沪深两市融资买入额原值(东财RPTA_RZRQ_LSHJ.RZMRE)未采集或最新观测已过期，不假设值；需公开来源链接、≤14天观测日期才计票。` }
    }
  } else {
    const idxName = market === 'hsi' ? '恒生指数' : '恒生科技指数'
    const validTurnover = market === 'hstech' && turnover?.frequency === 'weekly' && turnover.unit === '倍' && turnover.value > 0 && turnover.value <= 30 ? turnover : undefined
    if (validTurnover && south) {
      const vote = assessManual('funding', market, { date: validTurnover.observationDate, source: validTurnover.source,
        values: { volumeRatio: validTurnover.value, south: south.value } }, asOf)
      out.funding = { ...vote, detail: `自动 · 完整周指数成交额/此前52周同口径日均 ${validTurnover.value.toFixed(2)}倍；${south.value.toLocaleString()}亿元南向净买入仅作全港股背景，不代表${idxName}成分股流入。${validTurnover.description} 南向来源：${south.source}。` }
    } else if (south) {
      const turnoverDetail = validTurnover
        ? `完整周指数成交额/此前52周同口径日均已采集 ${validTurnover.value.toFixed(2)}倍（观测 ${validTurnover.observationDate}）；南向数据无有效的近20交易日观测。`
        : `${idxName}完整周与前52周同口径成交额尚未取得有效数据。`
      out.funding = { id: 'funding', name: '资金与杠杆', signal: 'missing', available: false, source: south.source, date: south.observationDate,
        detail: `自动 · 港股通南向合计（沪+深）近20个交易日净买入 ${south.value.toLocaleString()} ${south.unit}（人民币），仅作全港股背景，不代表${idxName}成分股流入。${turnoverDetail}暂不计票。` }
    } else {
      out.funding = { id: 'funding', name: '资金与杠杆', signal: 'missing', available: false,
        detail: `自动 · 港股通南向净买入未取得有效的近20个交易日数据；${validTurnover ? `${idxName}完整周成交额/前52周日均 ${validTurnover.value.toFixed(2)}倍已采集` : `${idxName}完整周与前52周的同口径成交额也尚未补齐`}，暂不计票。` }
    }
  }
  // ---- breadth: every market always emits a row, with a precise reason when no entry exists ----
  const b = breadth?.markets?.[market]
  if (b && b.observationDate <= today) {
    const age = (Date.parse(asOf) - Date.parse(b.observationDate)) / 86400000
    const qualified = b.kind === 'observed' && b.coverage >= 0.95 && b.total > 0 && b.eligible / b.total >= 0.95 && b.breadth !== null && b.priorBreadth !== null && age <= 14
    if (qualified) {
      out.breadth = { id: 'breadth', name: '指数成分宽度', available: true,
        signal: b.breadth! <= 10 ? 'bottom' : b.priorBreadth! >= 85 && b.breadth! < 60 && newHigh ? 'risk' : b.breadth! >= 40 && b.priorBreadth! < 40 ? 'positive' : 'neutral',
        source: b.source, date: b.observationDate,
        detail: `自动 · ${b.universeId}，名单 ${b.universeDate}；覆盖 ${(b.coverage * 100).toFixed(1)}%（${b.eligible}/${b.total}）。MA200 ${b.breadth!.toFixed(1)}%，4周前 ${b.priorBreadth!.toFixed(1)}%。${b.detail}` }
    } else {
      out.breadth = { id: 'breadth', name: '指数成分宽度', available: false, signal: 'missing', source: b.source, date: b.eligible > 0 ? b.observationDate : undefined,
        detail: `自动 · ${b.universeId}已采集但不合格：名单快照 ${b.universeDate}；${b.kind !== 'observed' ? '名单为静态proxy无自动官方确认;' : ''}${b.exclusions.fetch_failed ? `行情请求失败 ${b.exclusions.fetch_failed} 只；` : ''}覆盖 ${(b.coverage * 100).toFixed(1)}%（${b.eligible}/${b.total}），MA200 ${b.breadth == null ? '缺失' : `${b.breadth.toFixed(1)}%`}，4周前 ${b.priorBreadth == null ? '缺失' : `${b.priorBreadth.toFixed(1)}%`}；未通过95%覆盖/前4周同口径/${age > 14 ? `观测日${b.observationDate}已超14天` : '14天内观测'}门禁，不计票。${b.detail}` }
    }
  } else {
    const reason = breadthIssue(market, breadth, asOf)
    out.breadth = { id: 'breadth', name: '指数成分宽度', signal: 'missing', available: false,
      detail: `自动 · ${reason}` }
  }
  return out
}

/** Compact reason a market's breadth entry did not vote. Reads the snapshot's issues verbatim (no regex
 *  truncation). Returns a per-market placeholder reason when the snapshot has no per-market issue at all. */
export function breadthIssue(market: Market, breadth: BreadthSnapshot | null, asOf = breadth?.generatedAt.slice(0, 10) ?? ''): string {
  const labels: Record<Market, string> = { csi300: '沪深300', hsi: '恒生指数', hstech: '恒生科技' }
  const label = labels[market]
  const entry = breadth?.markets?.[market]
  if (entry) {
    const ex = Object.entries(entry.exclusions || {}).map(([k, v]) => `${k} ${v}`).join('、')
    const cov = `覆盖${(entry.coverage * 100).toFixed(1)}%（${entry.eligible}/${entry.total}）`
    const age = (Date.parse(asOf) - Date.parse(entry.observationDate)) / 86400000
    if (age < 0) return `${label}观测日 ${entry.observationDate} 晚于观察日 ${asOf}；未来数据不计票。`
    if (entry.kind === 'observed' && entry.coverage >= 0.95 && entry.breadth !== null && entry.priorBreadth !== null && age <= 14) {
      return `${label}已采集且合格：${cov}，MA200 ${entry.breadth.toFixed(1)}%，4周前 ${entry.priorBreadth.toFixed(1)}%。${entry.detail}` + (ex ? `剩余：${ex}` : '')
    }
    return `${label}已采集但不合格：${entry.kind === 'proxy' ? '名单为静态proxy无自动官方确认;' : ''}${cov}，未通过95%覆盖/前4周同口径/${age > 14 ? `观测日${entry.observationDate}已超14天` : '相关门禁'}。${entry.detail}` + (ex ? `排除：${ex}` : '')
  }
  // No entry at all — refer to the issues verbatim.
  const issues = breadth?.issues ?? []
  const issue = issues.find(i => i.startsWith(label) || i.includes(label))
  if (issue) return `${label}官方全成分端点未通过验收，自动宽度未发布；采集端原始问题（原文）：${issue}`
  if (!breadth) return `${label}宽度快照缺失，自动宽度未发布。`
  return `${label}宽度快照中无该市场条目，自动宽度未发布。`
}

/** Pre-registered shadow rule: two distinct weekly confirmations to enter, immediate price-risk defense. */
export function shadowState(rows: Evidence[], previous?: ShadowState): ShadowState {
  const signal = (id: string) => rows.find(r => r.id === id && r.available)?.signal
  const valuation = signal('valuation'), trend = signal('technical')
  const valid = rows.filter(r => r.available && r.signal !== 'missing').length
  const confirmations = trend === 'positive' ? Math.min(2, (previous?.confirmations ?? 0) + 1) : 0
  const weakWeeks = trend === 'neutral' ? Math.min(2, (previous?.weakWeeks ?? 0) + 1) : 0
  const trendState = trend === 'risk' ? '防守' : !trend ? '等待趋势数据' : trend === 'positive' ? confirmations >= 2 ? '上行观察' : '修复待确认'
    : trend === 'neutral' && previous?.trendState === '上行观察' && weakWeeks < 2 ? '上行观察' : '震荡观察'
  const dataQuality = valid >= 4 && signal('valuation') && signal('breadth') ? '可作观察' : '证据不足'
  return { version: 'cycle-shadow-v2', valuationZone: valuation === 'bottom' ? '低估候选' : valuation === 'risk' ? '偏贵预警' : valuation ? '中间区域' : '等待估值数据',
    trendState, riskGate: trend === 'risk' ? '防守复核' : dataQuality === '证据不足' ? '暂停提高风险' : rows.some(r => r.available && r.signal === 'risk') ? '风险冲突复核' : '按本人预算复核',
    dataQuality, confirmations, weakWeeks }
}
