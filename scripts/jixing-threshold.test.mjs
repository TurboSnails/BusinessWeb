import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildThresholdData, buildThresholdRow, distToHigh, distToLow, quantileLine, sampleEnough,
} from './jixing-threshold-lib.mjs'

describe('quantileLine', () => {
  it('取 30%/70% 分位值', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    assert.equal(quantileLine(s, 0.3), 3)
    assert.equal(quantileLine(s, 0.7), 7)
    assert.equal(quantileLine([], 0.3), null)
  })
})

describe('distToLow / distToHigh', () => {
  it('已低估 / 已高估返回 already', () => {
    assert.deepEqual(distToLow(10, 12), { already: true, pct: null })
    assert.deepEqual(distToLow(12, 10), { already: false, pct: 10 / 12 - 1 })
    assert.deepEqual(distToHigh(12, 10), { already: true, pct: null })
    assert.deepEqual(distToHigh(8, 10), { already: false, pct: 10 / 8 - 1 })
  })
  it('缺值返回 null pct', () => {
    assert.deepEqual(distToLow(null, 10), { already: false, pct: null })
    assert.deepEqual(distToHigh(10, null), { already: false, pct: null })
  })
})

describe('sampleEnough', () => {
  it('样本 < 250 或不满 1 年 → false', () => {
    assert.equal(sampleEnough(249, '2016-01-01', '2026-11-17'), false)
    assert.equal(sampleEnough(250, '2026-06-01', '2026-11-17'), false)
    assert.equal(sampleEnough(250, '2016-01-01', '2026-11-17'), true)
    assert.equal(sampleEnough(1, '2026-11-17', '2026-11-17'), false)
  })
})

describe('buildThresholdRow', () => {
  it('PE 行用 peRefs', () => {
    const row = buildThresholdRow({
      code: '000300', name: '沪深300', group: 'broad', basis: 'pe', date: '2026-11-17',
      pe: 13, pb: 1.2, pePct: 0.4, pbPct: null, status: 'normal',
      peRefs: [11, 15], pbRefs: [1, 1.5],
      peHistory: { since: '2016-01-01', count: 2400 }, pbHistory: { since: null, count: 0 },
      pbIndustry: null,
    })
    assert.equal(row.basis, 'pe')
    assert.equal(row.current, 13)
    assert.equal(row.lowLine, 11)
    assert.equal(row.highLine, 15)
    assert.equal(row.alreadyLow, false)
    assert.ok(Math.abs(row.distLowPct - (11 / 13 - 1)) < 1e-9)
  })
  it('PB 行且已低估', () => {
    const row = buildThresholdRow({
      code: '399986', name: '中证银行', group: 'industry', basis: 'pb', date: '2026-11-17',
      pe: 7, pb: 0.6, pePct: 0.4, pbPct: 0.2, status: 'low',
      peRefs: [6, 10], pbRefs: [0.65, 0.9],
      peHistory: { since: '2016-01-01', count: 250 }, pbHistory: { since: '2016-01-01', count: 250 },
      pbIndustry: { code: '4010', name: '银行' },
    })
    assert.equal(row.basis, 'pb')
    assert.equal(row.alreadyLow, true)
    assert.equal(row.distLowPct, null)
    assert.match(row.basisLabel, /行业 PB/)
  })
  it('n=1：线与距线为 null，不双判已低估/已高估', () => {
    const row = buildThresholdRow({
      code: '399006', name: '创业板指', group: 'broad', basis: 'pe', date: '2026-11-17',
      pe: 22.5479, pePct: null, status: null,
      peRefs: [22.5479, 22.5479], pbRefs: [null, null],
      peHistory: { since: '2026-11-17', count: 1 }, pbHistory: { since: null, count: 0 },
      pbIndustry: null,
    })
    assert.equal(row.lowLine, null)
    assert.equal(row.highLine, null)
    assert.equal(row.distLowPct, null)
    assert.equal(row.distHighPct, null)
    assert.equal(row.alreadyLow, false)
    assert.equal(row.alreadyHigh, false)
    assert.equal(row.status, null)
  })
  it('lowLine===highLine 即使样本够也不给线', () => {
    const row = buildThresholdRow({
      code: 'X', name: 'X', group: 'broad', basis: 'pe', date: '2026-11-17',
      pe: 10, pePct: 0.5, status: 'normal',
      peRefs: [10, 10], pbRefs: [null, null],
      peHistory: { since: '2016-01-01', count: 250 }, pbHistory: { since: null, count: 0 },
      pbIndustry: null,
    })
    assert.equal(row.lowLine, null)
    assert.equal(row.alreadyLow, false)
    assert.equal(row.alreadyHigh, false)
  })
})

describe('buildThresholdData', () => {
  it('组装整表（样本不足行仍保留，线为 null）', () => {
    const data = buildThresholdData({
      asOf: '2026-11-17',
      sources: [{ label: '中证', url: 'https://www.csindex.com.cn/' }],
      rows: [{
        code: '000300', name: '沪深300', group: 'broad', basis: 'pe', date: '2026-11-17',
        pe: 13, pePct: null, status: null, peRefs: [13, 13], pbRefs: [null, null],
        peHistory: { since: '2026-11-17', count: 1 }, pbHistory: { since: null, count: 0 },
        pbIndustry: null,
      }],
    })
    assert.equal(data.version, 1)
    assert.equal(data.rows.length, 1)
    assert.equal(data.rows[0].lowLine, null)
    assert.equal(data.asOf, '2026-11-17')
  })
})
