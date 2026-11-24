import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { addDays, ageDays, monthEnd, RELEASE_MONTHS } from './panel.mjs'

const ALFRED = 'https://alfred.stlouisfed.org'
const CACHE = fileURLToPath(new URL('../../../data-raw/macro-posture-vintages', import.meta.url))
export const HISTORY_CACHE = fileURLToPath(new URL('../../../data-raw/macro-posture-vintage-history', import.meta.url))
const WINDOW = { PAYEMS: 15, INDPRO: 15, PCEPILFE: 15, IC4WSA: 53, AWHMAN: 15 }
const SERIES = Object.keys(WINDOW)
const V21_SERIES = SERIES.filter(id => id !== 'AWHMAN')
// The graph endpoint silently truncates requests to twelve columns.
const BATCH_SIZE = 12
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const RECHECK_DAYS = 10
const USER_AGENT = 'Mozilla/5.0 (compatible; MacroPostureBot/1.0)'

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

function makeRequester(fetcher) {
  let previousRequest = -Infinity
  const state = { requests: 0 }
  async function request(url, parse) {
    let cause
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const wait = 1000 - (performance.now() - previousRequest)
      if (wait > 0) await delay(Math.ceil(wait))
      previousRequest = performance.now()
      state.requests += 1
      try {
        const response = await fetcher(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(25_000),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return parse(await response.text())
      } catch (error) {
        cause = error
      }
    }
    throw new Error(`ALFRED ${url} 抓取失败：${cause.message}`, { cause })
  }
  return { request, state }
}

function snapshotRows(entry) {
  if (entry == null || entry.fallback === 'revised') return null
  if (Array.isArray(entry)) return { vintage: entry[0], rows: entry[1] }
  if (entry.vintage && entry.rows) return { vintage: entry.vintage, rows: entry.rows }
  return null
}

function revisedSeries(panel, id, date) {
  return (panel[id] ?? []).filter(point => point.availableOn <= date).slice(-WINDOW[id])
}

function seriesFromRows(id, availableOn, rows) {
  let previous
  return rows.map(row => {
    const [observedOn, value] = Array.isArray(row) ? row : [addDays(previous, 7), row]
    previous = observedOn
    const release = id === 'AWHMAN' ? monthEnd(observedOn, RELEASE_MONTHS.AWHMAN) : availableOn
    return { observedOn, availableOn: release > availableOn ? release : availableOn, value }
  })
}

// All series share one request schedule, including the release calendars and retries.
export async function loadVintages(monthEnds, { directory = CACHE, fetcher = fetch, now = new Date(), includeHours = false } = {}) {
  const days = [...new Set(monthEnds)].sort()
  const latest = days.at(-1)
  const fetchedAt = now.toISOString()
  const { request, state } = makeRequester(fetcher)

  const vintages = {}
  const incomplete = []
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
    const failedDays = []
    if (missing.length) {
      try {
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
          try {
            const url = `${ALFRED}/graph/alfredgraph.csv?id=${batch.map(() => id).join(',')}&vintage_date=${batch.join(',')}`
            const observations = await request(url, csv => vintageObservations(csv, id, batch))
            for (const [day, date] of byMonth) {
              if (observations.has(date)) store(day, observations.get(date))
            }
            await writeCache(path, cache, directory)
          } catch {
            for (const [day, date] of byMonth) {
              if (date && batch.includes(date) && !snapshotRows(cache[day])) failedDays.push(day)
            }
          }
        }
        if (!needed.length) await writeCache(path, cache, directory)
      } catch {
        for (const day of missing) {
          if (!snapshotRows(cache[day])) failedDays.push(day)
        }
      }
    } else if (migrated) {
      await writeCache(path, cache, directory)
    }
    const view = { ...cache }
    // 请求失败且磁盘上没有可用版本的月末：只在返回值里标 revised，不落盘。
    for (const day of [...new Set(failedDays)].sort()) view[day] = { fallback: 'revised' }
    for (const day of days) {
      if (!Object.hasOwn(view, day)) view[day] = { fallback: 'revised' }
    }
    const reported = [...new Set(failedDays)].sort()
    if (reported.length) incomplete.push({ id, days: reported })
    vintages[id] = view
  }
  return { vintages, requests: state.requests, incomplete }
}

