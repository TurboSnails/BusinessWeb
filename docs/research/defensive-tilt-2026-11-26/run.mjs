#!/usr/bin/env node
// 按 PREREG.md（L-026）执行：股票部分长期固定 30% 防守（P1）/ 低波（P2）倾斜，不择时。
// 只读本地冻结文件，结果写到 results.json。用法：node docs/research/defensive-tilt-2026-11-26/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const FILES = {
  industry: './inputs/industry.json',
  macro: '../macro-significance-2026-11-25/inputs.json',
  lateCycle: '../late-cycle-2026-11-25/results.json',
}
const raw = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(here(p), 'utf8')]))
const ind = JSON.parse(raw.industry)
const macro = JSON.parse(raw.macro)
const late = JSON.parse(raw.lateCycle)

const SEED = 20261126
const DRAWS = 10000
const BLOCK = 12
const COST = 0.001
const HOLD_FEE = 0.0015 / 12
const MAIN = ['1934-01', '1972-12']
const HALVES = [['1934-01', '1952-12'], ['1953-01', '1972-12']]
const VETO = ['1973-02', '2026-09']
const CAP = 0.8
const EQUITY = { offense: 1, 'lean-offense': 0.85, neutral: 0.7, 'lean-defense': 0.5, defense: 0.3 }
const DEF_NAMES = ['Food', 'Soda', 'Beer', 'Smoke', 'Hshld', 'Hlth', 'MedEq', 'Drugs', 'Util']
const DEF = DEF_NAMES.map(n => ind.industries.indexOf(n))
if (DEF.some(i => i < 0)) throw new Error('防守篮子行业名不匹配')

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sampleVar = xs => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) }
const sd = xs => Math.sqrt(sampleVar(xs))
const monthAfter = (d, k) => { const [y, m] = d.split('-').map(Number); const t = y * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }

// ---------- 输入 ----------
const months = ind.returns.map(([d]) => d)
const R = new Map(ind.returns.map(([d, r]) => [d, r.map(v => (v == null ? null : v / 100))]))
const F = new Map(ind.firms)
const S0 = new Map(ind.size)
const cash = new Map(macro.returns.filter(r => r[2] != null).map(([d, , c]) => [d, c]))
const tiers = new Map(macro.tiers)

// 市场腿 M：按 t−1 月 firms × size 加权
const M = new Map()
for (const t of months) {
  const p = monthAfter(t, -1); const r = R.get(t); const f = F.get(p); const z = S0.get(p)
  if (!f || !z) continue
  let w = 0; let s = 0
  r.forEach((v, i) => { const cap = f[i] > 0 && z[i] > 0 ? f[i] * z[i] : 0; if (v != null && cap > 0) { w += cap; s += cap * v } })
  if (w > 0) M.set(t, s / w)
}

// 篮子成员：返回 t 月持有的行业下标
const defMembers = t => DEF.filter(i => R.get(t)?.[i] != null)
function lowVolMembers(t) {
  const hist = Array.from({ length: 36 }, (_, k) => R.get(monthAfter(t, -1 - k)))
  if (hist.some(h => !h)) return null
  const cand = ind.industries.map((_, i) => i).filter(i => hist.every(h => h[i] != null))
  const vol = new Map(cand.map(i => [i, sd(hist.map(h => h[i]))]))
  return cand.sort((a, b) => vol.get(a) - vol.get(b) || a - b).slice(0, 10).filter(i => R.get(t)?.[i] != null)
}

// ---------- 倾斜组合模拟（逐月，行业层面持仓，含换手成本与持有费） ----------
function simulate(members, tilt, from, to) {
  const out = new Map(); let drift = null; let turnoverSum = 0; let n = 0
  for (let t = from; t <= to; t = monthAfter(t, 1)) {
    const m = M.get(t); const r = R.get(t)
    const mem = members(t)
    if (m == null || !mem?.length) throw new Error(`缺 ${t} 的数据`)
    const target = new Map(mem.map(i => [i, tilt / mem.length]))
    let turnover = 0
    if (drift) {
      turnover += Math.abs((1 - tilt) - drift.m)
      const keys = new Set([...target.keys(), ...drift.d.keys()])
      for (const i of keys) turnover += Math.abs((target.get(i) ?? 0) - (drift.d.get(i) ?? 0))
    }
    let gross = (1 - tilt) * m
    for (const [i, w] of target) gross += w * r[i]
    const net = (1 + gross - tilt * HOLD_FEE) * (1 - COST * turnover) - 1
    out.set(t, net)
    const V = 1 + gross
    drift = { m: (1 - tilt) * (1 + m) / V, d: new Map([...target].map(([i, w]) => [i, w * (1 + r[i]) / V])) }
    turnoverSum += turnover; n += 1
  }
  return { ret: out, turnoverPerYear: turnoverSum / n * 12 }
}

