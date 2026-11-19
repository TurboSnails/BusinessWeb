import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectUsMarketData, finraDebtGrowth, mergeSeries, parseAllocation, parseCftc, parseCftcHistory, parseFinra, parseFred,
  compactHistory, isBotChallenge, parseFinraHistory, parseFundLiquidity, parseIciFlows, parseMoneyFunds, parseOfrExposure, parseSentiment, parseVolume,
} from './us-market-data.mjs'

const table = (...rows) => '<table>' + rows.map(row => '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') + '</tr>').join('') + '</table>'

test('uses the AAII period end and keeps the publication date separate', () => {
  const html = '<h2>Asset Allocation Results for February 2024 :</h2>' +
    table(['Stock Funds', '41.12%'], ['Stocks Total', '70.07%'], ['Cash <img alt="">', '13.31%']) +
    '<h3>Commentary</h3><p>March 4, 2024</p>'
  const result = parseAllocation(html)
  assert.deepEqual(result.retailCash, { history: [['2024-02-29', 13.31]], releasedAt: '2024-03-04' })
  assert.deepEqual(result.retailStocks.history, [['2024-02-29', 70.07]])
})

test('recognises the Imperva challenge page instead of treating it as a layout change', () => {
  assert.equal(isBotChallenge('<html><script src="/_Incapsula_Resource?SWJIYLWA=1"></script>Incapsula incident ID: 1</html>'), true)
  assert.equal(isBotChallenge('<h2>Asset Allocation Results for October 2026</h2>'), false)
})

test('reads AAII shares past blank spacer cells and trailing monthly changes', () => {
  const html = '<h2>Asset Allocation Results for October 2026 :</h2>' +
    table(['Stocks', '31.92% &nbsp;&nbsp;(-1.52%)'], ['Stocks Total', '&nbsp;\n', '70.07%'], ['Cash', '13.31% &nbsp;&nbsp;(-0.04%)'])
  const result = parseAllocation(html)
  assert.deepEqual(result.retailStocks.history, [['2026-10-31', 70.07]])
  assert.deepEqual(result.retailCash.history, [['2026-10-31', 13.31]])
})

test('reads AAII bullish and bearish columns without shifting neutral sentiment', () => {
  const result = parseSentiment(table(['Week Ending', 'Bullish', 'Neutral', 'Bearish'], ['11/18/2026', '33.3%', '24.4%', '42.2%']))
  assert.deepEqual(result.retailBull.history, [['2026-11-18', 33.3]])
  assert.deepEqual(result.retailBear.history, [['2026-11-18', 42.2]])
  assert.deepEqual(parseSentiment('<h2>Recent weekly results</h2><div>11/18/2026</div><div>33.3%</div><div>24.4%</div><div>42.2%</div><h2>Historical view</h2>').retailBear, result.retailBear)
})

test('ICI reads only the total cash categories and uses the same period as domestic flows', () => {
  const header = ['', '11/11/2026', '11/4/2026', '$ Change*', '10/28/2026']
  const mmf = parseMoneyFunds('<h2>Money Market Fund Assets</h2>' +
    table(header, ['Government', '6,589.63', '6,622.38', '-32.76', '6,504.59'], ['Retail', '1,985.66'], ['Institutional', '4,603.96'],
      ['Total&nbsp;', '7,980.02', '8,015.74', '-35.72', '7,901.28'], ['Retail', '3,114.88', '3,119.28', '-4.40', '3,107.07'],
      ['Institutional', '4,865.14', '4,896.46', '-31.32', '4,794.21']))
  assert.deepEqual(mmf.mmfTotal.history, [['2026-11-11', 79800.2], ['2026-11-04', 80157.4], ['2026-10-28', 79012.8]])
  assert.deepEqual(mmf.mmfRetail.history[0], ['2026-11-11', 31148.8])
  assert.equal(mmf.mmfInstitutional.history[0][1], 48651.4)
  const flows = parseIciFlows('<h2>Combined Estimated Long-Term Fund Flows</h2>' +
    table(header, ['Equity', '37,020'], ['Domestic', '31,505', '11,913', '', '7,096'], ['World', '5,515']))
  assert.deepEqual(flows.domesticFlows.history[0], ['2026-11-11', 315.05])
})

test('checks ICI cash statistic by its exact definition and keeps the original release link', () => {
  const url = 'https://www.ici.org/research/stats/trends_09_26'
  const html = '<h1>Release: Trends in Mutual Fund Investing, September 2026</h1><time>October 29, 2026</time>' +
    '<p>The liquidity ratio of equity funds (the percentage of liquid assets over total net assets) was 1.5 percent in September, unchanged from August.</p>'
  assert.deepEqual(parseFundLiquidity(html, url).fundLiquidity, {
    history: [['2026-09-30', 1.5]], releasedAt: '2026-10-29', source: url,
  })
})