export function panelWithVintages(panel, vintages, date) {
  const snapshots = (Object.hasOwn(vintages, 'AWHMAN') ? SERIES : V21_SERIES).map(id => {
    if (!Object.hasOwn(vintages[id] ?? {}, date)) throw new Error(`ALFRED ${id} 缺少 ${date} 的缓存`)
    const entry = vintages[id][date]
    if (entry === null || entry.fallback === 'revised') {
      return [id, revisedSeries(panel, id, date)]
    }
    const [availableOn, rows] = Array.isArray(entry) ? entry : [entry.vintage, entry.rows]
    return [id, seriesFromRows(id, availableOn, rows)]
  })
  return { ...panel, ...Object.fromEntries(snapshots) }
}

function seedHistoryFromMonthEnds(history, seed) {
  let added = 0
  for (const entry of Object.values(seed ?? {})) {
    const snapshot = snapshotRows(entry)
    if (!snapshot || Object.hasOwn(history, snapshot.vintage)) continue
    history[snapshot.vintage] = snapshot.rows
    added += 1
  }
  return added
}

/**
 * 按发布日保存的版本库。先用月末缓存做种子，再补 ALFRED 清单里尚未入库的发布日。
 * 请求失败时返回已有库并标 incomplete，不抛错。
 */
export async function loadVintageHistory({
  directory = HISTORY_CACHE, seed = {}, fetcher = fetch, now = new Date(), includeHours = true,
} = {}) {
  const { request, state } = makeRequester(fetcher)
  const history = {}
  const incomplete = []
  for (const id of includeHours ? SERIES : V21_SERIES) {
    const path = resolve(directory, id + '.json')
    const cache = await readCache(path)
    seedHistoryFromMonthEnds(cache, seed[id])
    let dates
    try {
      dates = await request(`${ALFRED}/series/downloaddata?seid=${id}`, vintageDates)
    } catch {
      incomplete.push({ id, days: Object.keys(cache).sort() })
      history[id] = cache
      await writeCache(path, cache, directory)
      continue
    }
    const needed = dates.filter(date => !Object.hasOwn(cache, date))
    const failed = []
    for (let offset = 0; offset < needed.length; offset += BATCH_SIZE) {
      const batch = needed.slice(offset, BATCH_SIZE + offset)
      try {
        const url = `${ALFRED}/graph/alfredgraph.csv?id=${batch.map(() => id).join(',')}&vintage_date=${batch.join(',')}`
        const observations = await request(url, csv => vintageObservations(csv, id, batch))
        for (const [date, snapshot] of observations) cache[date] = snapshot.rows
        await writeCache(path, cache, directory)
      } catch {
        failed.push(...batch)
      }
    }
    if (failed.length) incomplete.push({ id, days: failed.sort() })
    else await writeCache(path, cache, directory)
    history[id] = cache
  }
  return { history, requests: state.requests, incomplete, fetchedAt: now.toISOString() }
}

/**
 * 每个序列取「发布日 ≤ date」的最新版本拼成面板；该序列在 date 之前没有任何版本时，
 * 用修订值并按固定发布滞后取数（与 panelWithVintages 的 fallback 分支相同）。
 */
export function panelAtVintage(panel, history, date) {
  const ids = Object.hasOwn(history, 'AWHMAN') ? SERIES : V21_SERIES
  const snapshots = ids.map(id => {
    const releases = Object.keys(history[id] ?? {}).filter(day => day <= date).sort()
    const vintage = releases.at(-1)
    if (!vintage) return [id, revisedSeries(panel, id, date)]
    return [id, seriesFromRows(id, vintage, history[id][vintage])]
  })
  return { ...panel, ...Object.fromEntries(snapshots) }
}

/** 连续日子若选中同一组版本键，可复用拼好的面板。 */
export function vintageKey(history, date) {
  const ids = Object.hasOwn(history, 'AWHMAN') ? SERIES : V21_SERIES
  return ids.map(id => {
    const releases = Object.keys(history[id] ?? {}).filter(day => day <= date).sort()
    return releases.at(-1) ?? 'revised'
  }).join('|')
}
