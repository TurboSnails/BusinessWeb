#!/usr/bin/env node
// 按 PREREG.md 执行：A 回调事件研究；B 四个月中刹车候选。只读本地文件，结果写到 results.json。
// 用法：node docs/research/late-cycle-2026-11-25/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const FILES = {
  tiers: '../macro-significance-2026-11-25/inputs.json',
  daily: '../../../data-raw/macro-posture-daily/spx-daily.json',
  combined: '../../../public/data/combined-strategy.json',
  macro: '../../../public/data/macro-posture.json',
  e1: '../month-end-close-2026-11-25/results.json',
}
const raw = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(here(p), 'utf8')]))
const input = JSON.parse(raw.tiers)
const daily = JSON.parse(raw.daily).rows
const heatOf = new Map(JSON.parse(raw.combined).timeline.map(r => [r.d, r.heat]))
const recOf = new Map(JSON.parse(raw.macro).backtest.timeline.map(r => [r.d, r.rec]))
const e1Ref = JSON.parse(raw.e1)

const SEED = 20261125
const DRAWS = 10000
const BLOCK = 12
const FIRST = '1973-01'
const LAST = '2026-08'
const SPLIT = '2000-01'
const EXEC_DAY = 3
const COST = 0.001
const TIER_IDS = ['offense', 'lean-offense', 'neutral', 'lean-defense', 'defense']
const EQUITY = { offense: 1, 'lean-offense': 0.85, neutral: 0.7, 'lean-defense': 0.5, defense: 0.3 }
const down = tier => TIER_IDS[Math.min(TIER_IDS.length - 1, TIER_IDS.indexOf(tier) + 1)]

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const median = xs => { const s = xs.slice().sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
const sampleVar = xs => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) }
const monthAfter = (d, k) => {
  const [y, m] = d.split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function blockIndices(n, block, rng) {
  const idx = new Array(n)
  let i = 0
  while (i < n) {
    const start = Math.floor(rng() * n)
    for (let k = 0; k < block && i < n; k += 1) { idx[i] = (start + k) % n; i += 1 }
  }
  return idx
}
const quantile = (sorted, q) => {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos); const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}
const sharpeOf = ex => Math.sqrt(12) * mean(ex) / Math.sqrt(sampleVar(ex))
function bootSharpeDiff(x, y) {
  const rng = mulberry32(SEED)
  const draws = new Array(DRAWS)
  for (let b = 0; b < DRAWS; b += 1) {
    const idx = blockIndices(x.length, BLOCK, rng)
    draws[b] = sharpeOf(idx.map(i => x[i])) - sharpeOf(idx.map(i => y[i]))
  }
  const sorted = draws.slice().sort((a, b) => a - b)
  const le = draws.filter(d => d <= 0).length / DRAWS
  const ge = draws.filter(d => d >= 0).length / DRAWS
  return { point: sharpeOf(x) - sharpeOf(y), low: quantile(sorted, 0.025), high: quantile(sorted, 0.975), p: Math.min(1, 2 * Math.min(le, ge)) }
}
function perf(port, cash) {
  let w = 1; let peak = 1; let maxDd = 0
  for (const r of port) { w *= 1 + r; peak = Math.max(peak, w); maxDd = Math.min(maxDd, w / peak - 1) }
  const ex = port.map((r, i) => r - cash[i])
  return { months: port.length, cagr: w ** (12 / port.length) - 1, vol: Math.sqrt(12 * sampleVar(port)), maxDd, sharpe: sharpeOf(ex) }
}

// ---------- 输入整理（与 month-end-close 同口径） ----------
const returns = new Map(input.returns.map(([d, spx, cash]) => [d, { spx, cash }]))
const price = new Map(input.price)
const dividend = m => {
  const r = returns.get(m); const p = price.get(m); const p0 = price.get(monthAfter(m, -1))
  return r && p && p0 ? r.spx - (p / p0 - 1) : null
}
const cashOf = m => returns.get(m)?.cash ?? null
const signals = input.tiers.filter(([d]) => d >= FIRST && d <= LAST)
if (signals.length !== 644) throw new Error(`信号月数 ${signals.length} ≠ 644`)

