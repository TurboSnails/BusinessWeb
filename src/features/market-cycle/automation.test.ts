import { describe, expect, it } from 'vitest'
import { automaticRows, breadthIssue, parseAutomaticSnapshot, shadowState } from './automation'
import type { AutomaticFact, BreadthSnapshot } from './automation'
import type { Evidence } from './engine'

const now = '2026-10-17T10:00:00Z'
const fact = (patch: Partial<AutomaticFact> = {}): AutomaticFact => ({ metricId: 'erp_z', market: 'csi300', value: 2,
  observationDate: '2026-10-16', availableAt: null, firstSeenAt: now, fetchedAt: now,
  source: 'https://www.csindex.com.cn/', unit: 'z-score', kind: 'observed', frequency: 'daily', description: '5年同日ERP', ...patch })
const row = (id: string, signal: Evidence['signal']): Evidence => ({ id, signal, available: signal !== 'missing', name: id, detail: '' })

describe('自动证据与影子规则', () => {
  it('官方五年月末分位与同日PE配对后形成估值票，第三方日频参考不覆盖它', () => {
    const pe = fact({ market: 'hsi', metricId: 'pe', value: 13.79, unit: '倍', frequency: 'monthly', observationDate: '2026-09-30' })
    const percentile = fact({ market: 'hsi', metricId: 'pe_official_5y_percentile', value: 84.166667, unit: '%', frequency: 'monthly', observationDate: '2026-09-30', description: '官方月报60/61个月，2025-01缺失未插值' })
    const snap = { schemaVersion: 1 as const, generatedAt: now, facts: [pe, percentile, fact({ market: 'hsi', metricId: 'pe_history_5y_percentile', value: 78.1 })], issues: [] }
    const r = automaticRows('hsi', snap, null, '2026-10-17').valuation
    expect(r?.available).toBe(true)
    expect(r?.signal).toBe('neutral')
    expect(r?.detail).toContain('84.2%')
    expect(r?.detail).toContain('13.79')
    expect(r?.detail).not.toContain('78.1')
    expect(r?.methodDetail).toContain('60/61')
    for (const patch of [{ unit: '倍' }, { value: 101 }, { observationDate: '2026-08-31' }, { kind: 'proxy' as const }, { frequency: 'daily' as const }]) {
      expect(automaticRows('hsi', { ...snap, facts: [pe, { ...percentile, ...patch }] }, null, '2026-10-17').valuation?.available).toBe(false)
    }
  })
  it('卡片摘要保留结论和数值，接口字段与计算过程放在可展开口径里', () => {
    const r = automaticRows('csi300', { schemaVersion: 1, generatedAt: now, facts: [fact({ metricId: 'financing_buy', value: 1218.57, unit: '亿元', market: 'all' })], issues: [] }, null, '2026-10-17').funding
    expect(r?.detail).toContain('1,218.57')
    expect(r?.detail).not.toMatch(/RPTA_|RZMRE|元÷|不计占比/)
    expect(r?.pendingReason).toBe('融资占比待核定')
    expect(r?.methodDetail).toContain('分母')
  })
  it('宽度缺失原因按观察时点判断，不把未来观测称为合格', () => {
    const b: BreadthSnapshot = { schemaVersion: 1, generatedAt: now, issues: [], markets: { hsi: {
      universeId: 'hsi', universeDate: '2026-10-16', source: 'https://www.hsi.com.hk/', kind: 'observed',
      observationDate: '2026-10-20', coverage: 1, eligible: 95, total: 95, breadth: 30, priorBreadth: 40, exclusions: {}, detail: '',
    } } }
    expect(breadthIssue('hsi', b, '2026-10-17')).toContain('未来')
  })
  it('验证公开契约，拒绝重复、未来、非法日期与非有限事实', () => {
    const body = (facts: AutomaticFact[]) => ({ schemaVersion: 1, generatedAt: now, facts, issues: [] })
    expect(parseAutomaticSnapshot(body([fact()])).facts).toHaveLength(1)
    for (const facts of [[fact(), fact()], [fact({ value: Infinity })], [fact({ observationDate: '2026-02-30' })], [fact({ observationDate: '2026-10-18' })], [fact({ fetchedAt: 'tomorrow' })]]) expect(() => parseAutomaticSnapshot(body(facts))).toThrow()
  })
  it('日频过期或未来可得数据不计票；月PE保持可见但不伪造长期分位', () => {
    const snap = { schemaVersion: 1 as const, generatedAt: now, facts: [fact()], issues: [] }
    expect(automaticRows('csi300', snap, null, '2026-10-17').valuation?.signal).toBe('bottom')
    expect(automaticRows('csi300', { ...snap, facts: [fact({ observationDate: '2026-09-01' })] }, null, '2026-10-17').valuation).toBeUndefined()
    expect(automaticRows('csi300', { ...snap, facts: [fact({ availableAt: '2026-10-18T00:00:00Z' })] }, null, '2026-10-17').valuation).toBeUndefined()
    expect(automaticRows('hsi', { ...snap, facts: [fact({ market: 'hsi', metricId: 'pe', value: 11, frequency: 'monthly', observationDate: '2026-09-30' })] }, null, '2026-10-17').valuation?.available).toBe(false)
  })
  it('代理估值不能当精确ERP票；融资原值不能冒充比例', () => {
    const snap = { schemaVersion: 1 as const, generatedAt: now, facts: [fact({ kind: 'proxy' }), fact({ metricId: 'financing_buy', value: 1234 })], issues: [] }
    expect(automaticRows('csi300', snap, null, '2026-10-17').valuation).toBeUndefined()
    expect(automaticRows('csi300', snap, null, '2026-10-17').funding?.available).toBe(false)
  })
  it('低估与技术防守并存，缺数不会转换为可加仓状态', () => {
    const state = shadowState([row('valuation', 'bottom'), row('technical', 'risk')])
    expect(state.valuationZone).toBe('低估候选')
    expect(state.trendState).toBe('防守')
    expect(state.riskGate).toBe('防守复核')
    expect(state.dataQuality).toBe('证据不足')
  })
  it('趋势修复需连续两份不同周记录；相同周重跑由归档层替换，不增加确认', () => {
    const rows = [row('technical', 'positive'), row('valuation', 'neutral'), row('funding', 'neutral'), row('breadth', 'neutral')]
    const first = shadowState(rows)
    expect(first.trendState).toBe('修复待确认')
    expect(shadowState(rows, first).trendState).toBe('上行观察')
    expect(shadowState([row('technical', 'risk')], first).trendState).toBe('防守')
  })
})

