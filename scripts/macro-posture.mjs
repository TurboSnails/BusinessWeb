import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMultpl } from './us-market-data.mjs'
import { localParts, MARKETS } from './lib/trading-calendar.mjs'
import { FRED_SPX, FRED_SPX_URL, makePanel, monthEnd, panelAt, valueAt } from './lib/macro-posture/panel.mjs'
import { buildCurrent, RULE_VERSION, TIER_DEFS } from './lib/macro-posture/model.mjs'
import { buildBacktest, MISSING_RECESSION_MARKS, updateLive } from './lib/macro-posture/backtest.mjs'
import { buildOuter, LOCAL_SOURCES } from './lib/macro-posture/outer.mjs'
import { validateComposite } from './lib/macro-posture/validate.mjs'

export { validateComposite }

const DATA = fileURLToPath(new URL('../public/data', import.meta.url))
const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id='
const MULTPL = 'https://www.multpl.com/'
export const FRED_IDS = [
  'SAHMREALTIME', 'IC4WSA', 'PAYEMS', 'INDPRO', 'PCEPILFE', 'BAA', 'AAA',
  'NFCI', 'NFCICREDIT', 'FEDFUNDS', 'GS10', 'TB3MS', 'USREC', 'SP500',
]
const OPTIONAL_FRED = { USREC: '美国衰退标记', SP500: '标普指数日收盘价' }
const MULTPL_SERIES = {
  price: 's-p-500-historical-prices/table/by-month',
  yield: 's-p-500-dividend-yield/table/by-month',
}
const TIMEOUT_MS = 20_000
const MARKET_SLICES = 'us-market-slices'
const YAHOO_SPX_URL = 'https://finance.yahoo.com/quote/%5EGSPC/history/'

export function parseMonthlyTable(html, completeThrough) {
  // The shared parser handles dates and estimate markers, but expects ungrouped numbers.
  const ungrouped = html.replace(/(\d),(?=\d{3}\b)/g, '$1')
  return parseMultpl(ungrouped).history.filter(([date]) => monthEnd(date) <= completeThrough)
}

function parseFred(csv, id) {
  const [header, ...body] = csv.trim().split(/\r?\n/)
  if (!['observation_date', 'DATE'].some(name => header === `${name},${id}`)) throw new Error('FRED 表头不匹配')
  return body.flatMap(line => {
    const [day, raw] = line.split(',')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !raw?.trim() || !Number.isFinite(Number(raw))) return []
    return [[day, Number(raw)]]
  })
}

async function collectOne(fetcher, id, url, parse) {
  let cause
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const rows = parse(await response.text())
      if (!rows.length) throw new Error('没有可用观测')
      return [id, rows]
    } catch (error) {
      cause = error
    }
  }
  throw new Error(`${id} 抓取失败：${cause.message}`, { cause })
}

export async function collectCore(asOf, fetcher) {
  const completeThrough = monthEnd(asOf, -1)
  const fred = id => collectOne(fetcher, id, FRED + id, text => parseFred(text, id))
  const results = await Promise.allSettled([
    ...FRED_IDS.map(id => Object.hasOwn(OPTIONAL_FRED, id) ? fred(id).catch(() => [id, []]) : fred(id)),
    ...Object.entries(MULTPL_SERIES).map(([id, path]) =>
      collectOne(fetcher, id, MULTPL + path, html => parseMonthlyTable(html, completeThrough))),
  ])
  const errors = results.filter(r => r.status === 'rejected').map(r => r.reason.message)
  if (errors.length) throw new Error(errors.join('\n'))
  return Object.fromEntries(results.map(r => r.value))
}

