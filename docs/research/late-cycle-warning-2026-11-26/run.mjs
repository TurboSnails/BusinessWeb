#!/usr/bin/env node
// 按 PREREG.md（L-023）执行：牛市后期多维预警。执行引擎与输入照搬 late-cycle-2026-11-25/run.mjs（L-016）。
// 只读本地文件，结果写到 results.json。用法：node docs/research/late-cycle-warning-2026-11-26/run.mjs
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
  baa: './inputs-baa.json',
  vix: '../../../data-raw/market-radar/VIX.json',
  industryTrend: '../../../data-raw/market-radar/industry-trend.json',
  industry: '../trend-overlay-2026-11-25/inputs-industry.json',
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

// ---------- 信号（PREREG「信号定义」，只用信号月月末已可得的数据） ----------
const lastClose = new Map() // 月 → 月末收盘
for (let k = 0; k < dates.length; k += 1) lastClose.set(dates[k].slice(0, 7), closes[k])
const tierOf = new Map(input.tiers)
const baaOf = new Map(JSON.parse(raw.baa).baaChange)
const monthlyMean = rows => { const g = new Map(); for (const [d, v] of rows) if (Number.isFinite(v)) { const m = d.slice(0, 7); if (!g.has(m)) g.set(m, []); g.get(m).push(v) } return new Map([...g].map(([m, a]) => [m, mean(a)])) }
const VIX = monthlyMean(JSON.parse(raw.vix))
const rvDaily = []
for (let i = 20; i < closes.length; i += 1) {
  const r = []; for (let k = i - 19; k <= i; k += 1) r.push(Math.log(closes[k] / closes[k - 1]))
  rvDaily.push([dates[i], Math.sqrt(sampleVar(r)) * Math.sqrt(252) * 100])
}
const RV = monthlyMean(rvDaily)
const trendIn = (S, t) => { const prior = [1, 2, 3, 4, 5, 6].map(k => S.get(monthAfter(t, -k))); return S.has(t) && prior.every(x => x != null) ? S.get(t) / mean(prior) - 1 : null }
const volTrend = t => (t >= '1990-07' ? trendIn(VIX, t) : trendIn(RV, t))
const highsOf = new Map(JSON.parse(raw.industryTrend).map(([d, , h]) => [d.slice(0, 7), h]))
const ind = JSON.parse(raw.industry)
const DEF = ['Food', 'Soda', 'Beer', 'Smoke', 'Hshld', 'Hlth', 'MedEq', 'Drugs', 'Util'].map(n => ind.industries.indexOf(n))
if (DEF.some(i => i < 0)) throw new Error('防守篮子行业名不匹配')
const indRet = new Map(ind.returns)
const ewRet = (m, idx) => { const r = indRet.get(m); if (!r) return null; const xs = (idx ?? r.map((_, i) => i)).map(i => r[i]).filter(v => v != null); return xs.length ? mean(xs) / 100 : null }
const cum3 = (t, idx) => { let w = 1; for (let k = 2; k <= 4; k += 1) { const r = ewRet(monthAfter(t, -k), idx); if (r == null) return null; w *= 1 + r } return w - 1 }

function cracks(t) {
  const c = {}
  const baa = baaOf.get(t); c.C1 = baa == null ? null : baa >= 0.10
  const v = volTrend(t); c.C2 = v == null ? null : v >= 0.10
  const close = lastClose.get(t)
  const past12 = Array.from({ length: 12 }, (_, k) => lastClose.get(monthAfter(t, -k)))
  const hs = Array.from({ length: 12 }, (_, k) => highsOf.get(monthAfter(t, -2 - k)))
  c.C3 = past12.some(x => x == null) || hs.some(x => x == null) ? null : close >= 0.95 * Math.max(...past12) && hs[0] <= 0.5 * Math.max(...hs)
  const dRel = cum3(t, DEF); const all = cum3(t)
  c.C4 = dRel == null || all == null ? null : dRel - all >= 0.03
  const c6 = lastClose.get(monthAfter(t, -6)); c.C5 = c6 == null ? null : close / c6 - 1 <= 0.02
  return { c, n: Object.values(c).filter(x => x === true).length, missing: Object.values(c).filter(x => x == null).length, baa, vol: v }
}
const macroOk = tier => ['offense', 'lean-offense', 'neutral'].includes(tier)
const sig = new Map(input.tiers.map(([d, tier]) => {
  const k = cracks(d); const heat = heatOf.get(d) ?? null
  return [d, { tier, heat, G: macroOk(tier), H: heat === 'hot', ...k }]
}))
const missingCracks = [...sig].filter(([d, s]) => d >= FIRST && d <= LAST && s.missing).map(([d, s]) => `${d}:${s.missing}`)