test('Cboe sums venue share counts, deduplicates overlapping files and uses the previous 20 sessions', () => {
  const rows = Array.from({ length: 21 }, (_, i) => {
    const day = `2026-11-${String(i + 1).padStart(2, '0')}`
    return `${day},NYSE (N),${i === 20 ? 200000000 : 100000000}\n${day},FINRA TRF (Q),${i === 20 ? 200000000 : 100000000}`
  })
  const file = ['Day,Market Participant,Total Shares', ...rows].join('\n')
  const { volume, volumeRatio } = parseVolume([file, file])
  assert.deepEqual(volume.history.at(-1), ['2026-11-21', 4])
  assert.deepEqual(volumeRatio.history, [['2026-11-21', 2]])
})

test('Cboe omits incomplete venue days, omits the cutoff, and keeps shortened sessions only in raw volume', () => {
  const header = 'Day,Market Participant,Total Shares'
  const days = Array.from({length: 20}, (_, index) => ['2026-11-' + String(index + 1).padStart(2, '0'), 100000, true])
  days.push(['2026-11-26', 100000, false], ['2026-11-27', 50000, true],
    ['2026-11-30', 200000, true], ['2026-12-01', 100000, true])
  const csv = [header, ...days.flatMap(([date, shares, complete]) => [
    date + ',NYSE (N),' + shares, ...(complete ? [date + ',FINRA / Nasdaq TRF Carteret (DQ),' + shares] : []),
  ])].join('\n')
  const result = parseVolume([csv], { before: '2026-12-01', requiredVenues: ['N', 'DQ'] })
  assert.deepEqual(result.volume.history.slice(-2), [['2026-11-27', .001], ['2026-11-30', .004]])
  assert.deepEqual(result.volumeRatio.history, [['2026-11-30', 2]])
})

test('production Cboe collector excludes the date in New York even after UTC advances', async () => {
  const header = 'Day,Market Participant,Total Shares'
  const venueCodes = ['N', 'P', 'Q', 'K', 'Z', 'DN', 'DQ']
  const rows = ['2026-11-18', '2026-11-19', '2026-11-20'].flatMap(day =>
    venueCodes.map(code => day + ',Test Venue (' + code + '),100000'))
  const result = await collectUsMarketData({ series: {} }, {
    now: new Date('2026-11-20T01:00:00Z'),
    read: async url => {
      if (url.endsWith('market_history_2026.csv')) return [header, ...rows].join('\n')
      if (url.endsWith('market_history_2025.csv')) return header
      if (url.endsWith('/DGS10')) return '2026-11-18,5.07'
      throw new Error('unavailable')
    },
    readBinary: async () => { throw new Error('unavailable') },
  })
  assert.deepEqual(result.snapshot.series.volume.history, [['2026-11-18', .007]])
  assert.deepEqual(result.snapshot.series.tenYearDaily.history, [['2026-11-18', 5.07]])
})

test('uses only exact CFTC consolidated contracts and divides by open interest', () => {
  const report = `Traders in Financial Futures - Futures Only Positions as of November 10, 2026
S&P 500 Consolidated - CHICAGO MERCANTILE EXCHANGE
CFTC Code #13874+ Open Interest is 2,048,000
Positions
175,745 915,197 78,583 1,118,222 201,626 120,079 146,292 440,983 74,454 68,298 68,019 303 266,024 148,755
NASDAQ-100 Consolidated - CHICAGO MERCANTILE EXCHANGE
CFTC Code #20974+ Open Interest is 306,100
Positions
45,418 141,571 12,551 109,101 35,206 5,090 56,390 43,501 14,733 8,872 15,966 0 53,945 37,483
`
  const rows = parseCftc(report)
  assert.deepEqual(rows.cftcSpxLev.history, [['2026-11-10', -14.39]])
  assert.deepEqual(rows.cftcNdxLev.history, [['2026-11-10', 4.21]])
  assert.deepEqual(rows.cftcSpxAsset.history, [['2026-11-10', 44.76]])
  assert.deepEqual(rows.cftcNdxAsset.history, [['2026-11-10', 24.14]])
})

test('CFTC electronic report isolates the contract code and retains dated history', () => {
  const row = {
    report_date_as_yyyy_mm_dd: '2026-11-10T00:00:00.000', cftc_contract_market_code: '13874+',
    open_interest_all: '1000', asset_mgr_positions_long: '500', asset_mgr_positions_short: '25',
    lev_money_positions_long: '100', lev_money_positions_short: '300',
  }
  const other = { ...row, cftc_contract_market_code: '20974+' }
  const excluded = { ...row, cftc_contract_market_code: '13874A', asset_mgr_positions_long: '999' }
  const result = parseCftcHistory(JSON.stringify([row, excluded, other]))
  assert.deepEqual(result.cftcSpxLev.history, [['2026-11-10', -20]])
  assert.deepEqual(result.cftcNdxAsset.history, [['2026-11-10', 47.5]])
})

