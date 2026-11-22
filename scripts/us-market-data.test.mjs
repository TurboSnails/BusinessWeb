import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectUsMarketData, copperGoldRatio, finraDebtGrowth, mergeSeries, parseAllocation, parseCftc, parseCftcHistory, parseFinra, parseEtfSpread, parseFred,
  compactHistory, corporateSpread, isBotChallenge, parseCboeIndex, parseFearGreed, parseFinraHistory, parseMultpl, parseNaaim, parseFundLiquidity, parseIciFlows, parseMoneyFunds, parseOfrExposure, parseSentiment, parseVolume, parseYahooFuturesClose,
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
  assert.equal(result.warnings.length, 29)
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

test('reads multpl monthly tables including the estimated current month', () => {
  const html = '<table><tr><th>Date</th><th>Value</th></tr><tr><td>Nov 18, 2026</td><td>\n<abbr title="Estimate">†</abbr>\n38.63\n</td></tr>' +
    '<tr><td>Oct 1, 2026</td><td>\n&#x2002;\n40.60\n</td></tr><tr><td>Jan 31, 1900</td><td>\n&#x2002;\n3.24%\n</td></tr></table>'
  assert.deepEqual(parseMultpl(html).history, [['1900-01-31', 3.24], ['2026-10-01', 40.6], ['2026-11-18', 38.63]])
})

test('reads Cboe index CSVs with or without OHLC columns', () => {
  assert.deepEqual(parseCboeIndex('DATE,SKEW\n01/02/1990,126.09\n11/18/2026,142.84\n').history, [['1990-01-02', 126.09], ['2026-11-18', 142.84]])
  assert.deepEqual(parseCboeIndex('DATE,OPEN,HIGH,LOW,CLOSE\n11/18/2026,25,26,24,24.56\n').history, [['2026-11-18', 24.56]])
})

test('keeps the CNN composite history and today\'s component scores on New York dates', () => {
  const json = JSON.stringify({
    fear_and_greed: { score: 18.58, timestamp: '2026-11-19T21:05:02+00:00' },
    fear_and_greed_historical: { data: [{ x: Date.parse('2026-11-18T21:00:00Z'), y: 24.6 }, { x: 0, y: 150 }] },
    junk_bond_demand: { score: 38.6, timestamp: Date.parse('2026-11-19T21:00:00Z') },
  })
  const result = parseFearGreed(json)
  assert.deepEqual(result.fearGreed.history, [['2026-11-18', 24.6], ['2026-11-19', 18.58]])
  assert.deepEqual(result.cnnJunkBond.history, [['2026-11-19', 38.6]])
  assert.equal(result.cnnMomentum, undefined)
})

test('subtracts Aaa from Baa only for months both report', () => {
  const spread = corporateSpread({ history: [['2026-09-01', 5.9], ['2026-10-01', 5.8]] }, { history: [['2026-10-01', 5.33]] })
  assert.deepEqual(spread.history, [['2026-10-01', 0.47]])
})

test('reads the NAAIM public table and rejects out-of-range rows', () => {
  const html = '<table><tr><th>Date</th><th>NAAIM Number</th></tr><tr><td>08/19/2026</td><td>94.49</td></tr><tr><td>08/12/2026</td><td>250</td></tr></table>'
  assert.deepEqual(parseNaaim(html).history, [['2026-08-19', 94.49]])
})

test('流动性保留十亿美元三位精度并排除纽约生效日之后的利率', async () => {
  const result = await collectUsMarketData({}, {
    now: new Date('2026-11-21T01:00:00Z'),
    read: async url => {
      if (url.endsWith('WRESBAL')) return '2026-11-18,2979656'
      if (url.endsWith('RRPONTSYD')) return '2026-11-20,0.401'
      if (url.endsWith('IORB')) return '2024-09-06,5.40\n2024-09-08,5.40\n2026-11-20,3.90\n2026-11-21,3.95'
      throw Error('offline')
    },
    readBinary: async () => { throw Error('offline') },
  })
  assert.deepEqual(result.snapshot.series.bankReserves.history, [['2026-11-18', 2979.656]])
  assert.deepEqual(result.snapshot.series.overnightRrp.history, [['2026-11-20', 0.401]])
  assert.deepEqual(result.snapshot.series.iorb.history, [['2024-09-06', 5.40], ['2024-09-08', 5.40], ['2026-11-20', 3.90]])
})


