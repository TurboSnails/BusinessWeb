// 「同花顺」页计算：股池与日 K 解析、RSI 与盘面评分、情绪指数与区间、三分位情绪状态、风向标、封成比、近 10 日涨停数、归档种子
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDay, emotionIndex, emotionZone, fcbGroups, fcbOf, hhmm, hotVane, hsAmounts, mergeZtStore, parseKline, parsePoolFull, parseQuote,
  pickPrevFcb, quantile, rsiSeries, saveState, saveZtCodes, seedFromArchive, sectorFocus, tenDayCounts, tertileState, trendLevel, trendSeries,
} from './ths-mood-lib.mjs'

const quote = (code, pct, { open, prev = 10, amount = 1e8, name = '股' + code } = {}) => {
  const price = prev * (1 + pct / 100)
  const sym = (/^(4|8|92)/.test(code) ? 'bj' : /^(6|9)/.test(code) ? 'sh' : 'sz') + code
  return parseQuote({ symbol: sym, name, trade: price.toFixed(2), settlement: String(prev), high: String(Math.max(price, prev)), open: open === undefined ? String(prev) : String(open), changepercent: pct, amount })
}
const p = (code, extra = {}) => ({ code, name: '股' + code, pct: 10, price: 11, boards: 1, yBoards: null, firstSeal: 93000, yFirstSeal: null, opens: 0, fund: 1e8, amount: 2e8, sector: '', days: 1, times: 1, ...extra })

test('股池：多取封单、成交额、价格、涨停统计；日期不符或条数不全时报错', () => {
  const body = { rc: 0, data: { qdate: 20261117, tc: 1, pool: [{ c: '002685', n: '华东重机', p: 6700, zdp: 10.02, amount: 227901016, lbc: 3, fbt: 92500, fund: 271326704, zbc: 0, hybk: '工程机械', zttj: { days: 3, ct: 3 } }] } }
  const r = parsePoolFull(body, '2026-11-17')[0]
  assert.equal(r.price, 6.7)
  assert.equal(r.fund, 271326704)
  assert.equal(r.days, 3)
  assert.equal(fcbOf(r), 1.19)
  assert.throws(() => parsePoolFull(body, '2026-11-18'))
  assert.throws(() => parsePoolFull({ rc: 0, data: { ...body.data, tc: 2 } }, '2026-11-17'))
  assert.equal(hhmm(92500), '09:25')
  assert.equal(hhmm(141005), '14:10')
})

test('新浪行情多取开盘价；停牌时开盘价为空', () => {
  assert.equal(quote('000001', 2, { open: 10.3 }).open, 10.3)
  const halted = parseQuote({ symbol: 'sz000002', name: '停', trade: '0.000', settlement: '10', high: '0', open: '0', changepercent: 0, amount: 0 })
  assert.equal(halted.open, null)
  assert.equal(halted.pct, null)
})

test('日 K 与两市成交额：按日期升序，上证＋深证综指（亿元）', () => {
  const sh = parseKline({ rc: 0, data: { klines: ['2026-11-17,3584.58,700000000000', '2026-11-16,3602.57,710000000000'] } })
  assert.deepEqual(sh.map((r) => r.date), ['2026-11-16', '2026-11-17'])
  const sz = parseKline({ rc: 0, data: { klines: ['2026-11-16,1,800000000000', '2026-11-17,1,757700000000'] } })
  assert.deepEqual(hsAmounts(sh, sz), [{ date: '2026-11-16', total: 15100 }, { date: '2026-11-17', total: 14577 }])
  assert.throws(() => parseKline({ rc: 0, data: { klines: [] } }))
})

test('RSI：一直上涨为 100、一直下跌为 0、涨跌相同为 50 附近；不足周期为空', () => {
  const up = Array.from({ length: 20 }, (_, i) => 100 + i)
  assert.equal(rsiSeries(up, 14).at(-1), 100)
  assert.equal(rsiSeries(up.map((x) => -x), 14).at(-1), 0)
  const zig = Array.from({ length: 30 }, (_, i) => (i % 2 ? 101 : 100))
  assert.ok(Math.abs(rsiSeries(zig, 14).at(-1) - 50) < 5)
  assert.equal(rsiSeries(up, 14)[13], null)
})

test('盘面评分：单边上涨 5 分为强，单边下跌 0 分为弱；四档文字', () => {
  const k = (closes) => closes.map((c, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, close: c, amount: 1 }))
  const rising = trendSeries(k(Array.from({ length: 25 }, (_, i) => 100 + i)))
  assert.equal(rising.length, 6) // 前 19 天不足 20 日均线
  assert.equal(rising.at(-1).score, 5)
  assert.equal(rising.at(-1).level, '强')
  assert.equal(trendSeries(k(Array.from({ length: 25 }, (_, i) => 200 - i))).at(-1).level, '弱')
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(trendLevel), ['弱', '弱', '偏弱', '偏强', '强', '强'])
})

