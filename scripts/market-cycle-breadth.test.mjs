import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { computeBreadth, parseBars, parseEastmoneyHkBars, sanitizeBars, selectBatch, tencentSymbol, validateUniverse, buildMarketEntry, clampBudget, clampConcurrency, run } from './market-cycle-breadth.mjs'
import { HK_INDEX_CODES } from './market-cycle-hk-universe.mjs'

const TODAY = '2026-10-16'
const day = i => new Date(Date.parse('2025-01-01') + i * 864e5).toISOString().slice(0, 10)
/** n consecutive calendar-day bars ending at `end`, closes from fn(i). */
const series = (n, end, fn) => Array.from({ length: n }, (_, i) => [new Date(Date.parse(end) - (n - 1 - i) * 864e5).toISOString().slice(0, 10), fn(i)])
const members = n => Array.from({ length: n }, (_, i) => ({ code: String(600000 + i) }))

test('breadth counts close above simple MA200 over the same pool on both dates', () => {
  const m = members(20)
  const map = new Map()
  m.forEach(({ code }, i) => map.set(code, series(260, TODAY, k => (i < 10 ? 100 + k : 400 - k)))) // 10 rising, 10 falling
  const r = computeBreadth(m, map, TODAY)
  assert.equal(r.observationDate, TODAY)
  assert.equal(r.eligible, 20)
  assert.equal(r.breadth, 50)
  assert.equal(r.priorBreadth, 50)
  assert.equal(r.coverage, 1)
})

test('missing, failed and short-history stocks are excluded with reasons and block output below 95%', () => {
  const m = members(20)
  const map = new Map()
  m.slice(0, 17).forEach(({ code }) => map.set(code, series(260, TODAY, k => 100 + k)))
  map.set(m[17].code, series(150, TODAY, k => 100 + k)) // new listing
  map.set(m[18].code, null) // failed
  // m[19] never fetched
  const r = computeBreadth(m, map, TODAY)
  assert.deepEqual(r.exclusions, { insufficient_history: 1, fetch_failed: 1, not_fetched: 1 })
  assert.equal(r.eligible, 17)
  assert.equal(r.breadth, null)
  assert.equal(r.priorBreadth, null)
  assert.ok(r.coverage < 0.95)
})

test('exactly 200 bars is not enough: 220 needed so prior MA200 exists', () => {
  const m = members(1)
  const r = computeBreadth(m, new Map([[m[0].code, series(200, TODAY, k => 100 + k)]]), TODAY)
  assert.equal(r.eligible, 0)
  assert.equal(r.exclusions.insufficient_history, 1)
  const ok = computeBreadth(m, new Map([[m[0].code, series(230, TODAY, k => 100 + k)]]), TODAY)
  assert.equal(ok.eligible, 1)
  assert.equal(ok.breadth, 100)
})

test('a security without a bar on the unified date is excluded, even if its last price is only one day old', () => {
  const m = members(100)
  const map = new Map()
  m.forEach(({ code }) => map.set(code, series(260, TODAY, k => 100 + k)))
  map.set(m[0].code, series(260, '2026-10-15', k => 100 + k))
  map.set(m[1].code, series(260, '2026-10-05', k => 100 + k))
  const r = computeBreadth(m, map, TODAY)
  assert.equal(r.observationDate, TODAY)
  assert.equal(r.exclusions.suspended_or_stale, 2)
  assert.equal(r.eligible, 98)
})

test('mixed cache dates: never a blended "today" number; an older common day is reported as such', () => {
  const m = members(100)
  const map = new Map()
  m.forEach(({ code }, i) => map.set(code, series(260, i < 60 ? TODAY : '2026-10-09', k => 100 + k)))
  const r = computeBreadth(m, map, TODAY)
  assert.equal(r.observationDate, '2026-10-09') // only day with >=95% real bars
  assert.equal(r.eligible, 100)
  const partial = new Map(map)
  m.slice(0, 20).forEach(({ code }) => partial.delete(code)) // 20 never fetched
  const p = computeBreadth(m, partial, TODAY)
  assert.equal(p.breadth, null)
  assert.equal(p.priorBreadth, null)
  assert.equal(p.exclusions.not_fetched, 20)
  // 96 of 100 on the same latest day: that day is the unified date; the lagging four are excluded, not blended
  const map2 = new Map()
  m.forEach(({ code }, i) => map2.set(code, series(260, i < 96 ? TODAY : '2026-10-09', k => 100 + k)))
  const r2 = computeBreadth(m, map2, TODAY)
  assert.equal(r2.observationDate, TODAY)
  assert.equal(r2.eligible, 96)
  assert.equal(r2.breadth, 100)
  assert.equal(r2.exclusions.suspended_or_stale, 4)
})

