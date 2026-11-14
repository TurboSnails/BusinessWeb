// 公司页走势图的「研究代码 → 图表数据源」契约（见 .dev-team/runs/openstock-eval/reports/arch.md §3）。
// - 美股 / ADR / 纳指：TradingView 官方 Advanced Chart（延迟行情）。交易所取自 usExchanges.json
//   （yfinance 原始返回的 exchange 字段，scripts/build-us-exchanges.mjs 生成），不按 us/adr/ndx 分组猜 NASDAQ；
//   查不到时用不带前缀的代码，交给 TradingView 自行解析，并标记 exchange=null。
// - 沪深：一期不用 TradingView，改为站内自绘日/周线（腾讯前复权日线，/api/grid-market?kind=candles）。
//   cnTradingViewSymbol 只用来生成「在 TradingView 查看」外链，不用于嵌入。
// - 北交所（8xxxxx / 4xxxxx / 92xxxx）：腾讯 candles 接口与 TradingView 免费 widget 都不覆盖 → 不出图。
// - 港股：HKEX 不在 TradingView 免费 widget 范围 → 不出图，只给港交所报价页外链。
import type { Market } from '../../data/companies'
import usExchanges from './usExchanges.json'

export type UsExchange = 'NASDAQ' | 'NYSE' | 'AMEX'
export type CnExchange = 'SSE' | 'SZSE' | 'BSE'

export type ChartTarget =
  | { kind: 'tradingview'; tvSymbol: string; exchange: UsExchange | null; dataMode: 'delayed'; externalUrl: string }
  | { kind: 'cn'; tencentSymbol: string; exchange: 'SSE' | 'SZSE'; dataMode: 'eod'; externalUrl: string }
  | { kind: 'none'; reason: 'hk' | 'bse' | 'invalid'; externalUrl?: string }

const EXCHANGES = (usExchanges as { exchanges: Record<string, string> }).exchanges

/** 美股代码的上市交易所；未知时返回 null（不猜） */
export function usExchangeOf(code: string): UsExchange | null {
  const ex = EXCHANGES[code.trim().toUpperCase()]
  return ex === 'NASDAQ' || ex === 'NYSE' || ex === 'AMEX' ? ex : null
}

/** 美股 TradingView 符号：NASDAQ:AAPL / NYSE:BRK.B；交易所未知时只给代码（TradingView 自动解析） */
export function usTradingViewSymbol(code: string): string | null {
  const c = code.trim().toUpperCase()
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(c)) return null
  const ex = usExchangeOf(c)
  return ex ? `${ex}:${c}` : c
}

/** A 股交易所：6/9 开头上交所，0/2/3 开头深交所，4/8/92 开头北交所 */
export function cnExchangeOf(code: string): CnExchange | null {
  const c = code.trim()
  if (!/^\d{6}$/.test(c)) return null
  if (/^(92|8|4)/.test(c)) return 'BSE'
  if (/^[69]/.test(c)) return 'SSE'
  if (/^[023]/.test(c)) return 'SZSE'
  return null
}

/** 仅用于外链：SSE:600519 / SZSE:000001；北交所返回 null */
export function cnTradingViewSymbol(code: string): string | null {
  const ex = cnExchangeOf(code)
  return ex === 'SSE' || ex === 'SZSE' ? `${ex}:${code.trim()}` : null
}

/** 腾讯行情代码：sh600519 / sz000001；北交所不支持 */
export function cnTencentSymbol(code: string): string | null {
  const ex = cnExchangeOf(code)
  return ex === 'SSE' ? `sh${code.trim()}` : ex === 'SZSE' ? `sz${code.trim()}` : null
}

/** TradingView 公开的品种页（沿用 src/services/api.ts 的 symbols URL 格式） */
export function tradingViewSymbolUrl(tvSymbol: string): string {
  return `https://www.tradingview.com/symbols/${encodeURIComponent(tvSymbol.replace(':', '-'))}/`
}

/** 港交所个股报价页：代码去掉前导零 */
export function hkexQuoteUrl(code: string): string | null {
  const c = code.trim()
  if (!/^\d{1,5}$/.test(c)) return null
  return `https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=${Number(c)}&sc_lang=zh-HK`
}

export function chartTargetOf(market: Market, code: string): ChartTarget {
  if (market === 'hk') {
    const url = hkexQuoteUrl(code)
    return url ? { kind: 'none', reason: 'hk', externalUrl: url } : { kind: 'none', reason: 'invalid' }
  }
  if (market === 'cn') {
    const ex = cnExchangeOf(code)
    if (ex === 'BSE') return { kind: 'none', reason: 'bse' }
    const tencentSymbol = cnTencentSymbol(code)
    const tv = cnTradingViewSymbol(code)
    if (!tencentSymbol || !tv || (ex !== 'SSE' && ex !== 'SZSE')) return { kind: 'none', reason: 'invalid' }
    return { kind: 'cn', tencentSymbol, exchange: ex, dataMode: 'eod', externalUrl: tradingViewSymbolUrl(tv) }
  }
  const tvSymbol = usTradingViewSymbol(code)
  if (!tvSymbol) return { kind: 'none', reason: 'invalid' }
  return { kind: 'tradingview', tvSymbol, exchange: usExchangeOf(code), dataMode: 'delayed', externalUrl: tradingViewSymbolUrl(tvSymbol) }
}
