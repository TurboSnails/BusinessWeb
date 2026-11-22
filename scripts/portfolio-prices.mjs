// Portfolio price pipeline: Yahoo adjusted history, Tencent raw-close cross-check.
// Local acceptance must use PORTFOLIO_YF_CMD with the offline fixture; do not query Yahoo locally.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UNIVERSE_FILE = join(ROOT, 'scripts/portfolio-prices/universe.json')
const DEFAULT_OUT = join(ROOT, 'public/data/portfolio-prices')
const DAY = /^\d{4}-\d{2}-\d{2}$/
const lastTencentRequestAt = new WeakMap()
export const knownEvents = { HOOD: [{ date: '2021-08-04', min: 0.45, max: 0.55, note: 'HOOD 首个交易周的单日约 +50% 波动' }] }
const round6 = n => Number(Number(n).toPrecision(6))
const errorText = e => String(e?.message ?? e).slice(0, 180)

export function crossCheck(yahooRows, tencentRows, { asOf = null } = {}) {
  const cutoff = asOf ? `${Number(asOf.slice(0, 4)) - 2}${asOf.slice(4)}` : null
  const yf = new Map(yahooRows.filter(r => DAY.test(r[0]) && Number.isFinite(Number(r[1])) && (!cutoff || r[0] >= cutoff)).map(r => [r[0], Number(r[1])]))
  const tq = new Map(tencentRows.filter(r => DAY.test(r[0]) && Number.isFinite(Number(r[1])) && (!cutoff || r[0] >= cutoff)).map(r => [r[0], Number(r[1])]))
  if (!yf.size || !tq.size) return { ok: false, mismatches: 1, reason: '交叉核对：最近两年没有可比较的日线' }
  let mismatches = 0
  for (const [date, close] of yf) {
    if (!tq.has(date) || Math.abs(close - tq.get(date)) / Math.max(Math.abs(close), 1e-9) > 0.005) mismatches++
  }
  for (const date of tq.keys()) if (!yf.has(date)) mismatches++
  return { ok: mismatches === 0, mismatches, reason: mismatches ? `交叉核对：最近两年 ${mismatches} 个日期缺失或收盘差异超过 0.5%` : null }
}
const crossCheckRows = (yahooRows, tencentRows, asOf) => crossCheck(yahooRows, tencentRows, { asOf })
function yahooRowsInRecentWindow(rows, asOf) {
  const cutoff = `${Number(asOf.slice(0, 4)) - 2}${asOf.slice(4)}`
  return new Set(rows.filter(r => DAY.test(r[0]) && r[0] >= cutoff && r[0] <= asOf).map(r => r[0])).size
}

export function buildSeries(rows, { validFrom } = {}) {
  const byDate = new Map()
  for (const row of rows ?? []) {
    if (!Array.isArray(row) || !DAY.test(row[0])) continue
    const close = Number(row[1]), adjClose = Number(row[2])
    if (Number.isFinite(close) && close > 0 && Number.isFinite(adjClose) && adjClose > 0 && (!validFrom || row[0] >= validFrom)) byDate.set(row[0], { date: row[0], close: round6(close), adjClose: round6(adjClose) })
  }
  return Object.values(Object.fromEntries([...byDate].sort(([a], [b]) => a.localeCompare(b))))
    .reduce((out, row) => { out.dates.push(row.date); out.close.push(row.close); out.adjClose.push(row.adjClose); return out }, { dates: [], close: [], adjClose: [] })
}

export function assessSeries(series, events = []) {
  for (let i = 1; i < series.adjClose.length; i++) {
    const ret = series.adjClose[i] / series.adjClose[i - 1] - 1
    if (Math.abs(ret) > 0.5) {
      const event = events.find(e => e.date === series.dates[i] && ret >= (e.min ?? -Infinity) && ret <= (e.max ?? Infinity))
      if (!event) return { status: 'stale', statusNote: `单日复权收益 ${(ret * 100).toFixed(1)}% 超过 ±50%，未列入已知事件` }
    }
  }
  return { status: 'ok', statusNote: null }
}

export function dividendState(previous, dividends) {
  const hadDividends = Boolean(previous?.dividends?.length || previous?.dividendStatus === 'ok' || previous?.dividendStatus === 'missing')
  if (dividends?.length) return 'ok'
  return hadDividends ? 'missing' : 'none'
}

