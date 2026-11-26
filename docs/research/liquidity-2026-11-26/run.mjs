#!/usr/bin/env node
// L-033 流动性候选并入宏观攻守：按 PREREG.md 计算 Q1（实际 M2 增速）、Q2（美联储净流动性 13 周变化）。
// 参数化打分与收益口径复制自 docs/research/robustness-2026-11-25/run.mjs（页面月度口径）。
// 用法：node docs/research/liquidity-2026-11-26/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BREAKERS, COMPONENTS, PILLARS, TIERS, applyTactical, pillarScore, scoreComponent } from '../../../scripts/lib/macro-posture/model.mjs'
import { clean } from '../../../scripts/lib/macro-posture/panel.mjs'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const input = JSON.parse(readFileSync(here('../robustness-2026-11-25/inputs.json'), 'utf8'))
const LAG = 2
const EQUITY = Object.fromEntries(TIERS.map(t => [t.id, t.equityShare]))
const tierIndex = id => TIERS.findIndex(t => t.id === id)
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sampleVar = xs => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) }
const monthAfter = (d, k) => {
  const [y, m] = d.split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }

function perf(port, cash) {
  let w = 1; let peak = 1; let maxDd = 0
  for (const r of port) { w *= 1 + r; peak = Math.max(peak, w); maxDd = Math.min(maxDd, w / peak - 1) }
  const ex = port.map((r, i) => r - cash[i])
  return { months: port.length, cagr: w ** (12 / port.length) - 1, maxDd, sharpe: Math.sqrt(12) * mean(ex) / Math.sqrt(sampleVar(ex)) }
}

// ---------- FRED ----------
const fred = id => readFileSync(here(`./inputs/${id}.csv`), 'utf8').trim().split('\n').slice(1)
  .map(line => line.split(',')).filter(([, v]) => v !== '' && v !== '.').map(([d, v]) => [d, Number(v)])
const sha = Object.fromEntries(['M2SL', 'CPIAUCSL', 'WALCL', 'WTREGEN', 'RRPONTSYD'].map(id => [id, createHash('sha256').update(readFileSync(here(`./inputs/${id}.csv`))).digest('hex')]))
const byMonth = rows => new Map(rows.map(([d, v]) => [d.slice(0, 7), v]))

// Q1：观测月 m 在 m+1 月末可得 → 信号月 t 用观测月 t−1
const m2 = byMonth(fred('M2SL')); const cpi = byMonth(fred('CPIAUCSL'))
function q1At(t) {
  const m = monthAfter(t, -1); const p = monthAfter(m, -12)
  if (!m2.has(m) || !m2.has(p) || !cpi.has(m) || !cpi.has(p)) return null
  const value = (m2.get(m) / m2.get(p) - 1) * 100 - (cpi.get(m) / cpi.get(p) - 1) * 100
  return { value, score: value < 0 ? -1 : value > 4 ? 1 : 0 }
}

// Q2：周三数据（WALCL、WTREGEN 百万；RRP 日度十亿）；月末取当月最后一个周三，13 周前同为周三
const walcl = fred('WALCL'); const tga = new Map(fred('WTREGEN')); const rrpDaily = fred('RRPONTSYD')
const rrpAt = d => { let v = 0; for (const [x, y] of rrpDaily) { if (x > d) break; v = y } return v }
const netLiq = walcl.filter(([d]) => tga.has(d)).map(([d, v]) => [d, v - tga.get(d) - rrpAt(d) * 1000])
function q2At(t) {
  const end = lastDay(t)
  const idx = netLiq.findLastIndex(([d]) => d < end && d.slice(0, 7) === t) // 周三数据次日发布：月末前已发布的最后一个周三
  if (idx < 13) return null
  const value = (netLiq[idx][1] / netLiq[idx - 13][1] - 1) * 100
  return { value, score: value <= -2 ? -1 : value >= 2 ? 1 : 0 }
}