const W = (s, k = 3) => s.G && s.H && s.n >= k
const CANDIDATES = {
  W1: { label: '过热 + 裂缝 ≥ 3', confirm: true, cond: s => W(s) },
  W2: { label: '只看裂缝 ≥ 3', confirm: true, cond: s => s.G && s.n >= 3 },
  X2: { label: '探索：过热 + 裂缝 ≥ 2', cond: s => W(s, 2) },
  X4: { label: '探索：过热 + 裂缝 ≥ 4', cond: s => W(s, 4) },
  ...Object.fromEntries(['C1', 'C2', 'C3', 'C4', 'C5'].map(id => [`S${id}`, { label: `探索：过热 + 单项 ${id}`, cond: s => s.G && s.H && s.c[id] === true }])),
}
const STRATS = {
  base: { label: 'v2.2 基线', tierFn: p => p.tier },
  static70: { label: '恒定七成', fixed: 0.7 },
  ...Object.fromEntries(Object.entries(CANDIDATES).map(([id, c]) => [id, { ...c, tierFn: p => (c.cond(sig.get(p.d)) ? down(p.tier) : p.tier) }])),
}

// 按日模拟：每期按月度档位（候选在信号月满足条件时下调一档）整期持有，每日再平衡
function simulate(strat, filter = () => true) {
  const navDates = []; const nav = []; const weightPath = []
  const periodRet = []; const periodRetNet = []; const periodCash = []; const periodD = []
  let w = 1; let prevWeight = null; let turnover = 0; let days = 0; let onPeriods = 0
  for (const p of periods) {
    if (!filter(p.d)) continue
    if (!navDates.length) { navDates.push(dates[p.i0]); nav.push(1) }
    const weight = strat.fixed ?? EQUITY[strat.tierFn(p)]
    if (!strat.fixed && strat.tierFn(p) !== p.tier) onPeriods += 1
    let g = 1; let gNet = 1
    for (let j = p.i0 + 1; j <= p.i1; j += 1) {
      const stock = closes[j] / closes[j - 1] - 1 + p.divDay
      const r = weight * stock + (1 - weight) * p.cashDay
      const trade = prevWeight == null ? 0 : Math.abs(weight - prevWeight)
      turnover += trade; prevWeight = weight
      g *= 1 + r; gNet *= (1 + r) * (1 - COST * trade)
      w *= 1 + r
      navDates.push(dates[j]); nav.push(w); weightPath.push(weight); days += 1
    }
    periodRet.push(g - 1); periodRetNet.push(gNet - 1); periodCash.push(p.cash); periodD.push(p.d)
  }
  let peak = -Infinity; let maxDd = 0
  nav.forEach(v => { peak = Math.max(peak, v); maxDd = Math.min(maxDd, v / peak - 1) })
  const netW = periodRetNet.reduce((a, r) => a * (1 + r), 1)
  return {
    navDates, nav, weightPath, periodRet, periodCash, periodD,
    stats: { ...perf(periodRet, periodCash), cagrNet: netW ** (12 / periodRetNet.length) - 1, sharpeNet: sharpeOf(periodRetNet.map((r, i) => r - periodCash[i])), dailyMaxDd: maxDd, avgEquity: mean(weightPath), turnoverPerYear: turnover / (days / 252), onMonths: onPeriods },
  }
}

// ---------- 复现门槛（同 L-016） ----------
const simpleBase = perf(periods.map(p => EQUITY[p.tier] * p.spxSimple + (1 - EQUITY[p.tier]) * p.cash), periods.map(p => p.cash))
const full = Object.fromEntries(Object.entries(STRATS).map(([id, s]) => [id, simulate(s)]))
const ref = e1Ref.table.E1
const reproduction = { cagr: simpleBase.cagr - ref.strategy.cagr, maxDd: simpleBase.maxDd - ref.strategy.maxDd, sharpe: simpleBase.sharpe - ref.strategy.sharpe, dailyMaxDd: full.base.stats.dailyMaxDd - e1Ref.e1DailyDrawdown.strategy.maxDd }
if (!(Math.abs(reproduction.cagr) < 0.0005 && Math.abs(reproduction.maxDd) < 0.0005 && Math.abs(reproduction.sharpe) < 0.0005 && Math.abs(reproduction.dailyMaxDd) < 0.001)) {
  console.error('复现失败，停止：', reproduction); process.exit(1)
}
const train = Object.fromEntries(Object.entries(STRATS).map(([id, s]) => [id, simulate(s, d => d < SPLIT).stats]))
const valid = Object.fromEntries(Object.entries(STRATS).map(([id, s]) => [id, simulate(s, d => d >= SPLIT).stats]))
const exOf = sim => sim.periodRet.map((r, i) => r - sim.periodCash[i])
const boot = Object.fromEntries(Object.keys(CANDIDATES).map(id => [id, bootSharpeDiff(exOf(full[id]), exOf(full.base))]))
const confirmIds = Object.keys(CANDIDATES).filter(id => CANDIDATES[id].confirm)
{
  const order = confirmIds.slice().sort((a, b) => boot[a].p - boot[b].p); let running = 0
  order.forEach((id, i) => { running = Math.max(running, Math.min(1, (order.length - i) * boot[id].p)); boot[id].holm = running })
}

