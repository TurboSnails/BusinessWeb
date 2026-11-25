#!/usr/bin/env node
// 按 PREREG.md 执行四项稳健性检验（A 参数敏感性、B 1950–1972 留出、C 防守资产、D 投资者体验）。
// 只读本目录 inputs.json，结果写到 results.json。用法：node docs/research/robustness-2026-11-25/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BREAKERS, COMPONENTS, PILLARS, TIERS, applyTactical, pillarScore, scoreComponent } from '../../../scripts/lib/macro-posture/model.mjs'
import { clean } from '../../../scripts/lib/macro-posture/panel.mjs'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const raw = readFileSync(here('./inputs.json'), 'utf8')
const input = JSON.parse(raw)

const SEED = 20261125
const DRAWS = 1000
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
const quantile = (sorted, q) => {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos); const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
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
// 与 scripts/lib/macro-posture/backtest.mjs 的 performance 同口径
function perf(port, cash, weights = null) {
  let w = 1; let peak = 1; let maxDd = 0
  for (const r of port) { w *= 1 + r; peak = Math.max(peak, w); maxDd = Math.min(maxDd, w / peak - 1) }
  const ex = port.map((r, i) => r - cash[i])
  return {
    months: port.length, cagr: w ** (12 / port.length) - 1, vol: Math.sqrt(12 * sampleVar(port)), maxDd,
    sharpe: Math.sqrt(12) * mean(ex) / Math.sqrt(sampleVar(ex)), ...(weights ? { avgEquity: mean(weights) } : {}),
  }
}

// ---------- 参数化打分（结构与 scripts/lib/macro-posture/model.mjs 的 classify 相同） ----------
const DEFAULT = {
  cutoffs: [TIERS[0].min, TIERS[1].min, TIERS[3].max, TIERS[4].max],
  weights: Object.fromEntries(PILLARS.map(p => [p.id, p.weight])),
  components: COMPONENTS,
}
const compare = { '≥': (a, b) => a >= b, '≤': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '=': (a, b) => a === b }
function baseTierWith(score, [off, leanOff, leanDef, def]) {
  if (score == null) return null
  return TIERS[score >= off ? 0 : score >= leanOff ? 1 : score <= def ? 4 : score <= leanDef ? 3 : 2].id
}
function evaluateWith(frame, params = DEFAULT) {
  const defs = params.components
  const scores = Object.fromEntries(defs.map(def => [def.id, scoreComponent(def, frame.components[def.id])]))
  const pillars = Object.fromEntries(PILLARS.map(({ id }) => [id, pillarScore(defs.filter(d => d.pillar === id).map(d => scores[d.id]))]))
  const complete = pillars.growth != null && pillars.credit != null
  const known = PILLARS.filter(p => pillars[p.id] != null)
  const knownWeight = known.reduce((s, p) => s + params.weights[p.id], 0)
  const R = complete ? clean(known.reduce((s, p) => s + params.weights[p.id] / knownWeight * pillars[p.id], 0)) : null
  const baseline = baseTierWith(R, params.cutoffs)
  const states = { ...pillars, sahm: scores.sahm }
  const active = BREAKERS.map(({ when }) => Object.entries(when).every(([key, [op, cutoff]]) => states[key] != null && compare[op](states[key], cutoff)))
  const regimeIndex = baseline == null ? -1 : Math.max(tierIndex(baseline), ...BREAKERS.map((b, i) => active[i] ? tierIndex(b.cap) : -1))
  const regime = TIERS[regimeIndex]?.id ?? null
  const below = frame.below
  const tactical = applyTactical(regime, below)
  const creditDelta = frame.components.nfciCredit?.delta
  const eligible = tierIndex(tactical) >= 3
  const missing = below == null || !Number.isFinite(scores.baaChange) || !Number.isFinite(creditDelta)
  const repaired = eligible && !missing && below === false && scores.baaChange >= 0 && creditDelta <= 0
  const final = repaired ? TIERS[tierIndex(tactical) - 1].id : tactical
  return { final, regime, R, pillars, inflationSqueeze: active[BREAKERS.findIndex(b => b.id === 'inflationSqueeze')] }
}

