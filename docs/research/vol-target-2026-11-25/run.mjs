#!/usr/bin/env node
// 按 PREREG.md 执行：v2.2 档位上叠加波动率目标（VT1–VT3）。只读本地文件，结果写到 results.json。
// 用法：node docs/research/vol-target-2026-11-25/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const FILES = {
  tiers: '../macro-significance-2026-11-25/inputs.json',
  daily: '../../../data-raw/macro-posture-daily/spx-daily.json',
  lateCycle: '../late-cycle-2026-11-25/results.json',
}
const raw = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(here(p), 'utf8')]))
const input = JSON.parse(raw.tiers)
const daily = JSON.parse(raw.daily).rows
const lateCycle = JSON.parse(raw.lateCycle)

const SEED = 20261125
const DRAWS = 10000
const BLOCK = 12
const FIRST = '1973-01'
const LAST = '2026-08'
const SPLIT = '2000-01'
const EXEC_DAY = 3
const COST = 0.001
const BAND = 0.05
const EQUITY = { offense: 1, 'lean-offense': 0.85, neutral: 0.7, 'lean-defense': 0.5, defense: 0.3 }

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
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

// ---------- 输入整理（与 late-cycle / daily-execution 同口径） ----------
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
const lastDayIdx = m => dayIndex.get(byMonth.get(m)?.at(-1))

// 信号月 d 的持有期：次月第 3 个交易日 → 再下个月第 3 个交易日
function makePeriod(d, tier) {
  const m1 = monthAfter(d, 1); const m2 = monthAfter(d, 2)
  const start = execDay(m1); const end = execDay(m2)
  const d1 = dividend(m1); const d2 = dividend(m2); const c1 = cashOf(m1); const c2 = cashOf(m2)
  if (!start || !end || [d1, d2, c1, c2].some(v => v == null)) return null
  const n1 = byMonth.get(m1).filter(x => x > start).length
  const n2 = byMonth.get(m2).filter(x => x <= end).length
  const N1 = byMonth.get(m1).length; const N2 = byMonth.get(m2).length
  const div = d1 * n1 / N1 + d2 * n2 / N2
  const cash = c1 * n1 / N1 + c2 * n2 / N2
  const i0 = dayIndex.get(start); const i1 = dayIndex.get(end)
  return { d, tier, i0, i1, divDay: div / (i1 - i0), cashDay: cash / (i1 - i0), cash, base: tier ? EQUITY[tier] : 0.7 }
}
const periods = signals.map(([d, tier]) => {
  const p = makePeriod(d, tier)
  if (!p) throw new Error(`缺少 ${d} 的数据`)
  return p
})

// ---------- 实际波动与参照波动（只用过去数据） ----------
const sigma = new Array(dates.length).fill(null)
const sigmaStar = new Array(dates.length).fill(null)
{
  const lr = closes.map((c, i) => (i ? Math.log(c / closes[i - 1]) : null))
  const sorted = []
  const insert = x => { let lo = 0; let hi = sorted.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (sorted[mid] < x) lo = mid + 1; else hi = mid } sorted.splice(lo, 0, x) }
  for (let t = 20; t < dates.length; t += 1) {
    const w = lr.slice(t - 19, t + 1)
    sigma[t] = Math.sqrt(sampleVar(w)) * Math.sqrt(252)
    insert(sigma[t])
    const n = sorted.length
    sigmaStar[t] = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  }
}
const kOf = t => (sigma[t] && sigmaStar[t] ? Math.min(1, sigmaStar[t] / sigma[t]) : 1)
const ratioOf = t => (sigma[t] && sigmaStar[t] ? sigmaStar[t] / sigma[t] : 1)

