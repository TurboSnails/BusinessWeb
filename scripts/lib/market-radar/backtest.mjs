import { forward12 } from '../combined-strategy/matrix.mjs'
import { classifyHeat, heatScoreFromScores } from '../combined-strategy/heat.mjs'
import { alignMarket, monthAfter, TEST_START, tierEquity } from '../macro-posture-market/backtest.mjs'
import { month } from '../macro-posture-market/data.mjs'
import { backtestMonthEnds, EXECUTION_LAG, monthlyReturns, performance } from '../macro-posture/backtest.mjs'
import { formatReading } from '../macro-posture/format.mjs'
import { average, baseTier, evaluate, TIERS } from '../macro-posture/model.mjs'
import { monthEnd, panelAt, valueAt } from '../macro-posture/panel.mjs'
import { panelWithVintages } from '../macro-posture/vintages.mjs'
import { DIMENSIONS, rankAt, scoreIndicator, scoresAt } from './indicators.mjs'

export const DISCLOSURES = [
  '雷达的指标、阈值及权重在看结果前固定。1973 年起生成月末信号，按收益实现月切分，1999 年 12 月及以前为样本内，2000 年 1 月起为样本外。两段仅用于报告，未用于调参。',
  '月末信号用于两个月后的收益。标普月总回报用月均价变化加月股息近似，现金按 3 个月国库券利率折算，未计税费和交易成本。时间线的标普点位为月末最后一个交易日收盘。',
  '九项计分指标是企业债利差变化、股债利差、过去 12 个月市盈率、家庭股票比例、家庭现金比例、融资余额同比、行业宽度、量价和每股盈利同比。先平均同维度指标，再等权平均可得维度。周期调整市盈率原为第十项，2026 年 11 月 24 日按用户决定移出计分，改为只展示，回测随之按九项重算（看过原结果后的调整）。',
  '百分位从各序列首个可得观测开始，回测每月只使用当时已达到发布滞后的观测。雷达使用现有历史序列，可能含事后修订。家庭金融资产与盈利数据尤其可能修订。',
  'Baa 与 Aaa、10 年期美债、周期调整市盈率、日均成交量和标普月均价按当月月末可得；融资余额同比按观察月后第 1 个月末，行业宽度按第 2 个月末；每股盈利只用季末值，季末后第 3 个月末可得；市盈率用最近一个已可得季末的市盈率 × 当月标普月均价 ÷ 该季末月月均价折算。两项家庭配置按季度结束后第 3 个月末。',
  '股债利差用上述折算后的市盈率和当月 10 年期美债月均收益率。当前的市盈率、周期调整市盈率、融资余额与行业宽度使用最新已发布值。',
  '每股盈利同比采用席勒的名义盈利历史，只用季末月。若更新期超出席勒快照，用 Multpl 实际购买力口径盈利和未季调消费价格指数补算名义同比，补算部分同样只取季末月，仍按观察月后第 3 个月末可得。',
  '美元净流动性、高收益债利差、NAAIM、VIX 期限结构、隐含相关性与做市商 Gamma 敞口、FactSet 前瞻市盈率与盈利修正、日频成分股宽度的可得历史不足 25 年，美银调查（现金、美股与科技股超配）只有零星读数，因此均只展示，不进入回测。金银比、AAII 多空差、CFTC 资管机构标普与纳指期货净多、20 日量比（1950 年起回补）以及行业（含 49 行业日频宽度）、板块、个股层面的补充宽度指标是事后新增的，同样只展示。2026 年 11 月 24 日又新增 18 项只展示指标：流动性侧的金融条件指数、OFR 信用压力、实际利率、美元指数变化、银行准备金变化；估值侧的巴菲特指标与股息率；拥挤度侧的 Put/Call、SKEW、杠杆基金期货净仓、对冲基金股票多空比、融资余额 ÷ GDP；交易结构侧的 VIX 水平、标普相对 200 日均线、距 52 周高点回撤、已实现波动率、VVIX；盈利侧的企业利润 ÷ GDP。只展示指标用来源最新可得观测，逐项标示日期；读数过期或来源停更时不给冷热。',
  '十个月均线对照在标普月均价低于均线时持五成股票，其余时间持有股票仓位上限。',
  '2026 年 11 月 24 日修正了回测里市盈率的取数时点（原先连价格一起滞后三个月），属于看过原结果后的数据修正；同日按事先写下的规则检验了五类改法（分档刻度、滚动百分位窗口、盈利低谷时估值不计分、家庭两项配置合并、估值与拥挤度扣分需价格跌破均线确认），均未达到事先定下的采用门槛，规则保持不变。随后第二轮把后来新增的五项长历史指标（行业站上 200 日线比例、行业 12 个月正收益占比、行业 52 周新高减新低、AAII 多空差、金银比）并入计分，并检验了「快慢分层」结构（流动性、交易结构、盈利定档，估值与拥挤度只设上限或加减一档），三个候选在验证期同样没有达到门槛，这五项继续只展示。详见 docs/research/market-radar-v2-2026-11-24.md。',
]

