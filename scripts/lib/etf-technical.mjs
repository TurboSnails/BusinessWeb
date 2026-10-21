/** Pure calculations. Bars are chronological { date: YYYY-MM-DD, close: number }.
 * No synthetic sessions, no rounding before calculations, and no network access.
 */
const DAY_MS = 86400000

export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
}

export function normalizeBars(raw, cutoff) {
  if (!validDate(cutoff)) throw new Error(`Invalid asOf: ${cutoff}`)
  const unique = new Map()
  for (const { date, close } of raw) {
    if (!validDate(date)) throw new Error(`Invalid bar date: ${date}`)
    if (date > cutoff) continue
    if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) throw new Error(`Invalid close on ${date}: ${close}`)
    if (unique.has(date) && unique.get(date) !== close) throw new Error(`Conflicting closes on ${date}`)
    unique.set(date, close)
  }
  return [...unique].sort(([a], [b]) => a.localeCompare(b)).map(([date, close]) => ({ date, close }))
}

export function movingAverage(closes, period) {
  if (closes.length < period) return null
  return closes.slice(-period).reduce((sum, close) => sum + close, 0) / period
}

/** Return the seeded recurrence, including warm-up values; publication gates live in periodIndicators. */
export function macdSeries(closes) {
  if (!closes.length) return []
  let fast = closes[0], slow = closes[0], dea = 0
  return closes.map(close => {
    fast += (close - fast) * 2 / 13
    slow += (close - slow) * 2 / 27
    const dif = fast - slow
    dea += (dif - dea) * 2 / 10
    return { dif, dea, histogram: 2 * (dif - dea) }
  })
}

export function rsiSeries(closes, period = 14) {
  const result = Array(closes.length).fill(null)
  let gain = 0, loss = 0
  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1]
    if (i <= period) {
      gain += Math.max(delta, 0) / period
      loss += Math.max(-delta, 0) / period
    } else {
      gain = (gain * (period - 1) + Math.max(delta, 0)) / period
      loss = (loss * (period - 1) + Math.max(-delta, 0)) / period
    }
    if (i >= period) result[i] = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss)
  }
  return result
}

function periodBounds(date, period) {
  const d = new Date(`${date}T00:00:00Z`)
  if (period === 'day') return { key: date, end: date }
  if (period === 'week') {
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS)
    return { key: monday.toISOString().slice(0, 10), end: new Date(monday.getTime() + 4 * DAY_MS).toISOString().slice(0, 10) }
  }
  if (period !== 'month') throw new Error(`Unknown period: ${period}`)
  return { key: date.slice(0, 7), end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10) }
}

/** Last real daily observation per ISO week / calendar month; never fill missing periods. */
export function aggregateBars(bars, period) {
  const groups = new Map()
  for (const bar of bars) {
    const { key, end } = periodBounds(bar.date, period)
    groups.set(key, { date: bar.date, close: bar.close, end })
  }
  return [...groups.values()]
}

export function periodIndicators(bars, period, cutoff, retrievedAt = new Date().toISOString()) {
  const grouped = aggregateBars(normalizeBars(bars, cutoff), period)
  const closes = grouped.map(bar => bar.close)
  const latest = grouped.at(-1)
  const ma5 = movingAverage(closes, 5), ma10 = movingAverage(closes, 10), ma20 = movingAverage(closes, 20)
  const close = latest?.close ?? null
  const ma = ma20 === null ? null : close > ma5 && ma5 > ma10 && ma10 > ma20 ? '多头'
    : close < ma5 && ma5 < ma10 && ma10 < ma20 ? '空头' : '震荡'
  const macds = macdSeries(closes)
  const current = closes.length >= 26 ? macds.at(-1) : null
  const previousHistogram = closes.length >= 27 ? macds.at(-2).histogram : null
  const rsis = rsiSeries(closes)
  const rsi = rsis.at(-1) ?? null, previousRsi = rsis.at(-2) ?? null
  // Calendar month is unfinished until its last calendar day, even when it ends on a weekend.
  // ISO week finishes at Friday 15:00 Asia/Shanghai; no holiday-calendar guesses.
  const complete = !!latest && latest.end <= cutoff && Date.parse(retrievedAt) >= Date.parse(`${latest.end}T15:00:00+08:00`)
  return {
    asOf: latest?.date ?? null, complete, count: closes.length, close, ma, ma5, ma10, ma20,
    macd: current ? (current.dif >= current.dea ? '偏多' : '偏空') : null,
    dif: current?.dif ?? null, dea: current?.dea ?? null, histogram: current?.histogram ?? null,
    previousHistogram, rsi, previousRsi,
    rsiState: rsi === null ? null : rsi >= 70 ? '超买' : rsi <= 30 ? '超卖' : '中性',
    limited: ma20 === null || current === null || previousHistogram === null || rsi === null || previousRsi === null,
  }
}

