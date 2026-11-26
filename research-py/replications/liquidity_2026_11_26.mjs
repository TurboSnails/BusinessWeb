// L-033 流动性候选（Q1 实际 M2、Q2 美联储净流动性）独立第二实现。
// 只依据 docs/research/liquidity-2026-11-26/PREREG.md 编写，未读主实现 run.mjs / results.json。
//
// 运行（仓库根目录）：
//   node research-py/replications/liquidity_2026_11_26.mjs            # 打印人读摘要
//   node research-py/replications/liquidity_2026_11_26.mjs --json     # 额外打印完整 JSON
//
// 从生产代码 import 的只有规则本身：COMPONENTS / PILLARS / TIERS / BREAKERS / scoreComponent /
// pillarScore / applyTactical / clean。支柱 → 总分 → 分档 → 熔断 → 均线修正 → 修复确认在本文件重写。
//
// PREREG 没写死、这里做出的选择：
//  1. Q1：信号月 t（月末）取观测月 t−1（m 在 m+1 月末可得）；同比 = x[m]/x[m−12] − 1（%）；
//     实际 M2 = M2 同比 − CPI 同比；值先 clean() 到 1e−10；任一同比算不出（CPI 2025-10 缺值影响
//     观测月 2025-10 与 2026-10）→ 该信号月 Q1 为 null，不回退到更早读数。
//  2. Q2：净流动性 = WALCL − WTREGEN − 1000×RRPONTSYD（百万美元），按 WALCL 的周三日期计算；
//     RRPONTSYD 在该周三空白或无行 → 记 0（隔夜逆回购当日无操作即无余额；2003-02-07 之前无该序列，
//     按 PREREG「2002-12 起」也记 0）。敏感性另报「沿用此前最近一个非空值」与「该周剔除」两种。
//     13 周变化 = NL[w] / NL[w − 91 天] − 1（%），按日期精确对齐，缺则 null。
//     月末读数：当月最后一个满足 w + 1 天 ≤ 月末 的周三（周四发布，月末当天发布算已发布）；该周 null 则 null。
//  3. 加入方式：候选为「货币与流动性」新增组件；候选为 null 时该支柱按原 4 项计算（null 既不进均值，
//     也不进 pillarScore 的「至少一半有读数」分母）；另核对「5 项一起交给 pillarScore」是否有差别。
//  4. 评估区间：Q1 = 全部收益月 1973-03..2026-10，两段按收益月 1999-12/2000-01 切；
//     Q2、合测、Q1-只用2003后 = Q2 首个有读数的信号月 +2 起到 2026-10，按月数对半（奇数时前段少一个月）；
//     基准与候选在同一区间、同一切分上比较；每段净值从 1 起算。
//  5. 判定比较用未四舍五入的原始数值；「提高」= 严格大于；「不恶化」= 候选最大回撤 ≥ 基准最大回撤。
//     最小改善里「另一段不恶化」指另一段最大回撤不恶化。历史年数按候选数据起点（Q1 1960-01 起算到
//     2026-10，Q2 2002-12 起算）计算，阈值 25 年。
//  6. 改档月数：评估区间内（按信号月）最终档位与基准不同的月数。
//  7. 「E1 按日口径夏普」：本目录无日度收益输入，不计算。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENTS, PILLARS, TIERS, BREAKERS, scoreComponent, pillarScore, applyTactical } from '../../scripts/lib/macro-posture/model.mjs'
import { clean } from '../../scripts/lib/macro-posture/panel.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIR = path.join(ROOT, 'docs/research/liquidity-2026-11-26/inputs')
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/research/robustness-2026-11-25/inputs.json'), 'utf8'))
const PAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/research/macro-significance-2026-11-25/inputs.json'), 'utf8'))

// ---------- 小工具 ----------
const addMonths = (ym, k) => {
  const [y, m] = ym.split('-').map(Number)
  const n = y * 12 + (m - 1) + k
  return `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`
}
const addDaysIso = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10)
const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const sampleVar = xs => { if (xs.length < 2) return 0; const mu = mean(xs); return xs.reduce((s, x) => s + (x - mu) ** 2, 0) / (xs.length - 1) }
function readCsv(name) {
  return fs.readFileSync(path.join(DIR, name + '.csv'), 'utf8').trim().split('\n').slice(1).map(line => {
    const [d, v] = line.split(',')
    return [d, v === '' || v === '.' || v == null ? null : Number(v)]
  })
}
const tierIdx = id => TIERS.findIndex(t => t.id === id)

