import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  classifyInsiderText,
  parseEarningsData,
  parseInsiderData,
  parseOptionsData,
  parseShortInterest,
  yahooDate,
  yahooNum,
  // @ts-ignore 未带类型声明的服务端模块（与 src/services/marketApi.test.ts 同做法）
} from '../../../server/stockLookup.mjs'
import { __test } from './api'

/** 固定样本：2026-11-28 从 Yahoo 抓取后裁剪，不联网 */
const load = (name: string): unknown => JSON.parse(readFileSync(resolve('src/features/stock-lookup/fixtures', name), 'utf8'))
const NOW = Date.parse('2026-11-28T12:00:00Z')

describe('服务端：Yahoo 字段工具', () => {
  it('数值与日期', () => {
    expect(yahooNum({ raw: 12, fmt: '12' })).toBe(12)
    expect(yahooNum({})).toBeUndefined()
    expect(yahooNum(null)).toBeUndefined()
    expect(yahooDate({ raw: 1795046400, fmt: '2026-11-19' })).toBe('2026-11-19')
    // 美东 16:00 盘后财报，UTC 已是次日也要落在美东当天
    expect(yahooDate({ raw: 1794949200 }, 'America/New_York')).toBe('2026-11-17')
  })

  it('内部人交易描述分类', () => {
    expect(classifyInsiderText('Sale at price 146.03 - 157.49 per share.')).toBe('sell')
    expect(classifyInsiderText('Purchase at price 256.31 per share.')).toBe('buy')
    expect(classifyInsiderText('Conversion of Exercise of derivative security at price 23.34 per share.')).toBe('exercise')
    expect(classifyInsiderText('Stock Award(Grant) at price 0.00 per share.')).toBe('award')
    expect(classifyInsiderText('Stock Gift at price 0.00 per share.')).toBe('gift')
    expect(classifyInsiderText('')).toBe('other')
  })
})

describe('服务端：lookup-insider 解析（TSLA 样本）', () => {
  const data = parseInsiderData('TSLA', load('yahoo-quoteSummary-insider-TSLA.json'), NOW)

  it('只留近 12 个月，按日期倒序，价格区间与持有方式', () => {
    expect(data.transactions.every((t: { date: string }) => t.date >= '2025-11-28')).toBe(true)
    expect(data.transactions.map((t: { date: string }) => t.date)).toEqual(
      [...data.transactions.map((t: { date: string }) => t.date)].sort().reverse(),
    )
    const sale = data.transactions.find((t: { date: string; type: string }) => t.date === '2026-09-08')
    expect(sale).toMatchObject({ type: 'sell', shares: 2605, priceLow: 360.13, priceHigh: 360.13 })
    const types = new Set(data.transactions.map((t: { type: string }) => t.type))
    expect(types).toEqual(new Set(['sell', 'other', 'exercise', 'gift']))
  })

  it('近 6 个月只数公开市场买卖', () => {
    expect(data.summary.since).toBe('2026-05-30')
    expect(data.summary.buyCount).toBe(0)
    expect(data.summary.sellCount).toBe(2)
    expect(data.summary.sellShares).toBe(2605 * 2)
    expect(data.summary.netShares).toBe(-5210)
    expect(data.reported?.netShares).toBeTypeOf('number')
    expect(data.holders.length).toBe(3)
  })

  it('换个时点能数到买入', () => {
    const early = parseInsiderData('TSLA', load('yahoo-quoteSummary-insider-TSLA.json'), Date.parse('2025-12-31T00:00:00Z'))
    expect(early.summary.buyCount).toBe(1)
    expect(early.summary.buyShares).toBe(2568732)
    expect(early.summary.buyValue).toBeGreaterThan(0)
  })

  it('经前端校验后字段不丢', () => {
    const parsed = __test.parseInsider(JSON.parse(JSON.stringify(data)))
    expect(parsed.transactions.length).toBe(data.transactions.length)
    expect(parsed.summary.netShares).toBe(-5210)
  })
})

describe('服务端：lookup-short 解析（SOUN 样本）', () => {
  it('空头股数、比例、回补天数与日期', () => {
    const d = parseShortInterest('SOUN', load('yahoo-quoteSummary-short-SOUN.json'))
    expect(d).toMatchObject({
      sharesShort: 159086108,
      sharesShortPrior: 170799103,
      settleDate: '2026-11-13',
      priorSettleDate: '2026-10-15',
      daysToCover: 9.06,
    })
    expect(d.pctFloat).toBeCloseTo(0.3518, 4)
    expect(__test.parseShortInterest(d).pctFloat).toBeCloseTo(0.3518, 4)
  })

  it('空模块不报错，只剩代码与出处', () => {
    const d = parseShortInterest('ZZZ', {})
    expect(Object.keys(d).sort()).toEqual(['source', 'symbol'])
  })
})