// 阈值缩放：数值阈值 ×k（为 0 的不变）；百分位阈值加 shift；相对偏移同样 ×k
function scaleComponent(def, k, shift) {
  const scaleBound = bound => {
    if (typeof bound === 'number') return def.id === 'baaLevel' ? Math.min(100, Math.max(0, bound + shift)) : bound === 0 ? 0 : bound * k
    if (bound && typeof bound === 'object') return { ...bound, offset: bound.offset * k }
    return bound
  }
  return { ...def, rules: def.rules.map(rule => ({ ...rule, any: rule.any.map(group => group.map(c => ({ ...c, bound: scaleBound(c.bound) }))) })) }
}

// ---------- 数据对齐 ----------
const returns = new Map(input.returns.map(([d, spx, cash]) => [d, { spx, cash }]))
function series(frames, tiersOf, lag = LAG) {
  const rows = []
  for (const frame of frames) {
    const tier = tiersOf(frame)
    const r = returns.get(monthAfter(frame.d, lag))
    if (r?.cash == null || tier == null || frame.below == null) continue
    rows.push({ d: frame.d, ret: monthAfter(frame.d, lag), tier, spx: r.spx, cash: r.cash, trendW: frame.below ? 0.5 : 1 })
  }
  return rows
}
const STRATS = { strategy: row => EQUITY[row.tier], static70: () => 0.7, buyhold: () => 1, trend: row => row.trendW }
function evaluateRows(rows, sleeve = row => row.cash) {
  const cash = rows.map(r => r.cash)
  return Object.fromEntries(Object.entries(STRATS).map(([id, f]) => {
    const w = rows.map(f)
    const port = rows.map((r, i) => w[i] * r.spx + (1 - w[i]) * sleeve(r))
    return [id, { ...perf(port, cash, w), port }]
  }))
}
const strip = out => Object.fromEntries(Object.entries(out).map(([id, { port, ...rest }]) => [id, rest]))

// ---------- 复现门槛 ----------
const realtime = input.realtime
const defaultFinal = new Map(realtime.map(f => [f.d, evaluateWith(f).final]))
const tierMismatch = realtime.filter(f => defaultFinal.get(f.d) !== f.pageFinal).map(f => f.d)
const baseRows = series(realtime, f => defaultFinal.get(f.d))
const base = evaluateRows(baseRows)
const pageId = { strategy: 'full', static70: 'static70', buyhold: 'buyhold', trend: 'trend' }
const reproduction = Object.fromEntries(Object.keys(STRATS).map(id => {
  const page = input.pageVariants.find(v => v.id === pageId[id])
  const diff = { cagr: base[id].cagr - page.cagr, maxDd: base[id].maxDd - page.maxDd, sharpe: base[id].sharpe - page.sharpe }
  return [id, { diff, ok: Object.values(diff).every(x => Math.abs(x) < 0.0005) }]
}))
if (tierMismatch.length || !Object.values(reproduction).every(r => r.ok)) {
  console.error('复现失败，停止：', tierMismatch.slice(0, 10), JSON.stringify(reproduction))
  process.exit(1)
}
const static70 = base.static70