describe('资金行精确状态（每市场必填，不伪造日期/来源）', () => {
  const mkSnap = (facts: AutomaticFact[]) => ({ schemaVersion: 1 as const, generatedAt: now, facts, issues: [] })
  it('两市融资占比与完整周同日配对后形成资金票，不借用指数成交额或最新未完成日', () => {
    const ratio = fact({ metricId: 'financing_buy_ratio_pct', value: 5.636785, unit: '%', description: '融资1218.57375394亿元/沪深A股及基金21618.24亿元' })
    const volume = fact({ metricId: 'turnover_ratio_52w', value: 0.741161, unit: '倍', frequency: 'weekly', description: '241+5个真实交易日' })
    const r = automaticRows('csi300', mkSnap([ratio, volume]), null, '2026-10-17').funding
    expect(r?.available).toBe(true)
    expect(r?.signal).toBe('neutral')
    expect(r?.detail).toContain('5.64%')
    expect(r?.detail).toContain('0.74倍')
    expect(r?.methodDetail).toContain('21618.24')
    const nextDay = fact({ ...ratio, value: 12, observationDate: '2026-10-19', firstSeenAt: '2026-10-19T10:00:00Z', fetchedAt: '2026-10-19T10:00:00Z' })
    expect(automaticRows('csi300', { ...mkSnap([ratio, nextDay, volume]), generatedAt: '2026-10-19T10:00:00Z' }, null, '2026-10-19').funding?.signal).toBe('neutral')
    expect(automaticRows('csi300', mkSnap([ratio]), null, '2026-10-17').funding?.pendingReason).toBe('缺少成交额基准')
    for (const patch of [{ value: 101 }, { kind: 'proxy' as const }, { unit: '亿元' }, { observationDate: '2026-10-15' }]) {
      expect(automaticRows('csi300', mkSnap([{ ...ratio, ...patch }, volume]), null, '2026-10-17').funding?.available).toBe(false)
    }
  })
  const turnover = (patch: Partial<AutomaticFact> = {}) => fact({ metricId: 'turnover_ratio_52w', market: 'hstech', value: 1.6,
    unit: '倍', frequency: 'weekly', source: 'https://web.ifzq.gtimg.cn/', description: '恒科完整周与前52周同口径日均成交额', ...patch })
  const south = (patch: Partial<AutomaticFact> = {}) => fact({ metricId: 'hk_south_20d', market: 'all', value: 400.08, unit: '亿元',
    source: 'https://datacenter-web.eastmoney.com/', description: '港股通南向合计近20交易日', ...patch })
  it('恒指实际周成交额可以展示，但不能冒充52周比值或借给恒科', () => {
    const amount = fact({ metricId: 'index_week_daily_turnover_hkd', market: 'hsi', value: 80378000000, unit: '港元', frequency: 'weekly', description: '官方Index Turnover，33日报档案' })
    const r = automaticRows('hsi', mkSnap([amount, south()]), null, '2026-10-17').funding
    expect(r?.detail).toContain('803.78亿港元')
    expect(r?.available).toBe(false)
    expect(r?.pendingReason).toBe('缺少成交额基准')
    expect(r?.methodDetail).toContain('33日报档案')
    expect(automaticRows('hstech', mkSnap([amount, south()]), null, '2026-10-17').funding?.detail).not.toContain('803.78')
    for (const patch of [{ unit: '亿元' }, { frequency: 'daily' as const }, { kind: 'proxy' as const }, { value: 0 }]) {
      expect(automaticRows('hsi', mkSnap([{ ...amount, ...patch }, south()]), null, '2026-10-17').funding?.detail).not.toContain('803.78')
    }
  })
  it('同指数成交额完整周比值与有效南向齐备时，按现有规则计资金票并列出两个来源', () => {
    const r = automaticRows('hstech', mkSnap([turnover(), south()]), null, '2026-10-17').funding
    expect(r?.available).toBe(true)
    expect(r?.signal).toBe('positive')
    expect(r?.detail).toContain('1.60')
    expect(r?.detail).toContain('400.08')
    expect(r?.detail).toContain('背景')
    expect(r?.methodDetail).toContain('https://datacenter-web.eastmoney.com/')
    expect(r?.source).toBe('https://web.ifzq.gtimg.cn/')
    expect(automaticRows('hsi', mkSnap([turnover(), south()]), null, '2026-10-17').funding?.available).toBe(false)
  })
  it('资金自动票沿用缩量与南向方向阈值，不把放量自动等同向上', () => {
    expect(automaticRows('hstech', mkSnap([turnover(), south({ value: -1 })]), null, '2026-10-17').funding?.signal).toBe('risk')
    expect(automaticRows('hstech', mkSnap([turnover({ value: 0.5 }), south()]), null, '2026-10-17').funding?.signal).toBe('bottom')
    expect(automaticRows('hstech', mkSnap([turnover({ value: 1 }), south()]), null, '2026-10-17').funding?.signal).toBe('neutral')
  })
  it('成交额为代理、过期、超范围、错误单位或南向无效时不计资金票', () => {
    for (const patch of [{ kind: 'proxy' as const }, { observationDate: '2026-10-01' }, { value: -1 }, { value: 31 }, { unit: '元' }]) {
      expect(automaticRows('hstech', mkSnap([turnover(patch), south()]), null, '2026-10-17').funding?.available).toBe(false)
    }
    expect(automaticRows('hstech', mkSnap([turnover(), south({ kind: 'proxy' })]), null, '2026-10-17').funding?.available).toBe(false)
    expect(automaticRows('hstech', mkSnap([turnover()]), null, '2026-10-17').funding?.pendingReason).toBe('南向数据待更新')
  })
  it('HK funding always emits a row; uses the verified 006-channel southbound fact as background, not vote', () => {
    const south = fact({ metricId: 'hk_south_20d', market: 'all', value: 400.08, unit: '亿元', observationDate: '2026-10-16',
      source: 'https://datacenter-web.eastmoney.com/api/data/v1/get?filter=MUTUAL_TYPE%3D%22006%22',
      description: '港股通南向合计(沪+深,MUTUAL_TYPE=006)近20个交易日净买入合计,NET_DEAL_AMT,百万元÷100=亿元' })
    const rows = automaticRows('hsi', mkSnap([south]), null, '2026-10-17')
    expect(rows.funding).toBeDefined()
    expect(rows.funding?.signal).toBe('missing')
    expect(rows.funding?.available).toBe(false)
    expect(rows.funding?.detail).toMatch(/南向.*20.*合计.*亿元/)
    expect(rows.funding?.date).toBe('2026-10-16')
    expect(rows.funding?.source).toBe(south.source)
    expect(rows.funding?.detail).toContain('400.08')
    expect(rows.funding?.methodDetail).toContain('背景')
    expect(rows.funding?.detail).toContain('52周')
  })
  it('HK funding absence still emits a precise reason — no fabricated date/source', () => {
    const rows = automaticRows('hsi', mkSnap([]), null, '2026-10-17')
    expect(rows.funding).toBeDefined()
    expect(rows.funding?.available).toBe(false)
    expect(rows.funding?.detail).not.toContain('需补齐')
    expect(rows.funding?.detail).toMatch(/尚缺.*南向资金数据/)
    // No real observation date → no fabricated source either
    expect(rows.funding?.source).toBeUndefined()
    expect(rows.funding?.date).toBeUndefined()
  })
  it('CSI300 funding absence still emits the precise-scope reason, never the CSI XLS or fabricated asOf date', () => {
    const rows = automaticRows('csi300', mkSnap([]), null, '2026-10-17')
    expect(rows.funding).toBeDefined()
    expect(rows.funding?.available).toBe(false)
    expect(rows.funding?.detail).not.toContain('需补齐')
    expect(rows.funding?.detail).toMatch(/尚无有效的两市融资买入数据/)
    expect(rows.funding?.source).toBeUndefined()
    expect(rows.funding?.date).toBeUndefined()
  })
  it('HK funding detail does not borrow the CSI300 source — only the south fact URL passes through', () => {
    const south = fact({ metricId: 'hk_south_20d', market: 'all', value: 400.08, observationDate: '2026-10-16',
      source: 'https://datacenter-web.eastmoney.com/api/data/v1/get?filter=MUTUAL_TYPE%3D%22006%22' })
    const rows = automaticRows('hstech', mkSnap([south]), null, '2026-10-17')
    expect(rows.funding?.source).toBe(south.source)
    expect(rows.funding?.source).not.toContain('000300cons')
  })
})

