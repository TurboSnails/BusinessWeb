// 牛熊周期「趋势防守」规则的历史回测（样本内）：买入持有 vs 防守变体（趋势防守期间持现金 0% 收益）。
// Node 24 直接剥离类型，复用 src/features/market-cycle/engine.ts 的完整周K、20周线与判定函数，不另写一套规则。
// 用法：node scripts/cycle-backtest.mjs [--in public/data/market-cycle.json] [--out public/data/market-cycle-backtest.json]
// 输出只取决于输入行情（不读当前时间），重复运行结果一致。
import { readFile, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { completedBars, MARKETS, RULE_VERSION, technicalEvidence, technicalSeries, trendBroken } from '../src/features/market-cycle/engine.ts'

export const BACKTEST_VERSION = 'cycle-trend-backtest-v1'
export const HORIZONS = [4, 13, 26]
export const COSTS = [0, 0.001, 0.003]
/** 与实时面板 technicalEvidence 的门槛一致：至少 52 根完整周K 才开始给信号。 */
export const WARMUP_WEEKS = 52
const DAY = 86400000
const round = (v, digits = 4) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(digits)))
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
function quantile(sorted, q) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}
export function distribution(xs) {
  if (!xs.length) return { n: 0 }
  const s = [...xs].sort((a, b) => a - b)
  return { n: xs.length, mean: round(mean(xs)), median: round(quantile(s, 0.5)), p25: round(quantile(s, 0.25)), p75: round(quantile(s, 0.75)),
    min: round(s[0]), max: round(s.at(-1)), negativeShare: round(xs.filter(x => x < 0).length / xs.length, 3) }
}

/** 周度净值序列的统计：CAGR 按首末日期的自然年计，波动 = 周收益样本标准差 × √52，回撤按周收盘。 */
export function stats(equity, dates) {
  const rets = equity.slice(1).map((v, i) => v / equity[i] - 1)
  const years = (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / DAY / 365.25
  let peak = equity[0], maxDrawdown = 0
  for (const v of equity) { peak = Math.max(peak, v); maxDrawdown = Math.min(maxDrawdown, v / peak - 1) }
  const m = mean(rets)
  const vol = rets.length > 1 ? Math.sqrt(rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length - 1)) * Math.sqrt(52) : null
  const total = equity.at(-1) / equity[0] - 1
  return { totalReturn: round(total), cagr: years > 0 ? round((1 + total) ** (1 / years) - 1) : null, maxDrawdown: round(maxDrawdown), volatility: round(vol) }
}

/**
 * 逐周回放。signals[i] 为第 i 根完整周K收盘后才知道的“趋势防守”判定；
 * lag=1（主口径）：周六确认信号，下一根周K收盘成交，持仓变化从第 i+2 周的收益开始生效；
 * lag=0（敏感性）：近似于周一开盘即成交（忽略周末跳空），从第 i+1 周的收益生效。
 * 两种口径共用同一评估窗口：从 start+2 周开始计收益，买入持有基准同窗口。
 */
export function simulate(closes, signals, start, { lag = 1, cost = 0 } = {}) {
  const from = start + 1
  const bh = [1], def = [1], invested = []
  let prevPos = signals[from - 1 - lag] ? 0 : 1, switches = 0
  for (let j = from + 1; j < closes.length; j++) {
    const r = closes[j] / closes[j - 1] - 1
    const pos = signals[j - 1 - lag] ? 0 : 1
    let e = def.at(-1)
    if (pos !== prevPos) { switches++; e *= 1 - cost }
    def.push(e * (1 + pos * r))
    bh.push(bh.at(-1) * (1 + r))
    invested.push(pos)
    prevPos = pos
  }
  return { bh, def, invested, switches, from }
}

