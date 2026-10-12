import { describe, expect, it } from 'vitest'
import { buildTrend, deltaOf, candlesToChanges } from './trend'
import { dailySnapshot } from './fixtures'

const snap = (date: string, patch: Partial<ReturnType<typeof dailySnapshot>['metrics']> = {}) => {
  const s = dailySnapshot(date)
  return { ...s, metrics: { ...s.metrics, ...patch } }
}

describe('buildTrend', () => {
  it('按日期倒序取最近 N 个交易日，并带上指标与板块名称', () => {
    const rows = buildTrend([snap('2026-10-09', { ztCount: 50 }), snap('2026-10-12')], {}, 5)
    expect(rows.map(r => r.date)).toEqual(['2026-10-12', '2026-10-09'])
    expect(rows[1].ztCount).toBe(50)
    expect(rows[0].inflow).toEqual(['银行']); expect(rows[0].outflow).toEqual(['软件'])
    expect(rows[0].backfilled).toBe(false)
  })

  it('天数上限生效，缺口不插值', () => {
    const rows = buildTrend([snap('2026-10-12'), snap('2026-10-08'), snap('2026-10-07')], {}, 2)
    expect(rows.map(r => r.date)).toEqual(['2026-10-12', '2026-10-08'])
  })

  it('没有快照的日期只用回补的指数涨跌，其余留空并标记为回补', () => {
    const rows = buildTrend([snap('2026-10-12')], { '2026-10-09': { sh000001: 0.5, sz399001: -0.2, sz399006: 1.1 } }, 5)
    expect(rows[1]).toMatchObject({ date: '2026-10-09', backfilled: true, ztCount: null, volume: null, index: { sh: 0.5, sz: -0.2, cy: 1.1 } })
  })

  it('已有快照的日期优先使用快照里的指数涨跌，不用回补值覆盖', () => {
    const rows = buildTrend([snap('2026-10-12')], { '2026-10-12': { sh000001: 9 } }, 5)
    expect(rows[0].index.sh).toBe(-0.43)
    expect(rows[0].index.sz).toBeNull()
  })
})

describe('deltaOf', () => {
  it('与相邻更早一天比较；任一侧缺失则为 null', () => {
    const rows = buildTrend([snap('2026-10-12', { ztCount: 69 }), snap('2026-10-09', { ztCount: 50 }), snap('2026-10-08', { ztCount: null })], {}, 5)
    expect(deltaOf(rows, 0, 'ztCount')).toBe(19)
    expect(deltaOf(rows, 1, 'ztCount')).toBeNull()
    expect(deltaOf(rows, 2, 'ztCount')).toBeNull()
  })
})

describe('candlesToChanges', () => {
  it('用相邻收盘价计算日涨跌幅，首根没有前收所以不输出', () => {
    const c = (date: string, close: number) => ({ date, open: close, close, high: close, low: close, volume: 1 })
    expect(candlesToChanges([c('2026-10-08', 100), c('2026-10-09', 101), c('2026-10-12', 100.99)])).toEqual({ '2026-10-09': 1, '2026-10-12': -0.01 })
  })
})
