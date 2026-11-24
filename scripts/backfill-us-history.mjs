#!/usr/bin/env node
// 一次性回补 us-market-data.json 里历史偏短的序列，只往前补，已有观测（含每日刷新写入的最新一段）保持不动：
// - volume / volumeRatio：Cboe 历年全市场成交文件，与每日刷新同一来源、同一交易场所口径，补到 2010 年。
// - naaim：NAAIM 改订阅制（2026-08-01）前公开的全历史工作簿，2006 年 7 月起的周度均值。
// - spxFactSetFpe：data-raw/market-radar/factset-forward-pe.json，FactSet Earnings Insight 公开周报存档的月末读数
//   （由 scripts/factset-forward-pe.py 从各期 PDF 抽取，每行附原文链接）。
// - retailBull / retailBear：data-raw/market-radar/aaii-sentiment.json，AAII 官方免费提供的 1987 年起情绪调查全表
//   （由 scripts/aaii-sentiment-history.py 整理成调查截止周三、一位小数的站内口径）。
import { existsSync, readFileSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { unzipEntry } from '../server/macro.mjs'
import { CBOE, CBOE_CORE_VENUES, compactHistory, mergeSeries, parseVolume } from './us-market-data.mjs'

const OUTPUT = fileURLToPath(new URL('../public/data/us-market-data.json', import.meta.url))
const FACTSET = fileURLToPath(new URL('../data-raw/market-radar/factset-forward-pe.json', import.meta.url))
const AAII = fileURLToPath(new URL('../data-raw/market-radar/aaii-sentiment.json', import.meta.url))
// 2009 年起有文件，但 EDGX（K）2010 年 7 月才成为交易所，核心场所齐全的首个交易日在 2010 年年中。
export const FIRST_VOLUME_YEAR = 2010
export const NAAIM_HISTORY = 'https://naaim.org/wp-content/uploads/2026/07/USE_Data-since-Inception_2026-07-29.xlsx'

/** 把 rows 中早于现有首个观测的部分接到序列前面。 */
export function prependHistory(entry, rows, frequency = entry?.frequency) {
  const start = entry?.history[0]?.[0]
  const older = rows.filter(([day]) => !start || day < start)
  if (!entry || !older.length) return entry
  const merged = mergeSeries(entry, { ...entry, history: older })
  return { ...merged, history: frequency ? compactHistory(merged.history, frequency) : merged.history }
}

export function backfillVolume(series, csvFiles, before) {
  const parsed = parseVolume(csvFiles, { before, requiredVenues: CBOE_CORE_VENUES })
  const next = { ...series }
  for (const key of ['volume', 'volumeRatio']) {
    const updated = prependHistory(series[key], parsed[key].history, series[key]?.frequency ?? '日频')
    if (updated) next[key] = updated
  }
  return next
}

/** NAAIM 全历史工作簿：A 列为 Excel 日期序号，B 列为当周平均敞口。 */
export function parseNaaimWorkbook(book) {
  const xml = unzipEntry(book, 'xl/worksheets/sheet1.xml')
  const rows = []
  for (const [, row] of xml.matchAll(/<row [^>]*>(.*?)<\/row>/gs)) {
    const cell = column => Number(row.match(new RegExp(`<c r="${column}\\d+"[^>]*><v>([^<]*)</v>`))?.[1])
    const serial = cell('A')
    const exposure = cell('B')
    if (!(serial > 30000) || !(exposure >= -200 && exposure <= 200)) continue
    rows.push([new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10), exposure])
  }
  if (rows.length < 500) throw new Error('NAAIM 全历史工作簿行数异常')
  return rows.sort(([a], [b]) => a.localeCompare(b))
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

function report(series, key) {
  const history = series[key]?.history ?? []
  if (history.length) console.log(`${key}：${history[0][0]} 至 ${history.at(-1)[0]}，${history.length} 个观测`)
}

async function main() {
  const snapshot = JSON.parse(await readFile(OUTPUT, 'utf8'))
  let series = snapshot.series

  const until = series.volumeRatio?.history[0]?.[0]
  if (until && until.slice(0, 4) > String(FIRST_VOLUME_YEAR)) {
    const files = []
    for (let year = FIRST_VOLUME_YEAR; year <= Number(until.slice(0, 4)); year++) {
      files.push((await download(CBOE + year + '.csv')).toString('utf8'))
    }
    series = backfillVolume(series, files, until)
  }

  series = { ...series, naaim: prependHistory(series.naaim, parseNaaimWorkbook(await download(NAAIM_HISTORY))) }

  if (existsSync(FACTSET)) {
    const rows = JSON.parse(readFileSync(FACTSET, 'utf8')).map(row => [row.date, row.pe])
    series = { ...series, spxFactSetFpe: prependHistory(series.spxFactSetFpe, rows) }
  }

  if (existsSync(AAII)) {
    const rows = JSON.parse(readFileSync(AAII, 'utf8'))
    series = {
      ...series,
      retailBull: prependHistory(series.retailBull, rows.map(([day, bull]) => [day, bull])),
      retailBear: prependHistory(series.retailBear, rows.map(([day, , bear]) => [day, bear])),
    }
  }

  const output = JSON.stringify({ ...snapshot, series }, null, 2) + '\n'
  await writeFile(OUTPUT + '.tmp', output)
  await rename(OUTPUT + '.tmp', OUTPUT)
  for (const key of ['volume', 'volumeRatio', 'naaim', 'spxFactSetFpe', 'retailBull', 'retailBear']) report(series, key)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
