#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectCore } from './macro-posture.mjs'
import { readJson, writeJsonIfChanged } from './lib/json-io.mjs'
import { makePanel, monthEnd } from './lib/macro-posture/panel.mjs'
import { RULE_VERSION, TIERS } from './lib/macro-posture/model.mjs'
import { buildCurrent, buildIndicators } from './lib/market-radar/indicators.mjs'
import { buildRadarBacktest } from './lib/market-radar/backtest.mjs'
import { buildRadarSeries, parseShillerEps, refreshRadarSources } from './lib/market-radar/sources.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DATA = resolve(ROOT, 'public/data')
const CACHE = resolve(ROOT, 'data-raw/market-radar')
const MARKET_CACHE = resolve(ROOT, 'data-raw/macro-posture-market')
const VINTAGE_CACHE = resolve(ROOT, 'data-raw/macro-posture-vintages')
const OUTPUT = resolve(DATA, 'market-radar.json')

function compare(radarTier, mastersTier) {
  const label = id => TIERS.find(row => row.id === id)?.label
  const radar = label(radarTier)
  const masters = label(mastersTier)
  const text = radar && masters
    ? `市场雷达为${radar}档，大师方案为${masters}档，两边档位${radarTier === mastersTier ? '一致' : '不同'}。`
    : `市场雷达为${radar ? radar + '档' : '待定'}，大师方案为${masters ? masters + '档' : '待定'}，现有读数不足以比较档位。`
  return { radarTier, mastersTier, text }
}

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
  const shillerEps = parseShillerEps(readFileSync(resolve(ROOT, 'data-raw/sp500-backtest/shiller.csv'), 'utf8'))
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
    local, macroUs, breadth, universes, indexes, marketCache, fetched, shillerEps, panel, currentPanel, today, lastComplete,
    spxDaily: dailyRows.map(([d, close]) => [d, close]),
  })
  const indicators = buildIndicators(current, sources, today)
  const radar = buildCurrent(indicators)
  const file = {
    generatedAt, ruleVersion: 'radar-v1', current: radar, indicators,
    backtest: buildRadarBacktest({ historical, panel, vintages, dailyRows, today }),
    comparison: compare(radar.tier, masters.current.final.tier),
  }
  writeJsonIfChanged(OUTPUT, file)
  return file
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRadar().then(file => {
    console.log(file.comparison.text)
    console.log(`已生成 ${file.indicators.length} 项指标和 ${file.backtest.rows.length} 条策略，收益区间 ${file.backtest.start} 至 ${file.backtest.end}。`)
  }).catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
