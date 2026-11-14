import { describe, expect, it } from 'vitest'
import type { HistoryCandle } from '../../components/pulse/chinaHistory'
import { aggregateCandles } from '../../components/pulse/chinaHistory'
import { chartLevels, chartSummary, isRedUp, movingAverage, toCandleData, toVolumeData, withAlpha } from './lwModel'
import { candlesUrl, parseCandleRows, parseCandlesPayload } from './candles'
import type { PriceLevelsInput } from './levelsModel'

const bar = (date: string, close: number, open = close - 1): HistoryCandle => ({ date, open, close, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1, volume: 100 })

describe('数据映射', () => {
  const rows = [bar('2026-11-10', 10, 11), bar('2026-11-11', 12), bar('2026-11-12', 14)]
  it('K 线与成交量：日期作 time，成交量按涨跌着色', () => {
    expect(toCandleData(rows)[0]).toEqual({ time: '2026-11-10', open: 11, high: 12, low: 9, close: 10 })
    expect(toVolumeData(rows, 'R', 'F').map(v => v.color)).toEqual(['F', 'R', 'R'])
  })
  it('MA：不足 n 根不出点，之后为收盘均值', () => {
    expect(movingAverage(rows, 2)).toEqual([{ time: '2026-11-11', value: 11 }, { time: '2026-11-12', value: 13 }])
    expect(movingAverage(rows, 5)).toEqual([])
  })
  it('周线按自然周聚合，日期取本周最后交易日', () => {
    const w = aggregateCandles([bar('2026-11-09', 10), bar('2026-11-13', 12), bar('2026-11-16', 13)], 'week')
    expect(w.map(r => r.date)).toEqual(['2026-11-13', '2026-11-16'])
  })
  it('涨跌色：沪深/港股红涨，美股绿涨', () => {
    expect(isRedUp('cn')).toBe(true); expect(isRedUp('hk')).toBe(true)
    expect(isRedUp('us')).toBe(false); expect(isRedUp('adr')).toBe(false); expect(isRedUp('ndx')).toBe(false)
  })
  it('文字摘要包含最低/最高/最新收盘与日期', () => {
    expect(chartSummary(rows, 'day', 'HKD')).toBe('近 3 个交易日最低 9.00 港元、最高 15.00 港元，最新收盘 14.00 港元（2026-11-12）')
    expect(chartSummary([], 'day', 'CNY')).toBe('')
  })
  it('withAlpha', () => {
    expect(withAlpha('#C4503F', 0.5)).toBe('rgba(196, 80, 63, 0.5)')
    expect(withAlpha('rgb(63, 154, 98)', 0.45)).toBe('rgba(63, 154, 98, 0.45)')
    expect(withAlpha('var(--x)', 0.5)).toBe('var(--x)')
  })
})

