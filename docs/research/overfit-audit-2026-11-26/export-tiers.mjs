#!/usr/bin/env node
// L-028 过拟合审计：导出策略族的逐月档位矩阵 tiers.json（不计算任何业绩）。
// 参数化打分与扰动抽样逐字复制自 docs/research/robustness-2026-11-25/run.mjs（L-015），种子相同，
// 所以 P 族与 L-015 的 1,000 组随机扰动、55 种逐项扰动完全相同。
// 用法：node docs/research/overfit-audit-2026-11-26/export-tiers.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BREAKERS, COMPONENTS, PILLARS, TIERS, applyTactical, pillarScore, scoreComponent } from '../../../scripts/lib/macro-posture/model.mjs'
import { clean } from '../../../scripts/lib/macro-posture/panel.mjs'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const input = JSON.parse(readFileSync(here('../robustness-2026-11-25/inputs.json'), 'utf8'))
const pageTiers = new Map(JSON.parse(readFileSync(here('../macro-significance-2026-11-25/inputs.json'), 'utf8')).tiers)

const SEED = 20261125
const DRAWS = 1000
const tierIndex = id => TIERS.findIndex(t => t.id === id)
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
  return { final, regime, baseline, tactical }
}
function scaleComponent(def, k, shift) {
  const scaleBound = bound => {
    if (typeof bound === 'number') return def.id === 'baaLevel' ? Math.min(100, Math.max(0, bound + shift)) : bound === 0 ? 0 : bound * k
    if (bound && typeof bound === 'object') return { ...bound, offset: bound.offset * k }
    return bound
  }
  return { ...def, rules: def.rules.map(rule => ({ ...rule, any: rule.any.map(group => group.map(c => ({ ...c, bound: scaleBound(c.bound) }))) })) }
}

const frames = input.realtime
const months = frames.map(f => f.d)
// 档位编码：0–4 = TIERS 顺序（进攻…防守）；'x' = 缺失
const encode = pick => frames.map(f => { const t = pick(f); return t == null ? 'x' : String(tierIndex(t)) }).join('')
const configs = []
const add = (id, family, label, params) => configs.push({ id, family, label, tiers: encode(f => evaluateWith(f, params).final) })

// ---------- 复现门槛 ----------
const mismatch = frames.filter(f => evaluateWith(f).final !== pageTiers.get(f.d)).map(f => f.d)
if (mismatch.length || frames.length !== pageTiers.size) {
  console.error('档位复现失败：', mismatch.slice(0, 10), frames.length, pageTiers.size)
  process.exit(1)
}

// ---------- S 族 ----------
configs.push({ id: 'S0', family: 'S', label: '现行 v2.2（final）', tiers: encode(f => evaluateWith(f).final) })
configs.push({ id: 'S1', family: 'S', label: '只用宏观打分分档（baseline）', tiers: encode(f => evaluateWith(f).baseline) })
configs.push({ id: 'S2', family: 'S', label: '宏观 + 熔断（regime）', tiers: encode(f => evaluateWith(f).regime) })
configs.push({ id: 'S3', family: 'S', label: '宏观 + 熔断 + 均线修正（tactical）', tiers: encode(f => evaluateWith(f).tactical) })
// S4 用权重编码：'1' = 不破位 100%，'5' = 破位 50%（run.py 单独解释）
configs.push({ id: 'S4', family: 'S', label: '只用十个月均线（100% / 50%）', tiers: frames.map(f => (f.below == null ? 'x' : f.below ? '5' : '1')).join('') })

// ---------- P 族：现行 + 55 逐项 + 1,000 随机（与 L-015 顺序、种子一致） ----------
add('P0000', 'P', '现行参数', DEFAULT)
const shifts = [-0.10, -0.05, 0.05, 0.10]
let k = 0
const one = (label, params) => { k += 1; add(`O${String(k).padStart(2, '0')}`, 'P', label, params) }
for (const delta of shifts) one(`四条分界线一起 ${delta}`, { ...DEFAULT, cutoffs: DEFAULT.cutoffs.map(c => c + delta) })
for (let i = 0; i < 4; i += 1) for (const delta of shifts) one(`分界线${i} ${delta}`, { ...DEFAULT, cutoffs: DEFAULT.cutoffs.map((c, j) => j === i ? c + delta : c) })
for (const p of PILLARS) for (const m of [0.75, 1.25]) {
  const weights = { ...DEFAULT.weights, [p.id]: DEFAULT.weights[p.id] * m }
  const total = Object.values(weights).reduce((s, x) => s + x, 0)
  one(`${p.id} 权重 ×${m}`, { ...DEFAULT, weights: Object.fromEntries(Object.entries(weights).map(([key, x]) => [key, x / total])) })
}
one('四根支柱等权', { ...DEFAULT, weights: Object.fromEntries(PILLARS.map(p => [p.id, 0.25])) })
for (const def of COMPONENTS) for (const [kk, shift] of [[0.8, -10], [1.2, 10]]) {
  one(`${def.id} 阈值 ${kk}`, { ...DEFAULT, components: COMPONENTS.map(c => c.id === def.id ? scaleComponent(c, kk, shift) : c) })
}
const rng = mulberry32(SEED)
const uniform = (a, b) => a + (b - a) * rng()
let n = 0
while (n < DRAWS) {
  const cutoffs = DEFAULT.cutoffs.map(c => c + uniform(-0.10, 0.10))
  const components = COMPONENTS.map(c => scaleComponent(c, uniform(0.8, 1.2), uniform(-10, 10)))
  const raw = Object.fromEntries(PILLARS.map(p => [p.id, DEFAULT.weights[p.id] * uniform(0.75, 1.25)]))
  if (!(cutoffs[0] > cutoffs[1] && cutoffs[1] > cutoffs[2] && cutoffs[2] > cutoffs[3])) continue
  const total = Object.values(raw).reduce((s, x) => s + x, 0)
  n += 1
  add(`R${String(n).padStart(4, '0')}`, 'P', `随机扰动 ${n}`, { cutoffs, components, weights: Object.fromEntries(Object.entries(raw).map(([key, x]) => [key, x / total])) })
}

const tierOrder = TIERS.map(t => ({ id: t.id, equityShare: t.equityShare }))
writeFileSync(here('./tiers.json'), JSON.stringify({ note: 'L-028 策略族逐月档位；编码见 export-tiers.mjs', tiers: tierOrder, months, configs }) + '\n')
const oneCount = configs.filter(c => c.id.startsWith('O')).length
console.log(`档位复现 ${frames.length}/${pageTiers.size}；S 族 5 个，P 族 ${configs.filter(c => c.family === 'P').length} 个（逐项 ${oneCount}）`)