describe('宽度行精确状态（每市场必填，缺失给原因）', () => {
  it('只有成分名单而没有行情时，不把名单日期显示为行情观测日', () => {
    const b: BreadthSnapshot = { schemaVersion: 1, generatedAt: now, issues: ['恒生指数日线请求失败'], markets: { hsi: {
      universeId: 'hsi', universeDate: '2026-10-16', source: 'https://www.hsi.com.hk/', kind: 'observed',
      observationDate: '2026-10-16', coverage: 0, eligible: 0, total: 95, breadth: null, priorBreadth: null, exclusions: { fetch_failed: 95 }, detail: '名单已取得，行情失败',
    } } }
    const r = automaticRows('hsi', null, b, '2026-10-17').breadth
    expect(r?.available).toBe(false)
    expect(r?.date).toBeUndefined()
    expect(r?.methodDetail).toContain('名单')
  })
  it('次新股移出分母（不超过10%）后可计票，原始排除键显示为中文', () => {
    const entry = (newListings: number, eligible: number) => ({ universeId: 'hstech', universeDate: '2026-10-16', source: 'https://www.hsi.com.hk/', kind: 'observed' as const,
      observationDate: '2026-10-16', coverage: eligible / (30 - newListings), eligible, total: 30, newListings, breadth: 35, priorBreadth: 30, exclusions: (newListings ? { new_listing: newListings } : {}) as Record<string, number>, detail: '排除：new_listing 3' })
    const ok = automaticRows('hstech', null, { schemaVersion: 1, generatedAt: now, issues: [], markets: { hstech: entry(3, 27) } }, '2026-10-17').breadth
    expect(ok?.available).toBe(true)
    expect(ok?.detail).toContain('27/27')
    expect(ok?.detail).toContain('3只次新股')
    expect(ok?.methodDetail).toContain('次新股（移出分母） 3')
    const capped = automaticRows('hstech', null, { schemaVersion: 1, generatedAt: now, issues: [], markets: { hstech: { ...entry(4, 26), total: 30 } } }, '2026-10-17').breadth
    expect(capped?.available).toBe(false)
  })
  it('HK breadth missing: precise per-market reason, never CSI source', () => {
    const breadth: BreadthSnapshot = { schemaVersion: 1, generatedAt: now, markets: {}, issues: ['恒生指数：尚无经核定的完整当期成分名单，宽度缺失'] }
    const rows = automaticRows('hsi', null, breadth, '2026-10-17')
    expect(rows.breadth).toBeDefined()
    expect(rows.breadth?.available).toBe(false)
    expect(rows.breadth?.detail).not.toContain('需补齐')
    expect(rows.breadth?.detail).toMatch(/恒生指数/)
    expect(rows.breadth?.source).toBeUndefined()
    expect(rows.breadth?.date).toBeUndefined()
  })
  it('HK breadth proxy entry: shows coverage gap, never the CSI source URL', () => {
    const breadth: BreadthSnapshot = { schemaVersion: 1, generatedAt: now, markets: { hsi: {
      universeId: 'hsi-constituents', universeDate: '2026-10-16', source: 'https://example.com/hsi',
      kind: 'proxy', observationDate: '2026-10-16', coverage: 0.5, eligible: 30, total: 60,
      breadth: null, priorBreadth: null, exclusions: { not_fetched: 30 }, detail: '代理进度30/60',
    } }, issues: [] }
    const rows = automaticRows('hsi', null, breadth, '2026-10-17')
    expect(rows.breadth).toBeDefined()
    expect(rows.breadth?.available).toBe(false)
    expect(rows.breadth?.pendingReason).toBe('样本覆盖不足')
    expect(rows.breadth?.methodDetail).toMatch(/proxy/)
    expect(rows.breadth?.detail).toMatch(/60|30|case/)
    expect(rows.breadth?.source).not.toContain('000300cons')
  })
  it('CSI300 observed qualified breadth: votes with date and source', () => {
    const breadth: BreadthSnapshot = { schemaVersion: 1, generatedAt: now, markets: { csi300: {
      universeId: 'csi300-constituents', universeDate: '2026-10-16', source: 'https://oss-ch.csindex.com.cn/000300cons.xls',
      kind: 'observed', observationDate: '2026-10-16', coverage: 0.99, eligible: 297, total: 300,
      breadth: 45.2, priorBreadth: 38.0, exclusions: {}, detail: '合格297/300',
    } }, issues: [] }
    const rows = automaticRows('csi300', null, breadth, '2026-10-17')
    expect(rows.breadth?.available).toBe(true)
    expect(rows.breadth?.source).toContain('000300cons')
    expect(rows.breadth?.date).toBe('2026-10-16')
  })
})

describe('breadthIssue助手：直接读issues原文，无regex截断', () => {
  it('falls back to the per-market issue verbatim when no markets entry exists', () => {
    const breadth: BreadthSnapshot = { schemaVersion: 1, generatedAt: now, markets: {}, issues: ['恒生指数：尚无经核定的完整当期成分名单，宽度缺失'] }
    expect(breadthIssue('hsi', breadth)).toContain('恒生指数：尚无经核定的完整当期成分名单，宽度缺失')
  })
  it('returns a clearly-fabrication-free placeholder when both markets and issues are absent', () => {
    expect(breadthIssue('hsi', null)).toMatch(/未发布|缺失/)
    expect(breadthIssue('hsi', null)).not.toContain('需补齐')
  })
})