export const BOOTSTRAP_SEED = 20261124
export const BOOTSTRAP_DRAWS = 2000
export const BOOTSTRAP_BLOCK = 12

const pctToMonthly = rate => rate / 1200
const round4 = n => Number(n.toFixed(4))
const round3 = n => Number(n.toFixed(3))
const HEATS = ['hot', 'mid', 'cold']
const emptyForward = () => ({ months: 0, episodes: 0, independent: 0, fwd12: null, neg12: null, maxDd12: null })
const FORWARD_MONTHS = 12
const NW_LAG = 12
const ERA_SPLIT = '2000-01'

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 固定块长的循环分块：每次抽起点，取连续 block 个月（绕回），凑满 n。 */
export function circularBlockIndices(n, block, rng) {
  const idx = new Array(n)
  let i = 0
  while (i < n) {
    const start = Math.floor(rng() * n)
    for (let k = 0; k < block && i < n; k += 1) {
      idx[i] = (start + k) % n
      i += 1
    }
  }
  return idx
}

export function blendEquity(radar, masters) {
  const weights = [tierEquity(radar), tierEquity(masters)]
  return weights.includes(null) ? null : average(weights)
}

export function heatScoreFromDimensions(dimensions) {
  const byId = Object.fromEntries(dimensions.map(row => [row.id, row.score]))
  return heatScoreFromScores(byId.valuation, byId.crowding)
}

export { classifyHeat }

const STRATEGIES = [
  ['radar', '按综合分持仓', row => tierEquity(row.radar)],
  ['trend', '10 个月均线', row => row.below == null ? null : row.below ? 0.5 : 1],
  ['buyhold', '全程持有标普', () => 1],
  ['static70', '恒定七成股票', () => 0.7],
]

export const STRATEGY_ROWS = STRATEGIES.map(([id, label]) => ({ id, label }))

/** mastersTimeline 有同月 final 则采用；否则退回实时帧档位。 */
export function resolveMastersTiers(d, mastersByMonth, realtimeTier) {
  return mastersByMonth.has(d) ? mastersByMonth.get(d) : realtimeTier
}

export function alignRadar(signals, returns, equity) {
  const start = monthAfter(signals[0].d, EXECUTION_LAG)
  return alignMarket(signals, returns, equity, start)
}

function measures(rows) {
  const { cagr, vol, maxDd, sharpe, avgEquity, switchesPerYear } = performance(rows)
  return { cagr, vol, maxDd, sharpe, avgEquity, switchesPerYear }
}

const sharpeText = n => Number(n).toFixed(2).replace('-', '−')
const ddText = n => formatReading(n * 100, '%', 1)

function intervalContainsZero(low, high) {
  return low <= 0 && high >= 0
}

/**
 * 按抽样区间措辞。sharpeGaps 仍含 static70 / trend / buyhold 三项数据；
 * 结论句不单独提全程持有（与恒定七成按构造夏普相同），关系相同的对照合并成一段。
 */
