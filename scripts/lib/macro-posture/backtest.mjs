import { applyTactical, average, COMPONENTS, evaluate, TIERS } from './model.mjs'
import { monthEnd, panelAt, valueAt } from './panel.mjs'
import { formatReading } from './format.mjs'

export const START = '1973-01'
export const EXECUTION_LAG = 2
export const LIVE_SINCE = '2026-11-23'
export const LIVE_RULE_VERSION = 'v2.1'
export const TRADE_COSTS = [0.001, 0.003, 0.005]
const pctToMonthly = rate => rate / 1200
const defensive = tier => tier === 'lean-defense' || tier === 'defense'
const month = date => date.slice(0, 7)
const equity = tier => TIERS.find(t => t.id === tier)?.equityShare ?? null
const keyAfter = (date, offset) => month(monthEnd(date, offset))
const portfolioReturn = ({ spx, cash }, weight) => spx * weight + cash * (1 - weight)
const VARIANTS = [
  ['full', '完整模型', row => equity(row.final)],
  ['v20', 'v2.0（无修复确认）', row => equity(applyTactical(row.regime, row.below))],
  ['macro', '仅宏观与熔断', row => equity(row.regime)],
  ['trend', '仅十个月均线', row => row.below == null ? null : row.below ? 0.5 : 1],
  ['static70', '恒定七成股票', () => 0.7],
  ['buyhold', '全程持有标普', () => 1],
]

export function compound(returns) {
  return returns.reduce((wealth, r) => wealth * (1 + r), 1)
}

export function drawdown(returns) {
  let wealth = 1
  let peak = 1
  let worst = 0
  for (const r of returns) {
    wealth *= 1 + r
    peak = Math.max(peak, wealth)
    worst = Math.min(worst, wealth / peak - 1)
  }
  return worst
}

function sampleVariance(numbers) {
  if (numbers.length < 2) return 0
  const mean = average(numbers)
  return numbers.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (numbers.length - 1)
}

export function performance(rows) {
  if (!rows.length) throw new Error('没有可对齐的月度收益样本')
  const returns = rows.map(row => row.portfolio)
  const excess = rows.map(row => row.portfolio - row.cash)
  const cagr = compound(returns) ** (12 / rows.length) - 1
  const maxDd = drawdown(returns)
  const excessVol = Math.sqrt(sampleVariance(excess))
  return {
    cagr,
    vol: Math.sqrt(12 * sampleVariance(returns)),
    maxDd,
    sharpe: excessVol ? Math.sqrt(12) * average(excess) / excessVol : 0,
    calmar: maxDd < 0 ? cagr / -maxDd : 0,
    avgEquity: average(rows.map(row => row.equity)),
    switchesPerYear: rows.filter((row, i) => i > 0 && row.equity !== rows[i - 1].equity).length * 12 / rows.length,
  }
}

export function monthlyReturns(panel, lastComplete) {
  const rows = new Map()
  for (const point of panel.price) {
    const d = month(point.observedOn)
    const end = monthEnd(d)
    if (end > lastComplete) break
    const previous = valueAt(panel.price, monthEnd(d, -1))
    const yieldPoint = valueAt(panel.yield, end)
    const cash = valueAt(panel.TB3MS, end)
    if (month(previous?.observedOn ?? '') !== keyAfter(d, -1) || month(yieldPoint?.observedOn ?? '') !== d) continue
    rows.set(d, {
      spx: point.value / previous.value - 1 + pctToMonthly(yieldPoint.value),
      cash: month(cash?.observedOn ?? '') === d ? pctToMonthly(cash.value) : null,
    })
  }
  return rows
}

export function alignVariants(timeline, returns) {
  return timeline.flatMap(signal => {
    const d = keyAfter(signal.d, EXECUTION_LAG)
    const row = returns.get(d)
    const weights = VARIANTS.map(([, , select]) => select(signal))
    if (row?.cash == null || weights.includes(null)) return []
    return [{ d, ...row, weights }]
  })
}

export function transactionCosts(full, cagr) {
  const turnover = full.map((row, i) => i === 0 ? 0 : Math.abs(row.equity - full[i - 1].equity))
  const years = full.length / 12
  return {
    turnoverPerYear: turnover.reduce((sum, change) => sum + change, 0) / years,
    rows: TRADE_COSTS.map(cost => {
      const afterCosts = compound(full.map((row, i) => row.portfolio - cost * turnover[i])) ** (1 / years) - 1
      return { cost, cagr: afterCosts, drag: cagr - afterCosts }
    }),
  }
}

