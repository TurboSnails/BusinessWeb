#!/usr/bin/env node
// L-027 主检验：1872-01 至 1934-12（确认期），按 PREREG.md。必须在预注册提交之后运行。
// 用法：node docs/research/trend-1871-2026-11-26/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { belowMA, bootSharpeDiff, gates, makeSameVol, mAfter, mean, metrics, navOf, placebos, range, sd, spellsOf, targetWeights } from './lib.mjs'

const here = p => new URL(p, import.meta.url)
const FILES = { shiller: '../../../data-raw/sp500-backtest/shiller.csv', cp: './inputs/cp.json', ff: './inputs/ff-factors.json', tbill: './inputs/tbill-m13029a.json' }
const raw = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(here(p), 'utf8')]))
const rows = raw.shiller.trim().split('\n').slice(1).map(l => l.split(','))
const P = new Map(rows.map(r => [r[0], +r[1]])); const D = new Map(rows.map(r => [r[0], +r[2]]))
const CP = new Map(JSON.parse(raw.cp).rows)
const W0 = 0.85
const months = range('1872-01', '1934-12')
const r = months.map(t => (P.get(t) + D.get(t) / 12) / P.get(mAfter(t, -1)) - 1)
const cashGW = months.map(t => (0.886 * CP.get(t) - 0.4) / 1200)
const EVENTS = [['E1', '1876-03', '1877-06', '前'], ['E2', '1882-09', '1885-01', '前'], ['E3', '1893-01', '1893-08', '前'], ['E4', '1902-09', '1903-10', '后'], ['E5', '1906-09', '1907-11', '后'], ['E6', '1916-11', '1917-12', '后'], ['E7', '1919-10', '1921-08', '后'], ['E8', '1929-09', '1932-06', '后']].map(([id, p, q, sub]) => ({ id, p, q, sub }))
const ctx = { months, r, c: cashGW, events: EVENTS, w0: W0 }
const opts = { closure1914: true }
const maRule = (low, n = 10, base = W0, Pser = P) => s => { const b = belowMA(Pser, s, n); if (b == null) throw new Error(`MA 缺数据 ${s}`); return b ? low : base }
const CAND = { C1: 0.70, C2: 0.50 }

// ---------- 主判定 ----------
const res = {}
for (const [id, low] of Object.entries(CAND)) {
  const w = targetWeights(months, maRule(low), opts)
  const m = metrics(ctx, w, 0.001); const m30 = metrics(ctx, w, 0.003)
  res[id] = { low, w, m, m30, gates: gates(m, m30, W0, W0 - low) }
}
// C2 附加条件
res.C2.extra = res.C2.m.L <= res.C1.m.L && res.C2.m.dE >= res.C1.m.dE

// ---------- G5 安慰剂 ----------
const spells = spellsOf(res.C1.w, W0)
const solve = makeSameVol(r, cashGW)
const pos = new Map(months.map((t, i) => [t, i]))
function lightL(w, kappa = 0.001) {
  const g = w.map((x, i) => x * r[i] + (1 - x) * cashGW[i])
  const n = g.map((x, i) => (i === 0 ? x : x - kappa * Math.abs(w[i] - w[i - 1])))
  const wM = solve(sd(g)); const nM = r.map((x, i) => wM * x + (1 - wM) * cashGW[i])
  const V = navOf(n); const VM = navOf(nM); const at = (v, t) => v[pos.get(t) + 1]
  let a = 0; let b = 0; for (const e of EVENTS) { a += at(V, e.q) / at(V, e.p) - 1; b += at(VM, e.q) / at(VM, e.p) - 1 }
  return a / b
}
const actual = { C1: lightL(res.C1.w), C2: lightL(res.C2.w) }
const count = { C1: 0, C2: 0 }; let draws = 0
for (const def of placebos(months.length, spells)) {
  draws++
  for (const [id, low] of Object.entries(CAND)) if (lightL(def.map(d => (d ? low : W0))) <= actual[id]) count[id]++
}
const pRaw = Object.fromEntries(Object.keys(CAND).map(id => [id, (1 + count[id]) / (1 + draws)]))
const order = Object.keys(pRaw).sort((a, b) => pRaw[a] - pRaw[b]); const pHolm = {}; let run = 0
order.forEach((id, i) => { run = Math.max(run, Math.min(1, (order.length - i) * pRaw[id])); pHolm[id] = run })
for (const id of Object.keys(CAND)) res[id].gates.G5 = pHolm[id] <= 0.05

