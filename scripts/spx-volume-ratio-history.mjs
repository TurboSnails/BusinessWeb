#!/usr/bin/env node
// 一次性回补 20 日量比 2010 年 8 月以前的历史：Yahoo 标普 500 指数（^GSPC）1950 年起的日成交量，
// 写入 data-raw/market-radar/spx-volume-ratio-early.json，只保留站内 Cboe 序列首个观测之前的部分。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { writeJsonIfChanged } from './lib/json-io.mjs'
import { volumeRatioFromDaily } from './lib/market-radar/sources.mjs'

const OUTPUT = fileURLToPath(new URL('../data-raw/market-radar/spx-volume-ratio-early.json', import.meta.url))
const SNAPSHOT = fileURLToPath(new URL('../public/data/us-market-data.json', import.meta.url))
// period1=0 只返回 1970 年起；负值才能取到更早的日线。
const URL_GSPC = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=-631152000&period2=9999999999&interval=1d'

const until = JSON.parse(readFileSync(SNAPSHOT, 'utf8')).series.volumeRatio.history[0][0]
const response = await fetch(URL_GSPC, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60_000) })
if (!response.ok) throw new Error(`Yahoo ^GSPC HTTP ${response.status}`)
const result = (await response.json()).chart?.result?.[0]
const volumes = result?.indicators?.quote?.[0]?.volume
if (result?.meta?.symbol !== '^GSPC' || !Array.isArray(volumes)) throw new Error('Yahoo ^GSPC 日线格式不符')
// 指数日线时间戳为美东开盘时刻，按 UTC 日期即为交易日。
const daily = result.timestamp.map((stamp, i) => [new Date(stamp * 1000).toISOString().slice(0, 10), volumes[i]])
  .filter(([d, volume]) => d < until && volume > 0)
const rows = volumeRatioFromDaily(daily)
if (rows[0]?.[0] > '1950-03-01' || rows.length < 10_000) throw new Error('^GSPC 日成交量覆盖不足')
writeJsonIfChanged(OUTPUT, rows)
console.log(`20 日量比回补：${rows[0][0]} 至 ${rows.at(-1)[0]}，${rows.length} 个交易日`)
