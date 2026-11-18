// 今天几星 · A股估值表，每个交易日盘后同日完整发布。
import fs from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isTradingDay } from './market-mood-lib.mjs'
import { addDays, CSI, csiValUrl } from './ths-market-lib.mjs'
import {
  buildRow, canPublish, INDICES, marketCloses, mergeHistory, parseCniSnapshot, parseCsiHistory, parseCsiSnapshot, sourceDate,
} from './jixing-table-lib.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'public/data/jixing-table.json')
const RAW = join(ROOT, 'data-raw/jixing-table')
const LOCK = join(tmpdir(), `jixing-table-${createHash('sha256').update(ROOT).digest('hex').slice(0, 16)}.lock`)
const CSI_SEED = '1990-01-01'
const CALENDAR_SEED = '2010-01-01' // 国证日行情覆盖已验证最早的中证估值（2011 年）
const CNI = 'https://www.cnindex.com.cn'
const CNI_DAY = `${CNI}/index/queryDay`
const CNI_RUNNING = `${CNI}/index/running?type=0`
const CNI_QUOTES = 'https://hq.cnindex.com.cn/market/market/getIndexDailyDataWithDataFormat'
const CSI_HIST = `${CSI}/perf/indexCsiDsPe`
const SOURCES = [
  { label: '中证指数官网 · 历史滚动市盈率', url: `${CSI_HIST}?indexCode=000985` },
  { label: '中证指数官网 · 每日估值总览', url: csiValUrl },
  { label: '国证指数网 · 指数运行', url: CNI_RUNNING },
]

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

function writeJson(file, data) {
  fs.mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(data) + '\n')
    fs.renameSync(tmp, file)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

async function get(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (error) {
      if (attempt === 2) throw new Error(`${new URL(url).pathname}：${error.message}`)
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }
}

function cfgDate(now, arg) {
  const beijing = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short',
  }).format(now)
  const [today, clock] = beijing.split(' ')
  const explicit = arg?.match(/^--date=(\d{4}-\d{2}-\d{2})$/)?.[1]
  if (arg && (!explicit || sourceDate(explicit) !== explicit || explicit > today)) {
    throw new Error('参数请使用 --date=YYYY-MM-DD，且不得晚于北京当日')
  }
  const date = explicit ?? today
  if (!isTradingDay(date) || (date === today && clock < '15:10')) return null
  return date
}

const historyFile = code => join(RAW, `${code}.json`)
const cniQuoteUrl = (code, start, date) => `${CNI_QUOTES}?indexCode=${code}&startDate=${start}&endDate=${date}&frequency=day`
const compact = date => date.replaceAll('-', '')

function publish(date, observations, histories) {
  // GitHub Actions 已串行。本地可能同时运行，写入阶段抢占短锁并复核日期。
  try {
    fs.mkdirSync(LOCK)
  } catch (error) {
    if (error.code === 'EEXIST') return false
    throw error
  }
  try {
    if (!canPublish(readJson(OUT, null)?.asOf, date, INDICES, observations)) return false
    const rows = INDICES.map(index => {
      const current = observations.get(index.code)
      const incoming = [...(histories.get(index.code) ?? []), [date, current.pe, current.pb]]
      const history = mergeHistory(readJson(historyFile(index.code), []), incoming, date)
      return { index, history, row: buildRow(index, date, current, history) }
    })
    for (const { index, history } of rows) writeJson(historyFile(index.code), history)
    writeJson(OUT, {
      version: 1, asOf: date, generatedAt: new Date().toISOString(), sources: SOURCES,
      rows: rows.map(({ row }) => row),
    })
    return true
  } finally {
    fs.rmdirSync(LOCK)
  }
}

async function main() {
  const date = cfgDate(new Date(), process.argv[2])
  if (!date) return console.log('A股估值表：未到北京 15:10 或休市，保留上一份数据')
  const prior = readJson(OUT, null)?.asOf ?? null
  if (prior && prior >= date) return console.log(`A股估值表：已发布 ${prior}，跳过 ${date}`)

  const snapshot = parseCsiSnapshot(await get(csiValUrl), date)
  const snapshotIndices = INDICES.filter(i => i.snapshot)
  const ready = new Map(snapshotIndices.map(i => [i.code, snapshot.get(i.csiName)]))
  if (!canPublish(prior, date, snapshotIndices, ready)) {
    return console.log(`A股估值表：中证估值总览未完整更新到 ${date}，保留上一份数据`)
  }

  const csiIndices = INDICES.filter(i => i.source === 'csi')
  const cniIndices = INDICES.filter(i => i.source === 'cni')
  const starts = new Map(csiIndices.map(i => [i.code, readJson(historyFile(i.code), []).at(-1)?.[0] ?? CSI_SEED]))
  const shortStart = addDays(date, -7)
  const anchorStart = [...starts.values()].map(s => s === CSI_SEED ? CALENDAR_SEED : s).reduce((a, b) => a < b ? a : b, shortStart)
  const [calendar, cniOverview, ...quoteBodies] = await Promise.all([
    get(CNI_DAY), get(CNI_RUNNING),
    ...cniIndices.map(i => get(cniQuoteUrl(i.code, i.code === '399001' ? anchorStart : shortStart, date))),
  ])
  const closesByCode = new Map(cniIndices.map((i, k) => [i.code, marketCloses(quoteBodies[k], date)]))
  const cniSnapshot = parseCniSnapshot(cniOverview, calendar, date, cniIndices, closesByCode)
  const tradingDays = closesByCode.get('399001')
  if (!tradingDays.has(date) || !canPublish(prior, date, cniIndices, cniSnapshot)) {
    return console.log(`A股估值表：国证估值或收盘行情未完整更新到 ${date}，保留上一份数据`)
  }

  const histories = new Map()
  const observations = new Map([...ready, ...cniSnapshot])
  for (let offset = 0; offset < csiIndices.length; offset += 8) {
    await Promise.all(csiIndices.slice(offset, offset + 8).map(async index => {
      const start = starts.get(index.code)
      const data = await get(`${CSI_HIST}?indexCode=${index.code}&startDate=${compact(start)}&endDate=${compact(date)}`)
      const history = parseCsiHistory(data, index, start, date, tradingDays)
      histories.set(index.code, history)
      const current = history.find(([day]) => day === date)
      const snap = observations.get(index.code)
      if (!current || (snap && snap.pe !== current[1])) observations.delete(index.code)
      else if (!snap) observations.set(index.code, { date, pe: current[1], pb: null, dp: null })
    }))
  }

  if (!canPublish(prior, date, INDICES, observations)) {
    const missing = INDICES.filter(i => !observations.has(i.code)).map(i => i.code).join('、')
    return console.log(`A股估值表：${date} 估值未发全或同日数据不一致（${missing}），保留上一份数据`)
  }
  if (publish(date, observations, histories)) console.log(`A股估值表：已发布 ${date}，${INDICES.length} 条指数`)
  else console.log('A股估值表：并行更新已占用写入，或同日数据已发布')
}

main().catch(error => {
  console.error(`A股估值表更新失败：${error.message}`)
  process.exitCode = 1
})