// ---------- 结论 ----------
for (const id of Object.keys(CAND)) {
  const g = res[id].gates; const floor = g.G1 && g.G2 && g.G3 && g.G4 && g.G6 && g.G7 && (id !== 'C2' || res.C2.extra)
  res[id].verdict = !floor ? '不通过' : g.G5 ? '通过（C2 另看 G9）' : '部分成立（G5 不显著）'
}

// ---------- 报告项：夏普差、G8、敏感性、探索 ----------
const report = {}
for (const id of Object.keys(CAND)) {
  const m = res[id].m; const w = res[id].w
  const n = w.map((x, i) => x * r[i] + (1 - x) * cashGW[i] - (i ? 0.001 * Math.abs(w[i] - w[i - 1]) : 0))
  const nM = r.map((x, i) => m.wM * x + (1 - m.wM) * cashGW[i])
  report[id] = { sharpeDiff: bootSharpeDiff(n.map((v, i) => v - cashGW[i]), nM.map((v, i) => v - cashGW[i])), twoMonthReversalShare: spells.filter(l => l <= 2).length / spells.length, spells: spells.length }
  // 同平均仓位 M′
  const wBar = mean(w); const nMp = r.map((x, i) => wBar * x + (1 - wBar) * cashGW[i]); const V = navOf(n); const VMp = navOf(nMp); const at = (v, t) => v[pos.get(t) + 1]
  report[id].Lvs_sameAvg = EVENTS.reduce((s, e) => s + at(V, e.q) / at(V, e.p) - 1, 0) / EVENTS.reduce((s, e) => s + at(VMp, e.q) / at(VMp, e.p) - 1, 0)
}
// G8：Ken French 月末口径
{
  const ff = JSON.parse(raw.ff).rows ?? JSON.parse(raw.ff)
  const mk = new Map(); const rf = new Map()
  for (const row of ff) { const [d, a, b] = Array.isArray(row) ? row : [row.d, row.mktRf, row.rf]; const mr = Array.isArray(a) ? a : a; mk.set(d, (Number(Array.isArray(row) ? row[1] : a) + Number(Array.isArray(row) ? row[2] : b)) / 100); rf.set(d, Number(Array.isArray(row) ? row[2] : b) / 100) }
  const all = range('1926-07', '1934-12'); const I = new Map(); let v = 1; for (const t of all) { v *= 1 + mk.get(t); I.set(t, v) }
  const win = range('1927-05', '1934-12'); const rr = win.map(t => mk.get(t)); const cc = win.map(t => rf.get(t))
  const posW = new Map(win.map((t, i) => [t, i])); const g8 = {}
  for (const [id, low] of Object.entries(CAND)) {
    const w = win.map(t => (belowMA(I, mAfter(t, -1)) ? low : W0))
    const n = w.map((x, i) => x * rr[i] + (1 - x) * cc[i] - (i ? 0.001 * Math.abs(w[i] - w[i - 1]) : 0))
    const g = w.map((x, i) => x * rr[i] + (1 - x) * cc[i])
    const out = {}
    for (const [label, wM] of [['主确认期 w_M', res[id].m.wM], ['窗口内重算 w_M', makeSameVol(rr, cc)(sd(g))]]) {
      const nM = rr.map((x, i) => wM * x + (1 - wM) * cc[i]); const V = navOf(n); const VM = navOf(nM); const at = (vv, t) => vv[posW.get(t) + 1]
      out[label] = { wM, downC: at(V, '1932-06') / at(V, '1929-09') - 1, downM: at(VM, '1932-06') / at(VM, '1929-09') - 1, fullC: at(V, '1933-06') / at(V, '1929-09') - 1, fullM: at(VM, '1933-06') / at(VM, '1929-09') - 1 }
    }
    g8[id] = out
  }
  report.G8 = g8
}
// 敏感性
const sens = {}
const cashRaw = months.map(t => CP.get(t) / 1200); const cashFloor = months.map(t => Math.max(CP.get(t) - 1.5, 0) / 1200)
for (const [id, low] of Object.entries(CAND)) {
  const w = res[id].w; const s = {}
  for (const [label, cc] of [['现金=原始 CP', cashRaw], ['现金=max(CP−1.5,0)', cashFloor]]) { const mm = metrics({ ...ctx, c: cc }, w, 0.001); s[label] = { L: mm.L, dE: mm.dE, calmVsM: mm.calmVsM, dCER: mm.dCER, wins: mm.wins, posE: mm.posE } }
  for (const n of [9, 11, 12]) { const ww = targetWeights(months, maRule(low, n), opts); const mm = metrics(ctx, ww, 0.001); s[`均线 ${n} 个月`] = { L: mm.L, dE: mm.dE, calmVsM: mm.calmVsM, wins: mm.wins, posE: mm.posE, switchesPerYear: mm.switchesPerYear } }
  // 跳过停市月的 MA10：用 P 去掉 1914-08..11 后最近 10 个交易月
  const skip = new Set(['1914-08', '1914-09', '1914-10', '1914-11'])
  const maSkip = s0 => { const xs = []; let t = s0; while (xs.length < 10) { if (!skip.has(t)) xs.push(P.get(t)); t = mAfter(t, -1) } return P.get(s0) < mean(xs) ? low : W0 }
  { const ww = targetWeights(months, maSkip, opts); const mm = metrics(ctx, ww, 0.001); s['MA10 跳过停市月'] = { L: mm.L, dE: mm.dE, calmVsM: mm.calmVsM, wins: mm.wins, posE: mm.posE } }
  sens[id] = s
}
{ // 底仓 70%：破位 50%
  const w = targetWeights(months, maRule(0.50, 10, 0.70), opts); const mm = metrics({ ...ctx, w0: 0.70 }, w, 0.001)
  sens['底仓 70%（破位 50%）'] = { L: mm.L, dE: mm.dE, calmVsM: mm.calmVsM, wins: mm.wins, posE: mm.posE, Lstar: (0.70 - 0.65 * 0.20) / mm.wM }
}
// 探索 X1：多周期投票
const explore = {}
{
  const ch = (s, k) => P.get(s) / P.get(mAfter(s, -k)) - 1
  const vote4 = s => { const n = [1, 3, 6, 12].filter(k => ch(s, k) > 0).length; return n >= 3 ? 0.85 : n === 2 ? 0.70 : n === 1 ? 0.50 : 0.30 }
  const vote3 = s => { const n = [3, 6, 12].filter(k => ch(s, k) > 0).length; return n >= 2 ? 0.85 : n === 1 ? 0.50 : 0.30 }
  for (const [label, fn] of [['X1 四票（1/3/6/12）', vote4], ['X1 三票（去掉 1 个月）', vote3]]) {
    const w = targetWeights(months, s => (s < '1872-01' ? W0 : fn(s)), opts); const mm = metrics(ctx, w, 0.001)
    explore[label] = { L: mm.L, Lm29: mm.Lm29, wins: mm.wins, dE: mm.dE, posE: mm.posE, calmVsM: mm.calmVsM, calmVsB0: mm.calmVsB0, dCER: mm.dCER, switchesPerYear: mm.switchesPerYear, wM: mm.wM, sub: mm.sub }
  }
}
// 探索 X2：流动性（商业票据）+ 破位
{
  const ch12 = s => CP.get(s) - CP.get(mAfter(s, -12))
  const short = s => { const v = ch12(s); if (!(v > 0)) return false; const hist = Array.from({ length: 120 }, (_, k) => ch12(mAfter(s, -k))); return hist.filter(x => x <= v).length / hist.length >= 0.70 }
  const L = s => Array.from({ length: 12 }, (_, k) => short(mAfter(s, -k))).some(Boolean)
  const sigMonths = range('1871-10', '1934-10')
  const share = sigMonths.filter(L).length / sigMonths.length
  const pre = EVENTS.map(e => ({ id: e.id, L3: [1, 2, 3].some(k => L(mAfter(e.p, -k))) }))
  const w = targetWeights(months, s => { const b = belowMA(P, s); return b && L(s) ? 0.50 : b ? 0.70 : W0 }, opts); const mm = metrics(ctx, w, 0.001)
  explore['X2 流动性 + 破位'] = { prediag: { Lshare: share, eventsWithL: pre.filter(x => x.L3).length, detail: pre, designFailed: share > 0.60 || pre.filter(x => x.L3).length < 4 }, L: mm.L, dE: mm.dE, calmVsM: mm.calmVsM, wins: mm.wins, posE: mm.posE, vsC2: { L: mm.L - res.C2.m.L, dE: mm.dE - res.C2.m.dE } }
}
// 现金换算复核（1920-01 至 1934-03）
{ const tb = new Map(JSON.parse(raw.tbill).rows); const mm = range('1920-01', '1934-03').filter(t => tb.get(t) != null)
  report.cashCheck = { months: mm.length, meanGW: mean(mm.map(t => 0.886 * CP.get(t) - 0.4)), meanTbill: mean(mm.map(t => tb.get(t))) } }

