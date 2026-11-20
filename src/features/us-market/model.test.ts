import { describe, expect, it } from 'vitest'
import { breadthChange, compareReturns, decideMarket, freshness, relativeVolume, type Breadth } from './model'
import { mergeSnapshots, rateComponents } from './snapshots'

describe('美股市场证据', () => {
  it('缺少宽度时暂停确认，市场分歧时不把放量上涨当成修复', () => {
    expect(decideMarket({ volumeConfirmed: true, credit: 'improving' }).label).toBe('证据不足')
    expect(decideMarket({ breadth: 'weakening', volumeConfirmed: true, credit: 'worsening' }).label).toBe('防守压力上升')
    expect(decideMarket({ breadth: 'improving', volumeConfirmed: true, credit: 'worsening' }).label).toBe('信号分歧')
    expect(decideMarket({ breadth: 'improving', volumeConfirmed: true, credit: 'improving' }).label).toBe('修复证据增强')
  })

  it('相对收益仅使用相同交易日，旧市场数据标为沿用', () => {
    expect(compareReturns([['2026-11-16', 10], ['2026-11-17', 20]], [['2026-11-16', 100], ['2026-11-18', 100]], 1)).toBeUndefined()
    expect(compareReturns([['2026-11-16', 10], ['2026-11-17', 12]], [['2026-11-16', 100], ['2026-11-17', 110]], 1)).toBeCloseTo(10)
    expect(compareReturns([['2026-11-13', 10], ['2026-11-17', 12]], [
      ['2026-11-13', 100], ['2026-11-16', 105], ['2026-11-17', 110],
    ], 1)).toBeUndefined()
    expect(freshness('2026-11-12', '每日', '2026-11-20')).toBe('沿用上期')
    expect(freshness('2026-09-30', '月度', '2026-11-20')).toBe('正常披露滞后')
    expect(freshness('2026-11-21', '每日', '2026-11-20')).toBe('日期待核对')
  })

  it('量比基准排除当天并拒绝不完整窗口', () => {
    const days = Array.from({ length: 20 }, (_, i): [string, number] => [`2026-10-${String(i + 1).padStart(2, '0')}`, 10])
    expect(relativeVolume(days)).toBeUndefined()
    expect(relativeVolume([...days, ['2026-10-21', 15]])).toBe(1.5)
    const sessions: [string, number][] = [...days, ['2026-10-21', 15], ['2026-10-22', 20]]
    expect(relativeVolume(sessions, sessions, ['2026-10-22'])).toBeUndefined()
    expect(relativeVolume(sessions.filter(([date]) => date !== '2026-10-12'), sessions)).toBeUndefined()
  })

  it('宽度回溯使用同一批成分股并拒绝覆盖不足的回溯', () => {
    const row: Breadth = { date: '2026-11-18', above200: 60, covered: 500, total: 503, scope: '标普', source: '', comparison: {
      date: '2026-11-11', above200: 58, currentAbove200: 56, covered: 499, total: 503, scope: '同一批成分', basis: 'matched-current-membership',
    } }
    expect(breadthChange(row, '2026-11-20')).toMatchObject({ direction: 'weakening', delta: -2, scope: '同一批成分' })
    expect(breadthChange({ ...row, comparison: { ...row.comparison!, covered: 400 } }, '2026-11-20')).toBeUndefined()
  })

  it('刷新收到较旧的多空比或空的其他指标时，保留较新的快照', () => {
    const common = { name: '多空比', unit: '倍', source: '', scope: '测试', frequency: '月度' }
    const now = { ...common, history: [['2026-10-31', 1.5] as [string, number]] }
    const older = { ...common, history: [['2026-09-30', 1.9] as [string, number]] }
    expect(mergeSnapshots({ public: { series: { current: now, untouched: now } } }, { public: { series: { current: older } } }).public?.series)
      .toEqual({ current: now, untouched: now })
  })
})

describe('同日美国利率拆解', () => {
  it('只在两条收益率的观测日相同时计算通胀补偿', () => {
    const base = { generatedAt: '2026-11-19', latestReal: { date: '2026-11-17', value: 2.89 } }
    const same = rateComponents({ ...base, latestYield: { date: '2026-11-17', value: 5.1 } })
    expect(same.breakeven10.history).toEqual([['2026-11-17', 2.21]])
    const mixed = rateComponents({ ...base, latestYield: { date: '2026-11-18', value: 5.2 } })
    expect(mixed.breakeven10).toBeUndefined()
    expect(mixed.tips10.history).toEqual([['2026-11-17', 2.89]])
  })
})