/** 防守区间（按信号，不含成交滞后）：进入周、退出周、持续周数，以及按 lag 成交价衡量的“打脸”。 */
export function episodes(closes, dates, signals, start, lag = 1) {
  const out = []
  for (let i = start; i < signals.length; i++) {
    if (!signals[i] || (i > start && signals[i - 1])) continue
    if (i === start) continue // 样本起点已在防守中：没有“进入”这一事件
    let k = i
    while (k < signals.length && signals[k]) k++
    const open = k >= signals.length
    const sell = closes[i + lag], buy = open ? null : closes[k + lag]
    out.push({ entry: dates[i], exit: open ? null : dates[k], weeks: k - i, entryIndex: i,
      sellPrice: round(sell, 2), buyPrice: buy == null ? null : round(buy, 2),
      // 卖出后又以更高价格买回 = 防守没有省下钱（未计成本）
      whipsaw: buy == null || sell == null ? null : buy >= sell, change: buy == null || sell == null ? null : round(buy / sell - 1) })
    i = k
  }
  return out
}

export function forwardReturns(closes, entryIdx, start, horizons = HORIZONS) {
  const out = {}
  for (const h of horizons) {
    const fwd = i => (i + h < closes.length ? closes[i + h] / closes[i] - 1 : null)
    const entries = entryIdx.map(fwd).filter(v => v != null)
    const all = []
    for (let i = start; i + h < closes.length; i++) all.push(fwd(i))
    out[h] = { afterEntry: distribution(entries), allWeeks: distribution(all) }
  }
  return out
}

/** 每一周用实时面板同一函数（只看当时已完成的周 / 月K线）得出技术维度信号，统计其分布，检验门槛效果。 */
function technicalShare(price, dates) {
  const count = { risk: 0, bottom: 0, positive: 0, neutral: 0, missing: 0 }
  for (const d of dates) {
    const asOf = new Date(Date.parse(`${d}T00:00:00Z`) + ((6 - new Date(`${d}T00:00:00Z`).getUTCDay() + 7) % 7) * DAY).toISOString().slice(0, 10)
    count[technicalEvidence(price, asOf).evidence.signal]++
  }
  return Object.fromEntries(Object.entries(count).map(([k, v]) => [k, round(v / dates.length, 3)]))
}

export function backtestMarket(price, asOf) {
  const bars = completedBars(price.week, 'week', asOf)
  const points = technicalSeries(bars)
  if (points.length < WARMUP_WEEKS + 30) return null
  const closes = points.map(p => p.close), dates = points.map(p => p.date)
  const signals = points.map((p, i) => i >= WARMUP_WEEKS - 1 && trendBroken(p, points[i - 1]))
  const start = WARMUP_WEEKS - 1
  const main = simulate(closes, signals, start, { lag: 1 })
  const windowDates = dates.slice(main.from)
  const variants = {}
  for (const lag of [1, 0]) for (const cost of COSTS) {
    if (lag === 0 && cost !== 0.001) continue
    const run = simulate(closes, signals, start, { lag, cost })
    variants[`lag${lag}_cost${Math.round(cost * 10000)}bp`] = { lag, cost, ...stats(run.def, windowDates), switches: run.switches }
  }
  const eps = episodes(closes, dates, signals, start, 1)
  const closed = eps.filter(e => e.whipsaw != null)
  return {
    start: windowDates[0], end: windowDates.at(-1), weeks: windowDates.length - 1,
    years: round((Date.parse(windowDates.at(-1)) - Date.parse(windowDates[0])) / DAY / 365.25, 2),
    buyHold: stats(main.bh, windowDates),
    defense: { ...stats(main.def, windowDates), switches: main.switches },
    variants,
    timeInDefense: round(main.invested.filter(p => p === 0).length / main.invested.length, 3),
    defenseNow: signals.at(-1),
    episodeCount: eps.length,
    whipsaws: closed.filter(e => e.whipsaw).length,
    closedEpisodes: closed.length,
    shortEpisodes: eps.filter(e => e.exit && e.weeks <= 4).length,
    medianEpisodeWeeks: distribution(eps.filter(e => e.exit).map(e => e.weeks)).median ?? null,
    forward: forwardReturns(closes, eps.map(e => e.entryIndex), start),
    technicalShare: technicalShare(price, dates.slice(start)),
    episodes: eps.map(({ entryIndex, ...e }) => e),
    // [日期, 买入持有净值, 防守净值, 当周是否持股]
    curve: windowDates.map((d, i) => [d, round(main.bh[i]), round(main.def[i]), main.invested[Math.max(0, i - 1)]]),
  }
}

