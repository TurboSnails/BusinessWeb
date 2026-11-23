import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { addDays, ageDays, monthEnd, RELEASE_MONTHS } from './panel.mjs'

const ALFRED = 'https://alfred.stlouisfed.org'
const CACHE = fileURLToPath(new URL('../../../data-raw/macro-posture-vintages', import.meta.url))
const WINDOW = { PAYEMS: 15, INDPRO: 15, PCEPILFE: 15, IC4WSA: 53, AWHMAN: 15 }
const SERIES = Object.keys(WINDOW)
const V21_SERIES = SERIES.filter(id => id !== 'AWHMAN')
// The graph endpoint silently truncates requests to twelve columns.
const BATCH_SIZE = 12
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const RECHECK_DAYS = 10

export function selectVintage(dates, monthEnd) {
  return dates.findLast(date => date <= monthEnd) ?? null
}

function vintageDates(html) {
  const options = html.match(/<select\b[^>]*\bid="form_selected_vintage_dates"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? ''
  const dates = [...options.matchAll(/<option\b[^>]*\bvalue="(\d{4}-\d{2}-\d{2})"/g)].map(match => match[1])
  if (!dates.length) throw new Error('没有可用版本日期')
  return [...new Set(dates)].sort()
}

function vintageObservations(csv, id, dates) {
  const [header, ...lines] = csv.trim().split(/\r?\n/)
  const [dateHeader, ...columns] = header.replace(/^\uFEFF/, '').split(',')
  const indexes = dates.map(date => columns.indexOf(id + '_' + date.replaceAll('-', '')))
  if (!['observation_date', 'DATE'].includes(dateHeader) || indexes.includes(-1)) throw new Error('版本列不匹配')
  const observations = dates.map(() => new Map())
  for (const line of lines) {
    const [date, ...values] = line.split(',')
    if (!ISO_DATE.test(date)) continue
    for (const [i, index] of indexes.entries()) {
      const raw = values[index]?.trim()
      if (date <= dates[i] && raw && Number.isFinite(Number(raw))) observations[i].set(date, Number(raw))
    }
  }
  return new Map(dates.map((date, i) => {
    const rows = [...observations[i]].sort(([a], [b]) => a.localeCompare(b)).slice(-WINDOW[id])
    if (!rows.length) throw new Error(`${date} 版本没有可用观测`)
    return [date, { vintage: date, rows: id === 'IC4WSA' ? compactWeeks(rows) : rows }]
  }))
}

function compactWeeks(rows) {
  // Store a date only at the start and when the weekly cadence breaks.
  return rows.map(([date, value], i) => i && date === addDays(rows[i - 1][0], 7) ? value : [date, value])
}

async function readCache(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return {}
  }
}

async function writeCache(path, cache, directory) {
  const temporary = path + '.' + randomUUID() + '.tmp'
  const rows = Object.entries(cache).sort(([a], [b]) => a.localeCompare(b))
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temporary, JSON.stringify(Object.fromEntries(rows)) + '\n')
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

// All series share one request schedule, including the release calendars and retries.
export async function loadVintages(monthEnds, { directory = CACHE, fetcher = fetch, now = new Date(), includeHours = false } = {}) {
  const days = [...new Set(monthEnds)].sort()
  const latest = days.at(-1)
  const fetchedAt = now.toISOString()
  let previousRequest = -Infinity
  let requests = 0
  async function request(url, parse) {
    let cause
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const wait = 1000 - (performance.now() - previousRequest)
      if (wait > 0) await delay(Math.ceil(wait))
      previousRequest = performance.now()
      requests += 1
      try {
        const response = await fetcher(url, { signal: AbortSignal.timeout(25_000) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return parse(await response.text())
      } catch (error) {
        cause = error
      }
    }
    throw new Error(`ALFRED ${url} 抓取失败：${cause.message}`, { cause })
  }

  const vintages = {}
  for (const id of includeHours ? SERIES : V21_SERIES) {
    const path = resolve(directory, id + '.json')
    const cache = await readCache(path)
    let migrated = false
    for (const day of days) {
      if (cache[day] !== null) continue
      cache[day] = { fallback: 'revised' }
      migrated = true
    }
    const lastEntry = cache[latest]
    const ageAtFetch = ageDays(lastEntry?.fetchedAt?.slice(0, 10) ?? '', latest)
    const recheck = ageAtFetch >= 0 && ageAtFetch < RECHECK_DAYS && !lastEntry.rechecked
    const missing = days.filter(day => !Object.hasOwn(cache, day) || (day === latest && recheck))
    if (missing.length) {
      const dates = await request(`${ALFRED}/series/downloaddata?seid=${id}`, vintageDates)
      const byMonth = missing.map(day => [day, selectVintage(dates, day)])
      const needed = [...new Set(byMonth.map(([, vintage]) => vintage).filter(Boolean))]
      function store(day, snapshot) {
        cache[day] = { ...snapshot, fetchedAt, ...(day === latest && recheck ? { rechecked: true } : {}) }
      }
      for (const [day, date] of byMonth) {
        if (date === null) store(day, { fallback: 'revised' })
      }
      for (let offset = 0; offset < needed.length; offset += BATCH_SIZE) {
        const batch = needed.slice(offset, offset + BATCH_SIZE)
        const url = `${ALFRED}/graph/alfredgraph.csv?id=${batch.map(() => id).join(',')}&vintage_date=${batch.join(',')}`
        const observations = await request(url, csv => vintageObservations(csv, id, batch))
        for (const [day, date] of byMonth) {
          if (observations.has(date)) store(day, observations.get(date))
        }
        await writeCache(path, cache, directory)
      }
      if (!needed.length) await writeCache(path, cache, directory)
    } else if (migrated) {
      await writeCache(path, cache, directory)
    }
    vintages[id] = cache
  }
  return { vintages, requests }
}

export function panelWithVintages(panel, vintages, date) {
  const snapshots = (Object.hasOwn(vintages, 'AWHMAN') ? SERIES : V21_SERIES).map(id => {
    if (!Object.hasOwn(vintages[id] ?? {}, date)) throw new Error(`ALFRED ${id} 缺少 ${date} 的缓存`)
    const entry = vintages[id][date]
    if (entry === null || entry.fallback === 'revised') {
      return [id, (panel[id] ?? []).filter(point => point.availableOn <= date).slice(-WINDOW[id])]
    }
    const [availableOn, rows] = Array.isArray(entry) ? entry : [entry.vintage, entry.rows]
    let previous
    return [id, rows.map(row => {
      const [observedOn, value] = Array.isArray(row) ? row : [addDays(previous, 7), row]
      previous = observedOn
      const release = id === 'AWHMAN' ? monthEnd(observedOn, RELEASE_MONTHS.AWHMAN) : availableOn
      return { observedOn, availableOn: release > availableOn ? release : availableOn, value }
    })]
  })
  return { ...panel, ...Object.fromEntries(snapshots) }
}
