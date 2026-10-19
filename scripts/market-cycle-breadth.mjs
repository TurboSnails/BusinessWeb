// Constituent MA200 breadth for the long-cycle board. Index constituents only (not the whole A-share market).
// Official constituent lists + verified forward-adjusted daily bars, fetched in resumable batches into a gitignored cache.
// Anything that cannot be verified is reported as missing/progress; nothing is inferred or back-filled.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchHkUniverse, isOfficialHkSource } from './market-cycle-hk-universe.mjs'

export const OUT_FILE = fileURLToPath(new URL('../public/data/market-cycle-breadth.json', import.meta.url))
export const UNIVERSE_FILE = fileURLToPath(new URL('../public/data/market-cycle-universes.json', import.meta.url))
const XLS_PY = fileURLToPath(new URL('./market-cycle-universe-xls.py', import.meta.url))
const DEFAULT_CACHE = fileURLToPath(new URL('../.cache/market-cycle-breadth', import.meta.url))
const UA = 'Mozilla/5.0'

export const MA_WINDOW = 200
export const MIN_BARS = 220 // 200 for the MA plus 20 prior trading days of the same pool
export const FETCH_BARS = 260
export const PRIOR_DAYS = 28
export const MIN_COVERAGE = 0.95
export const DEFAULT_BUDGET = 40
export const CONCURRENCY = 2 // also the maximum
export const CACHE_MAX_AGE_DAYS = 6
export const UNIVERSE_MAX_AGE_DAYS = 7
export const CONFIRM_MAX_DAYS = 21 // an official list counts as current only if re-confirmed this recently
export const MAX_BUDGET = 40
const BREAKER = 5
const REQUEST_TIMEOUT_MS = 15000

export const CSI300_XLS = 'https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/cons/000300cons.xls'
export const TENCENT = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get'
export const EASTMONEY_HK = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const HK_BARS_SRC = 'em-fqt1' // Eastmoney kline fqt=1 (forward-adjusted); Tencent has no HK qfq
export const MARKETS = {
  csi300: { id: 'csi300-constituents', name: '沪深300' },
  hsi: { id: 'hsi-constituents', name: '恒生指数' },
  hstech: { id: 'hstech-constituents', name: '恒生科技' },
}

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
const errText = e => (e instanceof Error ? e.message : String(e)).slice(0, 200)

/** Tencent symbol for a constituent code, or null when the exchange cannot be determined. */
export function tencentSymbol(market, code) {
  if (market === 'csi300') {
    if (!/^\d{6}$/.test(code)) return null
    if (/^(6|9)/.test(code)) return `sh${code}`
    if (/^(0|2|3)/.test(code)) return `sz${code}`
    return null
  }
  return /^\d{1,5}$/.test(code) ? `hk${code.padStart(5, '0')}` : null
}