// ---------- A. 参数敏感性 ----------
const runParams = params => {
  const out = evaluateRows(series(realtime, f => evaluateWith(f, params).final))
  const s = out.strategy
  return { cagr: s.cagr, maxDd: s.maxDd, sharpe: s.sharpe, avgEquity: s.avgEquity }
}
const oneAtATime = []
const shifts = [-0.10, -0.05, 0.05, 0.10]
for (const delta of shifts) oneAtATime.push({ kind: 'cutoffs-all', label: `四条分界线一起 ${delta > 0 ? '+' : ''}${delta}`, ...runParams({ ...DEFAULT, cutoffs: DEFAULT.cutoffs.map(c => c + delta) }) })
const cutoffNames = ['进攻线 0.50', '偏进攻线 0.15', '偏防守线 −0.25', '防守线 −0.75']
for (let i = 0; i < 4; i += 1) for (const delta of shifts) {
  const cutoffs = DEFAULT.cutoffs.map((c, j) => j === i ? c + delta : c)
  oneAtATime.push({ kind: 'cutoff', label: `${cutoffNames[i]} ${delta > 0 ? '+' : ''}${delta}`, ...runParams({ ...DEFAULT, cutoffs }) })
}
for (const p of PILLARS) for (const m of [0.75, 1.25]) {
  const weights = { ...DEFAULT.weights, [p.id]: DEFAULT.weights[p.id] * m }
  const total = Object.values(weights).reduce((s, x) => s + x, 0)
  oneAtATime.push({ kind: 'weight', label: `${p.title}权重 ×${m}`, ...runParams({ ...DEFAULT, weights: Object.fromEntries(Object.entries(weights).map(([k, x]) => [k, x / total])) }) })
}
oneAtATime.push({ kind: 'weight', label: '四根支柱等权', ...runParams({ ...DEFAULT, weights: Object.fromEntries(PILLARS.map(p => [p.id, 0.25])) }) })
for (const def of COMPONENTS) for (const [k, shift, tag] of [[0.8, -10, '收紧'], [1.2, 10, '放宽']]) {
  const components = COMPONENTS.map(c => c.id === def.id ? scaleComponent(c, k, shift) : c)
  oneAtATime.push({ kind: 'component', label: `${def.label}阈值 ${def.id === 'baaLevel' ? (shift > 0 ? '+10 点' : '−10 点') : '×' + k}`, tag, ...runParams({ ...DEFAULT, components }) })
}

const rng = mulberry32(SEED)
const uniform = (a, b) => a + (b - a) * rng()
const draws = []
while (draws.length < DRAWS) {
  const cutoffs = DEFAULT.cutoffs.map(c => c + uniform(-0.10, 0.10))
  const components = COMPONENTS.map(c => scaleComponent(c, uniform(0.8, 1.2), uniform(-10, 10)))
  const raw = Object.fromEntries(PILLARS.map(p => [p.id, DEFAULT.weights[p.id] * uniform(0.75, 1.25)]))
  if (!(cutoffs[0] > cutoffs[1] && cutoffs[1] > cutoffs[2] && cutoffs[2] > cutoffs[3])) continue
  const total = Object.values(raw).reduce((s, x) => s + x, 0)
  draws.push(runParams({ cutoffs, components, weights: Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, x / total])) }))
}
const ddBar = static70.maxDd + 0.10
const both = draws.filter(d => d.sharpe > static70.sharpe && d.maxDd >= ddBar).length / DRAWS
const sortedSharpe = draws.map(d => d.sharpe).sort((a, b) => a - b)
const prodPct = draws.filter(d => d.sharpe < base.strategy.sharpe).length / DRAWS
const verdictA = prodPct >= 0.95 || both < 0.5 ? '尖峰' : both >= 0.8 && prodPct < 0.9 ? '高原' : '介于两者之间'
const dist = key => {
  const xs = draws.map(d => d[key]).sort((a, b) => a - b)
  return { p5: quantile(xs, 0.05), p25: quantile(xs, 0.25), median: quantile(xs, 0.5), p75: quantile(xs, 0.75), p95: quantile(xs, 0.95), min: xs[0], max: xs.at(-1) }
}
const A = {
  production: { cagr: base.strategy.cagr, maxDd: base.strategy.maxDd, sharpe: base.strategy.sharpe },
  static70: { sharpe: static70.sharpe, maxDd: static70.maxDd, ddBar },
  oneAtATime,
  random: {
    draws: DRAWS, seed: SEED, shareBoth: both,
    shareSharpeAboveStatic70: draws.filter(d => d.sharpe > static70.sharpe).length / DRAWS,
    shareDdBar: draws.filter(d => d.maxDd >= ddBar).length / DRAWS,
    productionSharpePercentile: prodPct,
    sharpe: dist('sharpe'), cagr: dist('cagr'), maxDd: dist('maxDd'),
  },
  verdict: verdictA,
}