export function updateLive(previousRows, today, final, returns) {
  const signals = new Map(previousRows.map(row => [row.d, row]))
  if (today >= LIVE_SINCE) {
    const d = month(today)
    signals.set(d, { d, final: final.tier, equityShare: final.equityShare, spxReturn: null, portfolioReturn: null })
  }
  const rows = [...signals.values()].sort((a, b) => a.d.localeCompare(b.d)).map(row => {
    const realized = returns.get(keyAfter(row.d, EXECUTION_LAG))
    if (!realized) return row
    const spxReturn = row.spxReturn ?? realized.spx
    return {
      ...row,
      spxReturn,
      portfolioReturn: row.portfolioReturn ??
        (realized.cash != null && row.equityShare != null
          ? portfolioReturn({ spx: spxReturn, cash: realized.cash }, row.equityShare) : null),
    }
  })
  return { since: LIVE_SINCE, ruleVersion: LIVE_RULE_VERSION, rows }
}

export function horizon(returns, date, count) {
  const forward = Array.from({ length: count }, (_, i) => returns.get(keyAfter(date, EXECUTION_LAG + i))?.spx)
  return forward.every(value => value != null)
    ? { return: compound(forward) - 1, maxDd: drawdown(forward) } : null
}

function median(numbers) {
  const values = [...numbers].sort((a, b) => a - b)
  if (!values.length) return null
  return (values[Math.floor((values.length - 1) / 2)] + values[Math.ceil((values.length - 1) / 2)]) / 2
}

function tierStats(rows, forward) {
  const months = rows.length
  return Object.fromEntries(TIERS.map(({ id }) => {
    const group = rows.filter(row => row.final === id)
    const results = count => group.flatMap(row => forward.get(row.d)[count] ?? [])
    const twelve = results(12)
    const annual = twelve.map(r => r.return)
    return [id, {
      months: group.length, share: group.length / months,
      fwd3: average(results(3).map(r => r.return)), fwd6: average(results(6).map(r => r.return)),
      fwd12: average(annual), fwd12Median: median(annual), neg12: average(annual.map(r => Number(r < 0))),
      maxDd12: average(twelve.map(r => r.maxDd)),
    }]
  }))
}

export function recessionRuns(rows) {
  const runs = []
  let run = null
  for (const row of rows) {
    if (row.rec === 1) {
      if (!run || keyAfter(run.end, 1) !== row.d) {
        run = { start: row.d, end: row.d }
        runs.push(run)
      }
      run.end = row.d
    } else {
      run = null
    }
  }
  return runs
}

const monthNumber = d => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))
const sustainedDefense = rows => recessionRuns(rows.map(({ d, final }) => ({ d, rec: Number(defensive(final)) })))
  .filter(run => run.start !== run.end)

export function recessionCapture(rows, runs) {
  const stretches = sustainedDefense(rows)
  return runs.map(run => {
    const from = keyAfter(run.start, -12)
    const through = keyAfter(run.start, 6)
    const first = stretches.find(stretch => stretch.end >= from && stretch.start <= through)
    const alreadyDefensive = first && first.start < from
    const firstDefensive = alreadyDefensive ? from : first?.start ?? null
    return {
      ...run, firstDefensive,
      leadMonths: firstDefensive ? monthNumber(run.start) - monthNumber(firstDefensive) : null,
      ...(alreadyDefensive ? { note: `窗口开始前已持续防守（自 ${first.start} 起）` } : {}),
    }
  })
}

export function falseAlarms(rows, runs, returns) {
  return sustainedDefense(rows).flatMap(run => {
    const months = monthNumber(run.end) - monthNumber(run.start) + 1
    const cutoff = keyAfter(run.end, 12)
    if (cutoff > rows.at(-1)?.d || runs.some(rec => rec.start <= cutoff && rec.end >= run.start)) return []
    const spx = horizon(returns, run.start, 12)
    return [{ ...run, months, spxFwd12: spx?.return ?? null, maxDd12: spx?.maxDd ?? null }]
  })
}

function singleTests(rows, forward) {
  return COMPONENTS.map(({ id, label }) => {
    const neg = []
    const nonNeg = []
    let negMonths = 0
    for (const row of rows) {
      const score = row.scores[id]
      if (score == null) continue
      if (score < 0) negMonths += 1
      const result = forward.get(row.d)[12]
      if (result) (score < 0 ? neg : nonNeg).push(result.return)
    }
    return {
      componentId: id, label, negMonths,
      spread12: neg.length && nonNeg.length ? average(neg) - average(nonNeg) : null,
      negHit12: average(neg.map(r => Number(r < 0))),
    }
  })
}

export const DISCLOSURES = [
  '以下回测用这段历史检验固定的分档和仓位规则，结果属于样本内表现。',
  '修复确认规则是看到 v2.0 回测后加入的，只比较了三种写法，取改动最小者。两段子样本（1973–1999、2000–2026）都改善，仍属样本内。',
  '按固定发布滞后模拟当时可得的数据。除萨姆规则外，宏观读数采用最新修订值，可能与当时发布值不同。',
  '股票月回报用标普月均价涨跌加股息率除以十二近似，现金用三个月国债利率除以十二。主回测未计税费和交易成本。',
  '月末档位用于隔一个月后的月收益。分档、单项和误报的远期收益也从该月开始计算，历史不足的区间不计入收益统计。',
  '分档月数按信号月份统计。策略对比使用六种策略都能计算的收益月份。误报需整段结束后至少再观察十二个月，并排除与衰退重叠的段落。',
  '衰退捕捉只计连续至少两个月处于偏防守或防守的段落。提前月数最多计 12 个月。',
  '波动率采用月收益的样本标准差年化。夏普比率用每月超出现金收益的均值和波动率年化。卡玛比率用年化收益除以最大回撤的绝对值。',
]
export const MISSING_RECESSION_MARKS = '美国衰退标记暂缺，暂不统计衰退捕捉及误报。'

