import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMultpl } from './us-market-data.mjs'
import { localParts, MARKETS } from './lib/trading-calendar.mjs'
import { makePanel, monthEnd, panelAt, valueAt } from './lib/macro-posture/panel.mjs'
import { buildCurrent, RULE_VERSION, TIER_DEFS } from './lib/macro-posture/model.mjs'
import { buildBacktest, MISSING_RECESSION_MARKS } from './lib/macro-posture/backtest.mjs'
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
  const reads = await Promise.allSettled(LOCAL_SOURCES.map(async name => {
    const body = JSON.parse(await readFile(resolve(directory, name + '.json'), 'utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('本地数据结构异常')
    return body
  }))
  return Object.fromEntries(LOCAL_SOURCES.map((name, i) => [name, reads[i].status === 'fulfilled' ? reads[i].value : null]))
}

async function readRecessionMarks(output) {
  try {
    const backtest = JSON.parse(await readFile(output, 'utf8'))?.backtest
    const rows = backtest?.timeline
    if (!Array.isArray(rows) || backtest.disclosures?.includes(MISSING_RECESSION_MARKS)) return new Map()
    return new Map(rows.flatMap(row =>
      /^\d{4}-(0[1-9]|1[0-2])$/.test(row?.d) && [0, 1].includes(row?.rec) ? [[row.d, row.rec]] : []))
  } catch {
    return new Map()
  }
}

const json = file => JSON.stringify(file, (_key, item) => typeof item === 'number' && Number.isFinite(item)
  ? Number(item.toFixed(4)) : item) + '\n'

export async function refreshMacroPosture({
  fetcher = fetch, now = new Date(), directory = DATA, output = resolve(directory, 'macro-posture.json'),
} = {}) {
  const generatedAt = now.toISOString()
  const today = generatedAt.slice(0, 10)
  const [raw, local] = await Promise.all([collectCore(today, fetcher), readLocal(directory)])
  const panel = makePanel(raw)
  const previousRecessionMarks = raw.USREC.length ? undefined : await readRecessionMarks(output)
  const { backtest, historical } = buildBacktest(panel, today, previousRecessionMarks)
  const { outer, failedSources } = buildOuter(local, panel, today)
  for (const [id, name] of Object.entries(OPTIONAL_FRED)) if (!raw[id].length) failedSources.push(name)
  const asOf = [...FRED_IDS.filter(id => id !== 'USREC'), 'price']
    .map(id => valueAt(panel[id], today)?.availableOn)
    .concat(outer.map(item => item.observedOn)).filter(Boolean).sort().at(-1) ?? today
  const file = {
    ruleVersion: RULE_VERSION, generatedAt, tiers: TIER_DEFS,
    current: buildCurrent(asOf, panelAt(panel, today, localParts(now, MARKETS.us.tz).date), historical, outer),
    outer, backtest, failedSources,
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