export const METHOD = {
  rule: '趋势防守 = 连续两根完整周K收盘低于20周均线（与面板「周 / 月技术」的风险判定同一函数 trendBroken）。任一周收回20周线上方即解除，重新持有。',
  signal: '只用已完成的周K（completedBars），20周均线逐周因果计算；从第52根完整周K开始给信号，与面板门槛一致。月RSI/MACD只影响偏多/底部，不影响防守，回测不使用。',
  execution: '主口径：周五收盘后确认信号，下一周收盘成交（滞后一周，保守）；敏感性：周一开盘即成交，用信号周收盘近似（忽略周末跳空）。',
  cash: '防守期间持有现金，收益按 0% 计（未计货币基金或国债利息，对防守变体偏保守）。不加杠杆、不做空。',
  costs: '每次切换（卖出或买回）按成交额扣 0 / 0.1% / 0.3%；主表为 0 成本，并列 0.1% 后结果。',
  prices: '价格为指数点位（腾讯 / 雅虎周K），不含分红；买入持有与防守同样不计分红，现实中长期持有还会多拿股息。',
  forward: '信号后收益：从进入防守那一周的收盘起，向后 4 / 13 / 26 周的指数涨跌；对照组为样本内所有周的同期涨跌。区间重叠，样本不独立。',
  whipsaw: '打脸：一次防守结束后，买回价（滞后一周成交）不低于卖出价，即这次防守没有省下钱（未计成本）。',
}
export const LIMITATIONS = [
  '样本内回测：规则和参数（20周线、连续两周）在看过历史后设定，没有样本外检验，结果可能高估。',
  '单一规则：只回测了六维中的技术维度防守条件；估值、资金、宽度、流动性、海外五个维度以及「底部候选」「右侧修复候选」等组合状态都没有回测。',
  '指数不可直接投资：真实执行要用ETF或期货，会有跟踪误差、管理费、税费与滑点。',
  '不含分红：所用为价格指数，长期持有部分少算了股息；防守期间现金收益按0计。',
  '样本期有限：沪深300、恒指约15年，美股约10年，恒生科技约6年，只覆盖少数几轮牛熊，个别大跌对结论影响很大。',
  '历史结果不代表未来，回测不构成交易建议；面板的状态仍是观察提示，不是买卖指令。',
]

export function buildBacktest(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !snapshot.markets) throw new Error('Invalid market-cycle snapshot')
  const asOf = String(snapshot.generatedAt ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('Snapshot generatedAt missing')
  const markets = {}
  for (const { id, label } of MARKETS) {
    const price = snapshot.markets[id]
    if (!price?.week?.length) continue
    const result = backtestMarket(price, asOf)
    if (result) markets[id] = { label, source: price.source, ...result }
  }
  const through = Object.values(markets).map(m => m.end).sort().at(-1) ?? null
  return { schemaVersion: 1, version: BACKTEST_VERSION, ruleVersion: RULE_VERSION, asOf: through, method: METHOD, limitations: LIMITATIONS, horizons: HORIZONS, markets }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
  const input = arg('--in', `${root}public/data/market-cycle.json`), output = arg('--out', `${root}public/data/market-cycle-backtest.json`)
  const result = buildBacktest(JSON.parse(await readFile(input, 'utf8')))
  await writeFile(`${output}.tmp`, JSON.stringify(result) + '\n')
  await rename(`${output}.tmp`, output)
  for (const [id, m] of Object.entries(result.markets)) {
    console.log(`${id} ${m.start}→${m.end} 买入持有 CAGR ${(m.buyHold.cagr * 100).toFixed(1)}% 回撤 ${(m.buyHold.maxDrawdown * 100).toFixed(1)}% | 防守 CAGR ${(m.defense.cagr * 100).toFixed(1)}% 回撤 ${(m.defense.maxDrawdown * 100).toFixed(1)}% | 防守 ${(m.timeInDefense * 100).toFixed(0)}% 切换 ${m.defense.switches} 打脸 ${m.whipsaws}/${m.closedEpisodes}`)
  }
}
