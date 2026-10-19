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
  const names: Record<string, string> = { erp_z: 'ERP五年标准分', erp: '简化股债收益率差', pe: '指数市盈率', pe_history_5y_percentile: '恒指第三方日频PE五年分位', pe_official_5y_percentile: '官方月末PE五年分位', cn10y: '中国10年国债收益率', financing_buy: '两市融资买入额', financing_buy_ratio_pct: '两市融资买入占比', cn_turnover_yi: '沪深A股及上市基金成交额', hk_south_20d: '南向20日净买入', index_week_daily_turnover_hkd: '恒指完整周日均成交额', turnover_ratio_52w: '周日均成交额/52周基准', cnh: '离岸人民币汇率', hkd: '港元汇率' }
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
  return age >= 0 && age <= ({ daily: 14, weekly: 14, monthly: 75 }[f.frequency])
    && (f.availableAt === null || Date.parse(f.availableAt) < Date.parse(asOf) + 86400000)
    && Date.parse(f.firstSeenAt) < Date.parse(asOf) + 86400000
}

/** Only same-index turnover can power a HK funding vote; southbound is whole-market context.
 * A-share financing and turnover must use the same market scope and observation date. */


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
  const officialPe = find('pe_official_5y_percentile')
  const financing = find('financing_buy'), financingRatio = find('financing_buy_ratio_pct'), south = find('hk_south_20d')
  const turnover = find('turnover_ratio_52w'), weeklyAmount = find('index_week_daily_turnover_hkd')
  // ---- valuation ----
  if (market === 'csi300' && erp) {
    out.valuation = { id: 'valuation', name: '估值与赔率', signal: erp.value >= 1.5 ? 'bottom' : erp.value <= -1 ? 'risk' : 'neutral', available: true, source: erp.source, date: erp.observationDate, detail: `自动 · 简化ERP z-score ${erp.value.toFixed(2)}。${erp.description}` }
  } else if (pe && officialPe?.frequency === 'monthly' && officialPe.unit === '%' && officialPe.value >= 0 && officialPe.value <= 100 && officialPe.observationDate === pe.observationDate) {
    const signal = officialPe.value <= 10 ? 'bottom' : officialPe.value >= 90 ? 'risk' : 'neutral'
    out.valuation = { id: 'valuation', name: '估值与赔率', signal, available: true, source: officialPe.source, date: officialPe.observationDate,
      detail: `市盈率${pe.value.toFixed(2)}倍，处于近5年官方月末样本的${officialPe.value.toFixed(1)}%分位。${signal === 'bottom' ? '低于10%低估观察线。' : signal === 'risk' ? '高于90%偏贵观察线。' : '位于10%—90%的中间区间。'}`,
      methodDetail: `${officialPe.description} ${pe.description}` }
  } else if (pe) {
    const lossMonths = snapshot?.issues.some(s => s.startsWith(`${market}-official-pe:`) && s.includes('非正PE'))
    out.valuation = { id: 'valuation', name: '估值与赔率', signal: 'missing', available: false, source: pe.source, date: pe.observationDate,
      pendingReason: lossMonths ? '历史PE含亏损期' : '历史估值待补齐',
      detail: `市盈率${pe.value.toFixed(2)}倍。${lossMonths ? '五年历史包含负市盈率，不能直接按普通PE分位判断贵贱。' : '尚缺足够的同口径历史，暂不能判断当前估值位置。'}`,
      methodDetail: `${pe.description} ${lossMonths ? snapshot?.issues.filter(s => s.startsWith(`${market}-official-pe:`)).join('；') : ''}${peHistory ? `第三方日频PE分位${peHistory.value.toFixed(1)}%仅作参考；${peHistory.description}` : ''}` }
  }
  // ---- funding: every market always emits a row, with a precise reason when data is missing ----
  if (market === 'csi300') {
    const volume = turnover?.unit === '倍' && turnover.frequency === 'weekly' && turnover.value > 0 && turnover.value <= 30 ? turnover : undefined
    const qualifiedRatio = (f: AutomaticFact) => f.metricId === 'financing_buy_ratio_pct' && f.market === 'csi300' && f.kind === 'observed' && f.unit === '%' && f.frequency === 'daily' && f.value >= 0 && f.value <= 100 && factUsable(f, asOf)
    // Weekly assessment uses the financing ratio at the same completed week's close, even after newer daily data arrives.
    const pairedRatio = volume ? snapshot?.facts.find(f => qualifiedRatio(f) && f.observationDate === volume.observationDate) : undefined
    const ratio = pairedRatio ?? (financingRatio && qualifiedRatio(financingRatio) ? financingRatio : undefined)
    if (ratio && volume && ratio.observationDate === volume.observationDate) {
      const signal = ratio.value >= 10 ? 'risk' : volume.value <= 0.5 && ratio.value < 6 ? 'bottom' : volume.value >= 1.5 && ratio.value < 10 ? 'positive' : 'neutral'
      out.funding = { id: 'funding', name: '资金与杠杆', signal, available: true, source: ratio.source, date: ratio.observationDate,
        detail: `融资买入占沪深A股及上市基金成交额的${ratio.value.toFixed(2)}%；完整周日均成交额为此前52周基准的${volume.value.toFixed(2)}倍。${signal === 'risk' ? '融资占比已触及10%风险观察线。' : signal === 'bottom' ? '成交与融资均处于低位观察区。' : signal === 'positive' ? '成交放大，融资占比尚未触及风险线。' : '当前资金信号中性。'}`,
        methodDetail: `两市全市场背景指标，并非沪深300成分股专属。融资占比与成交额基准统一截至完整周最后交易日${volume.observationDate}。${ratio.description} ${volume.description}` }
    } else if (ratio) {
      out.funding = { id: 'funding', name: '资金与杠杆', signal: 'missing', available: false, source: ratio.source, date: ratio.observationDate, pendingReason: '缺少成交额基准',
        detail: `融资买入占比已核定为${ratio.value.toFixed(2)}%。${volume ? '周成交额与融资数据日期尚未对齐。' : '完整周与此前52周的成交额基准尚未齐备。'}`,
        methodDetail: `${ratio.description} ${volume?.description ?? ''}` }
    } else if (financing) {
      out.funding = { id: 'funding', name: '资金与杠杆', signal: 'missing', available: false, source: financing.source, date: financing.observationDate,
        pendingReason: '融资占比待核定', detail: `沪深两市融资买入额${financing.value.toLocaleString()}亿元。尚缺同日、同范围的成交额，暂不能计算融资占比。`, methodDetail: `需将融资买入额与同一交易日的沪深A股及上市基金成交额分母配对。${financing.description}` }
    } else {
      out.funding = { id: 'funding', name: '资金与杠杆', signal: 'missing', available: false,
        pendingReason: '融资数据待更新', detail: '尚无有效的两市融资买入数据，暂不能判断资金与杠杆状态。', methodDetail: '融资买入额及成交额须来自同一交易日，且观测距今不超过14天。' }
    }
  } else {
    const idxName = market === 'hsi' ? '恒生指数' : '恒生科技指数'
    const validTurnover = turnover?.frequency === 'weekly' && turnover.unit === '倍' && turnover.value > 0 && turnover.value <= 30 ? turnover : undefined
    const amount = market === 'hsi' && weeklyAmount?.frequency === 'weekly' && weeklyAmount.unit === '港元' && weeklyAmount.value > 0 ? weeklyAmount : undefined
    if (validTurnover && south) {
      const signal = validTurnover.value >= 1.5 ? south.value > 0 ? 'positive' : south.value < 0 ? 'risk' : 'neutral'
        : validTurnover.value <= 0.5 ? 'bottom' : 'neutral'
      out.funding = { id: 'funding', name: '资金与杠杆', signal, available: true, source: validTurnover.source, date: validTurnover.observationDate,
        detail: `完整周日均成交额为此前52周基准的${validTurnover.value.toFixed(2)}倍。南向近20个交易日合计净买入${south.value.toLocaleString()}亿元人民币，仅作全港股资金背景。`, methodDetail: `${validTurnover.description} 南向资金不代表${idxName}成分股流入；${south.description} 南向来源：${south.source}` }
    } else if (south) {
      out.funding = { id: 'funding', name: '资金与杠杆', signal: 'missing', available: false, source: amount?.source ?? south.source, date: amount?.observationDate ?? south.observationDate,
        pendingReason: '缺少成交额基准', detail: `${amount ? `恒指完整周日均成交额${(amount.value / 1e8).toFixed(2)}亿港元。` : ''}南向近20个交易日合计净买入${south.value.toLocaleString()}亿元人民币。尚缺${idxName}自身的52周成交额基准，暂不能给出完整资金判断。`, methodDetail: `${amount?.description ?? `${idxName}完整周及前52周同口径成交额尚未齐备。`} 南向为全港股背景，不能代表${idxName}成分股流入。${south.description} 南向来源：${south.source}` }
    } else {
      out.funding = { id: 'funding', name: '资金与杠杆', signal: 'missing', available: false,
        source: amount?.source, date: amount?.observationDate,
        pendingReason: validTurnover ? '南向数据待更新' : '资金数据待补齐', detail: validTurnover ? `完整周成交额为52周基准的${validTurnover.value.toFixed(2)}倍；南向数据尚未更新，暂不能给出完整资金判断。` : `${amount ? `恒指完整周日均成交额${(amount.value / 1e8).toFixed(2)}亿港元。` : ''}尚缺${idxName}的52周成交额基准及有效南向资金数据。`, methodDetail: validTurnover?.description ?? amount?.description }
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
        detail: `站上200日均线的成分股占${b.breadth!.toFixed(1)}%，4周前为${b.priorBreadth!.toFixed(1)}%。有效覆盖${b.eligible}/${b.total}只（${(b.coverage * 100).toFixed(1)}%）。`, methodDetail: `成分名单快照${b.universeDate}；${b.detail}` }
    } else {
      out.breadth = { id: 'breadth', name: '指数成分宽度', available: false, signal: 'missing', source: b.source, date: b.eligible > 0 ? b.observationDate : undefined,
        pendingReason: age > 14 ? '宽度数据待更新' : '样本覆盖不足', detail: `有效覆盖${b.eligible}/${b.total}只（${(b.coverage * 100).toFixed(1)}%）。${age > 14 ? '观测已超过14天，需要更新。' : b.coverage < 0.95 ? '未达到95%覆盖要求，暂不判断市场宽度。' : '本期与4周前的有效样本尚未对齐。'}`, methodDetail: `名单${b.kind === 'observed' ? '已核定' : '为静态代理proxy，未自动核定'}；名单快照${b.universeDate}；${b.detail}` }
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