export function parseTencent(payload, symbol, cutoff) {
  if (payload.code != null && payload.code !== 0) throw new Error(`Tencent code ${payload.code}: ${payload.msg ?? 'API error'}`)
  const data = payload.data?.[symbol]
  const priceSeries = data?.qfqday?.length ? 'qfqday' : 'day'
  const rows = data?.[priceSeries]
  if (!Array.isArray(rows) || !rows.length) throw new Error(`Tencent ${symbol}: no qfqday/day data`)
  const bars = normalizeBars(rows.map(row => ({ date: row[0], close: row[2] === '' || row[2] == null ? NaN : Number(row[2]) })), cutoff)
  if (!bars.length) throw new Error(`Tencent ${symbol}: no observations on/before ${cutoff}`)
  return { bars, priceSeries }
}

/** Extract only JSON assignments. Never evaluate remote JavaScript or use estimated NAV. */
export function parseFundNav(text, cutoff) {
  const match = text.match(/\b(?:var\s+)?Data_ACWorthTrend\s*=\s*(\[[\s\S]*?\])\s*;/)
  if (!match) throw new Error('Missing published accumulated NAV (Data_ACWorthTrend)')
  const rows = JSON.parse(match[1])
  if (!Array.isArray(rows) || !rows.length) throw new Error('Empty published accumulated NAV')
  const bars = normalizeBars(rows.map(row => {
    if (!Array.isArray(row) || !Number.isFinite(row[0])) throw new Error('Invalid NAV timestamp')
    return { date: new Date(row[0] + 8 * 3600000).toISOString().slice(0, 10), close: row[1] }
  }), cutoff)
  if (!bars.length) throw new Error(`No published accumulated NAV on/before ${cutoff}`)
  const nameMatch = text.match(/\bfS_name\s*=\s*("(?:[^"\\]|\\.)*")\s*;/)
  return { bars, priceSeries: 'nav', name: nameMatch ? JSON.parse(nameMatch[1]) : null }
}

export function buildRecord(instrument, fetched, cutoff, retrievedAt) {
  const bars = normalizeBars(fetched.bars, cutoff)
  if (!bars.length) throw new Error('No usable observations')
  const closes = bars.map(bar => bar.close), latest = bars.at(-1)
  const previousClose = closes.at(-2) ?? null
  return {
    code: instrument.code, name: fetched.name || instrument.name, kind: instrument.kind, group: instrument.group,
    asOf: latest.date, sourceUrl: fetched.sourceUrl, retrievedAt, priceSeries: fetched.priceSeries,
    close: latest.close, previousClose,
    changePct: previousClose === null ? null : (latest.close / previousClose - 1) * 100,
    ...(fetched.priceSeries === 'nav' ? { navDate: latest.date } : {}),
    ma5: movingAverage(closes, 5), ma10: movingAverage(closes, 10), ma20: movingAverage(closes, 20), ma60: movingAverage(closes, 60),
    return20SessionsPct: closes.length >= 21 ? (latest.close / closes.at(-21) - 1) * 100 : null,
    day: periodIndicators(bars, 'day', cutoff, retrievedAt),
    week: periodIndicators(bars, 'week', cutoff, retrievedAt),
    month: periodIndicators(bars, 'month', cutoff, retrievedAt),
  }
}
