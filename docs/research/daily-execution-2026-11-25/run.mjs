#!/usr/bin/env node
// 按 PREREG.md 执行：宏观攻守按日执行的三个候选（D1–D3）对比月度基线。
// 首次运行时把日度档位文件截取一份到 inputs-daily.json（之后只读这份快照，可离线复现）。
// 用法：node docs/research/daily-execution-2026-11-25/run.mjs
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const SNAPSHOT = './inputs-daily.json'
if (!existsSync(here(SNAPSHOT))) {
  const live = JSON.parse(readFileSync(here('../../../public/data/macro-posture-daily.json'), 'utf8'))
  writeFileSync(here(SNAPSHOT), JSON.stringify({
    note: '截取自 public/data/macro-posture-daily.json（生产代码按日定档）；只保留 2026-10-31 以前的行。列：日期、收盘、regime、final、月末正式定档、衰退。',
    generatedAt: live.generatedAt, ruleVersion: live.ruleVersion, disclosures: live.disclosures,
    rows: live.rows.filter(([d]) => d <= '2026-10-31'),
  }) + '\n')
}
const FILES = {
  tiers: '../macro-significance-2026-11-25/inputs.json',
  daily: '../../../data-raw/macro-posture-daily/spx-daily.json',
  dailyTiers: SNAPSHOT,
  lateCycle: '../late-cycle-2026-11-25/results.json',
}
const raw = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(here(p), 'utf8')]))
const input = JSON.parse(raw.tiers)
const daily = JSON.parse(raw.daily).rows
const tierRows = JSON.parse(raw.dailyTiers).rows
const lateCycle = JSON.parse(raw.lateCycle)

const SEED = 20261125
const DRAWS = 10000
const BLOCK = 12
const FIRST = '1973-01'
const LAST = '2026-08'
const SPLIT = '2000-01'
const EXEC_DAY = 3
const COST = 0.001
const CONFIRM = 5
const EQ = [1, 0.85, 0.7, 0.5, 0.3]
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

// ---------- 输入整理（与 late-cycle 同口径） ----------
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
  return { d, tier, i0, i1, divDay: div / (i1 - i0), cashDay: cash / (i1 - i0), cash }
})
const firstIdx = periods[0].i0
const lastIdx = periods.at(-1).i1

// ---------- 日度档位 ----------
const tierOn = new Map(tierRows.map(r => [r[0], { final: r[3], official: r[4] === 1 }]))
const code = new Array(dates.length).fill(null)
const official = new Array(dates.length).fill(false)
for (let k = 0; k < dates.length; k += 1) {
  const t = tierOn.get(dates[k])
  if (t) { code[k] = t.final; official[k] = t.official }
}
const missingTier = []
for (let k = firstIdx - 1; k <= lastIdx; k += 1) if (code[k] == null) missingTier.push(dates[k])
if (missingTier.length) throw new Error(`日度档位缺 ${missingTier.length} 天，如 ${missingTier.slice(0, 3)}`)

// held[k] = 第 k 日收盘成交后持有的仓位；第 j 日收益用 held[j-1]
function heldPath(id) {
  const held = new Array(dates.length).fill(null)
  if (id === 'M' || id === 'Mp') {
    const signalOf = new Map()
    if (id === 'M') for (const p of periods) signalOf.set(p.i0, EQUITY[p.tier])
    else {
      // M′：每月正式定档日的日度档位，下个月第 3 个交易日成交
      for (let k = 0; k < dates.length; k += 1) {
        if (!official[k] || code[k] == null) continue
        const ex = execDay(monthAfter(dates[k].slice(0, 7), 1))
        if (ex) signalOf.set(dayIndex.get(ex), EQ[code[k]])
      }
    }
    let w = null
    for (let k = firstIdx; k <= lastIdx; k += 1) { if (signalOf.has(k)) w = signalOf.get(k); held[k] = w }
    return held
  }
  // 日度候选：状态从起点前一天开始，按收盘判断、次日收盘成交
  let state = code[firstIdx - 1]; let pending = null; let run = 0
  const decided = new Array(dates.length).fill(null)
  for (let t = firstIdx - 1; t <= lastIdx; t += 1) {
    const c = code[t]
    if (id === 'D1') state = c
    else if (id === 'D2') {
      if (c === state) { pending = null; run = 0 } else {
        if (c === pending) run += 1; else { pending = c; run = 1 }
        if (run >= CONFIRM) { state = c; pending = null; run = 0 }
      }
    } else if (id === 'D3') {
      if (c > state) state = c
      else if (official[t] && c < state) state = c
    }
    decided[t] = state
  }
  // 起点当天按起点前一天的判断持有（与基线一样在第一个成交日建仓）
  for (let k = firstIdx; k <= lastIdx; k += 1) held[k] = EQ[decided[k - 1]]
  return held
}

