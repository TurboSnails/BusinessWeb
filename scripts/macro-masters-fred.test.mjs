import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  downsampleDaily, parseFredCsv, parseSepUpdated, profitToGdp, updateFredFile, yearOverYear,
} from './macro-masters-fred.mjs'

test('FRED CSV skips invalid observations, sorts dates and keeps the last duplicate', () => {
  const csv = `observation_date,FEDFUNDS
2024-03-01,4.75
2024-02-01,.
2024-02-31,5
2024-01-01,0
2024-01-02,Infinity
2024-01-03,
2024-01-04,N/A
2024-03-01,4.8`
  assert.deepEqual(parseFredCsv(csv), [['2024-01-01', 0], ['2024-03-01', 4.8]])
  assert.deepEqual(parseFredCsv('<html>Unavailable\n2024-01-01,4</html>'), [])
})

test('year-over-year uses the exact date one year earlier and skips missing or zero bases', () => {
  assert.deepEqual(yearOverYear([
    ['1989-01-01', 100], ['1989-04-02', 200], ['1989-07-01', 0],
    ['1990-01-01', 101.234], ['1990-04-01', 250], ['1990-07-01', 20],
  ]), [['1990-01-01', 1.23]])
})

test('profit-to-GDP divides only matching quarters with a nonzero GDP', () => {
  const profits = [['2025-01-01', 300], ['2025-04-01', 500], ['2025-07-01', 100]]
  const gdp = [['2025-01-01', 2345], ['2025-07-01', 0], ['2025-10-01', 2500]]
  assert.deepEqual(profitToGdp(profits, gdp), [['2025-01-01', 12.79]])
})

test('daily history retains 400 calendar dates and keeps the last old observation each Monday–Sunday week', () => {
  const rows = [
    ['2024-11-05', 1], ['2024-11-10', 2], ['2024-11-11', 3], ['2024-11-14', 4],
    ['2024-11-15', 5], ['2024-11-16', 6], ['2024-11-17', 7], ['2025-12-19', 8],
  ]
  // 2024-11-15 is exactly 399 days before 2025-12-19.
  assert.deepEqual(downsampleDaily(rows, '2025-12-19'), [rows[1], ...rows.slice(3)])
})

test('SEP date comes from the Updated label, never the next release', () => {
  const dateSpan = 'class="series-meta-updated-date default-text"'
  const next = `<span>Next Release Date: <span ${dateSpan}>Dec 9, 2026</span></span>`
  assert.equal(parseSepUpdated(`${next} Updated: <span title="Sep 16, 2026"><span ${dateSpan}>Sep 16, 2026</span>`), '2026-09-16')
  assert.equal(parseSepUpdated(next), undefined)
  assert.equal(parseSepUpdated('Updated: <span class="series-meta-updated-date">Feb 30, 2026</span>'), undefined)
})

async function temporaryOutput(t) {
  const dir = await mkdtemp(join(tmpdir(), 'macro-masters-fred-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return join(dir, 'data.json')
}

test('partial refresh retains failed series, omits missing series and clears recovered errors', async t => {
  const output = await temporaryOutput(t)
  const previous = {
    fedFunds: { fred: 'FEDFUNDS', name: '联邦基金有效利率', unit: '%', frequency: 'monthly', history: [['2025-01-01', 4]], refreshError: 'old' },
    primeRate: { fred: 'MPRIME', name: '美国优惠贷款利率', unit: '%', frequency: 'monthly', history: [['2025-01-01', 7]] },
  }
  await writeFile(output, JSON.stringify({ series: previous }))
  const warnings = []
  const responses = {
    FEDFUNDS: 'observation_date,FEDFUNDS\n2025-02-01,4.12345\n2025-03-01,4.25',
    FEDTARMD: 'observation_date,FEDTARMD\n2026-01-01,3.5\n2027-01-01,3.25',
  }
  let fedFundsAttempts = 0
  await updateFredFile({
    output, today: '2025-02-22', warn: message => warnings.push(message),
    fetcher: async url => {
      if (url.endsWith('/series/FEDTARMD')) {
        return new Response('Updated: <span class="series-meta-updated-date">Jan 29, 2025</span>')
      }
      const id = new URL(url).searchParams.get('id')
      if (id === 'FEDFUNDS' && ++fedFundsAttempts === 1) return new Response('', { status: 503 })
      return responses[id] ? new Response(responses[id]) : new Response('', { status: 503 })
    },
  })
  const result = JSON.parse(await readFile(output, 'utf8'))
  assert.equal(result.generatedAt, '2025-02-22')
  assert.deepEqual(Object.keys(result.series), ['fedFunds', 'dotMedian', 'primeRate'])
  assert.deepEqual(result.series.fedFunds.history, [['2025-02-01', 4.123]])
  assert.equal(result.series.fedFunds.refreshError, undefined)
  assert.equal(result.series.dotMedian.updated, '2025-01-29')
  assert.deepEqual(result.series.dotMedian.history, [['2026-01-01', 3.5], ['2027-01-01', 3.25]])
  assert.deepEqual(result.series.primeRate, { ...previous.primeRate, refreshError: 'MPRIME: HTTP 503' })
  assert.ok(warnings.some(message => message.includes('primeRate') && message.includes('503')))
})

test('first refresh omits dotMedian when the source supplies projections without an update date', async t => {
  const output = await temporaryOutput(t)
  await updateFredFile({
    output, today: '2025-02-22', warn: () => {},
    fetcher: async url => {
      if (url.endsWith('/series/FEDTARMD')) return new Response('<html>Unavailable</html>')
      return new Response('observation_date,VALUE\n2025-02-01,3.75')
    },
  })
  const { series } = JSON.parse(await readFile(output, 'utf8'))
  assert.ok(series.fedFunds)
  assert.equal(series.dotMedian, undefined)
})

test('when every source fails the existing file stays byte-for-byte intact', async t => {
  const output = await temporaryOutput(t)
  const oldText = '{ "series": {} }\n'
  await writeFile(output, oldText)
  await assert.rejects(updateFredFile({
    output, fetcher: async () => new Response('', { status: 503 }), warn: () => {},
  }), /全部刷新失败/)
  assert.equal(await readFile(output, 'utf8'), oldText)
})
