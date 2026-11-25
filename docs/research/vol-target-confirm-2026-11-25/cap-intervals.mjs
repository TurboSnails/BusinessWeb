#!/usr/bin/env node
// 只报告：现行 v2.2（E1 按日净值，1973–2026）乘不同股票上限时，年化波动与按日最大回撤的分块自助法区间。
// 历史只有一条路径，最大回撤是单一路径统计量，区间用来提醒「未来可能更深」。
// 用法：node docs/research/vol-target-confirm-2026-11-25/cap-intervals.mjs → cap-intervals.json
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { evaluate } from '../../../scripts/lib/macro-posture/model.mjs'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const FILES = {
  robustness: '../robustness-2026-11-25/inputs.json',
  tiers: '../macro-significance-2026-11-25/inputs.json',
  spx: '../../../data-raw/macro-posture-daily/spx-daily.json',
  intl: './inputs-intl.json',
}
const raw = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(here(p), 'utf8')]))
const rob = JSON.parse(raw.robustness); const tiersIn = JSON.parse(raw.tiers)
const spxRows = JSON.parse(raw.spx).rows; const intl = JSON.parse(raw.intl)

const EXEC_DAY = 3
const COST = 0.001
const LAST_SIGNAL = '2026-09'
const EQUITY = { offense: 1, 'lean-offense': 0.85, neutral: 0.7, 'lean-defense': 0.5, defense: 0.3 }
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sampleVar = xs => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) }
const sharpeOf = ex => Math.sqrt(12) * mean(ex) / Math.sqrt(sampleVar(ex))
const monthAfter = (d, k) => {
  const [y, m] = d.split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

/** 一条日线的工具：按月分组、σ、σ*（只用过去数据） */
function series(rows) {
  const dates = rows.map(([d]) => d); const closes = rows.map(([, c]) => c)
  const byMonth = new Map()
  for (const d of dates) { const m = d.slice(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(d) }
  const idx = new Map(dates.map((d, i) => [d, i]))
  const sigma = new Array(dates.length).fill(null); const star = new Array(dates.length).fill(null)
  const sorted = []
  const insert = x => { let lo = 0; let hi = sorted.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (sorted[mid] < x) lo = mid + 1; else hi = mid } sorted.splice(lo, 0, x) }
  const lr = closes.map((c, i) => (i ? Math.log(c / closes[i - 1]) : null))
  for (let t = 20; t < dates.length; t += 1) {
    sigma[t] = Math.sqrt(sampleVar(lr.slice(t - 19, t + 1))) * Math.sqrt(252)
    insert(sigma[t]); const n = sorted.length
    star[t] = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  }
  const execIdx = m => { const d = byMonth.get(m)?.[EXEC_DAY - 1]; return d == null ? null : idx.get(d) }
  const lastIdx = m => { const d = byMonth.get(m)?.at(-1); return d == null ? null : idx.get(d) }
  const kAt = t => (sigma[t] && star[t] ? Math.min(1, star[t] / sigma[t]) : 1)
  return { dates, closes, byMonth, execIdx, lastIdx, kAt, sigma, star }
}

/**
 * periods: [{ d, i0, i1, base, divDay, cashDay, cash }]；weightOf(p) 给出该期仓位（期内不变）。
 * 返回按日净值的年化波动、按日最大回撤、扣成本每期夏普、年化、平均仓位、年换手。
 */
function evaluateStrategy(s, periods, weightOf) {
  let w = 1; let peak = 1; let maxDd = 0; let prev = null; let turnover = 0; let days = 0; let expo = 0
  const dailyR = []; const net = []; const cash = []
  for (const p of periods) {
    const weight = weightOf(p)
    const trade = prev == null ? 0 : Math.abs(weight - prev)
    turnover += trade; prev = weight
    let g = 1
    for (let j = p.i0 + 1; j <= p.i1; j += 1) {
      const r = weight * (s.closes[j] / s.closes[j - 1] - 1 + p.divDay) + (1 - weight) * p.cashDay
      g *= 1 + r; w *= 1 + r; dailyR.push(r); days += 1; expo += weight
      peak = Math.max(peak, w); maxDd = Math.min(maxDd, w / peak - 1)
    }
    net.push(g * (1 - COST * trade) - 1); cash.push(p.cash)
  }
  const years = days / 252
  return {
    periods: periods.length, cagr: w ** (1 / years) - 1, vol: Math.sqrt(sampleVar(dailyR) * 252), dailyMaxDd: maxDd,
    sharpeNet: sharpeOf(net.map((r, i) => r - cash[i])), avgEquity: expo / days, turnoverPerYear: turnover / years,
  }
}

function compareUnit(s, periods) {
  const vt3 = p => p.base * s.kAt(p.kIdx)
  const base = evaluateStrategy(s, periods, p => p.base)
  const cand = evaluateStrategy(s, periods, vt3)
  // 对照：基础仓位 × c，使平均仓位与 VT3 相同（按交易日加权）
  const c = cand.avgEquity / base.avgEquity
  const matched = evaluateStrategy(s, periods, p => p.base * c)
  const pass = {
    vol: cand.vol <= 0.9 * matched.vol,
    dd: cand.dailyMaxDd >= matched.dailyMaxDd + 0.03,
    sharpe: cand.sharpeNet >= matched.sharpeNet - 0.05,
  }
  return { first: periods[0].d, last: periods.at(-1).d, scale: c, base, matched, vt3: cand, pass, holds: pass.vol && pass.dd && pass.sharpe }
}

// ---------- U1 美国 ----------
const us = series(spxRows)
const returns = new Map(tiersIn.returns.map(([d, spx, c]) => [d, { spx, cash: c }]))
const price = new Map(tiersIn.price)
const dividend = m => { const r = returns.get(m); const p = price.get(m); const p0 = price.get(monthAfter(m, -1)); return r && p && p0 ? r.spx - (p / p0 - 1) : null }
const cashOf = m => returns.get(m)?.cash ?? null
function usPeriod(d, tier) {
  const m1 = monthAfter(d, 1); const m2 = monthAfter(d, 2)
  const i0 = us.execIdx(m1); const i1 = us.execIdx(m2)
  const d1 = dividend(m1); const d2 = dividend(m2); const c1 = cashOf(m1); const c2 = cashOf(m2)
  if (i0 == null || i1 == null || [d1, d2, c1, c2].some(v => v == null)) throw new Error(`美国缺少 ${d} 的数据`)
  const start = us.dates[i0]; const end = us.dates[i1]
  const n1 = us.byMonth.get(m1).filter(x => x > start).length; const n2 = us.byMonth.get(m2).filter(x => x <= end).length
  const N1 = us.byMonth.get(m1).length; const N2 = us.byMonth.get(m2).length
  const div = d1 * n1 / N1 + d2 * n2 / N2; const cash = c1 * n1 / N1 + c2 * n2 / N2
  return { d, i0, i1, base: EQUITY[tier], kIdx: us.lastIdx(d), divDay: div / (i1 - i0), cashDay: cash / (i1 - i0), cash }
}

// 逐日：股票收益（含摊分股息）、档位仓位、现金日收益
const periods = tiersIn.tiers.filter(([d]) => d >= '1973-01' && d <= '2026-08').map(([d, t]) => usPeriod(d, t))
const days = []
for (const p of periods) for (let j = p.i0 + 1; j <= p.i1; j += 1) days.push([us.closes[j] / us.closes[j - 1] - 1 + p.divDay, p.base, p.cashDay])
const SEED = 20261125; const DRAWS = 2000; const BLOCK = 126
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const stats = (idx, cap) => {
  let w = 1; let peak = 1; let dd = 0; const rs = []
  for (const i of idx) { const [s, b, c] = days[i]; const wt = cap * b; const r = wt * s + (1 - wt) * c; rs.push(r); w *= 1 + r; peak = Math.max(peak, w); dd = Math.min(dd, w / peak - 1) }
  return { vol: Math.sqrt(sampleVar(rs) * 252), dd, cagr: w ** (252 / rs.length) - 1 }
}
const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); const pos = (s.length - 1) * p; const lo = Math.floor(pos); return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo) }
const rng = mulberry32(SEED)
const draws = []
for (let b = 0; b < DRAWS; b += 1) {
  const idx = []
  while (idx.length < days.length) { const start = Math.floor(rng() * days.length); for (let k = 0; k < BLOCK && idx.length < days.length; k += 1) idx.push((start + k) % days.length) }
  draws.push(idx)
}
const out = { method: `分块自助法：日收益按 ${BLOCK} 个交易日一块重抽，${DRAWS} 次，种子 ${SEED}；E1 口径，1973-02 至 2026-10`, caps: {} }
for (const cap of [1, 0.8, 0.6]) {
  const hist = stats(days.map((_, i) => i), cap)
  const sims = draws.map(idx => stats(idx, cap))
  out.caps[cap] = {
    historical: hist,
    vol: { p5: q(sims.map(s => s.vol), 0.05), p50: q(sims.map(s => s.vol), 0.5), p95: q(sims.map(s => s.vol), 0.95) },
    dailyMaxDd: { p5: q(sims.map(s => s.dd), 0.05), p50: q(sims.map(s => s.dd), 0.5), p95: q(sims.map(s => s.dd), 0.95) },
  }
}
writeFileSync(here('./cap-intervals.json'), JSON.stringify(out, null, 2) + '\n')
const pct = x => `${(x * 100).toFixed(1)}%`
for (const [cap, r] of Object.entries(out.caps)) console.log(`上限 ${cap * 100}%：历史 波动 ${pct(r.historical.vol)} 回撤 ${pct(r.historical.dd)} | 波动 5–95% ${pct(r.vol.p5)}–${pct(r.vol.p95)} | 按日最大回撤 中位 ${pct(r.dailyMaxDd.p50)}，较差 5% ${pct(r.dailyMaxDd.p5)}，较好 5% ${pct(r.dailyMaxDd.p95)}`)
