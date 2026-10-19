import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { officialMonthlyPePercentile } from './market-cycle-hk-official-pe.mjs'

const seed = JSON.parse(await readFile(new URL('../public/data/market-cycle-hk-pe-history.json', import.meta.url)))
const today = '2026-10-19'
const current = [{ date: '2026-09-30', pe: 13.79 }]
const copy = () => structuredClone(seed)

test('official 5-year month-end HSI sample uses midrank and reports its missing month', () => {
  const out = officialMonthlyPePercentile(seed, 'hsi', current, today)
  assert.ok(Math.abs(out.value - 84.16666666666667) < 1e-9)
  assert.equal(out.observationDate, '2026-09-30')
  assert.equal(out.currentPe, 13.79)
  assert.equal(out.windowStart, '2021-09-30')
  assert.equal(out.samples, 60)
  assert.equal(out.expectedMonths, 61)
  assert.deepEqual(out.missingMonths, ['2025-01'])
  assert.equal(out.sources.length, 60)
  assert.equal(out.source, seed.rows.at(-1).source)
})

test('negative PE months rank as most expensive via earnings yield instead of being discarded', () => {
  const out = officialMonthlyPePercentile(seed, 'hstech', [{ date: '2026-09-30', pe: 28.23 }], today)
  assert.equal(out.lossMonths.length, 9)
  assert.equal(out.samples, 60)
  assert.ok(Math.abs(out.value - 34.1667) < 0.01)
})

test('requires five years, 60 samples, and 95% of the expected months', () => {
  const short = copy(); short.rows.shift()
  assert.throws(() => officialMonthlyPePercentile(short, 'hsi', current, today), /5年/)
  const sparse = copy(); sparse.rows.splice(8, 2)
  assert.throws(() => officialMonthlyPePercentile(sparse, 'hsi', current, today), /60/)
})

test('rejects non-official archive URLs, wrong series XLSX and URL trick hosts', () => {
  for (const source of ['https://example.com/x.pdf', 'https://www.hsi.com.hk.evil.test/content/a.pdf', 'https://www.hsi.com.hk/content/dam/wpb/hsil/en_hk/monthly_roundup/content/20211004T000000.pdf?x=1', 'https://www.hsi.com.hk/content/dam/wpb/hsil/index_operation/historical_pe/en_hk/hstech/hstech.xlsx']) {
    const x = copy(); x.rows[0].source = source
    assert.throws(() => officialMonthlyPePercentile(x, 'hsi', current, today), /来源/)
  }
})

test('rejects invalid month ends, month mismatch, duplicate months and future data', () => {
  for (const change of [x => { x.rows[0].date = '2021-09-20' }, x => { x.rows[0].month = '2021-08' }, x => x.rows.push({ ...x.rows[0] }), x => { x.rows.at(-1).date = '2026-10-31'; x.rows.at(-1).month = '2026-10' }]) {
    const x = copy(); change(x)
    assert.throws(() => officialMonthlyPePercentile(x, 'hsi', current, today), /日期|月份|未来|重复/)
  }
  assert.throws(() => officialMonthlyPePercentile(seed, 'hsi', [...current, ...current], today), /重复/)
  assert.throws(() => officialMonthlyPePercentile(seed, 'hsi', [{ date: '2026-09-31', pe: 13.79 }], today), /日期/)
})

test('accepts actual report dates near month end and compares overlap by month', () => {
  const x = copy(); x.rows.at(-1).date = '2026-09-29'
  const out = officialMonthlyPePercentile(x, 'hsi', current, today)
  assert.equal(out.observationDate, '2026-09-30')
  assert.equal(out.samples, 60)
})

test('rejects overlapping PDF/XLSX conflicts and malformed PE rather than coercing', () => {
  assert.throws(() => officialMonthlyPePercentile(seed, 'hsi', [{ date: '2026-09-30', pe: 13.8 }], today), /冲突/)
  for (const pe of [null, '', true, '13.79', NaN, Infinity]) {
    assert.throws(() => officialMonthlyPePercentile(seed, 'hsi', [{ date: '2026-09-30', pe }], today), /PE/)
  }
})

test('merges a new official XLSX month and rolls the exact calendar window', () => {
  const x = copy()
  x.rows.push({ ...x.rows[0], date: '2025-01-31', month: '2025-01', hsi: 10.64, source: 'https://www.hsi.com.hk/content/dam/wpb/hsil/en_hk/monthly_roundup/content/20250203T000000.pdf' })
  const out = officialMonthlyPePercentile(x, 'hsi', [...current, { date: '2026-10-31', pe: 14 }], '2026-11-05')
  assert.equal(out.observationDate, '2026-10-31')
  assert.equal(out.windowStart, '2021-10-31')
  assert.equal(out.samples, 61)
  assert.deepEqual(out.missingMonths, [])
  assert.equal(out.source, 'https://www.hsi.com.hk/content/dam/wpb/hsil/index_operation/historical_pe/en_hk/hsi/hsi.xlsx')
})

test('does not mutate the archive or assert an unverified earnings definition', () => {
  const before = JSON.stringify(seed)
  const out = officialMonthlyPePercentile(seed, 'hsi', current, today)
  assert.equal(JSON.stringify(seed), before)
  assert.equal('ttm' in out, false)
  assert.throws(() => officialMonthlyPePercentile(seed, 'csi300', current, today), /市场/)
})
