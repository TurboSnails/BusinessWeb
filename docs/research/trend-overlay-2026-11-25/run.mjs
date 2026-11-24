#!/usr/bin/env node
// 按 PREREG.md 执行：第一部分仓位叠加（8 个候选）、第二部分行业动量卫星（3 个候选）与组合、相关性。
// 只读本地文件，结果写到 results.json。用法：node docs/research/trend-overlay-2026-11-25/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const readJson = p => JSON.parse(readFileSync(here(p), 'utf8'))
const sha = p => createHash('sha256').update(readFileSync(here(p))).digest('hex')

const SEED = 20261125
const DRAWS = 10000
const BLOCK = 12
const NW_LAG = 12
const SPLIT = '2000-01'
const TIER_ORDER = ['offense', 'lean-offense', 'neutral', 'lean-defense', 'defense']
const EQUITY = { offense: 1, 'lean-offense': 0.85, neutral: 0.7, 'lean-defense': 0.5, defense: 0.3 }
const COST = 0.001
const COST_HIGH = 0.003

// ---------- 工具 ----------
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sampleVar = xs => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) }
const ym = d => d.slice(0, 7)
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
function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}
function perf(port, cash, spx) {
  const n = port.length
  let w = 1; let peak = 1; let maxDd = 0
  for (const r of port) { w *= 1 + r; peak = Math.max(peak, w); maxDd = Math.min(maxDd, w / peak - 1) }
  const ex = port.map((r, i) => r - (cash ? cash[i] : 0))
  const sd = Math.sqrt(sampleVar(ex))
  const out = { months: n, cagr: w ** (12 / n) - 1, vol: Math.sqrt(12 * sampleVar(port)), maxDd, sharpe: sd ? Math.sqrt(12) * mean(ex) / sd : 0 }
  if (spx) {
    const up = spx.map((r, i) => (r > 0 ? i : -1)).filter(i => i >= 0)
    out.upCapture = mean(up.map(i => port[i])) / mean(up.map(i => spx[i]))
  }
  return out
}
const sharpeOf = ex => Math.sqrt(12) * mean(ex) / Math.sqrt(sampleVar(ex))
function bootSharpeDiff(x, y) {
  const rng = mulberry32(SEED)
  const n = x.length
  const draws = new Array(DRAWS)
  for (let b = 0; b < DRAWS; b += 1) {
    const idx = blockIndices(n, BLOCK, rng)
    draws[b] = sharpeOf(idx.map(i => x[i])) - sharpeOf(idx.map(i => y[i]))
  }
  const sorted = draws.slice().sort((a, b) => a - b)
  const le = draws.filter(d => d <= 0).length / DRAWS
  const ge = draws.filter(d => d >= 0).length / DRAWS
  return { point: sharpeOf(x) - sharpeOf(y), low: quantile(sorted, 0.025), high: quantile(sorted, 0.975), p: Math.min(1, 2 * Math.min(le, ge)) }
}
function holm(ps) {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0])
  const out = new Array(ps.length)
  let running = 0
  order.forEach(([p, i], k) => { running = Math.max(running, Math.min(1, p * (ps.length - k))); out[i] = running })
  return out
}
/** 均值的 HAC t 检验（Newey-West，Bartlett 核） */
function hacMean(x, lag = NW_LAG) {
  const T = x.length
  const m = mean(x)
  const u = x.map(v => v - m)
  let s = u.reduce((a, v) => a + v * v, 0) / T
  for (let l = 1; l <= lag; l += 1) {
    let c = 0
    for (let t = l; t < T; t += 1) c += u[t] * u[t - l]
    s += 2 * (1 - l / (lag + 1)) * c / T
  }
  const se = Math.sqrt(s / T)
  const t = m / se
  return { meanAnnual: m * 12, t, p: 2 * (1 - normCdf(Math.abs(t))) }
}
function corr(x, y) {
  const mx = mean(x); const my = mean(y)
  let n = 0; let a = 0; let b = 0
  for (let i = 0; i < x.length; i += 1) { n += (x[i] - mx) * (y[i] - my); a += (x[i] - mx) ** 2; b += (y[i] - my) ** 2 }
  return a && b ? n / Math.sqrt(a * b) : null
}

