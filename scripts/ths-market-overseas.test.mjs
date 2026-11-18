// 同花顺 · 市场 · 外盘联动：虚构响应验证映射表、日期门禁、缺值处理与同向统计口径。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  OVERSEAS_TH, usSessionBefore, parseOverseasKline, sessionStats, isAnomaly, bjTime, boardSnapshotAllowed, hkCloseAllowed,
  parseBoardQuotes, buildOverseas, coMove, mergeOverseasHistory, overseasHistoryStats,
} from './ths-market-lib.mjs'

const MAP = JSON.parse(fs.readFileSync(new URL('./ths-market-overseas-map.json', import.meta.url), 'utf8'))
const kl = (rows, name = 'X') => ({ data: { name, klines: rows.map(r => r.join(',')) } })
/** 北京时间字符串 → Date */
const bj = (s) => new Date(Date.parse(`${s}:00+08:00`))

test('映射表：40–60 条、secid 格式、板块代码都有名称、无重复、无建议措辞', () => {
  assert.ok(MAP.stocks.length >= 40 && MAP.stocks.length <= 60)
  assert.equal(new Set(MAP.stocks.map(s => s.secid)).size, MAP.stocks.length)
  assert.equal(new Set(MAP.stocks.map(s => s.symbol)).size, MAP.stocks.length)
  for (const s of MAP.stocks) {
    assert.match(s.secid, s.market === 'US' ? /^10[567]\.[A-Z]+$/ : /^116\.\d{5}$/)
    assert.ok(s.boards.length >= 1 && s.boards.length <= 3 && s.boards.every(c => /^BK\d{4}$/.test(c) && MAP.boards[c]))
    assert.ok(s.reason && !/建议|买入|卖出/.test(s.reason))
  }
  const used = new Set(MAP.stocks.flatMap(s => s.boards))
  assert.deepEqual(Object.keys(MAP.boards).filter(c => !used.has(c)), [])
  assert.equal(MAP.indices.length, 5)
})

test('美股交易日：北京日期之前最近一个非周末、非 NYSE 休市日；表外年份报错', () => {
  assert.equal(usSessionBefore('2026-11-18'), '2026-11-17')
  assert.equal(usSessionBefore('2026-11-16'), '2026-11-13') // 北京周一 → 美股上周五
  assert.equal(usSessionBefore('2026-11-27'), '2026-11-25') // 感恩节 11-26 休市
  assert.throws(() => usSessionBefore('2030-01-10'), /未覆盖/)
})

test('日 K 解析：缺失记 null、乱序与非法日期丢弃、无数组返回 null', () => {
  const k = parseOverseasKline(kl([['2026-11-16', '10', '-'], ['2026-11-15', '9', '1'], ['2026-02-30', '1', '1'], ['2026-11-17', '', '2.5']], '英伟达'))
  assert.equal(k.name, '英伟达')
  assert.deepEqual(k.rows, [{ date: '2026-11-16', close: 10, pct: null }, { date: '2026-11-17', close: null, pct: 2.5 }])
  assert.equal(parseOverseasKline({ data: null }), null)
})