test('unified date can be older than the newest bar; prior date falls back to the last common trading day', () => {
  const m = members(20)
  const map = new Map()
  // everyone has bars through 10-09 (calendar-day series); one stock alone has 10-16
  m.forEach(({ code }, i) => map.set(code, series(260, i === 0 ? TODAY : '2026-10-09', k => 100 + k)))
  const r = computeBreadth(m, map, TODAY)
  assert.equal(r.observationDate, '2026-10-09')
  assert.equal(r.priorDate, '2026-09-11')
  // market-wide holiday gap: no bars at all on 28d prior, last common day earlier
  const map2 = new Map()
  m.forEach(({ code }) => map2.set(code, series(260, TODAY, k => 100 + k).filter(([d]) => !(d > '2026-09-14' && d <= '2026-09-19'))))
  const r2 = computeBreadth(m, map2, TODAY)
  assert.equal(r2.priorDate, '2026-09-14')
  assert.equal(r2.eligible, 20)
})

test('corrupt cached bars are rejected without throwing', () => {
  assert.equal(sanitizeBars([['2026-10-02', 1], ['2026-10-01', 1]], TODAY), null) // unordered
  assert.equal(sanitizeBars([['2026-10-01', 1], ['2026-10-01', 2]], TODAY), null) // duplicate
  assert.equal(sanitizeBars([['2026-10-01', NaN]], TODAY), null)
  assert.equal(sanitizeBars([['2026-13-45', 1]], TODAY), null)
  assert.equal(sanitizeBars('x', TODAY), null)
  assert.deepEqual(sanitizeBars([['2026-10-01', 1], ['2026-10-30', 2]], TODAY), [['2026-10-01', 1]])
  const m = members(3)
  const good = series(260, TODAY, k => 100 + k)
  const map = new Map([[m[0].code, good], [m[1].code, [['bad', 1]]], [m[2].code, [[TODAY, Infinity]]]])
  const r = computeBreadth(m, map, TODAY)
  assert.equal(r.exclusions.invalid_cache, 2)
  assert.equal(r.eligible, 1)
  assert.throws(() => validateUniverse({ date: '2026-13-45' }, TODAY), /日期/)
})
test('future-dated and invalid bars are dropped and never set the observation date', () => {
  const body = { data: { sh600000: { qfqday: [['2026-10-15', '1', '10', '1', '1', '1'], ['2026-10-16', '1', '11', '1', '1', '1'], ['2026-10-20', '1', '12', '1', '1', '1'], ['2026-10-14', '1', '0', '1', '1', '1'], ['x', '1', '5', '1', '1', '1']] } } }
  assert.deepEqual(parseBars(body, 'sh600000', TODAY), [['2026-10-15', 10], ['2026-10-16', 11]])
  assert.throws(() => parseBars({ data: {} }, 'sh600000', TODAY))
  assert.throws(() => parseBars({ data: { sh600000: { day: [['2026-10-16', '1', '11', '1', '1', '1']] } } }, 'sh600000', TODAY), /qfqday/)
  const m = members(1)
  const bars = [...series(240, TODAY, k => 100 + k), ['2026-10-25', 999]]
  assert.equal(computeBreadth(m, new Map([[m[0].code, bars]]), TODAY).observationDate, TODAY)
})

test('nothing fetched yields progress, not numbers', () => {
  const r = computeBreadth(members(5), new Map(), TODAY)
  assert.equal(r.observationDate, null)
  assert.equal(r.breadth, null)
  assert.deepEqual(r.exclusions, { not_fetched: 5 })
})

