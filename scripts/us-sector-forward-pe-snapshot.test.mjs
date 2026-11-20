import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSector, buildSnapshot, percentileOf, SECTOR_MAP } from './us-sector-forward-pe-snapshot.mjs'

const raw = (n, base = 10) => ({
  ticker: 'S5CONS', etf: 'XLP', label: { cn: '必需消费', en: 'Consumer Staples' },
  series: Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2004, 0, 2 + i * 7)).toISOString().slice(0, 10), value: base + i * 0.01 })),
})

test('percentile counts values strictly below the latest reading', () => {
  assert.equal(percentileOf([1, 2, 3, 4], 4), 75)
  assert.equal(percentileOf([], 4), undefined)
})

test('keeps the upstream last date and trims the plotted history', () => {
  const sector = buildSector(raw(1000), 'sector-xlp')
  assert.equal(sector.latest.date, sector.history.at(-1)[0])
  assert.ok(sector.history[0][0] >= '2005-01-01')
  assert.equal(sector.stats.count, 1000)
  assert.equal(sector.stats.percentile, 99.9)
  assert.equal(sector.name, '必需消费')
})

test('rejects a truncated upstream series instead of writing it', () => {
  assert.throws(() => buildSector(raw(20), 'sector-xlp'), /疑似上游异常/)
  assert.throws(() => buildSector(undefined, 'sector-xlp'), /疑似上游异常/)
})

test('maps every configured sector id', () => {
  const sectors = Object.fromEntries(SECTOR_MAP.map(({ key }) => [key, raw(500)]))
  const snapshot = buildSnapshot({ updated: '2026-11-20', sectors }, new Date('2026-11-20T00:00:00Z'))
  assert.deepEqual(Object.keys(snapshot.sectors).sort(), SECTOR_MAP.map(s => s.id).sort())
  assert.equal(snapshot.upstreamUpdated, '2026-11-20')
})

import { mergeSeries, normalizeDate, parseBloombergCsv } from './us-sector-forward-pe-snapshot.mjs'

test('parses a Bloomberg export with header rows, US dates and quoted values', () => {
  const csv = 'S5CONS Index,\nDate,BEst P/E Ratio\n11/17/2026,"23.1"\n11/18/2026,23.4\n11/19/2026,23.5161\nnote,x\n'
  assert.deepEqual(parseBloombergCsv(csv), [
    { date: '2026-11-17', value: 23.1 }, { date: '2026-11-18', value: 23.4 }, { date: '2026-11-19', value: 23.5161 },
  ])
  assert.equal(normalizeDate('2026/1/5'), '2026-01-05')
  assert.equal(normalizeDate('13/45/2026'), undefined)
})

test('manual points extend the series and win on the same date', () => {
  const merged = mergeSeries([{ date: '2026-09-04', value: 21.33 }], [{ date: '2026-09-04', value: 21.4 }, { date: '2026-11-19', value: 23.5 }])
  assert.deepEqual(merged, [{ date: '2026-09-04', value: 21.4 }, { date: '2026-11-19', value: 23.5 }])
})

test('a CSV-only sector is built from its fixed name table and marked manual', () => {
  const manual = Array.from({ length: 150 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), value: 15 + i * 0.01 }))
  const sector = buildSector(undefined, 'sector-xlv', manual)
  assert.equal(sector.name, '医疗保健')
  assert.equal(sector.manual.count, 150)
})
