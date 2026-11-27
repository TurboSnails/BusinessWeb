import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  parseSseFundingTurnover, parseSzseFundingTurnover, computeCnFinancingRatio, collectCnFunding,
  parseSseMarginBuys, parseSzseMarginBuy, CN_SSE_MARGIN_URL,
} from './market-cycle-cn-funding.mjs'

const date = '2026-10-16'
const sse = () => ({ sqlId: 'COMMON_SSE_SJ_SCGM_C', result: [
  ['主板A', '5250.21'], ['科创板', '2118.93'], ['基金', '4417.26'], ['主板B', '1.26'], ['债券', '2588.68'], ['回购', '24117.52'], ['ETF', '4410.49'], ['LOF', '3.76'], ['股票', '7370.40'],
].map(([PRODUCT_NAME, TOTAL_TRADE_AMT]) => ({ PRODUCT_NAME, TOTAL_TRADE_AMT, TRADE_DATE: '20261016' })) })
const szse = () => [{ metadata: { catalogid: '1803_sczm', tabkey: 'tab1', subname: date, cols: { cjje: '成交金额<br>(亿元)' } }, error: null, data: [
  ['&nbsp;&nbsp;主板A股', '4,271.74'], ['创业板A股', '3,965.52'], ['基金', '1,594.58'], ['主板B股', '0.40'], ['债券', '3,392.99'], ['ETF', '1581.02'], ['股票', '8237.68'],
].map(([lbmc, cjje]) => ({ lbmc, cjje })) }]

// Live 2026-11-25 exchange official buys (probe 2026-11-27): SSE 56370009904 yuan + SZSE 470.98 亿元.
const LIVE = { date: '2026-11-25', sseYuan: 56370009904, szseYuan: 47098000000, sseYi: 563.70009904, szseYi: 470.98 }
const sseOn = d => { const b = sse(); for (const r of b.result) r.TRADE_DATE = d.replaceAll('-', ''); return b }
const szseOn = d => { const b = szse(); b[0].metadata.subname = d; return b }

test('real October 16 classified turnover includes both A-share boards and all funds exactly once; direct bonds and B-shares excluded', () => {
  const sh = parseSseFundingTurnover(sse(), date), sz = parseSzseFundingTurnover(szse(), date)
  assert.equal(sh.turnoverYi, 11786.4)
  assert.equal(sz.turnoverYi, 9831.84)
  const ratio = computeCnFinancingRatio({ date, sseYuan: 70000000000, szseYuan: 51857375394 }, sh, sz)
  assert.equal(ratio.denominatorYi, 21618.24)
  assert.ok(Math.abs(ratio.value - 5.636785205178589) < 1e-10)
  assert.ok(Math.abs(ratio.numeratorYi - 1218.57375394) < 1e-8)
})

test('2026-11-25 live official buys sum exactly SSE + SZSE (no Eastmoney)', () => {
  assert.equal(LIVE.sseYuan + LIVE.szseYuan, 103468009904)
  assert.ok(Math.abs(LIVE.sseYi + LIVE.szseYi - 1034.68009904) < 1e-8)
  const sh = parseSseFundingTurnover(sseOn(LIVE.date), LIVE.date)
  const sz = parseSzseFundingTurnover(szseOn(LIVE.date), LIVE.date)
  const ratio = computeCnFinancingRatio({ date: LIVE.date, sseYuan: LIVE.sseYuan, szseYuan: LIVE.szseYuan }, sh, sz)
  assert.ok(Math.abs(ratio.numeratorYi - (LIVE.sseYi + LIVE.szseYi)) < 1e-8)
  assert.equal(Number(ratio.numeratorYi.toFixed(2)), 1034.68)
})

