import { describe, expect, it } from 'vitest'
import { completedBars, technicalSeries, assessManual, summarize, STATE_RULES, macroEvidence, overseasEvidence, usLiquidityEvidence, usFundingSignal, usFundingEvidence, evaluate, type Evidence, type Bar } from './engine'

const bars = (n: number): Bar[] => Array.from({ length: n }, (_, i) => ({ date: `${2000 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-01`, close: 100 + i, volume: 10 }))
const ev = (id: string, signal: Evidence['signal']): Evidence => ({ id, name: id, signal, detail: '', date: '2026-10-16', source: 'https://example.com', available: true })

describe('长周期指标与证据纪律', () => {
  it('不使用本月或尚未结束的本周K线；周五仍保守排除当周', () => {
    const input = [{ date: '2026-09-30', close: 100, volume: 1 }, { date: '2026-10-16', close: 120, volume: 1 }]
    expect(completedBars(input, 'month', '2026-10-17')).toHaveLength(1)
    expect(completedBars(input, 'week', '2026-10-16')).toHaveLength(1)
    expect(completedBars(input, 'week', '2026-10-17')).toHaveLength(2)
  })
  it('Wilder RSI对持续上涨、下跌与横盘给出100、0、50', () => {
    expect(technicalSeries(bars(70)).at(-1)?.rsi).toBe(100)
    expect(technicalSeries(bars(70).map(b => ({ ...b, close: 300 - b.close }))).at(-1)?.rsi).toBe(0)
    const flat = technicalSeries(bars(70).map(b => ({ ...b, close: 100 }))).at(-1)!
    expect(flat.rsi).toBe(50)
    expect(flat.bandwidth).toBe(0)
    expect(flat.histogram).toBe(0)
  })
  it('BOLL使用总体标准差，MACD足够预热后才输出', () => {
    const data = technicalSeries(bars(70))
    expect(data[18].mid).toBeNull()
    expect(data[19].mid).toBe(109.5)
    expect(data[19].upper).toBeCloseTo(109.5 + 2 * Math.sqrt(33.25))
    expect(data[32].histogram).toBeNull()
    expect(data[33].histogram).not.toBeNull()
  })
  it('拒绝缺来源、过期、未来、越界、未填完整的人工数据', () => {
    const base = { date: '2026-10-16', source: 'https://www.csindex.com.cn/', values: { erpZ: 2 } }
    expect(assessManual('valuation', 'csi300', base, '2026-10-17').signal).toBe('bottom')
    for (const patch of [{ source: '' }, { date: '2026-08-01' }, { date: '2026-10-20' }, { values: { erpZ: NaN } }]) {
      expect(assessManual('valuation', 'csi300', { ...base, ...patch }, '2026-10-17').available).toBe(false)
    }
    expect(assessManual('breadth', 'hsi', { ...base, values: { breadth: 110, priorBreadth: 30 } }, '2026-10-17').available).toBe(false)
    expect(assessManual('funding', 'csi300', { ...base, values: { volumeRatio: 0.2 } }, '2026-10-17').available).toBe(false)
  })
  it('港股不用A股ERP和融资阈值；宽度风险需要指数新高证据', () => {
    const o = { date: '2026-10-16', source: 'https://www.hsi.com.hk/', values: { pePercentile: 5 } }
    expect(assessManual('valuation', 'hstech', o, '2026-10-17').signal).toBe('bottom')
    const width = { ...o, values: { breadth: 55, priorBreadth: 90 } }
    expect(assessManual('breadth', 'hsi', width, '2026-10-17', false).signal).toBe('neutral')
    expect(assessManual('breadth', 'hsi', width, '2026-10-17', true).signal).toBe('risk')
  })
  it('不足4维不会增加风险，破位可独立预警，冲突不凑票', () => {
    expect(summarize([ev('technical', 'positive'), ev('valuation', 'bottom')]).state).toBe('等待证据')
    expect(summarize([ev('technical', 'risk')]).state).toBe('趋势防守')
    expect(summarize([ev('technical', 'positive'), ev('valuation', 'bottom'), ev('funding', 'positive'), ev('breadth', 'positive')]).state).toBe('右侧修复候选')
    expect(summarize([ev('technical', 'positive'), ev('valuation', 'risk'), ev('funding', 'risk'), ev('breadth', 'positive')]).state).toBe('信号分歧')
  })
  it('宏观不跨2025口径，要求连续月份；海外过期或未来数据不计票', () => {
    const history: [string, number][] = [['2025-01-01', -6], ['2025-02-01', -5], ['2025-03-01', -4], ['2025-04-01', -3]]
    const series = { latest: { date: '2025-04-01', value: -3 }, history }
    expect(macroEvidence({ series: { m1m2: series } }, '2025-05-15').signal).toBe('positive')
    expect(macroEvidence({ series: { m1m2: { ...series, history: [['2024-12-01', -7], ...history.slice(1)] } } }, '2025-05-15').available).toBe(false)
    expect(macroEvidence({ series: { m1m2: series } }, '2025-10-17').available).toBe(false)
    const us = { series: { tenYear: { latest: { date: '2026-10-16', value: 3.8 }, history: [['2026-07-31', 4.2], ['2026-08-31', 4.1], ['2026-09-30', 4], ['2026-10-16', 3.8]] as [string, number][] }, vix: { latest: { date: '2026-10-16', value: 18 }, history: [] } } }
    expect(overseasEvidence(us, '2026-10-17').signal).toBe('positive')
    expect(overseasEvidence(us, '2026-10-15').available).toBe(false)
    expect(overseasEvidence(us, '2026-11-17').available).toBe(false)
  })
  it('页面展示的判定规则与 summarize 的状态一一对应', () => {
    const cases: Evidence[][] = [
      [ev('technical', 'risk')],
      [ev('technical', 'positive')],
      [ev('technical', 'neutral'), ev('valuation', 'bottom'), ev('funding', 'bottom'), ev('breadth', 'risk'), ev('macro', 'risk')],
      [ev('technical', 'neutral'), ev('valuation', 'risk'), ev('funding', 'risk'), ev('breadth', 'risk'), ev('macro', 'neutral')],
      [ev('technical', 'neutral'), ev('valuation', 'bottom'), ev('funding', 'bottom'), ev('breadth', 'bottom'), ev('macro', 'neutral')],
      [ev('technical', 'positive'), ev('valuation', 'bottom'), ev('funding', 'positive'), ev('breadth', 'positive'), ev('macro', 'neutral')],
      [ev('technical', 'positive'), ev('valuation', 'neutral'), ev('funding', 'neutral'), ev('breadth', 'neutral'), ev('macro', 'neutral')],
      [ev('technical', 'neutral'), ev('valuation', 'neutral'), ev('funding', 'neutral'), ev('breadth', 'neutral'), ev('macro', 'neutral')],
    ]
    expect(STATE_RULES.map(r => r.state)).toEqual(cases.map(rows => summarize(rows).state))
  })
})

