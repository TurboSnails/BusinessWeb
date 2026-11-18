import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildIndex, changePct, codesByStatus, delta, diffDaily, enterExit, resolveStar, snapshotRows,
} from './jixing-daily-lib.mjs'

describe('resolveStar', () => {
  it('asOf 不一致 → null，不顶替；raw 当日可补', () => {
    assert.equal(resolveStar({ asOf: '2026-11-18', star: 3.9 }, '2026-11-17'), null)
    assert.equal(resolveStar({ asOf: '2026-11-17', star: 3.9 }, '2026-11-17'), 3.9)
    assert.equal(resolveStar({ asOf: '2026-11-18', star: 3.9 }, '2026-11-17', { asOf: '2026-11-17', star: 4.1 }), 4.1)
    assert.equal(resolveStar(null, '2026-11-17'), null)
  })
})

describe('enterExit / codesByStatus', () => {
  it('进入退出判定', () => {
    assert.deepEqual(enterExit(['a', 'b'], ['b', 'c']), { entered: ['a'], exited: ['c'] })
    assert.deepEqual(codesByStatus([{ code: '1', status: 'low' }, { code: '2', status: 'high' }], 'low'), ['1'])
  })
})

describe('delta / changePct', () => {
  it('缺一侧为 null', () => {
    assert.equal(delta(1, null), null)
    assert.equal(delta(null, 1), null)
    assert.equal(delta(5, 3), 2)
    assert.ok(Math.abs((changePct(110, 100) ?? 0) - 10) < 1e-9)
    assert.equal(changePct(null, 100), null)
  })
})

describe('diffDaily', () => {
  const today = {
    asOf: '2026-11-17',
    star: 4.0,
    rows: [
      { code: 'A', name: '甲', group: 'broad', close: 110, pe: 12, pePct: 0.2, pb: null, pbPct: null, status: 'low' },
      { code: 'B', name: '乙', group: 'broad', close: 90, pe: 20, pePct: 0.8, pb: null, pbPct: null, status: 'high' },
    ],
  }
  const prev = {
    asOf: '2026-11-14',
    star: 3.8,
    rows: [
      { code: 'A', name: '甲', group: 'broad', close: 100, pe: 11, pePct: 0.35, pb: null, pbPct: null, status: 'normal' },
      { code: 'B', name: '乙', group: 'broad', close: 95, pe: 19, pePct: 0.75, pb: null, pbPct: null, status: 'high' },
      { code: 'C', name: '丙', group: 'broad', close: 50, pe: 8, pePct: 0.1, pb: null, pbPct: null, status: 'low' },
    ],
  }

  it('有前日时计算变化与进入退出', () => {
    const d = diffDaily(today, prev)
    assert.equal(d.missingPrev, false)
    assert.ok(Math.abs((d.starChange ?? 0) - 0.2) < 1e-9)
    assert.ok(Math.abs((d.rows[0].changePct ?? 0) - 10) < 1e-9)
    assert.deepEqual(d.transitions.enterLow, ['A'])
    assert.deepEqual(d.transitions.exitLow, ['C'])
    assert.deepEqual(d.transitions.enterHigh, [])
    assert.deepEqual(d.transitions.exitHigh, [])
    assert.deepEqual(d.countsDelta, { low: 0, normal: -1, high: 0 })
  })

  it('缺前日全部变化为 null', () => {
    const d = diffDaily(today, null)
    assert.equal(d.missingPrev, true)
    assert.equal(d.prevDate, null)
    assert.equal(d.starChange, null)
    assert.equal(d.rows[0].changePct, null)
    assert.equal(d.rows[0].peDelta, null)
    assert.deepEqual(d.transitions.enterLow, [])
    assert.equal(d.countsDelta, null)
  })
})

describe('snapshotRows / buildIndex', () => {
  it('组装与索引裁剪', () => {
    const rows = snapshotRows([{ code: '000300', name: '沪深300', group: 'broad', pe: 13, pePct: 0.4, pb: 1, pbPct: null, status: 'normal' }], { '000300': 4000 })
    assert.equal(rows[0].close, 4000)
    const idx = buildIndex([{ date: '2026-11-17' }, { date: '2026-11-14' }, { date: '2026-11-13' }], { asOf: '2026-11-17' }, 2)
    assert.deepEqual(idx.dates, ['2026-11-17', '2026-11-14'])
  })
})