test('情绪指数：五项平均；没有全市场涨跌或不足 3 项时不算；区间 70 / 30', () => {
  const e = emotionIndex({ up: 3000, down: 1000, zt: 80, dt: 20, broken: 20, premium: 0, volRatio: 1 })
  assert.deepEqual(e.parts, { breadth: 75, limit: 80, seal: 80, premium: 50, volume: 50 })
  assert.equal(e.value, 67)
  assert.equal(emotionIndex({ up: null, down: null, zt: 80, dt: 20, broken: 20, premium: 1, volRatio: 1 }).value, null)
  assert.equal(emotionIndex({ up: 10, down: 10, zt: null, dt: null, broken: null, premium: null, volRatio: 1 }).value, null)
  assert.equal(emotionIndex({ up: 10, down: 10, zt: 1, dt: 1, broken: null, premium: null, volRatio: 1 }).value, 50)
  assert.deepEqual([70, 69, 31, 30, null].map(emotionZone), ['贪婪风险区', '情绪中立区', '情绪中立区', '恐慌机会区', '无数据'])
})

test('情绪状态：与过去 90 日三分位比较；不足 20 天不判断；只看最近 90 天', () => {
  const past = Array.from({ length: 30 }, (_, i) => i * 3) // 0..87
  assert.equal(tertileState(80, past).state, '较高')
  assert.equal(tertileState(10, past).state, '较低')
  assert.equal(tertileState(45, past).state, '正常')
  assert.equal(tertileState(80, past.slice(0, 19)).state, null)
  assert.equal(tertileState(null, past).state, null)
  const long = [...Array(50).fill(100), ...Array(90).fill(10)]
  assert.equal(tertileState(50, long).n, 90)
  assert.equal(tertileState(50, long).state, '较高')
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5)
})

test('短线风向标：按昨日连板数、封板时间取最热；开盘涨幅以昨收为基数', () => {
  const yzt = [p('1', { yBoards: 1, yFirstSeal: 93000, pct: 1 }), p('2', { yBoards: 3, yFirstSeal: 100000, pct: 5 }), p('3', { yBoards: 3, yFirstSeal: 92500, pct: -2 })]
  const byCode = new Map([quote('000001', 1, { open: 9.8 }), quote('000002', 5, { open: 10.5 }), quote('000003', -2, { open: 10.3 })].map((r) => [r.code.slice(-1), r]))
  const v = hotVane(yzt, byCode)
  assert.deepEqual(v.stocks.map((s) => s.code), ['3', '2', '1'])
  assert.equal(v.stocks[0].openPct, 3)
  assert.equal(v.avgOpen, 2) // (3 + 5 − 2) ÷ 3
  assert.equal(v.highOpen, 2)
  assert.equal(v.lowOpen, 1)
  assert.equal(v.verdict, '竞价高开') // 平均开盘 ≥ +2%
  assert.equal(v.all, 3)
})

test('封成比分组：按昨日封成比三等分看今日表现；没有昨日记录或不足 6 只时不分组', () => {
  const yzt = ['1', '2', '3', '4', '5', '6'].map((c, i) => p(c, { pct: 6 - i * 2 }))
  const fcb = { 1: 3, 2: 2.5, 3: 1, 4: 0.8, 5: 0.1, 6: 0.05 }
  const g = fcbGroups(yzt, fcb)
  assert.equal(g.high.n, 2)
  assert.equal(g.high.avgPct, 5)
  assert.equal(g.low.avgPct, -3)
  assert.equal(g.high.red, 100)
  assert.equal(fcbGroups(yzt, null), null)
  assert.equal(fcbGroups(yzt.slice(0, 5), fcb), null)
})

