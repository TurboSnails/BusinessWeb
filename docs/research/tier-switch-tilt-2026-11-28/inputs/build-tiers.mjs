#!/usr/bin/env node
// L-041 输入：用生产模型算出 1950–1972 留出档位与 1973 年后实时档位，并抽出现金收益，写到 tiers.json。
// 打分逻辑逐行照搬 docs/research/robustness-2026-11-25/run.mjs 的 evaluateWith（默认参数）。
// 用法：node docs/research/tier-switch-tilt-2026-11-28/inputs/build-tiers.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BREAKERS, COMPONENTS, PILLARS, TIERS, applyTactical, pillarScore, scoreComponent } from '../../../../scripts/lib/macro-posture/model.mjs'
import { clean } from '../../../../scripts/lib/macro-posture/panel.mjs'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const rob = JSON.parse(readFileSync(here('../../robustness-2026-11-25/inputs.json'), 'utf8'))
const macro = JSON.parse(readFileSync(here('../../macro-significance-2026-11-25/inputs.json'), 'utf8'))

const tierIndex = id => TIERS.findIndex(t => t.id === id)
const DEFAULT = { cutoffs: [TIERS[0].min, TIERS[1].min, TIERS[3].max, TIERS[4].max], weights: Object.fromEntries(PILLARS.map(p => [p.id, p.weight])), components: COMPONENTS }
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
  return repaired ? TIERS[tierIndex(tactical) - 1].id : tactical
}

const mismatch = rob.realtime.filter(f => evaluateWith(f) !== f.pageFinal).map(f => f.d)
if (mismatch.length) { console.error('实时档位复现失败：', mismatch.slice(0, 10)); process.exit(1) }
const holdout = rob.holdout.map(f => [f.d, evaluateWith(f)])
const realtime = rob.realtime.map(f => [f.d, f.pageFinal])
const cash = macro.returns.filter(r => r[2] != null).map(([d, , c]) => [d, c])
const count = (rows, lo, hi) => Object.fromEntries(TIERS.map(t => [t.id, rows.filter(([d, x]) => d >= lo && d <= hi && x === t.id).length]))
const out = {
  note: 'holdout：1950–1972 留出读数按生产模型算出的最终档位（规则未在这段调参）；realtime：1973 年起页面档位（已逐月复现）；cash：3 个月国库券月收益。',
  reproduced: `${rob.realtime.length}/${rob.realtime.length}`,
  equityShare: Object.fromEntries(TIERS.map(t => [t.id, t.equityShare])),
  counts: { main: count(holdout, '1959-09', '1972-12'), secondary: count(holdout, '1950-01', '1972-12'), veto: count(realtime, '1973-01', '2026-08') },
  holdout, realtime, cash,
}
writeFileSync(here('./tiers.json'), JSON.stringify(out) + '\n')
console.log('复现', out.reproduced, JSON.stringify(out.counts), JSON.stringify(out.equityShare), 'null 档位', holdout.filter(([, x]) => x == null).map(([d]) => d).slice(0, 5))