test('ETF 价差采用市场价格区块日期及展示百分比，保留发行人舍入后的零', () => {
  const source = value => '<title>SPY: fund</title><h2>Other data as of Nov 20 2026</h2><section><h2>Fund Market Price <span>as of Nov 19 2026</span></h2><table><tr><td>30-Day Median Bid/Ask Spread</td><td>' + value + '</td></tr></table></section>'
  assert.deepEqual(parseEtfSpread(source('0.02%'), 'SPY').history, [['2026-11-19', 2]])
  assert.deepEqual(parseEtfSpread(source('0.00%'), 'SPY').history, [['2026-11-19', 0]])
  assert.throws(() => parseEtfSpread(source('—'), 'SPY'))
  assert.throws(() => parseEtfSpread(source('0.01%'), 'SPSM'))
})

const futuresChart = (symbol, bars, { open, end, marketTime } = {}) => ({
  chart: {
    result: [{
      meta: {
        symbol,
        exchangeTimezoneName: 'America/New_York',
        regularMarketTime: marketTime ?? end,
        currentTradingPeriod: { regular: { start: open, end } },
      },
      timestamp: bars.map(([stamp]) => stamp),
      indicators: { quote: [{ close: bars.map(([, close]) => close) }] },
    }],
  },
})

const unixSeconds = iso => Date.parse(iso) / 1000

test('Yahoo 期货以纽约交易日对齐午夜和前晚 18:00 的时间戳', () => {
  for (const stamp of ['2026-11-20T00:00:00-05:00', '2026-11-19T18:00:00-05:00']) {
    const body = futuresChart('HG=F', [[unixSeconds(stamp), 4.25]])
    assert.deepEqual(
      parseYahooFuturesClose(body, 'HG=F', new Date('2026-11-20T18:00:00-05:00')).history,
      [['2026-11-20', 4.25]],
    )
    assert.throws(() => parseYahooFuturesClose(body, 'GC=F'), /格式不符/)
  }
})

test('Yahoo 期货以纽约 17:30 为界过滤末根，兼容夏令时且不依赖会话元数据', () => {
  const prior = unixSeconds('2026-07-15T00:00:00-04:00')
  const current = unixSeconds('2026-07-15T18:00:00-04:00')
  const future = unixSeconds('2026-07-16T18:00:00-04:00')
  const body = futuresChart('GC=F', [[prior, 2650.4], [current, 2661.234], [future, 2670]], {
    open: current, end: unixSeconds('2026-07-16T17:00:00-04:00'), marketTime: current,
  })
  const read = time => parseYahooFuturesClose(body, 'GC=F', new Date(`2026-07-16T${time}-04:00`), 2).history
  assert.deepEqual(read('02:00:00'), [['2026-07-15', 2650.4]])
  assert.deepEqual(read('17:29:59'), [['2026-07-15', 2650.4]])
  assert.deepEqual(read('17:30:00'), [['2026-07-15', 2650.4], ['2026-07-16', 2661.23]])
  assert.deepEqual(read('18:00:00'), [['2026-07-15', 2650.4], ['2026-07-16', 2661.23]])
})

test('Yahoo 期货同日多根取时间戳最大的有效收盘', () => {
  const body = futuresChart('HG=F', [
    [unixSeconds('2026-11-20T00:00:00-05:00'), 4.25],
    [unixSeconds('2026-11-19T18:00:00-05:00'), 4.12],
    [unixSeconds('2026-11-20T01:00:00-05:00'), null],
  ])
  assert.deepEqual(
    parseYahooFuturesClose(body, 'HG=F', new Date('2026-11-20T18:00:00-05:00')).history,
    [['2026-11-20', 4.25]],
  )
})

