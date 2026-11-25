import assert from 'node:assert/strict'
import test from 'node:test'
import { compareLedger } from './check-live-ledger.mjs'

const official = {
  d: '2026-11', final: 'neutral', equityShare: 0.7, status: 'official', recordedAt: '2026-12-01', ruleVersion: 'v2.2',
  regime: 'lean-offense', score: 0.21, pillars: { growth: 0.2, credit: 0.33, liquidity: 0, inflation: 1 },
  breakers: [], driver: 'tactical', spxReturn: null, portfolioReturn: null,
}
const estimate = { d: '2026-12', final: 'offense', equityShare: 1, status: 'estimate', spxReturn: null, portfolioReturn: null }

test('appending rows, updating estimates and backfilling returns are allowed', () => {
  const next = [
    { ...official, spxReturn: 0.02, portfolioReturn: 0.015 },
    { ...estimate, final: 'neutral', equityShare: 0.7 },
    { ...estimate, d: '2027-01' },
  ]
  assert.deepEqual(compareLedger([official, estimate], next), [])
  assert.deepEqual(compareLedger([], [official]), [])
})

test('rewriting a frozen row, dropping a month or changing realized returns is rejected', () => {
  assert.match(compareLedger([official], [{ ...official, final: 'defense', equityShare: 0.3 }]).join('\n'), /final/)
  assert.match(compareLedger([official], [{ ...official, score: -1 }]).join('\n'), /score/)
  assert.match(compareLedger([official], [{ ...official, status: 'estimate' }]).join('\n'), /变回了预估/)
  assert.match(compareLedger([official, estimate], [official]).join('\n'), /2026-12：前推记录被删除/)
  const settled = { ...official, spxReturn: 0.02, portfolioReturn: 0.015 }
  assert.match(compareLedger([settled], [{ ...settled, spxReturn: 0.03 }]).join('\n'), /spxReturn/)
})
