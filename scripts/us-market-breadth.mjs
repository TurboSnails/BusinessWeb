// Closing breadth calculated from aligned, dividend- and split-adjusted daily closes.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const output = fileURLToPath(new URL('../public/data/us-market-breadth.json', import.meta.url))
const cacheDir = fileURLToPath(new URL('../.cache/us-market-breadth', import.meta.url))
const spxSource = 'https://github.com/datasets/s-and-p-500-companies'
const spxCsv = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv'
const ndxSource = 'https://indexes.nasdaqomx.com/index/weighting/ndx'
const ndxEndpoint = new URL('/Index/WeightingData', ndxSource)
const LOOKBACK = 200
const COMPARISON_SESSIONS = 5
const FULL_WINDOW = LOOKBACK + COMPARISON_SESSIONS
// About one trading year of daily breadth, recomputed from the current membership.
const BACKFILL = 250
const PRICE_WINDOW = LOOKBACK + BACKFILL
const MIN_COVERAGE = 0.95
const sectors = {
  'Communication Services': 'sector-xlc', 'Consumer Discretionary': 'sector-xly',
  'Consumer Staples': 'sector-xlp', Energy: 'sector-xle', Financials: 'sector-xlf',
  'Health Care': 'sector-xlv', Industrials: 'sector-xli', 'Information Technology': 'sector-xlk',
  Materials: 'sector-xlb', 'Real Estate': 'sector-xlre', Utilities: 'sector-xlu',
}
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
const tradingDate = seconds => dateFormat.format(new Date(seconds * 1000))
const okDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const okPrice = value => Number.isFinite(value) && value > 0

function csvFields(line) {
  return [...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)].map(([, quoted, plain]) => (quoted ?? plain).replaceAll('""', '"').trim())
}

export function parseSpxMembers(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/).map(csvFields)
  const symbolIndex = header.indexOf('Symbol')
  const sectorIndex = header.indexOf('GICS Sector')
  const addedIndex = header.indexOf('Date added')
  if (symbolIndex < 0 || sectorIndex < 0 || addedIndex < 0) throw new Error('S&P 500 source columns changed')
  const members = lines.map(row => {
    const symbol = row[symbolIndex]?.replaceAll('.', '-')
    const sector = sectors[row[sectorIndex]]
    if (!symbol || !/^[A-Z][A-Z0-9-]{0,9}$/.test(symbol) || !sector) throw new Error('Invalid S&P 500 constituent row')
    return { symbol, sector, added: okDate(row[addedIndex]) ? row[addedIndex] : null }
  })
  if (new Set(members.map(m => m.symbol)).size !== members.length) throw new Error('Duplicate S&P 500 constituent')
  return members
}

export function parseNdxMembers(data) {
  const members = data?.aaData?.map(entry => ({ symbol: entry?.Symbol?.trim()?.replaceAll('.', '-') }))
  if (!members || members.length < 98 || members.length > 105 || members.length !== data.iTotalRecords || members.length !== data.iTotalDisplayRecords ||
      members.some(m => !/^[A-Z][A-Z0-9-]{0,9}$/.test(m.symbol ?? '')) || new Set(members.map(m => m.symbol)).size !== members.length) {
    throw new Error('Nasdaq constituent response failed membership validation')
  }
  return members
}

function chartRow(body, symbol) {
  const row = body?.chart?.result?.[0]
  if (row?.meta?.symbol !== symbol || row.meta.exchangeTimezoneName !== 'America/New_York' || !Array.isArray(row.timestamp)) {
    throw new Error('Yahoo instrument identity or exchange zone mismatch')
  }
  return row
}

export function parseYahooAdjusted(body, symbol) {
  const row = chartRow(body, symbol)
  const prices = row.indicators?.adjclose?.[0]?.adjclose
  if (!Array.isArray(prices) || prices.length !== row.timestamp.length) throw new Error('Missing adjusted closing-price history')
  const pricesByDate = new Map()
  row.timestamp.forEach((timestamp, i) => {
    if (Number.isFinite(timestamp) && okPrice(prices[i])) pricesByDate.set(tradingDate(timestamp), prices[i])
  })
  return [...pricesByDate].sort(([a], [b]) => a.localeCompare(b))
}