// held[k]：第 k 日收盘成交后的仓位；第 j 日收益用 held[j-1]
function heldPath(id, ps) {
  const held = new Array(dates.length).fill(null)
  const baseHeld = new Array(dates.length).fill(null)
  for (const p of ps) for (let k = p.i0; k < p.i1; k += 1) baseHeld[k] = p.base
  const lastIdx = ps.at(-1).i1
  baseHeld[lastIdx] = ps.at(-1).base
  if (id === 'base') return baseHeld
  if (id === 'VT3') {
    for (const p of ps) {
      const k = kOf(lastDayIdx(p.d))
      for (let j = p.i0; j < p.i1; j += 1) held[j] = p.base * k
    }
    held[lastIdx] = held[lastIdx - 1]
    return held
  }
  const first = ps[0].i0
  for (let k = first; k <= lastIdx; k += 1) {
    const b = baseHeld[k]
    const target = id === 'VT2' ? Math.min(1, b * ratioOf(k - 1)) : b * kOf(k - 1)
    if (k === first || b !== baseHeld[k - 1]) held[k] = target
    else held[k] = Math.abs(target - held[k - 1]) >= BAND ? target : held[k - 1]
  }
  return held
}

function simulate(held, ps, filter = () => true) {
  const navDates = []; const nav = []; const weights = []
  const gross = []; const net = []; const cash = []; const ds = []
  let w = 1; let trades = 0; let turnover = 0; let days = 0; let prev = null
  for (const p of ps) {
    if (!filter(p.d)) continue
    if (!navDates.length) { navDates.push(dates[p.i0]); nav.push(1); prev = held[p.i0] }
    let g = 1; let gn = 1
    for (let j = p.i0 + 1; j <= p.i1; j += 1) {
      const weight = held[j - 1]
      const trade = Math.abs(weight - prev)
      if (trade > 1e-12) { trades += 1; turnover += trade }
      prev = weight
      const r = weight * (closes[j] / closes[j - 1] - 1 + p.divDay) + (1 - weight) * p.cashDay
      g *= 1 + r; gn *= (1 + r) * (1 - COST * trade)
      w *= 1 + r
      navDates.push(dates[j]); nav.push(w); weights.push(weight); days += 1
    }
    gross.push(g - 1); net.push(gn - 1); cash.push(p.cash); ds.push(p.d)
  }
  let peak = -Infinity; let maxDd = 0
  for (const v of nav) { peak = Math.max(peak, v); maxDd = Math.min(maxDd, v / peak - 1) }
  let m = 1; let mPeak = 1; let monthlyDd = 0
  for (const r of gross) { m *= 1 + r; mPeak = Math.max(mPeak, m); monthlyDd = Math.min(monthlyDd, m / mPeak - 1) }
  const years = days / 252
  const exGross = gross.map((r, i) => r - cash[i]); const exNet = net.map((r, i) => r - cash[i])
  return {
    navDates, nav, weights, exGross, exNet, ds,
    stats: {
      periods: gross.length, cagr: m ** (12 / gross.length) - 1, sharpe: sharpeOf(exGross), sharpeNet: sharpeOf(exNet),
      dailyMaxDd: maxDd, monthlyMaxDd: monthlyDd, avgEquity: mean(weights), tradesPerYear: trades / years, turnoverPerYear: turnover / years,
    },
  }
}

const STRATS = { base: 'v2.2 基线（不缩放）', VT1: '只降不升（按日）', VT2: '双向（按日，最高 100%）', VT3: '只降不升（按月）' }
const CANDIDATES = ['VT1', 'VT2', 'VT3']
const paths = Object.fromEntries(Object.keys(STRATS).map(id => [id, heldPath(id, periods)]))
const full = Object.fromEntries(Object.entries(paths).map(([id, h]) => [id, simulate(h, periods)]))
const ref = lateCycle.B.full.base
const reproduction = { sharpe: full.base.stats.sharpe - ref.sharpe, dailyMaxDd: full.base.stats.dailyMaxDd - ref.dailyMaxDd, cagr: full.base.stats.cagr - ref.cagr }
if (!Object.values(reproduction).every(x => Math.abs(x) < 0.001)) {
  console.error('复现失败，停止：', reproduction)
  process.exit(1)
}

