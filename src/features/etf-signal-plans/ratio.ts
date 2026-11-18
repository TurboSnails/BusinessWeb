export const R2_CODES = { growth: '159915', defensive: '510880' } as const
/** 沪深300 指数用腾讯 symbol sh000300；红利仍用 ETF（bars 后复权）。 */
export const H1_CODES = { growth: 'sh000300', defensive: '510880' } as const
export const RATIO_MA = 20

export type RatioPoint = { date: string; ratio: number; ma: number | null; bull: boolean | null }

export function styleRatio(
  growth: { date: string; close: number }[],
  defensive: { date: string; close: number }[],
  n = RATIO_MA,
): RatioPoint[] {
  const other = new Map(defensive.map(bar => [bar.date, bar.close]))
  const ratios = growth
    .filter(bar => other.has(bar.date) && bar.close > 0 && other.get(bar.date)! > 0)
    .map(bar => ({ date: bar.date, ratio: bar.close / other.get(bar.date)! }))
    .sort((a, b) => a.date.localeCompare(b.date))
  let sum = 0
  return ratios.map((point, i) => {
    sum += point.ratio
    if (i >= n) sum -= ratios[i - n].ratio
    const ma = i >= n - 1 ? sum / n : null
    return { ...point, ma, bull: ma === null ? null : point.ratio > ma }
  })
}
