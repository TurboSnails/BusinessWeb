// 每周变化摘要（纯函数）：周边界、空状态、四节内容、每条带日期和来源、邮件正文。
import { describe, expect, it } from 'vitest'
import {
  buildWeeklySummary, companyIndexFrom, completedWeek, composeWeeklyEmail, EARNINGS_TOP, EMPTY_TEXT, isoWeekId, ledgerPair, ledgerYears, macroStageAsOf,
  mergeLedgers, mergePriceHits, priceHitFromFingerprint, RATING_CODES, weekRange, weeklyCount, weeklyPriceHits,
  type CycleReportLike, type LedgerLike, type MacroLike,
} from './weeklySummary'
import { RATING_CODES as LEDGER_RATING_CODES } from '../signals/ledger'
import type { CandidateAlertRule, CandidateItem } from '../candidates/validation'
import type { PriceObservation } from '../candidates/priceAlert'

const W46 = weekRange('2026-11-12') // 2026-11-09（一）至 2026-11-15（日）
const rule = (over: Partial<CandidateAlertRule> = {}): CandidateAlertRule => ({ kind: 'price-below', threshold: 1500, currency: 'CNY', anchor: { type: 'research-bear', value: 1500, asOf: '2026-11-01' }, enabled: true, createdAt: '2026-11-01T00:00:00.000Z', ...over })
const decision = (at: string, nextCheck: string) => ({ at, action: 'watch' as const, why: '护城河', wrong: '份额下滑', nextCheck })
const obs = (price: number, date: string, over: Partial<PriceObservation> = {}): PriceObservation => ({ price, currency: 'CNY', date, source: '自动 DCF 预填库收盘价', ...over })

const LEDGER: LedgerLike = { schemaVersion: 1, snapshots: {
  '2026-10-30': { 'cn:600519': [1500, 2] },
  '2026-11-07': { 'cn:600519': [1450, 1], 'us:AAPL': [200, 2], 'us:MSFT': [500, 3], 'hk:00700': [400, null], 'us:KO': [60, 2] },
  '2026-11-13': { 'cn:600519': [1400, 2], 'us:AAPL': [210, 0], 'us:MSFT': [510, 2], 'hk:00700': [410, 1], 'us:KO': [61, 2] },
} }
const COMPANIES = companyIndexFrom([
  { market: 'cn', code: '600519', name: '贵州茅台' }, { market: 'ndx', code: 'AAPL', name: '苹果' }, { market: 'us', code: 'MSFT', name: '微软' },
])
const shadow = (trendState = '防守') => ({ trendState, riskGate: '防守复核', valuationZone: '中间区域' })
const market = (legacyState: string, trend?: string) => ({ legacyState, shadow: shadow(trend) })
const CYCLE: CycleReportLike = { schemaVersion: 1, records: [
  { weekEnding: '2026-11-14', decisionAt: '2026-11-14T10:00:00Z', ruleVersion: 'cycle-shadow-v2', markets: { csi300: market('趋势修复', '修复'), hsi: market('趋势防守') } },
  { weekEnding: '2026-11-07', decisionAt: '2026-11-13T10:00:00Z', ruleVersion: 'cycle-shadow-v2', markets: { csi300: market('趋势防守'), hsi: market('趋势防守') } },
] }
// 上周末：全部正常（常态）；本周末：VIX 与 HY 进入预警区 → 2 分（预警）；KRE 1 周仍正常
const MACRO: MacroLike = { series: {
  sahm: { latest: { date: '2026-10-01', value: 0 }, history: [['2026-10-01', 0]] },
  claims: { latest: { date: '2026-11-07', value: 20 }, history: [['2026-11-07', 20]] },
  hy: { latest: { date: '2026-11-13', value: 420 }, history: [['2026-10-30', 320], ['2026-11-13', 420]] },
  vix: { latest: { date: '2026-11-16', value: 30 }, history: [['2026-10-30', 15], ['2026-11-13', 22], ['2026-11-16', 30]] },
  dd: { latest: { date: '2026-11-13', value: 4 }, history: [['2026-10-30', 3], ['2026-11-13', 4]] },
  kre: { latest: { date: '2026-11-09', value: 1 }, history: [['2026-11-02', 0], ['2026-11-09', 1]] },
} }

