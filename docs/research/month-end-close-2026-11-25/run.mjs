#!/usr/bin/env node
// 按 PREREG.md 执行月末收盘价口径检验。只读本地文件，结果写到 results.json。
// 用法：node docs/research/month-end-close-2026-11-25/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const INPUT = '../macro-significance-2026-11-25/inputs.json'
const DAILY = '../../../data-raw/macro-posture-daily/spx-daily.json'
const inputRaw = readFileSync(here(INPUT), 'utf8')
const dailyRaw = readFileSync(here(DAILY), 'utf8')
const input = JSON.parse(inputRaw)
const daily = JSON.parse(dailyRaw).rows

const SEED = 20261125
const DRAWS = 10000
const BLOCK = 12
const FIRST = '1973-01'
const LAST = '2026-08'
const SPLIT = '2000-01'
const EXEC_DAY = 3
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
// 与 scripts/lib/macro-posture/backtest.mjs 的 performance 同口径
function perf(port, cash, weights) {
  let w = 1; let peak = 1; let maxDd = 0
  for (const r of port) { w *= 1 + r; peak = Math.max(peak, w); maxDd = Math.min(maxDd, w / peak - 1) }
  const ex = port.map((r, i) => r - cash[i])
  return {
    months: port.length, cagr: w ** (12 / port.length) - 1, vol: Math.sqrt(12 * sampleVar(port)),
    maxDd, sharpe: Math.sqrt(12) * mean(ex) / Math.sqrt(sampleVar(ex)), avgEquity: mean(weights),
  }
}

// ---------- 输入整理 ----------
const returns = new Map(input.returns.map(([d, spx, cash]) => [d, { spx, cash }]))
const price = new Map(input.price)
const priceMonths = input.price.map(([d]) => d)
const dividend = m => {
  const r = returns.get(m); const p = price.get(m); const p0 = price.get(monthAfter(m, -1))
  return r && p && p0 ? r.spx - (p / p0 - 1) : null
}
const cashOf = m => returns.get(m)?.cash ?? null
function below(d) {
  const i = priceMonths.indexOf(d)
  if (i < 9) return null
  const window = priceMonths.slice(i - 9, i + 1)
  if (window.some((m, k) => k > 0 && m !== monthAfter(window[k - 1], 1))) return null
  return price.get(d) < mean(window.map(m => price.get(m)))
}
const signals = input.tiers.filter(([d]) => d >= FIRST && d <= LAST)
if (signals.length !== 644) throw new Error(`信号月数 ${signals.length} ≠ 644`)

const dates = daily.map(([d]) => d)
const close = new Map(daily)
const byMonth = new Map()
for (const d of dates) {
  const m = d.slice(0, 7)
  if (!byMonth.has(m)) byMonth.set(m, [])
  byMonth.get(m).push(d)
}
const dayIndex = new Map(dates.map((d, i) => [d, i]))
const lastDay = m => byMonth.get(m)?.at(-1)
const execDay = m => byMonth.get(m)?.[EXEC_DAY - 1]

// ---------- 数据核对：日收盘月均价 vs inputs 月均价 ----------
let maxDev = { month: null, dev: 0 }
for (const m of priceMonths.filter(m => m >= FIRST && m <= '2026-10')) {
  const days = byMonth.get(m)
  if (!days) throw new Error(`日收盘缺少 ${m}`)
  const avg = mean(days.map(d => close.get(d)))
  const dev = avg / price.get(m) - 1
  if (Math.abs(dev) > Math.abs(maxDev.dev)) maxDev = { month: m, dev }
}

// ---------- 各口径的持有期 ----------
// 返回 { start, end, spx, cash, divShare }，spx 含股息
function period(kind, d) {
  const m1 = monthAfter(d, 1); const m2 = monthAfter(d, 2)
  if (kind === 'avg') {
    const r = returns.get(m2)
    return r ? { start: null, end: null, spx: r.spx, cash: r.cash } : null
  }
  if (kind === 'E0' || kind === 'E2') {
    const [a, b, m] = kind === 'E0' ? [d, m1, m1] : [m1, m2, m2]
    const start = lastDay(a); const end = lastDay(b)
    const div = dividend(m); const cash = cashOf(m)
    if (!start || !end || div == null || cash == null) return null
    return { start, end, spx: close.get(end) / close.get(start) - 1 + div, cash, div }
  }
  // E1：次月第 3 个交易日收盘成交，持有到再下个月第 3 个交易日收盘；股息与现金按交易日数分摊
  const start = execDay(m1); const end = execDay(m2)
  const d1 = dividend(m1); const d2 = dividend(m2); const c1 = cashOf(m1); const c2 = cashOf(m2)
  if (!start || !end || [d1, d2, c1, c2].some(v => v == null)) return null
  const n1 = byMonth.get(m1).filter(x => x > start).length
  const n2 = byMonth.get(m2).filter(x => x <= end).length
  const N1 = byMonth.get(m1).length; const N2 = byMonth.get(m2).length
  const div = d1 * n1 / N1 + d2 * n2 / N2
  const cash = c1 * n1 / N1 + c2 * n2 / N2
  return { start, end, spx: close.get(end) / close.get(start) - 1 + div, cash, div }
}

const STRATS = {
  strategy: s => EQUITY[s.tier],
  static70: () => 0.7,
  buyhold: () => 1,
  trend: s => (s.below ? 0.5 : 1),
}
function build(kind, filter = () => true) {
  const rows = []
  for (const [d, tier] of signals) {
    if (!filter(d)) continue
    const p = period(kind, d)
    const b = below(d)
    if (!p || b == null || EQUITY[tier] == null) throw new Error(`${kind} 缺少 ${d} 的数据`)
    rows.push({ d, tier, below: b, ...p })
  }
  const cash = rows.map(r => r.cash)
  const out = {}
  for (const [id, weightOf] of Object.entries(STRATS)) {
    const weights = rows.map(weightOf)
    const port = rows.map((r, i) => weights[i] * r.spx + (1 - weights[i]) * r.cash)
    out[id] = { ...perf(port, cash, weights), port, ex: port.map((x, i) => x - cash[i]) }
  }
  return { rows, out }
}
const strip = out => Object.fromEntries(Object.entries(out).map(([id, { port, ex, ...rest }]) => [id, rest]))

