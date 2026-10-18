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
  const names: Record<string, string> = { erp_z: 'ERP五年标准分', erp: '简化股债收益率差', pe: '指数市盈率', cn10y: '中国10年国债收益率', financing_buy: '两市融资买入额', cnh: '离岸人民币汇率', hkd: '港元汇率' }
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

export function automaticRows(market: Market, snapshot: AutomaticSnapshot | null, breadth: BreadthSnapshot | null, asOf: string, newHigh = false): Partial<Record<ManualDimension, Evidence>> {
  const out: Partial<Record<ManualDimension, Evidence>> = {}
  const find = (id: string) => {
    const candidates = snapshot?.facts.filter(f => f.metricId === id && (f.market === market || (id === 'financing_buy' && market === 'csi300' && f.market === 'all')))
      .sort((a, b) => b.observationDate.localeCompare(a.observationDate))
    const latest = candidates?.[0]
    return latest && latest.kind === 'observed' && factUsable(latest, asOf) ? latest : undefined
  }
  const erp = find('erp_z'), pe = find('pe'), financing = find('financing_buy')
  if (market === 'csi300' && erp) out.valuation = { id: 'valuation', name: '估值与赔率', signal: erp.value >= 1.5 ? 'bottom' : erp.value <= -1 ? 'risk' : 'neutral', available: true, source: erp.source, date: erp.observationDate, detail: `自动 · 简化ERP z-score ${erp.value.toFixed(2)}。${erp.description}` }
  else if (pe) out.valuation = { id: 'valuation', name: '估值与赔率', signal: 'missing', available: false, source: pe.source, date: pe.observationDate, detail: `自动 · PE ${pe.value.toFixed(2)}。${pe.description} 尚无合格的长期分位，不计估值票。` }
  if (financing) out.funding = { id: 'funding', name: '资金与杠杆', signal: 'missing', available: false, source: financing.source, date: financing.observationDate, detail: `自动 · 融资买入 ${financing.value.toLocaleString()} ${financing.unit}。${financing.description} 未核定同覆盖成交额分母，不计算杠杆占比、不计票。` }
  const b = breadth?.markets[market]
  if (b && b.observationDate <= asOf) {
    const age = (Date.parse(asOf) - Date.parse(b.observationDate)) / 86400000
    const qualified = b.kind === 'observed' && b.coverage >= 0.95 && b.total > 0 && b.eligible / b.total >= 0.95 && b.breadth !== null && b.priorBreadth !== null && age <= 14
    out.breadth = { id: 'breadth', name: '指数成分宽度', available: qualified,
      signal: !qualified ? 'missing' : b.breadth! <= 10 ? 'bottom' : b.priorBreadth! >= 85 && b.breadth! < 60 && newHigh ? 'risk' : b.breadth! >= 40 && b.priorBreadth! < 40 ? 'positive' : 'neutral',
      date: b.observationDate, source: b.source,
      detail: `自动 · ${b.universeId}，名单 ${b.universeDate}；覆盖 ${(b.coverage * 100).toFixed(1)}%（${b.eligible}/${b.total}）。MA200 ${b.breadth == null ? '缺失' : `${b.breadth.toFixed(1)}%`}，4周前 ${b.priorBreadth == null ? '缺失' : `${b.priorBreadth.toFixed(1)}%`}。${b.detail}${qualified ? '' : ' 未通过当期名单 / 95%覆盖 / 新鲜度门禁，不计票。'}` }
  }
  return out
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