// ---------- 参数化打分（同 robustness / overfit-audit 的 evaluateWith，加入候选组件） ----------
const DEFAULT = { cutoffs: [TIERS[0].min, TIERS[1].min, TIERS[3].max, TIERS[4].max], weights: Object.fromEntries(PILLARS.map(p => [p.id, p.weight])) }
const compare = { '≥': (a, b) => a >= b, '≤': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '=': (a, b) => a === b }
function baseTierWith(score, [off, leanOff, leanDef, def]) {
  if (score == null) return null
  return TIERS[score >= off ? 0 : score >= leanOff ? 1 : score <= def ? 4 : score <= leanDef ? 3 : 2].id
}
function evaluateWith(frame, extra = []) {
  const scores = Object.fromEntries(COMPONENTS.map(def => [def.id, scoreComponent(def, frame.components[def.id])]))
  const pillars = Object.fromEntries(PILLARS.map(({ id }) => {
    const base = COMPONENTS.filter(d => d.pillar === id).map(d => scores[d.id])
    const add = id === 'liquidity' ? extra.map(f => f(frame.d)?.score).filter(s => s != null) : []
    return [id, pillarScore([...base, ...add])]
  }))
  const complete = pillars.growth != null && pillars.credit != null
  const known = PILLARS.filter(p => pillars[p.id] != null)
  const knownWeight = known.reduce((s, p) => s + DEFAULT.weights[p.id], 0)
  const R = complete ? clean(known.reduce((s, p) => s + DEFAULT.weights[p.id] / knownWeight * pillars[p.id], 0)) : null
  const baseline = baseTierWith(R, DEFAULT.cutoffs)
  const states = { ...pillars, sahm: scores.sahm }
  const active = BREAKERS.map(({ when }) => Object.entries(when).every(([key, [op, cutoff]]) => states[key] != null && compare[op](states[key], cutoff)))
  const regimeIndex = baseline == null ? -1 : Math.max(tierIndex(baseline), ...BREAKERS.map((b, i) => active[i] ? tierIndex(b.cap) : -1))
  const regime = TIERS[regimeIndex]?.id ?? null
  const tactical = applyTactical(regime, frame.below)
  const creditDelta = frame.components.nfciCredit?.delta
  const eligible = tierIndex(tactical) >= 3
  const missing = frame.below == null || !Number.isFinite(scores.baaChange) || !Number.isFinite(creditDelta)
  const repaired = eligible && !missing && frame.below === false && scores.baaChange >= 0 && creditDelta <= 0
  return repaired ? TIERS[tierIndex(tactical) - 1].id : tactical
}

const returns = new Map(input.returns.map(([d, spx, cash]) => [d, { spx, cash }]))
function run(extra, from = null) {
  const rows = []
  for (const f of input.realtime) {
    const tier = evaluateWith(f, extra)
    const r = returns.get(monthAfter(f.d, LAG))
    if (r?.cash == null || tier == null || f.below == null) continue
    rows.push({ d: f.d, ret: monthAfter(f.d, LAG), w: EQUITY[tier], spx: r.spx, cash: r.cash, tier })
  }
  const use = from ? rows.filter(r => r.ret >= from) : rows
  return use
}
const stats = rows => perf(rows.map(r => r.w * r.spx + (1 - r.w) * r.cash), rows.map(r => r.cash))

// ---------- 复现门槛 ----------
const pageTiers = new Map(JSON.parse(readFileSync(here('../macro-significance-2026-11-25/inputs.json'), 'utf8')).tiers)
const baseRows = run([])
const mismatch = input.realtime.filter(f => evaluateWith(f, []) !== pageTiers.get(f.d)).length + (input.realtime.length === 646 && pageTiers.size === 646 ? 0 : 1)
const full = stats(baseRows)
const page = input.pageVariants.find(v => v.id === 'full')
const repro = { tierMismatch: mismatch, dCagr: full.cagr - page.cagr, dMaxDd: full.maxDd - page.maxDd, dSharpe: full.sharpe - page.sharpe }
if (mismatch || Math.abs(repro.dCagr) >= 0.0005 || Math.abs(repro.dMaxDd) >= 0.0005 || Math.abs(repro.dSharpe) >= 0.0005) {
  console.error('复现失败', repro); process.exit(1)
}

