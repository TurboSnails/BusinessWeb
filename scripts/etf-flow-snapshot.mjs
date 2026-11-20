// ETF 资金净流入日度快照 → public/data/etf-flow.json
// 用法：node scripts/etf-flow-snapshot.mjs [startDate=2014-01-01]
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson, writeJsonIfChanged } from './lib/json-io.mjs'
import {
  fetchFlowHistory, fetchIndexHistory, mergeSeries, kpiOf, FLOW_INDEX_ALL, FLOW_INDEX_BROAD,
} from './lib/etf-flow.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const START = '2014-01-01'
const NOTE = '同花顺原口径（全市场 / 宽基 ETF 申购净流入）+ 上证指数叠加；红=净流入、绿=净流出；T+1、无盘中。实验页观察用，不是买卖指令。'

export async function runSnapshot({
  today = beijingToday(),
  startDate = START,
  root = REPO,
  fetchImpl = fetch,
  flowFn = fetchFlowHistory,
  indexFn = fetchIndexHistory,
} = {}) {
  const outFile = join(root, 'public/data/etf-flow.json')

  let allRows = []
  try {
    allRows = await flowFn({ startDate, endDate: today, index: FLOW_INDEX_ALL, fetchImpl })
  } catch (error) {
    log(`${today} 资金接口不可用（${error.message}），跳过`)
    return { written: false, reason: '资金接口不可用' }
  }
  if (!allRows.some(row => Number.isFinite(row.yuan))) {
    log(`${today} 资金序列为空，跳过`)
    return { written: false, reason: '资金序列为空' }
  }

  let broadRows = []
  try { broadRows = await flowFn({ startDate, endDate: today, index: FLOW_INDEX_BROAD, fetchImpl }) } catch { broadRows = [] }

  let indexMap = new Map()
  try { indexMap = await indexFn({ fetchImpl }) } catch { indexMap = new Map() }

  const previous = readJson(outFile, null)
  const archive = new Map((previous?.sample ? [] : previous?.series ?? []).map(row => [row.date, row]))
  const allDates = new Set(allRows.map(row => row.date))
  const broadDates = new Set(broadRows.map(row => row.date))
  for (const row of mergeSeries(allRows, broadRows, indexMap)) {
    const prior = archive.get(row.date)
    if (prior) {
      if (!allDates.has(row.date)) row.flow_all = prior.flow_all
      if (!broadDates.has(row.date)) row.flow_broad = prior.flow_broad
      if (!indexMap.has(row.date)) row.index = prior.index
    }
    archive.set(row.date, row)
  }
  const series = [...archive.values()].sort((a, b) => a.date.localeCompare(b.date))
  const data = {
    updated: new Date().toISOString(),
    note: NOTE,
    sample: false,
    series,
    kpi: { all: kpiOf(series, 'flow_all'), broad: kpiOf(series, 'flow_broad') },
  }
  const changed = writeJsonIfChanged(outFile, data, { pretty: true })
  log(`${today} 全A记录日=${series.at(-1)?.date} 净流入=${series.at(-1)?.flow_all}亿 近60=${data.kpi.all.cum60}亿 series=${series.length} ${changed ? '已写' : '无变化'}`)
  return { written: true }
}

function beijingToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const arg = process.argv[2]
  runSnapshot(arg ? { startDate: arg } : {})
    .then(r => { if (!r.written) log('未写入：', r.reason) })
    .catch(e => { console.error('快照失败：', e); process.exitCode = 1 })
}