/** Tencent fqkline body -> ascending [date, close] pairs. Only an explicit `qfqday` (forward-adjusted) array is accepted. */
export function parseBars(body, symbol, today) {
  const raw = body?.data?.[symbol]?.qfqday
  if (!Array.isArray(raw)) throw new Error('缺少前复权日线qfqday')
  const seen = new Map()
  for (const r of raw) {
    const close = Number(r?.[2])
    if (!isDate(r?.[0]) || r[0] > today || !Number.isFinite(close) || close <= 0) continue
    seen.set(r[0], close)
  }
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/** Eastmoney HK kline body -> ascending [date, close], last FETCH_BARS rows. Response identity (rc/code/market) is verified; bars are forward-adjusted only because the request explicitly sets fqt=1. */
export function parseEastmoneyHkBars(body, code, today) {
  if (body?.rc !== 0) throw new Error(`东财接口rc=${body?.rc ?? '无'}`)
  const d = body.data
  const padded = String(code).padStart(5, '0')
  if (!d || d.market !== 116 || String(d.code ?? '').padStart(5, '0') !== padded) throw new Error(`东财返回身份不符 ${d?.market}/${d?.code}`)
  if (!Array.isArray(d.klines) || !d.klines.length) throw new Error('东财无K线')
  const seen = new Map()
  for (const r of d.klines) {
    const f = typeof r === 'string' ? r.split(',') : null
    const close = Number(f?.[2])
    if (!f || !isDate(f[0]) || f[0] > today || !Number.isFinite(close) || close <= 0) continue
    seen.set(f[0], close)
  }
  const bars = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  if (!bars.length) throw new Error('东财无有效日线')
  return bars.slice(-FETCH_BARS)
}

/** Eastmoney forward-adjusted (fqt=1) HK daily bars; bounded ~400d window, counts as one request. */
async function fetchEastmoneyHkBars({ code, fetchImpl, today }) {
  const digits = s => s.replaceAll('-', '')
  const fields = 'fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57'
  const url = `${EASTMONEY_HK}?secid=116.${String(code).padStart(5, '0')}&${fields}&klt=101&fqt=1&beg=${digits(addDays(today, -400))}&end=${digits(today)}&lmt=${FETCH_BARS}`
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, referer: 'https://quote.eastmoney.com/' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseEastmoneyHkBars(await res.json(), code, today)
}

/** Cached bars -> clean ascending [date, close] up to `today`, or null when the shape is corrupt (unordered, duplicate, non-finite). */
export function sanitizeBars(raw, today) {
  if (!Array.isArray(raw)) return null
  let prev = ''
  const out = []
  for (const b of raw) {
    if (!Array.isArray(b) || !isDate(b[0]) || typeof b[1] !== 'number' || !Number.isFinite(b[1]) || b[1] <= 0 || b[0] <= prev) return null
    prev = b[0]
    if (b[0] <= today) out.push(b)
  }
  return out
}

/** Index of the bar dated exactly `date`, or -1. */
function indexOnDate(bars, date) {
  let lo = 0, hi = bars.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid][0] === date) return mid
    if (bars[mid][0] < date) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}

/** Number of bars up to and including index `i` plus the simple MA200 ending there (null when fewer than 200). */
function maAt(bars, i) {
  if (i + 1 < MA_WINDOW) return null
  let sum = 0
  for (let k = i - MA_WINDOW + 1; k <= i; k++) sum += bars[k][1]
  return sum / MA_WINDOW
}

/**
 * Latest date, not after `limit`, on which at least `need` securities have a real bar. Candidates are the securities' own
 * last bars (<= limit); ties on count are not possible to improve by an older date, so the newest qualifying date wins.
 * Returns { date, count } for the qualifying date, or the best-supported date (count < need) when none qualifies.
 */
