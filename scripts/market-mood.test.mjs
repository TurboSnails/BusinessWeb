// 短线情绪页计算：板块归属、股池校验、晋级率、昨日表现、大幅回撤口径、强度分数、归档种子与历史合并
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickPrevState, saveState, boardCounts, boardOf, buildDay, compositeStrength, lbStrength, lin, mergeHistory, moodStatus, parseMargin, parsePool, parseSinaRow, seedFromArchive, zoneOf } from './market-mood-lib.mjs'

const row = (code, pct, { name = '股' + code, high, prev = 10, amount = 1e8 } = {}) => {
  const price = prev * (1 + pct / 100)
  const sym = (/^(6|9)/.test(code) ? 'sh' : /^(4|8|92)/.test(code) ? 'bj' : 'sz') + code
  return parseSinaRow({ symbol: sym, name, trade: price.toFixed(2), settlement: String(prev), high: String(high ?? Math.max(price, prev)), changepercent: pct, amount })
}
const p = (code, extra = {}) => ({ code, name: '股' + code, pct: 10, boards: 1, yBoards: null, sector: '', firstSeal: 93000, opens: 0, ...extra })

test('板块归属：主板、科创板、创业板、北证', () => {
  assert.equal(boardOf('sh600519'), 'sh')
  assert.equal(boardOf('sh688981'), 'kcb')
  assert.equal(boardOf('sz000001'), 'sz')
  assert.equal(boardOf('sz300750'), 'cyb')
  assert.equal(boardOf('bj920001'), 'bj')
})

test('股池：日期不符或条数不全时报错', () => {
  const body = { rc: 0, data: { qdate: 20261117, tc: 1, pool: [{ c: '000001', n: '平安银行', zdp: 10, lbc: 2, hybk: '银行' }] } }
  assert.deepEqual(parsePool(body, '2026-11-17')[0], { code: '000001', name: '平安银行', pct: 10, boards: 2, yBoards: null, sector: '银行', firstSeal: null, opens: null })
  assert.throws(() => parsePool(body, '2026-11-18'))
  assert.throws(() => parsePool({ rc: 0, data: { ...body.data, tc: 2 } }, '2026-11-17'))
})

test('融资余额：换算成亿元、按日期升序，NEW 记为沪深300', () => {
  const m = parseMargin({ result: { data: [
    { DIM_DATE: '2026-11-16 00:00:00', RZYE: 2235728126347, RZYEZB: 2.537391, NEW: 3979.8 },
    { DIM_DATE: '2026-11-13 00:00:00', RZYE: 2257200000000, RZYEZB: 2.528, NEW: 4016.29 },
  ] } })
  assert.deepEqual(m.map((r) => r.date), ['2026-11-13', '2026-11-16'])
  assert.deepEqual(m[1], { date: '2026-11-16', balance: 22357, ratio: 2.537, hs300: 3979.8 })
})

test('连板统计：五板及以上算高度板', () => {
  assert.deepEqual(boardCounts([p('1', { boards: 1 }), p('2', { boards: 2 }), p('3', { boards: 5 }), p('4', { boards: 7 })]), { b1: 1, b2: 1, b3: 0, b4: 0, high: 2, max: 7 })
})

test('分数：线性映射截断，缺项用其余项', () => {
  assert.equal(lin(0, -5, 5), 50)
  assert.equal(lin(9, -5, 5), 100)
  assert.equal(lbStrength({ lbPerf: 0, lbPromotion: 25, maxBoard: 4.5 }), 50)
  assert.equal(lbStrength({ lbPerf: null, lbPromotion: 50, maxBoard: 7 }), 100)
  assert.equal(lbStrength({ lbPerf: null, lbPromotion: null, maxBoard: null }), null)
  assert.equal(compositeStrength({ up: 3000, down: 1000, zt: 80, dt: 20, mood: 0.5, lb: 50 }), 64)
  assert.equal(moodStatus(2), '活跃')
  assert.equal(moodStatus(-1), '冰点')
  assert.equal(moodStatus(0.3), '不活跃')
  assert.equal(zoneOf(70), '偏热')
  assert.equal(zoneOf(30), '偏冷')
})

