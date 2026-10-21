import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateBars, movingAverage, macdSeries, rsiSeries, periodIndicators,
  buildRecord, normalizeBars, parseTencent, parseFundNav,
} from './lib/etf-technical.mjs'
import { buildUniverse, generateDataset, requestText, fetchInstrument } from './etf-technical.mjs'

// Any accidentally uninjected HTTP access must fail locally instead of touching the network.
globalThis.fetch = async () => { throw new Error('Network forbidden in offline tests') }

const near = (actual, expected, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`)
const bars = values => values.map((close, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), close }))

test('MA requires a full window and uses the most recent closes', () => {
  assert.equal(movingAverage([1, 2], 3), null)
  assert.equal(movingAverage([1, 2, 3, 4], 3), 3)
})

test('MACD seeds both EMAs with first close and DEA with first DIF', () => {
  const result = macdSeries([10, 12, 11])
  near(result[0].dif, 0)
  near(result[1].dif, 4 / 13 - 4 / 27)
  near(result[1].dea, (4 / 13 - 4 / 27) / 5)
  near(result[1].histogram, 2 * (4 / 13 - 4 / 27) * 4 / 5)
  near(result[2].dif, 10 + (4 / 13) * 11 / 13 + 2 / 13 - (10 + (4 / 27) * 25 / 27 + 2 / 27))
})

test('Wilder RSI uses 14 changes, then smoothed gains/losses', () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00]
  const result = rsiSeries(closes)
  assert.equal(result[13], null)
  near(result[14], 70.4641350211, 1e-8)
  near(result[15], 66.2496185536, 1e-8)
  assert.equal(rsiSeries(Array(15).fill(1)).at(-1), 50)
  assert.equal(rsiSeries(Array.from({ length: 15 }, (_, i) => i + 1)).at(-1), 100)
  assert.equal(rsiSeries(Array.from({ length: 15 }, (_, i) => 20 - i)).at(-1), 0)
})

test('ISO weeks cross year boundaries; weekends belong to the preceding ISO week', () => {
  const input = [
    { date: '2025-12-29', close: 1 }, { date: '2025-12-31', close: 2 },
    { date: '2026-01-02', close: 3 }, { date: '2026-01-05', close: 4 },
  ]
  const result = aggregateBars(input, 'week')
  assert.deepEqual(result.map(x => [x.date, x.close, x.end]), [['2026-01-02', 3, '2026-01-02'], ['2026-01-05', 4, '2026-01-09']])
})

test('aggregation retains last actual observation date, does not fill holidays or gaps', () => {
  const input = [{ date: '2026-09-30', close: 2 }, { date: '2026-10-08', close: 3 }, { date: '2026-10-21', close: 4 }]
  assert.deepEqual(aggregateBars(input, 'month').map(x => [x.date, x.end, x.close]), [['2026-09-30', '2026-09-30', 2], ['2026-10-21', '2026-10-31', 4]])
  assert.equal(aggregateBars(input, 'week').length, 3)
})

test('partial periods reflect China close time, Friday, and calendar month end', () => {
  const input = [{ date: '2026-10-21', close: 4 }]
  const now = '2026-10-21T09:00:00Z'
  assert.equal(periodIndicators(input, 'day', '2026-10-21', now).complete, true)
  assert.equal(periodIndicators(input, 'day', '2026-10-21', '2026-10-21T06:59:59Z').complete, false)
  assert.equal(periodIndicators(input, 'week', '2026-10-21', now).complete, false)
  assert.equal(periodIndicators(input, 'month', '2026-10-21', now).complete, false)
  assert.equal(periodIndicators([{ date: '2026-10-23', close: 4 }], 'week', '2026-10-23', '2026-10-23T07:00:00Z').complete, true)
  assert.equal(periodIndicators([{ date: '2026-10-30', close: 4 }], 'month', '2026-10-31', '2026-10-31T08:00:00Z').complete, true)
})

test('insufficient history nulls only unavailable indicators; MACD needs 26 bars', () => {
  const p = periodIndicators(bars([1, 2, 3, 4, 5]), 'day', '2026-10-21')
  assert.equal(p.ma5, 3)
  for (const key of ['ma', 'ma10', 'ma20', 'macd', 'dif', 'dea', 'histogram', 'previousHistogram', 'rsi', 'previousRsi', 'rsiState']) assert.equal(p[key], null, key)
  assert.equal(p.limited, true)
  const p26 = periodIndicators(bars(Array.from({ length: 26 }, (_, i) => i + 1)), 'day', '2026-10-21')
  assert.equal(p26.macd, '偏多')
  assert.equal(p26.previousHistogram, null)
  assert.equal(p26.limited, true)
  assert.equal(periodIndicators(bars(Array.from({ length: 27 }, (_, i) => i + 1)), 'day', '2026-10-21').limited, false)
})

test('strict MA ordering classifies bulls, bears, and equality; RSI thresholds inclusive', () => {
  for (const [values, ma, rsiState] of [
    [Array.from({ length: 30 }, (_, i) => i + 1), '多头', '超买'],
    [Array.from({ length: 30 }, (_, i) => 31 - i), '空头', '超卖'],
    [Array(30).fill(1), '震荡', '中性'],
  ]) {
    const result = periodIndicators(bars(values), 'day', '2026-10-21')
    assert.equal(result.ma, ma)
    assert.equal(result.rsiState, rsiState)
  }
})

test('normalization sorts, filters cutoff, rejects corrupt closes and conflicting duplicates', () => {
  assert.deepEqual(normalizeBars([{ date: '2026-10-22', close: 4 }, { date: '2026-10-20', close: 3 }, { date: '2026-10-20', close: 3 }], '2026-10-21'), [{ date: '2026-10-20', close: 3 }])
  for (const close of [null, '', 0, -1, NaN, Infinity]) assert.throws(() => normalizeBars([{ date: '2026-10-20', close }], '2026-10-21'))
  assert.throws(() => normalizeBars([{ date: '2026-02-30', close: 1 }], '2026-10-21'))
  assert.throws(() => normalizeBars([{ date: '2026-10-20', close: 1 }, { date: '2026-10-20', close: 2 }], '2026-10-21'))
})

test('Tencent chooses adjusted closes, falling back to day only when qfqday is empty', () => {
  const raw = { data: { sh510300: { qfqday: [['2026-10-20', '1', '2']], day: [['2026-10-20', '1', '3']] } } }
  assert.equal(parseTencent(raw, 'sh510300', '2026-10-21').bars[0].close, 2)
  raw.data.sh510300.qfqday = []
  assert.equal(parseTencent(raw, 'sh510300', '2026-10-21').priceSeries, 'day')
  assert.throws(() => parseTencent({ code: -1 }, 'sh510300', '2026-10-21'))
})

test('ETF loader requests plain day when adjusted endpoint has neither usable series', async () => {
  const urls = []
  const result = await fetchInstrument({ code: '159915', kind: '宽基' }, '2026-10-21', { request: async url => {
    urls.push(url)
    return JSON.stringify({ data: { sz159915: urls.length === 1 ? {} : { day: [['2026-10-21', '1', '2']] } } })
  } })
  assert.equal(urls.length, 2)
  assert.match(urls[0], /sz159915,day,2021-01-01,2026-10-21,640,qfq$/)
  assert.match(urls[1], /sz159915,day,2021-01-01,2026-10-21,640$/)
  assert.equal(result.sourceUrl, urls[1])
  assert.equal(result.priceSeries, 'day')
  assert.equal(result.bars[0].close, 2)
})

test('fund loader requires the actual published fund name and accumulated NAV', async () => {
  const text = 'var fS_name="债基A"; var Data_ACWorthTrend=[[1792425600000,1.8]];'
  const result = await fetchInstrument({ code: '000015', kind: '债基' }, '2026-10-21', { request: async () => text })
  assert.equal(result.name, '债基A')
  assert.equal(result.priceSeries, 'nav')
  assert.equal(result.bars[0].close, 1.8)
  await assert.rejects(fetchInstrument({ code: '000015', kind: '债基' }, '2026-10-21', { request: async () => 'var Data_ACWorthTrend=[[1792425600000,1.8]];' }), /name missing/)
})

test('published accumulated NAV is parsed as data without executing provider JavaScript', () => {
  const text = 'var fS_name = "债券A"; var Data_netWorthTrend = [{"x":1792425600000,"y":1.1}]; var Data_ACWorthTrend = [[1792425600000,1.8],[1792512000000,1.9]]; throw new Error("must not execute");'
  const result = parseFundNav(text, '2026-10-20')
  assert.equal(result.name, '债券A')
  assert.deepEqual(result.bars, [{ date: '2026-10-20', close: 1.8 }])
  assert.throws(() => parseFundNav('var Data_netWorthTrend = [];', '2026-10-21'), /accumulated NAV/)
})

test('record uses actual latest date, 20-session return, and NAV date', () => {
  const input = bars(Array.from({ length: 61 }, (_, i) => i + 1))
  const result = buildRecord({ code: '000015', name: '债券', kind: '债基', group: null }, { bars: input, priceSeries: 'nav', sourceUrl: 'https://fund.eastmoney.com/' }, '2026-10-21', '2026-10-21T09:00:00Z')
  assert.equal(result.close, 61)
  assert.equal(result.previousClose, 60)
  near(result.changePct, 100 / 60)
  near(result.return20SessionsPct, (61 / 41 - 1) * 100)
  assert.equal(result.ma60, 31.5)
  assert.equal(result.navDate, input.at(-1).date)
  assert.equal(result.asOf, input.at(-1).date)
})

test('universe contains exactly 79 unique instruments with the requested kinds', async () => {
  const universe = await buildUniverse()
  assert.equal(universe.length, 79)
  assert.equal(new Set(universe.map(x => x.code)).size, 79)
  assert.deepEqual(Object.fromEntries(['行业', '宽基', '策略', '商品', '货币', '债基'].map(k => [k, universe.filter(x => x.kind === k).length])), { 行业: 59, 宽基: 10, 策略: 1, 商品: 1, 货币: 1, 债基: 7 })
})

test('generator isolates instrument failures, keeps stable order and at most four active requests', async () => {
  let active = 0, peak = 0
  const universe = Array.from({ length: 9 }, (_, i) => ({ code: String(i), name: String(i), kind: '宽基', group: null }))
  const result = await generateDataset('2026-10-21', { universe, load: async item => {
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active--
    if (item.code === '3') throw new Error('upstream unavailable')
    return { bars: [{ date: '2026-10-20', close: 2 }], priceSeries: 'day', sourceUrl: 'https://example.test/' }
  } })
  assert.equal(peak, 4)
  assert.equal(result.records.length, 8)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].code, '3')
  assert.match(result.errors[0].reason, /upstream unavailable/)
  assert.deepEqual(result.records.map(x => x.code), ['0', '1', '2', '4', '5', '6', '7', '8'])
})

test('HTTP errors are retried with a fresh timeout and diagnostic errors preserve DNS cause', async () => {
  let calls = 0
  const value = await requestText('https://example.test/', { retryDelayMs: 0, fetchImpl: async (_url, options) => {
    assert.ok(options.signal)
    calls++
    return { ok: calls === 3, status: 503, text: async () => 'ok' }
  } })
  assert.equal(value, 'ok')
  assert.equal(calls, 3)
  await assert.rejects(requestText('https://example.test/', { retryDelayMs: 0, fetchImpl: async () => { throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND example.test') }) } }), /ENOTFOUND/)
})

test('offline fixtures exercise the full 79-instrument pipeline with per-code errors', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const directory = await mkdtemp(join(tmpdir(), 'etf-technical-'))
  try {
    const series = bars(Array.from({ length: 40 }, (_, i) => 1 + i / 100))
    await writeFile(join(directory, '510300.json'), JSON.stringify({ bars: series, priceSeries: 'qfqday' }))
    await writeFile(join(directory, '000015.json'), JSON.stringify({ bars: series, priceSeries: 'nav', name: 'Published bond name' }))
    await writeFile(join(directory, '518880.json'), '{corrupt')
    const result = await generateDataset('2026-10-21', { fixtureDir: directory })
    assert.equal(result.records.length, 2)
    assert.equal(result.errors.length, 77)
    assert.equal(result.records.find(r => r.code === '000015').name, 'Published bond name')
    assert.equal(result.records.find(r => r.code === '000015').navDate, series.at(-1).date)
    assert.equal(result.records.find(r => r.code === '510300').day.ma, '多头')
    assert.match(result.records[0].sourceUrl, /^fixture:/)
    assert.match(result.errors.find(e => e.code === '518880').reason, /JSON|property|Unexpected/)
    assert.match(result.errors.find(e => e.code === '511880').reason, /ENOENT/)
    assert.match(result.methodology.sources, /OFFLINE FIXTURES/)
    assert.ok(result.records.every(record => !('bars' in record) && !('priceHistory' in record)))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('offline CLI writes a marked fixture artifact inside the fixture directory', async () => {
  const { mkdtemp, readFile, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { fileURLToPath } = await import('node:url')
  const directory = await mkdtemp(join(tmpdir(), 'etf-technical-cli-'))
  try {
    await writeFile(join(directory, '510300.json'), JSON.stringify({ bars: [{ date: '2026-10-21', close: 4 }], priceSeries: 'day' }))
    const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./etf-technical.mjs', import.meta.url)), '2026-10-21', '--fixture', directory])
    assert.match(result.stdout, /1\/79 records, 78 errors/)
    const output = JSON.parse(await readFile(join(directory, 'etf-technical-2026-10-21.json'), 'utf8'))
    assert.equal(output.records.length, 1)
    assert.equal(output.errors.length, 78)
    assert.match(output.methodology.sources, /OFFLINE FIXTURES/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