const dates = daily.map(([d]) => d)
const closes = daily.map(([, c]) => c)
const byMonth = new Map()
for (const d of dates) {
  const m = d.slice(0, 7)
  if (!byMonth.has(m)) byMonth.set(m, [])
  byMonth.get(m).push(d)
}
const dayIndex = new Map(dates.map((d, i) => [d, i]))
const execDay = m => byMonth.get(m)?.[EXEC_DAY - 1]

// 每期：start/end 为交易日下标；每日股息 divDay、每日现金 cashDay
const periods = signals.map(([d, tier]) => {
  const m1 = monthAfter(d, 1); const m2 = monthAfter(d, 2)
  const start = execDay(m1); const end = execDay(m2)
  const d1 = dividend(m1); const d2 = dividend(m2); const c1 = cashOf(m1); const c2 = cashOf(m2)
  if (!start || !end || [d1, d2, c1, c2].some(v => v == null) || EQUITY[tier] == null) throw new Error(`缺少 ${d} 的数据`)
  const n1 = byMonth.get(m1).filter(x => x > start).length
  const n2 = byMonth.get(m2).filter(x => x <= end).length
  const N1 = byMonth.get(m1).length; const N2 = byMonth.get(m2).length
  const div = d1 * n1 / N1 + d2 * n2 / N2
  const cash = c1 * n1 / N1 + c2 * n2 / N2
  const i0 = dayIndex.get(start); const i1 = dayIndex.get(end)
  const n = i1 - i0
  return { d, tier, heat: heatOf.get(d) ?? null, i0, i1, n, div, cash, divDay: div / n, cashDay: cash / n, spxSimple: closes[i1] / closes[i0] - 1 + div }
})
const missingHeat = periods.filter(p => p.heat == null).map(p => p.d)

// ---------- 日线指标（含当日） ----------
const sma200 = new Array(closes.length).fill(null)
const high252 = new Array(closes.length).fill(null)
{
  let sum = 0
  for (let k = 0; k < closes.length; k += 1) {
    sum += closes[k]
    if (k >= 200) sum -= closes[k - 200]
    if (k >= 199) sma200[k] = sum / 200
    if (k >= 251) { let mx = -Infinity; for (let j = k - 251; j <= k; j += 1) mx = Math.max(mx, closes[j]); high252[k] = mx }
  }
}
const ddCond = k => high252[k] != null && closes[k] <= 0.9 * high252[k]
const trendCond = k => sma200[k] != null && closes[k] < sma200[k]
const offenseSide = tier => tier === 'offense' || tier === 'lean-offense'

// 候选：给定期 p 与条件判断日 k，返回当日仓位；null 表示条件不成立（用基线）
const CANDIDATES = {
  K1: { label: '回撤熔断', overlay: (p, k) => (ddCond(k) ? EQUITY[down(p.tier)] : null) },
  K2: { label: '日线破位', overlay: (p, k) => (trendCond(k) ? EQUITY[down(p.tier)] : null) },
  K3: { label: '偏热且日线破位', overlay: (p, k) => (trendCond(k) && p.heat === 'hot' && offenseSide(p.tier) ? EQUITY.neutral : null) },
  K4: { label: '偏热且回撤熔断', overlay: (p, k) => (ddCond(k) && p.heat === 'hot' ? EQUITY[down(p.tier)] : null) },
}
const STRATS = {
  base: { label: 'v2.2 基线', overlay: () => null },
  static70: { label: '恒定七成', fixed: 0.7 },
  buyhold: { label: '全程持有', fixed: 1 },
  ...CANDIDATES,
}