test('近 10 日涨停数：只数窗口内有记录的日期；代码库保留最近 15 天并清掉过期名称', () => {
  let store = null
  for (let i = 1; i <= 16; i++) store = saveZtCodes(store, `2026-10-${String(i).padStart(2, '0')}`, i === 1 ? [p('999')] : [p('1'), ...(i % 2 ? [p('2')] : [])])
  assert.equal(Object.keys(store.days).length, 15)
  assert.equal(store.names['999'], undefined)
  const dates = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 7).padStart(2, '0')}`)
  const t = tenDayCounts(store, dates, {})
  assert.equal(t.covered, 10)
  assert.deepEqual(t.top.slice(0, 2).map((x) => [x.code, x.count]), [['1', 10], ['2', 5]])
  assert.equal(t.multi, 2)
  assert.equal(tenDayCounts(store, ['2026-12-01'], {}).covered, 0)
  assert.deepEqual(mergeZtStore({ days: { a: ['1'] }, names: {} }, { days: { a: ['9'], b: ['2'] }, names: { 2: 'x' } }).days, { a: ['1'], b: ['2'] })
})

test('涨停聚焦：按行业计数，领涨股取连板最高', () => {
  const s = sectorFocus([p('1', { sector: '算力', boards: 1 }), p('2', { sector: '算力', boards: 3 }), p('3', { sector: '电力' })])
  assert.deepEqual(s.map((x) => [x.sector, x.count, x.lead.code]), [['算力', 2, '2'], ['电力', 1, '3']])
})

test('当日记录：涨跌、封板率、成交额与量能比、情绪指数、风向标、封成比、复盘文字', () => {
  const rows = [quote('000001', 10, { open: 10.5 }), quote('000002', 10), quote('000003', -10), quote('000004', 2, { open: 9.5 }), quote('000005', -1), quote('920001', 1, { amount: 5e8 })]
  const zt = [p('000001', { boards: 2, sector: '算力' }), p('000002', { sector: '算力' })]
  const yzt = [p('000001', { yBoards: 1, pct: 10 }), p('000004', { yBoards: 1, pct: 2 })]
  const amounts = Array.from({ length: 20 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, total: 10000 }))
  const history = Array.from({ length: 25 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, emotion: 40 + (i % 5) * 5 }))
  const ztStore = saveZtCodes({ days: { '2026-11-16': ['000001'] }, names: {} }, '2026-11-17', zt)
  const { day, latest, state } = buildDay({ date: '2026-11-17', zt, zb: [p('000009')], dt: [p('000003')], yzt, rows, amounts, history, prevFcb: { '000001': 2 }, ztStore, tradeDates: ['2026-11-16', '2026-11-17'] })
  assert.equal(day.up, 4)
  assert.equal(day.down, 2)
  assert.equal(day.sealRate, 66.7)
  assert.equal(day.premium, 6)
  assert.equal(day.amount, 5) // 今天没有日 K，退回新浪沪深合计（不含北证）
  assert.equal(day.volRatio, 0.001)
  assert.ok(day.emotion !== null)
  assert.equal(latest.emotionInfo.n, 25)
  assert.equal(latest.vane.stocks[0].openPct, 5)
  assert.equal(latest.ztList[0].code, '000001')
  assert.equal(latest.ztList[0].ten, 2)
  assert.equal(latest.ztList[0].fcb, 0.5)
  assert.equal(latest.sectors[0].sector, '算力')
  assert.equal(latest.fcb.groups, null) // 匹配不足 6 只
  assert.match(latest.review, /涨停 2 家、跌停 1 家/)
  assert.doesNotMatch(latest.review, /建议|买入|卖出/)
  assert.deepEqual(state, { date: '2026-11-17', fcb: { '000001': 0.5, '000002': 0.5 } })
})

test('状态文件：取早于当天的最近一天，同日重跑不会把当天当成昨天', () => {
  const store = saveState(saveState(null, { date: '2026-11-16', fcb: { a: 1 } }), { date: '2026-11-17', fcb: { a: 2 } })
  assert.deepEqual(pickPrevFcb(store, '2026-11-17'), { a: 1 })
  assert.deepEqual(pickPrevFcb(store, '2026-11-18'), { a: 2 })
  assert.equal(pickPrevFcb(null, '2026-11-18'), null)
})

test('归档种子：有全市场涨跌的日期算情绪指数，没有的留空；同时产出涨停代码库', () => {
  const snap = (date, { breadth = null, lu = null } = {}) => ({
    dataDate: date, session: 'closed', upStocks: [{ code: '000001', name: '甲', boards: 2 }, { code: '000002', name: '*ST乙', boards: 1 }],
    metrics: { ztOpen: 2, dtCount: 1 }, sources: [{ id: 'limitUp', status: 'ready' }],
    sentiment: { breadth: breadth ? { status: 'ready', ...breadth } : { status: 'error' }, limitUp: lu ? { status: 'ready', ...lu } : { status: 'error' } },
  })
  const { days, ztStore } = seedFromArchive([snap('2026-11-13', { breadth: { up: 3000, down: 1000, flat: 100 }, lu: { averagePct: 1 } }), snap('2026-11-12'), { dataDate: '2026-11-11', session: 'open' }], [])
  assert.deepEqual(days.map((d) => d.date), ['2026-11-12', '2026-11-13'])
  assert.equal(days[0].emotion, null)
  assert.ok(days[1].emotion > 0)
  assert.equal(days[1].ztReal, 1)
  assert.equal(days[1].sealRate, 50)
  assert.ok(days.every((d) => d.seeded))
  assert.deepEqual(ztStore.days['2026-11-13'], ['000001', '000002'])
  assert.equal(ztStore.names['000001'], '甲')
})