test('当日记录：晋级率、昨日表现、活跃股、大幅回撤、风向标', () => {
  const zt = [p('000001', { boards: 3, sector: '银行' }), p('000002', { boards: 2, sector: '银行' }), p('000003', { sector: '软件' }), p('000004', { name: '*ST四', sector: '银行' })]
  const zb = [p('000010')]
  const dt = [p('000020', { pct: -10 })]
  const yzt = [
    p('000001', { yBoards: 2, pct: 10 }), p('000002', { yBoards: 1, pct: 10 }), p('000005', { yBoards: 1, pct: -6 }), p('000006', { yBoards: 2, pct: -4 }),
  ]
  const rows = [
    row('000001', 10), row('000002', 10), row('000003', 10), row('000004', 5, { name: '*ST四' }), row('000010', 3, { high: 11 }), row('000020', -10),
    row('000005', -6, { high: 10.5 }), row('000006', -4, { high: 11 }), row('000030', 2), row('000040', -8, { high: 10.1 }), row('000050', 1, { high: 11, name: 'N新股' }),
    row('000060', 5),
  ]
  const { day, latest, state } = buildDay({ date: '2026-11-17', zt, zb, dt, yzt, rows, prevState: { date: '2026-11-16', zbCodes: ['000060'], bigCodes: ['000040'] }, hsAmountPrev: 1 })
  assert.deepEqual(day.boards, { b1: 2, b2: 1, b3: 1, b4: 0, high: 0, max: 3 })
  assert.equal(day.rates.r12, 50) // 昨日一板 2 只，今日二板 1 只
  assert.equal(day.rates.r23, 50) // 昨日二板 2 只，今日三板 1 只
  assert.equal(day.rates.lbPromotion, 50) // 昨日连板 2 只，今日仍涨停 1 只
  assert.equal(day.perf.zt, 2.5)
  assert.equal(day.perf.lb, 3)
  assert.equal(day.perf.broken, 5) // 昨日炸板 000060 今日 +5%
  assert.equal(day.mood, 3) // (10+10−6−4+5)/5
  assert.equal(day.ztReal, 3)
  assert.equal(day.sealRate, 80)
  // 大幅回撤：000006 昨日涨停，高 +10% 收 −4%，回撤 14；000040 昨日大涨，高 +1% 收 −8%，回撤 9；000010 炸板高 +10% 收 +3%，回撤 7（恰好达标）；新股不计
  assert.deepEqual(latest.retreatStocks.map((r) => [r.code, r.retreat]), [['000006', 14], ['000005', 11], ['000040', 9], ['000010', 7]])
  assert.equal(latest.vane[0].sector, '银行')
  assert.equal(latest.vane[0].count, 3)
  assert.deepEqual(latest.ladder.map((l) => l.boards), [3, 2])
  assert.deepEqual(state.zbCodes, ['000010'])
  assert.ok(latest.comment.includes('涨停 4 家、跌停 1 家'))
})

test('上一份状态日期不早于今天时不用（避免把今天的炸板当昨天的）', () => {
  const { day } = buildDay({ date: '2026-11-17', zt: [p('000001')], zb: [], dt: [], yzt: [], rows: [row('000001', 10), row('000060', 5)], prevState: { date: '2026-11-17', zbCodes: ['000060'], bigCodes: [] } })
  assert.equal(day.perf.broken, null)
})

test('归档种子：连板晋级率按相邻两天算，量能留空；合并时真实记录优先', () => {
  const snap = (dataDate, up) => ({ dataDate, session: 'closed', sources: [{ id: 'limitUp', status: 'ready' }], metrics: { ztOpen: 5, dtCount: 3, volume: 12000 }, upStocks: up })
  const seeded = seedFromArchive([
    snap('2026-11-17', [{ code: 'a', name: 'A', boards: 3 }, { code: 'c', name: 'C', boards: 1 }]),
    snap('2026-11-16', [{ code: 'a', name: 'A', boards: 2 }, { code: 'b', name: 'B', boards: 2 }]),
  ])
  assert.deepEqual(seeded.map((d) => d.date), ['2026-11-16', '2026-11-17'])
  assert.equal(seeded[1].rates.lbPromotion, 50)
  assert.equal(seeded[1].amount, null)
  assert.equal(seeded[1].sealRate, round1(2 / 7 * 100))
  const real = { date: '2026-11-17', zt: 99 }
  const merged = mergeHistory(seeded, [real])
  assert.equal(merged.at(-1).zt, 99)
  assert.equal(mergeHistory(merged, seeded).at(-1).zt, 99) // 种子不会覆盖真实记录
})

function round1(x) { return Math.round(x * 10) / 10 }

test('状态文件：同一天重跑仍取前一天的清单，只保留最近几天', () => {
  let store = saveState(null, { date: '2026-11-16', zbCodes: ['a'], bigCodes: ['b'] })
  store = saveState(store, { date: '2026-11-17', zbCodes: ['c'], bigCodes: [] })
  assert.deepEqual(pickPrevState(store, '2026-11-17'), { date: '2026-11-16', zbCodes: ['a'], bigCodes: ['b'] })
  store = saveState(store, { date: '2026-11-17', zbCodes: ['d'], bigCodes: [] }) // 同日重跑
  assert.deepEqual(pickPrevState(store, '2026-11-17').zbCodes, ['a'])
  assert.equal(pickPrevState(store, '2026-11-18').date, '2026-11-17')
  assert.equal(pickPrevState({ date: '2026-11-16', zbCodes: ['x'], bigCodes: [] }, '2026-11-17').zbCodes[0], 'x') // 兼容旧格式
  for (const d of ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23']) store = saveState(store, { date: d, zbCodes: [], bigCodes: [] })
  assert.deepEqual(Object.keys(store.days), ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23'])
  assert.equal(pickPrevState(null, '2026-11-17'), null)
})