// ---------- 度量 ----------
const range = (from, to) => { const xs = []; for (let t = from; t <= to; t = monthAfter(t, 1)) xs.push(t); return xs }
function stats(ret, ms) {
  const r = ms.map(t => ret.get(t)); const c = ms.map(t => cash.get(t))
  const ex = r.map((x, i) => x - c[i])
  let w = 1; let pk = 1; let dd = 0; for (const x of r) { w *= 1 + x; pk = Math.max(pk, w); dd = Math.min(dd, w / pk - 1) }
  return { months: r.length, cagr: w ** (12 / r.length) - 1, vol: sd(r) * Math.sqrt(12), sharpe: Math.sqrt(12) * mean(ex) / sd(ex), maxDd: dd }
}
const indexOf = (ret, ms) => { const v = [1]; for (const t of ms) v.push(v.at(-1) * (1 + ret.get(t))); return v }
// M 总收益指数上最深的 6 段 ≥ 10% 回撤；位置 j 表示第 j 个月末（0 = 窗口起点前）
function tailEvents(ms, k = 6) {
  const v = indexOf(M, ms); const eps = []; let pk = 0; let cur = null
  for (let j = 1; j < v.length; j += 1) {
    if (v[j] >= v[pk]) { if (cur) { eps.push(cur); cur = null } pk = j; continue }
    if (!cur) cur = { peak: pk, trough: j }
    if (v[j] < v[cur.trough]) cur.trough = j
  }
  if (cur) eps.push(cur)
  return eps.map(e => ({ ...e, depth: v[e.trough] / v[e.peak] - 1 })).filter(e => e.depth <= -0.10).sort((a, b) => a.depth - b.depth).slice(0, k)
    .map(e => ({ ...e, peakMonth: e.peak === 0 ? `${monthAfter(ms[0], -1)}（起点）` : ms[e.peak - 1], troughMonth: ms[e.trough - 1] }))
}
function evaluate(Sret, ms) {
  const s = stats(Sret, ms); const m = stats(M, ms)
  const k = sd(ms.map(t => Sret.get(t))) / sd(ms.map(t => M.get(t)))
  const Mstar = new Map(ms.map(t => [t, k * M.get(t) + (1 - k) * cash.get(t)]))
  const ms2 = stats(Mstar, ms)
  const vS = indexOf(Sret, ms); const vM = indexOf(M, ms); const vX = indexOf(Mstar, ms)
  const ev = tailEvents(ms).map(e => ({ peakMonth: e.peakMonth, troughMonth: e.troughMonth, M: vM[e.trough] / vM[e.peak] - 1, S: vS[e.trough] / vS[e.peak] - 1, Mstar: vX[e.trough] / vX[e.peak] - 1 }))
  const L = ev.reduce((a, e) => a + e.S, 0) / ev.reduce((a, e) => a + e.Mstar, 0)
  const diff = ms.map(t => Sret.get(t) - M.get(t))
  let worst = { rel: 0 }
  for (let j = 0; j + 36 <= ms.length; j += 1) {
    let a = 1; let b = 1; for (let q = j; q < j + 36; q += 1) { a *= 1 + Sret.get(ms[q]); b *= 1 + M.get(ms[q]) }
    if (a / b - 1 < worst.rel) worst = { rel: a / b - 1, from: ms[j], to: ms[j + 35] }
  }
  return { S: s, M: m, Mstar: ms2, k, L, events: ev, trackingError: sd(diff) * Math.sqrt(12), worstRolling36: worst }
}