// ======================================================================
// 第一部分：仓位叠加
// ======================================================================
const us = readJson('../macro-significance-2026-11-25/inputs.json')
const returns = new Map(us.returns.map(([d, spx, cash]) => [d, { spx, cash }]))
const price = new Map(us.price)
const priceAt = d => price.get(d)
const breadthRows = readJson('../../../data-raw/macro-posture-market/industry-breadth.json').map(([d, v]) => [ym(d), v])
const breadth = new Map(breadthRows)
const volumeRows = readJson('../../../data-raw/macro-posture-market/spx-monthly-volume.json').map(([d, v]) => [ym(d), v])
const volume = new Map(volumeRows)

function windowValues(map, end, count) {
  const out = []
  for (let k = count - 1; k >= 0; k -= 1) {
    const v = map.get(monthAfter(end, -k))
    if (!Number.isFinite(v)) return null
    out.push(v)
  }
  return out
}
function signalsAt(s) {
  const p = priceAt(s); const p1 = priceAt(monthAfter(s, -1)); const p12 = priceAt(monthAfter(s, -12))
  const w10 = windowValues(price, s, 10)
  const M = Number.isFinite(p1) && Number.isFinite(p12) ? p1 / p12 - 1 > 0 : null
  const T = w10 && Number.isFinite(p) ? p >= mean(w10) : null
  const bVal = breadth.get(monthAfter(s, -2)) // 观察月后第 2 个月末可得
  const B = Number.isFinite(bVal) ? bVal >= 60 : null
  const v3 = windowValues(volume, s, 3); const v12 = windowValues(volume, s, 12)
  const V = v3 && v12 && T != null ? (mean(v3) / mean(v12) >= 1.10 && T) : null
  return { M, T, B, V }
}
const CANDIDATES = {
  A1: s => s.M,
  A2: s => s.M && s.T,
  A3: s => s.B,
  A4: s => s.V,
  C1: s => s.M && s.T && s.B,
  C2: s => s.M && s.T && s.V,
  C3: s => s.M && s.T && s.B && s.V,
  C4: s => [s.M && s.T, s.B, s.V].filter(Boolean).length >= 2,
}
const bump = tier => (tier === 'neutral' || tier === 'lean-offense') ? TIER_ORDER[TIER_ORDER.indexOf(tier) - 1] : tier

const rowsA = []
for (const [signal, tier] of us.tiers) {
  const d = monthAfter(signal, 2)
  const r = returns.get(d)
  const sig = signalsAt(signal)
  if (r?.cash == null || EQUITY[tier] == null || Object.values(sig).some(v => v == null)) continue
  rowsA.push({ signal, d, spx: r.spx, cash: r.cash, tier, sig })
}
function seriesA(weightOf, rs = rowsA) { return rs.map(row => weightOf(row) * row.spx + (1 - weightOf(row)) * row.cash) }
const baseWeight = row => EQUITY[row.tier]
const candWeight = id => row => EQUITY[CANDIDATES[id](row.sig) ? bump(row.tier) : row.tier]
const periodsA = { train: r => r.d < SPLIT, test: r => r.d >= SPLIT, full: () => true }
function evalA(weightOf) {
  return Object.fromEntries(Object.entries(periodsA).map(([name, keep]) => {
    const rs = rowsA.filter(keep)
    const port = seriesA(weightOf, rs)
    return [name, { ...perf(port, rs.map(r => r.cash), rs.map(r => r.spx)), avgEquity: mean(rs.map(weightOf)), range: `${rs[0].d} 至 ${rs.at(-1).d}` }]
  }))
}
const baseA = evalA(baseWeight)
const candA = Object.fromEntries(Object.keys(CANDIDATES).map(id => [id, evalA(candWeight(id))]))
const excessOf = weightOf => seriesA(weightOf).map((r, i) => r - rowsA[i].cash)
const baseEx = excessOf(baseWeight)
const bootA = Object.fromEntries(Object.keys(CANDIDATES).map(id => [id, bootSharpeDiff(excessOf(candWeight(id)), baseEx)]))
const holmA = holm(Object.keys(CANDIDATES).map(id => bootA[id].p))
Object.keys(CANDIDATES).forEach((id, i) => { bootA[id].holm = holmA[i] })
const boostShare = Object.fromEntries(Object.keys(CANDIDATES).map(id => [id, mean(rowsA.map(r => Number(CANDIDATES[id](r.sig) && bump(r.tier) !== r.tier)))]))