// 按日模拟：第 j 个日收益（close j-1 → close j）的仓位由 close j-2 的条件决定；每期第一天重置为基线
function simulate(strat, filter = () => true) {
  const navDates = []; const nav = []; const weightPath = []
  const periodRet = []; const periodRetNet = []; const periodCash = []; const periodD = []
  let w = 1; let wNet = 1; let prevWeight = null; let triggerDays = 0; let turnover = 0; let days = 0
  for (const p of periods) {
    if (!filter(p.d)) continue
    if (!navDates.length) { navDates.push(dates[p.i0]); nav.push(1) }
    const base = strat.fixed ?? EQUITY[p.tier]
    let g = 1; let gNet = 1
    for (let j = p.i0 + 1; j <= p.i1; j += 1) {
      let weight = base
      if (!strat.fixed && j - 2 >= p.i0) {
        const o = strat.overlay(p, j - 2)
        if (o != null) { weight = o; triggerDays += 1 }
      }
      const stock = closes[j] / closes[j - 1] - 1 + p.divDay
      const r = weight * stock + (1 - weight) * p.cashDay
      const trade = prevWeight == null ? 0 : Math.abs(weight - prevWeight)
      turnover += trade
      prevWeight = weight
      g *= 1 + r; gNet *= (1 + r) * (1 - COST * trade)
      w *= 1 + r; wNet *= (1 + r) * (1 - COST * trade)
      navDates.push(dates[j]); nav.push(w); weightPath.push(weight); days += 1
    }
    periodRet.push(g - 1); periodRetNet.push(gNet - 1); periodCash.push(p.cash); periodD.push(p.d)
  }
  let peak = -Infinity; let peakDate = null; let maxDd = 0; let ddPeak = null; let ddTrough = null
  nav.forEach((v, i) => {
    if (v > peak) { peak = v; peakDate = navDates[i] }
    const dd = v / peak - 1
    if (dd < maxDd) { maxDd = dd; ddPeak = peakDate; ddTrough = navDates[i] }
  })
  const years = days / 252
  return {
    navDates, nav, weightPath, periodRet, periodCash, periodD,
    stats: {
      ...perf(periodRet, periodCash),
      sharpeNet: sharpeOf(periodRetNet.map((r, i) => r - periodCash[i])),
      dailyMaxDd: maxDd, dailyDdPeak: ddPeak, dailyDdTrough: ddTrough,
      avgEquity: mean(weightPath), triggerDaysPerYear: triggerDays / years, turnoverPerYear: turnover / years,
    },
  }
}

// ---------- 复现门槛 ----------
// 1) 期内买入持有（E1 原定义）复现 month-end-close 的 E1 表；2) 按日净值最大回撤复现
const simpleBase = perf(periods.map(p => EQUITY[p.tier] * p.spxSimple + (1 - EQUITY[p.tier]) * p.cash), periods.map(p => p.cash))
const simpleStatic = perf(periods.map(p => 0.7 * p.spxSimple + 0.3 * p.cash), periods.map(p => p.cash))
const full = Object.fromEntries(Object.entries(STRATS).map(([id, s]) => [id, simulate(s)]))
const ref = e1Ref.table.E1
const reproduction = {
  strategy: { cagr: simpleBase.cagr - ref.strategy.cagr, maxDd: simpleBase.maxDd - ref.strategy.maxDd, sharpe: simpleBase.sharpe - ref.strategy.sharpe },
  static70: { cagr: simpleStatic.cagr - ref.static70.cagr, maxDd: simpleStatic.maxDd - ref.static70.maxDd, sharpe: simpleStatic.sharpe - ref.static70.sharpe },
  dailyMaxDd: {
    strategy: full.base.stats.dailyMaxDd - e1Ref.e1DailyDrawdown.strategy.maxDd,
    static70: full.static70.stats.dailyMaxDd - e1Ref.e1DailyDrawdown.static70.maxDd,
  },
}
const reproduced = [reproduction.strategy, reproduction.static70].every(o => Object.values(o).every(x => Math.abs(x) < 0.0005))
  && Object.values(reproduction.dailyMaxDd).every(x => Math.abs(x) < 0.001)
