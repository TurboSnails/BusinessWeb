/**
 * 综合策略按周记账（规则与按月调仓不变）。
 *
 * 规则（写死，单测覆盖）：
 * 1. 自然周：周一至周日（UTC）；每周取该周内最后一个有收盘的交易日作为周末日。
 * 2. 节假日短周：该周交易日不足 5 天仍记为一周，用最后一个交易日收盘。
 * 3. 跨月周：周末日落在哪个月，整周收益就记入那个月的持仓月（仓位用该月对齐权重）。
 * 4. 首尾不完整周：序列第一个周末日之前若无更早收盘，丢弃该周（算不出收益）；
 *    最后一个不完整周若周末日已是样本内最后一个交易日，照常计入。
 * 5. 月内仓位不变：持仓月 M 的股票权重在该月所有周内固定；调仓只发生在月界。
 * 6. 与月度同批收益交叉核对：把月度 spx/cash 按日线价格路径几何分摊到月内各周，
 *    使周收益复利恰好等于该月 spx/cash → 月末净值与月度口径一致（误差 < 1e-9）。
 * 7. 日收盘本身不含股息；股息与现金沿用月度回测口径，经上述分摊进入各周。
 */
import { EXECUTION_LAG } from '../macro-posture/backtest.mjs'
import { monthAfter, TEST_START } from '../macro-posture-market/backtest.mjs'
import { formatReading } from '../macro-posture/format.mjs'
import { average } from '../macro-posture/model.mjs'
import { FUSION_META, fusionEquity } from './fusion.mjs'

const monthOf = date => date.slice(0, 7)

/** 该日所在自然周（周一至周日）的周一 YYYY-MM-DD（UTC）。 */
export function weekMonday(date) {
  const [y, m, d] = date.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d)
  const day = new Date(utc).getUTCDay() // 0=Sun … 6=Sat
  const offset = day === 0 ? -6 : 1 - day
  return new Date(utc + offset * 86_400_000).toISOString().slice(0, 10)
}

/**
 * 从日收盘序列提取每周最后一个交易日。
 * @param {Array<[string, number]>} dailyRows
 * @param {{ through?: string }} [opts]
 */
