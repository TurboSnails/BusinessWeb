import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawdown, monthly, parseCsv, subtract, underperformStreak, yoy } from '../server/macro.mjs'
import { refreshUsLong } from './macro-snapshot.mjs'

test('解析 FRED CSV，跳过缺失值', () => {
  assert.deepEqual(parseCsv('observation_date,X\n2026-01-01,1.5\n2026-01-02,.\n2026-01-03,2'), [['2026-01-01', 1.5], ['2026-01-03', 2]])
})

test('日度数据按月取最后一个观测', () => {
  assert.deepEqual(monthly([['2026-01-05', 1], ['2026-01-30', 2], ['2026-02-02', 3]]), [['2026-01-30', 2], ['2026-02-02', 3]])
})

test('同比按 12 个月前同月计算，缺基期的月份不输出', () => {
  assert.deepEqual(yoy([['2025-01-01', 100], ['2025-02-01', 100], ['2026-01-01', 103]]), [['2026-01-01', 3]])
})

test('回撤取窗口内历史最高点', () => {
  assert.deepEqual(drawdown([['a', 100], ['b', 120], ['c', 90]]).map(r => r[1]), [0, 0, 25])
})

test('两个序列按月对齐相减', () => {
  assert.deepEqual(subtract([['2026-08-01', 3.63]], [['2026-08-01', 3.01], ['2026-09-01', 3]]), [['2026-08-01', 0.62]])
})

test('连续跑输周数从最近一周往前数，遇到跑赢即停', () => {
  const kre = [['w1', 100], ['w2', 102], ['w3', 100], ['w4', 99]]
  const spy = [['w1', 100], ['w2', 101], ['w3', 100], ['w4', 100.5]]
  assert.equal(underperformStreak(kre, spy), 2)
})

test('FRED CSV：兼容 DATE 表头与科学计数法', () => {
  assert.deepEqual(parseCsv('DATE,X\n2026-01-01,1e2\r\n2026-01-02,-0.5\r\n'), [['2026-01-01', 100], ['2026-01-02', -0.5]])
})

test('FRED CSV：HTML/错误页、错误表头、非法日期、空值不是有效观测', () => {
  assert.deepEqual(parseCsv('<!DOCTYPE html>\n<html>\n<link rel="x" href="a,400">\n</html>'), [])
  assert.deepEqual(parseCsv('<link rel="stylesheet" href="/a.css">,400\n<link href="b">,400'), [])
  assert.deepEqual(parseCsv('foo,bar\n2026-01-01,1'), [])
  assert.deepEqual(parseCsv('observation_date,X\n2026-02-30,1\n2026-13-01,2\n20260101,3\n2026-01-01,\n2026-01-02, \n2026-01-03,abc\n2026-01-04,Infinity'), [])
  assert.deepEqual(parseCsv('observation_date,X\n2026-01-01,1\n<link rel="a">,400'), [['2026-01-01', 1]])
})

test('FRED 返回 HTML 时 buildSnapshots 抛错并沿用旧快照，不写入污染值', async () => {
  const { buildSnapshots } = await import('../server/macro.mjs')
  const realFetch = globalThis.fetch
  globalThis.fetch = async url => String(url).includes('fredgraph')
    ? new Response('<!DOCTYPE html>\n<html>\n<link rel="canonical" href="x">,400\n</html>', { status: 200 })
    : new Response('', { status: 500 })
  try {
    const old = { latest: { date: '2026-01-01', value: 4.1 }, history: [['2026-01-01', 4.1]] }
    const snap = await buildSnapshots({ us: { series: { unrate: old } } })
    assert.deepEqual(snap.us.series.unrate, { ...old, live: false })
    assert.ok(snap.warnings.some(w => w.startsWith('unrate：') && w.includes('无数据')))
  } finally { globalThis.fetch = realFetch }
})

function shortSnapshot(...keys) {
  return { generatedAt: '2026-03-01', series: Object.fromEntries(keys.map(key => [key, {
    latest: { date: '2026-01-30', value: 3 }, history: [['2026-01-30', 3]],
  }])) }
}