function unifiedDate(series, limit, need) {
  const counts = new Map()
  for (const bars of series) {
    const dates = new Set()
    for (const [d] of bars) if (d <= limit) dates.add(d)
    for (const d of dates) counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  let best = null, qualified = null
  for (const [date, count] of counts) {
    if (count >= need && (!qualified || date > qualified.date)) qualified = { date, count }
    if (!best || count > best.count || (count === best.count && date > best.date)) best = { date, count }
  }
  return qualified ? { ...qualified, ok: true } : best ? { ...best, ok: false } : null
}

/**
 * Pure breadth computation. `members`: [{code}], `barsByCode`: Map code -> ascending [date, close] (missing key = not fetched,
 * null = fetch failed, corrupt array = invalid_cache). One observation date is chosen on which >=95% of the pool has a real bar;
 * a security without a bar on exactly that day is excluded (never an older price standing in). The prior date is the latest
 * date <= observation-28d with the same >=95% support, so a whole-market holiday falls back to the last trading day.
 * Returns { observationDate, priorDate, total, eligible, coverage, breadth, priorBreadth, exclusions }.
 */
export function computeBreadth(members, barsByCode, today) {
  const exclusions = {}
  const bump = k => { exclusions[k] = (exclusions[k] ?? 0) + 1 }
  const total = members.length
  const need = Math.ceil(total * MIN_COVERAGE)
  const clean = new Map()
  for (const { code } of members) {
    const raw = barsByCode.get(code)
    if (raw === undefined) bump('not_fetched')
    else if (raw === null) bump('fetch_failed')
    else {
      const bars = sanitizeBars(raw, today)
      if (!bars) bump('invalid_cache')
      else if (!bars.length) bump('no_valid_bars')
      else clean.set(code, bars)
    }
  }
  const empty = (observationDate = null) => ({ observationDate, priorDate: null, total, eligible: 0, coverage: 0, breadth: null, priorBreadth: null, exclusions })
  const obs = unifiedDate([...clean.values()], today, need)
  if (!obs) return empty()
  const observationDate = obs.date
  const rows = []
  for (const bars of clean.values()) {
    const i = indexOnDate(bars, observationDate)
    if (i < 0) { bump('suspended_or_stale'); continue }
    if (i + 1 < MIN_BARS) { bump('insufficient_history'); continue }
    rows.push({ bars, i })
  }
  if (!obs.ok) return { ...empty(observationDate), eligible: rows.length, coverage: total ? Math.round((rows.length / total) * 10000) / 10000 : 0 }
  const prior = unifiedDate(rows.map(r => r.bars), addDays(observationDate, -PRIOR_DAYS), need)
  if (!prior?.ok) {
    for (const _ of rows) bump('no_prior_trading_day')
    return { ...empty(observationDate), eligible: rows.length,
      coverage: total ? Math.round((rows.length / total) * 10000) / 10000 : 0 }
  }
  let above = 0, priorAbove = 0, eligible = 0
  for (const { bars, i } of rows) {
    const j = indexOnDate(bars, prior.date)
    if (j < 0) { bump('suspended_or_stale_prior'); continue }
    if (j + 1 < MA_WINDOW) { bump('insufficient_prior_history'); continue }
    eligible++
    if (bars[i][1] > maAt(bars, i)) above++
    if (bars[j][1] > maAt(bars, j)) priorAbove++
  }
  const coverage = total ? eligible / total : 0
  const ok = eligible >= need && eligible > 0
  const pct = n => Math.round((n / eligible) * 1000) / 10
  return { observationDate, priorDate: prior.date, total, eligible, coverage: Math.round(coverage * 10000) / 10000,
    breadth: ok ? pct(above) : null, priorBreadth: ok ? pct(priorAbove) : null, exclusions }
}

const isUrl = s => { try { return typeof s === 'string' && new URL(s).protocol === 'https:' } catch { return false } }
const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(s) && Number.isFinite(Date.parse(s))

/** List validation: valid effective date and https source, unique codes, plausible size, optional ISO confirmation time. */
export function validateUniverse(u, today, { min = 250, max = 350, pattern = /^\d{6}$/ } = {}) {
  if (!u || !isDate(u.date) || u.date > today) throw new Error('名单日期无效')
  if (u.source !== undefined && !isUrl(u.source)) throw new Error('名单source无效')
  if (u.fetchedAt !== undefined && (!isIso(u.fetchedAt) || u.fetchedAt.slice(0, 10) > today)) throw new Error('名单fetchedAt无效')
  if (!Array.isArray(u.codes) || u.codes.length < min || u.codes.length > max || new Set(u.codes).size !== u.codes.length) throw new Error('名单规模或重复异常')
  if (!u.codes.every(c => typeof c === 'string' && pattern.test(c))) throw new Error('名单代码格式异常')
  return u
}

/** Which securities to request now: never fetched first, then failed/oldest; fresh cache entries cost nothing. */
export function selectBatch(members, meta, today, budget) {
  const stale = []
  for (const { code } of members) {
    const m = meta[code]
    if (m && typeof m.fetchedAt === 'string' && !m.failedAt && daysBetween(m.fetchedAt.slice(0, 10), today) <= CACHE_MAX_AGE_DAYS) continue
    stale.push({ code, key: m ? String(m.failedAt ?? m.fetchedAt ?? '') : '' })
  }
  stale.sort((a, b) => a.key.localeCompare(b.key) || a.code.localeCompare(b.code))
  return stale.slice(0, Math.max(0, budget)).map(s => s.code)
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return null }
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, `${JSON.stringify(value)}\n`)
  await rename(tmp, file)
}

async function fetchJson(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function runPython(python, script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-I', script], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', err = ''
    const timer = setTimeout(() => child.kill(), 30000)
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', e => { clearTimeout(timer); reject(e) })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(err.trim().split('\n').at(-1) || `exit ${code}`)) })
    child.stdin.end(input)
  })
}

