import assert from 'node:assert/strict'
import test from 'node:test'
import { backfillVolume, parseNaaimWorkbook, prependHistory } from './backfill-us-history.mjs'

const venues = ['N', 'P', 'Q', 'K', 'Z', 'DN', 'DQ']
function csv(days) {
  const head = 'Day,Market Participant,Total Shares'
  return [head, ...days.flatMap((day, i) => venues.map(code => `${day},X (${code}),${100 + i}`))].join('\n')
}

test('only prepends older Cboe sessions and keeps existing observations untouched', () => {
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2025, 0, 2 + i)).toISOString().slice(0, 10))
  const existing = {
    volume: { label: '量', frequency: '日频', history: [['2025-01-28', 9]] },
    volumeRatio: { label: '量比', frequency: '日频', history: [['2025-01-28', 1.5]] },
    other: { history: [['2025-01-01', 1]] },
  }
  const next = backfillVolume(existing, [csv(days)], '2025-01-28')
  assert.equal(next.volumeRatio.label, '量比')
  assert.deepEqual(next.volumeRatio.history.at(-1), ['2025-01-28', 1.5])
  assert.deepEqual(next.volume.history.at(-1), ['2025-01-28', 9])
  assert.equal(next.volume.history[0][0], '2025-01-02')
  assert.equal(next.volumeRatio.history[0][0], days[20])
  assert.ok(next.volumeRatio.history.every(([day]) => day <= '2025-01-28'))
  assert.equal(next.other, existing.other)
})

// 最小的 stored（不压缩）zip，只含一张工作表，足够 unzipEntry 读取。
function workbook(xml) {
  const name = Buffer.from('xl/worksheets/sheet1.xml')
  const data = Buffer.from(xml)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28)
  const centralOffset = local.length + name.length + data.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(centralOffset, 16)
  return Buffer.concat([local, name, data, central, name, end])
}

test('reads NAAIM weekly means from the full-history workbook in date order', () => {
  const rows = Array.from({ length: 520 }, (_, i) => `<row r="${i + 2}"><c r="A${i + 2}" s="1"><v>${46232 - 7 * i}</v></c><c r="B${i + 2}" s="2"><v>${(i % 200) - 50}</v></c></row>`)
  const book = workbook(`<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row>${rows.join('')}</sheetData>`)
  const parsed = parseNaaimWorkbook(book)
  assert.equal(parsed.length, 520)
  assert.deepEqual(parsed.at(-1), ['2026-07-29', -50])
  assert.ok(parsed[0][0] < parsed[1][0])
})

test('prependHistory keeps existing points and ignores rows inside the existing span', () => {
  const entry = { frequency: '周频', source: 'x', history: [['2024-02-21', 74.7], ['2024-02-28', 80]] }
  const next = prependHistory(entry, [['2024-02-14', 60], ['2024-02-21', 1], ['2024-02-28', 2]])
  assert.deepEqual(next.history, [['2024-02-14', 60], ['2024-02-21', 74.7], ['2024-02-28', 80]])
  assert.equal(next.source, 'x')
})
