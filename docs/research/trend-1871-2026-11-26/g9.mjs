#!/usr/bin/env node
// L-027 G9 否决：C2（破位封顶偏防守）接到 v2.2 上，1973–2026，E1 按日引擎（照搬 L-016 / L-023）。
// 用法：node docs/research/trend-1871-2026-11-26/g9.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const FILES = {
  tiers: '../macro-significance-2026-11-25/inputs.json',
  daily: '../late-cycle-warning-2026-11-26/inputs/spx-daily.json',
  e1: '../month-end-close-2026-11-25/results.json',
  late: '../late-cycle-2026-11-25/results.json',
}
const raw = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(here(p), 'utf8')]))
const input = JSON.parse(raw.tiers)
const daily = JSON.parse(raw.daily).rows
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
  return { d, tier, i0, i1, n, div, cash, divDay: div / n, cashDay: cash / n, spxSimple: closes[i1] / closes[i0] - 1 + div }
})

// ---------- C2 接法：信号月 v2.2 月均价低于含当月 10 个月均线时，最终档位最高到偏防守 ----------
const belowOf = d => { const xs = Array.from({ length: 10 }, (_, k) => price.get(monthAfter(d, -k))); if (xs.some(x => x == null)) throw new Error(`缺价格 ${d}`); return price.get(d) < mean(xs) }
const capDef = tier => TIER_IDS[Math.max(TIER_IDS.indexOf(tier), TIER_IDS.indexOf('lean-defense'))]
const STRATS = { base: { tierFn: p => p.tier }, C2: { tierFn: p => (belowOf(p.d) ? capDef(p.tier) : p.tier) } }
function simulate(strat) {
  const navDates = []; const nav = []; const periodRet = []; const periodCash = []
  let w = 1; let prevWeight = null; let turnover = 0; let days = 0; let changed = 0
  for (const p of periods) {
    if (!navDates.length) { navDates.push(dates[p.i0]); nav.push(1) }
    const t = strat.tierFn(p); if (t !== p.tier) changed++
    const weight = EQUITY[t]; let g = 1
    for (let j = p.i0 + 1; j <= p.i1; j += 1) {
      const r = weight * (closes[j] / closes[j - 1] - 1 + p.divDay) + (1 - weight) * p.cashDay
      turnover += prevWeight == null ? 0 : Math.abs(weight - prevWeight); prevWeight = weight
      g *= 1 + r; w *= 1 + r; navDates.push(dates[j]); nav.push(w); days += 1
    }
    periodRet.push(g - 1); periodCash.push(p.cash)
  }
  let peak = -Infinity; let maxDd = 0; nav.forEach(v => { peak = Math.max(peak, v); maxDd = Math.min(maxDd, v / peak - 1) })
  return { navDates, nav, stats: { ...perf(periodRet, periodCash), dailyMaxDd: maxDd, turnoverPerYear: turnover / (days / 252), changedMonths: changed } }
}
const simpleBase = perf(periods.map(p => EQUITY[p.tier] * p.spxSimple + (1 - EQUITY[p.tier]) * p.cash), periods.map(p => p.cash))
const ref = e1Ref.table.E1
const full = Object.fromEntries(Object.entries(STRATS).map(([id, s]) => [id, simulate(s)]))
const repro = { cagr: simpleBase.cagr - ref.strategy.cagr, maxDd: simpleBase.maxDd - ref.strategy.maxDd, sharpe: simpleBase.sharpe - ref.strategy.sharpe, dailyMaxDd: full.base.stats.dailyMaxDd - e1Ref.e1DailyDrawdown.strategy.maxDd }
if (!(Math.abs(repro.cagr) < 0.0005 && Math.abs(repro.maxDd) < 0.0005 && Math.abs(repro.sharpe) < 0.0005 && Math.abs(repro.dailyMaxDd) < 0.001)) { console.error('复现失败', repro); process.exit(1) }
const late = JSON.parse(raw.late)
const PEAKS = ['1973-01-11', '1980-11-28', '1987-08-25', '2000-03-24', '2007-10-09', '2020-02-19', '2022-01-03']
const evs = PEAKS.map(pk => { const e = late.A.events.find(x => x.peak === pk); if (!e) throw new Error(`缺事件 ${pk}`); return e })
const navIdx = new Map(full.base.navDates.map((d, i) => [d, i]))
const loss = (sim, e) => { const from = e.peak < full.base.navDates[0] ? full.base.navDates[0] : e.peak; return sim.nav[navIdx.get(e.trough)] / sim.nav[navIdx.get(from)] - 1 }
const perEvent = evs.map(e => ({ peak: e.peak, trough: e.trough, base: loss(full.base, e), C2: loss(full.C2, e) }))
const sumB = perEvent.reduce((s, e) => s + e.base, 0); const sumC = perEvent.reduce((s, e) => s + e.C2, 0)
const b = full.base.stats; const c = full.C2.stats
const veto = { sharpe: c.sharpe < b.sharpe - 0.02, maxDd: c.dailyMaxDd < b.dailyMaxDd - 0.01, events: sumC < sumB }
const out = { reproduction: repro, base: b, C2: c, perEvent, sumBase: sumB, sumC2: sumC, veto, triggered: Object.values(veto).some(Boolean) }
writeFileSync(here('./g9.json'), JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(out, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v, 1))
