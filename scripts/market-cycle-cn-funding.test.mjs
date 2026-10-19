import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSseFundingTurnover, parseSzseFundingTurnover, computeCnFinancingRatio, collectCnFunding } from './market-cycle-cn-funding.mjs'
const date = '2026-10-16'
const sse = () => ({ sqlId: 'COMMON_SSE_SJ_SCGM_C', result: [
  ['主板A', '5250.21'], ['科创板', '2118.93'], ['基金', '4417.26'], ['主板B', '1.26'], ['债券', '2588.68'], ['回购', '24117.52'], ['ETF', '4410.49'], ['LOF', '3.76'], ['股票', '7370.40'],
].map(([PRODUCT_NAME, TOTAL_TRADE_AMT]) => ({ PRODUCT_NAME, TOTAL_TRADE_AMT, TRADE_DATE: '20261016' })) })
const szse = () => [{ metadata: { catalogid: '1803_sczm', tabkey: 'tab1', subname: date, cols: { cjje: '成交金额<br>(亿元)' } }, error: null, data: [
  ['&nbsp;&nbsp;主板A股', '4,271.74'], ['创业板A股', '3,965.52'], ['基金', '1,594.58'], ['主板B股', '0.40'], ['债券', '3,392.99'], ['ETF', '1581.02'], ['股票', '8237.68'],
].map(([lbmc, cjje]) => ({ lbmc, cjje })) }]
test('real October 16 classified turnover includes both A-share boards and all funds exactly once; direct bonds and B-shares excluded', () => {
  const sh = parseSseFundingTurnover(sse(), date), sz = parseSzseFundingTurnover(szse(), date)
  assert.equal(sh.turnoverYi, 11786.4)
  assert.equal(sz.turnoverYi, 9831.84)
  const ratio = computeCnFinancingRatio({ date, valueYuan: 121857375394 }, sh, sz)
  assert.equal(ratio.denominatorYi, 21618.24)
  assert.ok(Math.abs(ratio.value - 5.636785205178589) < 1e-10)
})
test('wrong dates and unverified units never divide across sessions or unit conventions', () => {
  const sh = sse(); sh.result[0].TRADE_DATE = '20261015'
  assert.throws(() => parseSseFundingTurnover(sh, date), /日期/)
  const sz = szse(); sz[0].metadata.cols.cjje = '成交金额(万元)'
  assert.throws(() => parseSzseFundingTurnover(sz, date), /单位/)
  assert.throws(() => computeCnFinancingRatio({ date: '2026-10-15', valueYuan: 1 }, parseSseFundingTurnover(sse(), date), parseSzseFundingTurnover(szse(), date)), /日期/)
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
test('collector joins newest margin day, outputs exact ratio contract and rejects future or stale observations', async () => {
  const seen = []
  const ctx = { now: '2026-10-19T02:00:00.000Z', issue: s => seen.push(s), get: async url => url.includes('eastmoney') ? { success: true, result: { data: [{ DIM_DATE: `${date} 00:00:00`, RZMRE: 121857375394 }] } } : url.includes('sse.com.cn') ? sse() : szse() }
  const result = await collectCnFunding(ctx)
  assert.equal(result[0].metricId, 'financing_buy_ratio_pct')
  assert.equal(result[0].market, 'csi300')
  assert.equal(result[0].value, 5.636785)
  assert.equal(result[0].unit, '%')
  assert.equal(result[0].observationDate, date)
  assert.match(result[0].description, /21618.24/)
  assert.equal(seen.length, 0)
  assert.deepEqual(await collectCnFunding({ ...ctx, now: '2026-11-10T02:00:00.000Z' }), [])
  assert.deepEqual(await collectCnFunding({ ...ctx, now: '2026-10-15T02:00:00.000Z' }), [])
})
