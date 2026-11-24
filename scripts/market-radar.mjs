#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectCore } from './macro-posture.mjs'
import { readJson, writeJsonIfChanged } from './lib/json-io.mjs'
import { makePanel, monthEnd } from './lib/macro-posture/panel.mjs'
import { RULE_VERSION } from './lib/macro-posture/model.mjs'
import { buildCombinedStrategy } from './lib/combined-strategy/build.mjs'
import { buildCurrent, buildIndicators } from './lib/market-radar/indicators.mjs'
import { buildMonthlySignals, buildRadarBacktest } from './lib/market-radar/backtest.mjs'
import { buildRadarSeries, parseShillerEps, parseShillerPrice, refreshRadarSources } from './lib/market-radar/sources.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DATA = resolve(ROOT, 'public/data')
const CACHE = resolve(ROOT, 'data-raw/market-radar')
const MARKET_CACHE = resolve(ROOT, 'data-raw/macro-posture-market')
const VINTAGE_CACHE = resolve(ROOT, 'data-raw/macro-posture-vintages')
const OUTPUT = resolve(DATA, 'market-radar.json')
const COMBINED_OUTPUT = resolve(DATA, 'combined-strategy.json')

export async function runRadar({ now = new Date(), fetcher = fetch, warn = console.warn } = {}) {
  const generatedAt = now.toISOString()
  const today = generatedAt.slice(0, 10)
  const lastComplete = monthEnd(today, -1)
  const readData = name => readJson(resolve(DATA, name + '.json'), null)
  const local = readData('us-market-data').series
  const macroUs = readData('macro-us').series
  const universes = readData('us-market-breadth').breadth
  const breadth = universes.spx
  const indexes = readData('index-history').indexes
  const dailyRows = readData('macro-posture-daily').rows
  const masters = readData('macro-posture')
  const shillerCsv = readFileSync(resolve(ROOT, 'data-raw/sp500-backtest/shiller.csv'), 'utf8')
  const shillerEps = parseShillerEps(shillerCsv)
  const shillerPrice = parseShillerPrice(shillerCsv)
  if (masters?.ruleVersion !== RULE_VERSION) throw new Error('大师方案快照与计算规则版本不一致')
  const vintages = Object.fromEntries(['PAYEMS', 'INDPRO', 'PCEPILFE', 'IC4WSA', 'AWHMAN']
    .map(id => [id, readJson(resolve(VINTAGE_CACHE, id + '.json'), {})]))
  const marketCache = {
    breadth: readJson(resolve(MARKET_CACHE, 'industry-breadth.json'), []),
    volume: readJson(resolve(MARKET_CACHE, 'spx-monthly-volume.json'), []),
  }
  const [core, fetched] = await Promise.all([
    collectCore(today, fetcher),
    refreshRadarSources({ cache: CACHE, fetcher, today, localVix: local.vixDaily?.history ?? [], shillerEps, warn }),
  ])
  const panel = makePanel(core)
  const currentPanel = makePanel(core, { mode: 'current' })
  const { current, historical, sources } = buildRadarSeries({
    local, macroUs, breadth, universes, indexes, marketCache, fetched, shillerEps, shillerPrice, panel, currentPanel, today, lastComplete,
    spxDaily: dailyRows.map(([d, close]) => [d, close]),
  })
  const indicators = buildIndicators(current, sources, today)
  const radar = buildCurrent(indicators)
  const mastersTimeline = masters.backtest?.timeline ?? []
  const signals = buildMonthlySignals({
    historical, panel, vintages, dailyRows, today, mastersTimeline,
  })
  const backtest = buildRadarBacktest({
    historical, panel, vintages, dailyRows, today, mastersTimeline, signals,
  })
  const file = {
    generatedAt, ruleVersion: 'radar-v1', current: radar, indicators,
    backtest,
  }
  writeJsonIfChanged(OUTPUT, file)
  try {
    const buyholdFull = backtest.rows.find(row => row.id === 'buyhold')?.full
    const combined = buildCombinedStrategy({
      signals, panel, today, posture: masters, radar, generatedAt, buyholdFull,
    })
    writeJsonIfChanged(COMBINED_OUTPUT, combined)
    file.combined = combined
  } catch (error) {
    warn(`综合策略数据写入失败（雷达主文件已保存）：${error.message}`)
  }
  return file
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRadar().then(file => {
    console.log(file.backtest.verdict)
    console.log(`已生成 ${file.indicators.length} 项指标和 ${file.backtest.rows.length} 条策略，收益区间 ${file.backtest.start} 至 ${file.backtest.end}。`)
    if (file.combined) {
      console.log(`综合策略：${file.combined.fusion.verdict}`)
    }
  }).catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
