import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMultpl } from './us-market-data.mjs'
import { localParts, MARKETS } from './lib/trading-calendar.mjs'
import { FRED_SPX, FRED_SPX_URL, makePanel, monthEnd, panelAt, valueAt } from './lib/macro-posture/panel.mjs'
import { buildCurrent, RULE_VERSION, TIER_DEFS } from './lib/macro-posture/model.mjs'
import {
  backtestMonthEnds, buildVintageBacktest, incompleteVintagesDisclosure, MISSING_RECESSION_MARKS, updateLive,
  VINTAGE_SOURCE,
} from './lib/macro-posture/backtest.mjs'
import { HISTORY_CACHE, loadVintageHistory, loadVintages } from './lib/macro-posture/vintages.mjs'
import { buildOuter, LOCAL_SOURCES } from './lib/macro-posture/outer.mjs'
import { validateComposite } from './lib/macro-posture/validate.mjs'
import { buildDaily, DAILY_CACHE, loadDailyCloses, writeDaily } from './lib/macro-posture/daily.mjs'

export { validateComposite }

const DATA = fileURLToPath(new URL('../public/data', import.meta.url))
const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id='
const MULTPL = 'https://www.multpl.com/'
export const FRED_IDS = [
  'SAHMREALTIME', 'IC4WSA', 'PAYEMS', 'INDPRO', 'AWHMAN', 'PCEPILFE', 'BAA', 'AAA',
  'NFCI', 'NFCICREDIT', 'FEDFUNDS', 'GS10', 'TB3MS', 'USREC', 'SP500',
]
const OPTIONAL_FRED = { USREC: '美国衰退标记', SP500: '标普指数日收盘价' }
const MULTPL_SERIES = {
  price: 's-p-500-historical-prices/table/by-month',
  yield: 's-p-500-dividend-yield/table/by-month',
}
const TIMEOUT_MS = 20_000
const SHILLER_CSV = fileURLToPath(new URL('../data-raw/sp500-backtest/shiller.csv', import.meta.url))
const MARKET_SLICES = 'us-market-slices'
const YAHOO_SPX_URL = 'https://finance.yahoo.com/quote/%5EGSPC/history/'

export function parseMonthlyTable(html, completeThrough) {
  // The shared parser handles dates and estimate markers, but expects ungrouped numbers.
  const ungrouped = html.replace(/(\d),(?=\d{3}\b)/g, '$1')
  return parseMultpl(ungrouped).history.filter(([date]) => monthEnd(date) <= completeThrough)
}

/**
 * Multpl 的标普月均价和股息率月表取自席勒数据。Multpl 不可用时，用仓库里的席勒快照按相同口径重建：
 * 月均价记在当月 1 日，股息率（年化股息 ÷ 月均价）记在当月月末，均保留两位小数，只到已完成的月份。
 * 与 Multpl 历史逐月比对：月均价 99.5% 的月份相差不到 0.1%，股息率相差不到 0.03 个百分点。
 * 席勒的股息比价格晚几个月公布；缺股息的近月沿用最近一个已知股息（最多 6 个月），与 Multpl 近月标“估计”一致。
 */
export function shillerMonthly(csv, completeThrough) {
  const [header, ...lines] = csv.trim().split(/\r?\n/)
  if (!header.startsWith('date,P,D,')) throw new Error('席勒数据表头不匹配')
  const price = []
  const yields = []
  let known = null
  for (const line of lines) {
    const [month, rawPrice, rawDividend] = line.split(',')
    const p = Number(rawPrice)
    if (!/^\d{4}-\d{2}$/.test(month) || !(p > 0) || monthEnd(month) > completeThrough) continue
    price.push([month + '-01', Number(p.toFixed(2))])
    const dividend = Number(rawDividend)
    if (rawDividend?.trim() && dividend > 0) known = { month, dividend }
    if (known && monthEnd(known.month, 6) >= monthEnd(month)) {
      yields.push([monthEnd(month), Number((known.dividend / p * 100).toFixed(2))])
    }
  }
  return { price, yield: yields }
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
      collectOne(fetcher, id, MULTPL + path, html => parseMonthlyTable(html, completeThrough)).catch(error => {
        const rows = shillerMonthly(readFileSync(SHILLER_CSV, 'utf8'), completeThrough)[id]
        if (!rows.length) throw error
        console.warn(`${error.message}；改用席勒快照（至 ${rows.at(-1)[0].slice(0, 7)}）`)
        return [id, rows]
      })),
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

export async function refreshMacroPosture(options = {}) {
  const { file } = await refreshMacroPostureWithStats(options)
  return file
}