// 分块自助：夏普差
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const sharpeOf = ex => Math.sqrt(12) * mean(ex) / sd(ex)
const quantile = (s, q) => { const p = (s.length - 1) * q; const lo = Math.floor(p); const hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo) }
function bootSharpeDiff(x, y) {
  const rng = mulberry32(SEED); const n = x.length; const draws = []
  for (let b = 0; b < DRAWS; b += 1) {
    const idx = []; while (idx.length < n) { const s = Math.floor(rng() * n); for (let k = 0; k < BLOCK && idx.length < n; k += 1) idx.push((s + k) % n) }
    draws.push(sharpeOf(idx.map(i => x[i])) - sharpeOf(idx.map(i => y[i])))
  }
  const sorted = draws.slice().sort((a, b) => a - b)
  const le = draws.filter(d => d <= 0).length / DRAWS; const ge = draws.filter(d => d >= 0).length / DRAWS
  return { point: sharpeOf(x) - sharpeOf(y), low: quantile(sorted, 0.025), high: quantile(sorted, 0.975), p: Math.min(1, 2 * Math.min(le, ge)) }
}

// ---------- 否决项：1973–2026，v2.2 档位 × 80% ----------
const lateEvents = late.A.events.filter(e => late.A.groups.find(g => g.label.startsWith('偏热且进攻侧')).events.includes(e.peak))
function veto(Sret) {
  const ms = range(...VETO)
  const port = E => new Map(ms.map(t => { const w = EQUITY[tiers.get(monthAfter(t, -1))] * CAP; return [t, w * E.get(t) + (1 - w) * cash.get(t)] }))
  const base = port(M); const tilt = port(Sret)
  const vB = indexOf(base, ms); const vT = indexOf(tilt, ms); const pos = new Map(ms.map((t, j) => [t, j + 1]))
  const ev = lateEvents.map(e => {
    const a = pos.get(monthAfter(e.peak.slice(0, 7), -1)); const b = pos.get(e.trough.slice(0, 7))
    return { peak: e.peak, trough: e.trough, base: vB[b] / vB[a] - 1, tilt: vT[b] / vT[a] - 1 }
  })
  const sb = stats(base, ms); const st = stats(tilt, ms)
  const sumB = ev.reduce((s, e) => s + e.base, 0); const sumT = ev.reduce((s, e) => s + e.tilt, 0)
  return { base: sb, tilt: st, sharpeDiff: st.sharpe - sb.sharpe, events: ev, sumBase: sumB, sumTilt: sumT, vetoed: st.sharpe < sb.sharpe - 0.03 || sumT < sumB }
}

// ---------- 执行 ----------
const SIM_FROM = '1934-01'; const SIM_TO = '2026-09'
const CANDS = {
  P1: { label: '防守九行业 30%', members: defMembers, tilt: 0.3 },
  P2: { label: '低波十行业 30%', members: lowVolMembers, tilt: 0.3 },
  P1x50: { label: '探索：防守九行业 50%', members: defMembers, tilt: 0.5 },
  P2x50: { label: '探索：低波十行业 50%', members: lowVolMembers, tilt: 0.5 },
}
const mainMs = range(...MAIN)
const out = {}
for (const [id, c] of Object.entries(CANDS)) {
  const sim = simulate(c.members, c.tilt, SIM_FROM, SIM_TO)
  const main = evaluate(sim.ret, mainMs)
  const halves = HALVES.map(h => ({ S: stats(sim.ret, range(...h)), M: stats(M, range(...h)) }))
  const later = { '1973-2026': evaluate(sim.ret, range('1973-01', '2026-09')), '2012-2026': evaluate(sim.ret, range('2012-01', '2026-09')) }
  const v = veto(sim.ret)
  const boot = bootSharpeDiff(mainMs.map(t => sim.ret.get(t) - cash.get(t)), mainMs.map(t => M.get(t) - cash.get(t)))
  const g1 = main.S.sharpe >= main.M.sharpe - 0.02 && halves.every(h => h.S.sharpe >= h.M.sharpe - 0.05)
  const g2 = main.S.maxDd >= main.Mstar.maxDd - 0.01
  const g3 = main.S.sharpe >= main.M.sharpe + 0.03 || main.L <= 0.90
  out[id] = { label: c.label, turnoverPerYear: sim.turnoverPerYear, main, halves, later, veto: v, boot, gate: { g1, g2, g3, g4veto: v.vetoed } }
}
// Holm over P1, P2
{
  const ids = ['P1', 'P2'].sort((a, b) => out[a].boot.p - out[b].boot.p); let run = 0
  ids.forEach((id, i) => { run = Math.max(run, Math.min(1, (ids.length - i) * out[id].boot.p)); out[id].boot.holm = run })
}
for (const id of ['P1', 'P2']) {
  const g = out[id].gate
  out[id].verdict = !(g.g1 && g.g2 && g.g3) ? '不通过' : g.g4veto ? '部分成立（被 1973–2026 否决项拦下）' : '通过'
}
const passers = ['P1', 'P2'].filter(id => out[id].verdict === '通过').sort((a, b) => out[a].main.L - out[b].main.L)