// ---------- B. 1950–1972 留出 ----------
const holdout = input.holdout
const holdoutTier = new Map(holdout.map(f => [f.d, evaluateWith(f)]))
function window(from, to) {
  const frames = holdout.filter(f => f.d >= from && f.d <= to)
  const rows = series(frames, f => holdoutTier.get(f.d).final)
  const out = evaluateRows(rows)
  const counts = Object.fromEntries(TIERS.map(t => [t.id, rows.filter(r => r.tier === t.id).length]))
  const fwd = Object.fromEntries(TIERS.map(t => {
    const xs = rows.filter(r => r.tier === t.id).map(r => {
      const rs = Array.from({ length: 12 }, (_, i) => returns.get(monthAfter(r.d, LAG + i))?.spx)
      return rs.every(x => x != null) ? rs.reduce((w, x) => w * (1 + x), 1) - 1 : null
    }).filter(x => x != null)
    return [t.id, xs.length ? { months: xs.length, mean: mean(xs), negShare: xs.filter(x => x < 0).length / xs.length } : null]
  }))
  return { from: rows[0]?.d, to: rows.at(-1)?.d, months: rows.length, perf: strip(out), tierMonths: counts, forward12: fwd, switches: rows.filter((r, i) => i > 0 && r.tier !== rows[i - 1].tier).length }
}
const primary = window('1959-09', '1972-12')
const secondary = window('1950-01', '1972-12')
const ps = primary.perf
const verdictB = ps.strategy.sharpe >= ps.static70.sharpe && ps.strategy.maxDd >= 0.7 * ps.static70.maxDd ? '方向一致'
  : ps.strategy.sharpe < ps.static70.sharpe && ps.strategy.maxDd <= ps.static70.maxDd ? '方向相反' : '好坏参半'
const B = { primary, secondary, verdict: verdictB }

// ---------- C. 防守资产 ----------
const gs5 = new Map(input.gs5)
function bondReturn(m) {
  const y0 = gs5.get(monthAfter(m, -1)); const y1 = gs5.get(m)
  if (y0 == null || y1 == null) return null
  const c = y0 / 100; const y = y1 / 100; const N = 2 * 59 / 12
  const price = (c / y) * (1 - (1 + y / 2) ** -N) + (1 + y / 2) ** -N
  return price - 1 + c / 12
}
const sleeveRows = baseRows.map(r => {
  const info = evaluateWith(realtime.find(f => f.d === r.d))
  return { ...r, bond: bondReturn(r.ret), inflationOff: (info.pillars.inflation != null && info.pillars.inflation <= -1) || info.inflationSqueeze }
})
if (sleeveRows.some(r => r.bond == null)) throw new Error('GS5 缺月')
const SLEEVES = {
  S0: r => r.cash,
  S1: r => r.bond,
  S2: r => 0.5 * r.cash + 0.5 * r.bond,
  S3: r => (r.inflationOff ? r.cash : r.bond),
}
const segment = (rows, from, to) => rows.filter(r => r.d >= from && r.d <= to)
const C = { bondCheck: {}, sleeves: {} }
for (const [y, label] of [['1994', '1994'], ['2022', '2022'], ['2008', '2008']]) {
  const xs = sleeveRows.filter(r => r.ret.startsWith(y)).map(r => r.bond)
  C.bondCheck[label] = xs.reduce((w, x) => w * (1 + x), 1) - 1
}
for (const [id, sleeve] of Object.entries(SLEEVES)) {
  const pick = rows => { const o = evaluateRows(rows, sleeve); return { strategy: strip(o).strategy, static70: strip(o).static70 } }
  C.sleeves[id] = {
    full: pick(sleeveRows),
    early: pick(segment(sleeveRows, '1973-01', '1999-12')),
    late: pick(segment(sleeveRows, '2000-01', '2026-12')),
    rising: pick(segment(sleeveRows, '1973-01', '1981-12')),
    cashMonthsShare: id === 'S3' ? sleeveRows.filter(r => r.inflationOff).length / sleeveRows.length : undefined,
  }
}
const s0 = C.sleeves.S0
C.verdicts = Object.fromEntries(['S1', 'S3'].map(id => {
  const s = C.sleeves[id]
  const ok = s.early.strategy.sharpe > s0.early.strategy.sharpe && s.late.strategy.sharpe > s0.late.strategy.sharpe
    && s.early.strategy.maxDd >= s0.early.strategy.maxDd && s.late.strategy.maxDd >= s0.late.strategy.maxDd
    && s.rising.strategy.cagr >= s0.rising.strategy.cagr - 0.01
  return [id, ok ? '值得作为做法考虑' : '不采用，维持现金']
}))

