import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BUCKETS, buildReview, cell, indexCloses, mergeLedgers, MIN_N, observations, pairFor, spread, weekEnd } from './rating-review.mjs'

const row = (price, bucket) => [price, bucket, null, null, null, -1]
/** 合成台账：每周一期，n 只美股，档位按代码轮换，价格按档位给不同涨幅 */
function syntheticLedger(dates, perBucket, growth) {
  const snapshots = {}
  dates.forEach((d, t) => {
    const s = {}
    for (let b = 0; b < 4; b++) for (let k = 0; k < perBucket; k++) s[`us:S${b}_${k}`] = row(100 * (1 + growth[b]) ** t, b)
    s['us:UNRATED'] = row(10, null)
    s['us:NOVAL'] = row(10, 4)
    s['xx:BAD'] = row(10, 1)
    snapshots[d] = s
  })
  return { schemaVersion: 1, snapshots }
}
const spx = (dates, weekly = 0.01) => ({ markets: { spx: { week: dates.map((d, i) => ({ date: d, close: 1000 * (1 + weekly) ** i, volume: 1 })) } } })

test('档位顺序与 ledger.ts 的 RATING_CODES 前四档一致（台账存下标）', () => {
  const src = readFileSync(new URL('../src/features/signals/ledger.ts', import.meta.url), 'utf8')
  const codes = src.match(/RATING_CODES[^=]*=\s*\[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1))
  assert.deepEqual(codes.slice(0, 4), BUCKETS)
})

test('周归属与配对：雅虎周一标签与腾讯周五标签落在同一周；配对容差 3 天', () => {
  assert.equal(weekEnd('2026-11-09'), '2026-11-14')
  assert.equal(weekEnd('2026-11-13'), '2026-11-14')
  assert.equal(weekEnd('2026-11-14'), '2026-11-14')
  const dates = ['2026-10-23', '2026-10-30', '2026-11-07', '2026-11-13']
  assert.equal(pairFor(dates, '2026-10-23', 1), '2026-10-30')
  assert.equal(pairFor(dates, '2026-10-30', 1), '2026-11-07')
  assert.equal(pairFor(dates, '2026-10-23', 2), '2026-11-07')
  assert.equal(pairFor(dates, '2026-10-23', 4), null)
})

test('观测：只取四档评级、价格有效、已知市场；超额 = 个股 − 指数', () => {
  const dates = ['2026-01-02', '2026-01-09']
  const ledger = syntheticLedger(dates, 2, [0.05, 0.02, 0, -0.03])
  const obs = observations(ledger, indexCloses(spx(dates)), 1)
  assert.equal(obs.length, 8)
  const top = obs.find(o => o.bucket === 0)
  assert.ok(Math.abs(top.ret - 0.05) < 1e-12)
  assert.ok(Math.abs(top.excess - 0.04) < 1e-12)
  // 缺指数时保留收益但超额为空
  const noIndex = observations(ledger, indexCloses({ markets: {} }), 1)
  assert.ok(noIndex.every(o => o.excess === null))
})

test('格子：n<30 样本不足不给数值；持有期未到为待积累；期数少为早期读数', () => {
  const mk = (n, periods) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, from: `p${i % periods}`, ret: 0.01, excess: i % 2 ? 0.02 : -0.01 }))
  assert.deepEqual(Object.keys(cell(mk(MIN_N - 1, 10), true)).sort(), ['n', 'nExcess', 'periods', 'securities', 'status'])
  assert.equal(cell(mk(MIN_N - 1, 10), true).status, 'insufficient')
  assert.equal(cell([], false).status, 'pending')
  assert.equal(cell(mk(40, 3), true).status, 'early')
  const ok = cell(mk(40, 10), true)
  assert.equal(ok.status, 'ok')
  assert.equal(ok.hitRate, 0.5)
  assert.equal(ok.meanExcess, 0.005)
  const s = spread({ 优先关注: ok, 条件关注: { ...ok, meanExcess: 0.001 }, 观察: cell(mk(5, 5), true), 回避: ok })
  assert.equal(s[0].meanExcess, 0.004)
  assert.equal(s[1].status, 'insufficient')
  assert.equal(s[3].meanExcess, 0)
})

test('buildReview：档位差方向正确、未到的持有期为待积累，输出确定', () => {
  const dates = Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, 0, 2 + 7 * i)).toISOString().slice(0, 10))
  const ledger = syntheticLedger(dates, 10, [0.02, 0.01, 0, -0.01])
  const r = buildReview(ledger, spx(dates, 0.005))
  assert.equal(r.asOf, dates.at(-1))
  assert.equal(r.snapshots, 10)
  const w1 = r.horizons.find(h => h.weeks === 1)
  assert.equal(w1.pairs, 9)
  const us = w1.markets.us
  assert.equal(us.cells['优先关注'].status, 'ok')
  assert.equal(us.cells['优先关注'].nExcess, 90)
  assert.ok(us.spreads.every(s => s.meanExcess > 0))
  assert.equal(w1.markets.cn.cells['观察'].status, 'insufficient')
  const w13 = r.horizons.find(h => h.weeks === 13)
  assert.equal(w13.reached, false)
  assert.equal(w13.markets.all.cells['观察'].status, 'pending')
  const w4 = r.horizons.find(h => h.weeks === 4)
  assert.equal(w4.markets.us.cells['观察'].status, 'early') // 6 个起始期 < 8
  assert.equal(JSON.stringify(buildReview(ledger, spx(dates, 0.005))), JSON.stringify(r))
  assert.equal(r.coverage.us['回避'], 10)
  assert.throws(() => buildReview({ schemaVersion: 1, snapshots: {} }, {}))
})

test('mergeLedgers：跨年台账合并并按日期排序，忽略无效文件', () => {
  const m = mergeLedgers([{ schemaVersion: 1, snapshots: { '2027-01-08': {} } }, null, { schemaVersion: 2, snapshots: { x: {} } }, { schemaVersion: 1, snapshots: { '2026-12-31': {} } }])
  assert.deepEqual(Object.keys(m.snapshots), ['2026-12-31', '2027-01-08'])
})
