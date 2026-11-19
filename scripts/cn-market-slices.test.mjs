import test from 'node:test'
import assert from 'node:assert/strict'
import { CN_SLICES, parseKline, secidOf, valuationFor } from './cn-market-slices.mjs'

test('maps index codes to the Eastmoney market that quotes them', () => {
  assert.equal(secidOf('399006'), '0.399006')
  assert.equal(secidOf('000300'), '1.000300')
  assert.equal(secidOf('932000'), '2.932000')
  assert.equal(secidOf('h30269'), '2.H30269')
  assert.throws(() => secidOf('AAPL'))
  assert.equal(new Set(CN_SLICES.map(slice => slice.id)).size, CN_SLICES.length)
})

const body = (dates, code = '000300') => ({ rc: 0, data: { code, klines: dates.map((date, i) => `${date},${100 + i},${(i + 1) * 1e8}`) } })
const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10))

test('keeps only completed Beijing sessions and converts turnover to 亿元', () => {
  const beforeClose = new Date('2026-10-30T06:00:00Z') // 14:00 Beijing on the last listed day
  const parsed = parseKline(body(days), '000300', beforeClose)
  assert.equal(parsed.history.at(-1)[0], '2026-10-29')
  assert.deepEqual(parsed.volume.at(-1), ['2026-10-29', 29])
  const afterClose = parseKline(body(days), '000300', new Date('2026-10-30T08:00:00Z'))
  assert.equal(afterClose.history.at(-1)[0], '2026-10-30')
  assert.throws(() => parseKline(body(days, '000905'), '000300'), /身份/)
  assert.throws(() => parseKline(body(days.slice(0, 5)), '000300', new Date('2026-12-01T00:00:00Z')), /覆盖不足/)
})

test('prefers the jixing weekly PE history and falls back to the ths table', () => {
  const series = Array.from({ length: 25 }, (_, i) => [`2026-0${1 + Math.floor(i / 5)}-0${1 + (i % 5)}`, 10 + i])
  const fromJixing = valuationFor('000300', { jixingRows: [{ code: '000300', name: '沪深300', pe: 13, pePct: 0.468, date: '2026-11-17', source: 'csi' }], jixingHistory: { peSeries: series }, thsValuation: [] })
  assert.equal(fromJixing.pct, 46.8)
  assert.equal(fromJixing.history.length, 25)
  const fromThs = valuationFor('399006', { jixingRows: [{ code: '399006', pe: 22, peSeries: [] }], jixingHistory: { peSeries: [] }, thsValuation: [{ code: '399006', name: '创业板（整体）', pe: 32.9, peP10: 10.3, history: series }] })
  assert.equal(fromThs.value, 32.9)
  assert.match(fromThs.scope, /创业板（整体）/)
  assert.equal(valuationFor('399370', { jixingRows: [], jixingHistory: null, thsValuation: [] }), undefined)
})