export async function refreshMacroPostureWithStats({
  fetcher = fetch, now = new Date(), directory = DATA, output = resolve(directory, 'macro-posture.json'), warn = console.warn,
  vintageDirectory = directory === DATA ? undefined : resolve(directory, 'macro-posture-vintages'),
  dailyOutput = resolve(directory, 'macro-posture-daily.json'),
  dailyDirectory = directory === DATA ? DAILY_CACHE : resolve(directory, 'macro-posture-daily'),
  historyDirectory = directory === DATA ? HISTORY_CACHE : resolve(directory, 'macro-posture-vintage-history'),
  loadHistory = true,
} = {}) {
  const generatedAt = now.toISOString()
  const today = generatedAt.slice(0, 10)
  const marketDate = localParts(now, MARKETS.us.tz).date
  const [raw, local] = await Promise.all([collectCore(today, fetcher), readLocal(directory)])
  const spx = mergeSpxCloses(raw.SP500, local[MARKET_SLICES], marketDate, warn)
  const observations = { ...raw, SP500: spx.rows }
  const panel = makePanel(observations)
  const currentPanel = makePanel(observations, { mode: 'current' })
  const previous = await readPreviousBacktest(output)
  const previousRecessionMarks = raw.USREC.length ? undefined : previousRecessions(previous)
  const { outer, failedSources } = buildOuter(local, currentPanel, today, spx.url)
  const loaded = await loadVintages(backtestMonthEnds(today), {
    fetcher, directory: vintageDirectory, now, includeHours: true,
  }).catch(error => {
    warn(error.message)
    failedSources.push(VINTAGE_SOURCE)
    return { vintages: undefined, requests: 0, incomplete: [] }
  })
  const { requests, incomplete = [] } = loaded
  // 返回值里至少有一条真实版本快照才走实时主路径；否则整表退回修订值口径。
  const vintages = loaded.vintages && Object.values(loaded.vintages).some(cache =>
    Object.values(cache).some(entry => entry && entry.fallback !== 'revised' &&
      (Array.isArray(entry) || entry.rows)))
    ? loaded.vintages : undefined
  if ((!vintages || incomplete.length) && !failedSources.includes(VINTAGE_SOURCE)) {
    failedSources.push(VINTAGE_SOURCE)
  }
  const { backtest, historical, returns } = buildVintageBacktest(panel, today, vintages, previousRecessionMarks)
  const incompleteLine = vintages ? incompleteVintagesDisclosure(incomplete) : null
  if (incompleteLine) backtest.disclosures.push(incompleteLine)
  for (const [id, name] of Object.entries(OPTIONAL_FRED)) if (!raw[id].length) failedSources.push(name)
  const asOf = [...FRED_IDS.filter(id => id !== 'USREC'), 'price']
    .map(id => valueAt(currentPanel[id], today)?.availableOn)
    .concat(outer.map(item => item.observedOn)).filter(Boolean).sort().at(-1) ?? today
  const currentFrame = panelAt(currentPanel, today, marketDate, spx.source)
  const current = buildCurrent(asOf, currentFrame, historical, outer)
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
  const historyLoaded = vintages && loadHistory && historyDirectory
    ? await loadVintageHistory({ directory: historyDirectory, seed: vintages, fetcher, now }).catch(error => {
      warn(`历史版本库更新失败：${error.message}`)
      return undefined
    })
    : undefined
  if (historyLoaded?.incomplete?.length) warn(`历史版本库未完整更新：${historyLoaded.incomplete.map(row => row.id).join('、')}`)
  // 每日档位单独成文件；失败只告警，不影响上面已写好的主数据。
  const daily = await refreshDaily({
    recent: spx.rows, panel, currentFrame, timeline: backtest.timeline, history: historyLoaded?.history,
    generatedAt, today, marketDate, output: dailyOutput, directory: dailyDirectory,
  }).catch(error => {
    warn(`每日档位生成失败：${error.message}`)
    return undefined
  })
  return {
    file: serialized, vintageRequests: requests, historyRequests: historyLoaded?.requests,
    daily,
  }
}

async function refreshDaily({
  recent, panel, currentFrame, timeline, history, generatedAt, today, marketDate, output, directory,
}) {
  const { closes, cached } = await loadDailyCloses(recent, { directory, today, appendBefore: marketDate })
  const { file, stats } = buildDaily({
    closes, panel, currentFrame, timeline, history, generatedAt, ruleVersion: RULE_VERSION,
  })
  const bytes = await writeDaily(output, file)
  return { ...stats, bytes, cached, start: file.start, end: file.end, recentChanges: file.changes.slice(-10) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshMacroPostureWithStats().then(({ file, vintageRequests, historyRequests, daily }) => {
    console.log(`宏观攻守综合指标 ${file.ruleVersion}：${file.current.headline} 回测 ${file.backtest.start} 至 ${file.backtest.end}，共 ${file.backtest.months} 个月。`)
    if (vintageRequests !== undefined) console.log(`ALFRED 月末版本请求：${vintageRequests} 次。`)
    if (historyRequests !== undefined) console.log(`ALFRED 发布日版本库请求：${historyRequests} 次。`)
    if (daily) {
      console.log(`每日档位：${daily.start} 至 ${daily.end}，${daily.rows} 行，${(daily.bytes / 1024).toFixed(0)} KB，耗时 ${daily.ms} 毫秒；` +
        `月末与月度回测不一致 ${daily.mismatches.length}/${daily.officialCount} 个月。`)
    }
    if (file.failedSources.length) console.warn('部分数据缺失：' + file.failedSources.join('、'))
  }).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