// ---------- 候选 Q1：实际 M2 同比 ----------
const monthly = name => new Map(readCsv(name).filter(([, v]) => v != null).map(([d, v]) => [d.slice(0, 7), v]))
const M2 = monthly('M2SL')
const CPI = monthly('CPIAUCSL')
const yoy = (map, m) => {
  const a = map.get(m); const b = map.get(addMonths(m, -12))
  return a != null && b != null ? (a / b - 1) * 100 : null
}
function realM2(obsMonth) {
  const g = yoy(M2, obsMonth); const p = yoy(CPI, obsMonth)
  return g == null || p == null ? null : clean(g - p)
}
const scoreQ1 = v => v == null ? null : v < 0 ? -1 : v > 4 ? 1 : 0
const q1Reading = signal => realM2(addMonths(signal, -1))

// ---------- 候选 Q2：净流动性 13 周变化 ----------
const WALCL = readCsv('WALCL'); const TGA = new Map(readCsv('WTREGEN')); const RRP = readCsv('RRPONTSYD')
const RRP_MAP = new Map(RRP)
function rrpOn(d, mode) {
  const v = RRP_MAP.get(d)
  if (v != null) return v
  if (mode === 'zero') return 0
  if (mode === 'drop') return null
  // locf：此前最近一个非空值；序列开始前记 0
  let last = 0
  for (const [day, x] of RRP) { if (day > d) break; if (x != null) last = x }
  return last
}
function netLiquidity(mode) {
  const nl = new Map()
  for (const [d, w] of WALCL) {
    const t = TGA.get(d); const r = rrpOn(d, mode)
    nl.set(d, w == null || t == null || r == null ? null : w - t - 1000 * r)
  }
  const chg = new Map()
  for (const [d, v] of nl) {
    const prev = nl.get(addDaysIso(d, -91))
    chg.set(d, v == null || prev == null || !(prev > 0) ? null : clean((v / prev - 1) * 100))
  }
  return chg
}
const scoreQ2 = v => v == null ? null : v <= -2 ? -1 : v >= 2 ? 1 : 0
function q2ReaderFor(mode) {
  const chg = netLiquidity(mode)
  const weds = [...chg.keys()].sort()
  return signal => {
    const end = lastDay(signal)
    let pick = null
    for (const w of weds) {
      if (w.slice(0, 7) !== signal) continue
      if (addDaysIso(w, 1) <= end) pick = w
    }
    return pick == null ? null : chg.get(pick)
  }
}

// ---------- v2.2 打分（重写 classify 的流程） ----------
const LIQ_BASE = COMPONENTS.filter(c => c.pillar === 'liquidity').map(c => c.id)
const cmp = { '≥': (a, b) => a >= b, '≤': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '=': (a, b) => a === b }

function finalTier(row, extraLiq = [], { naivePillar = false } = {}) {
  const c = row.components
  const scores = Object.fromEntries(COMPONENTS.map(def => [def.id, scoreComponent(def, c[def.id])]))
  const pillars = {}
  for (const { id } of PILLARS) {
    const base = COMPONENTS.filter(d => d.pillar === id).map(d => scores[d.id])
    if (id !== 'liquidity') { pillars[id] = pillarScore(base); continue }
    pillars[id] = naivePillar ? pillarScore([...base, ...extraLiq]) : pillarScore([...base, ...extraLiq.filter(s => s != null)])
  }
  // 总分：增长与信用都要有；已知支柱按权重归一
  if (pillars.growth == null || pillars.credit == null) return { tier: null, pillars, scores, R: null }
  const known = PILLARS.filter(p => pillars[p.id] != null)
  const W = known.reduce((s, p) => s + p.weight, 0)
  const R = clean(known.reduce((s, p) => s + p.weight / W * pillars[p.id], 0))
  let idx = R >= TIERS[0].min ? 0 : R >= TIERS[1].min ? 1 : R <= TIERS[4].max ? 4 : R <= TIERS[3].max ? 3 : 2
  // 熔断：取最严的上限
  const states = { ...pillars, sahm: scores.sahm }
  for (const b of BREAKERS) {
    const on = Object.entries(b.when).every(([k, [op, cut]]) => states[k] != null && cmp[op](states[k], cut))
    if (on) idx = Math.max(idx, tierIdx(b.cap))
  }
  // 均线修正
  const tactical = applyTactical(TIERS[idx].id, row.below)
  let ti = tierIdx(tactical)
  // 修复确认
  const creditDelta = c.nfciCredit?.delta
  if (ti >= 3 && row.below === false && Number.isFinite(scores.baaChange) && Number.isFinite(creditDelta)
      && scores.baaChange >= 0 && creditDelta <= 0) ti -= 1
  return { tier: TIERS[ti].id, pillars, scores, R }
}