test('美国长历史按频率保留原始月度和季度观测，对周频和日频只取月末已有观测', async () => {
  const current = shortSnapshot('gdp', 'ccDelinq', 'unrate', 'claims', 'tenYear', 'hy')
  const quarters = [['2025-10-01', 3.1], ['2026-01-01', 3.2]]
  const unemployment = [['2026-01-01', 4.1], ['2026-03-01', 4.2]]
  const quotes = [['2026-01-02', 3.11], ['2026-01-30', 3.24], ['2026-02-02', 3.35]]
  const data = {
    A191RL1Q225SBEA: quarters, DRCCLACBS: quarters, UNRATE: unemployment, DGS10: quotes, BAMLH0A0HYM2: quotes,
    IC4WSA: [['2026-01-03', 246000], ['2026-01-31', 203750], ['2026-02-07', 210750]],
  }
  const { us, warnings } = await refreshUsLong(current, current, { fetchRows: async id => data[id] })
  assert.deepEqual(warnings, [])
  for (const key of ['gdp', 'ccDelinq']) {
    assert.equal(us.series[key].frequency, 'quarterly')
    assert.deepEqual(us.series[key].long, quarters)
  }
  assert.deepEqual(us.series.unrate.long, unemployment)
  assert.deepEqual(us.series.claims.long, [['2026-01-31', 20.4], ['2026-02-07', 21.1]])
  assert.deepEqual(us.series.tenYear.long, quotes.slice(1))
  assert.deepEqual(us.series.hy.long, [['2026-01-30', 324], ['2026-02-02', 335]])
  for (const [key, { frequency, long, ...short }] of Object.entries(us.series)) {
    assert.ok(frequency && long.length)
    assert.deepEqual(short, current.series[key])
  }
})

test('美国计算型长历史复用同比、对齐相减和逐日峰值回撤公式', async () => {
  const current = shortSnapshot('corePce', 'realRate', 'dd')
  const data = {
    PCEPILFE: [['2025-01-01', 100], ['2025-03-01', 100], ['2026-01-01', 103.125], ['2026-02-01', 104], ['2026-03-01', 104]],
    FEDFUNDS: [['2026-01-01', 3.75], ['2026-02-01', 3.75]],
    SP500: [['2026-01-09', 160], ['2026-01-30', 120], ['2026-02-27', 152]],
  }
  const requested = []
  const { us, warnings } = await refreshUsLong(current, current, {
    fetchRows: async id => {
      requested.push(id)
      return data[id]
    },
    readSpx: async () => [['2025-12-31', 100], ['2026-01-02', 140], ['2026-01-09', 200]],
  })
  assert.deepEqual(warnings, [])
  assert.equal(requested.filter(id => id === 'PCEPILFE').length, 1)
  assert.deepEqual(us.series.corePce.long, [['2026-01-01', 3.13], ['2026-03-01', 4]])
  assert.deepEqual(us.series.realRate.long, [['2026-01-01', 0.62]])
  assert.deepEqual(us.series.dd.long, [['2025-12-31', 0], ['2026-01-30', 25], ['2026-02-27', 5]])
})

test('刷新长历史失败或计算无重叠数据时保留旧 long 和本次短期读数', async () => {
  const current = shortSnapshot('unrate', 'realRate', 'dd')
  const oldLong = [['2000-01-01', 4]]
  const previous = { series: Object.fromEntries(Object.keys(current.series).map(key => [key, { long: oldLong }])) }
  const { us, warnings } = await refreshUsLong(current, previous, {
    fetchRows: async id => {
      if (id === 'UNRATE') throw new Error('HTTP 503')
      if (id === 'FEDFUNDS') return [['2026-02-01', 4]]
      return [['2025-01-01', 100], ['2026-01-01', 102]]
    },
    readSpx: async () => { throw new Error('缓存不可读') },
  })
  for (const [key, series] of Object.entries(us.series)) {
    assert.deepEqual(series, { ...current.series[key], frequency: 'monthly', long: oldLong })
    assert.ok(warnings.some(warning => warning.startsWith(key) && warning.includes('保留旧长历史')))
  }
})