describe('周边界（北京时间，ISO 周一至周日）', () => {
  it('ISO 周编号：跨年按周四所在年份', () => {
    expect(isoWeekId('2026-11-14')).toBe('2026-W46')
    expect(isoWeekId('2025-12-29')).toBe('2026-W01')
    expect(isoWeekId('2027-01-03')).toBe('2026-W53')
    expect(isoWeekId('2027-01-04')).toBe('2027-W01')
  })

  it('weekRange：本周、上一周、下一周的起止日', () => {
    expect(W46).toEqual({ id: '2026-W46', start: '2026-11-09', end: '2026-11-15', prevStart: '2026-11-02', prevEnd: '2026-11-08', nextStart: '2026-11-16', nextEnd: '2026-11-22' })
    expect(weekRange('2026-11-09')).toEqual(W46)
    expect(weekRange('2026-11-15')).toEqual(W46)
  })

  it('completedWeek：按北京日期取上一个完整周；周一 00:00 UTC（北京 08:00）的定时任务总结刚结束的那周', () => {
    expect(completedWeek(new Date('2026-11-16T00:10:00Z')).id).toBe('2026-W46') // 北京周一 08:10
    expect(completedWeek(new Date('2026-11-15T16:30:00Z')).id).toBe('2026-W46') // 北京周一 00:30
    expect(completedWeek(new Date('2026-11-15T15:30:00Z')).id).toBe('2026-W45') // 北京周日 23:30：本周还没结束
    expect(completedWeek(new Date('2026-11-20T09:00:00Z')).id).toBe('2026-W46') // 周中补跑仍是同一周（去重键相同）
  })

  it('信号台账：跨年时读两个年份并合并', () => {
    expect(ledgerYears(weekRange('2027-01-06'))).toEqual([2026, 2027])
    expect(ledgerYears(W46)).toEqual([2026])
    expect(Object.keys(mergeLedgers(LEDGER, { schemaVersion: 1, snapshots: { '2027-01-08': {} } }, null)!.snapshots)).toContain('2027-01-08')
    expect(ledgerPair(LEDGER, W46)).toEqual({ prev: '2026-11-07', cur: '2026-11-13' })
  })
})

describe('空状态', () => {
  it('没有任何数据或没有变化时：empty 与固定空文案，不凑内容', () => {
    const none = buildWeeklySummary({ week: W46 })
    expect(none).toMatchObject({ empty: true, total: 0, sections: [], emptyText: EMPTY_TEXT })
    expect(EMPTY_TEXT).toBe('本周没有需要复核的变化')
    const unchanged = buildWeeklySummary({ week: W46, ledger: { schemaVersion: 1, snapshots: { '2026-11-07': { 'us:KO': [60, 2] }, '2026-11-13': { 'us:KO': [61, 2] } } }, cycle: { schemaVersion: 1, records: CYCLE.records.map(r => ({ ...r, markets: { csi300: market('趋势防守') } })) }, macro: { series: { vix: { latest: { date: '2026-11-13', value: 15 } } } } })
    expect(unchanged.empty).toBe(true)
    expect(unchanged.notes).toEqual([])
  })

  it('访客不传 plan → 无计划节；传入 plan 为 context 且不计入变化项', () => {
    expect(buildWeeklySummary({ week: W46 }).sections.find(s => s.id === 'plan')).toBeUndefined()
    const withPlan = buildWeeklySummary({
      week: W46,
      plan: { snapshotDate: '2026-11-14', dueDate: '2026-11-16', upcomingDate: null, deferred: false },
    })
    expect(withPlan.empty).toBe(true)
    expect(weeklyCount(withPlan)).toBe(0)
    expect(withPlan.sections.find(s => s.id === 'plan')?.context).toBe(true)
    expect(withPlan.sections.find(s => s.id === 'plan')?.lines[0].kind).toBe('plan-review')
    expect(JSON.stringify(withPlan)).not.toMatch(/amount|fen|token/i)
  })

  it('台账没有本周一期：不比较并写明原因（不算事项）', () => {
    const s = buildWeeklySummary({ week: W46, ledger: { schemaVersion: 1, snapshots: { '2026-11-07': {} } } })
    expect(s.empty).toBe(true)
    expect(s.notes[0]).toMatch(/信号台账没有 11-09 至 11-15/)
  })
})