export function mergeIndex(previous = { schemaVersion: 1, items: [] }, results = []) {
  const old = new Map((previous.items ?? []).map(x => [x.symbol, x]))
  for (const result of results) {
    const base = { symbol: result.symbol, name: result.name, group: result.group, first: result.first ?? old.get(result.symbol)?.first ?? '', last: result.last ?? old.get(result.symbol)?.last ?? '', asOf: result.asOf ?? old.get(result.symbol)?.asOf ?? '', status: result.status, ...(result.statusNote ? { statusNote: result.statusNote } : {}), ...(result.crossCheck ? { crossCheck: result.crossCheck } : {}), dividendStatus: result.dividendStatus ?? old.get(result.symbol)?.dividendStatus ?? 'none' }
    old.set(result.symbol, base)
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), items: [...old.values()] }
}

function runCommand(command, input) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, { cwd: ROOT, shell: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.setEncoding('utf8').on('data', x => { stdout += x })
    child.stderr.setEncoding('utf8').on('data', x => { stderr += x })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolvePromise(stdout) : reject(new Error(`采集命令退出 ${code}: ${stderr.slice(-300)}`)))
    child.stdin.end(JSON.stringify(input))
  })
}

export async function tencentRows(symbol, start, end, options = {}) {
  const { fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), retryDelayMs = 3000, now = () => Date.now(), warn = console.warn } = options
  const rows = []
  let from = start
  while (from <= end) {
    const nextYear = `${Number(from.slice(0, 4)) + 1}${from.slice(4)}`
    const to = nextYear < end ? nextYear : end
    const url = new URL('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get')
    url.searchParams.set('param', `${symbol},day,${from},${to},2000,`)
    let daily
    let lastError
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const previousRequestAt = lastTencentRequestAt.get(fetchImpl)
        const gap = previousRequestAt === undefined ? 0 : 1000 - (now() - previousRequestAt)
        if (gap > 0) await sleep(gap)
        lastTencentRequestAt.set(fetchImpl, now())
        const response = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) })
        const text = await response.text()
        if (!response.ok) {
          warn(`腾讯行情请求失败：HTTP ${response.status}，响应：${text.slice(0, 200)}`)
          throw new Error(`腾讯行情 HTTP ${response.status}`)
        }
        let body
        try { body = JSON.parse(text) }
        catch (e) {
          warn(`腾讯行情响应非 JSON：HTTP ${response.status}，响应：${text.slice(0, 200)}`)
          throw e
        }
        const entry = body.data?.[symbol]
        daily = entry?.day ?? entry?.qfqday ?? []
        if (!daily.length) {
          warn(`腾讯行情数据为空：HTTP ${response.status}，响应：${text.slice(0, 200)}`)
          throw new Error(`腾讯行情没有 ${symbol} 日线`)
        }
        break
      } catch (e) {
        lastError = e
        if (!(e instanceof SyntaxError) && !String(e?.message ?? e).startsWith('腾讯行情 HTTP ')) warn(`腾讯行情读取失败：${errorText(e)}`)
        if (attempt < 2) await sleep(retryDelayMs)
      }
    }
    if (!daily?.length) throw new Error(`腾讯行情 ${symbol} 重试 2 次仍失败：${errorText(lastError)}`)
    rows.push(...daily.map(r => [r[0], Number(r[2])]).filter(r => DAY.test(r[0]) && Number.isFinite(r[1])))
    if (to >= end) break
    from = `${Number(to.slice(0, 4))}-01-01`
    await sleep(1000)
  }
  return rows
}

/** Configured Tencent symbol first, followed by the three known US suffixes. */
export async function fetchTencentWithFallback(configured, start, end, options = {}) {
  const match = /^(us[A-Z0-9]+)\.(?:OQ|N|AM)$/.exec(configured)
  const candidates = [configured]
  if (match) for (const suffix of ['OQ', 'N', 'AM']) {
    const candidate = `${match[1]}.${suffix}`
    if (!candidates.includes(candidate)) candidates.push(candidate)
  }
  let lastError
  for (const candidate of candidates) {
    try {
      const rows = await tencentRows(candidate, start, end, options)
      if (!rows.length) throw new Error(`腾讯行情 ${candidate} 没有可用日线`)
      if (candidate !== configured) (options.log ?? console.log)(`腾讯代码回退：${configured} → ${candidate}`)
      return { symbol: candidate, rows }
    } catch (e) { lastError = e }
  }
  const message = `${configured} 及后缀回退均无数据：${errorText(lastError)}`
  ;(options.warn ?? console.warn)(message)
  return { symbol: null, rows: [], unavailable: true, error: message }
}

async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, 'utf8')) } catch (e) { if (e.code === 'ENOENT') return fallback; throw e } }