test('selectBatch fetches unseen first, then oldest/failed, skips fresh cache, respects budget', () => {
  const m = ['a', 'b', 'c', 'd'].map(code => ({ code }))
  const meta = { a: { fetchedAt: '2026-10-15T00:00:00Z' }, b: { fetchedAt: '2026-10-01T00:00:00Z' }, c: { fetchedAt: '2026-09-01T00:00:00Z', failedAt: '2026-10-10T00:00:00Z' } }
  assert.deepEqual(selectBatch(m, meta, TODAY, 40), ['d', 'b', 'c'])
  assert.deepEqual(selectBatch(m, meta, TODAY, 2), ['d', 'b'])
  assert.deepEqual(selectBatch(m, meta, TODAY, 0), [])
})

test('symbols and universe validation', () => {
  assert.equal(tencentSymbol('csi300', '600519'), 'sh600519')
  assert.equal(tencentSymbol('csi300', '688981'), 'sh688981')
  assert.equal(tencentSymbol('csi300', '000001'), 'sz000001')
  assert.equal(tencentSymbol('csi300', '300750'), 'sz300750')
  assert.equal(tencentSymbol('hsi', '700'), 'hk00700')
  assert.equal(tencentSymbol('csi300', 'abc'), null)
  const codes = Array.from({ length: 300 }, (_, i) => String(100000 + i))
  assert.ok(validateUniverse({ date: '2026-10-16', codes }, TODAY))
  assert.throws(() => validateUniverse({ date: '2026-10-20', codes }, TODAY), /日期/)
  assert.throws(() => validateUniverse({ date: '2026-10-16', codes: codes.slice(0, 10) }, TODAY), /规模/)
})

test('kind follows the last official confirmation, not the (possibly months old) effective date', () => {
  const res = computeBreadth([], new Map(), TODAY)
  const entry = u => buildMarketEntry('csi300', { source: 'https://x', date: '2026-06-01', ...u }, res, TODAY)
  assert.equal(entry({ confirmedAt: '2026-10-15T01:00:00Z' }).kind, 'observed')
  assert.equal(entry({ confirmedAt: '2026-09-01T01:00:00Z' }).kind, 'proxy')
  assert.equal(entry({}).kind, 'proxy') // static list without verified confirmation
  assert.equal(entry({ confirmedAt: '2026-10-15T01:00:00Z' }).universeDate, '2026-06-01')
})

test('universe validation: source, unique codes, size; budget and concurrency clamps', () => {
  const codes = Array.from({ length: 300 }, (_, i) => String(100000 + i))
  assert.throws(() => validateUniverse({ date: '2026-10-16', codes, source: 'ftp://x' }, TODAY), /source/)
  assert.throws(() => validateUniverse({ date: '2026-10-16', codes: [...codes.slice(1), codes[1]] }, TODAY), /重复/)
  assert.throws(() => validateUniverse({ date: '2026-10-16', codes, fetchedAt: 'yesterday' }, TODAY), /fetchedAt/)
  assert.deepEqual([clampBudget(undefined), clampBudget('0'), clampBudget(0), clampBudget(500), clampBudget(-3), clampBudget('x'), clampBudget(7.9)], [40, 0, 0, 40, 0, 40, 7])
  assert.deepEqual([clampConcurrency(undefined), clampConcurrency(50), clampConcurrency(0)], [2, 2, 1])
})

