import test from 'node:test'
import assert from 'node:assert/strict'
import { annualFact, ttmValue, normalizeAmount } from './data/normalize.mjs'
test('deduplicates cumulative reports when building TTM',()=>{
 assert.equal(ttmValue(100,70,60),110);assert.equal(ttmValue(100,null,60),null)
})
test('preserves zero and converts explicit units without guessing',()=>{
 assert.equal(normalizeAmount('1.2亿元'),120000000);assert.equal(normalizeAmount(0),0);assert.equal(normalizeAmount('--'),null)
})
test('uses filed dates and annual duration instead of latest cumulative quarter',()=>{
 const fact={units:{USD:[{start:'2024-01-01',end:'2024-12-31',filed:'2025-02-01',val:100},{start:'2025-01-01',end:'2025-06-30',filed:'2025-08-01',val:80},{start:'2025-01-01',end:'2025-12-31',filed:'2026-02-01',val:150}]}}
 assert.equal(annualFact(fact,'2025-10-04').value,100)
})
