import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUsMarketSlices, compactPrices, parseFundCharacteristics, parseMarketSlice, US_MARKET_SLICES } from './us-market-slices.mjs'

const seconds = iso => Date.parse(iso) / 1000
const previousOpen = seconds('2026-11-18T14:30:00Z')
const currentOpen = seconds('2026-11-19T14:30:00Z')
const currentEnd = seconds('2026-11-19T21:00:00Z')

const chart = (symbol, volumes = [2, 5]) => ({ chart: { result: [{
  meta: {
    symbol, currency: 'USD', exchangeTimezoneName: 'America/New_York',
    regularMarketTime: currentEnd, currentTradingPeriod: { regular: { start: currentOpen, end: currentEnd } },
  },
  timestamp: [previousOpen, currentOpen],
  indicators: { quote: [{ close: [100, 98], volume: volumes }] },
}] } })

test('uses the exchange session date and ignores today until the reported close', () => {
  const source = chart('SPYG')
  assert.deepEqual(parseMarketSlice(source, 'SPYG', new Date('2026-11-19T20:00:00Z')).history, [['2026-11-18', 100]])
  assert.deepEqual(parseMarketSlice(source, 'SPYG', new Date('2026-11-19T21:15:00Z')).history, [['2026-11-18', 100], ['2026-11-19', 98]])
  assert.throws(() => parseMarketSlice(source, 'SPYV', new Date('2026-11-19T21:15:00Z')), /标的/)
})

test('uses actual early close and excludes nonpositive or missing volume', () => {
  const source = chart('^MID', [0, null])
  const session = source.chart.result[0].meta.currentTradingPeriod.regular
  session.end = seconds('2026-11-19T18:00:00Z')
  source.chart.result[0].meta.regularMarketTime = session.end
  const data = parseMarketSlice(source, '^MID', new Date('2026-11-19T18:16:00Z'))
  assert.equal(data.history.length, 2)
  assert.deepEqual(data.volume, [])
  assert.deepEqual(parseMarketSlice(source, '^MID', new Date('2026-11-19T18:01:00Z')).history, [['2026-11-18', 100]])
})

test('keeps the previous history when a provider fails', async () => {
  const spx = US_MARKET_SLICES.find(slice => slice.id === 'spx')
  const prior = { ...spx, history: [['2026-11-19', 100]], volume: [['2026-11-19', 20]] }
  const result = await buildUsMarketSlices({ previous: { slices: [prior] }, slices: [spx], now: new Date('2026-11-19T20:00:00Z'),
    fetchJson: async () => { throw new Error('HTTP 503') } })
  assert.deepEqual(result.slices[0].history, prior.history)
  assert.match(result.warnings[0], /HTTP 503/)
})

test('keeps a same-source price or volume observation when the new response skips it', async () => {
  const growth = US_MARKET_SLICES.find(slice => slice.id === 'growth')
  const prior = { ...growth, history: [['2026-10-27', 97], ['2026-11-18', 100]], volume: [['2026-10-27', 123], ['2026-11-18', 456]] }
  const source = chart(growth.symbol, [null, 5])
  const result = source.chart.result[0]
  for (let day = 28; day <= 48; day++) {
    result.timestamp.unshift(seconds('2026-10-01T14:30:00Z') + (day - 1) * 86400)
    result.indicators.quote[0].close.unshift(99)
    result.indicators.quote[0].volume.unshift(7)
  }
  const snapshot = await buildUsMarketSlices({ previous: { slices: [prior] }, slices: [growth],
    now: new Date('2026-11-19T22:00:00Z'), fetchJson: async () => source, fetchHtml: async () => { throw new Error('Unavailable') } })
  assert.deepEqual(snapshot.slices[0].history[0], ['2026-10-27', 97])
  assert.deepEqual(snapshot.slices[0].volume.at(-2), ['2026-11-18', 456])
  assert.deepEqual(snapshot.slices[0].volume.at(-1), ['2026-11-19', 5])
})