export function completedSessions(body, symbol, now = new Date()) {
  const row = chartRow(body, symbol)
  const today = tradingDate(now.getTime() / 1000)
  const period = row.meta.currentTradingPeriod?.regular
  const close = row.indicators?.quote?.[0]?.close
  const closedToday = Number.isFinite(period?.start) && Number.isFinite(period.end) && tradingDate(period.start) === today && now.getTime() >= (period.end + 15 * 60) * 1000
  return [...new Set(row.timestamp.flatMap((timestamp, i) => {
    if (!Number.isFinite(timestamp) || !okPrice(close?.[i])) return []
    const date = tradingDate(timestamp)
    return date < today || (date === today && closedToday) ? [date] : []
  }))].sort()
}

/** Both horizons share exactly the same covered universe and completed session. */
export function computeBreadth(members, barsBySymbol, sessions) {
  if (!members.length || sessions.length < LOOKBACK) return null
  const window = sessions.slice(-LOOKBACK)
  let covered = 0
  let above50 = 0
  let above200 = 0
  for (const symbol of members) {
    const byDate = new Map(barsBySymbol.get(symbol) ?? [])
    const values = window.map(date => byDate.get(date))
    if (!values.every(okPrice)) continue
    covered += 1
    const close = values.at(-1)
    const sum = values.reduce((a, b) => a + b, 0)
    const recent = values.slice(-50).reduce((a, b) => a + b, 0)
    if (close > recent / 50) above50 += 1
    if (close > sum / 200) above200 += 1
  }
  if (covered / members.length < MIN_COVERAGE) return null
  const pct = n => Math.round(n / covered * 10000) / 100
  return { date: window.at(-1), covered, total: members.length, above50: pct(above50), above200: pct(above200) }
}

/**
 * Daily above-200-day share for the latest `count` sessions, using today's
 * membership throughout. Sessions below the coverage floor are skipped.
 */
export function computeBackfill(members, barsBySymbol, sessions, count = BACKFILL) {
  const points = []
  for (let end = Math.max(LOOKBACK, sessions.length - count + 1); end <= sessions.length; end++) {
    const row = computeBreadth(members, barsBySymbol, sessions.slice(0, end))
    if (row) points.push([row.date, row.above200])
  }
  return points
}

/** SPX and GICS historical membership is unavailable. Compare matched names from the current universe. */
export function computeMatchedComparison(members, barsBySymbol, sessions) {
  if (sessions.length < FULL_WINDOW) return null
  const priorSessions = sessions.slice(0, -COMPARISON_SESSIONS)
  const priorDate = priorSessions.at(-1)
  const eligible = members.filter(({ added }) => added && added <= priorDate)
  const priorKnown = members.filter(({ added }) => !added || added <= priorDate)
  if (eligible.length / priorKnown.length < MIN_COVERAGE) return null
  const days = sessions.slice(-FULL_WINDOW)
  const matched = eligible.filter(({ symbol }) => {
    const prices = new Map(barsBySymbol.get(symbol) ?? [])
    return days.every(date => okPrice(prices.get(date)))
  }).map(({ symbol }) => symbol)
  if (!matched.length || matched.length / priorKnown.length < MIN_COVERAGE) return null
  const old = computeBreadth(matched, barsBySymbol, priorSessions)
  const current = computeBreadth(matched, barsBySymbol, sessions)
  return {
    ...old,
    total: priorKnown.length,
    currentAbove50: current.above50,
    currentAbove200: current.above200,
    basis: 'matched-current-membership',
    scope: '用当前名单回算，去除后来纳入、纳入日期不明或任一窗口缺价的证券；两日使用同一组样本；历史已剔除成分不在内，行业采用当前归类',
  }
}