test('run: injected fetch, budget cap, resumable cache, honest missing for HSI/HSTECH', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'breadth-'))
  const codes = Array.from({ length: 300 }, (_, i) => String(600000 + i))
  const calls = []
  const fetchImpl = async url => {
    calls.push(url)
    if (url.includes('000300cons.xls')) return { ok: true, arrayBuffer: async () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(2000)]) }
    const sym = new URL(url).searchParams.get('param').split(',')[0]
    const rows = series(260, TODAY, k => 100 + k).map(([d, c]) => [d, '1', String(c), '1', '1', '1'])
    return { ok: true, json: async () => ({ data: { [sym]: { qfqday: rows } } }) }
  }
  const parseXls = async () => JSON.stringify({ date: '2026-10-16', indexCode: '000300', rows: codes.map(code => ({ code, name: code })) })
  const opts = { fetchImpl, parseXls, cacheDir: path.join(dir, 'cache'), outFile: path.join(dir, 'out.json'), universeFile: path.join(dir, 'u.json'), now: new Date(`${TODAY}T10:00:00Z`), budget: 11 }
  const first = await run(opts)
  assert.equal(calls.length, 11) // 1 list + 10 stocks, hard cap
  assert.equal(first.snapshot.markets.csi300.eligible, 10)
  assert.equal(first.snapshot.markets.csi300.breadth, null)
  assert.equal(first.snapshot.markets.csi300.exclusions.not_fetched, 290)
  assert.equal(first.snapshot.markets.hsi, undefined)
  assert.ok(first.snapshot.issues.some(i => i.includes('恒生指数')))
  let second = first
  for (let i = 0; i < 8; i++) {
    const before = calls.length
    second = await run({ ...opts, budget: 300 }) // clamped to 40 per round
    assert.ok(calls.length - before <= 40)
  }
  assert.equal(calls.length, 11 + 290 + 2) // list cached, each stock once; +2 failed official HSI/HSTECH universe attempts once CSI finishes and budget remains
  assert.equal(second.snapshot.markets.csi300.eligible, 300)
  assert.equal(second.snapshot.markets.csi300.breadth, 100)
  assert.equal(second.snapshot.markets.csi300.kind, 'observed')
  const saved = JSON.parse(await readFile(opts.outFile, 'utf8'))
  assert.equal(saved.schemaVersion, 1)
  assert.equal(saved.markets.csi300.observationDate, TODAY)
  const u = JSON.parse(await readFile(opts.universeFile, 'utf8'))
  assert.equal(u.universes.hsi.status, 'missing')
})

test('run: failed list download without cache reports missing, no fake numbers', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'breadth-'))
  const out = await run({ fetchImpl: async () => ({ ok: false, status: 403 }), cacheDir: path.join(dir, 'c'), outFile: path.join(dir, 'o.json'), universeFile: path.join(dir, 'u.json'), now: new Date(`${TODAY}T10:00:00Z`) })
  assert.deepEqual(out.snapshot.markets, {})
  assert.ok(out.snapshot.issues.some(i => i.includes('沪深300')))
})

test('run: budget 0 makes no requests, reuses cache and keeps the confirmation time; failed refresh does not renew it', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'breadth-'))
  const codes = Array.from({ length: 300 }, (_, i) => String(600000 + i))
  const fetchImpl = async url => {
    if (url.includes('000300cons.xls')) return { ok: true, arrayBuffer: async () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(2000)]) }
    const sym = new URL(url).searchParams.get('param').split(',')[0]
    return { ok: true, json: async () => ({ data: { [sym]: { qfqday: series(260, TODAY, k => 100 + k).map(([d, c]) => [d, '1', String(c), '1', '1', '1']) } } }) }
  }
  const parseXls = async () => JSON.stringify({ date: '2026-04-01', indexCode: '000300', rows: codes.map(code => ({ code, name: code })) })
  const base = { fetchImpl, parseXls, cacheDir: path.join(dir, 'c'), outFile: path.join(dir, 'o.json'), universeFile: path.join(dir, 'u.json') }
  await run({ ...base, now: new Date(`${TODAY}T10:00:00Z`), budget: 1000 }) // clamped to 40: list + 39 stocks
  let calls = 0
  const counting = async (...a) => { calls++; return fetchImpl(...a) }
  const zero = await run({ ...base, fetchImpl: counting, now: new Date(`${TODAY}T11:00:00Z`), budget: 0 })
  assert.equal(calls, 0)
  assert.equal(zero.requests, 0)
  assert.equal(zero.snapshot.markets.csi300.eligible, 39)
  assert.equal(zero.snapshot.markets.csi300.universeDate, '2026-04-01')
  assert.equal(zero.snapshot.markets.csi300.kind, 'observed')
  const u = JSON.parse(await readFile(base.universeFile, 'utf8'))
  assert.equal(u.universes.csi300.fetchedAt, `${TODAY}T10:00:00.000Z`)
  // cache lost: published list (with its fetchedAt) is the fallback, no request at budget 0
  const lost = await run({ ...base, fetchImpl: counting, cacheDir: path.join(dir, 'fresh'), now: new Date(`${TODAY}T12:00:00Z`), budget: 0 })
  assert.equal(calls, 0)
  assert.equal(lost.snapshot.markets.csi300.total, 300)
  // eight days later the refresh fails: old confirmation retained, still observed (<=21d), fetchedAt not renewed
  const later = new Date('2026-10-24T10:00:00Z')
  const failed = await run({ ...base, fetchImpl: async () => ({ ok: false, status: 500 }), now: later, budget: 2 })
  assert.ok(failed.snapshot.issues.some(i => i.includes('更新失败')))
  const u2 = JSON.parse(await readFile(base.universeFile, 'utf8'))
  assert.equal(u2.universes.csi300.fetchedAt, `${TODAY}T10:00:00.000Z`)
  // a statically configured HK list with a non-whitelisted source is never upgraded: failed official
  // confirmation leaves the market missing rather than voting on an unverified list
  const hkCodes = Array.from({ length: 30 }, (_, i) => String(i + 1))
  const hkFile = path.join(dir, 'hk.json')
  await writeFile(hkFile, JSON.stringify({ universes: { hsi: { id: 'hsi-constituents', status: 'ok', date: '2026-10-01', source: 'https://example.com/hsi', codes: hkCodes } } }))
  const hk = await run({ ...base, universeFile: hkFile, cacheDir: path.join(dir, 'hkc'), fetchImpl, parseXls, now: new Date(`${TODAY}T10:00:00Z`), budget: 5 })
  assert.equal(hk.snapshot.markets.hsi, undefined)
  assert.ok(hk.snapshot.issues.some(i => i.includes('恒生指数'))) // budget exhausted before any official confirmation attempt
  assert.ok(hk.requests <= 5)
  const huk = JSON.parse(await readFile(hkFile, 'utf8'))
  assert.equal(huk.universes.hsi.status, 'missing')
})