// ---------- 收益与绩效 ----------
const RET = new Map(BASE.returns.map(([d, spx, cash]) => [d, { spx, cash }]))
const SHARE = Object.fromEntries(TIERS.map(t => [t.id, t.equityShare]))
const ROWS = BASE.realtime

function series(tiers) {
  // tiers: Map(signal month → tier)；返回按收益月排列的 {d, signal, r, cash, eq}
  const out = []
  for (const row of ROWS) {
    const d = addMonths(row.d, 2); const r = RET.get(d); const t = tiers.get(row.d)
    if (!r || r.cash == null || t == null) continue
    const eq = SHARE[t]
    out.push({ d, signal: row.d, r: r.spx * eq + r.cash * (1 - eq), cash: r.cash, eq })
  }
  return out
}
function perf(rows) {
  const rs = rows.map(x => x.r); const ex = rows.map(x => x.r - x.cash)
  let w = 1, peak = 1, dd = 0
  for (const r of rs) { w *= 1 + r; peak = Math.max(peak, w); dd = Math.min(dd, w / peak - 1) }
  const cagr = w ** (12 / rs.length) - 1
  const sv = Math.sqrt(sampleVar(ex))
  return { months: rs.length, from: rows[0].d, to: rows.at(-1).d, cagr, vol: Math.sqrt(12 * sampleVar(rs)), maxDd: dd,
    sharpe: sv ? Math.sqrt(12) * mean(ex) / sv : 0 }
}

// ---------- 基准与复现门槛 ----------
const baseTiers = new Map(ROWS.map(r => [r.d, finalTier(r).tier]))
const pageTiers = new Map(PAGE.tiers)
let matchPage = 0, matchPageFinal = 0
for (const r of ROWS) {
  if (baseTiers.get(r.d) === pageTiers.get(r.d)) matchPage++
  if (baseTiers.get(r.d) === r.pageFinal) matchPageFinal++
}
const baseSeries = series(baseTiers)
const baseFull = perf(baseSeries)
const pageFull = BASE.pageVariants.find(v => v.id === 'full')
const gateDiff = Object.fromEntries(['cagr', 'vol', 'maxDd', 'sharpe'].map(k => [k, Math.abs(baseFull[k] - pageFull[k])]))
const gate = {
  tiersMatchPage: `${matchPage}/${ROWS.length}`, tiersMatchPageFinal: `${matchPageFinal}/${ROWS.length}`,
  base: baseFull, page: pageFull, diff: gateDiff,
  pass: matchPage === ROWS.length && pageTiers.size === ROWS.length && Object.values(gateDiff).every(x => x < 0.0005),
}

// ---------- 候选读数 ----------
const READ = {
  q1: new Map(ROWS.map(r => [r.d, q1Reading(r.d)])),
  q2: new Map(), q2locf: new Map(), q2drop: new Map(),
}
for (const [key, mode] of [['q2', 'zero'], ['q2locf', 'locf'], ['q2drop', 'drop']]) {
  const reader = q2ReaderFor(mode)
  for (const r of ROWS) READ[key].set(r.d, reader(r.d))
}
const SCORE = {
  q1: d => scoreQ1(READ.q1.get(d)),
  q1post2003: d => d >= q2Start('q2') ? scoreQ1(READ.q1.get(d)) : null,
  q2: d => scoreQ2(READ.q2.get(d)), q2locf: d => scoreQ2(READ.q2locf.get(d)), q2drop: d => scoreQ2(READ.q2drop.get(d)),
}
function q2Start(key) { return ROWS.find(r => READ[key].get(r.d) != null)?.d }

