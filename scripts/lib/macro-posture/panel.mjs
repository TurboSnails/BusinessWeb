import { formatDate, formatReading } from './format.mjs'
import { remainingSessions } from './calendar.mjs'

export const FRED_SPX = '标普 500 日收盘（FRED）'
export const FRED_SPX_URL = 'https://fred.stlouisfed.org/series/SP500'

const DAY = 86_400_000
const iso = date => date.toISOString().slice(0, 10)
const millis = date => Date.parse(date + 'T00:00:00Z')

export const addDays = (date, days) => iso(new Date(millis(date) + days * DAY))
export const ageDays = (date, prior) => (millis(date) - millis(prior)) / DAY
export const monthEnd = (date, offset = 0) => {
  const [year, month] = date.split('-').map(Number)
  return iso(new Date(Date.UTC(year, month + offset, 0)))
}

export const RELEASE_MONTHS = Object.freeze({
  SAHMREALTIME: 1, PAYEMS: 1, INDPRO: 1, PCEPILFE: 2,
  BAA: 0, AAA: 0, FEDFUNDS: 0, GS10: 0, TB3MS: 0, price: 0, yield: 0,
})
const WEEKLY_IDS = ['IC4WSA', 'NFCI', 'NFCICREDIT']
const WEEKLY = new Set(WEEKLY_IDS)

export function makeSeries(id, rows) {
  return [...new Map(rows.filter(([, value]) => Number.isFinite(value))
    .map(([day, value]) => [day, {
      observedOn: day,
      availableOn: WEEKLY.has(id) ? addDays(day, 5)
        : Object.hasOwn(RELEASE_MONTHS, id) ? monthEnd(day, RELEASE_MONTHS[id]) : day,
      value,
    }])).values()].sort((a, b) => a.observedOn.localeCompare(b.observedOn))
}