// 门槛 1、2
const passTrain = id => candA[id].train.sharpe >= baseA.train.sharpe + 0.02 && candA[id].train.maxDd >= baseA.train.maxDd - 0.01
const trainPassers = Object.keys(CANDIDATES).filter(passTrain)
const pickA = trainPassers.sort((a, b) => candA[b].train.sharpe - candA[a].train.sharpe)[0] ?? null

// 门槛 4：海外样本外（只对 A1、A2）
const ih = readJson('../../../public/data/index-history.json')
// 截止月写死，避免换一天运行结果不同（只用 2026-10 及以前的完整月）
const currentMonth = '2026-11'
const INTL = ['ndx', 'rut', 'hsi', 'sse', 'csi300']
function intlTest(id) {
  return Object.fromEntries(INTL.map(key => {
    const closes = new Map()
    for (const [d, v] of ih.indexes[key].monthly) if (ym(d) < currentMonth && Number.isFinite(v)) closes.set(ym(d), v)
    const months = [...closes.keys()].sort()
    const base = []; const over = []
    for (const s of months) {
      const next = monthAfter(s, 1)
      if (!closes.has(next)) continue
      const p = closes.get(s); const p1 = closes.get(monthAfter(s, -1)); const p12 = closes.get(monthAfter(s, -12))
      const w10 = windowValues(closes, s, 10)
      if (!Number.isFinite(p1) || !Number.isFinite(p12) || !w10) continue
      const M = p1 / p12 - 1 > 0
      const T = p >= mean(w10)
      const cond = id === 'A1' ? M : M && T
      const r = closes.get(next) / p - 1
      base.push(0.7 * r); over.push((cond ? 0.85 : 0.7) * r)
    }
    const b = perf(base, null); const o = perf(over, null)
    return [key, { months: base.length, baseSharpe: b.sharpe, overlaySharpe: o.sharpe, baseMaxDd: b.maxDd, overlayMaxDd: o.maxDd, better: o.sharpe > b.sharpe }]
  }))
}
const intl = { A1: intlTest('A1'), A2: intlTest('A2') }
const intlPass = id => (id === 'A1' || id === 'A2') ? Object.values(intl[id]).filter(x => x.better).length >= 4 : null

const decisionA = Object.fromEntries(Object.keys(CANDIDATES).map(id => {
  const failed = []
  if (!passTrain(id)) failed.push('门槛1 训练期')
  else if (id !== pickA) failed.push('门槛2 训练期夏普非最高，未进入验证')
  if (id === pickA) {
    const t = candA[id].test
    if (!(t.sharpe >= baseA.test.sharpe + 0.02 && t.maxDd >= baseA.test.maxDd - 0.01)) failed.push('门槛2 验证期')
  }
  if (!(bootA[id].holm < 0.05)) failed.push('门槛3 Holm 校正后不显著')
  const ip = intlPass(id)
  if (ip === null) failed.push('门槛4 无海外数据，无法检验')
  else if (!ip) failed.push('门槛4 海外不足 4/5')
  return [id, { adopt: failed.length === 0, failed }]
}))

// 相关性：四个信号两两之间，以及与「v2.2 在进攻侧」
const sigNames = ['M', 'T', 'B', 'V']
const sigSeries = Object.fromEntries(sigNames.map(k => [k, rowsA.map(r => Number(r.sig[k]))]))
const offenseSide = rowsA.map(r => Number(r.tier === 'offense' || r.tier === 'lean-offense'))
const phi = Object.fromEntries(sigNames.map(a => [a, Object.fromEntries([...sigNames.map(b => [b, corr(sigSeries[a], sigSeries[b])]), ['offenseSide', corr(sigSeries[a], offenseSide)]])]))
const sigShare = Object.fromEntries(sigNames.map(k => [k, mean(sigSeries[k])]))

// ======================================================================
// 第二部分：行业动量卫星
// ======================================================================
const ind = readJson('./inputs-industry.json')
const indMonths = ind.returns.map(([d]) => d)
const indRet = new Map(ind.returns.map(([d, cells]) => [d, cells.map(v => (v == null ? null : v / 100))]))
const firms = new Map(ind.firms)
const size = new Map(ind.size)
const N = ind.industries.length