// ---------- 回调事件（L-016 同一定义） ----------
const navIndex = new Map(full.base.navDates.map((d, i) => [d, i]))
const navStart = full.base.navDates[0]; const navEnd = full.base.navDates.at(-1)
const navOn = (sim, d) => sim.nav[navIndex.get(d)]
const spxTr = (() => { const v = [1]; for (const p of periods) for (let j = p.i0 + 1; j <= p.i1; j += 1) v.push(v.at(-1) * (1 + closes[j] / closes[j - 1] - 1 + p.divDay)); return v })()
const spxOn = d => spxTr[navIndex.get(d)]
const episodes = []
{
  let ath = -Infinity; let athIdx = -1; let cur = null
  for (let k = 0; k < closes.length; k += 1) {
    if (closes[k] >= ath) { if (cur) { cur.recoverIdx = k; episodes.push(cur); cur = null } ath = closes[k]; athIdx = k; continue }
    if (!cur && closes[k] <= 0.9 * ath) cur = { peakIdx: athIdx, troughIdx: k }
    if (cur && closes[k] < closes[cur.troughIdx]) cur.troughIdx = k
  }
  if (cur) { cur.recoverIdx = null; episodes.push(cur) }
}
const events = episodes.filter(e => dates[e.troughIdx] >= navStart && dates[e.peakIdx] <= navEnd).map(e => {
  const peak = dates[e.peakIdx]; const trough = dates[e.troughIdx]; const recover = e.recoverIdx == null ? null : dates[e.recoverIdx]
  const from = peak < navStart ? navStart : peak; const to = trough > navEnd ? navEnd : trough
  const recEnd = recover == null || recover > navEnd ? navEnd : recover
  const peakMonth = peak.slice(0, 7)
  const signalMonth = monthAfter(peakMonth, -1) < FIRST ? FIRST : monthAfter(peakMonth, -1)
  const s = sig.get(signalMonth)
  const spxLoss = spxOn(to) / spxOn(from) - 1; const spxGain = spxOn(recEnd) / spxOn(to) - 1
  const by = Object.fromEntries(Object.keys(STRATS).filter(id => id !== 'static70').map(id => {
    const loss = navOn(full[id], to) / navOn(full[id], from) - 1; const gain = navOn(full[id], recEnd) / navOn(full[id], to) - 1
    return [id, { loss, gain, down: loss / spxLoss, up: spxGain > 0 ? gain / spxGain : null }]
  }))
  let firstW = null
  for (let k = 6; k >= 1; k -= 1) { const m = monthAfter(peakMonth, -k); if (m >= FIRST && sig.get(m) && W(sig.get(m))) { firstW = k; break } }
  return { peak, trough, depth: closes[e.troughIdx] / closes[e.peakIdx] - 1, signalMonth, tier: s.tier, heat: s.heat, GH: s.G && s.H, cracksAtSignal: s.n, warnLeadMonths: firstW, spxLoss, spxGain, by }
})
const medianOf = (xs, id, key) => median(xs.map(e => e.by[id][key]).filter(x => x != null))
const ghEvents = events.filter(e => e.GH)