test('SSE jsonp and SZSE 1837 parsers accept real response shapes', () => {
  const text = `json(${JSON.stringify({ pageHelp: { data: [
    { opDate: '20261125', rzmre: LIVE.sseYuan },
    { opDate: '20261126', rzmre: 53780740162 },
  ] } })})`
  const rows = parseSseMarginBuys(text)
  assert.deepEqual(rows.map(r => r.date), ['2026-11-25', '2026-11-26'])
  assert.equal(rows[0].valueYuan, LIVE.sseYuan)
  const sz = parseSzseMarginBuy([{
    metadata: { catalogid: '1837_xxpl', tabkey: 'tab1', subname: LIVE.date, cols: { jrrzmr: '融资买入额<br>(亿元)' } },
    data: [{ jrrzmr: '470.98' }],
  }], LIVE.date)
  assert.equal(sz.valueYi, 470.98)
  assert.equal(sz.valueYuan, 47098000000)
  assert.throws(() => parseSseMarginBuys('{"pageHelp":{}}'), /jsonp/)
  assert.throws(() => parseSzseMarginBuy([{ metadata: { catalogid: '1837_xxpl', tabkey: 'tab1', subname: LIVE.date, cols: { jrrzmr: '融资买入额(万元)' } }, data: [{ jrrzmr: '1' }] }], LIVE.date), /单位/)
})

test('wrong dates and unverified units never divide across sessions or unit conventions', () => {
  const sh = sse(); sh.result[0].TRADE_DATE = '20261015'
  assert.throws(() => parseSseFundingTurnover(sh, date), /日期/)
  const sz = szse(); sz[0].metadata.cols.cjje = '成交金额(万元)'
  assert.throws(() => parseSzseFundingTurnover(sz, date), /单位/)
  assert.throws(() => computeCnFinancingRatio({ date: '2026-10-15', sseYuan: 1, szseYuan: 1 }, parseSseFundingTurnover(sse(), date), parseSzseFundingTurnover(szse(), date)), /日期/)
})

test('missing funds, repeated classification, invalid scalar and total-only tables fail closed', () => {
  for (const bad of [null, '', false, [], '-']) {
    const sh = sse(); sh.result[2].TOTAL_TRADE_AMT = bad
    assert.throws(() => parseSseFundingTurnover(sh, date), /成交额/)
  }
  const sh = sse(); sh.result = sh.result.filter(r => r.PRODUCT_NAME !== '基金')
  assert.throws(() => parseSseFundingTurnover(sh, date), /基金/)
  const sz = szse(); sz[0].data.push({ lbmc: '基金', cjje: '1594.58' })
  assert.throws(() => parseSzseFundingTurnover(sz, date), /重复/)
  const onlyStocks = szse(); onlyStocks[0].data = onlyStocks[0].data.filter(r => r.lbmc === '股票')
  assert.throws(() => parseSzseFundingTurnover(onlyStocks, date), /主板A股/)
})

const sseMarginJsonp = rows => `json(${JSON.stringify({ pageHelp: { data: rows.map(([d, y]) => ({ opDate: d.replaceAll('-', ''), rzmre: y })) } })})`
const szseMargin = (d, yi = '500.00') => [{ metadata: { catalogid: '1837_xxpl', tabkey: 'tab1', subname: d, cols: { jrrzmr: '融资买入额<br>(亿元)' } }, data: [{ jrrzmr: yi }] }]

const multiCtx = (failSzse = new Set()) => {
  const seen = [], calls = []
  // SSE buys chosen so with szse 518.57375394 亿 the Oct-16 ratio matches the historical 5.636785 fixture.
  const margin = [['2026-10-16', 70000000000], ['2026-10-15', 72400000000], ['2026-10-14', 60000000000]]
  const szBuy = { '2026-10-16': '518.57375394', '2026-10-15': '518.82324291', '2026-10-14': '500.00000000' }
  return { seen, calls, ctx: { now: '2026-10-19T02:00:00.000Z', issue: s => seen.push(s), get: async (url, opts = {}) => {
    calls.push(url)
    if (url.includes('queryMargin.do')) {
      assert.equal(opts.as, 'text')
      return sseMarginJsonp(margin)
    }
    const u = new URL(url)
    const d = u.searchParams.get('TRADE_DATE') ?? u.searchParams.get('txtQueryDate') ?? u.searchParams.get('txtDate')
    if (url.includes('1837_xxpl')) {
      if (failSzse.has(d)) throw new TypeError('fetch failed(ECONNRESET)')
      return szseMargin(d, szBuy[d] ?? '500.00')
    }
    if (url.includes('szse.cn') && failSzse.has(d)) throw new TypeError('fetch failed(ECONNRESET)')
    return url.includes('sse.com.cn') ? sseOn(d) : szseOn(d)
  } } }
}