test('期货与铜金比刷新替换覆盖区间，清除错标或未到收盘时间的旧记录', async () => {
  const previous = {
    series: {
      copperDaily: { history: [['2026-11-13', 3.9], ['2026-11-17', 4], ['2026-11-19', 4.3], ['2026-11-20', 4.9]] },
      goldDaily: { history: [['2026-11-13', 2400], ['2026-11-17', 2500], ['2026-11-19', 2690], ['2026-11-20', 2800]] },
      copperGold: { history: [['2026-11-13', 0.001625], ['2026-11-17', 0.0016], ['2026-11-19', 0.001599], ['2026-11-20', 0.00175]] },
    },
  }
  const stamp = unixSeconds('2026-11-17T18:00:00-05:00')
  const pending = unixSeconds('2026-11-19T18:00:00-05:00')
  const feed = (symbol, price) => JSON.stringify(futuresChart(symbol, [[stamp, price], [pending, price]]))
  const { snapshot: { series } } = await collectUsMarketData(previous, {
    now: new Date('2026-11-20T02:00:00-05:00'),
    read: async url => {
      if (url.includes('HG%3DF')) return feed('HG=F', 4.2)
      if (url.includes('GC%3DF')) return feed('GC=F', 2600)
      throw new Error('unavailable')
    },
    readBinary: async () => { throw new Error('unavailable') },
  })
  assert.deepEqual(series.copperDaily.history, [['2026-11-13', 3.9], ['2026-11-18', 4.2]])
  assert.deepEqual(series.goldDaily.history, [['2026-11-13', 2400], ['2026-11-18', 2600]])
  assert.deepEqual(series.copperGold.history, [['2026-11-13', 0.001625], ['2026-11-18', 0.001615]])
  for (const key of ['copperDaily', 'goldDaily', 'copperGold']) {
    assert.match(series[key].scope, /Yahoo 连续合约收盘价，不是 CME 官方结算价/)
  }
})

test('铜金比只保留同日有效收盘并对齐', () => {
  assert.deepEqual(
    copperGoldRatio(
      [['2026-11-18', 4.2], ['2026-11-19', 4.1], ['2026-11-20', 4.0]],
      [['2026-11-18', 2600], ['2026-11-20', 2500]],
    ),
    [['2026-11-18', 0.001615], ['2026-11-20', 0.0016]],
  )
})

test('铜金源失败时保留旧序列，另一源仍可更新并重算比值', async () => {
  const previous = {
    series: {
      copperDaily: { name: '铜', history: [['2026-11-18', 4.0]] },
      goldDaily: { name: '金', history: [['2026-11-18', 2500]] },
      copperGold: { name: '铜金比', history: [['2026-11-18', 0.0016]] },
    },
  }
  const open = Date.parse('2026-11-19T13:00:00Z') / 1000
  const end = Date.parse('2026-11-19T22:00:00Z') / 1000
  const stamp = Date.parse('2026-11-19T18:00:00Z') / 1000
  const result = await collectUsMarketData(previous, {
    now: new Date('2026-11-19T22:30:00Z'),
    read: async url => {
      if (url.includes('HG%3DF') || url.includes('HG=F')) {
        return JSON.stringify(futuresChart('HG=F', [[stamp, 4.2]], { open, end, marketTime: end }))
      }
      if (url.includes('GC%3DF') || url.includes('GC=F')) throw new Error('HTTP 429')
      throw new Error('unavailable')
    },
    readBinary: async () => { throw new Error('unavailable') },
  })
  assert.deepEqual(result.snapshot.series.copperDaily.history.at(-1), ['2026-11-19', 4.2])
  assert.deepEqual(result.snapshot.series.goldDaily, { ...previous.series.goldDaily, refreshError: 'HTTP 429' })
  assert.deepEqual(result.snapshot.series.copperGold.history, [['2026-11-18', 0.0016]])
  assert.equal(result.snapshot.series.copperGold.refreshError, 'HTTP 429')
})