test('parseBars stays strict: unadjusted HK day data is never accepted as qualified qfq bars', () => {
  const rows = [['2026-10-15', '1', '300', '1', '1', '1'], ['2026-10-16', '1', '310', '1', '1', '1']]
  const hkBody = { data: { hk00700: { day: rows } } }
  assert.throws(() => parseBars(hkBody, 'hk00700', TODAY), /qfqday/)
  // HK breadth votes only on Eastmoney fqt=1 bars, verified by response identity
  const em = (code, klines) => ({ rc: 0, data: { code, market: 116, klines } })
  const klines = ['2026-10-14,1,290,1,1,1,1', '2026-10-15,1,300,1,1,1,1', '2026-10-16,1,310,1,1,1,1']
  assert.deepEqual(parseEastmoneyHkBars(em('00700', klines), '700', TODAY), [['2026-10-14', 290], ['2026-10-15', 300], ['2026-10-16', 310]])
  assert.deepEqual(parseEastmoneyHkBars(em('00700', [...klines, '2026-10-20,1,999,1,1,1,1']), '700', TODAY), [['2026-10-14', 290], ['2026-10-15', 300], ['2026-10-16', 310]]) // future row dropped
  assert.throws(() => parseEastmoneyHkBars(em('00700', []), '700', TODAY), /K线/)
  assert.throws(() => parseEastmoneyHkBars(em('00001', klines), '700', TODAY), /身份不符/) // wrong code echoed
  assert.throws(() => parseEastmoneyHkBars({ rc: 0, data: { code: '00700', market: 105, klines } }, '700', TODAY), /身份不符/) // wrong market
  assert.throws(() => parseEastmoneyHkBars({ rc: 1, data: {} }, '700', TODAY), /rc/)
  assert.throws(() => parseEastmoneyHkBars({ rc: 0, data: { code: '00700', market: 116, klines: ['2026-10-16,1,0,1,1,1,1'] } }, '700', TODAY), /有效/)
})