// ---------- 判定 ----------
const gate = {}
for (const id of confirmIds) {
  const t = train[id], tb = train.base, v = valid[id], vb = valid.base, f = full[id].stats, fb = full.base.stats
  const g1 = t.sharpe >= tb.sharpe - 0.01 && (t.sharpe >= tb.sharpe + 0.02 || t.dailyMaxDd >= tb.dailyMaxDd + 0.02) && t.dailyMaxDd >= tb.dailyMaxDd - 0.01
  const g2 = v.sharpe >= vb.sharpe - 0.01 && v.dailyMaxDd >= vb.dailyMaxDd - 0.01
  const g3 = f.cagrNet >= fb.cagrNet - 0.005
  const downCut = medianOf(ghEvents, 'base', 'down') - medianOf(ghEvents, id, 'down')
  const upCut = medianOf(events, 'base', 'up') - medianOf(events, id, 'up')
  const g4 = downCut >= 0.10 && upCut <= downCut
  gate[id] = { g1, g2, g3, g4, pass: g1 && g2 && g3 && g4, trainSharpeDiff: t.sharpe - tb.sharpe, trainDdDiff: t.dailyMaxDd - tb.dailyMaxDd, validSharpeDiff: v.sharpe - vb.sharpe, validDdDiff: v.dailyMaxDd - vb.dailyMaxDd, cagrNetDiff: f.cagrNet - fb.cagrNet, downCut, upCut }
}
const passers = confirmIds.filter(id => gate[id].pass).sort((a, b) => train[b].sharpe - train[a].sharpe)

// ---------- 描述统计 ----------
const sigMonths = [...sig.keys()].filter(d => d >= FIRST && d <= LAST)
const monthEndIdx = new Map(); for (let k = 0; k < dates.length; k += 1) monthEndIdx.set(dates[k].slice(0, 7), k)
const fall10 = t => { const i = monthEndIdx.get(t); if (i == null || i + 252 >= closes.length) return null; let mn = Infinity; for (let j = i + 1; j <= i + 252; j += 1) mn = Math.min(mn, closes[j]); return mn <= 0.9 * closes[i] }
const fwd12 = t => { const a = lastClose.get(t), b = lastClose.get(monthAfter(t, 12)); return a && b ? b / a - 1 : null }
const describe = (label, f, months = sigMonths) => {
  const ms = months.filter(d => f(sig.get(d)))
  const fl = ms.map(fall10).filter(x => x != null); const fw = ms.map(fwd12).filter(x => x != null)
  return { label, months: ms.length, fall10Share: fl.length ? fl.filter(Boolean).length / fl.length : null, fwd12Mean: fw.length ? mean(fw) : null, fwd12Neg: fw.length ? fw.filter(x => x < 0).length / fw.length : null, list: label.startsWith('W') ? ms : undefined }
}
const desc = [
  describe('全部月份', () => true),
  describe('G 宏观没问题', s => s.G),
  describe('G 且 H', s => s.G && s.H),
  describe('W 预警（G 且 H 且裂缝 ≥ 3）', s => W(s)),
  describe('G 且 裂缝 ≥ 3', s => s.G && s.n >= 3),
  ...['C1', 'C2', 'C3', 'C4', 'C5'].flatMap(id => [describe(`G 且 H 且 ${id} 成立`, s => s.G && s.H && s.c[id] === true), describe(`G 且 H 且 ${id} 不成立`, s => s.G && s.H && s.c[id] === false)]),
]
const bySplit = Object.fromEntries([['训练期', d => d < SPLIT], ['验证期', d => d >= SPLIT]].map(([k, f]) => [k, [
  describe('G 且 H', s => s.G && s.H, sigMonths.filter(f)), describe('W 预警', s => W(s), sigMonths.filter(f))]]))
const current = [...sig].slice(-4).map(([d, s]) => ({ d, tier: s.tier, heat: s.heat, c: s.c, n: s.n, baa: s.baa, vol: s.vol }))

const strip = s => s.stats
const results = {
  prereg: 'docs/research/late-cycle-warning-2026-11-26/PREREG.md', ledger: 'L-023',
  inputs: Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, { file: p, sha256: createHash('sha256').update(raw[k]).digest('hex') }])),
  window: { signals: [FIRST, LAST], navStart, navEnd, missingHeat, missingCracks }, reproduction,
  full: Object.fromEntries(Object.entries(full).map(([id, s]) => [id, strip(s)])), train, valid,
  bootstrap: { block: BLOCK, draws: DRAWS, seed: SEED, ...boot }, gate, passers,
  events, eventMedians: Object.fromEntries(Object.keys(STRATS).filter(id => id !== 'static70').map(id => [id, { ghDown: medianOf(ghEvents, id, 'down'), allDown: medianOf(events, id, 'down'), allUp: medianOf(events, id, 'up') }])),
  describe: desc, bySplit, current,
}
writeFileSync(here('./results.json'), JSON.stringify(results, null, 2) + '\n')