describe('研究价位线选择（沿用 levelsModel 的守卫，并用图表最新收盘复核）', () => {
  const base: PriceLevelsInput = {
    market: 'us',
    anchor: { price: 100, currency: 'USD', date: '2026-11-13' },
    scenarios: [{ name: '悲观', price: '$70' }, { name: '基准', price: '$120' }, { name: '乐观', price: '$200' }],
    dcf: { status: 'ok', source: 'auto', currency: 'USD', price: 110, buyBelow: 80, mos: null },
  }
  it('可比较的价位全部画出，带简称', () => {
    const m = chartLevels(base, 'USD', 101)
    expect(m.drawn.map(l => [l.key, l.short, l.value])).toEqual([['bear', '悲观', 70], ['dcf-buy', 'DCF 买入', 80], ['dcf-fair', 'DCF 合理', 110], ['base', '基准', 120], ['bull', '乐观', 200]])
    expect(m.notDrawn).toEqual([])
    expect(m.drawn.every(l => l.inAutoscale)).toBe(true)
  })
  it('币种不同不画', () => {
    const m = chartLevels({ ...base, dcf: { ...base.dcf!, currency: 'CNY' } }, 'USD', 101)
    expect(m.drawn.some(l => l.key.startsWith('dcf'))).toBe(false)
    expect(m.notDrawn.find(l => l.key === 'dcf-fair')!.reason).toContain('币种不同')
  })
  it('与价格锚点相差 10 倍以上不画', () => {
    const m = chartLevels({ ...base, scenarios: [{ name: '乐观', price: '$5000' }] }, 'USD', 101)
    expect(m.drawn.find(l => l.key === 'bull')).toBeUndefined()
    expect(m.notDrawn.find(l => l.key === 'bull')!.reason).toContain('10 倍')
  })
  it('价格锚点过期：用走势图最新收盘复核，相差 10 倍以上的不画', () => {
    // 锚点 100 已过期（如拆股前），走势图最新收盘 10：基准 120 / DCF 合理 110 相对 10 超过 10 倍 → 不画
    const stale: PriceLevelsInput = { ...base, anchor: { ...base.anchor, stale: true, days: 400 } }
    const m = chartLevels(stale, 'USD', 10)
    expect(m.anchorStale).toBe(true)
    expect(m.drawn.map(l => l.key)).toEqual(['bear', 'dcf-buy'])
    expect(m.notDrawn.map(l => l.key).sort()).toEqual(['base', 'bull', 'dcf-fair'])
    expect(m.notDrawn[0].reason).toContain('走势图最新收盘')
  })
  it('缺价格锚点时也要复核；走势图币种与价位币种不符不画', () => {
    const noAnchor: PriceLevelsInput = { market: 'hk', anchor: {}, scenarios: [{ name: '基准', price: 'HK$450' }, { name: '乐观', price: '600 元' }] }
    const m = chartLevels(noAnchor, 'HKD', 390)
    expect(m.drawn.map(l => l.key)).toEqual(['base'])
    expect(m.notDrawn[0]).toMatchObject({ key: 'bull' })
  })
  it('没有走势图收盘价时一条也不画', () => {
    expect(chartLevels(base, 'USD', undefined).drawn).toEqual([])
  })
  it('超出最新收盘 1/3–3 倍的线仍画，但不撑大纵轴', () => {
    const m = chartLevels({ ...base, anchor: { price: 50, currency: 'USD' } }, 'USD', 50)
    expect(m.drawn.find(l => l.key === 'bull')).toMatchObject({ inAutoscale: false })
  })
})

describe('日线数据解析', () => {
  it('candlesUrl：近三年，symbol 原样', () => {
    expect(candlesUrl('hk00700', new Date('2026-11-14T08:00:00Z'))).toBe('/api/grid-market?kind=candles&symbol=hk00700&begin=2023-11-14&end=2026-11-14')
    expect(candlesUrl('usBRK.B', new Date('2026-11-14T08:00:00Z'))).toContain('symbol=usBRK.B')
  })
  it('沪深 qfqday → 前复权；港股 day（带第 7 列对象）→ 未复权；Yahoo → 拆股调整', () => {
    const cn = parseCandlesPayload({ data: { sh600519: { qfqday: [['2026-11-13', '1400', '1410', '1420', '1390', '5000']] } } }, 'sh600519')
    expect(cn).toMatchObject({ source: 'tencent', adjustment: 'qfq', dropped: 0 })
    expect(cn.rows[0]).toMatchObject({ date: '2026-11-13', open: 1400, close: 1410, high: 1420, low: 1390, volume: 5000 })
    const hk = parseCandlesPayload({ data: { hk00700: { day: [['2026-10-02', '422.000', '421.200', '425.000', '419.800', '19108045.000', { cqr: '2026-10-02' }]], qt: {} } } }, 'hk00700')
    expect(hk).toMatchObject({ source: 'tencent', adjustment: 'none' })
    expect(hk.rows[0].close).toBe(421.2)
    const us = parseCandlesPayload({ source: 'yahoo', data: { usAAPL: { day: [['2026-11-13', 357.96, 356.27, 360.83, 355.75, 39985300]] } } }, 'usAAPL')
    expect(us).toMatchObject({ source: 'yahoo', adjustment: 'split' })
    expect(us.rows[0].volume).toBe(39985300)
  })
  it('坏行丢弃而不是整张图失败；空数据返回空数组', () => {
    const r = parseCandleRows([['2026-11-12', '10', '11', '12', '9', '1'], ['2026-11-13', '10', '11', '10.5', '9', '1'], ['bad']])
    expect(r.rows.length).toBe(1); expect(r.dropped).toBe(2)
    expect(parseCandlesPayload({ data: {} }, 'hk00700').rows).toEqual([])
  })
})