const pick = m => ({ wM: m.wM, L: m.L, Lm29: m.Lm29, wins: m.wins, dE: m.dE, posE: m.posE, calmVsM: m.calmVsM, calmVsB0: m.calmVsB0, sub: m.sub, dCER: m.dCER, sharpe: m.sharpe, sharpeM: m.sharpeM, switchesPerYear: m.switchesPerYear, turnoverPerYear: m.turnoverPerYear, avgW: m.avgW, events: m.events.map(e => ({ id: e.id, downC: e.downC, downM: e.downM, fullC: e.fullC, fullM: e.fullM, dE: e.dE, win: e.win })) })
const results = {
  prereg: 'docs/research/trend-1871-2026-11-26/PREREG.md', ledger: 'L-027',
  inputs: Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, { file: p, sha256: createHash('sha256').update(raw[k]).digest('hex') }])),
  window: [months[0], months.at(-1)], spells,
  candidates: Object.fromEntries(Object.keys(CAND).map(id => [id, { main: pick(res[id].m), cost30: pick(res[id].m30), gates: res[id].gates, extra: res[id].extra ?? null, verdict: res[id].verdict, placebo: { pRaw: pRaw[id], pHolm: pHolm[id], draws } }])),
  report, sensitivity: sens, explore,
}
writeFileSync(here('./results.json'), JSON.stringify(results, null, 2) + '\n')
const f = (x, d = 3) => (x == null ? '—' : Number(x).toFixed(d))
for (const id of Object.keys(CAND)) {
  const m = res[id].m; const g = res[id].gates
  console.log(`\n${id}（破位 ${res[id].low * 100}%）w_M ${f(m.wM)} | L ${f(m.L)}（门槛 ${f(g.Lstar)}） L₋₂₉ ${f(m.Lm29)} 逐段胜出 ${m.wins}/8 | ΔE ${f(m.dE)} 为正 ${m.posE}/8 | 非目标期对 M ${f(m.calmVsM * 100, 2)}pp 对 B0 ${f(m.calmVsB0 * 100, 2)}pp | ΔCER ${f(m.dCER * 100, 2)}pp | 年切换 ${f(m.switchesPerYear, 2)} 年换手 ${f(m.turnoverPerYear, 2)}`)
  console.log(`  子期 ${Object.entries(m.sub).map(([k, s]) => `${k} L ${f(s.L)} ΔE ${f(s.dE)}`).join(' | ')} | 0.30% 成本 L ${f(res[id].m30.L)} ΔE ${f(res[id].m30.dE)}`)
  console.log(`  逐段：${m.events.map(e => `${e.id} ${f(e.downC * 100, 1)}/${f(e.downM * 100, 1)} 全周期差 ${f(e.dE * 100, 1)}`).join(' | ')}`)
  console.log(`  安慰剂 p ${f(pRaw[id], 4)} Holm ${f(pHolm[id], 4)} | 夏普差 ${f(report[id].sharpeDiff.point)} [${f(report[id].sharpeDiff.lo90)}, ${f(report[id].sharpeDiff.hi90)}] | 门槛 ${JSON.stringify(g)}${id === 'C2' ? ' 附加 ' + res.C2.extra : ''} → ${res[id].verdict}`)
}
console.log('\nG8', JSON.stringify(report.G8, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v))
console.log('敏感性', JSON.stringify(sens, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v))
console.log('探索', JSON.stringify(explore, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v))
console.log('现金复核', JSON.stringify(report.cashCheck))