describe('候选池', () => {
  const items: CandidateItem[] = [
    { market: 'cn', code: '600519', addedAt: '2026-10-01T00:00:00Z', alert: rule(), decisions: [decision('2026-11-10T02:00:00Z', '2026-11-18')] },
    { market: 'ndx', code: 'AAPL', addedAt: '2026-10-01T00:00:00Z', decisions: [decision('2026-10-01T00:00:00Z', '2026-11-25'), decision('2026-11-15T17:00:00Z', '2026-12-01')] },
    { market: 'hk', code: '00700', addedAt: '2026-10-01T00:00:00Z', alert: rule({ currency: 'HKD', threshold: 500, anchor: { type: 'manual', value: 480, asOf: '2026-11-01' } }) },
  ]

  it('本周触及条件价：只看周内、同币种、规则开启的收盘价；暂停与已看过不改变「触及过」的事实', () => {
    const observations = new Map<string, PriceObservation[]>([
      ['cn:600519', [obs(1400, '2026-11-12'), obs(1450, '2026-11-13', { source: '公司页价格锚点' }), obs(1300, '2026-11-16'), obs(1200, '2026-11-11', { currency: 'USD' })]],
      ['hk:00700', [obs(450, '2026-11-13', { currency: 'HKD', intraday: true })]],
    ])
    expect(weeklyPriceHits(items, observations, W46)).toEqual([{ market: 'cn', code: '600519', date: '2026-11-13', kind: 'price-below', threshold: 1500, currency: 'CNY', price: 1450, source: '公司页价格锚点' }])
    const snoozed = [{ ...items[0], alert: rule({ snoozedUntil: '2026-12-01', lastSeenAt: '2026-11-14T00:00:00Z' }) }]
    expect(weeklyPriceHits(snoozed, observations, W46)).toHaveLength(1)
    expect(weeklyPriceHits([{ ...items[0], alert: rule({ enabled: false }) }], observations, W46)).toEqual([])
  })

  it('每日提醒发送记录的去重键可还原为触及记录；合并时同一家只留一条，优先带收盘价的', () => {
    expect(priceHitFromFingerprint('price-hit|cn:600519|2026-11-11|price-below|1500')).toEqual({ market: 'cn', code: '600519', date: '2026-11-11', kind: 'price-below', threshold: 1500 })
    expect(priceHitFromFingerprint('review|cn:600519|2026-11-11')).toBeNull()
    expect(priceHitFromFingerprint('price-hit|xx:1|2026-11-11|price-below|1')).toBeNull()
    const withPrice = { market: 'cn' as const, code: '600519', date: '2026-11-10', kind: 'price-below' as const, threshold: 1500, price: 1490, source: 'a' }
    const logged = { market: 'cn' as const, code: '600519', date: '2026-11-12', kind: 'price-below' as const, threshold: 1500, source: 'log' }
    const other = { ...logged, code: '000001' }
    expect(mergePriceHits([withPrice], [logged, other])).toEqual([withPrice, other])
  })

  it('评级变化（台账）、触及条件价、本周新写的决策记录、下周到期复查；每条带日期、来源和公司页链接', () => {
    const priceHits = weeklyPriceHits(items, new Map([['cn:600519', [obs(1400, '2026-11-12')]]]), W46)
    const s = buildWeeklySummary({ week: W46, candidates: items, priceHits, ledger: LEDGER, companies: COMPANIES })
    const sec = s.sections.find(x => x.id === 'candidates')!
    expect(sec.lines.map(l => [l.kind, l.text, l.date, l.source, l.href])).toEqual([
      ['rating', '贵州茅台（600519 · A股）：研究评级「条件关注」→「观察」', '2026-11-13', '信号台账 2026-11-07 → 2026-11-13', '/research-notes/cn/600519'],
      ['rating', '苹果（AAPL · 纳指100）：研究评级「观察」→「优先关注」', '2026-11-13', '信号台账 2026-11-07 → 2026-11-13', '/research-notes/ndx/AAPL'],
      ['price-hit', '贵州茅台（600519 · A股）：收盘价 CNY 1,400 ≤ 条件价 1,500，该复核一眼', '2026-11-12', '自动 DCF 预填库收盘价', '/research-notes/cn/600519'],
      ['decision', '贵州茅台（600519 · A股）：写了决策记录「观察」，下次检查日 2026-11-18', '2026-11-10', '候选池决策记录', '/research-notes/cn/600519'],
      ['review-next', '贵州茅台（600519 · A股）：下周到期复查，检查日 2026-11-18', '2026-11-18', '候选池决策记录（记于 2026-11-10）', '/research-notes/cn/600519'],
    ])
    // AAPL 的第二条记录是北京 11-16 凌晨写的（UTC 11-15 17:00），不属于本周；最新检查日 12-01 不在下周
    expect(sec.lines.every(l => /^\d{4}-\d{2}-\d{2}$/.test(l.date) && l.source)).toBe(true)
  })

  it('没有候选时不生成候选池一节；候选池以外的触及记录不列出', () => {
    const s = buildWeeklySummary({ week: W46, candidates: [], priceHits: [{ market: 'cn', code: '000001', date: '2026-11-12', kind: 'price-below', threshold: 1, source: 'x' }], ledger: LEDGER })
    expect(s.sections.map(x => x.id)).toEqual(['library'])
  })
})