// ---------- 复现门槛 ----------
const avg = build('avg')
const pageId = { strategy: 'full', static70: 'static70', buyhold: 'buyhold', trend: 'trend' }
const reproduction = Object.fromEntries(Object.keys(STRATS).map(id => {
  const mine = avg.out[id]
  const page = input.pageVariants.find(v => v.id === pageId[id])
  const diff = { cagr: mine.cagr - page.cagr, maxDd: mine.maxDd - page.maxDd, sharpe: mine.sharpe - page.sharpe }
  return [id, { diff, ok: Object.values(diff).every(x => Math.abs(x) < 0.0005) }]
}))
const reproduced = Object.values(reproduction).every(r => r.ok)
if (!reproduced) {
  console.error('复现失败，停止：', JSON.stringify(reproduction, null, 2))
  process.exit(1)
}

// ---------- 主口径与敏感度 ----------
const E0 = build('E0'); const E1 = build('E1'); const E2 = build('E2')

// E1 按日净值的最大回撤：持有期内股票按日收盘涨跌，股息和现金按交易日平均计入（隐含每日按仓位再平衡）
function dailyDrawdown(weightOf) {
  let w = 1; let peak = 1; let peakDate = null; let maxDd = 0; let ddPeak = null; let ddTrough = null
  for (const row of E1.rows) {
    const weight = weightOf(row)
    const i0 = dayIndex.get(row.start); const i1 = dayIndex.get(row.end)
    const n = i1 - i0
    for (let k = i0 + 1; k <= i1; k += 1) {
      const stock = close.get(dates[k]) / close.get(dates[k - 1]) - 1 + row.div / n
      w *= 1 + weight * stock + (1 - weight) * row.cash / n
      if (w > peak) { peak = w; peakDate = dates[k] }
      const dd = w / peak - 1
      if (dd < maxDd) { maxDd = dd; ddPeak = peakDate; ddTrough = dates[k] }
    }
  }
  return { maxDd, peak: ddPeak, trough: ddTrough }
}
const dailyDd = Object.fromEntries(Object.entries(STRATS).map(([id, f]) => [id, dailyDrawdown(f)]))

const boot = {
  vsStatic70: bootSharpeDiff(E1.out.strategy.ex, E1.out.static70.ex),
  vsTrend: bootSharpeDiff(E1.out.strategy.ex, E1.out.trend.ex),
}
const segments = {
  early: strip(build('E1', d => d < SPLIT).out),
  late: strip(build('E1', d => d >= SPLIT).out),
}

// ---------- 主结论（按预注册措辞） ----------
const s = E1.out.strategy; const c = E1.out.static70
const ddGap = s.maxDd - c.maxDd
const ddOk = ddGap >= 0.10
const sharpeOk = s.sharpe > c.sharpe
const verdict = !ddOk ? '结论不成立' : sharpeOk ? '月末收盘口径下结论不变' : '回撤优势保持，夏普优势消失'

const results = {
  prereg: 'docs/research/month-end-close-2026-11-25/PREREG.md',
  inputs: {
    tiers: { file: 'docs/research/macro-significance-2026-11-25/inputs.json', sha256: createHash('sha256').update(inputRaw).digest('hex') },
    daily: { file: 'data-raw/macro-posture-daily/spx-daily.json', sha256: createHash('sha256').update(dailyRaw).digest('hex') },
    signals: { first: FIRST, last: LAST, months: signals.length },
  },
  dataCheck: { maxMonthlyAverageDeviation: maxDev },
  reproduction,
  table: { avg: strip(avg.out), E0: strip(E0.out), E1: strip(E1.out), E2: strip(E2.out) },
  e1DailyDrawdown: dailyDd,
  e1Bootstrap: { block: BLOCK, draws: DRAWS, seed: SEED, ...boot },
  e1Segments: segments,
  verdict: { text: verdict, sharpeGapVsStatic70: s.sharpe - c.sharpe, maxDdGapVsStatic70: ddGap },
}
writeFileSync(here('./results.json'), JSON.stringify(results, null, 2) + '\n')

const pct = x => `${(x * 100).toFixed(2)}%`
console.log(`数据核对：日收盘月均价与 inputs 最大偏差 ${pct(maxDev.dev)}（${maxDev.month}）`)
for (const kind of ['avg', 'E0', 'E1', 'E2']) {
  console.log(`\n${kind}`)
  for (const [id, r] of Object.entries(results.table[kind])) {
    console.log(`  ${id.padEnd(9)} 年化 ${pct(r.cagr)}  波动 ${pct(r.vol)}  回撤 ${pct(r.maxDd)}  夏普 ${r.sharpe.toFixed(3)}  仓位 ${pct(r.avgEquity)}`)
  }
}
console.log('\nE1 按日回撤', JSON.stringify(dailyDd))
console.log('E1 自助法', JSON.stringify(boot))
console.log('E1 两段', JSON.stringify(Object.fromEntries(Object.entries(segments).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([id, r]) => [id, [pct(r.cagr), pct(r.maxDd), r.sharpe.toFixed(3)]]))]))))
console.log(`\n结论：${verdict}（夏普差 ${(s.sharpe - c.sharpe).toFixed(3)}，回撤差 ${pct(ddGap)}）`)