describe('美股维度', () => {
  const asOf = '2026-11-13'
  const nfci = (values: number[]) => ({ series: { nfci: { latest: { date: '2026-11-06', value: values.at(-1)! }, history: values.map((v, i): [string, number] => [`2026-${String(8 + i).padStart(2, '0')}-0${i === 3 ? 6 : 1}`, v]) } } })
  it('NFCI 连续三次同向且累计≥0.1 才投票，微小抖动判中性', () => {
    expect(usLiquidityEvidence(nfci([-0.546, -0.509, -0.465, -0.462]), asOf).signal).toBe('neutral')
    expect(usLiquidityEvidence(nfci([-0.6, -0.5, -0.45, -0.4]), asOf).signal).toBe('risk')
    expect(usLiquidityEvidence(nfci([-0.3, -0.4, -0.45, -0.5]), asOf).signal).toBe('positive')
    expect(usLiquidityEvidence(null, asOf).signal).toBe('missing')
  })
  it('资金：杠杆极重判风险，出清判底部，放量收涨判偏多', () => {
    expect(usFundingSignal(1.0, 0.8, 1)).toBe('risk')
    expect(usFundingSignal(2.0, 95, -3)).toBe('bottom')
    expect(usFundingSignal(1.6, 50, 1.2)).toBe('positive')
    expect(usFundingSignal(1.6, 50, -1.2)).toBe('neutral')
  })
  it('资金证据由指数周成交量与 FINRA 长历史计算', () => {
    const bars = Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.parse('2025-09-06') + i * 7 * 864e5).toISOString().slice(0, 10), close: 100 + i, volume: i === 59 ? 300 : 100 }))
    const long = Array.from({ length: 200 }, (_, i): [string, number] => [`${2000 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-01`, 40 + i])
    const us = { series: { cashDebt: { latest: { date: '2026-09-01', value: 50 }, history: [], long } } }
    const e = usFundingEvidence(bars, us, asOf)
    expect(e.available).toBe(true)
    expect(e.values).toMatchObject({ volumeRatio: 3, cashPercentile: 5.5 })
    expect(e.signal).toBe('risk')
    expect(usFundingEvidence(bars, { series: {} }, asOf).pendingReason).toBe('保证金数据待更新')
  })
  it('美股缺宽度与估值时只计4维，海外维度改名为利率与波动', () => {
    const result = evaluate('spx', undefined, {}, null, null, asOf)
    expect(result.rows.map(r => r.name)).toEqual(['估值与赔率', '资金与杠杆', '市场宽度', '美国金融条件', '周 / 月技术', '利率与波动'])
  })
})