export function weekEndsFromDaily(dailyRows, { through } = {}) {
  const buckets = new Map()
  for (const [date, close] of dailyRows) {
    if (through && date > through) break
    if (!Number.isFinite(close) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const start = weekMonday(date)
    const prev = buckets.get(start)
    if (!prev) {
      buckets.set(start, { date, close, weekStart: start, month: monthOf(date), tradingDays: 1 })
      continue
    }
    prev.tradingDays += 1
    if (date >= prev.date) {
      prev.date = date
      prev.close = close
      prev.month = monthOf(date)
    }
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function sampleVariance(numbers) {
  if (numbers.length < 2) return 0
  const mean = average(numbers)
  return numbers.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (numbers.length - 1)
}

function drawdownStats(returns) {
  let wealth = 1
  let peak = 1
  let worst = 0
  let longest = 0
  let run = 0
  for (const r of returns) {
    wealth *= 1 + r
    if (wealth >= peak) {
      peak = wealth
      run = 0
    } else {
      run += 1
      longest = Math.max(longest, run)
      worst = Math.min(worst, wealth / peak - 1)
    }
  }
  return { maxDd: worst, maxDdWeeks: longest }
}

/**
 * 按周绩效。年化波动 = 周收益样本标准差 × √52。
 * @param {{ portfolio: number, cash: number, equity: number, month: string }[]} rows
 */
export function weeklyPerformance(rows) {
  if (!rows.length) throw new Error('没有可对齐的周收益样本')
  const returns = rows.map(row => row.portfolio)
  const excess = rows.map(row => row.portfolio - row.cash)
  const cagr = returns.reduce((w, r) => w * (1 + r), 1) ** (52 / returns.length) - 1
  const { maxDd, maxDdWeeks } = drawdownStats(returns)
  const excessVol = Math.sqrt(sampleVariance(excess))
  const byMonth = new Map()
  for (const row of rows) {
    byMonth.set(row.month, (byMonth.get(row.month) ?? 1) * (1 + row.portfolio))
  }
  const monthRets = [...byMonth.values()].map(w => w - 1)
  return {
    cagr,
    vol: Math.sqrt(52 * sampleVariance(returns)),
    maxDd,
    maxDdWeeks,
    worstWeek: Math.min(...returns),
    worstMonth: Math.min(...monthRets),
    sharpe: excessVol ? Math.sqrt(52) * average(excess) / excessVol : 0,
    avgEquity: average(rows.map(row => row.equity)),
    switchesPerYear: rows.filter((row, i) => i > 0 && row.equity !== rows[i - 1].equity).length
      * 52 / rows.length,
    weeks: returns.length,
  }
}

/**
 * 把月度 spx/cash 按日线周价格路径几何分摊到月内各周，使 ∏(1+r_i)=1+月度收益。
 * @param {{ date: string, close: number, month: string }[]} weekEnds
 * @param {Map<string, { spx: number, cash: number|null }>} monthlyReturns
 */
export function allocateMonthlyToWeeks(weekEnds, monthlyReturns) {
  const out = new Map()
  if (weekEnds.length < 2) return out

  const byMonth = new Map()
  for (let i = 1; i < weekEnds.length; i += 1) {
    const cur = weekEnds[i]
    const prev = weekEnds[i - 1]
    if (!byMonth.has(cur.month)) byMonth.set(cur.month, [])
    byMonth.get(cur.month).push({
      date: cur.date,
      priceRet: cur.close / prev.close - 1,
    })
  }

  for (const [m, weeks] of byMonth) {
    const monthRow = monthlyReturns.get(m)
    if (monthRow?.cash == null || !Number.isFinite(monthRow.spx)) continue
    const priceCompound = weeks.reduce((w, row) => w * (1 + row.priceRet), 1)
    const n = weeks.length
    const scale = ((1 + monthRow.spx) / priceCompound) ** (1 / n)
    const cashWeek = (1 + monthRow.cash) ** (1 / n) - 1
    for (const row of weeks) {
      out.set(row.date, {
        date: row.date,
        month: m,
        spx: (1 + row.priceRet) * scale - 1,
        cash: cashWeek,
      })
    }
  }
  return out
}

/**
 * 信号月 → 持仓月（+EXECUTION_LAG）的周序列。
 * 月内不调仓：期初按目标权重拆成股票/现金两桶，各周各自复利（buy-and-hold），
 * 月末财富变化 = w·spx月 + (1−w)·cash月，与月度口径净值一致。
 */
export function alignWeekly(signals, weeklyReturns, equity, startMonth) {
  const weightByMonth = new Map()
  for (const signal of signals) {
    const hold = monthAfter(signal.d, EXECUTION_LAG)
    const w = equity(signal)
    if (w == null) continue
    if (startMonth && hold < startMonth) continue
    weightByMonth.set(hold, w)
  }

  const byMonth = new Map()
  for (const date of [...weeklyReturns.keys()].sort()) {
    const ret = weeklyReturns.get(date)
    if (!byMonth.has(ret.month)) byMonth.set(ret.month, [])
    byMonth.get(ret.month).push(ret)
  }

  const rows = []
  for (const [m, weeks] of [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const w = weightByMonth.get(m)
    if (w == null) continue
    let eq = w
    let cash = 1 - w
    let wealth = 1
    for (const ret of weeks) {
      if (ret.cash == null) {
        eq = null
        break
      }
      eq *= 1 + ret.spx
      cash *= 1 + ret.cash
      const next = eq + cash
      const portfolio = next / wealth - 1
      // 超额用「本周现金腿收益」近似：与月度口径 cash 分摊一致
      rows.push({
        d: ret.date,
        month: m,
        cash: ret.cash,
        equity: w,
        portfolio,
        spx: ret.spx,
      })
      wealth = next
    }
  }
  return rows
}

/** 按周净值在每个月末的值 vs 月度口径净值。 */
export function monthEndNavDiff(weeklyRows, monthlyRows) {
  let wWeek = 1
  let wMonth = 1
  const monthNav = new Map()
  for (const row of monthlyRows) {
    wMonth *= 1 + row.portfolio
    monthNav.set(row.d, wMonth)
  }
  const lastByMonth = new Map()
  for (const row of weeklyRows) {
    wWeek *= 1 + row.portfolio
    lastByMonth.set(row.month, wWeek)
  }
  let maxAbs = 0
  let at = null
  for (const [m, navM] of monthNav) {
    if (!lastByMonth.has(m)) continue
    const diff = Math.abs(lastByMonth.get(m) - navM)
    if (diff > maxAbs) {
      maxAbs = diff
      at = m
    }
  }
  return { maxAbsDiff: maxAbs, at, monthsChecked: monthNav.size }
}

const strategyMetrics = rows => {
  const m = weeklyPerformance(rows)
  return {
    cagr: m.cagr,
    vol: m.vol,
    maxDd: m.maxDd,
    maxDdWeeks: m.maxDdWeeks,
    worstWeek: m.worstWeek,
    worstMonth: m.worstMonth,
    sharpe: m.sharpe,
    avgEquity: m.avgEquity,
    switchesPerYear: m.switchesPerYear,
    weeks: m.weeks,
  }
}

export const WEEKLY_DISCLOSURES = [
  '按周记账只改收益曲线的取样频率：仓位仍按月末定档、隔一个月生效，月内不调仓。',
  '周末日取自然周（周一至周日）内最后一个交易日收盘；短周（节假日）同样取该周最后一个交易日。',
  '股票与现金的周收益由月度总回报按日线价格路径几何分摊，使月内各周复利与月度口径一致；因此按周与按月的年化收益几乎相同，差别主要在回撤与波动。',
  '年化波动用周收益样本标准差乘 √52；最长回撤期按周计；最差一周 / 一月分别取单周收益与月内周收益复利的最小值。',
  '只看月末净值会低估急跌时的回撤（例如 2020 年大盘月末口径约 −20%，按日约 −34%）。',
]

const pct1 = n => formatReading(n * 100, '%', 1)

/**
 * @param {{
 *   signals: object[],
 *   monthlyReturns: Map<string,{spx:number,cash:number|null}>,
 *   dailyRows: Array<[string,number]>,
 *   end: string,
 *   dailyMeta?: { source?: string, from?: string, to?: string },
 * }} args
 */
export function buildWeeklyFusion({ signals, monthlyReturns, dailyRows, end, dailyMeta = {} }) {
  const through = (() => {
    const [y, m] = end.split('-').map(Number)
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  })()
  const weekEnds = weekEndsFromDaily(dailyRows, { through })
  const weeklyReturns = allocateMonthlyToWeeks(weekEnds, monthlyReturns)
  const start = monthAfter(signals[0].d, EXECUTION_LAG)

  const pack = (id, label, rule, equity) => {
    const fullAligned = alignWeekly(signals, weeklyReturns, equity, start)
    const train = fullAligned.filter(row => row.month < TEST_START)
    const test = fullAligned.filter(row => row.month >= TEST_START)
    return {
      id,
      label,
      rule,
      train: strategyMetrics(train),
      test: strategyMetrics(test),
      full: strategyMetrics(fullAligned),
    }
  }

  const rows = FUSION_META.map(({ id, label, rule }) =>
    pack(id, label, rule, row => fusionEquity(id, row)))

  const controls = [
    pack('buyhold', '全程持有标普', '始终满仓标普。', () => 1),
    pack('static70', '恒定七成股票', '始终七成股票。', () => 0.7),
  ]

  const macroWeekly = alignWeekly(signals, weeklyReturns, row => fusionEquity('macro', row), start)
  const monthlyAligned = signals.flatMap(signal => {
    const d = monthAfter(signal.d, EXECUTION_LAG)
    const row = monthlyReturns.get(d)
    const weight = fusionEquity('macro', signal)
    if (d < start || row?.cash == null || weight == null) return []
    return [{ d, cash: row.cash, equity: weight, portfolio: weight * row.spx + (1 - weight) * row.cash }]
  })
  const navCheck = monthEndNavDiff(macroWeekly, monthlyAligned)

  const macro = rows.find(row => row.id === 'macro')
  const note = `按周记账全样本最大回撤 ${pct1(macro.full.maxDd)}，年化波动 ${pct1(macro.full.vol)}。`

  return {
    start,
    end,
    weeks: macro.full.weeks,
    rows,
    controls,
    note,
    disclosures: WEEKLY_DISCLOSURES,
    spxDaily: {
      source: dailyMeta.source ?? 'Yahoo Finance ^GSPC 日收盘（不含股息）',
      from: dailyMeta.from ?? weekEnds[0]?.date ?? null,
      to: dailyMeta.to ?? weekEnds.at(-1)?.date ?? null,
      note: '日收盘不含股息；股息与现金按月度回测同一口径，经几何分摊计入各周。',
    },
    monthEndNavCheck: {
      maxAbsDiff: navCheck.maxAbsDiff,
      at: navCheck.at,
      monthsChecked: navCheck.monthsChecked,
      ok: navCheck.maxAbsDiff < 1e-9,
    },
  }
}