// ---------- 判定 ----------
function verdict(b, c, years) {
  const [b1, b2] = b.halves; const [c1, c2] = c.halves
  const ddWorse1 = b1.maxDd - c1.maxDd; const ddWorse2 = b2.maxDd - c2.maxDd // >0 = 恶化
  const cagrDrop = b.full.cagr - c.full.cagr
  if (ddWorse1 > 0.01 || ddWorse2 > 0.01 || cagrDrop > 0.003) return { rule: 1, verdict: '不采用' }
  const up1 = c1.sharpe > b1.sharpe; const up2 = c2.sharpe > b2.sharpe
  if (up1 && up2) {
    const sharpeMin = c1.sharpe - b1.sharpe >= 0.01 && c2.sharpe - b2.sharpe >= 0.01
    const ddMin = (-ddWorse1 >= 0.02 && ddWorse2 <= 0) || (-ddWorse2 >= 0.02 && ddWorse1 <= 0)
    if (sharpeMin || ddMin) return { rule: 2, verdict: years >= 25 ? '观察（达到采用条件 1–3，但未算衰退捕捉）' : '观察（历史不足 25 年）' }
    return { rule: 3, verdict: '不采用' }
  }
  if (up1 || up2) return { rule: 4, verdict: '观察' }
  return { rule: 5, verdict: '不采用' }
}

const yearsFrom = startYm => { const [y, m] = startYm.split('-').map(Number); return (2026 * 12 + 10 - (y * 12 + m) + 1) / 12 }

function evaluate(label, keys, { start = null, splitAt = null, years, naivePillar = false } = {}) {
  const tiers = new Map(ROWS.map(r => [r.d, finalTier(r, keys.map(k => SCORE[k](r.d)), { naivePillar }).tier]))
  const pick = s => start ? s.filter(x => x.d >= start) : s
  const bs = pick(baseSeries); const cs = pick(series(tiers))
  if (bs.length !== cs.length || bs.some((x, i) => x.d !== cs[i].d)) throw new Error(label + ' 收益月不对齐')
  const cut = splitAt ?? bs[Math.floor(bs.length / 2)].d // 第二段起点
  const halves = s => [perf(s.filter(x => x.d < cut)), perf(s.filter(x => x.d >= cut))]
  const b = { full: perf(bs), halves: halves(bs) }
  const c = { full: perf(cs), halves: halves(cs) }
  const changed = bs.filter((x, i) => baseTiers.get(x.signal) !== tiers.get(cs[i].signal)).length
  const v = verdict(b, c, years)
  const delta = ['full', 0, 1].map(k => {
    const bb = k === 'full' ? b.full : b.halves[k]; const cc = k === 'full' ? c.full : c.halves[k]
    return { seg: k === 'full' ? 'full' : `half${k + 1}`, dCagr: cc.cagr - bb.cagr, dMaxDd: cc.maxDd - bb.maxDd, dSharpe: cc.sharpe - bb.sharpe, dVol: cc.vol - bb.vol }
  })
  return { label, keys, start: bs[0].d, end: bs.at(-1).d, secondHalfFrom: cut, years, changedMonths: changed, base: b, cand: c, delta, ...v }
}

const q2s = q2Start('q2')
const q2RetStart = addMonths(q2s, 2)
const results = {
  gate,
  choices: { q2FirstSignal: q2s, q2FirstReturn: q2RetStart },
  Q1: evaluate('Q1 实际 M2', ['q1'], { splitAt: '2000-01', years: yearsFrom('1960-01') }),
  Q2: evaluate('Q2 净流动性', ['q2'], { start: q2RetStart, years: yearsFrom('2002-12') }),
  reportOnly: {
    Q1Q2: evaluate('Q1+Q2 合测（Q2 区间）', ['q1', 'q2'], { start: q2RetStart, years: yearsFrom('2002-12') }),
    Q1Q2fullRange: evaluate('Q1+Q2 合测（1973 起全区间）', ['q1', 'q2'], { splitAt: '2000-01', years: yearsFrom('2002-12') }),
    Q1post2003: evaluate('Q1 只用 2003 年后（Q2 区间）', ['q1post2003'], { start: q2RetStart, years: yearsFrom('2002-12') }),
  },
  sensitivity: {
    Q2_rrpLocf: evaluate('Q2 RRP 空值沿用前值', ['q2locf'], { start: addMonths(q2Start('q2locf'), 2), years: yearsFrom('2002-12') }),
    Q2_rrpDrop: evaluate('Q2 RRP 空值该周剔除', ['q2drop'], { start: addMonths(q2Start('q2drop'), 2), years: yearsFrom('2002-12') }),
    Q1_naivePillar: evaluate('Q1（5 项一起交给 pillarScore）', ['q1'], { splitAt: '2000-01', years: yearsFrom('1960-01'), naivePillar: true }),
    Q2_naivePillar: evaluate('Q2（5 项一起交给 pillarScore）', ['q2'], { start: q2RetStart, years: yearsFrom('2002-12'), naivePillar: true }),
  },
}

