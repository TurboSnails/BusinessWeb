// 站内「本周变化」可比性检查：真实无变化不报缺口；上周缺期、空快照、无共同市场 / 信号、仅部分候选有评级要如实标出。
import { describe, expect, it } from 'vitest'
import { comparisonGaps } from './comparisonGaps'
import { buildWeeklySummary, weekRange, type CycleReportLike, type LedgerLike, type MacroLike } from './weeklySummary'

const W46 = weekRange('2026-11-12') // 11-09 至 11-15；上一周 11-02 至 11-08
const shadow = { trendState: '防守', riskGate: '防守复核', valuationZone: '中间区域' }
const m = { legacyState: '趋势防守', shadow }
const record = (weekEnding: string, markets: CycleReportLike['records'][number]['markets'], ruleVersion = 'cycle-shadow-v2') => ({ weekEnding, decisionAt: `${weekEnding}T10:00:00Z`, ruleVersion, markets })
const CYCLE: CycleReportLike = { schemaVersion: 1, records: [record('2026-11-14', { csi300: m, hsi: m }), record('2026-11-07', { csi300: m, hsi: m })] }
const LEDGER: LedgerLike = { schemaVersion: 1, snapshots: { '2026-11-07': { 'cn:600519': [1, 1], 'us:KO': [60, 2] }, '2026-11-13': { 'cn:600519': [1, 1], 'us:KO': [61, 2] } } }
const MACRO: MacroLike = { series: { vix: { latest: { date: '2026-11-13', value: 15 }, history: [['2026-11-06', 15], ['2026-11-13', 15]] } } }
const ITEM = { market: 'cn' as const, code: '600519', addedAt: '2026-10-01T00:00:00Z' }

describe('comparisonGaps', () => {
  it('真实无变化：三个来源两期都可比较，摘要为空且没有缺口', () => {
    const input = { week: W46, candidates: [ITEM], ledger: LEDGER, cycle: CYCLE, macro: MACRO }
    expect(buildWeeklySummary(input)).toMatchObject({ empty: true, notes: [] })
    expect(comparisonGaps(input)).toEqual([])
  })

  it('台账上一期不在上一周：沿用原比较，但写明实际比较日期', () => {
    const ledger: LedgerLike = { schemaVersion: 1, snapshots: { '2026-10-24': { 'cn:600519': [1, 1] }, '2026-11-13': { 'cn:600519': [1, 1] } } }
    expect(comparisonGaps({ week: W46, ledger })).toEqual(['信号台账缺少上一周（2026-11-02 至 2026-11-08）的一期，评级按 2026-10-24 → 2026-11-13 比较，跨度不止一周。'])
  })

  it('两期台账为空快照或没有共同有评级的公司：评级未比较', () => {
    expect(comparisonGaps({ week: W46, ledger: { schemaVersion: 1, snapshots: { '2026-11-07': {}, '2026-11-13': {} } } }))
      .toEqual(['信号台账 2026-11-07 与 2026-11-13 两期没有共同有评级的公司，评级变化未比较。'])
    expect(comparisonGaps({ week: W46, ledger: { schemaVersion: 1, snapshots: { '2026-11-07': { 'us:KO': [60, null] }, '2026-11-13': { 'us:KO': [61, 2] } } } }))
      .toHaveLength(1)
  })

  it('仅部分候选有评级：写明未比较的候选数，不说全部无变化', () => {
    const items = [ITEM, { market: 'us' as const, code: 'NEW', addedAt: '2026-10-01T00:00:00Z' }]
    expect(comparisonGaps({ week: W46, candidates: items, ledger: LEDGER })).toEqual(['1 家候选在两期信号台账中缺少评级，这些公司的评级变化未比较。'])
  })

  it('两期周期周报没有共同指数：周状态未比较；只有一期含某指数时点名', () => {
    const none: CycleReportLike = { schemaVersion: 1, records: [record('2026-11-14', { csi300: m }), record('2026-11-07', { hsi: m })] }
    expect(comparisonGaps({ week: W46, cycle: none })).toEqual(['两期牛熊周期周报没有共同的指数记录，周状态未比较。'])
    const empty: CycleReportLike = { schemaVersion: 1, records: [record('2026-11-14', {}), record('2026-11-07', {})] }
    expect(comparisonGaps({ week: W46, cycle: empty })).toEqual(['两期牛熊周期周报没有共同的指数记录，周状态未比较。'])
    const partial: CycleReportLike = { schemaVersion: 1, records: [record('2026-11-14', { csi300: m, spx: m }), record('2026-11-07', { csi300: m })] }
    expect(comparisonGaps({ week: W46, cycle: partial })).toEqual(['牛熊周期周报只有一期含美股 · 标普500，这些指数未比较。'])
  })

  it('周期周报 records 为空：摘要不提示（原规则），页面标为未比较', () => {
    const empty: CycleReportLike = { schemaVersion: 1, records: [] }
    expect(buildWeeklySummary({ week: W46, ledger: LEDGER, cycle: empty, macro: MACRO })).toMatchObject({ empty: true, notes: [] })
    expect(comparisonGaps({ week: W46, ledger: LEDGER, cycle: empty, macro: MACRO })).toEqual(['牛熊周期自动周报没有任何周记录，周状态未比较。'])
  })

  it('周期规则版本不同：仍比较（不提高门槛），只加注', () => {
    const changed: CycleReportLike = { schemaVersion: 1, records: [record('2026-11-14', { csi300: m }, 'v3'), record('2026-11-07', { csi300: m })] }
    expect(comparisonGaps({ week: W46, cycle: changed })).toEqual(['两期牛熊周期周报规则版本不同（cycle-shadow-v2 → v3），状态变化可能来自规则调整。'])
  })

  it('两个周末没有共同有效宏观信号：宏观阶段未比较（空快照同理）', () => {
    const onlyLater: MacroLike = { series: { vix: { latest: { date: '2026-11-13', value: 15 } } } }
    expect(comparisonGaps({ week: W46, macro: onlyLater })).toEqual(['宏观快照在 2026-11-08 与 2026-11-15 两个周末没有共同的有效信号，宏观阶段未比较。'])
    expect(comparisonGaps({ week: W46, macro: { series: {} } })).toHaveLength(1)
  })

  it('页面检查不改变邮件摘要：原有比较规则与空文案不变', () => {
    const onlyLater: MacroLike = { series: { vix: { latest: { date: '2026-11-13', value: 15 } } } }
    expect(buildWeeklySummary({ week: W46, ledger: LEDGER, cycle: CYCLE, macro: onlyLater }).notes).toEqual([])
  })
})