export function mergeBreadth(previous, next) {
  const combined = { ...previous }
  for (const [key, row] of Object.entries(next)) {
    const prior = combined[key]
    if (prior?.date > row.date) continue
    // Keep observed history within a consistent, explicitly identified universe and source.
    const history = prior?.source === row.source && prior?.universe === row.universe ? prior.history ?? [] : []
    const points = new Map(history.filter(([date]) => date < row.date))
    points.set(row.date, row.above200)
    const comparison = row.comparison ?? (prior?.date === row.date && prior.universe === row.universe && prior.source === row.source ? prior.comparison : undefined)
    combined[key] = { ...row, ...(comparison && { comparison }), history: [...points].sort(([a], [b]) => a.localeCompare(b)).slice(-260) }
  }
  return combined
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null
    throw error
  }
}

async function writeJson(file, document) {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(document, null, 2) + '\n')
  await rename(tmp, file)
}

async function get(url, options) {
  const res = await fetch(url, { ...options, headers: { 'user-agent': 'Mozilla/5.0', ...options?.headers }, signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).hostname}`)
  return res
}

async function chart(symbol) {
  return (await get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`)).json()
}

async function ndxMembers(date) {
  const response = await get(ndxEndpoint, {
    method: 'POST',
    headers: { referer: ndxSource, 'x-requested-with': 'XMLHttpRequest' },
    body: new URLSearchParams({ id: 'NDX', tradeDate: `${date}T00:00:00`, timeOfDay: 'EOD' }),
  })
  return parseNdxMembers(await response.json())
}

function universeId(symbols) {
  return createHash('sha256').update([...symbols].sort().join(',')).digest('hex').slice(0, 12)
}

async function fetchBars(symbols, sessions) {
  const date = sessions.at(-1)
  const needed = new Set(sessions.slice(-PRICE_WINDOW))
  const staged = resolve(cacheDir, date)
  const bars = new Map()
  let failures = 0
  let cursor = 0
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < symbols.length && failures < 24) {
      const symbol = symbols[cursor++]
      const path = resolve(staged, `${symbol}.json`)
      try {
        const cached = await readJson(path)
        if (Array.isArray(cached) && cached.length === needed.size && cached.every(([d, price], i) => d === sessions.at(-needed.size + i) && okPrice(price))) {
          bars.set(symbol, cached)
          continue
        }
        const adjusted = parseYahooAdjusted(await chart(symbol), symbol).filter(([d]) => needed.has(d))
        bars.set(symbol, adjusted)
        if (adjusted.length === needed.size) await writeJson(path, adjusted)
      } catch {
        failures += 1
      }
      await delay(60)
    }
  }))
  return { bars, failures, attempted: cursor }
}

