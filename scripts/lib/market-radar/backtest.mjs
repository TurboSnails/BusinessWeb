import { alignMarket, monthAfter, TEST_START, tierEquity } from '../macro-posture-market/backtest.mjs'
import { month } from '../macro-posture-market/data.mjs'
import { backtestMonthEnds, EXECUTION_LAG, monthlyReturns, performance } from '../macro-posture/backtest.mjs'
import { average, baseTier, evaluate } from '../macro-posture/model.mjs'
import { monthEnd, panelAt, valueAt } from '../macro-posture/panel.mjs'
import { panelWithVintages } from '../macro-posture/vintages.mjs'
import { scoreAt } from './indicators.mjs'

export const DISCLOSURES = [
  '雷达的指标、阈值及权重在看结果前固定。1973 年起生成月末信号，按收益实现月切分，1999 年 12 月及以前为样本内，2000 年 1 月起为样本外。两段仅用于报告，未用于调参。',
  '月末信号用于两个月后的收益。标普月总回报用月均价变化加月股息近似，现金按 3 个月国库券利率折算，未计税费和交易成本。时间线的标普点位为月末最后一个交易日收盘。',
  '十项计分指标是企业债利差变化、股债利差、过去 12 个月市盈率、周期调整市盈率、家庭股票比例、家庭现金比例、融资余额同比、行业宽度、量价和每股盈利同比。先平均同维度指标，再等权平均可得维度。',
  '百分位从各序列首个可得观测开始，回测每月只使用当时已达到发布滞后的观测。雷达使用现有历史序列，可能含事后修订。家庭金融资产与盈利数据尤其可能修订。',
  'Baa 与 Aaa、10 年期美债、周期调整市盈率、日均成交量和标普月均价按当月月末可得；融资余额同比按观察月后第 1 个月末，行业宽度按第 2 个月末，过去 12 个月市盈率和每股盈利按第 3 个月末。两项家庭配置按季度结束后第 3 个月末。',
  '股债利差用当时可得的过去 12 个月市盈率及 10 年期美债月均收益率。当前的市盈率、周期调整市盈率、融资余额与行业宽度使用最新已发布值。',
  '每股盈利同比采用席勒的名义盈利历史。若更新期超出席勒快照，用 Multpl 实际购买力口径盈利和未季调消费价格指数补算名义同比，仍按观察月后第 3 个月末可得。',
  '美元净流动性、高收益债利差、NAAIM、VIX 期限结构、FactSet 前瞻市盈率与盈利修正、日频宽度和 20 日量比的可得历史不足 25 年，美银调查只有零星读数，因此均只展示，不进入回测。AAII 多空差与 CFTC 资管机构净多是事后新增的同维度平替，同样只展示。只展示指标用来源最新可得观测，逐项标示日期。',
  '大师方案按 v2.2 规则和月末可得的 ALFRED 历史版本重算。非农就业、工业生产、核心个人消费支出价格、初请失业救济及制造业周工时缺少当时版本时沿用修订值并按发布滞后取数。金融条件指数在 2011 年 5 月之前为事后回推。',
  '平均仓位每月取雷达和大师股票仓位的算术平均。十个月均线对照在标普月均价低于均线时持五成股票，其余时间持有股票仓位上限。',
]

export function blendEquity(radar, masters) {
  const weights = [tierEquity(radar), tierEquity(masters)]
  return weights.includes(null) ? null : average(weights)
}

const STRATEGIES = [
  ['radar', '我的市场雷达', row => tierEquity(row.radar)],
  ['masters', '大师方案 v2.2（实时数据）', row => tierEquity(row.masters)],
  ['blend', '雷达与大师平均仓位', row => blendEquity(row.radar, row.masters)],
  ['trend', '10 个月均线', row => row.below == null ? null : row.below ? 0.5 : 1],
  ['buyhold', '全程持有标普', () => 1],
  ['static70', '恒定七成股票', () => 0.7],
]

export function alignRadar(signals, returns, equity) {
  const start = monthAfter(signals[0].d, EXECUTION_LAG)
  return alignMarket(signals, returns, equity, start)
}

function measures(rows) {
  const { cagr, vol, maxDd, sharpe, avgEquity, switchesPerYear } = performance(rows)
  return { cagr, vol, maxDd, sharpe, avgEquity, switchesPerYear }
}

export function buildRadarBacktest({ historical, panel, vintages, dailyRows, today }) {
  const lastComplete = monthEnd(today, -1)
  const returns = monthlyReturns(panel, lastComplete)
  const closes = new Map(dailyRows.filter(([d]) => d <= lastComplete).map(([d, price]) => [month(d), price]))
  const signals = backtestMonthEnds(today).map(date => {
    const d = month(date)
    const price = valueAt(panel.price, date)
    if (month(price?.observedOn ?? '') !== d) throw new Error(`标普月均价缺少 ${d}`)
    if (!Number.isFinite(closes.get(d))) throw new Error(`标普月末收盘缺少 ${d}`)
    const frame = panelAt(panelWithVintages(panel, vintages, date), date, null)
    return { d, radar: baseTier(scoreAt(historical, date)), masters: evaluate(frame).final.tier,
      below: frame.tactical.below, spx: closes.get(d) }
  })
  const start = monthAfter(signals[0].d, EXECUTION_LAG)
  const end = month(lastComplete)
  const rows = STRATEGIES.map(([id, label, equity]) => {
    const full = alignRadar(signals, returns, equity)
    const byMonth = new Set(full.map(row => row.d))
    for (let d = start; d <= end; d = monthAfter(d, 1)) {
      if (!byMonth.has(d)) throw new Error(`${label}缺少 ${d} 的对齐收益或信号`)
    }
    const train = full.filter(row => row.d < TEST_START)
    const test = full.filter(row => row.d >= TEST_START)
    return { id, label, train: measures(train), test: measures(test), full: measures(full) }
  })
  return {
    start, end,
    trainRange: `${start} 至 ${monthAfter(TEST_START, -1)}`, testRange: `${TEST_START} 至 ${end}`,
    rows, disclosures: DISCLOSURES, timeline: signals.map(({ d, radar, masters, spx }) => ({ d, radar, masters, spx })),
  }
}