const STRATS = {
  M: '月度基线（现行）',
  Mp: '日度文件的月末定档、按月成交',
  D1: '按日执行',
  D2: '按日执行、连续 5 天确认',
  D3: '降档按日、升档按月',
}
const CANDIDATES = ['D1', 'D2', 'D3']
const paths = Object.fromEntries(Object.keys(STRATS).map(id => [id, heldPath(id)]))

function simulate(held, filter = () => true) {
  const navDates = []; const nav = []; const weights = []
  const gross = []; const net = []; const cash = []
  let w = 1; let trades = 0; let turnover = 0; let days = 0; let prev = null
  for (const p of periods) {
    if (!filter(p.d)) continue
    if (!navDates.length) { navDates.push(dates[p.i0]); nav.push(1); prev = held[p.i0] }
    let g = 1; let gn = 1
    for (let j = p.i0 + 1; j <= p.i1; j += 1) {
      const weight = held[j - 1]
      // 第 j-1 日收盘的调仓成本
      const trade = Math.abs(weight - prev)
      if (trade > 1e-12) { trades += 1; turnover += trade }
      prev = weight
      const r = weight * (closes[j] / closes[j - 1] - 1 + p.divDay) + (1 - weight) * p.cashDay
      g *= 1 + r; gn *= (1 + r) * (1 - COST * trade)
      w *= 1 + r
      navDates.push(dates[j]); nav.push(w); weights.push(weight); days += 1
    }
    gross.push(g - 1); net.push(gn - 1); cash.push(p.cash)
  }
  let peak = -Infinity; let maxDd = 0
  for (const v of nav) { peak = Math.max(peak, v); maxDd = Math.min(maxDd, v / peak - 1) }
  let m = 1; let mPeak = 1; let monthlyDd = 0
  for (const r of gross) { m *= 1 + r; mPeak = Math.max(mPeak, m); monthlyDd = Math.min(monthlyDd, m / mPeak - 1) }
  const years = days / 252
  const exGross = gross.map((r, i) => r - cash[i]); const exNet = net.map((r, i) => r - cash[i])
  return {
    navDates, nav, weights, exGross, exNet,
    stats: {
      periods: gross.length, cagr: m ** (12 / gross.length) - 1, sharpe: sharpeOf(exGross), sharpeNet: sharpeOf(exNet),
      dailyMaxDd: maxDd, monthlyMaxDd: monthlyDd, avgEquity: mean(weights), tradesPerYear: trades / years, turnoverPerYear: turnover / years,
    },
  }
}

const full = Object.fromEntries(Object.entries(paths).map(([id, h]) => [id, simulate(h)]))
const ref = lateCycle.B.full.base
const reproduction = { sharpe: full.M.stats.sharpe - ref.sharpe, dailyMaxDd: full.M.stats.dailyMaxDd - ref.dailyMaxDd, cagr: full.M.stats.cagr - ref.cagr }
if (!Object.values(reproduction).every(x => Math.abs(x) < 0.001)) {
  console.error('复现失败，停止：', reproduction)
  process.exit(1)
}

const train = Object.fromEntries(Object.entries(paths).map(([id, h]) => [id, simulate(h, d => d < SPLIT).stats]))
const valid = Object.fromEntries(Object.entries(paths).map(([id, h]) => [id, simulate(h, d => d >= SPLIT).stats]))
const boot = Object.fromEntries(CANDIDATES.map(id => [id, bootSharpeDiff(full[id].exNet, full.M.exNet)]))
const order = CANDIDATES.slice().sort((a, b) => boot[a].p - boot[b].p)
let running = 0
order.forEach((id, i) => { running = Math.max(running, Math.min(1, (order.length - i) * boot[id].p)); boot[id].holm = running })

