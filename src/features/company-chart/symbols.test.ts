import { describe, expect, it } from 'vitest'
import { chartTargetOf, cnExchangeOf, cnTencentSymbol, cnTradingViewSymbol, hkexQuoteUrl, usExchangeOf, usTradingViewSymbol } from './symbols'

describe('美股交易所映射（来自数据，不按分组猜）', () => {
  it('us：NASDAQ 与 NYSE 按记录区分', () => {
    expect(chartTargetOf('us', 'AAPL')).toMatchObject({ kind: 'tradingview', tvSymbol: 'NASDAQ:AAPL', exchange: 'NASDAQ', dataMode: 'delayed' })
    expect(chartTargetOf('us', 'KO')).toMatchObject({ kind: 'tradingview', tvSymbol: 'NYSE:KO', exchange: 'NYSE' })
  })
  it('类股代码保留点号', () => {
    expect(usTradingViewSymbol('BRK.B')).toBe('NYSE:BRK.B')
    expect(chartTargetOf('us', 'BRK.B')).toMatchObject({ externalUrl: 'https://www.tradingview.com/symbols/NYSE-BRK.B/' })
  })
  it('adr：TSM 在 NYSE、ASML 在 NASDAQ（不能因为是 ADR 就猜）', () => {
    expect(chartTargetOf('adr', 'TSM')).toMatchObject({ tvSymbol: 'NYSE:TSM' })
    expect(chartTargetOf('adr', 'ASML')).toMatchObject({ tvSymbol: 'NASDAQ:ASML' })
  })
  it('ndx：走同一张交易所表', () => {
    expect(chartTargetOf('ndx', 'MSFT')).toMatchObject({ tvSymbol: 'NASDAQ:MSFT', exchange: 'NASDAQ' })
  })
  it('交易所未知时只给代码、exchange 为 null（TradingView 自动解析）', () => {
    expect(usExchangeOf('CBOE')).toBeNull()
    expect(chartTargetOf('us', 'CBOE')).toMatchObject({ kind: 'tradingview', tvSymbol: 'CBOE', exchange: null })
    expect(chartTargetOf('us', 'ZZZZ')).toMatchObject({ tvSymbol: 'ZZZZ', exchange: null })
  })
  it('非法代码不出图', () => {
    expect(chartTargetOf('us', 'AAPL<script>')).toEqual({ kind: 'none', reason: 'invalid' })
    expect(usTradingViewSymbol('aapl ')).toBe('NASDAQ:AAPL')
  })
})

describe('沪深 / 北交所', () => {
  it('上交所（主板、科创板）走自绘图，腾讯代码 sh', () => {
    expect(chartTargetOf('cn', '600519')).toMatchObject({ kind: 'cn', tencentSymbol: 'sh600519', exchange: 'SSE', dataMode: 'eod' })
    expect(cnTencentSymbol('688981')).toBe('sh688981')
    expect(cnTradingViewSymbol('600519')).toBe('SSE:600519')
  })
  it('深交所（主板、创业板）腾讯代码 sz', () => {
    expect(chartTargetOf('cn', '000001')).toMatchObject({ kind: 'cn', tencentSymbol: 'sz000001', exchange: 'SZSE' })
    expect(chartTargetOf('cn', '300750')).toMatchObject({ tencentSymbol: 'sz300750', externalUrl: 'https://www.tradingview.com/symbols/SZSE-300750/' })
  })
  it('北交所 8xxxxx / 4xxxxx / 920xxx 不出图', () => {
    for (const code of ['830799', '430047', '920001']) {
      expect(cnExchangeOf(code)).toBe('BSE')
      expect(chartTargetOf('cn', code)).toEqual({ kind: 'none', reason: 'bse' })
      expect(cnTencentSymbol(code)).toBeNull()
      expect(cnTradingViewSymbol(code)).toBeNull()
    }
  })
  it('非六位代码无效', () => {
    expect(chartTargetOf('cn', '60051')).toEqual({ kind: 'none', reason: 'invalid' })
  })
})

describe('港股', () => {
  it('不出图，只给港交所报价页外链（去前导零）', () => {
    expect(chartTargetOf('hk', '00700')).toEqual({ kind: 'none', reason: 'hk', externalUrl: 'https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=700&sc_lang=zh-HK' })
    expect(hkexQuoteUrl('9988')).toContain('sym=9988')
    expect(chartTargetOf('hk', 'abc')).toEqual({ kind: 'none', reason: 'invalid' })
  })
})