writeFileSync(here('./results.json'), JSON.stringify({
  prereg: 'docs/research/defensive-tilt-2026-11-26/PREREG.md', ledger: 'L-026',
  inputs: Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, { file: p, sha256: createHash('sha256').update(raw[k]).digest('hex') }])),
  results: out, pick: passers[0] ?? null,
}, null, 2) + '\n')

const pct = x => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
const f3 = x => x.toFixed(3)
for (const [id, o] of Object.entries(out)) {
  const m = o.main
  console.log(`\n${id} ${o.label} | 换手 ${pct(o.turnoverPerYear)}/年 | 跟踪误差 ${pct(m.trackingError)}`)
  console.log(`  1934–1972  S 夏普 ${f3(m.S.sharpe)} 年化 ${pct(m.S.cagr)} 波动 ${pct(m.S.vol)} 回撤 ${pct(m.S.maxDd)} | M 夏普 ${f3(m.M.sharpe)} 年化 ${pct(m.M.cagr)} 波动 ${pct(m.M.vol)} 回撤 ${pct(m.M.maxDd)} | M* k=${m.k.toFixed(3)} 年化 ${pct(m.Mstar.cagr)} 回撤 ${pct(m.Mstar.maxDd)} | L ${f3(m.L)}`)
  console.log(`  两半段夏普 S/M：${o.halves.map(h => `${f3(h.S.sharpe)}/${f3(h.M.sharpe)}`).join('  ')}`)
  console.log(`  尾部事件：${m.events.map(e => `${e.peakMonth}→${e.troughMonth} M ${pct(e.M)} S ${pct(e.S)} M* ${pct(e.Mstar)}`).join(' | ')}`)
  console.log(`  最差滚动 36 个月相对落后 ${pct(m.worstRolling36.rel)}（${m.worstRolling36.from}–${m.worstRolling36.to}）`)
  console.log(`  夏普差 ${f3(o.boot.point)} [${f3(o.boot.low)}, ${f3(o.boot.high)}] p ${o.boot.p.toFixed(2)}${o.boot.holm != null ? ' Holm ' + o.boot.holm.toFixed(2) : ''}`)
  for (const [k, e] of Object.entries(o.later)) console.log(`  ${k}：S 夏普 ${f3(e.S.sharpe)} 回撤 ${pct(e.S.maxDd)} | M ${f3(e.M.sharpe)} ${pct(e.M.maxDd)} | M* 回撤 ${pct(e.Mstar.maxDd)} | L ${f3(e.L)} | 最差 36 月落后 ${pct(e.worstRolling36.rel)}（${e.worstRolling36.from}–${e.worstRolling36.to}）`)
  const v = o.veto
  console.log(`  否决项 1973–2026（v2.2×80%）：夏普 ${f3(v.tilt.sharpe)} 对 ${f3(v.base.sharpe)}（差 ${f3(v.sharpeDiff)}），回撤 ${pct(v.tilt.maxDd)} 对 ${pct(v.base.maxDd)}；8 次偏热回调合并跌幅 ${pct(v.sumTilt)} 对 ${pct(v.sumBase)}`)
  console.log(`    ${v.events.map(e => `${e.peak.slice(0, 7)} ${pct(e.tilt)}/${pct(e.base)}`).join('  ')}`)
  if (o.gate) console.log(`  判定 g1 ${o.gate.g1} g2 ${o.gate.g2} g3 ${o.gate.g3} 否决 ${o.gate.g4veto} → ${o.verdict ?? '（探索）'}`)
}
console.log('\n通过：', passers.length ? passers : '无')