const gate = {}
for (const id of CANDIDATES) {
  const t = train[id]; const tb = train.M
  const g1Sharpe = t.sharpeNet >= tb.sharpeNet + 0.02
  const g1Dd = t.dailyMaxDd >= tb.dailyMaxDd - 0.01
  gate[id] = { trainSharpeNetDiff: t.sharpeNet - tb.sharpeNet, trainDdDiff: t.dailyMaxDd - tb.dailyMaxDd, g1Sharpe, g1Dd, passTrain: g1Sharpe && g1Dd }
}
const pick = CANDIDATES.filter(id => gate[id].passTrain).sort((a, b) => train[b].sharpeNet - train[a].sharpeNet)[0] ?? null
if (pick) {
  gate[pick].passValid = valid[pick].sharpeNet >= valid.M.sharpeNet && valid[pick].dailyMaxDd >= valid.M.dailyMaxDd - 0.01
  gate[pick].passBoot = boot[pick].holm < 0.05
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
  else text = '通过（进入影子跟踪）'
  return [id, text]
}))
const anyPass = CANDIDATES.some(id => verdict[id].startsWith('通过'))
const anyNotWorse = CANDIDATES.some(id => full[id].stats.sharpeNet >= full.M.stats.sharpeNet)
const answer = anyPass ? '按日执行有改善，先影子跟踪' : anyNotWorse ? '按日执行与按月相当，没有可靠的额外好处' : '按日执行更差，维持按月'

// ---------- 回调事件（沿用 late-cycle 的 17 次） ----------
const navIdx = new Map(full.M.navDates.map((d, i) => [d, i]))
const events = lateCycle.A.events.map(e => {
  const from = e.measuredFrom; const to = e.trough > full.M.navDates.at(-1) ? full.M.navDates.at(-1) : e.trough
  const end = e.recover && e.recover <= full.M.navDates.at(-1) ? e.recover : full.M.navDates.at(-1)
  const at = (id, d) => full[id].nav[navIdx.get(d)]
  return {
    peak: e.peak, trough: e.trough, spxLoss: e.spxLoss, spxGain: e.spxGain, recession: e.recession,
    byStrat: Object.fromEntries(Object.keys(STRATS).map(id => [id, { loss: at(id, to) / at(id, from) - 1, gain: at(id, end) / at(id, to) - 1 }])),
  }
})
const crashPath = (fromDate, toDate) => {
  const i0 = navIdx.get(fromDate); const i1 = navIdx.get(toDate)
  return full.M.navDates.slice(i0, i1 + 1).map((d, k) => [d, closes[dayIndex.get(d)], ...Object.keys(STRATS).map(id => full[id].weights[i0 + k - 1] ?? null)])
}

const results = {
  prereg: 'docs/research/daily-execution-2026-11-25/PREREG.md',
  inputs: Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, { file: p, sha256: createHash('sha256').update(raw[k]).digest('hex') }])),
  window: { navStart: full.M.navDates[0], navEnd: full.M.navDates.at(-1) },
  reproduction,
  labels: STRATS,
  full: Object.fromEntries(Object.entries(full).map(([id, s]) => [id, s.stats])),
  train, valid, gate, pick,
  bootstrap: { block: BLOCK, draws: DRAWS, seed: SEED, basis: '扣成本每期超额收益', ...boot },
  verdict, answer, events,
  crash: { columns: ['日期', '标普收盘', ...Object.keys(STRATS)], y1987: crashPath('1987-08-17', '1987-12-11'), y2020: crashPath('2020-02-12', '2020-04-30') },
}
writeFileSync(here('./results.json'), JSON.stringify(results, null, 2) + '\n')

const pct = x => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
console.log(`复现通过（基线夏普 ${full.M.stats.sharpe.toFixed(3)}，按日回撤 ${pct(full.M.stats.dailyMaxDd)}）；净值 ${results.window.navStart} 至 ${results.window.navEnd}`)
for (const id of Object.keys(STRATS)) {
  const f = full[id].stats; const t = train[id]; const v = valid[id]
  console.log(`${id.padEnd(3)} 全 夏普 ${f.sharpe.toFixed(3)} 扣费 ${f.sharpeNet.toFixed(3)} 年化 ${pct(f.cagr)} 日回撤 ${pct(f.dailyMaxDd)} 月回撤 ${pct(f.monthlyMaxDd)} 仓位 ${pct(f.avgEquity)} 调仓 ${f.tradesPerYear.toFixed(1)} 次/年 换手 ${pct(f.turnoverPerYear)} | 训 扣费 ${t.sharpeNet.toFixed(3)} ${pct(t.dailyMaxDd)} | 验 扣费 ${v.sharpeNet.toFixed(3)} ${pct(v.dailyMaxDd)}`)
}
for (const id of CANDIDATES) console.log(`${id}: 扣费夏普差 ${boot[id].point.toFixed(3)} [${boot[id].low.toFixed(3)}, ${boot[id].high.toFixed(3)}] p ${boot[id].p.toFixed(3)} Holm ${boot[id].holm.toFixed(3)} → ${verdict[id]}`)
console.log(`回答：${answer}`)
for (const e of events) console.log(e.peak, pct(e.spxLoss), Object.entries(e.byStrat).map(([id, v]) => `${id} ${pct(v.loss)}/${pct(v.gain)}`).join('  '))