if (!reproduced) {
  console.error('复现失败，停止：', JSON.stringify(reproduction, null, 2))
  process.exit(1)
}

// ---------- B. 门槛 ----------
const train = Object.fromEntries(Object.entries(STRATS).map(([id, s]) => [id, simulate(s, d => d < SPLIT).stats]))
const valid = Object.fromEntries(Object.entries(STRATS).map(([id, s]) => [id, simulate(s, d => d >= SPLIT).stats]))
const exOf = sim => sim.periodRet.map((r, i) => r - sim.periodCash[i])
const boot = Object.fromEntries(Object.keys(CANDIDATES).map(id => [id, bootSharpeDiff(exOf(full[id]), exOf(full.base))]))
// Holm
const order = Object.keys(boot).sort((a, b) => boot[a].p - boot[b].p)
let running = 0
order.forEach((id, i) => { running = Math.max(running, Math.min(1, (order.length - i) * boot[id].p)); boot[id].holm = running })

const gate = {}
for (const id of Object.keys(CANDIDATES)) {
  const t = train[id]; const tb = train.base
  const g1Sharpe = t.sharpe >= tb.sharpe + 0.02
  const g1Dd = t.dailyMaxDd >= tb.dailyMaxDd - 0.01
  gate[id] = { trainSharpeDiff: t.sharpe - tb.sharpe, trainDdDiff: t.dailyMaxDd - tb.dailyMaxDd, passTrain: g1Sharpe && g1Dd, g1Sharpe, g1Dd }
}
const trainPassers = Object.keys(gate).filter(id => gate[id].passTrain).sort((a, b) => train[b].sharpe - train[a].sharpe)
const pick = trainPassers[0] ?? null
if (pick) {
  const v = valid[pick]; const vb = valid.base
  gate[pick].passValid = v.sharpe >= vb.sharpe && v.dailyMaxDd >= vb.dailyMaxDd - 0.01
  gate[pick].passBoot = boot[pick].holm < 0.05
}
const verdictB = Object.fromEntries(Object.keys(CANDIDATES).map(id => {
  const g = gate[id]
  let text
  if (!g.passTrain) {
    const why = [!g.g1Sharpe && `训练期夏普比基线${g.trainSharpeDiff >= 0 ? '只高' : '低'} ${Math.abs(g.trainSharpeDiff).toFixed(3)}（门槛 +0.02）`, !g.g1Dd && `训练期按日回撤恶化 ${(-g.trainDdDiff * 100).toFixed(1)} 个百分点（门槛 1）`].filter(Boolean)
    text = `不通过：${why.join('；')}`
  } else if (id !== pick) text = '不通过：训练期通过，但不是训练期夏普最高的一个'
  else if (!g.passValid) text = '不通过：验证期没有满足夏普不低于基线且回撤恶化不超过 1 个百分点'
  else if (!g.passBoot) text = `不通过：Holm 校正后 p = ${boot[id].holm.toFixed(2)}，未达 0.05`
  else text = '通过（进入影子跟踪）'
  return [id, text]
}))

// ---------- A. 回调事件 ----------
const navStart = full.base.navDates[0]
const navEnd = full.base.navDates.at(-1)
const navIndex = new Map(full.base.navDates.map((d, i) => [d, i]))
// 某日收盘时持有的仓位（回测第一天取第一期仓位）
const weightOn = (sim, d) => { const i = navIndex.get(d); return i == null ? null : sim.weightPath[Math.max(0, i - 1)] }
const navOn = (sim, d) => sim.nav[navIndex.get(d)]
const spxTr = (() => { // 标普含息（与基线同口径的股息分摊）
  const v = [1]
  for (const p of periods) for (let j = p.i0 + 1; j <= p.i1; j += 1) v.push(v.at(-1) * (1 + closes[j] / closes[j - 1] - 1 + p.divDay))
  return v
})()
const spxOn = d => spxTr[navIndex.get(d)]

