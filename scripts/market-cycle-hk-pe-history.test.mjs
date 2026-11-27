import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ENIU_HSI_PE_STOPPED_ON, collectHsiPeHistory, hsiPe5yPercentile, isEniuHsiPeStopped, parseHsiPeHistory,
} from './market-cycle-hk-pe-history.mjs'

const dayList = (from, count) => Array.from({ length: count }, (_, i) => new Date(Date.parse(from) + i * 864e5).toISOString().slice(0, 10))
const liveDates = dayList('2021-10-18', 2300).filter(d => ![0, 6].includes(new Date(d).getUTCDay())).filter(d => d <= '2026-10-16')
const stoppedDates = dayList('2021-10-18', 2300).filter(d => ![0, 6].includes(new Date(d).getUTCDay())).filter(d => d <= ENIU_HSI_PE_STOPPED_ON)

test('isEniuHsiPeStopped only after the registered stop date', () => {
  assert.equal(isEniuHsiPeStopped(ENIU_HSI_PE_STOPPED_ON, '2026-10-30'), false)
  assert.equal(isEniuHsiPeStopped(ENIU_HSI_PE_STOPPED_ON, '2026-11-14'), true)
  assert.equal(isEniuHsiPeStopped('2026-10-16', '2026-11-14'), true)
  assert.equal(isEniuHsiPeStopped('2026-11-01', '2026-11-14'), false)
})

test('collector still emits a frozen reference after the stop date instead of failing freshness', async () => {
  const issues = []
  const body = { date: stoppedDates, pe: stoppedDates.map((_, i) => 12 + (i % 9) / 2) }
  const out = await collectHsiPeHistory({
    now: '2026-11-14T10:00:00.000Z',
    issue: s => issues.push(s),
    get: async () => body,
  })
  assert.equal(issues.length, 0)
  assert.equal(out.length, 1)
  assert.equal(out[0].metricId, 'pe_history_5y_percentile')
  assert.equal(out[0].observationDate, ENIU_HSI_PE_STOPPED_ON)
  assert.match(out[0].description, /来源已停更（截至 2026-10-30）/)
  const expected = hsiPe5yPercentile(parseHsiPeHistory(body, '2026-11-14'))
  assert.equal(out[0].value, Number(expected.value.toFixed(1)))
})

test('before the stop date, stale gaps still fail closed; after stop, short history is kept as frozen reference', async () => {
  const issues = []
  const live = await collectHsiPeHistory({
    now: '2026-10-20T10:00:00.000Z',
    issue: s => issues.push(s),
    get: async () => ({ date: liveDates, pe: liveDates.map((_, i) => 12 + (i % 9) / 2) }),
  })
  assert.equal(live.length, 1)
  assert.ok(!live[0].description.includes('来源已停更'))
  const staleBeforeStop = await collectHsiPeHistory({
    now: '2026-10-20T10:00:00.000Z',
    issue: s => issues.push(s),
    get: async () => {
      const dates = liveDates.filter(d => d <= '2026-10-01')
      return { date: dates, pe: dates.map((_, i) => 12 + (i % 9) / 2) }
    },
  })
  assert.deepEqual(staleBeforeStop, [])
  assert.match(issues.at(-1), /超过14天/)
})
