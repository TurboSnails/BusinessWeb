import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GROUPS, LEG_ORDER, SYMBOLS, buildShadow, frozenViolations, readingFor, rowFor, trailing,
} from './lib/style-rotation-shadow.mjs'

const close = (a, b) => Math.abs(a - b) < 1e-9
const month = (y, m) => `${y}-${String(m).padStart(2, '0')}`

// 每只 ETF 每月 28 日一个收盘，按固定月增长率复利；默认增长率按 SYMBOLS 顺序递增
function makePrices(growth = {}, through = '2027-01-05') {
  const out = {}
  SYMBOLS.forEach((s, i) => {
    const g = growth[s] ?? 0.001 * (i + 1)
    const rows = []
    let p = 100
    for (let y = 2025; y <= 2027; y += 1) {
      for (let m = 1; m <= 12; m += 1) {
        const d = `${month(y, m)}-28`
        if (d > through) break
        rows.push([d, p])
        p *= 1 + g
      }
    }
    if (through.slice(8) !== '28' && through > rows.at(-1)[0]) rows.push([through, p])
    out[s] = rows
  })
  return out
}

test('12 个月回看：t−12 至 t−1 的月收益；数据不足返回 null', () => {
  const p = makePrices()
  const tr = trailing(p.IVE, '2026-12')
  assert.equal(tr.length, 12)
  assert.ok(tr.every(r => close(r, 0.001)))
  assert.equal(trailing(makePrices({}, '2026-06-28').IVE, '2026-12'), null)
})

test('R1：12 个月复利收益最高的 2 只；同值按 V+, V−, M+, P+, S+, 大盘顺序', () => {
  const us = GROUPS.us.legs
  const p = makePrices({ [us['S+']]: 0.02, [us['P+']]: 0.015 })
  assert.deepEqual(readingFor('us', p, '2026-12').r1, ['S+', 'P+'])
  const flat = makePrices(Object.fromEntries(SYMBOLS.map(s => [s, 0.005])))
  assert.deepEqual(readingFor('us', flat, '2026-12').r1, ['V+', 'V-'])
})

test('R2：价值对成长、其余对大盘选边，投资一份固定放大盘；差为 0 时各一半', () => {
  const us = GROUPS.us.legs
  const p = makePrices({ [us['V+']]: 0.004, [us['V-']]: 0.006, [us['M+']]: 0.01, [us['P+']]: 0.002, [us['S+']]: 0.005, [us.MKT]: 0.005 })
  const r = readingFor('us', p, '2026-12')
  assert.deepEqual(r.sides, { 'V+': 'V-', 'M+': 'M+', 'P+': 'MKT', 'S+': 'half' })
  assert.ok(close(r.r2['V-'], 0.2))
  assert.ok(close(r.r2['M+'], 0.2))
  assert.ok(close(r.r2['S+'], 0.1))
  assert.ok(close(r.r2.MKT, 0.2 + 0.2 + 0.1))
  assert.ok(close(LEG_ORDER.reduce((s, l) => s + r.r2[l], 0), 1))
})

test('一行：R1、R2、6 只等权、一直持有正向腿、大盘的当月收益', () => {
  const p = makePrices()
  const r = rowFor('2026-12', p)
  assert.deepEqual(r.missing, [])
  const legs = GROUPS.intl.legs
  const g = leg => 0.001 * (SYMBOLS.indexOf(legs[leg]) + 1)
  const x = r.groups.intl
  assert.ok(close(x.ret.EW6, LEG_ORDER.reduce((s, l) => s + g(l), 0) / 6))
  assert.ok(close(x.ret.STATIC, (g('V+') + g('M+') + g('P+') + g('S+')) / 4))
  assert.ok(close(x.ret.R1, (g(x.reading.r1[0]) + g(x.reading.r1[1])) / 2))
  assert.ok(close(x.ret.R2, LEG_ORDER.reduce((s, l) => s + x.reading.r2[l] * g(l), 0)))
  assert.ok(close(x.ret.MKT, g('MKT')))
})

test('影子：只冻结完整月份；已冻结行不变；风格雷达给出当月读数', () => {
  const p = makePrices({}, '2027-01-05')
  const a = buildShadow({ previous: null, prices: p, today: '2027-01-05', generatedAt: 'x' })
  assert.deepEqual(a.rows.map(r => r.month), ['2026-12'])
  assert.equal(a.radar.month, '2027-01')
  assert.ok(a.radar.us && a.radar.intl)
  assert.equal(a.current.estimate, true)
  const b = buildShadow({ previous: a, prices: makePrices({}, '2027-02-05'), today: '2027-02-05', generatedAt: 'y' })
  assert.deepEqual(b.rows.map(r => r.month), ['2026-12', '2027-01'])
  assert.deepEqual(frozenViolations(a, b), [])
  const tampered = { ...b, rows: b.rows.map(r => (r.month === '2026-12' ? { ...r, frozenAt: 'z' } : r)) }
  assert.deepEqual(frozenViolations(a, tampered), ['2026-12'])
})

test('影子期开始前不冻结任何月份', () => {
  const s = buildShadow({ previous: null, prices: makePrices({}, '2026-11-20'), today: '2026-11-20', generatedAt: 'x' })
  assert.deepEqual(s.rows, [])
  assert.equal(s.current, null)
  assert.equal(s.radar.month, '2026-11')
})