describe('服务端：lookup-earnings 解析（NVDA 样本）', () => {
  const d = parseEarningsData('NVDA', load('yahoo-quoteSummary-earnings-NVDA.json'))

  it('财报日与四期一致预期', () => {
    expect(d.nextEarnings).toEqual({ dates: ['2026-11-17'], estimated: false })
    expect(d.estimates.map((e: { period: string }) => e.period)).toEqual(['0q', '+1q', '0y', '+1y'])
    const q = d.estimates[0]
    expect(q.eps).toMatchObject({ avg: 2.87956, low: 2.8, high: 3.11, analysts: 41 })
    expect(q.revenue.analysts).toBe(40)
    expect(q.epsTrend).toMatchObject({ current: 2.87956, d7: 2.7613, d30: 2.74622, d60: 2.74295, d90: 2.70696 })
    expect(q.revisions).toMatchObject({ up30: 0, down30: 1 })
  })

  it('最近 4 季实际 vs 预期，补上公布日、财季与营收', () => {
    expect(d.history).toHaveLength(4)
    const last = d.history[3]
    expect(last).toMatchObject({ periodEnd: '2026-10-31', reported: '2026-11-17', fiscalQuarter: '3Q2027', epsActual: 2.68, revenueActual: 115844000000 })
    expect(last.surprisePct).toBeCloseTo(8.36, 1)
    expect(__test.parseEarnings(JSON.parse(JSON.stringify(d))).history[3].fiscalQuarter).toBe('3Q2027')
  })

  it('负值预期的惊喜幅度按绝对值算', () => {
    const neg = parseEarningsData('X', {
      earningsHistory: { history: [{ quarter: { raw: 1782777600, fmt: '2026-06-30' }, epsActual: { raw: -0.02 }, epsEstimate: { raw: -0.054 } }] },
    })
    expect(neg.history[0].surprisePct).toBeCloseTo(62.96, 1)
  })
})

describe('服务端：lookup-options 解析（MRVL 样本）', () => {
  const d = parseOptionsData('MRVL', load('yahoo-options-MRVL.json'))

  it('到期日、汇总与前 10', () => {
    expect(d.expirations[0]).toBe('2026-12-04')
    expect(d.expiration).toBe('2026-12-04')
    expect(d.top.length).toBeLessThanOrEqual(10)
    const vols = d.top.map((c: { volume: number }) => c.volume)
    expect(vols).toEqual([...vols].sort((a, b) => b - a))
    expect(d.calls.volume).toBeGreaterThan(0)
    expect(d.underlyingPrice).toBe(140.54)
  })

  it('占位隐含波动率不展示，缺成交量按 0', () => {
    const all = parseOptionsData('MRVL', load('yahoo-options-MRVL.json'), 100).top
    expect(all.every((c: { iv?: number }) => c.iv == null || c.iv > 0.01)).toBe(true)
    const synthetic = parseOptionsData('X', { optionChain: { result: [{
      expirationDates: [1796342400],
      options: [{
        expirationDate: 1796342400,
        calls: [{ contractSymbol: 'X1', strike: 10, volume: 5, openInterest: 0, lastPrice: 1, impliedVolatility: 0.00001 }],
        puts: [{ contractSymbol: 'X2', strike: 10, openInterest: 3, lastPrice: 1, impliedVolatility: 0.5 }],
      }],
    }] } })
    expect(synthetic.top).toHaveLength(1)
    expect(synthetic.top[0].iv).toBeUndefined()
    expect(synthetic.puts).toEqual({ count: 1, volume: 0, openInterest: 3 })
    expect(d.calls.count + d.puts.count).toBeGreaterThan(d.top.length)
    expect(__test.parseOptions(JSON.parse(JSON.stringify(d))).top.length).toBe(d.top.length)
  })

  it('没有期权链 → 空到期日列表', () => {
    const empty = parseOptionsData('ZZZ', { optionChain: { result: [], error: null } })
    expect(empty.expirations).toEqual([])
    expect(empty.top).toEqual([])
  })
})