const train = Object.fromEntries(Object.entries(paths).map(([id, h]) => [id, simulate(h, periods, d => d < SPLIT).stats]))
const valid = Object.fromEntries(Object.entries(paths).map(([id, h]) => [id, simulate(h, periods, d => d >= SPLIT).stats]))
const boot = Object.fromEntries(CANDIDATES.map(id => [id, bootSharpeDiff(full[id].exNet, full.base.exNet)]))
const order = CANDIDATES.slice().sort((a, b) => boot[a].p - boot[b].p)
let running = 0
order.forEach((id, i) => { running = Math.max(running, Math.min(1, (order.length - i) * boot[id].p)); boot[id].holm = running })
// 门槛 4：去掉持有期开始于 2020-01 至 2020-04 的各期
const ex2020 = sim => sim.exNet.filter((_, i) => { const start = monthAfter(sim.ds[i], 1); return start < '2020-01' || start > '2020-04' })
const without2020 = Object.fromEntries(Object.keys(STRATS).map(id => [id, sharpeOf(ex2020(full[id]))]))

const gate = {}
for (const id of CANDIDATES) {
  const t = train[id]; const tb = train.base
  const g1Sharpe = t.sharpeNet >= tb.sharpeNet + 0.02
  const g1Dd = t.dailyMaxDd >= tb.dailyMaxDd - 0.01
  gate[id] = { trainSharpeNetDiff: t.sharpeNet - tb.sharpeNet, trainDdDiff: t.dailyMaxDd - tb.dailyMaxDd, g1Sharpe, g1Dd, passTrain: g1Sharpe && g1Dd }
}
const pick = CANDIDATES.filter(id => gate[id].passTrain).sort((a, b) => train[b].sharpeNet - train[a].sharpeNet)[0] ?? null
if (pick) {
  gate[pick].passValid = valid[pick].sharpeNet >= valid.base.sharpeNet && valid[pick].dailyMaxDd >= valid.base.dailyMaxDd - 0.01
  gate[pick].passBoot = boot[pick].holm < 0.05
  gate[pick].pass2020 = without2020[pick] >= without2020.base
}
const verdict = Object.fromEntries(CANDIDATES.map(id => {
  const g = gate[id]
  let text
  if (!g.passTrain) {
    const why = [
      !g.g1Sharpe && `训练期扣成本夏普比基线${g.trainSharpeNetDiff >= 0 ? '只高' : '低'} ${Math.abs(g.trainSharpeNetDiff).toFixed(3)}（门槛 +0.02）`,
      !g.g1Dd && `训练期按日回撤恶化 ${(-g.trainDdDiff * 100).toFixed(1)} 个百分点（门槛 1）`,
    ].filter(Boolean)
    text = `不通过：${why.join('；')}`
  } else if (id !== pick) text = '不通过：训练期通过，但不是训练期扣成本夏普最高的一个'
  else if (!g.passValid) text = '不通过：验证期没有满足扣成本夏普不低于基线且回撤恶化不超过 1 个百分点'
  else if (!g.passBoot) text = `不通过：Holm 校正后 p = ${boot[id].holm.toFixed(2)}，未达 0.05`
  else if (!g.pass2020) text = '不通过：去掉 2020 年 1–4 月后扣成本夏普低于基线'
  else text = '通过（进入影子跟踪）'
  return [id, text]
}))

// ---------- 另外报告：只用波动率目标（恒定七成 × k），1950–1972 与 1973–2026 ----------
const plainPeriods = []
for (let d = '1950-01'; d <= LAST; d = monthAfter(d, 1)) { const p = makePeriod(d, null); if (p) plainPeriods.push(p) }
const standalone = {}
for (const [label, from, to] of [['1950–1972', '1950-01', '1972-12'], ['1973–2026', '1973-01', LAST]]) {
  const ps = plainPeriods.filter(p => p.d >= from && p.d <= to)
  standalone[label] = {
    periods: ps.length, first: ps[0]?.d,
    static70: simulate(heldPath('base', ps), ps).stats,
    static70xK: simulate(heldPath('VT1', ps), ps).stats,
  }
}

