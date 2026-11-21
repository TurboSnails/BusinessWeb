import type { DailySnapshot } from '../daily-analysis/types'

/** 指标里没有涨跌家数、但情绪面的涨跌统计已就绪时，用后者补上，避免明明有数据却不展示 */
export function metricsWithBreadth(s: DailySnapshot): DailySnapshot['metrics'] {
  const b = s.sentiment?.breadth
  if (s.metrics.upCount !== null || s.metrics.downCount !== null || !b || b.status !== 'ready') return s.metrics
  return { ...s.metrics, upCount: b.up, downCount: b.down }
}

export type Mood = '偏热' | '中性' | '偏冷' | '数据不足'

/**
 * A 股当日情绪的粗略分档，只描述当天，不是买卖信号。
 * 阈值是经验值：涨跌家数比优先；缺家数时用涨停 / 跌停对比。
 */
export function moodOf(m: DailySnapshot['metrics']): { mood: Mood; reason: string } {
  const { upCount: up, downCount: down, ztCount: zt, dtCount: dt } = m
  if (up !== null && down !== null && up + down > 0) {
    const share = up / (up + down)
    const pct = `${Math.round(share * 100)}%`
    if (share >= 0.7 && (zt ?? 0) >= 60) return { mood: '偏热', reason: `上涨家数占 ${pct}，涨停 ${zt} 家` }
    if (share <= 0.3 || (dt ?? 0) >= 30) return { mood: '偏冷', reason: `上涨家数仅占 ${pct}${dt !== null ? `，跌停 ${dt} 家` : ''}` }
    return { mood: '中性', reason: `上涨家数占 ${pct}` }
  }
  if (zt !== null && dt !== null) {
    if (zt >= 80 && dt <= 10) return { mood: '偏热', reason: `涨停 ${zt} 家、跌停 ${dt} 家` }
    if (dt >= 30 || zt <= dt) return { mood: '偏冷', reason: `涨停 ${zt} 家、跌停 ${dt} 家` }
    return { mood: '中性', reason: `涨停 ${zt} 家、跌停 ${dt} 家` }
  }
  return { mood: '数据不足', reason: '缺少涨跌家数与涨跌停数据' }
}

/** 全球市场看板要展示的指数（腾讯行情代码，经同源 /api/grid-market 取）。商品、汇率、美债已在宏观读数里，不重复 */
export const MARKET_GROUPS: Array<{ id: 'us' | 'cn' | 'hk'; title: string; items: Array<{ symbol: string; name: string }>; redUp: boolean }> = [
  { id: 'us', title: '美股', items: [{ symbol: 'usINX', name: '标普500' }, { symbol: 'usNDX', name: '纳斯达克100' }, { symbol: 'usDJI', name: '道琼斯' }], redUp: false },
  { id: 'cn', title: 'A股', items: [{ symbol: 'sh000001', name: '上证指数' }, { symbol: 'sh000300', name: '沪深300' }, { symbol: 'sz399001', name: '深证成指' }, { symbol: 'sz399006', name: '创业板指' }], redUp: true },
  { id: 'hk', title: '港股', items: [{ symbol: 'r_hkHSI', name: '恒生指数' }, { symbol: 'r_hkHSTECH', name: '恒生科技' }, { symbol: 'r_hkHSCEI', name: '恒生国企' }], redUp: true },
]

/** quoteTime：行情时间（交易所当地时间，YYYY-MM-DD HH:mm），休市时为最后交易时刻 */
export interface QuoteRow { symbol: string; name: string; price: number; changePercent: number; quoteTime?: string }
export interface QuoteCache { at: string; rows: QuoteRow[] }
const CACHE_KEY = 'watch-quotes'

/** 每组最后一次成功取到的行情：接口失败时显示它，并标出缓存时间 */
export function readQuoteCache(): Record<string, QuoteCache> {
  try {
    const body: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, QuoteCache> : {}
  } catch { return {} }
}

export function writeQuoteCache(next: Record<string, QuoteCache>): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)) } catch { /* 隐私模式下忽略 */ }
}