export function buildBacktestVerdict(rows, sharpeGaps) {
  const get = id => rows.find(row => row.id === id)?.full
  const radar = get('radar')
  const trend = get('trend')
  const static70 = get('static70')
  if (!radar || !trend || !static70 || !sharpeGaps?.length) throw new Error('verdict 缺少对照策略或抽样区间')

  const relationOf = gap => {
    if (intervalContainsZero(gap.low, gap.high)) return 'within'
    return gap.diff > 0 ? 'above' : 'below'
  }
  const display = sharpeGaps.filter(gap => gap.versus !== 'buyhold')
  const peerLabel = (gap, peer) => {
    const base = `${gap.label}（${sharpeText(peer.sharpe)}`
    return gap.versus === 'static70'
      ? `${base}，全程持有标普按构造与它相同）`
      : `${base}）`
  }
  const clauses = []
  for (const rel of ['within', 'above', 'below']) {
    const group = display.filter(gap => relationOf(gap) === rel)
    if (!group.length) continue
    if (rel === 'within') {
      const parts = group.map(gap => peerLabel(gap, get(gap.versus)))
      clauses.push(parts.length === 1
        ? `与${parts[0]}的差异在抽样误差内`
        : `与${parts.join('、')}的差异都在抽样误差内`)
      continue
    }
    const word = rel === 'above' ? '高于' : '低于'
    for (const gap of group) {
      const peer = get(gap.versus)
      clauses.push(`${word}${gap.label}的 ${sharpeText(peer.sharpe)}`)
    }
  }
  return `按综合分持仓全样本夏普 ${sharpeText(radar.sharpe)}；${clauses.join('；')}；最大回撤 ${ddText(radar.maxDd)}，十个月均线为 ${ddText(trend.maxDd)}。雷达只从股市自身看冷热，仓位怎么定见综合策略页。`
}

/**
 * 每个回测月末一条信号。雷达回测与融合检验共用，避免算两遍。
 * @returns {{ d, radar, masters, below, spx, heatScore, heat, score, dims }[]}
 */
export function buildMonthlySignals({ historical, panel, vintages, dailyRows, today, mastersTimeline = [] }) {
  const lastComplete = monthEnd(today, -1)
  const closes = new Map(dailyRows.filter(([d]) => d <= lastComplete).map(([d, price]) => [month(d), price]))
  const mastersByMonth = new Map((mastersTimeline ?? []).map(row => [row.d, row.final]))
  return backtestMonthEnds(today).map(date => {
    const d = month(date)
    const price = valueAt(panel.price, date)
    if (month(price?.observedOn ?? '') !== d) throw new Error(`标普月均价缺少 ${d}`)
    if (!Number.isFinite(closes.get(d))) throw new Error(`标普月末收盘缺少 ${d}`)
    const realtimeFrame = panelAt(panelWithVintages(panel, vintages, date), date, null)
    const masters = resolveMastersTiers(
      d, mastersByMonth, evaluate(realtimeFrame).final.tier,
    )
    const scored = scoresAt(historical, date)
    const heatScore = heatScoreFromDimensions(scored.dimensions)
    return {
      d,
      radar: baseTier(scored.score),
      masters,
      below: realtimeFrame.tactical.below,
      spx: closes.get(d),
      heatScore,
      heat: classifyHeat(heatScore),
      score: scored.score,
      dims: DIMENSIONS.map(([id]) => scored.dimensions.find(row => row.id === id)?.score ?? null),
    }
  })
}

/** 月末最后一个交易日收盘变化 + 同一口径月股息；现金沿用 panel。 */
export function monthEndReturns(panel, dailyRows, lastComplete) {
  const closes = new Map()
  for (const [d, close] of dailyRows) {
    if (d > lastComplete) break
    if (!Number.isFinite(close)) continue
    closes.set(month(d), close)
  }
  const rows = new Map()
  for (const [d, close] of closes) {
    const end = monthEnd(d)
    if (end > lastComplete) continue
    const previous = closes.get(monthAfter(d, -1))
    const yieldPoint = valueAt(panel.yield, end)
    const cash = valueAt(panel.TB3MS, end)
    if (!Number.isFinite(previous) || month(yieldPoint?.observedOn ?? '') !== d) continue
    rows.set(d, {
      spx: close / previous - 1 + pctToMonthly(yieldPoint.value),
      cash: month(cash?.observedOn ?? '') === d ? pctToMonthly(cash.value) : null,
    })
  }
  return rows
}