test('FINRA and FRED respect units and skip missing readings', () => {
  const finra = parseFinra(table(['Month/Year', 'Debit Balances', 'Cash', 'Margin'], ['Oct-26', '1,448,360', '210,290', '212,890']))
  assert.deepEqual(finra.finraDebt.history, [['2026-10-31', 14483.6]])
  assert.deepEqual(finra.finraCashDebt.history, [['2026-10-31', 29.22]])
  const fred = parseFred('observation_date,BAMLH0A0HYM2\n2026-11-13,3.23\n2026-11-15,.\n2026-11-18,3.47', 100)
  assert.deepEqual(fred.history, [['2026-11-13', 323], ['2026-11-18', 347]])
  assert.deepEqual(finraDebtGrowth([['2023-02-28', 100], ['2024-02-29', 140], ['2025-03-31', 160]]), [['2024-02-29', 40]])
})

test('OFR keeps non-US exposures in the aggregate scope and combines only aligned observations', () => {
  const feed = {
    'FPF-ASSETCLASS_EQUITIES_GNE_SUM': { timeseries: { aggregation: [['2026-06-30', 10315000000000]] } },
    'FPF-ASSETCLASS_LEQYSEC_SUM': { timeseries: { aggregation: [['2026-06-30', 4069000000000], ['2026-09-30', 4070000000000]] } },
    'FPF-ASSETCLASS_SEQYSEC_SUM': { timeseries: { aggregation: [['2026-06-30', 1646000000000]] } },
  }
  const series = parseOfrExposure(JSON.stringify(feed))
  assert.deepEqual(series.ofrEquityGross.history, [['2026-06-30', 103150]])
  assert.deepEqual(series.ofrCashEquityLs.history, [['2026-06-30', 2.472]])
})

test('merging revisions preserves newer readings and their source metadata', () => {
  const previous = { source: 'new', releasedAt: '2026-11-20', history: [['2026-11-12', 1], ['2026-11-19', 2]] }
  const incoming = { source: 'old', releasedAt: '2026-11-13', history: [['2026-11-12', 1.1], ['2026-11-05', 0]] }
  assert.deepEqual(mergeSeries(previous, incoming), {
    source: 'new', releasedAt: '2026-11-20', history: [['2026-11-05', 0], ['2026-11-12', 1], ['2026-11-19', 2]],
  })
  assert.deepEqual(mergeSeries(previous, { history: [] }), previous)
})

test('a failed live source preserves its dated snapshot while other sources refresh', async () => {
  const retailCash = { name: 'AAII', history: [['2026-10-31', 13.31]] }
  const previous = { series: { retailCash } }
  const result = await collectUsMarketData(previous, {
    now: new Date('2026-11-19'),
    read: async url => {
      if (url.endsWith('BAMLH0A0HYM2')) return '2026-11-18,3.47'
      throw new Error('unavailable')
    },
    readBinary: async () => { throw new Error('unavailable') },
  })
  assert.equal(result.sourcesUpdated, 1)
  assert.equal(result.warnings.length, 12)
  assert.deepEqual(result.snapshot.series.retailCash, { ...retailCash, refreshError: 'unavailable' })
  assert.deepEqual(result.snapshot.series.hyDaily.history, [['2026-11-18', 347]])
})

test('compacts daily history to weekly closes beyond the latest 400 days', () => {
  const days = Array.from({ length: 800 }, (_, i) => [new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), i])
  const compact = compactHistory(days, '日频')
  const cutoff = new Date(Date.parse(days.at(-1)[0]) - 400 * 86_400_000).toISOString().slice(0, 10)
  assert.deepEqual(compact.filter(([day]) => day >= cutoff), days.filter(([day]) => day >= cutoff))
  const older = compact.filter(([day]) => day < cutoff)
  assert.ok(older.length >= 56 && older.length <= 58, String(older.length))
  assert.deepEqual(compact.at(-1), days.at(-1))
  assert.equal(compactHistory(days, '月频').length, 800)
})

test('converts the FINRA workbook to month-end readings in the web-table units', () => {
  const result = parseFinraHistory([{ date: '1997-01-01', debit: 103337, cash: 68856, margin: 0 }, { date: '2026-10-01', debit: 1448360, cash: 210290, margin: 212890 }])
  assert.deepEqual(result.finraDebt.history, [['1997-01-31', 1033.37], ['2026-10-31', 14483.6]])
  assert.deepEqual(result.finraCashDebt.history.at(-1), ['2026-10-31', 29.22])
})