async function readLocal(directory) {
  const sources = [...LOCAL_SOURCES, MARKET_SLICES]
  const reads = await Promise.allSettled(sources.map(async name => {
    const body = JSON.parse(await readFile(resolve(directory, name + '.json'), 'utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('本地数据结构异常')
    return body
  }))
  return Object.fromEntries(sources.map((name, i) => [name, reads[i].status === 'fulfilled' ? reads[i].value : null]))
}

export function mergeSpxCloses(fred, market, through, warn) {
  const spx = Array.isArray(market?.slices) ? market.slices.find(slice => slice?.id === 'spx' && slice.symbol === '^GSPC') : undefined
  const local = Array.isArray(spx?.history) ? spx.history : []
  const merged = new Map(fred.filter(([date, value]) => date <= through && value > 0))
  const hasFred = merged.size > 0
  let hasLocal = false
  for (const row of local) {
    if (!Array.isArray(row)) continue
    const [date, value] = row
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > through ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date ||
      !Number.isFinite(value) || value <= 0) continue
    const baseline = merged.get(date)
    if (baseline != null && Math.abs(value - baseline) > baseline * 0.005) {
      const gap = (Math.abs(value / baseline - 1) * 100).toFixed(2)
      warn(`标普收盘 ${date}：站内 Yahoo Finance ${value}、FRED ${baseline}，相差 ${gap}%，采用站内收盘价。`)
    }
    merged.set(date, value)
    hasLocal = true
  }
  return {
    rows: [...merged].sort(([a], [b]) => a.localeCompare(b)),
    source: !hasLocal ? FRED_SPX : hasFred
      ? '标普 500 日收盘（站内 Yahoo Finance 行情优先，FRED 补充与交叉核对）'
      : '标普 500 日收盘（站内 Yahoo Finance 行情）',
    url: hasLocal ? YAHOO_SPX_URL : FRED_SPX_URL,
  }
}

async function readPreviousBacktest(output) {
  try {
    return JSON.parse(await readFile(output, 'utf8'))?.backtest
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return undefined
  }
}

function previousRecessions(backtest) {
  const rows = backtest?.timeline
  if (!Array.isArray(rows) || backtest.disclosures?.includes(MISSING_RECESSION_MARKS)) return new Map()
  return new Map(rows.flatMap(row =>
    /^\d{4}-(0[1-9]|1[0-2])$/.test(row?.d) && [0, 1].includes(row?.rec) ? [[row.d, row.rec]] : []))
}

const exactFields = new Set([
  'score', 'contribution', 'value', 'average', 'prior9', 'sma10', 'threshold',
  'cagr', 'drag', 'turnoverPerYear', 'spxReturn', 'portfolioReturn',
])
const json = file => JSON.stringify(file, (key, item) => typeof item === 'number' && Number.isFinite(item) && !exactFields.has(key)
  ? Number(item.toFixed(4)) : item) + '\n'

export async function refreshMacroPosture({
  fetcher = fetch, now = new Date(), directory = DATA, output = resolve(directory, 'macro-posture.json'), warn = console.warn,
} = {}) {
  const generatedAt = now.toISOString()
  const today = generatedAt.slice(0, 10)
  const marketDate = localParts(now, MARKETS.us.tz).date
  const [raw, local] = await Promise.all([collectCore(today, fetcher), readLocal(directory)])
  const spx = mergeSpxCloses(raw.SP500, local[MARKET_SLICES], marketDate, warn)
  const panel = makePanel({ ...raw, SP500: spx.rows })
  const previous = await readPreviousBacktest(output)
  const previousRecessionMarks = raw.USREC.length ? undefined : previousRecessions(previous)
  const { backtest, historical, returns } = buildBacktest(panel, today, previousRecessionMarks)
  const { outer, failedSources } = buildOuter(local, panel, today, spx.url)
  for (const [id, name] of Object.entries(OPTIONAL_FRED)) if (!raw[id].length) failedSources.push(name)
  const asOf = [...FRED_IDS.filter(id => id !== 'USREC'), 'price']
    .map(id => valueAt(panel[id], today)?.availableOn)
    .concat(outer.map(item => item.observedOn)).filter(Boolean).sort().at(-1) ?? today
  const current = buildCurrent(asOf, panelAt(panel, today, marketDate, spx.source), historical, outer)
  const file = {
    ruleVersion: RULE_VERSION, generatedAt, tiers: TIER_DEFS,
    current, outer, backtest: { ...backtest, live: updateLive(previous?.live?.rows ?? [], today, current.final, returns) }, failedSources,
  }
  validateComposite(file)
  const body = json(file)
  const serialized = JSON.parse(body)
  validateComposite(serialized)
  const temporary = output + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, body)
    await rename(temporary, output)
  } finally {
    await unlink(temporary).catch(() => {})
  }
  return serialized
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshMacroPosture().then(file => {
    console.log(`宏观攻守综合指标 ${file.ruleVersion}：${file.current.headline} 回测 ${file.backtest.start} 至 ${file.backtest.end}，共 ${file.backtest.months} 个月。`)
    if (file.failedSources.length) console.warn('部分数据缺失：' + file.failedSources.join('、'))
  }).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