const episodes = []
{
  let ath = -Infinity; let athIdx = -1; let cur = null
  for (let k = 0; k < closes.length; k += 1) {
    if (closes[k] >= ath) {
      if (cur) { cur.recoverIdx = k; episodes.push(cur); cur = null }
      ath = closes[k]; athIdx = k
      continue
    }
    if (!cur && closes[k] <= 0.9 * ath) cur = { peakIdx: athIdx, troughIdx: k }
    if (cur && closes[k] < closes[cur.troughIdx]) cur.troughIdx = k
  }
  if (cur) { cur.recoverIdx = null; episodes.push(cur) }
}
const inWindow = episodes.filter(e => dates[e.troughIdx] >= navStart && dates[e.peakIdx] <= navEnd)
const events = inWindow.map(e => {
  const peak = dates[e.peakIdx]; const trough = dates[e.troughIdx]
  const recover = e.recoverIdx == null ? null : dates[e.recoverIdx]
  const from = peak < navStart ? navStart : peak
  const to = trough > navEnd ? navEnd : trough
  const recEnd = recover == null || recover > navEnd ? navEnd : recover
  const peakMonth = peak.slice(0, 7); const troughMonth = trough.slice(0, 7)
  // 高点在回测起点之前时（1973 年），取第一个信号月
  const signalMonth = monthAfter(peakMonth, -1) < FIRST ? FIRST : monthAfter(peakMonth, -1)
  const tierAtPeak = input.tiers.find(([d]) => d === signalMonth)?.[1] ?? null
  let recession = false
  for (let m = peakMonth; m <= troughMonth; m = monthAfter(m, 1)) if (recOf.get(m) === 1) recession = true
  const loss = sim => navOn(sim, to) / navOn(sim, from) - 1
  const gain = sim => navOn(sim, recEnd) / navOn(sim, to) - 1
  const w0 = weightOn(full.base, from)
  let firstCut = null
  const i0 = navIndex.get(from); const i1 = navIndex.get(to)
  for (let i = i0 + 1; i <= i1; i += 1) if (full.base.weightPath[i - 1] < w0 - 1e-9) { firstCut = i - i0; break }
  const minWeight = Math.min(...full.base.weightPath.slice(i0, i1))
  const spxLoss = spxOn(to) / spxOn(from) - 1
  const spxGain = spxOn(recEnd) / spxOn(to) - 1
  const byStrat = Object.fromEntries(['base', 'static70', ...Object.keys(CANDIDATES)].map(id => [id, { loss: loss(full[id]), gain: gain(full[id]) }]))
  return {
    peak, trough, recover, depth: closes[e.troughIdx] / closes[e.peakIdx] - 1, bear: closes[e.troughIdx] / closes[e.peakIdx] - 1 <= -0.2,
    measuredFrom: from, recession, signalMonth, tierAtPeak, heatAtPeak: heatOf.get(signalMonth) ?? null,
    weightAtPeak: w0, weightAtTrough: weightOn(full.base, to), minWeight,
    firstCutDays: firstCut, peakToTroughDays: i1 - i0,
    spxLoss, spxGain, recoveredInWindow: recover != null && recover <= navEnd,
    byStrat,
    downParticipation: byStrat.base.loss / spxLoss,
    upParticipation: spxGain > 0 ? byStrat.base.gain / spxGain : null,
  }
})
const group = (label, f) => {
  const xs = events.filter(f)
  return {
    label, n: xs.length,
    downMedian: median(xs.map(e => e.downParticipation)),
    upMedian: median(xs.filter(e => e.upParticipation != null).map(e => e.upParticipation)),
    cutBeforeTrough: xs.filter(e => e.firstCutDays != null).length,
    events: xs.map(e => e.peak),
  }
}
const groups = [
  group('全部', () => true),
  group('伴随衰退', e => e.recession),
  group('不伴随衰退', e => !e.recession),
  group('高点时偏热', e => e.heatAtPeak === 'hot'),
  group('高点时不偏热', e => e.heatAtPeak !== 'hot'),
  group('偏热且进攻侧（扩张后段）', e => e.heatAtPeak === 'hot' && offenseSide(e.tierAtPeak)),
  group('熊市（≥20%）', e => e.bear),
]
const rec = groups[1].downMedian; const non = groups[2].downMedian
const verdictA = rec < 0.6 && non > 0.75 ? '对衰退型下跌有用，对非衰退型回调基本没有作用'
  : rec < 0.6 && non < 0.6 ? '对两类回调都有作用'
    : rec > 0.75 && non > 0.75 ? '对回调基本没有作用'
      : `衰退型下跌参与度中位数 ${rec.toFixed(2)}，非衰退型 ${non.toFixed(2)}`