export function buildEquityCurves(signals, returns) {
  const start = monthAfter(signals[0].d, EXECUTION_LAG)
  const wealth = Object.fromEntries(STRATEGIES.map(([id]) => [id, 1]))
  const curves = []
  for (const signal of signals) {
    const d = monthAfter(signal.d, EXECUTION_LAG)
    const row = returns.get(d)
    if (d < start || row?.cash == null) continue
    const weights = STRATEGIES.map(([, , equity]) => equity(signal))
    if (weights.includes(null)) continue
    const point = { d }
    for (let i = 0; i < STRATEGIES.length; i += 1) {
      const id = STRATEGIES[i][0]
      const weight = weights[i]
      wealth[id] *= 1 + weight * row.spx + (1 - weight) * row.cash
      point[id] = round4(wealth[id])
    }
    curves.push(point)
  }
  return curves
}

/** 连续月份算一段；samples 已按月份升序。 */
export function countEpisodes(samples) {
  let episodes = 0
  for (let i = 0; i < samples.length; i += 1) {
    if (i === 0 || samples[i].d !== monthAfter(samples[i - 1].d, 1)) episodes += 1
  }
  return episodes
}

/** 12 个月窗口互相重叠：独立样本 ≈ 月数 ÷ 12（四舍五入），不超过段数，至少 1。 */
export function independentSamples(months, episodes) {
  if (!months) return 0
  return Math.max(1, Math.min(episodes, Math.round(months / FORWARD_MONTHS)))
}

function summarizeForward(samples) {
  if (!samples.length) return emptyForward()
  const episodes = countEpisodes(samples)
  return {
    months: samples.length,
    episodes,
    independent: independentSamples(samples.length, episodes),
    fwd12: average(samples.map(row => row.fwd12)),
    neg12: average(samples.map(row => Number(row.fwd12 < 0))),
    maxDd12: average(samples.map(row => row.maxDd12)),
  }
}

function eraStats(samples) {
  return {
    all: summarizeForward(samples),
    before2000: summarizeForward(samples.filter(row => row.d < ERA_SPLIT)),
    since2000: summarizeForward(samples.filter(row => row.d >= ERA_SPLIT)),
  }
}

export function buildForwardGroupStats(signals, returns) {
  const tierBuckets = Object.fromEntries(TIERS.map(tier => [tier.id, []]))
  const heatBuckets = Object.fromEntries(HEATS.map(heat => [heat, []]))
  for (const signal of signals) {
    const fwd = forward12(returns, signal.d)
    if (!fwd) continue
    const sample = { d: signal.d, ...fwd }
    if (signal.radar && tierBuckets[signal.radar]) tierBuckets[signal.radar].push(sample)
    if (signal.heat && heatBuckets[signal.heat]) heatBuckets[signal.heat].push(sample)
  }
  const pack = (buckets, keyName, keys) => keys.map(key => ({ [keyName]: key, ...eraStats(buckets[key]) }))
  return {
    tierStats: pack(tierBuckets, 'tier', TIERS.map(tier => tier.id)),
    heatStats: pack(heatBuckets, 'heat', HEATS),
  }
}

/**
 * 皮尔逊相关与 OLS 斜率的 Newey-West t（Bartlett 核）。样本少于 lag + 3 时 t 为 null。
 */
export function correlationWithNeweyWest(xs, ys, lag = NW_LAG) {
  const n = xs.length
  if (n < 3) return { months: n, r: null, t: null }
  const mx = average(xs)
  const my = average(ys)
  const xc = xs.map(v => v - mx)
  const yc = ys.map(v => v - my)
  const sxx = xc.reduce((sum, v) => sum + v * v, 0)
  const syy = yc.reduce((sum, v) => sum + v * v, 0)
  const sxy = xc.reduce((sum, v, i) => sum + v * yc[i], 0)
  if (!sxx || !syy) return { months: n, r: null, t: null }
  const r = sxy / Math.sqrt(sxx * syy)
  if (n < lag + 3) return { months: n, r: round3(r), t: null }
  const beta = sxy / sxx
  const u = xc.map((v, i) => v * (yc[i] - beta * v))
  let s = u.reduce((sum, v) => sum + v * v, 0)
  for (let l = 1; l <= lag; l += 1) {
    let c = 0
    for (let i = l; i < n; i += 1) c += u[i] * u[i - l]
    s += 2 * (1 - l / (lag + 1)) * c
  }
  const se = Math.sqrt(s) / sxx
  return { months: n, r: round3(r), t: se > 0 ? round3(beta / se) : null }
}

