// Pure calculations: percentages are percentage points; turnover is 100M CNY.
export const DRAWDOWN_THRESHOLD = -5
export const BLUE_CHIP_SYMBOLS = Object.freeze([
  'sh600519', 'sz300750', 'sh600036', 'sh601318', 'sh601398',
  'sh601939', 'sh601288', 'sh601988', 'sh601857', 'sh600028',
  'sh600900', 'sh601088', 'sh600030', 'sh601166', 'sh600276',
  'sh600887', 'sz000858', 'sz000333', 'sz000651', 'sz002594',
])
export const WEIGHT_INDEX_SYMBOLS = Object.freeze(['sh000001', 'sz399001', 'sh000300', 'sh000016', 'sz399006'])
export const finiteNumber = value => value !== null && value !== undefined && typeof value !== 'boolean' && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null
const round = value => Math.round(value * 100) / 100
const rate = (part, total) => total > 0 ? round(part / total * 100) : null
const average = values => values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null

export function computeBreadth({ rows, limitUp, limitDown }) {
  const ups = new Set(limitUp.map(row => row.code)), downs = new Set(limitDown.map(row => row.code))
  const codes = new Set(rows.map(row => row.code))
  if ([...ups, ...downs].some(code => !codes.has(code)) || [...ups].some(code => downs.has(code))) throw new Error('涨跌停股池与全市场证券不一致')
  const buckets = { limitUp: 0, above7: 0, from5To7: 0, from3To5: 0, from0To3: 0, flat: 0, from0ToMinus3: 0, fromMinus3ToMinus5: 0, fromMinus5ToMinus7: 0, belowMinus7: 0, limitDown: 0 }
  const values = []
  let up = 0, down = 0, flat = 0, suspended = 0
  for (const row of rows) {
    const pct = finiteNumber(row.pct)
    if (pct === null) { suspended++; continue }
    values.push(pct)
    if (pct > 0) up++
    else if (pct < 0) down++
    else flat++
    const key = ups.has(row.code) ? 'limitUp' : downs.has(row.code) ? 'limitDown'
      : pct > 7 ? 'above7' : pct > 5 ? 'from5To7' : pct > 3 ? 'from3To5' : pct > 0 ? 'from0To3'
        : pct === 0 ? 'flat' : pct >= -3 ? 'from0ToMinus3' : pct >= -5 ? 'fromMinus3ToMinus5' : pct >= -7 ? 'fromMinus5ToMinus7' : 'belowMinus7'
    buckets[key]++
  }
  values.sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  const medianPct = values.length ? round(values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2) : null
  return { status: 'ready', total: rows.length, up, down, flat, suspended, buckets, medianPct }
}

export function computeTurnover({ amount, dataDate, previousDates = [], history = [] }) {
  if (finiteNumber(amount) === null || amount < 0) throw new Error('两市成交额缺失')
  const prior = previousDates.map(date => {
    const rows = history.filter(row => row.dataDate === date && row.dataDate < dataDate && row.session === 'closed')
      .sort((a, b) => String(b.fetchedAt ?? '').localeCompare(String(a.fetchedAt ?? '')))
    const value = finiteNumber(rows[0]?.metrics?.volume)
    return value !== null && value > 0 ? value : null
  })
  const previous = prior[0]
  const five = prior.length >= 5 && prior.slice(0, 5).every(value => value !== null) ? average(prior.slice(0, 5)) : null
  const change = base => base > 0 ? round((amount / base - 1) * 100) : null
  return { status: 'ready', amount: round(amount), vsPreviousPct: change(previous), vsFiveDayAveragePct: change(five) }
}

function yesterdayQuotes(yesterday, quotes) {
  const byCode = new Map(quotes.map(row => [row.code, row]))
  if (yesterday.some(row => !byCode.has(row.code))) throw new Error('昨日涨停股今日报价不完整')
  return yesterday.map(row => ({ ...row, pct: finiteNumber(byCode.get(row.code).pct) }))
}

export function computeLimitUp({ yesterday, quotes, current, broken }) {
  const rows = yesterdayQuotes(yesterday, quotes)
  const values = rows.map(row => row.pct).filter(value => value !== null)
  const codes = new Set(yesterday.map(row => row.code))
  const sealed = new Set(current.filter(row => codes.has(row.code)).map(row => row.code))
  // A stock that resealed is counted as sealed, even if an upstream pool overlaps.
  const opened = new Set(broken.filter(row => codes.has(row.code) && !sealed.has(row.code)).map(row => row.code))
  return { status: 'ready', yesterdayCount: yesterday.length, averagePct: average(values), redRate: rate(values.filter(value => value > 0).length, values.length), reLimitUpCount: sealed.size, brokenCount: opened.size, sealRate: rate(sealed.size, sealed.size + opened.size) }
}

export function computeDrawdown({ yesterday, quotes, threshold = DRAWDOWN_THRESHOLD }) {
  if (!Number.isFinite(threshold) || threshold >= 0) throw new Error('大面阈值必须为负数')
  const rows = yesterdayQuotes(yesterday, quotes)
  const falling = rows.filter(row => row.pct !== null && row.pct < threshold).sort((a, b) => a.pct - b.pct || a.code.localeCompare(b.code))
  const boardsKnown = rows.every(row => Number.isInteger(row.boards) && row.boards >= 1)
  return { status: 'ready', threshold, count: falling.length, consecutiveCount: boardsKnown ? falling.filter(row => row.boards >= 2).length : null, stocks: falling.slice(0, 20).map(({ code, name, pct }) => ({ code, name, pct })) }
}

export function computeWeight({ indices, blueChips, expectedSymbols, medianPct }) {
  if (!indices.length || indices.some(row => !Number.isFinite(row.change)) || expectedSymbols.some(code => !blueChips.some(row => row.code === code && Number.isFinite(row.pct)))) throw new Error('权重行情缺失')
  const averagePct = average(blueChips.map(row => row.pct))
  return { status: 'ready', indices, blueChips, averagePct, marketMedianPct: medianPct, strength: medianPct === null || averagePct === null ? null : averagePct > medianPct ? 'strong' : averagePct < medianPct ? 'weak' : 'equal' }
}

export function canReplaceSentiment(previous, next) {
  if (!previous) return true
  const quality = block => block?.status === 'ready' ? 2 : block?.status === 'incomplete' ? 1 : 0
  return ['breadth', 'turnover', 'limitUp', 'drawdown', 'weight'].every(key => quality(next?.[key]) >= quality(previous[key]))
    && (previous.drawdown?.consecutiveCount == null || next?.drawdown?.consecutiveCount != null)
}