const pct = x => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
console.log(`复现通过；净值 ${navStart} 至 ${navEnd}；缺冷热 ${missingHeat.length}；裂缝缺值月 ${missingCracks.length}${missingCracks.length ? ' ' + missingCracks.slice(0, 6).join(' ') : ''}`)
for (const id of Object.keys(STRATS)) { const f = full[id].stats, t = train[id], v = valid[id]
  console.log(`${id.padEnd(8)} ${(STRATS[id].label ?? '').padEnd(16)} 全 夏普 ${f.sharpe.toFixed(3)} 扣费 ${f.sharpeNet.toFixed(3)} 年化 ${pct(f.cagr)} 扣费 ${pct(f.cagrNet)} 日回撤 ${pct(f.dailyMaxDd)} 仓位 ${pct(f.avgEquity)} 降档月 ${f.onMonths ?? '-'} | 训 ${t.sharpe.toFixed(3)} ${pct(t.dailyMaxDd)} | 验 ${v.sharpe.toFixed(3)} ${pct(v.dailyMaxDd)}`) }
for (const id of Object.keys(CANDIDATES)) console.log(`${id}: 夏普差 ${boot[id].point.toFixed(3)} [${boot[id].low.toFixed(3)}, ${boot[id].high.toFixed(3)}] p ${boot[id].p.toFixed(2)}${boot[id].holm != null ? ' Holm ' + boot[id].holm.toFixed(2) : ''}`)
for (const id of confirmIds) console.log(id, JSON.stringify(gate[id], (k, v) => typeof v === 'number' ? +v.toFixed(4) : v))
console.log('通过：', passers.length ? passers : '无')
console.log('\n回调事件（高点 / 跌幅 / 信号月档位 冷热 / 裂缝数 / 预警提前月 / 下跌参与度 base W1 W2）')
for (const e of events) console.log(`${e.peak} ${pct(e.depth).padStart(7)} ${e.tier.padEnd(12)} ${String(e.heat).padEnd(4)} 裂缝 ${e.cracksAtSignal} 预警 ${e.warnLeadMonths ?? '—'} | ${e.by.base.down.toFixed(2)} ${e.by.W1.down.toFixed(2)} ${e.by.W2.down.toFixed(2)} | 反弹 ${e.by.base.up?.toFixed(2)} ${e.by.W1.up?.toFixed(2)} ${e.by.W2.up?.toFixed(2)}`)
console.log('中位数', JSON.stringify(results.eventMedians, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v))
console.log('\n描述统计（月数 / 之后12月内跌≥10%比例 / 之后12月均值 / 为负比例）')
for (const r of desc) console.log(r.label.padEnd(26), r.months, pct(r.fall10Share), pct(r.fwd12Mean), pct(r.fwd12Neg))
for (const [k, rs] of Object.entries(bySplit)) for (const r of rs) console.log(k, r.label.padEnd(10), r.months, pct(r.fall10Share), pct(r.fwd12Mean), pct(r.fwd12Neg))
console.log('W 月份：', desc[3].list.join(' '))
console.log('最近读数：', JSON.stringify(current))
console.log("2019-12..2020-03", ["2019-12","2020-01","2020-02","2020-03"].map(d => d + JSON.stringify({ ...sig.get(d), c: sig.get(d).c })).join("\n"))

// 事后探索（不作判定依据）：每次回调，高点前 6 个信号月与高点后 6 个信号月的平均裂缝数
const avgCracks = ms => { const xs = ms.filter(m => sig.has(m)).map(m => sig.get(m).n); return xs.length ? mean(xs) : null }
const prePost = events.map(e => { const pm = e.peak.slice(0, 7); return { peak: e.peak, pre: avgCracks([6, 5, 4, 3, 2, 1].map(k => monthAfter(pm, -k))), post: avgCracks([0, 1, 2, 3, 4, 5].map(k => monthAfter(pm, k))) } })
console.log('\n高点前 6 个月 / 高点起 6 个月 平均裂缝数：', prePost.map(x => `${x.peak.slice(0, 7)} ${x.pre?.toFixed(1)}→${x.post?.toFixed(1)}`).join('  '))
console.log('全部月份平均裂缝数', mean(sigMonths.map(d => sig.get(d).n)).toFixed(2), '中位：高点前', median(prePost.map(x => x.pre)).toFixed(2), '高点后', median(prePost.map(x => x.post)).toFixed(2))
results.explore = { prePost }
writeFileSync(here('./results.json'), JSON.stringify(results, null, 2) + '\n')