describe('公司库：评级档位进出「优先关注 / 条件关注」', () => {
  it('计数全部变化，列出新进与跌出；其余只计数；未评级（null）不算变化', () => {
    const s = buildWeeklySummary({ week: W46, ledger: LEDGER, companies: COMPANIES })
    const lib = s.sections.find(x => x.id === 'library')!
    expect(lib.summary).toBe('共 3 家研究评级档位变化（信号台账 2026-11-07 → 2026-11-13）：新进「优先关注 / 条件关注」1 家，跌出 1 家；其余 1 家未逐条列出。')
    expect(lib.lines.map(l => [l.kind, l.text])).toEqual([
      ['library-up', '苹果（AAPL · 纳指100）：新进「优先关注」（观察 → 优先关注）'],
      ['library-down', '贵州茅台（600519 · A股）：跌出「条件关注」（条件关注 → 观察）'],
    ])
    expect(lib.more).toBe(1) // 微软 回避 → 观察
    expect(weeklyCount(s)).toBe(3)
  })

  it('评级档位顺序与信号台账一致', () => {
    expect([...RATING_CODES]).toEqual(LEDGER_RATING_CODES)
  })
})

describe('牛熊周期与宏观温度', () => {
  it('牛熊周期：本周与上周记录逐市场比较，只列有变化的市场；缺记录时写明', () => {
    const s = buildWeeklySummary({ week: W46, cycle: CYCLE })
    expect(s.sections).toEqual([{ id: 'cycle', title: '牛熊周期', lines: [{
      kind: 'cycle', date: '2026-11-14', href: '/monitor?tab=market-cycle',
      source: '牛熊周期自动周报（周末 2026-11-07 → 2026-11-14，规则 cycle-shadow-v2）',
      text: 'A股 · 沪深300：总体状态「趋势防守」→「趋势修复」；趋势「防守」→「修复」',
    }] }])
    const missing = buildWeeklySummary({ week: W46, cycle: { schemaVersion: 1, records: [CYCLE.records[0]] } })
    expect(missing.empty).toBe(true)
    expect(missing.notes[0]).toMatch(/牛熊周期/)
  })

  it('宏观阶段：按各信号在周末（含）之前最近的观测计算；周末之后的观测不参与', () => {
    expect(macroStageAsOf(MACRO, '2026-11-08')).toMatchObject({ name: '常态', score: 0 })
    const end = macroStageAsOf(MACRO, '2026-11-15')
    expect(end).toMatchObject({ name: '预警', score: 2 })
    expect(end.values.vix).toEqual({ value: 22, date: '2026-11-13' })
    const s = buildWeeklySummary({ week: W46, macro: MACRO })
    const line = s.sections.find(x => x.id === 'macro')!.lines[0]
    expect(line.text).toMatch(/^宏观阶段「常态」（0 分）→「预警」（2 分）；更新的读数：/)
    expect(line.text).toContain('VIX 15（2026-10-30）→ 22（2026-11-13）')
    expect(line).toMatchObject({ date: '2026-11-15', href: '/monitor' })
    expect(line.source).toContain('macro-us.json')
  })

  it('宏观阶段：两个周末可用的信号项不同则不比较', () => {
    const partial: MacroLike = { series: { vix: { latest: { date: '2026-11-13', value: 35 } }, hy: { latest: { date: '2026-11-13', value: 700 } } } }
    const s = buildWeeklySummary({ week: W46, macro: partial })
    expect(s.empty).toBe(true)
    expect(s.notes[0]).toMatch(/信号项不同/)
  })
})