/** 综合分与冷热分对之后 12 个月回报（与 forward12 同源）的相关性：全样本与两段。 */
export function buildPredictive(signals, returns) {
  const samples = []
  for (const signal of signals) {
    const fwd = forward12(returns, signal.d)
    if (fwd) samples.push({ d: signal.d, score: signal.score, heat: signal.heatScore, y: fwd.fwd12 })
  }
  const corr = (key, rows) => {
    // 缺值月份被去掉后，前后月份会被 Newey-West 当成相邻；现有回测每月都有综合分与冷热分，不受影响
    const valid = rows.filter(row => Number.isFinite(row[key]))
    return correlationWithNeweyWest(valid.map(row => row[key]), valid.map(row => row.y))
  }
  const eras = key => ({
    all: corr(key, samples),
    before2000: corr(key, samples.filter(row => row.d < ERA_SPLIT)),
    since2000: corr(key, samples.filter(row => row.d >= ERA_SPLIT)),
  })
  return { score: eras('score'), heat: eras('heat') }
}

export function buildSharpeGaps(aligned) {
  const peers = [
    ['static70', '恒定七成股票'],
    ['trend', '十个月均线'],
    ['buyhold', '全程持有标普'],
  ]
  const radarRows = aligned.radar
  const n = radarRows.length
  if (!n) throw new Error('sharpeGaps 没有可对齐样本')
  const rng = mulberry32(BOOTSTRAP_SEED)
  const boots = Object.fromEntries(peers.map(([id]) => [id, new Array(BOOTSTRAP_DRAWS)]))
  for (let b = 0; b < BOOTSTRAP_DRAWS; b += 1) {
    const idx = circularBlockIndices(n, BOOTSTRAP_BLOCK, rng)
    const radarBoot = idx.map(i => radarRows[i])
    const radarSharpe = performance(radarBoot).sharpe
    for (const [id] of peers) {
      boots[id][b] = radarSharpe - performance(idx.map(i => aligned[id][i])).sharpe
    }
  }
  return peers.map(([versus, label]) => {
    const series = boots[versus].slice().sort((a, b) => a - b)
    const diff = performance(radarRows).sharpe - performance(aligned[versus]).sharpe
    const low = series[Math.floor(0.025 * BOOTSTRAP_DRAWS)]
    const high = series[Math.min(BOOTSTRAP_DRAWS - 1, Math.ceil(0.975 * BOOTSTRAP_DRAWS) - 1)]
    return { versus, label, diff: round3(diff), low: round3(low), high: round3(high) }
  })
}

function scoreAtMonth(series, id, date) {
  const reading = rankAt(series ?? [], date)
  return scoreIndicator(id, reading?.point ?? null, reading?.percentile ?? null)
}

/** 两项家庭配置：皮尔逊相关、打分相同月份占比、打分相反月份数。 */
export function householdScoreStats(historical, signals) {
  const xs = []
  const ys = []
  let same = 0
  let opposite = 0
  for (const signal of signals) {
    const date = monthEnd(signal.d)
    const equity = scoreAtMonth(historical.equityShare, 'equityShare', date)
    const cash = scoreAtMonth(historical.cashShare, 'cashShare', date)
    if (!Number.isFinite(equity) || !Number.isFinite(cash)) continue
    xs.push(equity)
    ys.push(cash)
    if (equity === cash) same += 1
    if (equity * cash < 0) opposite += 1
  }
  if (xs.length < 2) return { corr: null, sameShare: null, opposite, months: xs.length }
  const mx = average(xs)
  const my = average(ys)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i += 1) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  const corr = dx && dy ? num / Math.sqrt(dx * dy) : null
  return { corr, sameShare: same / xs.length, opposite, months: xs.length }
}

