import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendLiveLog, LIVE_LOG_START } from './market-radar.mjs'

const row = (d, heatScore = -0.75) => ({ d, radar: 'neutral', spx: 7580, score: 0, heatScore, dims: [0, -0.5, -1, 0.5, 1] })

test('appendLiveLog：新月份追加一条，字段取月末信号', () => {
  const out = appendLiveLog([], [row('2026-09'), row('2026-10')], '2026-11-25T00:00:00.000Z')
  assert.deepEqual(out, [{
    d: '2026-10', recordedAt: '2026-11-25T00:00:00.000Z', heatScore: -0.75, score: 0,
    tier: 'neutral', dims: [0, -0.5, -1, 0.5, 1], spx: 7580,
  }])
})

test('appendLiveLog：同一月份只记一次，之后数据修订也不改写', () => {
  const first = appendLiveLog([], [row('2026-10')], 't1')
  const again = appendLiveLog(first, [row('2026-10', -0.5)], 't2')
  assert.equal(again, first)
  assert.equal(again[0].heatScore, -0.75)
})

test('appendLiveLog：开始记录之前的月份不记', () => {
  const log = []
  assert.equal(appendLiveLog(log, [row('2026-09')], 't'), log)
  assert.equal(LIVE_LOG_START, '2026-10')
})