function upperBound(series, date, key) {
  let lo = 0
  let hi = series.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (series[mid][key] <= date) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function valueAt(series = [], date) {
  return series[upperBound(series, date, 'availableOn') - 1] ?? null
}

const monthAt = (series = [], date, asOf) => {
  const point = series[upperBound(series, date, 'observedOn') - 1]
  return point?.availableOn <= asOf && point.observedOn.slice(0, 7) === date.slice(0, 7) ? point : null
}

function monthlyWindow(series, point, count, asOf) {
  if (!point) return []
  return Array.from({ length: count }, (_, i) => monthAt(series, monthEnd(point.observedOn, -i), asOf))
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length
const percentChange = (now, prior, power = 1) => prior > 0 ? ((now / prior) ** power - 1) * 100 : null

function tacticalEstimate(panel, date, source) {
  const month = date.slice(0, 7)
  const days = (panel.SP500 ?? []).filter(point => point.observedOn.startsWith(month) && point.availableOn <= date)
  const previous = Array.from({ length: 9 }, (_, i) => monthAt(panel.price, monthEnd(date, -i - 1), date))
  if (!days.length || !previous.every(Boolean)) return undefined
  const average = mean(days.map(point => point.value))
  const prior9 = mean(previous.map(point => point.value))
  const sma10 = (average + 9 * prior9) / 10
  const below = average < prior9
  const last = days.at(-1)
  const remaining = remainingSessions(last.observedOn, monthEnd(date))
  // The completed monthly average crosses the ten-month line when it crosses the prior nine-month average.
  const threshold = remaining ? (prior9 * (days.length + remaining) - average * days.length) / remaining : null
  return {
    month, days: days.length, remaining, average, prior9, sma10, threshold, below,
    lastClose: { date: last.observedOn, value: last.value }, source,
    display: `${Number(month.slice(5))} 月至今 ${days.length} 个交易日均价 ${formatReading(average, '指数')}，${below ? '低于' : '不低于'}预估 10 个月均线 ${formatReading(sma10, '指数')}。`,
  }
}

// Normalize away floating-point noise from calculations such as 4.4 minus 4.0.
export const clean = value => Math.round(value * 1e10) / 1e10
export function percentile(value, reference) {
  const below = reference.filter(x => x < value).length
  const equal = reference.filter(x => x === value).length
  return (below + equal / 2) / reference.length * 100
}

function joinedSpread(left, right) {
  const byMonth = new Map((right ?? []).map(point => [point.observedOn.slice(0, 7), point]))
  return (left ?? []).flatMap(point => {
    const other = byMonth.get(point.observedOn.slice(0, 7))
    return other ? [{
      ...point,
      availableOn: [point.availableOn, other.availableOn].sort().at(-1),
      value: clean(point.value - other.value),
    }] : []
  })
}

export function makePanel(rows) {
  const panel = Object.fromEntries(Object.entries(rows).map(([id, readings]) => [id, makeSeries(id, readings)]))
  return { ...panel, baa: joinedSpread(panel.BAA, panel.AAA), curve: joinedSpread(panel.GS10, panel.TB3MS) }
}

function reading(point, value, extras = {}, date, id, other = []) {
  if (!point) return null
  const staleAfter = WEEKLY.has(id) ? 21 : id === 'PCEPILFE' ? 105 : 75
  const observed = WEEKLY.has(id) ? point.observedOn : monthEnd(point.observedOn)
  return {
    observedOn: point.observedOn,
    availableOn: [point, ...other].map(p => p.availableOn).sort().at(-1),
    value: value == null ? null : clean(value),
    stale: ageDays(date, observed) > staleAfter || other.some(p => ageDays(date, monthEnd(p.observedOn)) > 105),
    ...Object.fromEntries(Object.entries(extras).map(([key, n]) => [key, typeof n === 'number' ? clean(n) : n])),
  }
}

export function panelAt(panel, date, estimateDate = date, spxSource = FRED_SPX) {
  const latest = id => valueAt(panel[id], date)
  const prior = (id, point, n) => point && monthAt(panel[id], monthEnd(point.observedOn, -n), date)
  const simple = (id, point, value = point?.value, extras, other) => reading(point, value, extras, date, id, other)
  const change = (point, prev) => point && prev ? clean(point.value - prev.value) : null
  const weekly = id => {
    const point = latest(id)
    const target = point && addDays(point.observedOn, -91)
    const old = target && valueAt(panel[id], addDays(target, 5))
    return simple(id, point, point?.value, { delta: old?.observedOn === target ? change(point, old) : null })
  }
  const claims = latest('IC4WSA')
  const claimWeeks = claims ? (panel.IC4WSA ?? []).slice(
    upperBound(panel.IC4WSA, addDays(claims.observedOn, -364), 'observedOn'),
    upperBound(panel.IC4WSA, date, 'availableOn'),
  ) : []
  const jobs = latest('PAYEMS')
  const jobsMonths = monthlyWindow(panel.PAYEMS, jobs, 4, date)
  const jobChange = jobsMonths.length && jobsMonths.every(Boolean) ? percentChange(jobs.value, jobsMonths[3].value) : null
  const industry = latest('INDPRO')
  const industryPrior = prior('INDPRO', industry, 6)
  const baa = latest('baa')
  const baaMonths = monthlyWindow(panel.baa, baa, 120, date)
  const funds = latest('FEDFUNDS')
  const curve = latest('curve')
  const curveMonths = monthlyWindow(panel.curve, curve, 25, date).slice(1)
  const inverted = count => {
    const window = curveMonths.slice(0, count)
    if (window.some(p => p?.value < 0)) return true
    return window.length === count && window.every(Boolean) ? false : null
  }
  const pce = latest('PCEPILFE')
  const pcePrior = prior('PCEPILFE', pce, 12)
  const pceSix = prior('PCEPILFE', pce, 6)
  const yoy = pcePrior ? percentChange(pce.value, pcePrior.value) : null
  const price = latest('price')
  const trend = monthlyWindow(panel.price, price, 10, date)
  const sma10 = trend.length && trend.every(Boolean) ? mean(trend.map(p => p.value)) : null
  const estimate = estimateDate && price?.observedOn.slice(0, 7) !== estimateDate.slice(0, 7)
    ? tacticalEstimate(panel, estimateDate, spxSource) : undefined
  const lastObserved = ids => ids.map(id => latest(id)?.observedOn).filter(Boolean).sort().at(-1)

  return {
    observations: {
      monthly: lastObserved(['SAHMREALTIME', 'PAYEMS', 'INDPRO', 'PCEPILFE', 'FEDFUNDS', 'GS10', 'TB3MS']),
      weekly: lastObserved(WEEKLY_IDS),
      credit: baa?.observedOn,
      spx: estimateDate && valueAt(panel.SP500, estimateDate)?.observedOn,
    },
    components: {
      sahm: simple('SAHMREALTIME', latest('SAHMREALTIME')),
      claims: simple('IC4WSA', claims, claimWeeks.length === 52 ? percentChange(claims.value, Math.min(...claimWeeks.map(p => p.value))) : null),
      payrolls: simple('PAYEMS', jobs, jobChange == null ? null : jobChange / 3),
      indpro: simple('INDPRO', industry, industryPrior ? percentChange(industry.value, industryPrior.value, 2) : null),
      baaLevel: simple('baa', baa, baaMonths.length === 120 && baaMonths.every(Boolean) ? percentile(baa.value, baaMonths.map(p => p.value)) : null),
      baaChange: simple('baa', baa, change(baa, prior('baa', baa, 6))),
      nfciCredit: weekly('NFCICREDIT'),
      fedPath: simple('FEDFUNDS', funds, change(funds, prior('FEDFUNDS', funds, 12)), { delta6: change(funds, prior('FEDFUNDS', funds, 6)) }),
      curve: simple('curve', curve, curve?.value, { inverted12: inverted(12), inverted24: inverted(24) }),
      nfci: weekly('NFCI'),
      realRate: simple('FEDFUNDS', funds, funds && yoy != null ? funds.value - yoy : null, {}, pce ? [pce] : []),
      corePce: simple('PCEPILFE', pce, pceSix ? percentChange(pce.value, pceSix.value, 2) : null, { yoy }),
    },
    tactical: {
      price: price?.value ?? null,
      sma10,
      below: sma10 == null ? null : price.value < sma10,
      display: sma10 == null ? '月均价或十个月均线暂缺'
        : `${formatDate(price.observedOn, 'monthly')}标普月均价 ${formatReading(price.value, '指数')}，${price.value < sma10 ? '低于' : '不低于'}十个月均线 ${formatReading(sma10, '指数')}。`,
      ...(estimate ? { mtd: estimate } : {}),
    },
  }
}
