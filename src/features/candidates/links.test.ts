import { describe, expect, it } from 'vitest'
import { dcfLink, gridLink, gridSupported, researchToCandidate, toolProgress, valuationLink, venueOf, type ToolSources } from './links'
import { dcfLinkFromValuationQuery } from '../dcf/prefill'

const lists = { us: new Set(['NVDA', 'AAPL']), ndx: new Set(['PDD']), adr: new Set(['TSM']) }

describe('researchToCandidate', () => {
  it('A 股 6 位代码 → cn', () => {
    expect(researchToCandidate({ key: '中国:688256', code: '688256' }, lists)).toEqual({ market: 'cn', code: '688256' })
  })
  it('港股补齐 5 位，带第二上市地时取第一个', () => {
    expect(researchToCandidate({ key: '中国:0700.HK', code: '0700.HK' }, lists)).toEqual({ market: 'hk', code: '00700' })
    expect(researchToCandidate({ key: '中国:9988.HK', code: '9988.HK / BABA' }, lists)).toEqual({ market: 'hk', code: '09988' })
  })
  it('A+H 两地上市取 A 股代码', () => {
    expect(researchToCandidate({ key: '中国:688981', code: '688981 / 0981.HK' }, lists)).toEqual({ market: 'cn', code: '688981' })
  })
  it('美股按公司库分到标普、纳指、非标普', () => {
    expect(researchToCandidate({ key: '海外:NVDA', code: 'NVDA' }, lists)).toEqual({ market: 'us', code: 'NVDA' })
    expect(researchToCandidate({ key: '海外:PDD', code: 'PDD' }, lists)).toEqual({ market: 'ndx', code: 'PDD' })
    expect(researchToCandidate({ key: '海外:CBRS', code: 'CBRS' }, lists)).toEqual({ market: 'adr', code: 'CBRS' })
    expect(researchToCandidate({ key: '海外:BRK.B', code: 'BRK.B' }, lists)).toEqual({ market: 'adr', code: 'BRK.B' })
  })
  it('台股、韩股、欧股和非上市主体不支持', () => {
    expect(researchToCandidate({ key: '中国:2454.TW', code: '2454.TW' }, lists)).toBeNull()
    expect(researchToCandidate({ key: '海外:000660.KS', code: '000660.KS' }, lists)).toBeNull()
    expect(researchToCandidate({ key: '海外:SU.PA', code: 'SU.PA' }, lists)).toBeNull()
    expect(researchToCandidate({ key: '非上市:x', code: '上市状态待核' }, lists)).toBeNull()
  })
})

describe('工具链接', () => {
  it('估值工作台按交易地带市场与代码', () => {
    expect(valuationLink('ndx', 'PDD')).toBe('/valuation?market=us&code=PDD')
    expect(valuationLink('hk', '00700')).toBe('/valuation?market=hk&code=00700')
    expect(venueOf('adr')).toBe('us')
  })
  it('DCF 带公司名、市场与币种', () => {
    const url = new URL(`http://x${dcfLink('cn', '600519', '贵州茅台')}`)
    expect(url.pathname).toBe('/dcf')
    expect(Object.fromEntries(url.searchParams)).toEqual({ company: '贵州茅台', code: '600519', market: 'cn', currency: 'CNY' })
  })
  it('网格只支持沪深 6 位代码', () => {
    expect(gridSupported('cn', '510300')).toBe(true)
    expect(gridSupported('hk', '00700')).toBe(false)
    expect(gridSupported('us', 'AAPL')).toBe(false)
    expect(gridLink('cn', '510300', '沪深300ETF')).toBe('/grid-trading?code=510300&name=%E6%B2%AA%E6%B7%B1300ETF')
    expect(gridLink('us', 'AAPL', '苹果')).toBeNull()
  })
})

describe('toolProgress', () => {
  const sources = {
    dcf: [
      { market: 'cn', code: '600519', savedAt: '2026-10-01T00:00:00Z', input: { currency: 'CNY' }, result: { price: 1500, mos: 0.12 } },
      { market: 'cn', code: '600519', savedAt: '2026-10-05T00:00:00Z', input: { currency: 'CNY' }, result: { price: 1600, mos: -0.05 } },
      { market: 'hk', code: '0700', savedAt: '2026-10-03T00:00:00Z', input: { currency: 'HKD' }, result: { price: 500, mos: 0.2 } },
    ],
    valuation: [{
      createdAt: '2026-10-06T00:00:00Z',
      snapshot: { security: { market: 'us', code: 'AAPL', quoteCurrency: 'USD' } },
      results: { base: { pe: { status: 'calculated', price: 210 }, dcf: { status: 'calculated', price: 260 }, pb: { status: 'notApplicable', price: null } } },
    }],
    grid: [
      { id: 'g1', savedAt: '2026-10-01T00:00:00Z', row: { code: '510300' }, result: { pnl: 120 } },
      { id: 'g2', savedAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z', row: { code: '510300' }, result: { pnl: 300 } },
    ],
  } as unknown as ToolSources

  it('DCF 取最近一次', () => {
    expect(toolProgress('cn', '600519', sources).dcf).toEqual({ price: 1600, mos: -0.05, currency: 'CNY', savedAt: '2026-10-05T00:00:00Z' })
  })
  it('港股代码位数不同也能对上', () => {
    expect(toolProgress('hk', '00700', sources).dcf?.price).toBe(500)
  })
  it('估值报告取基准情景已算出的价格区间；标普/纳指都按美股对比', () => {
    expect(toolProgress('us', 'AAPL', sources).valuation).toEqual({ low: 210, high: 260, currency: 'USD', createdAt: '2026-10-06T00:00:00Z' })
    expect(toolProgress('ndx', 'aapl', sources).valuation?.high).toBe(260)
  })
  it('网格取最近更新的一条，只看 A 股', () => {
    expect(toolProgress('cn', '510300', sources).grid).toEqual({ id: 'g2', pnl: 300, savedAt: '2026-10-08T00:00:00Z' })
    expect(toolProgress('us', '510300', sources).grid).toBeUndefined()
  })
  it('没有记录返回空对象', () => {
    expect(toolProgress('cn', '000001', sources)).toEqual({})
  })
})

describe('dcfLinkFromValuationQuery', () => {
  const qs = (url: string) => Object.fromEntries(new URL(`http://x${url}`).searchParams)
  it('已选定公司时用它的身份', () => {
    expect(qs(dcfLinkFromValuationQuery('腾讯', { market: 'hk', code: '00700', name: '腾讯控股' }))).toEqual({ market: 'hk', currency: 'HKD', code: '00700', company: '腾讯控股' })
  })
  it('带市场前缀的输入', () => {
    expect(qs(dcfLinkFromValuationQuery('us:AAPL'))).toEqual({ market: 'us', currency: 'USD', code: 'AAPL' })
  })
  it('按代码形态猜市场；中文名当公司名', () => {
    expect(qs(dcfLinkFromValuationQuery('600519'))).toMatchObject({ market: 'cn', code: '600519' })
    expect(qs(dcfLinkFromValuationQuery('700'))).toMatchObject({ market: 'hk', currency: 'HKD' })
    expect(qs(dcfLinkFromValuationQuery('贵州茅台'))).toEqual({ market: 'cn', currency: 'CNY', company: '贵州茅台' })
  })
  it('空输入直接去 DCF', () => {
    expect(dcfLinkFromValuationQuery('  ')).toBe('/dcf')
  })
})