function momentum(t, look) {
  // 过去 look 个月、剔除最近 1 个月：月份 t−look+1 … t−1
  return Array.from({ length: N }, (_, i) => {
    let g = 1
    for (let k = look - 1; k >= 1; k -= 1) {
      const r = indRet.get(monthAfter(t, -k))?.[i]
      if (r == null) return null
      g *= 1 + r
    }
    return g - 1
  })
}
const SATS = { S1: { look: 12, top: 5 }, S2: { look: 6, top: 5 }, S3: { look: 12, top: 10 } }
function satellite({ look, top }) {
  const out = new Map() // 收益月 → { gross, turnover }
  let prev = null // 上月末持有权重（漂移后）
  for (const t of indMonths) {
    const next = monthAfter(t, 1)
    const nextRet = indRet.get(next)
    if (!nextRet) continue
    const mom = momentum(t, look)
    // 只用 t 月末已知的信息筛选：动量可算、且 t 月有收益（不看下个月是否有数据）
    const nowRet = indRet.get(t)
    const ranked = mom.map((v, i) => [v, i]).filter(([v, i]) => v != null && nowRet?.[i] != null).sort((a, b) => b[0] - a[0])
    if (ranked.length < top + 5) continue
    const w = new Array(N).fill(0)
    ranked.slice(0, top).forEach(([, i]) => { w[i] = 1 / top })
    const turnover = prev ? w.reduce((s, x, i) => s + Math.abs(x - prev[i]), 0) : 1
    const gross = w.reduce((s, x, i) => s + x * (nextRet[i] ?? 0), 0)
    out.set(next, { gross, turnover })
    const grown = w.map((x, i) => x * (1 + (nextRet[i] ?? 0)))
    const tot = grown.reduce((s, x) => s + x, 0)
    prev = grown.map(x => x / tot)
  }
  return out
}
function benchmarks() {
  const vw = new Map(); const ew = new Map()
  for (const t of indMonths) {
    // Ken French 第 t 月的平均市值已是 t−1 月末的值（审稿核对：size(t)/size(t−1) 与 r(t−1) 相关 0.956），直接用当月
    const r = indRet.get(t); const f = firms.get(t); const s = size.get(t)
    if (!r) continue
    const avail = r.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0)
    ew.set(t, mean(avail.map(i => r[i])))
    if (f && s) {
      let num = 0; let den = 0
      for (const i of avail) { const cap = (f[i] ?? 0) * (s[i] ?? 0); if (cap > 0) { num += cap * r[i]; den += cap } }
      if (den > 0) vw.set(t, num / den)
    }
  }
  return { vw, ew }
}
const { vw, ew } = benchmarks()
const cashMap = new Map([...returns].map(([d, r]) => [d, r.cash]))
const periodsB = { train: d => d < SPLIT, test: d => d >= SPLIT, full: () => true }
function evalSat(id) {
  const sat = satellite(SATS[id])
  // 夏普需要国库券（1934 年起）；超额收益（卫星 − 基准）不需要，从数据可得的第一个月算起
  const allMonths = [...sat.keys()].filter(d => vw.has(d) && ew.has(d)).sort()
  const months = allMonths.filter(d => cashMap.get(d) != null)
  const net = c => months.map(d => sat.get(d).gross - c * sat.get(d).turnover)
  const series = { net: net(COST), netHigh: net(COST_HIGH), gross: net(0), vw: months.map(d => vw.get(d)), ew: months.map(d => ew.get(d)) }
  const cash = months.map(d => cashMap.get(d))
  const res = Object.fromEntries(Object.entries(periodsB).map(([name, keep]) => {
    const idx = months.map((d, i) => (keep(d) ? i : -1)).filter(i => i >= 0)
    const pick = arr => idx.map(i => arr[i])
    return [name, {
      range: `${months[idx[0]]} 至 ${months[idx.at(-1)]}`,
      net: perf(pick(series.net), pick(cash)), netHigh: perf(pick(series.netHigh), pick(cash)), gross: perf(pick(series.gross), pick(cash)),
      vw: perf(pick(series.vw), pick(cash)), ew: perf(pick(series.ew), pick(cash)),
      // 双边换手（买入 + 卖出）；成本按每单位买入或卖出 0.10% 扣，等于每单位单边换手 0.20%，偏保守
      turnoverPerYear: mean(idx.map(i => sat.get(months[i]).turnover)) * 12,
    }]
  }))
  res.activeHac = hacMean(allMonths.map(d => sat.get(d).gross - COST * sat.get(d).turnover - vw.get(d)))
  res.activeRange = `${allMonths[0]} 至 ${allMonths.at(-1)}`
  return { res, months, series }
}
const satResults = Object.fromEntries(Object.keys(SATS).map(id => [id, evalSat(id)]))
const satTrainPass = Object.keys(SATS).filter(id => satResults[id].res.train.net.sharpe > satResults[id].res.train.vw.sharpe)
const pickS = satTrainPass.sort((a, b) => satResults[b].res.train.net.sharpe - satResults[a].res.train.net.sharpe)[0] ?? null
const decisionB = Object.fromEntries(Object.keys(SATS).map(id => {
  const r = satResults[id].res
  const failed = []
  if (!(r.train.net.sharpe > r.train.vw.sharpe)) failed.push('门槛1 训练期不优于市值加权基准')
  else if (id !== pickS) failed.push('门槛1 训练期夏普非最高')
  if (id === pickS && !(r.test.net.sharpe > r.test.vw.sharpe)) failed.push('门槛2 验证期不优于基准')
  if (!(r.activeHac.p < 0.05)) failed.push('门槛3 超额收益 HAC 不显著')
  return [id, { adopt: failed.length === 0, failed }]
}))
const chosenSat = Object.entries(decisionB).find(([, v]) => v.adopt)?.[0] ?? null