async function main() {
  const prior = (await readJson(output))?.breadth ?? {}
  const [spxChart, ndxChart, constituents] = await Promise.allSettled([
    chart('^GSPC'), chart('^NDX'), get(spxCsv).then(response => response.text()),
  ])
  const issues = []
  const markets = {}
  if (constituents.status === 'fulfilled' && spxChart.status === 'fulfilled') {
    try {
      const sessions = completedSessions(spxChart.value, '^GSPC')
      const members = parseSpxMembers(constituents.value).filter(m => !m.added || m.added <= sessions.at(-1))
      if (members.length < 490 || members.length > 510 || sessions.length < LOOKBACK || new Set(members.map(m => m.sector)).size !== 11) {
        throw new Error('S&P 500 membership or calendar failed validation')
      }
      markets.spx = { sessions, members }
    } catch (error) { issues.push(error.message) }
  } else issues.push('S&P 500 calendar or membership unavailable')
  if (ndxChart.status === 'fulfilled') {
    try {
      const sessions = completedSessions(ndxChart.value, '^NDX')
      if (sessions.length < LOOKBACK) throw new Error('Nasdaq-100 calendar failed validation')
      markets.ndx = { sessions, members: await ndxMembers(sessions.at(-1)) }
    } catch (error) { issues.push(error.message) }
  } else issues.push('Nasdaq-100 calendar unavailable')

  const next = {}
  const groups = new Map()
  for (const [market, config] of Object.entries(markets)) {
    const { sessions, members } = config
    const universes = market === 'spx'
      ? { spx: members, rsp: members, ...Object.fromEntries(Object.values(sectors).map(id => [id, members.filter(member => member.sector === id)])) }
      : { ndx: members }
    const alreadyPublished = Object.entries(universes).every(([id, list]) =>
      prior[id]?.date === sessions.at(-1) && prior[id]?.comparison?.date === sessions.at(-1 - COMPARISON_SESSIONS) &&
      prior[id]?.universe === universeId(list.map(member => member.symbol)) &&
      prior[id]?.source === (market === 'spx' ? spxSource : ndxSource))
    if (alreadyPublished && !process.argv.includes('--force')) continue
    if (market === 'ndx' && sessions.length >= FULL_WINDOW) {
      try { config.priorMembers = await ndxMembers(sessions.at(-1 - COMPARISON_SESSIONS)) } catch (error) {
        issues.push(`Nasdaq-100 comparison membership unavailable: ${error.message}`)
      }
    }
    const key = config.sessions.slice(-FULL_WINDOW).join(',')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push([market, config])
  }
  for (const group of groups.values()) {
    const sessions = group[0][1].sessions
    const unique = [...new Set(group.flatMap(([, config]) => [...config.members, ...(config.priorMembers ?? [])].map(member => member.symbol)))]
    const { bars, failures, attempted } = await fetchBars(unique, sessions)
    if (failures) issues.push(`Yahoo adjusted chart requests failed for ${failures} of ${attempted} attempted securities`)
    for (const [market, { members, priorMembers }] of group) {
      function publish(id, list, source, scope) {
        const symbols = list.map(member => member.symbol)
        const row = computeBreadth(symbols, bars, sessions)
        if (!row) {
          issues.push(`${id} coverage did not reach 95% on ${sessions.at(-1)}`)
          return
        }
        const comparison = market === 'spx'
          ? computeMatchedComparison(list, bars, sessions)
          : priorMembers && computeBreadth(priorMembers.map(member => member.symbol), bars, sessions.slice(0, -COMPARISON_SESSIONS))
        const backfill = computeBackfill(symbols, bars, sessions)
        const observation = {
          ...row, source, scope, universe: universeId(symbols),
          ...(backfill.length > 1 && { backfill, backfillScope: '按当前成分名单回算每日收盘宽度；期间被剔除的股票不在内，存在幸存者偏差' }),
        }
        if (comparison) {
          observation.comparison = market === 'spx' ? comparison : {
            ...comparison,
            basis: 'dated-membership',
            scope: '两日分别使用纳斯达克当日收盘成分证券名单；按证券计数',
          }
        } else issues.push(`${id} five-session comparison unavailable or below 95% coverage`)
        next[id] = observation
      }
      if (market === 'ndx') {
        publish('ndx', members, ndxSource, '纳斯达克当日收盘成分证券名单，按证券计数；Yahoo 复权收盘')
        continue
      }
      publish('spx', members, spxSource, '标普 500 公开成分代理名单 · Yahoo 复权收盘')
      if (next.spx) next.rsp = { ...next.spx, scope: '标普 500 等权使用同一成分名单；每只股票一票 · Yahoo 复权收盘' }
      for (const [label, id] of Object.entries(sectors)) {
        publish(id, members.filter(member => member.sector === id), spxSource, `标普 500 成分 · ${label}（GICS）；Yahoo 复权收盘`)
      }
    }
  }
  const breadth = mergeBreadth(prior, next)
  if (JSON.stringify(breadth) !== JSON.stringify(prior)) {
    await writeJson(output, { breadth })
  }
  console.log(JSON.stringify({ updated: Object.keys(next), retained: Object.keys(prior).filter(key => !next[key]), issues }))
  if (!Object.keys(next).length && !Object.keys(prior).length) process.exitCode = 1
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
