#!/usr/bin/env node
// 按 PREREG.md 执行 VT3 确认检验：U1 美国 1959–1972 留出（叠加 v2.2 留出档位），U2–U10 海外 9 个指数（恒定 70%）。
// 只读本地文件，结果写到 results.json。用法：node docs/research/vol-target-confirm-2026-11-25/run.mjs
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
// 留出档位：生产打分代码（先核对 1973 年以后 646/646 与页面一致）
const liveCheck = rob.realtime.filter(f => evaluate({ components: f.components, tactical: { below: f.below } }).final.tier === f.pageFinal).length
if (liveCheck !== rob.realtime.length) throw new Error(`打分复现 ${liveCheck}/${rob.realtime.length}，停止`)
const holdout = rob.holdout.filter(f => f.d >= '1959-09' && f.d <= '1972-12')
  .map(f => [f.d, evaluate({ components: f.components, tactical: { below: f.below } }).final.tier])
if (holdout.length !== 160) throw new Error(`留出月数 ${holdout.length} ≠ 160`)
const U1 = compareUnit(us, holdout.map(([d, t]) => usPeriod(d, t)))
const usLive = compareUnit(us, tiersIn.tiers.filter(([d]) => d >= '1973-01' && d <= '2026-08').map(([d, t]) => usPeriod(d, t)))

// ---------- U2–U10 海外 ----------
const overseas = {}
for (const [key, { name, symbol, rows }] of Object.entries(intl.indexes)) {
  const s = series(rows)
  const firstMonth = rows[0][0].slice(0, 7)
  const startSignal = monthAfter(firstMonth, 24)
  const periods = []
  for (let d = startSignal; d <= LAST_SIGNAL; d = monthAfter(d, 1)) {
    const i0 = s.execIdx(monthAfter(d, 1)); const i1 = s.execIdx(monthAfter(d, 2)); const k = s.lastIdx(d)
    if (i0 == null || i1 == null || k == null) continue
    periods.push({ d, i0, i1, base: 0.7, kIdx: k, divDay: 0, cashDay: 0, cash: 0 })
  }
  const big = rows.slice(1).map(([d, c], i) => [d, c / rows[i][1] - 1]).filter(([, r]) => Math.abs(r) > 0.15)
  overseas[key] = { name, symbol, extremeDays: big.map(([d, r]) => `${d} ${(r * 100).toFixed(1)}%`), ...compareUnit(s, periods) }
}

const intlHolds = Object.values(overseas).filter(u => u.holds).length
const verdict = U1.holds && intlHolds >= 7 ? '可靠' : (U1.holds || intlHolds >= 5) ? '部分成立' : '不成立'

const results = {
  prereg: 'docs/research/vol-target-confirm-2026-11-25/PREREG.md',
  inputs: Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, { file: p, sha256: createHash('sha256').update(raw[k]).digest('hex') }])),
  scoringCheck: `${liveCheck}/${rob.realtime.length}`,
  U1, overseas, intlHolds, verdict,
  reportUs1973: usLive,
}
writeFileSync(here('./results.json'), JSON.stringify(results, null, 2) + '\n')

const pct = x => `${(x * 100).toFixed(1)}%`
const line = (label, u) => `${label.padEnd(10)} ${u.first}–${u.last} c=${u.scale.toFixed(2)} | 对照 波动 ${pct(u.matched.vol)} 回撤 ${pct(u.matched.dailyMaxDd)} 夏普 ${u.matched.sharpeNet.toFixed(3)} 年化 ${pct(u.matched.cagr)} | VT3 波动 ${pct(u.vt3.vol)} 回撤 ${pct(u.vt3.dailyMaxDd)} 夏普 ${u.vt3.sharpeNet.toFixed(3)} 年化 ${pct(u.vt3.cagr)} 仓位 ${pct(u.vt3.avgEquity)} 换手 ${pct(u.vt3.turnoverPerYear)} | ${u.pass.vol ? '✓' : '·'}${u.pass.dd ? '✓' : '·'}${u.pass.sharpe ? '✓' : '·'} ${u.holds ? '成立' : '不成立'}`
console.log(`打分复现 ${liveCheck}/${rob.realtime.length}`)
console.log(line('U1 美国留出', U1))
for (const [k, u] of Object.entries(overseas)) console.log(line(u.name, u) + (u.extremeDays.length ? `  极端日 ${u.extremeDays.join('、')}` : ''))
console.log(line('美国73–26*', usLive) + '  （已看过，只报告）')
console.log(`海外成立 ${intlHolds}/9；总判定：${verdict}`)