const percent = ratio => formatReading(ratio * 100, '%', 2)
function explainCosts({ turnoverPerYear, rows }) {
  const scenarios = rows.map(row => `单边成本 ${percent(row.cost)} 时年化收益 ${percent(row.cagr)}、年化收益少 ${formatReading(row.drag * 100, '百分点', 2)}`)
  return `完整模型年换手 ${percent(turnoverPerYear)}，在同一回测区间内，${scenarios.join('，')}。`
}

function explainDefensiveTier(tiers) {
  const { fwd12, fwd12Median, neg12, maxDd12 } = tiers.defense
  if ([fwd12, fwd12Median, neg12, maxDd12].some(n => n == null)) return []
  const highestRisk = Object.values(tiers).every(tier =>
    (tier.neg12 == null || tier.neg12 <= neg12) && (tier.maxDd12 == null || tier.maxDd12 >= maxDd12))
  return [`防守档后 12 个月标普平均回报为 ${percent(fwd12)}，中位数为 ${percent(fwd12Median)}，为负的比例达 ${percent(neg12)}，平均最大回撤为 ${percent(maxDd12)}${highestRisk ? '，后两项的风险在各档中最高' : ''}。这一档同时覆盖真正的大跌和底部反弹，同步类宏观指标在底部附近仍可能报警。指标主要用来压低组合的大回撤，各档平均回报可能交错。`]
}

export function buildBacktest(panel, asOf, previousRecessionMarks = new Map()) {
  const lastComplete = monthEnd(asOf, -1)
  const returns = monthlyReturns(panel, lastComplete)
  const rows = []
  for (let d = START; monthEnd(d) <= lastComplete; d = keyAfter(d, 1)) {
    const date = monthEnd(d)
    const frame = panelAt(panel, date, null)
    const result = evaluate(frame)
    if (!rows.length && Object.values(result.pillars).some(score => score == null)) continue
    if (frame.tactical.price == null || month(valueAt(panel.price, date)?.observedOn ?? '') !== d) {
      if (rows.length) throw new Error(`标普月均价历史缺少 ${d}`)
      continue
    }
    const rec = valueAt(panel.USREC, date)
    rows.push({
      d, regime: result.regime.tier, final: result.final.tier, spx: frame.tactical.price,
      rec: panel.USREC?.length ? Number(month(rec?.observedOn ?? '') === d && rec.value === 1)
        : previousRecessionMarks.get(d) ?? 0,
      below: frame.tactical.below, scores: result.scores, pillars: result.pillars, components: frame.components,
    })
  }
  const aligned = alignVariants(rows, returns)
  if (!aligned.length) throw new Error('六个变体没有共同的回测区间')
  if (aligned.some((row, i) => i > 0 && keyAfter(aligned[i - 1].d, 1) !== row.d)) {
    throw new Error('共同回测区间内存在收益或信号缺月')
  }
  const portfolio = i => aligned.map(row => ({
    portfolio: portfolioReturn(row, row.weights[i]), equity: row.weights[i], cash: row.cash,
  }))
  const full = portfolio(0)
  const variants = VARIANTS.map(([id, label], i) => ({
    id, label, ...performance(i === 0 ? full : portfolio(i)),
  }))
  const costs = transactionCosts(full, variants[0].cagr)
  const forward = new Map(rows.map(({ d }) => [d, Object.fromEntries([3, 6, 12].map(n => [n, horizon(returns, d, n)]))]))
  const tiers = tierStats(rows, forward)
  const timeline = rows.map(({ d, regime, final, spx, rec }) => ({ d, regime, final, spx, rec }))
  const runs = recessionRuns(timeline)
  const hasRecessionMarks = panel.USREC?.length || timeline.some(({ d }) => previousRecessionMarks.has(d))
  return {
    historical: rows.slice(-120).map(row => ({ ...row, d: monthEnd(row.d) })), returns,
    backtest: {
      start: rows[0].d, end: rows.at(-1).d, months: rows.length,
      disclosures: [
        ...DISCLOSURES, explainCosts(costs), ...explainDefensiveTier(tiers),
        ...(hasRecessionMarks ? [] : [MISSING_RECESSION_MARKS]),
      ],
      tiers, variants, costs, recessions: recessionCapture(timeline, runs),
      falseAlarms: hasRecessionMarks ? falseAlarms(timeline, runs, returns) : [],
      singles: singleTests(rows, forward), timeline,
    },
  }
}
