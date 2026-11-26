#!/usr/bin/env node
// 从 results.json 抽出「研究中」页签要展示的数字，写到 src/features/strategy-lab/data/defensive-tilt.json。
// 用法：node docs/research/defensive-tilt-2026-11-26/export-ui.mjs（先跑 run.mjs）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const r = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))
const STAT_KEYS = ['cagr', 'vol', 'sharpe', 'maxDd']

const portfolio = id => {
  const p = r.results[id]
  return {
    label: p.label,
    turnoverPerYear: p.turnoverPerYear,
    main: {
      S: pick(p.main.S, STAT_KEYS),
      Mstar: pick(p.main.Mstar, STAT_KEYS),
      L: p.main.L,
      trackingError: p.main.trackingError,
      worstRolling36: p.main.worstRolling36,
      events: p.main.events,
    },
    halves: p.halves.map(h => ({ S: h.S.sharpe, M: h.M.sharpe })),
    later: {
      '1973-2026': { S: p.later['1973-2026'].S.sharpe, M: p.later['1973-2026'].M.sharpe, worstRolling36: p.later['1973-2026'].worstRolling36 },
      '2012-2026': { S: p.later['2012-2026'].S.sharpe, M: p.later['2012-2026'].M.sharpe },
    },
    veto: { base: p.veto.base.sharpe, tilt: p.veto.tilt.sharpe, sumBase: p.veto.sumBase, sumTilt: p.veto.sumTilt, vetoed: p.veto.vetoed },
    boot: pick(p.boot, ['point', 'low', 'high', 'holm']),
    gate: p.gate,
    verdict: p.verdict ?? null,
  }
}

const out = {
  generatedFrom: 'docs/research/defensive-tilt-2026-11-26/results.json',
  ledger: r.ledger,
  pick: r.pick,
  months: r.results.P1.main.S.months,
  market: pick(r.results.P1.main.M, STAT_KEYS),
  P1: portfolio('P1'),
  P2: portfolio('P2'),
}
const target = here('../../../src/features/strategy-lab/data/defensive-tilt.json')
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(`写入 ${target}`)