export function buildDisclosures({ monthEndRows, household, revisionNotes = [] } = {}) {
  const get = id => monthEndRows?.find(row => row.id === id)?.full
  const buyhold = get('buyhold')
  const radar = get('radar')
  const trend = get('trend')
  const static70 = get('static70')
  const extras = []
  if (buyhold && radar && trend && static70) {
    extras.push(
      `月均价口径会压低波动。同区间按月末收盘口径，全程持有夏普 ${sharpeText(buyhold.sharpe)}、按综合分持仓 ${sharpeText(radar.sharpe)}、十个月均线 ${sharpeText(trend.sharpe)}、恒定七成 ${sharpeText(static70.sharpe)}。`,
    )
  }
  if (household?.corr != null && household.sameShare != null) {
    const corrText = household.corr.toFixed(2).replace('-', '−')
    const samePct = `${(household.sameShare * 100).toFixed(1)}%`
    const oppositeText = household.opposite === 0
      ? '打分从不相反'
      : `打分相反的月份有 ${household.opposite} 个`
    extras.push(
      `两项家庭配置（股票占比与现金占比）的月度打分皮尔逊相关系数为 ${corrText}，${samePct} 的月份打分相同，${oppositeText}。`,
    )
  }
  for (const note of revisionNotes ?? []) extras.push(note)
  return [...DISCLOSURES, ...extras]
}

export function buildRadarBacktest({
  historical, panel, vintages, dailyRows, today, mastersTimeline = [], signals, revisionNotes,
}) {
  const lastComplete = monthEnd(today, -1)
  const returns = monthlyReturns(panel, lastComplete)
  const closeReturns = monthEndReturns(panel, dailyRows, lastComplete)
  const monthSignals = signals ?? buildMonthlySignals({
    historical, panel, vintages, dailyRows, today, mastersTimeline,
  })
  const start = monthAfter(monthSignals[0].d, EXECUTION_LAG)
  const end = month(lastComplete)
  const aligned = {}
  const rows = STRATEGIES.map(([id, label, equity]) => {
    const full = alignRadar(monthSignals, returns, equity)
    aligned[id] = full
    const byMonth = new Set(full.map(row => row.d))
    for (let d = start; d <= end; d = monthAfter(d, 1)) {
      if (!byMonth.has(d)) throw new Error(`${label}缺少 ${d} 的对齐收益或信号`)
    }
    const train = full.filter(row => row.d < TEST_START)
    const test = full.filter(row => row.d >= TEST_START)
    return { id, label, train: measures(train), test: measures(test), full: measures(full) }
  })
  const monthEndRows = STRATEGIES.map(([id, label, equity]) => {
    const full = alignRadar(monthSignals, closeReturns, equity)
    const test = full.filter(row => row.d >= TEST_START)
    return { id, label, full: measures(full), test: measures(test) }
  })
  const sharpeGaps = buildSharpeGaps(aligned)
  const { tierStats, heatStats } = buildForwardGroupStats(monthSignals, returns)
  const predictive = buildPredictive(monthSignals, returns)
  const household = householdScoreStats(historical ?? {}, monthSignals)
  return {
    start, end,
    trainRange: `${start} 至 ${monthAfter(TEST_START, -1)}`, testRange: `${TEST_START} 至 ${end}`,
    rows,
    verdict: buildBacktestVerdict(rows, sharpeGaps),
    disclosures: buildDisclosures({ monthEndRows, household, revisionNotes }),
    timeline: monthSignals.map(({
      d, radar, spx, score = null, heatScore = null, dims = DIMENSIONS.map(() => null),
    }) => ({
      d, radar, spx, score, heatScore: Number.isFinite(heatScore) ? round4(heatScore) : null, dims,
    })),
    curves: buildEquityCurves(monthSignals, returns),
    monthEndRows,
    sharpeGaps,
    tierStats,
    heatStats,
    predictive,
  }
}
