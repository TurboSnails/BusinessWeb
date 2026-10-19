import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAutoSnapshot, computeErpZ, factProblem, isFatal, mergeFacts, parseCsindexPe, parseFredCsv, parseHsiPe, parseMargin,
  parseSouthboundPage, parseSouthboundRows,
  parseSseEtf, parseTreasuryPage, parseYahooCnh, runXlsxParser, writeAtomic, ETF_WHITELIST, SOURCES, URLS,
} from './market-cycle-auto.mjs'

const NOW = '2026-10-17T10:00:00.000Z'

test('southbound missing scalars never become a zero observation', () => {
  for (const value of ['', '   ', false, []]) {
    const body = { success: true, result: { data: [{ MUTUAL_TYPE: '006', TRADE_DATE: '2026-10-16', NET_DEAL_AMT: value }] } }
    assert.throws(() => parseSouthboundPage(body, '006'), /NET_DEAL_AMT/)
  }
})
const json = body => ({ ok: true, status: 200, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
const fact = (over = {}) => ({
  metricId: 'pe', market: 'csi300', value: 12.88, observationDate: '2026-10-16', availableAt: null, firstSeenAt: '2026-10-01T00:00:00.000Z',
  fetchedAt: '2026-10-01T00:00:00.000Z', source: 'https://example.com/x', unit: '倍', kind: 'observed', frequency: 'daily', description: 'd', ...over,
})
const dayList = (from, count) => Array.from({ length: count }, (_, i) => new Date(Date.parse(from) + i * 864e5).toISOString().slice(0, 10))

test('factProblem enforces the contract', () => {
  assert.equal(factProblem(fact(), NOW), null)
  assert.match(factProblem(fact({ value: NaN }), NOW), /value/)
  assert.match(factProblem(fact({ market: 'sh' }), NOW), /market/)
  assert.match(factProblem(fact({ source: 'http://x.com' }), NOW), /https/)
  assert.match(factProblem(fact({ observationDate: '2026-13-01' }), NOW), /observationDate/)
  assert.match(factProblem(fact({ observationDate: '2027-01-01' }), NOW), /晚于/)
  assert.match(factProblem(fact({ observationDate: '2026-10-18' }), NOW), /晚于/, 'tomorrow is rejected')
  assert.equal(factProblem(fact({ observationDate: '2026-10-17' }), NOW), null)
  assert.match(factProblem(fact({ fetchedAt: '2026-10-17T10:00:00.001Z' }), NOW), /fetchedAt<=now/)
  assert.match(factProblem(fact({ firstSeenAt: '2026-10-02T00:00:00.000Z' }), NOW), /firstSeenAt<=fetchedAt/)
  assert.match(factProblem(fact({ availableAt: undefined }), NOW), /availableAt/)
  assert.equal(factProblem(fact({ availableAt: '2026-10-16T08:00:00Z' }), NOW), null)
})

test('computeErpZ: 5y window, sample std, fails on short history', () => {
  const dates = dayList('2020-01-01', 2400).filter(d => ![0, 6].includes(new Date(d).getUTCDay()))
  const peRows = dates.map((date, i) => ({ date, pe: 10 + (i % 7) }))
  const yieldRows = dates.map(date => ({ date, y: 2 }))
  const r = computeErpZ(peRows, yieldRows)
  const last = peRows[peRows.length - 1]
  const start = `${Number(last.date.slice(0, 4)) - 5}${last.date.slice(4)}`
  const erps = peRows.filter(p => p.date > start).map(p => 100 / p.pe - 2)
  const mean = erps.reduce((a, b) => a + b) / erps.length
  const sd = Math.sqrt(erps.reduce((a, b) => a + (b - mean) ** 2, 0) / (erps.length - 1))
  assert.equal(r.n, erps.length)
  assert.ok(Math.abs(r.z - (100 / last.pe - 2 - mean) / sd) < 1e-12)
  assert.throws(() => computeErpZ(peRows.slice(-800), yieldRows.slice(-800)), /不足5年/)
  assert.throws(() => computeErpZ(peRows, [{ date: '1999-01-01', y: 1 }]), /无同日交集/)
  // duplicated dates must not inflate the sample
  assert.throws(() => computeErpZ(peRows, [...yieldRows, yieldRows[yieldRows.length - 1]]), /国债日期重复/)
  assert.throws(() => computeErpZ([...peRows, peRows[peRows.length - 1]], yieldRows), /PE日期重复/)
  // dates present in only one series are excluded: half the yield days leaves too few joint points
  assert.throws(() => computeErpZ(peRows, yieldRows.filter((_, i) => i % 2 === 0)), /共\d+点/)
})

test('parsers reject malformed rows', () => {
  assert.deepEqual(parseCsindexPe({ data: [{ tradeDate: '20261015', peg: null }, { tradeDate: '20261016', peg: 12.88 }] }), [{ date: '2026-10-16', pe: 12.88 }])
  assert.throws(() => parseCsindexPe({ data: [{ tradeDate: '20261016', peg: -1 }] }), /无效/)
  assert.throws(() => parseCsindexPe({ data: [{ tradeDate: '20261016', peg: null }] }), /无非空PE/)
  const row = (tradeDate, peg = 10) => ({ tradeDate, peg })
  assert.throws(() => parseCsindexPe({ data: [row('20261313')] }), /日期非法/)
  assert.throws(() => parseCsindexPe({ data: [row('20260230')] }), /日期非法/)
  assert.throws(() => parseCsindexPe({ data: [row('20261016'), row('20261016')] }), /乱序或重复/)
  assert.throws(() => parseCsindexPe({ data: [row('20261016'), row('20261015')] }), /乱序或重复/)
  assert.throws(() => parseCsindexPe({ data: [row('20261016'), row('20261015', null)] }), /乱序或重复/)
  assert.deepEqual(parseTreasuryPage({ result: { pages: 3, data: [{ SOLAR_DATE: '2026-10-16 00:00:00', EMM00166466: 1.648 }, { SOLAR_DATE: '1999-01-01 00:00:00', EMM00166466: null }] } }), { pages: 3, rows: [{ date: '2026-10-16', y: 1.648 }] })
  assert.throws(() => parseTreasuryPage({}), /result/)
  assert.deepEqual(parseMargin({ result: { data: [{ DIM_DATE: '2026-10-15 00:00:00', RZMRE: 124282324291 }] } }), { date: '2026-10-15', yi: 1242.82324291 })
  assert.throws(() => parseMargin({ result: { data: [{ DIM_DATE: '2026-10-15 00:00:00', RZMRE: null }] } }), /无效/)
  assert.deepEqual(parseFredCsv('observation_date,DEXHKUS\n2026-10-08,7.8484\n2026-10-09,.\n', 'DEXHKUS'), { date: '2026-10-08', value: 7.8484 })
  assert.throws(() => parseFredCsv('<html>', 'DEXHKUS'), /不是CSV/)
})

test('Yahoo: only offshore CNH is accepted, never CNY', () => {
  const body = (symbol, currency) => ({ chart: { result: [{ meta: { symbol, currency }, timestamp: [1792098000, 1792184382], indicators: { quote: [{ close: [6.7, null] }] } }] } })
  assert.deepEqual(parseYahooCnh(body('CNH=X', 'CNH')), { date: '2026-10-15', value: 6.7 })
  assert.throws(() => parseYahooCnh(body('CNY=X', 'CNY')), /非离岸CNH/)
  assert.throws(() => parseYahooCnh(body('CNH=X', 'CNY')), /非离岸CNH/)
})

test('southbound: only 006 fields accepted, asc-sorted, null/non-finite dates rejected', () => {
  // DESC input from Eastmoney is tolerantly re-sorted to ASC; duplicate dates still throw.
  assert.deepEqual(parseSouthboundPage({ success: true, result: { data: [{ MUTUAL_TYPE: '006', TRADE_DATE: '2026-10-16 00:00:00', NET_DEAL_AMT: -3568.43 }, { MUTUAL_TYPE: '006', TRADE_DATE: '2026-10-15 00:00:00', NET_DEAL_AMT: -5080.23 }] } }, '006'), [{ date: '2026-10-15', net: -5080.23 }, { date: '2026-10-16', net: -3568.43 }])
  assert.throws(() => parseSouthboundPage({ success: false }, '006'), /success/)
  assert.throws(() => parseSouthboundPage({ success: true, result: { data: [{ MUTUAL_TYPE: '002', TRADE_DATE: '2026-10-16', NET_DEAL_AMT: 1 }] } }, '006'), /MUTUAL_TYPE/)
  assert.throws(() => parseSouthboundPage({ success: true, result: { data: [{ MUTUAL_TYPE: '006', TRADE_DATE: '2026-10-16', NET_DEAL_AMT: null }] } }, '006'), /NET_DEAL_AMT/)
  assert.throws(() => parseSouthboundPage({ success: true, result: { data: [{ MUTUAL_TYPE: '006', TRADE_DATE: '2026-13-40', NET_DEAL_AMT: 1 }] } }, '006'), /日期/)
  assert.throws(() => parseSouthboundPage({ success: true, result: { data: [{ MUTUAL_TYPE: '006', TRADE_DATE: '2026-10-16', NET_DEAL_AMT: 'not-a-number' }] } }, '006'), /非数/)
  // Real duplicate — same date twice in the same DESC payload. Our parser must refuse.
  assert.throws(() => parseSouthboundPage({ success: true, result: { data: [{ MUTUAL_TYPE: '006', TRADE_DATE: '2026-10-16 00:00:00', NET_DEAL_AMT: 1 }, { MUTUAL_TYPE: '006', TRADE_DATE: '2026-10-16 00:00:00', NET_DEAL_AMT: 2 }] } }, '006'), /重复日期/)
})

test('parseSouthboundRows picks trailing N unique dates; refuses below N', () => {
  // 22 unique trading days. dates[0]=newest, dates[21]=oldest — walk back from 2026-10-16 skipping weekends.
  const dates = []
  for (let t = new Date('2026-10-16T00:00:00Z').getTime(); dates.length < 22; t -= 864e5) {
    const d = new Date(t)
    if ([0, 6].includes(d.getUTCDay())) continue
    dates.push(d.toISOString().slice(0, 10))
  }
  const rows = dates.map((date, i) => ({ date, net: 1000 + i }))
  const out = parseSouthboundRows(rows, 20)
  // Take the 20 newest unique dates → observationDate is dates[0] (newest), windowStart is dates[21-20]=dates[1]
  // Wait: window = ASC-sorted unique dates, last 20. ASC row[0]=oldest, ASC[21]=newest.
  // unique.slice(-20) = ASC[2..21] → first in window = ASC[2] = dates[20] (3rd from oldest), last in window = ASC[21] = dates[0] (newest).
  const ascDates = [...dates].reverse()
  assert.equal(out.observationDate, ascDates.at(-1)) // newest = dates[0]
  assert.equal(out.windowStart, ascDates.slice(-20)[0]) // oldest of the 20 newest
  assert.equal(out.days, 20)
  // Refuses when fewer than N unique dates
  assert.throws(() => parseSouthboundRows(rows.slice(0, 5), 20), /不足/)
  // parseSouthboundPage is the gate for duplicates upstream; parseSouthboundRows is datem-set tolerant
  // (silently drops dups via the unique step). 19 distinct dates still fail.
  const nineteen = dates.slice(0, 19)
  assert.throws(() => parseSouthboundRows(nineteen.map((d, i) => ({ date: d, net: i })), 20), /不足/)
})

test('SSE ETF whitelist checks name, date and presence', () => {
  const rows = ETF_WHITELIST.map(w => ({ STAT_DATE: '2026-10-16', SEC_CODE: w.code, SEC_NAME: w.name, TOT_VOL: '100.5' }))
  assert.equal(parseSseEtf({ result: rows }, '2026-10-16').length, ETF_WHITELIST.length)
  assert.throws(() => parseSseEtf({ result: rows.slice(1) }, '2026-10-16'), /缺少白名单/)
  assert.throws(() => parseSseEtf({ result: rows.map((r, i) => (i ? r : { ...r, SEC_NAME: '别的基金' })) }, '2026-10-16'), /名称或日期不符/)
  assert.throws(() => parseSseEtf({ result: rows }, '2026-10-15'), /名称或日期不符/)
})

test('HSI/HSTECH sheet parsing checks headers and dates', () => {
  const hsi = [
    { r: 3, c: 'B', v: 'Hang Seng Index' }, { r: 4, c: 'A', v: 45961 }, { r: 4, c: 'B', v: 13.17 }, { r: 5, c: 'A', v: 46295 }, { r: 5, c: 'B', v: 13.79 },
  ]
  assert.deepEqual(parseHsiPe(hsi, { headerCol: 'B', headerText: 'Hang Seng Index' }), [{ date: '2025-10-31', pe: 13.17 }, { date: '2026-09-30', pe: 13.79 }])
  assert.throws(() => parseHsiPe(hsi, { headerCol: 'C', headerText: 'Hang Seng Index' }), /表头不符/)
  const tech = [{ r: 3, c: 'A', v: 'Hang Seng TECH Index' }, { r: 4, c: 'A', v: 'Feb 2026' }, { r: 4, c: 'B', v: 21.8 }]
  assert.deepEqual(parseHsiPe(tech, { headerCol: 'A', headerText: 'Hang Seng TECH Index' }), [{ date: '2026-02-28', pe: 21.8 }])
  assert.throws(() => parseHsiPe([...tech.slice(0, 1), { r: 4, c: 'A', v: 'whatever' }, { r: 4, c: 'B', v: 5 }], { headerCol: 'A', headerText: 'Hang Seng TECH Index' }), /无效/)
})

test('python xlsx reader parses a real minimal workbook (stdlib only)', async () => {
  const py = `
import zipfile,io,sys
b=io.BytesIO()
z=zipfile.ZipFile(b,'w')
z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>')
z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
z.writestr('xl/sharedStrings.xml','<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Hang Seng TECH Index</t></si><si><t>Oct 2025</t></si></sst>')
z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="3"><c r="A3" t="s"><v>0</v></c></row><row r="4"><c r="A4" t="s"><v>1</v></c><c r="B4"><v>25.79</v></c><c r="C4"/></row></sheetData></worksheet>')
z.close()
sys.stdout.buffer.write(b.getvalue())`
  const made = spawnSync('python3', ['-I', '-c', py])
  assert.equal(made.status, 0)
  const cells = await runXlsxParser(made.stdout)
  assert.deepEqual(parseHsiPe(cells, { headerCol: 'A', headerText: 'Hang Seng TECH Index' }), [{ date: '2025-10-31', pe: 25.79 }])
  await assert.rejects(runXlsxParser(Buffer.from('not a zip')), /xlsx解析失败/)
})

test('mergeFacts keeps firstSeenAt only for the same value; bounds history', () => {
  const old = fact()
  const same = mergeFacts([old], [fact({ firstSeenAt: NOW, fetchedAt: NOW })])
  assert.equal(same.length, 1)
  assert.equal(same[0].firstSeenAt, old.firstSeenAt)
  assert.equal(same[0].fetchedAt, NOW)
  const changed = mergeFacts([old], [fact({ value: 12.9, firstSeenAt: NOW, fetchedAt: NOW })])
  assert.equal(changed[0].firstSeenAt, NOW)
  const many = dayList('2026-01-01', 100).map(observationDate => fact({ observationDate }))
  const bounded = mergeFacts(many, [])
  assert.equal(bounded.length, 60)
  assert.equal(bounded.at(-1).observationDate, '2026-04-10')
})

// ---- end-to-end with injected fetch ----
function peBody() {
  const dates = dayList('2020-06-01', 2300).filter(d => ![0, 6].includes(new Date(d).getUTCDay()))
  return { data: dates.map((d, i) => ({ tradeDate: d.replaceAll('-', ''), peg: 10 + (i % 9) / 2 })), dates }
}
function fakeFetch(overrides = {}) {
  const pe = peBody()
  const hsiPeDates = dayList('2021-10-18', 2300).filter(d => ![0, 6].includes(new Date(d).getUTCDay())).filter(d => d <= '2026-10-16')
  const yieldDates = [...pe.dates].reverse()
  const calls = []
  const impl = async (url, init) => {
    calls.push(url)
    for (const [needle, handler] of Object.entries(overrides)) if (url.includes(needle)) return handler(url, init)
    if (url.startsWith(URLS.csindex)) return json({ data: pe.data })
    if (url.includes('eniu.com/chart/peindex/hkhsi/t/60')) return json({ date: hsiPeDates, pe: hsiPeDates.map((_, i) => 12 + (i % 9) / 2) })
    if (url.includes('param=hkHSTECH') || url.includes('param=hkHSI')) {
      const symbol = url.includes('hkHSTECH') ? 'HSTECH' : 'HSI', code = `hk${symbol}`
      const day = []
      for (let t = Date.parse('2025-03-05'); t <= Date.parse('2026-10-16'); t += 864e5) {
        const d = new Date(t)
        if (d.getUTCDay() > 0 && d.getUTCDay() < 6) day.push([d.toISOString().slice(0, 10), '1', '1', '1', '1', '100'])
      }
      return json({ code: 0, data: { [code]: { day, qt: { [code]: ['100', `${symbol} index`, symbol, ...Array(72).fill(''), 'HKD'] } } } })
    }
    if (url.includes('RPTA_WEB_TREASURYYIELD')) {
      const page = Number(/pageNumber=(\d+)/.exec(url)[1])
      const slice = yieldDates.slice((page - 1) * 500, page * 500)
      return json({ result: { pages: Math.ceil(yieldDates.length / 500), data: slice.map(d => ({ SOLAR_DATE: `${d} 00:00:00`, EMM00166466: 2 + (Date.parse(d) % 5) / 10 })) } })
    }
    if (url.includes('RPTA_RZRQ_LSHJ')) return json({ result: { data: [{ DIM_DATE: '2026-10-15 00:00:00', RZMRE: 124282324291 }] } })
    if (url.includes('fredgraph')) return json('observation_date,DEXHKUS\n2026-10-09,7.8476\n')
    if (url.includes('yahoo')) return json({ chart: { result: [{ meta: { symbol: 'CNH=X', currency: 'CNH' }, timestamp: [1792184382], indicators: { quote: [{ close: [6.6853] }] } }] } })
    if (url.includes('query.sse.com.cn')) {
      const date = /STAT_DATE=([\d-]+)/.exec(url)[1]
      return json({ result: date === '2026-10-16' ? ETF_WHITELIST.map(w => ({ STAT_DATE: date, SEC_CODE: w.code, SEC_NAME: w.name, TOT_VOL: '1000' })) : [] })
    }
    if (url.includes('hsi.com.hk')) return { ok: true, status: 200, arrayBuffer: async () => Buffer.concat([Buffer.from('PK'), Buffer.alloc(2000)]) }
    if (url.includes('RPT_MUTUAL_DEAL_HISTORY')) {
      const m = /MUTUAL_TYPE%3D%22(\d+)%22/.exec(url)
      const type = m ? m[1] : ''
      // 22 trading-day quotes, ascending; the 006 channel is the unified south aggregate.
      const dates = []
      for (let t = new Date('2026-10-16T00:00:00Z').getTime(); dates.length < 22; t -= 864e5) {
        const d = new Date(t)
        if ([0, 6].includes(d.getUTCDay())) continue
        dates.push(d.toISOString().slice(0, 10))
      }
      const want = type === '006' || type === '002' || type === '004'
      if (!want) return json({ success: true, result: { data: [] } })
      dates.reverse()
      return json({ success: true, result: { data: dates.map((d, i) => ({ MUTUAL_TYPE: type, TRADE_DATE: `${d} 00:00:00`, NET_DEAL_AMT: type === '006' ? 1000 + i : type === '002' ? 500 + i : 500 + i })) } })
    }
    throw new Error(`unexpected ${url}`)
  }
  impl.calls = calls
  return impl
}
const fakeXlsx = async buf => (buf.length ? [
  { r: 3, c: 'B', v: 'Hang Seng Index' }, { r: 3, c: 'A', v: 'Hang Seng TECH Index' }, { r: 4, c: 'A', v: 46295 }, { r: 4, c: 'B', v: 13.79 },
] : [])

test('buildAutoSnapshot: all sources, treasury paging, contract-valid output', async () => {
  const fetchImpl = fakeFetch()
  const out = await buildAutoSnapshot(null, { fetchImpl, now: NOW, parseXlsx: fakeXlsx })
  assert.deepEqual(out.issues, [])
  assert.equal(out.schemaVersion, 1)
  assert.equal(out.generatedAt, NOW)
  assert.ok(fetchImpl.calls.filter(u => u.includes('RPTA_WEB_TREASURYYIELD')).length >= 3, 'treasury must be paged')
  for (const f of out.facts) assert.equal(factProblem(f, NOW), null)
  const ids = new Set(out.facts.map(f => `${f.metricId}/${f.market}`))
  for (const id of ['erp_z/csi300', 'pe/csi300', 'pe/hsi', 'pe/hstech', 'financing_buy/all', 'hkd/all', 'cnh/all', 'etf_shares_510300/csi300', 'hk_south_20d/all', 'turnover_ratio_52w/hstech']) assert.ok(ids.has(id), id)
  const erpz = out.facts.find(f => f.metricId === 'erp_z')
  for (const id of ['erp_z', 'erp', 'cn10y']) assert.equal(out.facts.find(f => f.metricId === id).kind, 'observed')
  assert.match(out.facts.find(f => f.metricId === 'cn10y').description, /akshare\/main\/akshare\/bond\/bond_em\.py.*非中债官方直连/)
  assert.match(out.facts.find(f => f.metricId === 'erp').description, /简化定义.*非中债直连/)
  assert.match(erpz.description, /5年滚动z-score，窗口\d{4}-\d{2}-\d{2}~/)
  assert.match(out.facts.find(f => f.metricId === 'pe' && f.market === 'hsi').description, /不足5年/)
  assert.equal(out.facts.find(f => f.metricId === 'cnh').unit, 'CNH/USD')
  assert.ok(out.facts.every(f => f.availableAt === null))
})

test('failed or timed-out source keeps old fact/dates, others still succeed', async () => {
  const stale = fact({ metricId: 'financing_buy', market: 'all', value: 999, observationDate: '2026-10-09', unit: '亿元', fetchedAt: '2026-10-10T00:00:00.000Z', firstSeenAt: '2026-10-10T00:00:00.000Z', frequency: 'daily' })
  const staleCnh = fact({ metricId: 'cnh', market: 'all', value: 6.5, observationDate: '2026-10-09', unit: 'CNH/USD', fetchedAt: '2026-10-10T00:00:00.000Z' })
  const fetchImpl = fakeFetch({
    RPTA_RZRQ_LSHJ: () => ({ ok: false, status: 503 }),
    yahoo: () => new Promise(() => {}), // never resolves, ignores the signal
  })
  const out = await buildAutoSnapshot({ schemaVersion: 1, facts: [stale, staleCnh] }, { fetchImpl, now: NOW, parseXlsx: fakeXlsx, requestTimeoutMs: 80, sourceTimeoutMs: 200 })
  const margin = out.facts.filter(f => f.metricId === 'financing_buy')
  assert.deepEqual(margin, [stale])
  assert.equal(margin[0].fetchedAt, '2026-10-10T00:00:00.000Z')
  assert.deepEqual(out.facts.filter(f => f.metricId === 'cnh'), [staleCnh])
  assert.ok(out.issues.some(i => i.startsWith('margin:') && i.includes('HTTP 503') && i.includes('2026-10-09')))
  assert.ok(out.issues.some(i => i.startsWith('yahoo-cnh:') && i.includes('2026-10-09')))
  assert.ok(out.facts.some(f => f.metricId === 'erp_z'), 'other sources unaffected')
})

test('concurrency never exceeds 2 and a CNY response is not stored as CNH', async () => {
  let inflight = 0, peak = 0
  const base = fakeFetch({ yahoo: () => json({ chart: { result: [{ meta: { symbol: 'CNY=X', currency: 'CNY' }, timestamp: [1792184382], indicators: { quote: [{ close: [7.1] }] } }] } }) })
  const fetchImpl = async (url, init) => {
    inflight++; peak = Math.max(peak, inflight)
    await new Promise(r => setTimeout(r, 5))
    try { return await base(url, init) } finally { inflight-- }
  }
  const out = await buildAutoSnapshot(null, { fetchImpl, now: NOW, parseXlsx: fakeXlsx })
  assert.ok(peak <= 2, `peak ${peak}`)
  assert.equal(out.facts.some(f => f.metricId === 'cnh'), false)
  assert.ok(out.issues.some(i => i.startsWith('yahoo-cnh:') && i.includes('非离岸CNH') && i.includes('无旧值')))
})

test('invalid previous facts are dropped with an issue; fatal only with nothing at all', async () => {
  const bad = fact({ value: Infinity })
  const failAll = async () => { throw new Error('offline') }
  const out = await buildAutoSnapshot({ schemaVersion: 1, facts: [bad, fact()] }, { fetchImpl: failAll, now: NOW, parseXlsx: fakeXlsx })
  assert.equal(out.facts.length, 1)
  assert.ok(out.issues.some(i => i.startsWith('旧数据丢弃')))
  assert.equal(isFatal(out), false)
  const none = await buildAutoSnapshot(null, { fetchImpl: failAll, now: NOW, parseXlsx: fakeXlsx })
  assert.equal(none.facts.length, 0)
  assert.equal(isFatal(none), true)
  assert.equal(SOURCES.length, 10)
})

test('writeAtomic leaves no temp file and round-trips', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mca-'))
  const file = join(dir, 'out.json')
  await writeAtomic(file, { schemaVersion: 1, generatedAt: NOW, facts: [], issues: [] })
  assert.deepEqual(await readdir(dir), ['out.json'])
  assert.equal(JSON.parse(await readFile(file, 'utf8')).schemaVersion, 1)
})

test('treasury failure keeps the official PE and old ERP facts, with an issue', async () => {
  const oldErp = fact({ metricId: 'erp_z', value: 0.5, observationDate: '2026-10-09', unit: 'z-score' })
  const fetchImpl = fakeFetch({ RPTA_WEB_TREASURYYIELD: () => ({ ok: false, status: 502 }) })
  const out = await buildAutoSnapshot({ schemaVersion: 1, facts: [oldErp] }, { fetchImpl, now: NOW, parseXlsx: fakeXlsx })
  const pe = out.facts.find(f => f.metricId === 'pe' && f.market === 'csi300')
  assert.equal(pe.fetchedAt, NOW)
  assert.deepEqual(out.facts.filter(f => f.metricId === 'erp_z'), [oldErp])
  assert.ok(out.issues.some(i => i.startsWith('csi300-erp:') && i.includes('HTTP 502') && i.includes('2026-10-09') && i.includes('官方PE已保留')))
  assert.equal(out.facts.some(f => f.metricId === 'cn10y'), false)
})

test('unsupported previous schemaVersion is ignored; bad-only previous is fatal', async () => {
  const failAll = async () => { throw new Error('offline') }
  for (const previous of [{ schemaVersion: 2, facts: [fact()] }, { facts: [fact()] }, { schemaVersion: 1, facts: [fact({ value: NaN })] }]) {
    const out = await buildAutoSnapshot(previous, { fetchImpl: failAll, now: NOW, parseXlsx: fakeXlsx })
    assert.equal(out.facts.length, 0)
    assert.equal(isFatal(out), true)
  }
  const out = await buildAutoSnapshot({ schemaVersion: 2, facts: [fact()] }, { fetchImpl: failAll, now: NOW, parseXlsx: fakeXlsx })
  assert.ok(out.issues.some(i => i.includes('schemaVersion')))
})
