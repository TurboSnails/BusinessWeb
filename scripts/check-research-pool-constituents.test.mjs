import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSp500Csv,
  parseNasdaq100ListType,
  parseQqqEquityHoldings,
  officialCsi300FromUniverses,
  researchCodesFromCompanyIndex,
  diffResearchVsOfficial,
  diffFromSampleBodies,
  checkResearchPoolConstituents,
} from './check-research-pool-constituents.mjs'

const SP500_CSV = `Symbol,Security,GICS Sector
AAPL,Apple,Information Technology
MSFT,Microsoft,Information Technology
"BRK.B","Berkshire Hathaway",Financials
not-a-ticker,BadSymbol,Information Technology
`

const nasdaqBody = (symbols, date = 'Nov 25, 2026') => ({
  data: {
    totalrecords: symbols.length,
    date,
    data: { rows: symbols.map(symbol => ({ symbol, companyName: symbol, sector: 'X' })) },
  },
  message: 'Success',
  status: { rCode: 200 },
})

const qqqBody = (equities, { cash = true } = {}) => ({
  cusip: 'QQQ',
  effectiveDate: '2026-11-26',
  effectiveBusinessDate: '2026-11-25',
  totalNumberOfHoldings: equities.length + (cash ? 1 : 0),
  holdings: [
    ...equities.map(ticker => ({ ticker, securityTypeCode: 'COM', issuerName: ticker })),
    ...(cash ? [{ ticker: 'USD', securityTypeCode: 'CURR', issuerName: 'CASH' }] : []),
  ],
})

const csiUniverse = (codes, date = '2026-11-25') => ({
  status: 'ok',
  date,
  source: 'https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/cons/000300cons.xls',
  codes,
})

test('parseSp500Csv 解析 Symbol 并忽略非法行', () => {
  assert.deepEqual(parseSp500Csv(SP500_CSV), ['AAPL', 'BRK.B', 'MSFT'])
})

test('parseNasdaq100ListType 解析 rows 与日期', () => {
  const r = parseNasdaq100ListType(nasdaqBody(['NVDA', 'aapl', 'MSFT']), { minCount: 1 })
  assert.deepEqual(r.codes, ['AAPL', 'MSFT', 'NVDA'])
  assert.equal(r.date, '2026-11-25')
})

test('parseQqqEquityHoldings 只保留 COM/ADR/DRNY', () => {
  const body = {
    effectiveBusinessDate: '2026-11-25',
    holdings: [
      { ticker: 'AAPL', securityTypeCode: 'COM' },
      { ticker: 'ASML', securityTypeCode: 'DRNY' },
      { ticker: 'ARM', securityTypeCode: 'ADR' },
      { ticker: 'USD', securityTypeCode: 'CURR' },
      { ticker: 'NQZ6', securityTypeCode: 'IFUT' },
      { ticker: null, securityTypeCode: 'CURRCOL' },
    ],
  }
  const r = parseQqqEquityHoldings(body, { minCount: 1 })
  assert.deepEqual(r.codes, ['AAPL', 'ARM', 'ASML'])
  assert.equal(r.date, '2026-11-25')
})

test('officialCsi300FromUniverses 补零去重；非 ok 返回 null', () => {
  const ok = officialCsi300FromUniverses({ csi300: csiUniverse(['1', '000001', '600519']) })
  assert.deepEqual(ok.codes, ['000001', '600519'])
  assert.equal(officialCsi300FromUniverses({ csi300: { status: 'missing' } }), null)
})

test('researchCodesFromCompanyIndex 按市场过滤；cn 补六位', () => {
  const doc = {
    items: [
      { c: 'AAPL', m: 'us' },
      { c: 'TSM', m: 'adr' },
      { c: 'ALNY', m: 'ndx' },
      { c: '1', m: 'cn' },
      { c: '600519', m: 'cn' },
    ],
  }
  assert.deepEqual(researchCodesFromCompanyIndex(doc, ['us']), ['AAPL'])
  assert.deepEqual(researchCodesFromCompanyIndex(doc, ['us', 'adr', 'ndx']), ['AAPL', 'ALNY', 'TSM'])
  assert.deepEqual(researchCodesFromCompanyIndex(doc, ['cn']), ['000001', '600519'])
})

test('diffResearchVsOfficial 列出缺漏与多出；多出不算失败', () => {
  const r = diffResearchVsOfficial({
    officialCodes: ['AAPL', 'MSFT', 'NVDA'],
    researchCodes: ['AAPL', 'EXTRA'],
    dates: { asOf: '2026-11-27' },
  })
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, ['MSFT', 'NVDA'])
  assert.deepEqual(r.extra, ['EXTRA'])
})

test('diffFromSampleBodies 用固定三源样例比对（不联网）', () => {
  const result = diffFromSampleBodies({
    sp500Csv: SP500_CSV,
    nasdaqBody: nasdaqBody(['AAPL', 'MSFT', 'NVDA']),
    csiUniverse: csiUniverse(['000001', '600519', '002294']),
    researchUs: ['AAPL', 'MSFT', 'CTVA'],
    researchNdxPool: ['AAPL', 'MSFT'],
    researchCn: ['000001', '600519', '300750'],
  })
  assert.deepEqual(result.sp500.missing, ['BRK.B'])
  assert.ok(result.sp500.extra.includes('CTVA'))
  assert.deepEqual(result.ndx.missing, ['NVDA'])
  assert.equal(result.ndx.dates.asOf, '2026-11-25')
  assert.deepEqual(result.csi300.missing, ['002294'])
  assert.ok(result.csi300.extra.includes('300750'))
})

test('diffFromSampleBodies 可用 QQQ 样例代替 Nasdaq', () => {
  const result = diffFromSampleBodies({
    sp500Csv: SP500_CSV,
    qqqBody: qqqBody(['AAPL', 'MSFT', 'NVDA']),
    csiUniverse: csiUniverse(['000001']),
    researchUs: ['AAPL', 'MSFT', 'BRK.B'],
    researchNdxPool: ['AAPL', 'MSFT', 'NVDA'],
    researchCn: ['000001'],
  })
  assert.equal(result.sp500.ok, true)
  assert.equal(result.ndx.ok, true)
  assert.equal(result.csi300.ok, true)
})

test('checkResearchPoolConstituents 注入 fetch 只告警不抛错', async () => {
  const lines = []
  const log = { log: m => lines.push(['log', m]), warn: m => lines.push(['warn', m]) }
  const fetchImpl = async url => {
    if (String(url).includes('constituents.csv')) {
      return { ok: true, text: async () => SP500_CSV }
    }
    if (String(url).includes('list-type/nasdaq100')) {
      return { ok: true, text: async () => JSON.stringify(nasdaqBody(['AAPL', 'MSFT'])) }
    }
    return { ok: false, status: 404, text: async () => '' }
  }
  const result = await checkResearchPoolConstituents({ fetchImpl, log })
  assert.ok(result.sp500)
  assert.ok(result.ndx)
  assert.ok(result.csi300)
  assert.ok(lines.length >= 1)
  assert.equal(typeof result.sp500.ok, 'boolean')
  assert.ok(Array.isArray(result.sp500.missing))
})
