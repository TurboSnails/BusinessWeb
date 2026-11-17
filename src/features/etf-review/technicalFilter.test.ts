import { describe, expect, it } from 'vitest'
import type { EtfTechRecord, TechPeriod } from '../../data/etfTechnical'
import { crossing, matchesTechnical } from './technicalFilter'

const p: TechPeriod = { asOf: '2026-11-13', count: 60, complete: true, ma: '震荡', macd: '偏多', dif: .1, dea: 0, histogram: .2, previousHistogram: -.1, rsi: 50, rsiState: '中性' }
const record = (period: TechPeriod) => ({ day: period, week: period, month: period }) as EtfTechRecord
describe('复盘技术筛选', () => {
  it('金叉事件不同于持续偏多，零轴相等不凭空产生交叉', () => {
    expect(crossing(p)).toBe('gold')
    expect(crossing({ ...p, previousHistogram: .1 })).toBeNull()
    expect(crossing({ ...p, previousHistogram: 0, histogram: -.1 })).toBe('dead')
    expect(crossing({ ...p, histogram: 0 })).toBeNull()
    expect(matchesTechnical(record({ ...p, previousHistogram: .1 }), 'day', 'bull')).toBe(true)
    expect(matchesTechnical(record({ ...p, previousHistogram: .1 }), 'day', 'gold')).toBe(false)
  })
  it('未完成周/月默认不匹配，可显式纳入观察', () => {
    const r = record({ ...p, complete: false })
    expect(matchesTechnical(r, 'week', 'gold')).toBe(false)
    expect(matchesTechnical(r, 'month', 'gold', true)).toBe(true)
  })
  it('旧快照缺前值、不合法数字和缺数据不冒充交叉', () => {
    expect(crossing({ ...p, previousHistogram: undefined })).toBeNull()
    expect(crossing({ ...p, previousHistogram: NaN })).toBeNull()
    expect(matchesTechnical(undefined, 'day', 'gold')).toBe(false)
    expect(matchesTechnical(undefined, 'day', 'all')).toBe(true)
  })
})