const HK_DATE_TIME = '2026-10-16 16:08:38'
/** Minimal official Hang Seng Indexes metadata/v2 rt payload for run() tests. */
const hkApiBody = (market, codes) => {
  const indexCode = HK_INDEX_CODES[market]
  const names = { hsi: 'Hang Seng Index', hstech: 'Hang Seng TECH Index' }
  return {
    code: '0', message: 'success',
    data: {
      numOfConsList: [{ indexName: names[market], indexCode, subIndexes: null, count: codes.length }],
      viewConsDetail: { [indexCode]: codes.map(c => ({ indexCode, stockCode: String(c), stockName: `S${c}`, dateTime: HK_DATE_TIME, isDummy: 'N', stockType: 'HK' })) },
    },
  }
}
/** fetch mock serving the CSI xls, the HK official API, Tencent klines (csi300) and Eastmoney fqt=1 klines (HK). */
const hkFetchMock = (csiCodes, hkLists, opts = {}) => async url => {
  if (url.includes('000300cons.xls')) return { ok: opts.xlsOk ?? true, arrayBuffer: async () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(2000)]) }
  if (url.includes('hsi.com.hk')) {
    const sc = new URL(url).searchParams.get('seriesCode')
    if (opts.hkApiDown) return { ok: false, status: 503 }
    return { ok: true, json: async () => hkApiBody(sc, hkLists[sc]) }
  }
  if (url.includes('push2his.eastmoney.com')) {
    const secid = new URL(url).searchParams.get('secid')
    const emRows = series(260, TODAY, k => 100 + k).map(([d, c]) => `${d},1,${c},1,1,1,1`)
    return { ok: true, json: async () => ({ rc: 0, data: { code: secid.split('.')[1], market: 116, klines: emRows } }) }
  }
  const sym = new URL(url).searchParams.get('param').split(',')[0]
  const rows = series(260, TODAY, k => 100 + k).map(([d, c]) => [d, '1', String(c), '1', '1', '1'])
  return { ok: true, json: async () => ({ data: { [sym]: { qfqday: rows } } }) }
}

test('run: official HSI/HSTECH universes are collected, confirmed and cached; rounds stay within 40 requests', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'breadth-hk-'))
  const csiCodes = Array.from({ length: 300 }, (_, i) => String(600000 + i))
  const hsiCodes = Array.from({ length: 95 }, (_, i) => i + 1)
  const hstechCodes = Array.from({ length: 30 }, (_, i) => i + 100)
  const fetchImpl = hkFetchMock(csiCodes, { hsi: hsiCodes, hstech: hstechCodes })
  const parseXls = async () => JSON.stringify({ date: TODAY, indexCode: '000300', rows: csiCodes.map(code => ({ code, name: code })) })
  const opts = { fetchImpl, parseXls, cacheDir: path.join(dir, 'cache'), outFile: path.join(dir, 'o.json'), universeFile: path.join(dir, 'u.json'), now: new Date(`${TODAY}T10:00:00Z`), budget: 40 }
  let hkApiCalls = 0
  const counted = async (...a) => { if (String(a[0]).includes('hsi.com.hk')) hkApiCalls++; return fetchImpl(...a) }
  let out
  for (let i = 0; i < 15; i++) {
    const before = { req: out?.requests }
    out = await run({ ...opts, fetchImpl: counted })
    assert.ok(out.requests <= 40)
    if (out.snapshot.markets.hsi?.breadth !== null && out.snapshot.markets.hstech?.breadth !== null && out.snapshot.markets.hsi?.breadth !== undefined) break
    void before
  }
  assert.equal(hkApiCalls, 2) // both universes fetched once, then served from cache
  assert.equal(out.snapshot.markets.hsi.total, 95)
  assert.equal(out.snapshot.markets.hstech.total, 30)
  assert.equal(out.snapshot.markets.hsi.kind, 'observed')
  assert.equal(out.snapshot.markets.hstech.kind, 'observed')
  assert.equal(out.snapshot.markets.hsi.universeDate, '2026-10-16')
  assert.equal(out.snapshot.markets.hsi.breadth, 100)
  assert.equal(out.snapshot.markets.hstech.breadth, 100)
  const u = JSON.parse(await readFile(opts.universeFile, 'utf8'))
  assert.equal(u.universes.hsi.status, 'ok')
  assert.equal(u.universes.hsi.codes.length, 95)
  assert.ok(u.universes.hsi.fetchedAt)
  // next round with budget 0 reuses the confirmed lists and gives breadth without any request
  const quiet = await run({ ...opts, fetchImpl: counted, budget: 0 })
  assert.equal(quiet.requests, 0)
  assert.equal(quiet.snapshot.markets.hsi.breadth, 100)
  assert.equal(quiet.snapshot.markets.hstech.breadth, 100)
  assert.equal(hkApiCalls, 2)
})