describe('邮件正文', () => {
  it('有变化：主题含周编号与项数，每条带日期、来源与站点链接；页脚写明不是买卖指令', () => {
    const s = buildWeeklySummary({ week: W46, ledger: LEDGER, cycle: CYCLE, companies: COMPANIES })
    const m = composeWeeklyEmail(s, 'https://example.test')
    expect(m.subject).toBe('每周变化摘要 · 2026-W46（11-09–11-15）· 4 项')
    expect(m.text).toContain('【公司库】2 项')
    expect(m.text).toContain('日期 2026-11-14 · 来源：牛熊周期自动周报')
    expect(m.text).toContain('https://example.test/monitor?tab=market-cycle')
    expect(m.text).toContain('不是买卖指令')
    expect(m.html).toContain('<a href="https://example.test/research-notes/ndx/AAPL">')
    expect(m.text).not.toMatch(/看多|看空|目标价|买入信号/)
  })

  it('空摘要：写空文案（服务端不会发这封，但内容仍正确）', () => {
    const m = composeWeeklyEmail(buildWeeklySummary({ week: W46 }), 'https://example.test')
    expect(m.subject).toContain('无变化')
    expect(m.text).toContain(EMPTY_TEXT)
  })

  it('HTML 转义公司名', () => {
    const s = buildWeeklySummary({ week: W46, ledger: LEDGER, companies: companyIndexFrom([{ market: 'us', code: 'MSFT', name: '<b>x</b>' }, { market: 'ndx', code: 'AAPL', name: 'A&B' }]) })
    const m = composeWeeklyEmail(s, 'https://example.test')
    expect(m.html).toContain('A&amp;B')
    expect(m.html).not.toContain('<b>x</b>')
  })
})