export async function main(args = process.argv.slice(2), options = {}) {
  const { fetchImpl = fetch, sleep, warn, log } = options
  const fixtureWithoutTencent = Boolean(process.env.PORTFOLIO_YF_CMD) && !Object.hasOwn(options, 'fetchImpl')
  const outArg = args.indexOf('--out')
  const outDir = resolve(outArg >= 0 ? args[outArg + 1] : DEFAULT_OUT)
  let universe = await readJson(UNIVERSE_FILE, [])
  const start = '2010-01-01'
  const yfCommand = process.env.PORTFOLIO_YF_CMD || 'uv run --python 3.12 --with yfinance==1.8.0 python scripts/portfolio-prices-yf.py'
  let raw
  try { raw = JSON.parse(await runCommand(yfCommand, { symbols: universe.map(x => x.symbol), start })) }
  catch (e) { console.error(errorText(e)); process.exitCode = 1; return }
  // Offline fixtures may intentionally return a small subset of the production universe.
  if (process.env.PORTFOLIO_YF_CMD) universe = universe.filter(item => Object.hasOwn(raw, item.symbol))
  await mkdir(outDir, { recursive: true })
  const priorIndex = await readJson(join(outDir, 'index.json'), { schemaVersion: 1, items: [] })
  const results = []
  let failures = 0
  for (const item of universe) {
    const yf = raw[item.symbol]
    const previous = await readJson(join(outDir, `${item.symbol}.json`), null)
    let reason = yf?.error || (!yf ? 'Yahoo 未返回此代码' : null), tq = [], series = { dates: [], close: [], adjClose: [] }, quality = { status: 'ok' }
    let crossCheckStatus = 'ok'
    let crossCheckDescription = null
    if (!reason) {
      try {
        const clean = buildSeries(yf.rows, { validFrom: item.validFrom })
        if (clean.dates.length < 2) throw new Error('有效日线不足')
        const from = clean.dates.at(-1) < '2024-01-01' ? '2024-01-01' : `${Number(clean.dates.at(-1).slice(0, 4)) - 2}${clean.dates.at(-1).slice(4)}`
        // A supplied collector command is reserved for offline fixtures and integration checks.
        let crossCheck
        if (fixtureWithoutTencent) {
          tq = clean.dates.map((date, i) => [date, clean.close[i]])
          crossCheck = crossCheckRows(yf.rows, tq, clean.dates.at(-1))
        } else {
          const tencent = await fetchTencentWithFallback(item.tencent, from, clean.dates.at(-1), { fetchImpl, sleep, warn, log })
          if (tencent.unavailable) {
            crossCheckStatus = 'unavailable'
            crossCheckDescription = '交叉核对暂不可用（腾讯无响应），仅 Yahoo'
          } else {
            tq = tencent.rows
            crossCheck = crossCheckRows(yf.rows, tq, clean.dates.at(-1))
            if (!crossCheck.ok) reason = crossCheck.reason
            else crossCheckDescription = `腾讯不复权日线，最近 2 年 ${yahooRowsInRecentWindow(yf.rows, clean.dates.at(-1))} 日一致`
          }
        }
        series = clean
        quality = assessSeries(series, item.symbol === 'HOOD' ? knownEvents.HOOD : [])
        if (quality.status !== 'ok') reason = quality.statusNote
      } catch (e) { reason = errorText(e) }
    }
    if (reason) {
      failures++
      results.push({ ...item, status: 'stale', statusNote: reason, asOf: previous?.asOf })
      continue // preserve previous series file
    }
    const asOf = series.dates.at(-1)
    const dividendStatus = dividendState(previous, yf.dividends)
    const body = { schemaVersion: 1, symbol: item.symbol, name: item.name, type: item.type, currency: 'USD', asOf, fetchedAt: new Date().toISOString(), source: { prices: 'Yahoo Finance（yfinance 1.8.0），复权收盘价含拆股与分红', crossCheck: crossCheckDescription ?? `腾讯不复权日线，最近 2 年 ${yahooRowsInRecentWindow(yf.rows, asOf)} 日一致` }, status: 'ok', dividendStatus, splits: yf.splits ?? [], dividends: yf.dividends ?? [], dates: series.dates, adjClose: series.adjClose, close: series.close }
    const bytes = JSON.stringify(body).length
    if (bytes > 150_000) delete body.close
    await writeFile(join(outDir, `${item.symbol}.json`), `${JSON.stringify(body)}\n`)
    results.push({ ...item, first: asOf && series.dates[0], last: asOf, asOf, status: 'ok', dividendStatus, crossCheck: crossCheckStatus })
  }
  await writeFile(join(outDir, 'index.json'), `${JSON.stringify(mergeIndex(priorIndex, results), null, 2)}\n`)
  if (failures) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