test('run: HK official API failure without cache or static list keeps status missing, no invented coverage', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'breadth-hk-'))
  const csiCodes = Array.from({ length: 300 }, (_, i) => String(600000 + i))
  const parseXls = async () => JSON.stringify({ date: TODAY, indexCode: '000300', rows: csiCodes.map(code => ({ code, name: code })) })
  const out = await run({
    fetchImpl: hkFetchMock(csiCodes, { hsi: [1, 2, 3], hstech: [100, 101, 102] }, { hkApiDown: true }),
    parseXls, cacheDir: path.join(dir, 'c'), outFile: path.join(dir, 'o.json'), universeFile: path.join(dir, 'u.json'),
    now: new Date(`${TODAY}T10:00:00Z`), budget: 300, // clamped to 40; CSI300 absorbs the round budget first
  })
  assert.equal(out.snapshot.markets.hsi, undefined)
  const u = JSON.parse(await readFile(path.join(dir, 'u.json'), 'utf8'))
  assert.equal(u.universes.hsi.status, 'missing')
  assert.equal(u.universes.hstech.status, 'missing')
})

test('run: a statically configured HK list with a non-whitelisted source stays missing when official confirmation fails', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'breadth-hk-'))
  const hkCodes = Array.from({ length: 30 }, (_, i) => String(i + 1))
  const hkFile = path.join(dir, 'hk.json')
  await writeFile(hkFile, JSON.stringify({ universes: { hsi: { id: 'hsi-constituents', status: 'ok', date: '2026-10-01', source: 'https://example.com/hsi', codes: hkCodes } } }))
  const csiCodes = Array.from({ length: 300 }, (_, i) => String(600000 + i))
  const parseXls = async () => JSON.stringify({ date: TODAY, indexCode: '000300', rows: csiCodes.map(code => ({ code, name: code })) })
  const base = { parseXls, cacheDir: path.join(dir, 'c'), outFile: path.join(dir, 'o.json'), universeFile: hkFile, now: new Date(`${TODAY}T09:00:00Z`), budget: 40 }
  const emptyHk = { hsi: [], hstech: [] }
  for (let i = 0; i < 8; i++) await run({ ...base, fetchImpl: hkFetchMock(csiCodes, emptyHk) }) // finish CSI300 first; HK official parse fails on empty lists
  // now the CSI pool is cached and costs nothing; the official HK API starts failing with HTTP 503
  const out = await run({ ...base, fetchImpl: hkFetchMock(csiCodes, emptyHk, { hkApiDown: true }), budget: 5, now: new Date(`${TODAY}T10:00:00Z`) })
  assert.equal(out.snapshot.markets.hsi, undefined)
  assert.ok(out.snapshot.issues.some(i => i.includes('恒生指数') && i.includes('失败')))
  const u = JSON.parse(await readFile(hkFile, 'utf8'))
  assert.equal(u.universes.hsi.status, 'missing')
})

test('run: corrupt cache files do not crash and are re-requested', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'breadth-'))
  const codes = Array.from({ length: 300 }, (_, i) => String(600000 + i))
  const fetchImpl = async url => {
    if (url.includes('000300cons.xls')) return { ok: true, arrayBuffer: async () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(2000)]) }
    const sym = new URL(url).searchParams.get('param').split(',')[0]
    return { ok: true, json: async () => ({ data: { [sym]: { qfqday: series(260, TODAY, k => 100 + k).map(([d, c]) => [d, '1', String(c), '1', '1', '1']) } } }) }
  }
  const parseXls = async () => JSON.stringify({ date: '2026-10-16', indexCode: '000300', rows: codes.map(code => ({ code, name: code })) })
  const opts = { fetchImpl, parseXls, cacheDir: path.join(dir, 'c'), outFile: path.join(dir, 'o.json'), universeFile: path.join(dir, 'u.json'), now: new Date(`${TODAY}T10:00:00Z`), budget: 3 }
  await run(opts)
  await writeFile(path.join(dir, 'c', 'bars', 'csi300', '600000.json'), '{not json')
  await writeFile(path.join(dir, 'c', 'meta-csi300.json'), '[1,2')
  const again = await run({ ...opts, now: new Date(`${TODAY}T11:00:00Z`) })
  assert.ok(again.snapshot.markets.csi300.exclusions.not_fetched >= 1)
})