/** Download + parse the official CSI300 list (counts as one request). */
export async function fetchCsi300Universe({ fetchImpl = fetch, parseXls, python = process.env.MARKET_CYCLE_PYTHON || 'python3', today }) {
  const res = await fetchImpl(CSI300_XLS, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1000 || buf.readUInt32BE(0) !== 0xd0cf11e0) throw new Error('不是xls文件')
  const parsed = JSON.parse(await (parseXls ? parseXls(buf) : runPython(python, XLS_PY, buf)))
  if (parsed.indexCode !== '000300') throw new Error(`指数代码不符 ${parsed.indexCode}`)
  return validateUniverse({ date: parsed.date, source: CSI300_XLS, codes: parsed.rows.map(r => r.code) }, today)
}

/** Bounded-concurrency fetch of the selected securities; stops early after BREAKER consecutive failures. */
async function fetchBatch({ market, codes, fetchImpl, today, meta, cacheDir, concurrency }) {
  let next = 0, streak = 0, requests = 0
  const failures = []
  const worker = async () => {
    while (next < codes.length && streak < BREAKER) {
      const code = codes[next++]
      const sym = tencentSymbol(market, code)
      const now = new Date().toISOString()
      if (!sym) { meta[code] = { ...meta[code], fetchedAt: meta[code]?.fetchedAt ?? '1970-01-01T00:00:00Z', failedAt: now, error: '无法确定交易所' }; continue }
      requests++
      try {
        const bars = market === 'csi300'
          ? parseBars(await fetchJson(fetchImpl, `${TENCENT}?param=${sym},day,,,${FETCH_BARS},qfq`), sym, today)
          : await fetchEastmoneyHkBars({ code, fetchImpl, today })
        if (!bars.length) throw new Error('无有效日线')
        await writeJson(path.join(cacheDir, 'bars', barsDir(market), `${code}.json`), bars)
        meta[code] = { fetchedAt: now, last: bars.at(-1)[0], n: bars.length, src: market === 'csi300' ? 'tencent-qfq' : HK_BARS_SRC }
        streak = 0
      } catch (e) {
        streak++
        failures.push(`${code}: ${errText(e)}`)
        meta[code] = { ...meta[code], fetchedAt: meta[code]?.fetchedAt ?? '1970-01-01T00:00:00Z', failedAt: now, error: errText(e) }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return { requests, failures, tripped: streak >= BREAKER }
}

/** Bars cache subdirectory per market; HK uses a -em suffix so stale Tencent HK raw caches can never mix with Eastmoney fqt=1 bars. */
const barsDir = market => (market === 'csi300' ? 'csi300' : `${market}-em`)
const expectedSrc = market => (market === 'csi300' ? 'tencent-qfq' : HK_BARS_SRC)

/** Loads cached bars; a corrupt file or wrong-source meta entry drops so the next round re-requests it. */
async function loadBars(cacheDir, market, members, meta, today) {
  const map = new Map()
  await Promise.all(members.map(async ({ code }) => {
    const m = meta[code]
    if (!m) return
    if (m.src !== undefined && m.src !== expectedSrc(market)) { delete meta[code]; return }
    const bars = await readJson(path.join(cacheDir, 'bars', barsDir(market), `${code}.json`))
    if (bars !== null && sanitizeBars(bars, today)?.length) map.set(code, bars)
    else if (m.failedAt) map.set(code, null)
    else { map.set(code, bars ?? []); delete meta[code] }
  }))
  return map
}

/** Reuse the same HK security's verified Eastmoney bars across pools (codes may differ only by leading zeroes).
 * Freshness and provenance are retained; corrupt, failed, future or stale entries never suppress a real fetch.
 */
async function reuseHkBars(cacheDir, market, members, meta, today) {
  const peers = [market, market === 'hsi' ? 'hstech' : 'hsi']
  for (const peer of peers) {
    const stored = peer === market ? { ...meta } : await readJson(path.join(cacheDir, `meta-${peer}.json`))
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) continue
    const byCode = new Map(Object.entries(stored).filter(([code]) => /^\d{1,5}$/.test(code)).map(([code, m]) => [code.padStart(5, '0'), { code, m }]))
    for (const { code } of members) {
      const candidate = byCode.get(code.padStart(5, '0'))
      const m = candidate?.m
      const age = m?.fetchedAt && daysBetween(m.fetchedAt.slice(0, 10), today)
      if (!m || m.src !== HK_BARS_SRC || m.failedAt || !isIso(m.fetchedAt) || age < 0 || age > CACHE_MAX_AGE_DAYS) continue
      const own = meta[code]
      if (own?.src === HK_BARS_SRC && !own.failedAt && own.fetchedAt >= m.fetchedAt && peer !== market) continue
      if (peer === market && candidate.code === code) continue
      const bars = await readJson(path.join(cacheDir, 'bars', barsDir(peer), `${candidate.code}.json`))
      if (!sanitizeBars(bars, today)?.length) continue
      await writeJson(path.join(cacheDir, 'bars', barsDir(market), `${code}.json`), bars)
      meta[code] = { ...m }
    }
  }
}

export const clampBudget = v => {
  const n = Math.floor(Number(v ?? DEFAULT_BUDGET))
  return Number.isFinite(n) ? Math.min(MAX_BUDGET, Math.max(0, n)) : DEFAULT_BUDGET
}
export const clampConcurrency = v => {
  const n = Math.floor(Number(v ?? CONCURRENCY))
  return Number.isFinite(n) ? Math.min(CONCURRENCY, Math.max(1, n)) : CONCURRENCY
}

/**
 * One market entry. `universe.date` is the list's effective date (may legitimately be months old); whether it is still the
 * current list is judged by `confirmedAt`, the last time the official source was re-fetched. Without a verified confirmation
 * time (static configuration) the entry is proxy and cannot vote.
 */
export function buildMarketEntry(market, universe, result, today, extraDetail = '', { dateLabel = '名单生效日', barsNote = '腾讯前复权日线' } = {}) {
  const confirmedOk = !!universe.confirmedAt && daysBetween(universe.confirmedAt.slice(0, 10), today) <= CONFIRM_MAX_DAYS
  const kind = confirmedOk ? 'observed' : 'proxy'
  const ex = Object.entries(result.exclusions).map(([k, v]) => `${k} ${v}`).join('、')
  const pct = `${(result.coverage * 100).toFixed(1)}%`
  const stale = result.observationDate && daysBetween(result.observationDate, today) > 14
  const detail = [result.breadth === null
    ? `进度/缺失：合格 ${result.eligible}/${result.total}（${pct}），未达${MIN_COVERAGE * 100}%门槛，不给宽度`
    : `当期与前期使用同一批 ${result.eligible} 只成分，统一观测日 ${result.observationDate}，对照日 ${result.priorDate}，覆盖 ${pct}`,
  ex && `排除：${ex}`,
  kind === 'proxy' ? (universe.confirmedAt ? `名单最近官方确认 ${universe.confirmedAt.slice(0, 10)} 超过${CONFIRM_MAX_DAYS}天，按proxy记录` : '名单无自动官方确认时间，按proxy记录') : '',
  stale ? `统一观测日 ${result.observationDate} 已早于今日超过14天` : '',
  `${dateLabel} ${universe.date}`,
  `指数成分内MA200以上占比，非全A股；${barsNote}，个股须在统一观测日有真实日线且不少于220日`, extraDetail].filter(Boolean).join('。')
  return { universeId: MARKETS[market].id, universeDate: universe.date, source: universe.source, kind,
    observationDate: result.observationDate ?? universe.date, coverage: result.coverage, eligible: result.eligible, total: result.total,
    breadth: result.breadth, priorBreadth: result.priorBreadth, exclusions: result.exclusions, detail }
}

/** A cached/published CSI300 list is reusable only if it validates; otherwise it is ignored. */
function usableUniverse(u, today) {
  try { return u && validateUniverse({ ...u, source: u.source ?? CSI300_XLS }, today) && { ...u, source: u.source ?? CSI300_XLS } } catch { return null }
}

/** A cached/published official HK list is reusable only if it validates AND carries the exact whitelisted official source URL. */
function usableHkUniverse(u, today, market) {
  try { return u && isOfficialHkSource(u, market) && validateUniverse(u, today, { min: 20, max: 120, pattern: /^\d{1,5}$/ }) && u } catch { return null }
}

/**
 * One resumable round. Options are injectable for tests: fetchImpl, parseXls, cacheDir, budget, now, outFile, universeFile.
 * Request budget (clamped to 0..40, concurrency to <=2) covers the list download and every stock request.
 */
export async function run(opts = {}) {
  const { fetchImpl = fetch, parseXls, now = new Date(), outFile = OUT_FILE, universeFile = UNIVERSE_FILE,
    cacheDir = process.env.MARKET_CYCLE_CACHE_DIR || DEFAULT_CACHE } = opts
  const budget = clampBudget(opts.budget ?? process.env.MARKET_CYCLE_BREADTH_BUDGET)
  const concurrency = clampConcurrency(opts.concurrency)
  const today = now.toISOString().slice(0, 10)
  const issues = []
  const markets = {}
  let used = 0
  const remaining = () => budget - used

  const published = await readJson(universeFile)
  const cached = usableUniverse(await readJson(path.join(cacheDir, 'universe-csi300.json')), today)
  const fallback = usableUniverse(published?.universes?.csi300?.status === 'ok' ? published.universes.csi300 : null, today)
  // The newest confirmation wins; losing the cache falls back to the committed list with its own fetchedAt.
  let csi = [cached, fallback].filter(Boolean).sort((a, b) => (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? ''))[0] ?? null
  const confirmedDay = csi?.fetchedAt?.slice(0, 10)
  if (!csi || !confirmedDay || daysBetween(confirmedDay, today) > UNIVERSE_MAX_AGE_DAYS) {
    if (remaining() > 0) {
      used++
      try {
        const fresh = await fetchCsi300Universe({ fetchImpl, parseXls, today })
        csi = { ...fresh, source: CSI300_XLS, fetchedAt: now.toISOString() }
        await writeJson(path.join(cacheDir, 'universe-csi300.json'), csi)
      } catch (e) {
        issues.push(`沪深300官方名单更新失败，沿用${csi ? `生效日 ${csi.date}、最近确认 ${csi.fetchedAt ?? '未知'}` : '无'}的名单：${errText(e)}`)
      }
    } else issues.push('请求预算为0或耗尽，未更新沪深300名单')
  }

  const universes = {}
  const process_ = async (m, list, confirmedAt, cap, { note = '', dateLabel, barsNote } = {}) => {
    const members = list.codes.map(code => ({ code }))
    const metaFile = path.join(cacheDir, `meta-${m}.json`)
    const stored = await readJson(metaFile)
    const meta = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
    for (const [k, v] of Object.entries(meta)) if (!v || typeof v.fetchedAt !== 'string' || !Number.isFinite(Date.parse(v.fetchedAt))) delete meta[k]
    // Drop corrupt own caches before comparing timestamps with a valid peer.
    await loadBars(cacheDir, m, members, meta, today)
    if (m !== 'csi300') await reuseHkBars(cacheDir, m, members, meta, today)
    const r = await fetchBatch({ market: m, codes: selectBatch(members, meta, today, cap), fetchImpl, today, meta, cacheDir, concurrency })
    used += r.requests
    const bars = await loadBars(cacheDir, m, members, meta, today)
    await writeJson(metaFile, meta)
    if (r.failures.length) issues.push(`${MARKETS[m].name}逐股日线失败 ${r.failures.length} 只，例：${r.failures.slice(0, 3).join('；')}`)
    if (r.tripped) issues.push(`${MARKETS[m].name}日线连续失败${BREAKER}次，本轮熔断`)
    const result = computeBreadth(members, bars, today)
    markets[m] = buildMarketEntry(m, { date: list.date, source: list.source, confirmedAt }, result, today, [`本轮请求 ${used}/${budget}`, note].filter(Boolean).join('，'), { dateLabel, barsNote })
    if (result.breadth === null) issues.push(`${MARKETS[m].name}宽度进度：合格 ${result.eligible}/${result.total}，待后续轮次补齐`)
  }
  if (csi) {
    // Already confirmed later markets get a fair share even while CSI300 is still filling.
    const laterPools = ['hsi', 'hstech'].filter(m => usableHkUniverse(published?.universes?.[m], today, m)).length
    await process_('csi300', csi, csi.fetchedAt, Math.ceil(remaining() / (1 + laterPools)))
    universes.csi300 = { id: MARKETS.csi300.id, date: csi.date, source: csi.source, fetchedAt: csi.fetchedAt, status: 'ok', codes: csi.codes }
  } else {
    issues.push('沪深300：无可用官方名单，宽度缺失')
    universes.csi300 = { id: MARKETS.csi300.id, status: 'missing', reason: '官方xls获取或解析失败且无缓存名单' }
  }
  for (const m of ['hsi', 'hstech']) {
    const configured = published?.universes?.[m]
    const cached = usableHkUniverse(await readJson(path.join(cacheDir, `universe-${m}.json`)), today, m)
    // A list published by a previous successful official fetch is the fallback when the cache is lost;
    // only the whitelisted official source URL can confirm a list, anything else stays unconfirmed.
    const fallback = usableHkUniverse(configured?.status === 'ok' ? configured : null, today, m)
    // The newest confirmation wins; a verified official list votes observed, anything else stays proxy.
    let list = [cached, fallback].filter(Boolean).sort((a, b) => (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? ''))[0] ?? null
    if (!list || !list.fetchedAt || daysBetween(list.fetchedAt.slice(0, 10), today) > UNIVERSE_MAX_AGE_DAYS) {
      if (remaining() > 0) {
        used++
        try {
          const fresh = await fetchHkUniverse({ market: m, fetchImpl, today })
          list = { ...fresh, fetchedAt: now.toISOString() }
          await writeJson(path.join(cacheDir, `universe-${m}.json`), list)
        } catch (e) {
          issues.push(`${MARKETS[m].name}官方名单更新失败，沿用${list ? `快照日 ${list.date}、最近确认 ${list.fetchedAt ?? '未知'}` : '无'}的名单：${errText(e)}`)
        }
      } else issues.push(`请求预算为0或耗尽，未更新${MARKETS[m].name}名单`)
    }
    if (list) {
      const laterPools = m === 'hsi' && usableHkUniverse(published?.universes?.hstech, today, 'hstech') ? 1 : 0
      await process_(m, list, list.fetchedAt, Math.ceil(remaining() / (1 + laterPools)), {
        note: '港股前复权日线来源为东方财富kline(fqt=1，已核定)；腾讯不提供港股前复权',
        dateLabel: '名单快照日（官方实时成分快照，非生效变更日）',
        barsNote: '东方财富前复权日线(fqt=1)',
      })
      universes[m] = { id: MARKETS[m].id, date: list.date, source: list.source, fetchedAt: list.fetchedAt, status: 'ok', codes: list.codes }
    } else {
      issues.push(`${MARKETS[m].name}：尚无经核定的完整当期成分名单，宽度缺失`)
      universes[m] = { id: MARKETS[m].id, status: 'missing', reason: configured?.status === 'ok' ? '静态名单来源不在官方白名单' : (configured?.reason ?? '官方全成分端点获取失败且无已确认名单；不使用静态旧名单冒充当期') }
    }
  }
  await writeJson(universeFile, { schemaVersion: 1, generatedAt: now.toISOString(), universes })
  const snapshot = { schemaVersion: 1, generatedAt: now.toISOString(), markets, issues }
  await writeJson(outFile, snapshot)
  return { snapshot, requests: used }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().then(({ snapshot, requests }) => {
    for (const [m, b] of Object.entries(snapshot.markets)) console.log(`${m}: ${b.eligible}/${b.total} coverage ${b.coverage} breadth ${b.breadth} prior ${b.priorBreadth} (obs ${b.observationDate}, ${b.kind})`)
    for (const i of snapshot.issues) console.log(`issue: ${i}`)
    console.log(`requests: ${requests}`)
  }).catch(e => { console.error(errText(e)); process.exit(1) })
}