// 组合（只在有卫星通过时做）与卫星超额收益的相关性（总是报告，作参考）
const spxClose = new Map(ind.spxClose)
const priceAvg = price
function spxMonthEnd(d) {
  const c = spxClose.get(d); const c0 = spxClose.get(monthAfter(d, -1)); const r = returns.get(d)
  const p = priceAvg.get(d); const p0 = priceAvg.get(monthAfter(d, -1))
  if (![c, c0, p, p0].every(Number.isFinite) || r == null) return null
  const divMonthly = r.spx - (p / p0 - 1) // 月均价收益 = 价格变化 + 股息率/12
  return c / c0 - 1 + divMonthly
}
function combo(satId, wSat) {
  const sat = satellite(SATS[satId])
  const out = []
  for (const [signal, tier] of us.tiers) {
    const d = monthAfter(signal, 2)
    const spx = spxMonthEnd(d); const cash = cashMap.get(d); const s = sat.get(d)
    if (spx == null || cash == null || !s || EQUITY[tier] == null) continue
    const satNet = s.gross - COST * s.turnover
    const eq = EQUITY[tier]
    out.push({ d, port: eq * ((1 - wSat) * spx + wSat * satNet) + (1 - eq) * cash, cash, spx, satNet })
  }
  return out
}
function corrReport(satId) {
  const rows = combo(satId, 0)
  const sat = satResults[satId]
  const vwMap = new Map(sat.months.map((d, i) => [d, sat.series.vw[i]]))
  const act = rows.filter(r => vwMap.has(r.d))
  const per = keep => {
    const rs = act.filter(r => keep(r.d))
    const active = rs.map(r => r.satNet - vwMap.get(r.d))
    return { months: rs.length, withCore: corr(active, rs.map(r => r.port)), withSpx: corr(active, rs.map(r => r.spx)) }
  }
  return { full: per(() => true), train: per(d => d < SPLIT), test: per(d => d >= SPLIT) }
}
const correlations = Object.fromEntries(Object.keys(SATS).map(id => [id, corrReport(id)]))
let comboResult = null
if (chosenSat) {
  const ws = [0, 0.1, 0.2, 0.3]
  const evalW = w => {
    const rows = combo(chosenSat, w)
    return Object.fromEntries(Object.entries(periodsB).map(([name, keep]) => {
      const rs = rows.filter(r => keep(r.d))
      return [name, perf(rs.map(r => r.port), rs.map(r => r.cash))]
    }))
  }
  const table = Object.fromEntries(ws.map(w => [w, evalW(w)]))
  const base = table[0]
  const okW = ws.filter(w => table[w].train.maxDd >= base.train.maxDd - 0.01)
  const bestW = okW.sort((a, b) => table[b].train.sharpe - table[a].train.sharpe)[0]
  comboResult = { satellite: chosenSat, table, bestW }
}