describe('下周财报（财报前瞻）', () => {
  const EARN = {
    schemaVersion: 1 as const, generatedAt: '2026-11-15T23:30:00Z',
    sources: { yahoo: { label: 'Yahoo Finance（yfinance）' } },
    items: [
      { market: 'us' as const, code: 'NVDA', name: '英伟达', date: '2026-11-17', time: 'amc', confirmed: true, period: 'FY2027Q3', dateSource: 'yahoo', research: { rating: '条件关注' } },
      { market: 'us' as const, code: 'WMT', name: '沃尔玛', date: '2026-11-19', time: 'bmo', confirmed: false, period: null, dateSource: 'yahoo', research: { rating: '中性观察' } },
      { market: 'us' as const, code: 'CSCO', name: '思科', date: '2026-11-12', time: 'amc', confirmed: true, period: null, dateSource: 'yahoo', research: { rating: '优先关注' } },
    ],
  }
  it('摘要周的下一周：候选池全部列出，条件关注以上补充；带日期、来源与链接，不写预期数字', () => {
    const s = buildWeeklySummary({ week: W46, candidates: [{ market: 'us', code: 'WMT', addedAt: '2026-11-01T00:00:00Z' }], earnings: EARN })
    const sec = s.sections.find(x => x.id === 'earnings')!
    expect(sec.title).toBe('下周财报')
    expect(sec.lines.map(l => l.text)).toEqual([
      '沃尔玛（WMT · 标普500）：11-19 盘前公布（日期为预估；候选池）',
      '英伟达（NVDA · 标普500）：11-17 盘后公布 FY2027Q3（日期已确认；站内评级「条件关注」）',
    ])
    expect(sec.lines[0]).toMatchObject({ kind: 'earnings', date: '2026-11-19', href: '/research-notes/us/WMT' })
    expect(sec.lines[0].source).toBe('财报前瞻 earnings-calendar.json（Yahoo Finance（yfinance），生成于 2026-11-15）')
    expect(sec.summary).toContain('候选池 1 家、条件关注以上 1 家')
  })
  it('下一周没有相关公司或不传财报数据时不生成这一节', () => {
    expect(buildWeeklySummary({ week: weekRange('2026-10-19'), earnings: EARN }).sections.some(x => x.id === 'earnings')).toBe(false)
    expect(buildWeeklySummary({ week: W46 }).sections.some(x => x.id === 'earnings')).toBe(false)
  })
  it('只限候选池或「条件关注」以上：不在池里、评级也不够的公司不列', () => {
    const sec = buildWeeklySummary({ week: W46, earnings: EARN }).sections.find(x => x.id === 'earnings')!
    expect(sec.lines.map(l => l.href)).toEqual(['/research-notes/us/NVDA'])
  })
  it('最多列 EARNINGS_TOP 家（候选池在前），其余写「另有 N 家」', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ ...EARN.items[0], code: `R${String(i).padStart(2, '0')}`, name: `公司${i}` }))
    const s = buildWeeklySummary({ week: W46, candidates: [{ market: 'us', code: 'WMT', addedAt: '2026-11-01T00:00:00Z' }], earnings: { ...EARN, items: [...EARN.items, ...many] } })
    const sec = s.sections.find(x => x.id === 'earnings')!
    expect(sec.lines).toHaveLength(EARNINGS_TOP)
    expect(sec.lines[0].href).toBe('/research-notes/us/WMT')
    expect(sec.more).toBe(1 + 16 - EARNINGS_TOP)
    expect(sec.summary).toContain(`另有 ${1 + 16 - EARNINGS_TOP} 家未逐条列出`)
  })
  it('背景信息：不计入事项数、不让空摘要变成“有变化”；邮件标题项数不含财报', () => {
    const only = buildWeeklySummary({ week: W46, candidates: [{ market: 'us', code: 'WMT', addedAt: '2026-11-01T00:00:00Z' }], earnings: EARN })
    expect(only).toMatchObject({ empty: true, total: 0 })
    expect(weeklyCount(only)).toBe(0)
    expect(only.sections.find(x => x.id === 'earnings')?.context).toBe(true)
    const emptyMail = composeWeeklyEmail(only, 'https://example.test')
    expect(emptyMail.subject).toContain('无变化')

    const withChanges = buildWeeklySummary({ week: W46, ledger: LEDGER, companies: COMPANIES, earnings: EARN })
    const plain = buildWeeklySummary({ week: W46, ledger: LEDGER, companies: COMPANIES })
    expect(withChanges.total).toBe(plain.total)
    expect(weeklyCount(withChanges)).toBe(weeklyCount(plain))
    const m = composeWeeklyEmail(withChanges, 'https://example.test')
    expect(m.subject).toBe(composeWeeklyEmail(plain, 'https://example.test').subject)
    expect(m.text).toContain('【下周财报】1 家')
    expect(m.text).toContain('英伟达（NVDA · 标普500）：11-17 盘后公布 FY2027Q3')
  })
})