// 打分分布（信号月，646 个月）与当前读数
function dist(key) {
  const o = { '-1': 0, '0': 0, '1': 0, null: 0 }
  for (const r of ROWS) o[String(SCORE[key](r.d))]++
  return o
}
results.distribution = { Q1: dist('q1'), Q2: dist('q2'), Q2_from: q2s }
// 当前读数：数据里最新可算的观测
const lastQ1Obs = [...M2.keys()].sort().reverse().find(m => realM2(m) != null)
const chgZero = netLiquidity('zero')
const lastWed = [...chgZero.keys()].sort().reverse().find(d => chgZero.get(d) != null)
results.current = {
  Q1: { observed: lastQ1Obs, m2Yoy: yoy(M2, lastQ1Obs), cpiYoy: yoy(CPI, lastQ1Obs), real: realM2(lastQ1Obs), score: scoreQ1(realM2(lastQ1Obs)),
    lastSignalMonth: ROWS.at(-1).d, lastSignalValue: READ.q1.get(ROWS.at(-1).d) },
  Q2: { observed: lastWed, change13w: chgZero.get(lastWed), score: scoreQ2(chgZero.get(lastWed)),
    lastSignalMonth: ROWS.at(-1).d, lastSignalValue: READ.q2.get(ROWS.at(-1).d) },
}
// 贴近阈值的读数（检查浮点敏感）
results.nearThreshold = {
  Q1: ROWS.filter(r => { const v = READ.q1.get(r.d); return v != null && (Math.abs(v) < 1e-6 || Math.abs(v - 4) < 1e-6) }).map(r => r.d),
  Q2: ROWS.filter(r => { const v = READ.q2.get(r.d); return v != null && (Math.abs(Math.abs(v) - 2) < 1e-6) }).map(r => r.d),
}

// ---------- 输出 ----------
const pct = x => (x * 100).toFixed(4)
const f4 = x => x.toFixed(4)
console.log('== 复现门槛 ==')
console.log(`档位与页面一致 ${gate.tiersMatchPage}（与 inputs.json pageFinal ${gate.tiersMatchPageFinal}）`)
console.log(`完整模型 年化 ${baseFull.cagr} 回撤 ${baseFull.maxDd} 夏普 ${baseFull.sharpe} 波动 ${baseFull.vol} 月数 ${baseFull.months} ${baseFull.from}..${baseFull.to}`)
console.log(`页面     年化 ${pageFull.cagr} 回撤 ${pageFull.maxDd} 夏普 ${pageFull.sharpe}`)
console.log('差', gateDiff, gate.pass ? '通过' : '未通过')
function show(e) {
  console.log(`\n== ${e.label} ==  收益月 ${e.start}..${e.end}，后段起 ${e.secondHalfFrom}，历史 ${e.years.toFixed(2)} 年，改档 ${e.changedMonths} 个月`)
  for (const [name, b, c] of [['全样本', e.base.full, e.cand.full], ['前段', e.base.halves[0], e.cand.halves[0]], ['后段', e.base.halves[1], e.cand.halves[1]]]) {
    console.log(`  ${name}(${b.months}m ${b.from}..${b.to}) 年化 ${pct(b.cagr)}→${pct(c.cagr)}  回撤 ${pct(b.maxDd)}→${pct(c.maxDd)}  夏普 ${f4(b.sharpe)}→${f4(c.sharpe)} (Δ ${(c.sharpe - b.sharpe).toFixed(5)})`)
  }
  console.log(`  判定：规则 ${e.rule} → ${e.verdict}`)
}
show(results.Q1); show(results.Q2)
console.log('\n---- 只报告 ----')
for (const e of Object.values(results.reportOnly)) show(e)
console.log('\n---- 敏感性（本实现的未写定选择） ----')
for (const e of Object.values(results.sensitivity)) show(e)
console.log('\n打分分布', JSON.stringify(results.distribution))
console.log('当前读数', JSON.stringify(results.current))
console.log('贴近阈值', JSON.stringify(results.nearThreshold))
if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 1))