const strip = s => s.stats
const results = {
  prereg: 'docs/research/late-cycle-2026-11-25/PREREG.md',
  inputs: Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, { file: p, sha256: createHash('sha256').update(raw[k]).digest('hex') }])),
  window: { signals: [FIRST, LAST], navStart, navEnd, missingHeat },
  reproduction,
  note: '复现用期内买入持有（E1 原定义）；比较候选时基线与候选都用按日再平衡的净值，口径一致。',
  A: { events, groups, verdict: verdictA },
  B: {
    full: Object.fromEntries(Object.entries(full).map(([id, s]) => [id, strip(s)])),
    train, valid, gate, bootstrap: { block: BLOCK, draws: DRAWS, seed: SEED, ...boot }, pick, verdict: verdictB,
  },
}
writeFileSync(here('./results.json'), JSON.stringify(results, null, 2) + '\n')

// ---------- 打印 ----------
const pct = x => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
console.log(`复现通过；净值 ${navStart} 至 ${navEnd}；缺冷热 ${missingHeat.length} 个月`)
console.log('\nA. 回调事件')
for (const e of events) {
  console.log(`${e.peak} → ${e.trough} ${pct(e.depth).padStart(7)} ${e.recession ? '衰退' : '    '} ${String(e.tierAtPeak).padEnd(12)} ${String(e.heatAtPeak).padEnd(4)} 仓位 ${pct(e.weightAtPeak)}→${pct(e.weightAtTrough)} 首降 ${e.firstCutDays ?? '未降'} / ${e.peakToTroughDays} 天 | 跌 标普 ${pct(e.spxLoss)} 策略 ${pct(e.byStrat.base.loss)} 七成 ${pct(e.byStrat.static70.loss)} | 涨 标普 ${pct(e.spxGain)} 策略 ${pct(e.byStrat.base.gain)}`)
}
for (const g of groups) console.log(`${g.label}: ${g.n} 次，下跌参与度中位 ${g.downMedian?.toFixed(2)}，反弹参与度中位 ${g.upMedian?.toFixed(2)}，低点前降过仓 ${g.cutBeforeTrough}`)
console.log(`A 结论：${verdictA}`)
console.log('\nB. 候选（全样本 / 训练期 / 验证期）')
for (const id of Object.keys(STRATS)) {
  const f = full[id].stats; const t = train[id]; const v = valid[id]
  console.log(`${id.padEnd(8)} 全 夏普 ${f.sharpe.toFixed(3)} 年化 ${pct(f.cagr)} 日回撤 ${pct(f.dailyMaxDd)} 仓位 ${pct(f.avgEquity)} 触发 ${f.triggerDaysPerYear.toFixed(0)} 天/年 换手 ${pct(f.turnoverPerYear)} 扣费夏普 ${f.sharpeNet.toFixed(3)} | 训 ${t.sharpe.toFixed(3)} ${pct(t.dailyMaxDd)} | 验 ${v.sharpe.toFixed(3)} ${pct(v.dailyMaxDd)}`)
}
for (const id of Object.keys(CANDIDATES)) console.log(`${id}: 夏普差 ${boot[id].point.toFixed(3)} [${boot[id].low.toFixed(3)}, ${boot[id].high.toFixed(3)}] p ${boot[id].p.toFixed(3)} Holm ${boot[id].holm.toFixed(3)} → ${verdictB[id]}`)