test('当日统计：必须恰好有目标日，σ 用之前 60 个涨跌幅且至少 40 个', () => {
  const rows = Array.from({ length: 61 }, (_, i) => ({ date: `2026-${String(8 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, close: 1, pct: i % 2 ? 1 : -1 }))
  const last = rows.at(-1)
  last.pct = 2.5
  const s = sessionStats(rows, last.date)
  assert.ok(Math.abs(s.sigma - 1.01) < 0.01)
  assert.ok(s.z > 2)
  assert.equal(isAnomaly(s), true) // 2.5% < 3%，但超过 2σ
  assert.equal(sessionStats(rows, '2026-12-31'), null) // 没有这一天，不拿相邻日顶替
  const short = sessionStats(rows.slice(-30), last.date)
  assert.equal(short.sigma, null); assert.equal(short.z, null)
  assert.equal(isAnomaly(short), false) // σ 缺失、2.5% < 3%
  assert.equal(isAnomaly({ pct: -3, z: null }), true) // σ 缺失时退回 3%
  assert.equal(isAnomaly({ pct: -6, z: -1.5 }), false) // 高波动标的 6% 不到 2σ，不算异动
  assert.equal(isAnomaly(null), false)
  assert.equal(sessionStats([{ date: '2026-11-17', close: 1, pct: null }], '2026-11-17'), null)
})

test('时间门禁：板块快照交易日 15:10 后且同日；港股 16:15 后', () => {
  assert.equal(boardSnapshotAllowed(bj('2026-11-18T15:09'), '2026-11-18'), false)
  assert.equal(boardSnapshotAllowed(bj('2026-11-18T15:10'), '2026-11-18'), true)
  assert.equal(boardSnapshotAllowed(bj('2026-11-19T09:00'), '2026-11-18'), false) // 隔日不再采快照
  assert.equal(boardSnapshotAllowed(bj('2026-11-21T16:00'), '2026-11-21'), false) // 周六
  assert.equal(hkCloseAllowed(bj('2026-11-18T15:40'), '2026-11-18'), false)
  assert.equal(hkCloseAllowed(bj('2026-11-18T16:15'), '2026-11-18'), true)
  assert.equal(hkCloseAllowed(bj('2026-11-19T01:00'), '2026-11-18'), true)
  assert.deepEqual(bjTime(Date.parse('2026-11-18T07:11:00Z') / 1000), { date: '2026-11-18', hm: '15:11' })
  assert.equal(bjTime(0), null)
})

test('板块行情：只收当天、名称核对、主力净流入换算亿元、缺失为 null', () => {
  const ts = Date.parse('2026-11-18T07:05:00Z') / 1000
  const body = { data: { diff: [
    { f12: 'BK1161', f14: '英伟达概念', f3: 1.78, f62: 2361684480, f124: ts },
    { f12: 'BK1134', f14: '算力概念', f3: '-', f62: '-', f124: ts },
    { f12: 'BK1128', f14: '改名了', f3: 1, f62: 1, f124: ts },
    { f12: 'BK1127', f14: 'AI芯片', f3: 1, f62: 1, f124: ts - 86400 },
    { f12: 'BK9999', f14: '无关', f3: 1, f62: 1, f124: ts },
  ] } }
  const r = parseBoardQuotes(body, '2026-11-18', MAP.boards)
  assert.deepEqual(r.map, { BK1161: { pct: 1.78, flow: 23.62 }, BK1134: { pct: null, flow: null } })
  assert.deepEqual(r.mismatched, ['BK1128 CPO概念≠改名了'])
  assert.equal(r.time, '15:05')
  assert.throws(() => parseBoardQuotes({ data: null }, '2026-11-18', MAP.boards))
})

test('组装与同向统计：美股取上一美股交易日、港股未收盘为 null、板块缺失不计观测', () => {
  const map = {
    boards: { BK1: '甲', BK2: '乙' },
    indices: [{ secid: '100.NDX', symbol: 'IXIC', name: '纳斯达克' }],
    stocks: [
      { secid: '105.A', symbol: 'A', name: '甲公司', market: 'US', boards: ['BK1', 'BK2'], reason: 'r' },
      { secid: '105.B', symbol: 'B', name: '乙公司', market: 'US', boards: ['BK2'], reason: 'r' },
      { secid: '116.00001', symbol: '00001', name: '港股', market: 'HK', boards: ['BK1'], reason: 'r' },
    ],
  }
  const klines = {
    '100.NDX': parseOverseasKline(kl([['2026-11-17', '100', '-0.7']])),
    '105.A': parseOverseasKline(kl([['2026-11-16', '10', '0'], ['2026-11-17', '11', '-4.2'], ['2026-11-18', '12', '9']])),
    '105.B': parseOverseasKline(kl([['2026-11-16', '10', '5']])), // 没有 11-17 → null
    '116.00001': parseOverseasKline(kl([['2026-11-18', '10', '-5']])),
  }
  const boards = { BK1: { pct: -1.2, flow: -3.4 }, BK2: { pct: 0.5, flow: null } }
  const o = buildOverseas({ map, klines, boards, asOf: '2026-11-18', usSession: '2026-11-17', hkOk: false })
  assert.deepEqual(o.indices, [{ symbol: 'IXIC', name: '纳斯达克', close: 100, pct: -0.7 }])
  const [a, b, h] = o.items
  assert.equal(a.pct, -4.2); assert.equal(a.date, '2026-11-17'); assert.equal(a.anomaly, true)
  assert.equal(b.pct, null); assert.equal(b.anomaly, false)
  assert.equal(h.pct, null) // 港股未收盘
  assert.deepEqual(a.boards[0], { code: 'BK1', name: '甲', pct: -1.2, flow: -3.4 })
  assert.deepEqual(o.summary, { anomalies: 1, obs: 2, same: 1 })
  const hk = buildOverseas({ map, klines, boards: null, asOf: '2026-11-18', usSession: '2026-11-17', hkOk: true })
  assert.equal(hk.items[2].pct, -5); assert.equal(hk.items[2].anomaly, true)
  assert.equal(hk.items[2].boards[0].pct, null) // 无板块快照 → null，不是 0
  assert.deepEqual(hk.summary, { anomalies: 2, obs: 0, same: 0 })
  assert.deepEqual(coMove([{ anomaly: true, pct: 3, boards: [{ pct: 0 }, { pct: 1 }] }]), { anomalies: 1, obs: 1, same: 1 })

  const h1 = mergeOverseasHistory({}, '2026-11-17', o.items)
  const h2 = mergeOverseasHistory(h1, '2026-11-18', hk.items.map(i => ({ ...i, boards: i.boards.map(x => ({ ...x, pct: 2 })) })))
  assert.deepEqual(h1['2026-11-17'], [{ symbol: 'A', pct: -4.2, boards: [['BK1', -1.2], ['BK2', 0.5]] }])
  const st = overseasHistoryStats({ ...h2, '2026-11-10': [{ symbol: 'GONE', pct: 5, boards: [] }] }, map)
  assert.equal(st.since, '2026-11-10'); assert.equal(st.days, 3)
  assert.deepEqual(st.rows, [
    { symbol: 'A', name: '甲公司', events: 2, obs: 4, same: 1 },
    { symbol: '00001', name: '港股', events: 1, obs: 1, same: 0 },
  ])
  assert.equal(OVERSEAS_TH.pct, 3)
})
