import test from 'node:test'
import assert from 'node:assert/strict'
import { collectUsFacts, yahooSymbol, parseYahooWeekly, parseCompanyLines, parseNdxCodes, parseQuotes, parseWeekly, secShares, tencentSymbol, weeklyBeta } from './dcf-prefill.mjs'

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
  const row = (sym, name, price, date) => { const v = Array(40).fill(''); v[1] = name; v[3] = price; v[30] = date; return `v_${sym}="${v.join('~')}";` }
  const text = [row('sh600519', '贵州茅台', '1324.97', '20261019161457'), row('usAAPL', '苹果', '342.94', '2026-10-19 16:00:01'), row('hk09999', '停牌', '0', '')].join('\n')
  const q = parseQuotes(text)
  assert.deepEqual(q.get('sh600519'), { name: '贵州茅台', price: 1324.97, date: '2026-10-19' })
  assert.equal(q.get('usAAPL').date, '2026-10-19')
  assert.equal(q.has('hk09999'), false)
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
  const annual = (end, val, unit = 'EUR') => ({ start: `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`.replace(/-12-31$/, '-12-31'), end, val, filed: `${Number(end.slice(0, 4)) + 1}-02-01` })
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
