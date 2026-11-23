import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseMultpl } from '../../us-market-data.mjs'
import { monthEnd } from '../macro-posture/panel.mjs'
import { makeCandidateSeries } from './series.mjs'

const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id='
const MULTPL = 'https://www.multpl.com/'
const TIMEOUT_MS = 30_000
const CACHE_ROOT = join(tmpdir(), 'macro-posture-research-cache')

function cacheDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function cacheDir(now = new Date()) {
  return join(CACHE_ROOT, cacheDay(now))
}

export function researchCacheDir(now = new Date()) {
  return cacheDir(now)
}

async function cached(key, loader, { noCache = false, now = new Date() } = {}) {
  const directory = cacheDir(now)
  await mkdir(directory, { recursive: true })
  const file = join(directory, createHash('sha1').update(key).digest('hex') + '.txt')
  if (!noCache) {
    try {
      return await readFile(file, 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  const body = await loader()
  await writeFile(file, body)
  return body
}

function parseFred(csv, id) {
  const [header, ...body] = csv.trim().split(/\r?\n/)
  if (!['observation_date', 'DATE'].some(name => header === `${name},${id}`)) {
    throw new Error(`FRED ${id} 表头不匹配：${header}`)
  }
  return body.flatMap(line => {
    const [day, raw] = line.split(',')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !raw?.trim() || !Number.isFinite(Number(raw))) return []
    return [[day, Number(raw)]]
  })
}

/** multpl 千分位逗号先清掉，再 parseMultpl */
export function parseMultplMonthly(html, completeThrough) {
  const ungrouped = html.replace(/(\d),(?=\d{3}\b)/g, '$1')
  return parseMultpl(ungrouped).history.filter(([date]) => !completeThrough || monthEnd(date) <= completeThrough)
}

async function fetchText(fetcher, url) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return response.text()
}

export async function fetchFredSeries(id, fetcher = fetch, { noCache = false, now = new Date() } = {}) {
  const csv = await cached(`fred:${id}`, () => fetchText(fetcher, FRED + id), { noCache, now })
  return makeCandidateSeries(id, parseFred(csv, id))
}

export async function fetchEps(fetcher = fetch, completeThrough, { noCache = false, now = new Date() } = {}) {
  const html = await cached('multpl:eps', () => fetchText(fetcher, MULTPL + 's-p-500-earnings/table/by-month'), {
    noCache,
    now,
  })
  return makeCandidateSeries('EPS', parseMultplMonthly(html, completeThrough))
}

export function loadCapeFromLocal(usMarketData) {
  const rows = usMarketData?.series?.shillerCape?.history
  if (!Array.isArray(rows) || !rows.length) throw new Error('本地 us-market-data 缺少 shillerCape')
  const from1900 = rows.filter(([day, value]) => day >= '1900-01-01' && Number.isFinite(value))
  return makeCandidateSeries('CAPE', from1900)
}

export async function fetchCandidateExtras(fetcher = fetch, {
  completeThrough,
  usMarketData,
  noCache = false,
  now = new Date(),
} = {}) {
  const opts = { noCache, now }
  const [DGS2, PERMIT, AWHMAN, DRTSCILM, EPS] = await Promise.all([
    fetchFredSeries('DGS2', fetcher, opts),
    fetchFredSeries('PERMIT', fetcher, opts),
    fetchFredSeries('AWHMAN', fetcher, opts),
    fetchFredSeries('DRTSCILM', fetcher, opts),
    fetchEps(fetcher, completeThrough, opts),
  ])
  return {
    DGS2, PERMIT, AWHMAN, DRTSCILM, EPS,
    CAPE: loadCapeFromLocal(usMarketData),
  }
}

export { CACHE_ROOT as CACHE_DIR, parseFred }