// ---------- 回调事件 ----------
const navIdx = new Map(full.base.navDates.map((d, i) => [d, i]))
const navEnd = full.base.navDates.at(-1)
const events = lateCycle.A.events.map(e => {
  const from = e.measuredFrom; const to = e.trough > navEnd ? navEnd : e.trough
  const end = e.recover && e.recover <= navEnd ? e.recover : navEnd
  const at = (id, d) => full[id].nav[navIdx.get(d)]
  return {
    peak: e.peak, trough: e.trough, spxLoss: e.spxLoss, recession: e.recession,
    byStrat: Object.fromEntries(Object.keys(STRATS).map(id => [id, { loss: at(id, to) / at(id, from) - 1, gain: at(id, end) / at(id, to) - 1 }])),
  }
})

const results = {
  prereg: 'docs/research/vol-target-2026-11-25/PREREG.md',
  inputs: Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, { file: p, sha256: createHash('sha256').update(raw[k]).digest('hex') }])),
  window: { navStart: full.base.navDates[0], navEnd },
  reproduction, labels: STRATS, band: BAND,
  sigmaNow: { date: dates.at(-1), sigma: sigma.at(-1), sigmaStar: sigmaStar.at(-1), k: kOf(dates.length - 1) },
  full: Object.fromEntries(Object.entries(full).map(([id, s]) => [id, s.stats])),
  train, valid, without2020, gate, pick,
  bootstrap: { block: BLOCK, draws: DRAWS, seed: SEED, basis: '扣成本每期超额收益', ...boot },
  verdict, standalone, events,
}
writeFileSync(here('./results.json'), JSON.stringify(results, null, 2) + '\n')

const pct = x => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
console.log(`复现通过；当前 20 日波动 ${pct(results.sigmaNow.sigma)}，参照 ${pct(results.sigmaNow.sigmaStar)}，k ${results.sigmaNow.k.toFixed(2)}`)
for (const id of Object.keys(STRATS)) {
  const f = full[id].stats; const t = train[id]; const v = valid[id]
  console.log(`${id.padEnd(4)} 全 夏普 ${f.sharpe.toFixed(3)} 扣费 ${f.sharpeNet.toFixed(3)} 年化 ${pct(f.cagr)} 日回撤 ${pct(f.dailyMaxDd)} 月回撤 ${pct(f.monthlyMaxDd)} 仓位 ${pct(f.avgEquity)} 调仓 ${f.tradesPerYear.toFixed(1)}/年 换手 ${pct(f.turnoverPerYear)} | 训 ${t.sharpeNet.toFixed(3)} ${pct(t.dailyMaxDd)} | 验 ${v.sharpeNet.toFixed(3)} ${pct(v.dailyMaxDd)} | 去2020 ${without2020[id].toFixed(3)}`)
}
for (const id of CANDIDATES) console.log(`${id}: 扣费夏普差 ${boot[id].point.toFixed(3)} [${boot[id].low.toFixed(3)}, ${boot[id].high.toFixed(3)}] Holm ${boot[id].holm.toFixed(3)} → ${verdict[id]}`)
for (const [label, s] of Object.entries(standalone)) console.log(`单用波动率目标 ${label}（${s.periods} 期）：恒定七成 扣费夏普 ${s.static70.sharpeNet.toFixed(3)} 日回撤 ${pct(s.static70.dailyMaxDd)} 年化 ${pct(s.static70.cagr)} | ×k ${s.static70xK.sharpeNet.toFixed(3)} ${pct(s.static70xK.dailyMaxDd)} ${pct(s.static70xK.cagr)}`)
for (const e of events) console.log(e.peak, pct(e.spxLoss), Object.entries(e.byStrat).map(([id, v]) => `${id} ${pct(v.loss)}/${pct(v.gain)}`).join('  '))