// ---------- D. 投资者体验 ----------
const ports = { strategy: base.strategy.port, static70: base.static70.port, buyhold: base.buyhold.port }
const cashSeries = baseRows.map(r => r.cash)
const months = baseRows.map(r => r.ret)
function rolling(len) {
  const out = { len, windows: 0, vsStatic70: { cagr: 0, sharpe: 0, maxDd: 0 }, vsBuyhold: { cagr: 0, sharpe: 0, maxDd: 0 }, worstGap: {} }
  let worst70 = { gap: Infinity }; let worstBh = { gap: Infinity }
  for (let i = 0; i + len <= months.length; i += 1) {
    const slice = id => perf(ports[id].slice(i, i + len), cashSeries.slice(i, i + len))
    const s = slice('strategy'); const c = slice('static70'); const b = slice('buyhold')
    out.windows += 1
    for (const [key, other] of [['vsStatic70', c], ['vsBuyhold', b]]) {
      out[key].cagr += s.cagr > other.cagr; out[key].sharpe += s.sharpe > other.sharpe; out[key].maxDd += s.maxDd > other.maxDd
    }
    if (s.cagr - c.cagr < worst70.gap) worst70 = { gap: s.cagr - c.cagr, from: months[i], to: months[i + len - 1] }
    if (s.cagr - b.cagr < worstBh.gap) worstBh = { gap: s.cagr - b.cagr, from: months[i], to: months[i + len - 1] }
  }
  for (const key of ['vsStatic70', 'vsBuyhold']) for (const m of ['cagr', 'sharpe', 'maxDd']) out[key][m] /= out.windows
  out.worstGap = { static70: worst70, buyhold: worstBh }
  return out
}
function relativeDrawdown(a, b) {
  let ratio = 1; let peak = 1; let peakAt = null; let worst = { depth: 0 }
  let current = null
  const spells = []
  for (let i = 0; i < a.length; i += 1) {
    ratio *= (1 + a[i]) / (1 + b[i])
    if (ratio >= peak) {
      if (current) { spells.push({ ...current, recovered: months[i], months: i - current.startIndex }); current = null }
      peak = ratio; peakAt = i
    } else {
      if (!current) current = { from: months[peakAt ?? 0], startIndex: peakAt ?? 0 }
      const depth = ratio / peak - 1
      if (depth < worst.depth) worst = { depth, peak: months[peakAt ?? 0], trough: months[i] }
    }
  }
  if (current) spells.push({ ...current, recovered: null, months: a.length - 1 - current.startIndex })
  const longest = spells.reduce((x, y) => (y.months > (x?.months ?? -1) ? y : x), null)
  return { worst, longest: longest && { from: longest.from, recovered: longest.recovered, months: longest.months } }
}
const D = {
  rolling: { y5: rolling(60), y10: rolling(120) },
  relative: { vsStatic70: relativeDrawdown(ports.strategy, ports.static70), vsBuyhold: relativeDrawdown(ports.strategy, ports.buyhold) },
  delay: [0, 1, 2, 3].map(k => {
    const rows = series(realtime, f => defaultFinal.get(f.d), LAG + k)
    const s = evaluateRows(rows).strategy
    return { extraMonths: k, cagr: s.cagr, maxDd: s.maxDd, sharpe: s.sharpe }
  }),
}

