import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanName, collectHk, statementCurrency, collectUsFacts, yahooSymbol, parseYahooWeekly, parseYahooMonthly, fcfYieldHistory, sicIndustry, parseCompanyLines, parseNdxCodes, parseQuotes, parseWeekly, secShares, tencentSymbol, weeklyBeta } from './dcf-prefill.mjs'

test('universe parsers read NDX array and research company lines', () => {
  assert.deepEqual(parseNdxCodes("export const NDX_CODES: string[] = [\n  'ADBE', 'GOOGL',\n  'BRK.B',\n]\nconst X = ['ZZZ']"), ['ADBE', 'GOOGL', 'BRK.B'])
  assert.deepEqual(parseCompanyLines('600519|贵州茅台|白酒|x\nAAPL|苹果|科技|x\n00700|腾讯|互联网|x\nfoo|bar'), [
    { market: 'cn', code: '600519', name: '贵州茅台' }, { market: 'us', code: 'AAPL', name: '苹果' }, { market: 'hk', code: '00700', name: '腾讯' }])
  assert.equal(tencentSymbol('cn', '600519'), 'sh600519')
  assert.equal(tencentSymbol('cn', '000001'), 'sz000001')
  assert.equal(tencentSymbol('cn', '830799'), 'bj830799')
  assert.deepEqual(['cn:600519', 'cn:000001', 'cn:300750', 'hk:00700', 'hk:09988', 'us:BRK.B', 'cn:830799'].map(k => yahooSymbol(...k.split(':'))), ['600519.SS', '000001.SZ', '300750.SZ', '0700.HK', '9988.HK', 'BRK-B', null])
  assert.deepEqual(parseYahooWeekly({ chart: { result: [{ timestamp: [1760918400, 1761523200], indicators: { adjclose: [{ adjclose: [10, null] }] } }] } }), [['2025-10-20', 10]])
})

test('Tencent quote batch keeps name, price and date; skips suspended rows', () => {
  const row = (sym, name, price, date, shares = '') => { const v = Array(88).fill(''); v[1] = name; v[3] = price; v[30] = date; v[sym.startsWith('hk') ? 70 : 73] = shares; return `v_${sym}="${v.join('~')}";` }
  const text = [row('sh600519', '贵州茅台', '1324.97', '20261019161457', '1250081601'), row('usAAPL', '苹果', '342.94', '2026-10-19 16:00:01'), row('hk09999', '停牌', '0', '')].join('\n')
  const q = parseQuotes(text)
  assert.deepEqual(q.get('sh600519'), { name: '贵州茅台', price: 1324.97, date: '2026-10-19', totalShares: 1250081601 })
  assert.equal(q.get('usAAPL').date, '2026-10-19')
  assert.equal(q.has('hk09999'), false)
})

test('Tencent quotes taken before the session close are flagged as live with their time', () => {
  const row = (sym, price, date) => { const v = Array(88).fill(''); v[1] = '样本'; v[3] = price; v[30] = date; return `v_${sym}="${v.join('~')}";` }
  const q = parseQuotes([
    row('sz002001', '25.88', '20261027093412'), row('sh600519', '1300', '20261027150003'), row('sh600547', '25', '20261027113000'),
    row('hk03690', '75.2', '2026/10/27 10:15:00'), row('hk00700', '500', '2026/10/27 16:08:30'), row('usAAPL', '300', '2026-10-26 16:00:01'),
  ].join('\n'))
  assert.deepEqual([q.get('sz002001').live, q.get('sz002001').time], [true, '09:34'])
  assert.equal(q.get('sh600519').live, undefined)
  assert.equal(q.get('sh600547').live, true)
  assert.equal(q.get('hk03690').live, true)
  assert.equal(q.get('hk00700').live, undefined)
  assert.equal(q.get('usAAPL').live, undefined)
})

