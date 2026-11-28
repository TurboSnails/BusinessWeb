#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const main = JSON.parse(readFileSync(here('../results.json'), 'utf8'))
const replication = JSON.parse(readFileSync(here('./results.json'), 'utf8'))
const internal = JSON.parse(readFileSync(here('./internal-results.json'), 'utf8'))
const deterministic = []
const structural = []
const randomEvaluations = []
const ignored = new Set(['meta.impl', 'verdict.firstSentence'])
const randomN = {
  'K2.placebo.pDeltaCer': () => main.K2.placebo.N,
  'K2.placebo.pMeanDailyExcessDiff': () => main.K2.placebo.N,
  'K2.placebo.conditionalP': () => main.K2.placebo.conditional?.N ?? 5000,
  'K2.placebo.conditional.p': () => main.K2.placebo.conditional?.N ?? 5000,
  'report.holm.pK1': () => 10000,
  'report.holm.pK2': () => main.K2.placebo.N,
  'report.holm.adjusted.pK1': () => 10000,
  'report.holm.adjusted.pK2': () => main.K2.placebo.N,
}

function compare(a, b, path = '') {
  if (ignored.has(path)) return
  if (typeof a === 'number' && typeof b === 'number') {
    const difference = Math.abs(a - b)
    if (randomN[path]) {
      const N = randomN[path]()
      const pBar = (a + b) / 2
      const tolerance = 3 * Math.sqrt(pBar * (1 - pBar) / N) + 1 / N
      randomEvaluations.push({ path, main: a, replication: b, difference, N, tolerance, pass: difference <= tolerance })
    } else if (difference > 1e-8) {
      deterministic.push({ path, main: a, replication: b, difference })
    }
    return
  }
  if (a === null || b === null || a === undefined || b === undefined) {
    if (a !== b) structural.push({ path, main: a, replication: b })
    return
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      structural.push({ path, mainType: Array.isArray(a) ? 'array' : typeof a, replicationType: Array.isArray(b) ? 'array' : typeof b })
      return
    }
    if (a.length !== b.length) structural.push({ path: `${path}.length`, main: a.length, replication: b.length })
    if (a.every(row => row && typeof row === 'object' && typeof row.date === 'string') && b.every(row => row && typeof row === 'object' && typeof row.date === 'string')) {
      const byDateA = new Map(a.map(row => [row.date, row]))
      const byDateB = new Map(b.map(row => [row.date, row]))
      const dates = [...new Set([...byDateA.keys(), ...byDateB.keys()])].sort()
      for (const date of dates) compare(byDateA.get(date), byDateB.get(date), `${path}[${date}]`)
    } else {
      for (let i = 0; i < Math.max(a.length, b.length); i += 1) compare(a[i], b[i], `${path}[${i}]`)
    }
    return
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
      if (key === 'exposure' && Object.hasOwn(a, 'exposureAfter')) continue
      const mapped = key === 'exposureAfter' ? 'exposure' : key
      compare(a[mapped], b[key], path ? `${path}.${mapped}` : mapped)
    }
    return
  }
  if (a !== b) structural.push({ path, main: a, replication: b })
}
compare(main, replication)
deterministic.sort((a, b) => b.difference - a.difference)
randomEvaluations.sort((a, b) => Number(a.pass) - Number(b.pass) || b.difference - a.difference)
const requiredEdges = [
  'equalSmaLeavesState', 'first200Unleveraged', 'driftBandRebalances', 'liquidationDetected',
  'reentryAfterExitAllowed', 'zigzagSegmentation', 'actualTradingDayAnnualization', 'saturdayTradingDaysPresent',
]
const edges = Object.fromEntries(requiredEdges.map(id => [id, internal.edgeChecks[id] === true]))
const randomFailures = randomEvaluations.filter(row => !row.pass)
const output = {
  mainResults: {
    sha256: createHash('sha256').update(readFileSync(here('../results.json'))).digest('hex'),
    modifiedAt: statSync(here('../results.json')).mtime.toISOString(),
  },
  deterministicTolerance: 1e-8,
  randomToleranceRule: '|p1-p2| <= 3*sqrt(pBar*(1-pBar)/N)+1/N',
  numericMismatchCount: deterministic.length,
  structuralMismatchCount: structural.length,
  randomEvaluationCount: randomEvaluations.length,
  randomOutsideToleranceCount: randomFailures.length,
  allRandomWithinTolerance: randomFailures.length === 0,
  maxNumericDifference: deterministic[0] ?? null,
  numericMismatches: deterministic,
  randomEvaluations,
  structuralMismatches: structural,
  edgeChecks: edges,
  allEdgeChecksPass: Object.values(edges).every(Boolean),
  verdict: { main: main.verdict, replication: replication.verdict },
}
writeFileSync(here('./compare-results.json'), JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({ ...output, numericMismatches: deterministic.slice(0, 30), structuralMismatches: structural.slice(0, 30) }, null, 2))
if (deterministic.length || structural.length || randomFailures.length || !output.allEdgeChecksPass) process.exitCode = 1