test('reads only the dated sponsor fund table and validates the fund ticker', () => {
  const fundTable = `<title>XLK: sector</title><section><h2>Fund Characteristics
    <span class="date">as of Nov 18 2026</span></h2>
    <tr><th class="label" scope="row">Est. 3-5 Year EPS Growth<span>Tip</span></th><td class="data">30.85%</td></tr>
    <tr><th class="label" scope="row">Price/Earnings Ratio FY1<span>Tip</span></th><td class="data">19.76</td></tr>
    </section><section><h2>Index Characteristics</h2><tr><th>Price/Earnings Ratio FY1</th><td>30</td></tr></section>`
  assert.deepEqual(parseFundCharacteristics(fundTable, 'XLK', new Date('2026-11-19T19:00:00Z')), {
    date: '2026-11-18', valuation: 19.76, earnings: 30.85,
  })
  assert.throws(() => parseFundCharacteristics(fundTable, 'XLE', new Date('2026-11-19T19:00:00Z')), /标的/)
  assert.throws(() => parseFundCharacteristics(fundTable, 'XLK', new Date('2026-11-18T00:00:00Z')), /日期/)
})

test('accumulates revisions only from the same scope and source', async () => {
  const spx = US_MARKET_SLICES.find(slice => slice.id === 'spx')
  const prior = {
    ...spx, history: [],
    valuation: { date: '2026-11-18', value: 17, scope: '项目指数成分股汇总 · 前瞻 P/E', history: [['2026-11-17', 18], ['2026-11-18', 17]] },
  }
  const update = valuation => buildUsMarketSlices({
    previous: { slices: [{ ...prior, valuation }] }, slices: [spx], now: new Date('2026-11-19T22:00:00Z'),
    indexHistory: { indexes: { spx: { agg: { date: '2026-11-19', fwd: 16.9 } } } },
    fetchJson: async () => { throw new Error('Unavailable') },
  })
  const updated = (await update(prior.valuation)).slices[0]
  assert.deepEqual(updated.valuation.history, [['2026-11-17', 18], ['2026-11-18', 17], ['2026-11-19', 16.9]])
  assert.match(updated.priceNote, /分红/)
  const differentScope = (await update({ ...prior.valuation, scope: '另一个样本' })).slices[0]
  assert.deepEqual(differentScope.valuation.history, [['2026-11-19', 16.9]])
})

test('keeps calendar dates with raw volume and leaves unchanged snapshots untouched', async () => {
  const growth = US_MARKET_SLICES.find(slice => slice.id === 'growth')
  const prior = { ...growth, history: [['2025-11-28', 100]], volume: [['2025-11-28', 25]] }
  const options = {
    slices: [growth], fetchJson: async () => { throw new Error('Offline') }, fetchHtml: async () => { throw new Error('Offline') },
  }
  const first = await buildUsMarketSlices({
    ...options, previous: { slices: [prior] }, now: new Date('2026-11-19T21:15:00Z'),
  })
  assert.deepEqual(first.shortSessions, [
    '2024-07-03', '2024-11-29', '2024-12-24', '2025-07-03', '2025-11-28', '2025-12-24',
    '2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24',
  ])
  assert.equal(first.shortSessionsSource, 'https://www.nyse.com/trade/hours-calendars')
  assert.deepEqual(first.slices[0].volume, prior.volume)
  const second = await buildUsMarketSlices({
    ...options, previous: first, now: new Date('2026-11-20T21:15:00Z'),
  })
  assert.equal(second, first)
})

test('keeps recent daily closes and one close per week before them', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => [new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), { close: i }])
  const compact = compactPrices(rows)
  assert.deepEqual(compact.slice(-420), rows.slice(-420))
  assert.ok(compact.length - 420 >= 83 && compact.length - 420 <= 84, String(compact.length))
})

test('纳斯达克综合指数独立读取 NASDAQCOM 收盘，不借用纳指 100 的估值与成交量', async () => {
  const composite = US_MARKET_SLICES.find(slice => slice.id === 'ixic')
  const dates = Array.from({ length: 21 }, (_, n) => '2026-10-' + String(n + 1).padStart(2, '0'))
  const snapshot = await buildUsMarketSlices({ slices: [composite], now: new Date('2026-11-21T16:00:00Z'),
    fetchHtml: async url => {
      assert.equal(url, 'https://fred.stlouisfed.org/data/NASDAQCOM')
      return dates.map(day => day + ',12500.57').join('\n') + '\n2026-11-23,100'
    },
    indexHistory: { indexes: { ndx: { agg: { fwd: 32, date: '2026-11-20' } } } },
  })
  assert.deepEqual(snapshot.warnings, [])
  assert.equal(snapshot.slices[0].symbol, '^IXIC')
  assert.deepEqual(snapshot.slices[0].history.at(-1), [dates.at(-1), 12500.57])
  assert.equal(snapshot.slices[0].valuation, undefined)
  assert.equal(snapshot.slices[0].volume, undefined)
})