// ---------- 输出 ----------
const result = {
  prereg: 'PREREG.md（git 提交 bc637f14，计算前）',
  inputs: {
    us: sha('../macro-significance-2026-11-25/inputs.json'),
    industry: sha('./inputs-industry.json'),
    breadth: sha('../../../data-raw/macro-posture-market/industry-breadth.json'),
    volume: sha('../../../data-raw/macro-posture-market/spx-monthly-volume.json'),
    indexHistory: sha('../../../public/data/index-history.json'),
  },
  partA: { sample: `${rowsA[0].d} 至 ${rowsA.at(-1).d}（${rowsA.length} 个月）`, base: baseA, candidates: candA, boot: bootA, boostShare, trainPassers, pick: pickA, intl, decision: decisionA, phi, sigShare },
  partB: { satellites: Object.fromEntries(Object.entries(satResults).map(([id, v]) => [id, v.res])), pick: pickS, decision: decisionB, chosen: chosenSat, correlations, combo: comboResult },
}
writeFileSync(here('./results.json'), JSON.stringify(result, null, 2))

// ---------- 打印 ----------
const f = (x, d = 3) => (x == null ? '—' : (x < 0 ? '−' : '') + Math.abs(x).toFixed(d))
const pct = x => (x == null ? '—' : f(x * 100, 2) + '%')
console.log(`第一部分 样本 ${result.partA.sample}`)
const lineA = (name, e) => `${name.padEnd(4)} 训练 夏普 ${f(e.train.sharpe)} 回撤 ${pct(e.train.maxDd)} | 验证 夏普 ${f(e.test.sharpe)} 回撤 ${pct(e.test.maxDd)} | 全样本 年化 ${pct(e.full.cagr)} 夏普 ${f(e.full.sharpe)} 回撤 ${pct(e.full.maxDd)} 仓位 ${pct(e.full.avgEquity)} 上行捕获 ${f(e.full.upCapture)}`
console.log(lineA('基线', baseA))
for (const id of Object.keys(CANDIDATES)) {
  const b = bootA[id]
  console.log(lineA(id, candA[id]) + ` | 加码月份 ${pct(boostShare[id])} | 夏普差 ${f(b.point)} [${f(b.low)}, ${f(b.high)}] p=${f(b.p, 4)} Holm ${f(b.holm, 4)} | ${decisionA[id].adopt ? '采用' : '不采用：' + decisionA[id].failed.join('；')}`)
}
for (const id of ['A1', 'A2']) console.log(`海外 ${id}：` + INTL.map(k => `${k} ${f(intl[id][k].baseSharpe)}→${f(intl[id][k].overlaySharpe)}${intl[id][k].better ? '↑' : '↓'}`).join('  '))
console.log('信号占比 ' + sigNames.map(k => `${k} ${pct(sigShare[k])}`).join('  '))
console.log('信号相关（phi）：' + sigNames.map(a => `${a}: ` + [...sigNames, 'offenseSide'].map(b => `${b} ${f(phi[a][b], 2)}`).join(' ')).join(' | '))
console.log('\n第二部分')
for (const id of Object.keys(SATS)) {
  const r = satResults[id].res
  console.log(`${id} 训练(${r.train.range}) 净夏普 ${f(r.train.net.sharpe)} vs 市值加权 ${f(r.train.vw.sharpe)} 等权 ${f(r.train.ew.sharpe)} | 验证(${r.test.range}) 净夏普 ${f(r.test.net.sharpe)} vs ${f(r.test.vw.sharpe)}（0.3% 成本 ${f(r.test.netHigh.sharpe)}） 回撤 ${pct(r.test.net.maxDd)} vs ${pct(r.test.vw.maxDd)} | 年换手 ${f(r.full.turnoverPerYear, 1)} | 超额(${r.activeRange}) 年化 ${pct(r.activeHac.meanAnnual)} t=${f(r.activeHac.t, 2)} p=${f(r.activeHac.p, 4)} | ${decisionB[id].adopt ? '采用' : '不采用：' + decisionB[id].failed.join('；')}`)
  const c = correlations[id]
  console.log(`   超额收益相关：与 v2.2 组合 全 ${f(c.full.withCore, 2)} 训练 ${f(c.train.withCore, 2)} 验证 ${f(c.test.withCore, 2)}；与标普 全 ${f(c.full.withSpx, 2)}`)
}
if (comboResult) {
  for (const [w, t] of Object.entries(comboResult.table)) console.log(`组合 w=${w}：训练 夏普 ${f(t.train.sharpe)} 回撤 ${pct(t.train.maxDd)} | 验证 夏普 ${f(t.test.sharpe)} 回撤 ${pct(t.test.maxDd)}`)
  console.log(`训练期选出 w = ${comboResult.bestW}`)
} else {
  console.log('没有卫星通过门槛，不做组合。')
}