test('collector joins newest margin day from exchange official buys; description excludes BSE and on-margin-only claims', async () => {
  const { ctx, seen, calls } = multiCtx()
  const result = await collectCnFunding(ctx)
  assert.equal(result[0].metricId, 'financing_buy_ratio_pct')
  assert.equal(result[0].market, 'csi300')
  assert.equal(result[0].value, 5.636785)
  assert.equal(result[0].unit, '%')
  assert.equal(result[0].observationDate, date)
  assert.match(result[0].description, /不含北交所/)
  assert.match(result[0].description, /非融资标的内部/)
  assert.match(result[0].description, /上交所700\.00\+深交所518\.57/)
  assert.equal(result[0].source, CN_SSE_MARGIN_URL)
  assert.ok(!calls.some(u => u.includes('eastmoney')), 'must not fall back to Eastmoney')
  assert.equal(seen.length, 0)
  assert.deepEqual(await collectCnFunding({ ...ctx, now: '2026-11-10T02:00:00.000Z' }), [])
  assert.deepEqual(await collectCnFunding({ ...ctx, now: '2026-10-15T02:00:00.000Z' }), [])
})

test('collector emits a same-date ratio for every recent margin day so the weekly close can be paired', async () => {
  const { ctx, seen } = multiCtx()
  const out = await collectCnFunding(ctx)
  const ratios = out.filter(f => f.metricId === 'financing_buy_ratio_pct')
  assert.deepEqual(ratios.map(f => f.observationDate), ['2026-10-16', '2026-10-15', '2026-10-14'])
  assert.equal(ratios[0].value, 5.636785)
  for (const f of out) assert.match(f.description, new RegExp(`TRADE_DATE=${f.observationDate}.*txtQueryDate=${f.observationDate}`))
  assert.equal(seen.length, 0)
})

test('an older day whose exchange data is missing is skipped; a newest-day failure is reported; never uses Eastmoney', async () => {
  const older = multiCtx(new Set(['2026-10-15']))
  assert.deepEqual((await collectCnFunding(older.ctx)).filter(f => f.metricId === 'financing_buy_ratio_pct').map(f => f.observationDate), ['2026-10-16', '2026-10-14'])
  assert.equal(older.seen.length, 0)
  const newest = multiCtx(new Set(['2026-10-16']))
  assert.deepEqual((await collectCnFunding(newest.ctx)).filter(f => f.metricId === 'financing_buy_ratio_pct').map(f => f.observationDate), ['2026-10-15', '2026-10-14'])
  assert.match(newest.seen.join(), /cn-funding: 2026-10-16: fetch failed\(ECONNRESET\)/)
  const blocked = multiCtx(new Set(['2026-10-16', '2026-10-15', '2026-10-14']))
  assert.deepEqual(await collectCnFunding(blocked.ctx), [])
  assert.ok(blocked.calls.filter(u => u.includes('1837_xxpl')).length <= 2, 'an unreachable exchange is not retried for every older date')
  assert.ok(!blocked.calls.some(u => u.includes('eastmoney')))
})

test('with a cache dir the official raw responses are shared with the 53-week collector and reused', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cn-funding-'))
  const first = multiCtx()
  await collectCnFunding(first.ctx, { cacheDir: dir })
  const cached = JSON.parse(await readFile(path.join(dir, 'szse', '2026-10-16.json'), 'utf8'))
  assert.equal(cached.url, 'https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1803_sczm&TABKEY=tab1&txtQueryDate=2026-10-16')
  assert.equal(cached.fetchedAt, '2026-10-19T02:00:00.000Z')
  const marginCached = JSON.parse(await readFile(path.join(dir, 'szse-margin', '2026-10-16.json'), 'utf8'))
  assert.match(marginCached.url, /1837_xxpl.*2026-10-16/)
  const second = multiCtx(new Set(['2026-10-16', '2026-10-15', '2026-10-14']))
  const out = await collectCnFunding(second.ctx, { cacheDir: dir })
  assert.equal(out.filter(f => f.metricId === 'financing_buy_ratio_pct').length, 3)
  assert.equal(second.calls.filter(u => !u.includes('queryMargin.do')).length, 0)
})
