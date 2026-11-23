#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectCore } from './macro-posture.mjs'
import { readJson, writeJsonIfChanged } from './lib/json-io.mjs'
import { EXECUTION_LAG, monthlyReturns } from './lib/macro-posture/backtest.mjs'
import { baseTier } from './lib/macro-posture/model.mjs'
import { makePanel, monthEnd, valueAt } from './lib/macro-posture/panel.mjs'
import { configurations, currentMarket, marketScore, readMarket } from './lib/macro-posture-market/components.mjs'
import { MACRO_START, MARKET_START, TEST_START, TRAIN_END, monthAfter, runStage1 } from './lib/macro-posture-market/backtest.mjs'
import { loadMarketData, month } from './lib/macro-posture-market/data.mjs'
import { renderResults } from './lib/macro-posture-market/report.mjs'
import { runStage2 } from './lib/macro-posture-market/stage2.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DATA = resolve(ROOT, 'public/data')
const CACHE = resolve(ROOT, 'data-raw/macro-posture-market')
const VINTAGES = resolve(ROOT, 'data-raw/macro-posture-vintages')
const OUTPUT = resolve(DATA, 'macro-posture-market.json')
const DOC = resolve(ROOT, 'docs/research/macro-posture-market-2026-11-23.md')
const PREREGISTERED = '2026 年 11 月 23 日在查看结果前按设计第 13 节冻结组件、阈值、组合、切分和采用条件。'
const DISCLOSURES = [
  '按收益实现月切分。第一阶段训练为 1955-01 至 1999-12，第二阶段训练为 1973-01 至 1999-12，两阶段验证均为 2000-01 起。按训练期夏普分别从 36 个组合、4 个权重中选择，组数多会增加偶然挑中好结果的概率。',
  '信号用于两个月后的收益。标普总回报以月均价变化加月股息近似，现金收益按 3 个月国库券利率折成月度，未计税费和交易成本。衰退捕捉与误报沿用既有研究，按月末信号日期统计。',
  'Ken French 49 行业市值加权月回报用于构造行业指数，缺失行业不进分母。历史按观察月后第二个月月末可得，当前使用数据源最新已发布月。',
  '成交量是 Yahoo 报告的标普指数成分总成交量，按有效交易日取月均，月末可得。过去 12 个月市盈率历史按观测月后第三个月末可得。CAPE 百分位为 1900 年起的扩张窗口（设计原写 1871，数据实际从 1900 年开始）。',
  '前瞻市盈率采用 FactSet 最近发布值，仅作当前展示，无免费同口径长历史。',
  '原模型战术修正已使用标普 10 个月均线。市场综合的量价与窄幅领涨含均线或距高点信息，合用时部分趋势信息会被重复计入。',
  '第二阶段使用圣路易斯联储历史版本。核心个人消费支出价格在 2000 年 8 月前、初请失业救济在 2009 年 5 月前及其他无当时版本的月份沿用修订值。芝加哥联储金融条件指数在 2011 年 5 月前沿用事后回推值。',
]

function readVintageCache(cacheDirectory, vintageDirectory) {
  const ids = ['PAYEMS', 'INDPRO', 'PCEPILFE', 'IC4WSA', 'AWHMAN']
  return Object.fromEntries(ids.map(id => [
    id,
    { ...readJson(resolve(cacheDirectory, 'vintages', id + '.json'), {}),
      ...readJson(resolve(vintageDirectory, id + '.json'), {}) },
  ]))
}

export async function runMarket({
  fetcher = fetch, now = new Date(), writeDocs = false, output = OUTPUT,
  cacheDirectory = CACHE, vintageDirectory = VINTAGES,
} = {}) {
  const generatedAt = now.toISOString()
  const today = generatedAt.slice(0, 10)
  const lastComplete = monthEnd(today, -1)
  const through = month(lastComplete)
  const local = readJson(resolve(DATA, 'us-market-data.json'), {})
  const [core, data] = await Promise.all([
    collectCore(today, fetcher),
    loadMarketData(fetcher, cacheDirectory, now, local),
  ])
  const panel = makePanel(core)
  const returns = monthlyReturns(panel, lastComplete)
  const signals = []
  for (let d = monthAfter(MARKET_START, -EXECUTION_LAG); d <= through; d = monthAfter(d, 1)) {
    const date = monthEnd(d)
    if (!valueAt(panel.price, date)?.observedOn.startsWith(d)) throw new Error(`标普月均价历史缺少 ${d}`)
    const readings = readMarket(data.historical, panel, date)
    signals.push({ d, readings, below: readings.below })
  }
  const stage1 = runStage1(signals, returns, through)
  const chosen = configurations().find(row => row.id === stage1.chosenId)
  const byMonth = new Map(signals.map(row => [row.d, marketScore(chosen, row.readings)]))
  const stage2 = runStage2(panel, readVintageCache(cacheDirectory, vintageDirectory), byMonth, returns, through)
  const current = readMarket(data.current, makePanel(core, { mode: 'current' }), today, { priceThrough: lastComplete })
  const timeline = [...byMonth].filter(([d]) => d >= MARKET_START)
    .map(([d, score]) => ({ d, score, tier: baseTier(score) }))
  const testRange = TEST_START + ' 至 ' + through
  const file = {
    generatedAt,
    preregistered: PREREGISTERED,
    stage1: {
      trainRange: MARKET_START + ' 至 ' + TRAIN_END, testRange, ...stage1,
      current: currentMarket(chosen, current, data.forwardPe), timeline,
    },
    stage2: { trainRange: MACRO_START + ' 至 ' + TRAIN_END, testRange, ...stage2 },
    disclosures: DISCLOSURES,
  }
  writeJsonIfChanged(output, file)
  if (writeDocs) {
    const text = await readFile(DOC, 'utf8')
    const marker = '<!-- /preregistration -->'
    if (!text.includes(marker)) throw new Error('研究记录缺少预注册区块结束标记')
    const preregistration = text.slice(0, text.indexOf(marker) + marker.length)
    await writeFile(DOC, preregistration + '\n\n' + renderResults(file) + '\n')
  }
  return file
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMarket({ writeDocs: process.argv.includes('--write-docs') }).then(file => {
    console.log(`已检验 ${file.stage1.configs.length} 个市场组合和 ${file.stage2.weights.length} 个第五支柱权重。`)
    console.log(file.stage2.reason)
  }).catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