const results = {
  prereg: 'docs/research/robustness-2026-11-25/PREREG.md（fd81a539，计算前）',
  inputSha256: createHash('sha256').update(raw).digest('hex'),
  reproduction: { tiers: `${realtime.length - tierMismatch.length}/${realtime.length}`, perf: reproduction },
  A, B, C, D,
}
writeFileSync(here('./results.json'), JSON.stringify(results, null, 2) + '\n')

const pct = x => `${(x * 100).toFixed(2)}%`
console.log(`复现：档位 ${results.reproduction.tiers}，业绩差异均 < 0.0005`)
console.log(`\nA 参数敏感性：${verdictA}。同时满足两条的随机组 ${pct(both)}；现行夏普 ${base.strategy.sharpe.toFixed(3)} 位于第 ${(prodPct * 100).toFixed(1)} 百分位；随机夏普中位 ${A.random.sharpe.median.toFixed(3)}（5%–95%：${A.random.sharpe.p5.toFixed(3)}–${A.random.sharpe.p95.toFixed(3)}），回撤中位 ${pct(A.random.maxDd.median)}（5%–95%：${pct(A.random.maxDd.p5)}–${pct(A.random.maxDd.p95)}）`)
const worstOne = [...oneAtATime].sort((a, b) => a.sharpe - b.sharpe).slice(0, 5).map(o => `${o.label} ${o.sharpe.toFixed(3)}/${pct(o.maxDd)}`)
const bestOne = [...oneAtATime].sort((a, b) => b.sharpe - a.sharpe).slice(0, 3).map(o => `${o.label} ${o.sharpe.toFixed(3)}/${pct(o.maxDd)}`)
console.log('  逐项最差：', worstOne.join('；')); console.log('  逐项最好：', bestOne.join('；'))
console.log(`\nB 留出：${verdictB}`)
for (const [name, w] of [['主窗口', primary], ['次窗口', secondary]]) {
  console.log(`  ${name} ${w.from}–${w.to}（${w.months} 个月，换档 ${w.switches} 次）`, Object.entries(w.perf).map(([id, r]) => `${id} ${pct(r.cagr)}/${pct(r.maxDd)}/${r.sharpe.toFixed(3)}`).join('；'))
  console.log('    档位月数', JSON.stringify(w.tierMonths), '之后12月', JSON.stringify(Object.fromEntries(Object.entries(w.forward12).map(([k, v]) => [k, v && `${v.months}/${pct(v.mean)}/${pct(v.negShare)}`]))))
}
console.log(`\nC 防守资产：国债核对 1994 ${pct(C.bondCheck['1994'])}，2008 ${pct(C.bondCheck['2008'])}，2022 ${pct(C.bondCheck['2022'])}；结论 ${JSON.stringify(C.verdicts)}`)
for (const [id, s] of Object.entries(C.sleeves)) {
  console.log(`  ${id} 全 ${pct(s.full.strategy.cagr)}/${pct(s.full.strategy.maxDd)}/${s.full.strategy.sharpe.toFixed(3)}（七成 ${s.full.static70.sharpe.toFixed(3)}）｜前 ${s.early.strategy.sharpe.toFixed(3)}/${pct(s.early.strategy.maxDd)}｜后 ${s.late.strategy.sharpe.toFixed(3)}/${pct(s.late.strategy.maxDd)}｜73–81 ${pct(s.rising.strategy.cagr)}`)
}
console.log('\nD 滚动窗口', JSON.stringify(D.rolling, (k, v) => typeof v === 'number' ? Number(v.toFixed(4)) : v))
console.log('  相对回撤', JSON.stringify(D.relative, (k, v) => typeof v === 'number' ? Number(v.toFixed(4)) : v))
console.log('  信号延迟', D.delay.map(x => `+${x.extraMonths} ${pct(x.cagr)}/${pct(x.maxDd)}/${x.sharpe.toFixed(3)}`).join('；'))