test('beta is the OLS slope of aligned weekly returns, Blume-adjusted and clamped', () => {
  const weeks = Array.from({ length: 80 }, (_, i) => new Date(Date.UTC(2025, 0, 3 + 7 * i)).toISOString().slice(0, 10))
  let b = 100, s = 100
  const bench = [], stock = []
  weeks.forEach((d, i) => { const r = (i % 3 - 1) * 0.02; b *= 1 + r; s *= 1 + 1.5 * r; bench.push([d, b]); stock.push([d, s]) })
  const beta = weeklyBeta(stock, bench)
  assert.equal(beta.raw, 1.5)
  assert.equal(beta.adjusted, Number((0.67 * 1.5 + 0.33).toFixed(3)))
  assert.equal(beta.weeks, 79)
  assert.equal(weeklyBeta(stock.slice(0, 30), bench), null)
  assert.deepEqual(parseWeekly({ code: 0, data: { sh000300: { qfqweek: [['2026-10-16', '1', '4108.24']] } } }, 'sh000300'), [['2026-10-16', 4108.24]])
})

test('SEC shares sum share classes from the latest filing', () => {
  const dei = { EntityCommonStockSharesOutstanding: { units: { shares: [
    { end: '2025-10-01', filed: '2025-10-30', val: 100 }, { end: '2026-01-20', filed: '2026-02-01', val: 5 }, { end: '2026-01-20', filed: '2026-02-01', val: 7 }] } } }
  assert.deepEqual(secShares(dei), { value: 12, date: '2026-01-20', classes: 2 })
  assert.equal(secShares({}), null)
})

test('SEC series merge tags across years and keep the reporting currency', () => {
  const annual = (end, val) => ({ start: `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`.replace(/-12-31$/, '-12-31'), end, val, filed: `${Number(end.slice(0, 4)) + 1}-02-01` })
  const yr = (y, v) => ({ ...annual(`${y}-12-31`, v), start: `${y}-01-01`, fp: 'FY', form: '10-K' })
  const raw = { facts: { 'us-gaap': {
    Revenues: { units: { EUR: [yr(2025, 300)] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { EUR: [yr(2024, 280), yr(2023, 250)] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { EUR: [yr(2025, 120), yr(2024, 100), yr(2023, 90), { start: '2025-07-01', end: '2026-06-30', val: 999, filed: '2026-08-01', fp: 'Q2', form: '10-Q' }] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { EUR: [yr(2025, 20), yr(2024, 15), yr(2023, 10)] } },
    LongTermDebt: { units: { EUR: [{ end: '2025-12-31', val: 40, filed: '2026-02-01' }] } },
    WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [yr(2025, 3.9e8)] } },

  } } }
  const out = collectUsFacts(raw, '2026-10-20')
  assert.equal(out.currency, 'EUR')
  assert.deepEqual(out.years.map(y => [y.fy, y.revenue, y.ocf, y.capex]), [['2025-12-31', 300, 120, 20], ['2024-12-31', 280, 100, 15], ['2023-12-31', 250, 90, 10]])
  assert.equal(out.latest.debt, 40)
  assert.equal(out.latest.shares, 3.9e8)
  assert.ok(out.notes.some(n => n.includes('加权平均稀释股数')))
  assert.throws(() => collectUsFacts({ facts: { dei: {} } }, '2026-10-20'), /US-GAAP/)
})

test('HK statements are standardised in HKD even when the filing currency is USD or CNY', async () => {
  const reply = (url) => {
    const name = new URL(url).searchParams.get('reportName')
    if (name === 'RPT_HKF10_FN_MAININDICATOR') return { result: { data: [{ REPORT_DATE: '2025-12-31 00:00:00', CURRENCY: 'HKD', OPERATE_INCOME: 52315358400, NETCASH_OPERATE: 14796000000, ORG_TYPE: '' }] } }
    if (name === 'RPT_CUSTOM_HKSK_APPFN_CASHFLOW_SUMMARY') return { result: { data: [{ REPORT_LIST: [{ REPORT_DATE: '2025-12-31 00:00:00', CURRENCY: '美元' }] }] } }
    return { result: { data: [] } }
  }
  const out = await collectHk('01928', { json: async (url) => reply(url) })
  assert.equal(out.currency, 'HKD')
  assert.equal(out.years[0].revenue, 52315358400)
  assert.ok(out.notes.some(n => n.includes('原报告币种') && n.includes('美元')))
})

test('statementCurrency: HK statements are always HKD, including entries cached with the filing currency', () => {
  assert.equal(statementCurrency('hk', { currency: 'USD' }), 'HKD')
  assert.equal(statementCurrency('hk', { currency: 'CNY' }), 'HKD')
  assert.equal(statementCurrency('us', { currency: 'EUR' }), 'EUR')
  assert.equal(statementCurrency('cn', { currency: 'CNY' }), 'CNY')
  assert.equal(statementCurrency('us', undefined), undefined)
})

test('SEC balance sheet: a stale first tag does not block a fresh fallback tag; debt reads capital-lease tags', () => {
  const yr = (y, v) => ({ start: `${y}-01-01`, end: `${y}-12-31`, val: v, filed: `${y + 1}-02-01`, fp: 'FY', form: '10-K' })
  const inst = (end, val) => ({ end, val, filed: `${Number(end.slice(0, 4)) + 1}-02-01`, form: '10-K' })
  const base = {
    Revenues: { units: { USD: [yr(2025, 1000), yr(2024, 900), yr(2023, 800)] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [yr(2025, 300), yr(2024, 280), yr(2023, 250)] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [yr(2025, 100), yr(2024, 90), yr(2023, 80)] } },
    WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [yr(2025, 1e8)] } },
  }
  const out = collectUsFacts({ facts: { 'us-gaap': {
    ...base,
    CashAndCashEquivalentsAtCarryingValue: { units: { USD: [inst('2022-12-31', 2000)] } },
    CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: { units: { USD: [inst('2025-12-31', 670)] } },
    LongTermDebtAndCapitalLeaseObligations: { units: { USD: [inst('2025-12-31', 18165)] } },
    LongTermDebtAndCapitalLeaseObligationsCurrent: { units: { USD: [inst('2025-12-31', 708)] } },
  } } }, '2026-10-20')
  assert.equal(out.latest.cash, 670)
  assert.equal(out.latest.debt, 18873)
  const total = collectUsFacts({ facts: { 'us-gaap': { ...base, DebtAndCapitalLeaseObligations: { units: { USD: [inst('2025-12-31', 500)] } } } } }, '2026-10-20')
  assert.equal(total.latest.debt, 500)
})