// ---------- 候选 ----------
function firstSignal(f) { return input.realtime.find(fr => f(fr.d) != null)?.d ?? null }
function halvesFor(start) {
  const rows = baseRows.filter(r => !start || r.ret >= monthAfter(start, LAG))
  const mid = rows[Math.floor(rows.length / 2)].ret
  return [[rows[0].ret, monthAfter(mid, -1)], [mid, rows.at(-1).ret]]
}
function compareCand(extra, start, historyYears) {
  const cand = run(extra)
  const [h1, h2] = start && start > '1973-12' ? halvesFor(start) : [['1973-03', '1999-12'], ['2000-01', '2026-10']]
  const seg = (rows, [a, b]) => stats(rows.filter(r => r.ret >= a && r.ret <= b))
  const b1 = seg(baseRows, h1); const b2 = seg(baseRows, h2); const c1 = seg(cand, h1); const c2 = seg(cand, h2)
  const fb = stats(baseRows.filter(r => r.ret >= h1[0])); const fc = stats(cand.filter(r => r.ret >= h1[0])) // 全样本从候选起点算
  const dS = [c1.sharpe - b1.sharpe, c2.sharpe - b2.sharpe]
  const dDd = [c1.maxDd - b1.maxDd, c2.maxDd - b2.maxDd] // 正 = 更浅
  const both = dS[0] > 0 && dS[1] > 0
  const minImp = (dS[0] >= 0.01 && dS[1] >= 0.01) || (dDd[0] >= 0.02 && dDd[1] >= 0) || (dDd[1] >= 0.02 && dDd[0] >= 0)
  const ddOk = dDd[0] >= -0.01 && dDd[1] >= -0.01
  const cagrOk = fc.cagr - fb.cagr >= -0.003
  const longEnough = historyYears >= 25
  let verdict
  if (!ddOk || !cagrOk) verdict = '不采用'
  else if (both && minImp) verdict = longEnough ? '观察（达到采用条件 1–3，但未算衰退捕捉）' : '观察（历史不足 25 年）'
  else if (both && !minImp) verdict = '不采用'
  else if (dS[0] > 0 || dS[1] > 0) verdict = '观察'
  else verdict = '不采用'
  const baseByD = new Map(baseRows.map(r => [r.d, r.tier]))
  const changed = cand.filter(r => baseByD.has(r.d) && r.tier !== baseByD.get(r.d)).length
  return { halves: [h1, h2], base: [b1, b2], cand: [c1, c2], dSharpe: dS, dMaxDd: dDd, full: { base: fb, cand: fc }, checks: { both, minImp, ddOk, cagrOk, longEnough }, changedMonths: changed, verdict }
}

const q1Start = firstSignal(q1At); const q2Start = firstSignal(q2At)
// 同口径历史年数：数据起点月到 2026-10（两端都算）
const yearsSince = d => ((2026 * 12 + 10) - (Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))) + 1) / 12
const out = {
  study: 'L-033', inputSha256: sha, reproduction: repro,
  Q1: { start: q1Start, ...compareCand([q1At], q1Start, yearsSince(q1Start)) },
  Q2: { start: q2Start, ...compareCand([q2At], q2Start, yearsSince(q2Start)) },
  report: {
    both: compareCand([q1At, q2At], q1Start, yearsSince(q1Start)),
    q1Since2003: compareCand([q1At], q2Start, yearsSince(q2Start)),
    scoreShare: {
      Q1: Object.fromEntries([-1, 0, 1].map(s => [s, input.realtime.filter(f => q1At(f.d)?.score === s).length])),
      Q2: Object.fromEntries([-1, 0, 1].map(s => [s, input.realtime.filter(f => q2At(f.d)?.score === s).length])),
    },
    current: { Q1: q1At('2026-10'), Q2: q2At('2026-10') },
  },
}
writeFileSync(here('./results.json'), JSON.stringify(out, null, 2) + '\n')
for (const k of ['Q1', 'Q2']) {
  const r = out[k]
  console.log(k, r.verdict, '起点', r.start, '两段', r.halves.map(h => h.join('…')).join(' / '), 'Δ夏普', r.dSharpe.map(x => x.toFixed(3)), 'Δ回撤', r.dMaxDd.map(x => (x * 100).toFixed(2)), '全样本夏普', r.full.base.sharpe.toFixed(3), '→', r.full.cand.sharpe.toFixed(3), '年化', (r.full.base.cagr * 100).toFixed(2), '→', (r.full.cand.cagr * 100).toFixed(2), '改档月', r.changedMonths, r.checks)
}
console.log('合测', out.report.both.verdict, out.report.both.dSharpe.map(x => x.toFixed(3)), '| Q1 只用 2003 后', out.report.q1Since2003.dSharpe.map(x => x.toFixed(3)))
console.log('打分分布', out.report.scoreShare, '当前', out.report.current, '复现', repro)