test('FCF yield history uses the latest annual FCF published 4 months after year end, against current shares', () => {
  const months = []
  for (let y = 2022; y <= 2026; y++) for (let m = 1; m <= 12; m++) if (y < 2026 || m <= 10) months.push([`${y}-${String(m).padStart(2, '0')}`, 100])
  const years = [{ fy: '2025-12-31', ocf: 120, capex: 20, sbc: 0 }, { fy: '2024-12-31', ocf: 60, capex: 10 }, { fy: '2023-12-31', ocf: 40, capex: 10 }]
  const h = fcfYieldHistory(years, months, 10, 1, 100)
  // price 100 × 10 shares = 1000; FCF 100 (2025, from 2026-05), 50 (2024), 30 (2023)
  assert.equal(h.now, 10)
  assert.equal(h.hi, 10)
  assert.equal(h.lo, 3)
  assert.ok(h.pct > 80)
  assert.equal(fcfYieldHistory(years, months.slice(-10), 10, 1, 100), null)
  assert.deepEqual(parseYahooMonthly({ chart: { result: [{ timestamp: [1759276800], indicators: { quote: [{ close: [1323.554] }] } }] } }), [['2025-10', 1323.55]])
  assert.equal(sicIndustry(7372, 'Services-Prepackaged Software'), '软件与互联网服务')
  assert.equal(sicIndustry(9999, 'Nonclassifiable'), 'Nonclassifiable')
})

test('names: full-width to half-width, CJK spaces removed, English spaces kept', () => {
  assert.equal(cleanName('万  科Ａ'), '万科A')
  assert.equal(cleanName('Adobe  Inc.'), 'Adobe Inc.')
  assert.equal(cleanName('Meta Platforms'), 'Meta Platforms')
})
