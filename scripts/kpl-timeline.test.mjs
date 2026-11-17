import test from 'node:test'
import assert from 'node:assert/strict'
import {
  boardTable, buildEvents, buildSlots, classifyBoards, conceptCounts, conceptHint, fromDaban, hms, indexDay, mergeHistory,
  parseBkChanges, parseIndexTrends, parseStockMeta, radarOf, slotOf, ztByBoard,
} from './kpl-timeline-lib.mjs'

// 构造某日 241 根分钟线：09:30–11:30、13:01–15:00
const minutesOfDay = () => {
  const out = []
  for (let m = 9 * 60 + 30; m <= 11 * 60 + 30; m++) out.push(m)
  for (let m = 13 * 60 + 1; m <= 15 * 60; m++) out.push(m)
  return out.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
}
const trendsBody = (closeAt) => {
  const rows = ['2026-11-16 15:00,100.00,100.00,100.00']
  for (const t of minutesOfDay()) { const c = closeAt(t); rows.push(`2026-11-17 ${t},${c.toFixed(2)},${(c + 0.1).toFixed(2)},${(c - 0.1).toFixed(2)}`) }
  return { rc: 0, data: { code: '000001', name: '上证指数', trends: rows } }
}

test('hms：数字与字符串时间统一成 HH:MM:SS，缺失为 null', () => {
  assert.equal(hms(92500), '09:25:00')
  assert.equal(hms('09:30'), '09:30:00')
  assert.equal(hms('14:01:02'), '14:01:02')
  assert.equal(hms(null), null)
  assert.equal(hms('-'), null)
})

test('指数分时：昨收取上一交易日最后一根；高低点与整点涨跌', () => {
  const p = parseIndexTrends(trendsBody((t) => (t === '10:00' ? 102 : t === '14:00' ? 97 : 100.5)))
  const d = indexDay(p, '2026-11-17', '2026-11-16')
  assert.equal(d.prevClose, 100)
  assert.equal(d.openPct, 0.5)
  assert.equal(d.high.t, '10:00')
  assert.equal(d.high.pct, 2.1)
  assert.equal(d.low.t, '14:00')
  assert.equal(d.low.pct, -3.1)
  assert.equal(d.amp, 5.2)
  assert.deepEqual(d.checkpoints.find((c) => c.t === '10:00'), { t: '10:00', pct: 2 })
  assert.equal(d.series.length, 241)
  assert.equal(d.times[121], '13:01')
})

test('指数分时：当日不足 241 根或缺上一交易日就抛错', () => {
  const body = trendsBody(() => 100)
  const short = { ...body, data: { ...body.data, trends: body.data.trends.slice(0, 100) } }
  assert.throws(() => indexDay(parseIndexTrends(short), '2026-11-17', '2026-11-16'), /不完整/)
  assert.throws(() => indexDay(parseIndexTrends(body), '2026-11-17', '2026-11-13'), /昨收/)
})

const bkBody = (dt = 20261117150000, extra = {}) => ({
  rc: 0,
  data: {
    dt, tc: 3,
    allbk: [
      { c: 'BK0596', n: '融资融券', u: '-1.21', zjl: -2200647.27, ct: 100, ms: { c: '920309', n: 'N菊乐', t: 8193 }, ydl: [{ t: 8202, ct: 40 }, { t: 8203, ct: 30 }] },
      { c: 'BK1036', n: '半导体', u: '1.50', zjl: 12345, ct: 50, ms: { c: '002685', n: '华东重机', t: 4 }, ydl: [{ t: 4, ct: 10 }, { t: 16, ct: 4 }, { t: 8218, ct: 6 }, { t: 8201, ct: 20 }] },
      { c: 'BK1200', n: '工程机械', u: '-', zjl: '-', ct: 20, ms: '-', ydl: [] },
    ],
    ...extra,
  },
})

test('板块异动：日期必须是目标日、收盘后；万元换算亿元；未公开名称的类型不计入偏多 / 偏空', () => {
  const r = parseBkChanges(bkBody(), '2026-11-17')
  assert.equal(r.time, '15:00:00')
  const semi = r.boards[1]
  assert.equal(semi.flow, 1.23)
  assert.equal(semi.pct, 1.5)
  assert.equal(semi.up, 30) // 封涨停 10 + 火箭发射 20
  assert.equal(semi.down, 4)
  assert.deepEqual(semi.types, [[8201, 20], [4, 10], [16, 4]])
  assert.equal(r.boards[0].flow, -220.06)
  const blank = r.boards[2]
  assert.equal(blank.pct, null)
  assert.equal(blank.flow, null)
  assert.equal(blank.ms, null)
  assert.throws(() => parseBkChanges(bkBody(20261116150000), '2026-11-17'), /不是 2026-11-17/)
  assert.throws(() => parseBkChanges(bkBody(20261117113000), '2026-11-17'), /还不是收盘后/)
  assert.throws(() => parseBkChanges(bkBody(20261117150000, { tc: 4 }), '2026-11-17'), /不完整/)
})

test('板块分类：统计类去掉，未归类的去掉', () => {
  const { boards } = parseBkChanges(bkBody(), '2026-11-17')
  const kinds = { stat: new Set(['BK0596']), concept: new Set(['BK0596', 'BK1036']), industry1: new Set(), industry2: new Set(['BK1200']), region: new Set() }
  const rows = classifyBoards(boards, kinds)
  assert.deepEqual(rows.map((r) => [r.name, r.kind]), [['半导体', 'concept'], ['工程机械', 'industry2']])
})

const zt = [
  { code: '002685', name: '华东重机', sector: '工程机械', boards: 3, firstSeal: '09:25:00', lastSeal: '09:25:00', opens: 0 },
  { code: '000001', name: '甲', sector: '工程机械', boards: 1, firstSeal: '09:41:00', lastSeal: '10:02:00', opens: 2 },
  { code: '000002', name: '乙', sector: '半导体', boards: 1, firstSeal: '10:05:00', lastSeal: null, opens: null },
  { code: '000003', name: '丙', sector: '', boards: 1, firstSeal: '13:10:00', lastSeal: null, opens: 0 },
]
const meta = parseStockMeta({ rc: 0, data: { diff: [
  { f12: '002685', f100: '工程机械', f103: '半导体,氢能源,融资融券' },
  { f12: '000001', f100: '工程机械', f103: '半导体,氢能源' },
  { f12: '000002', f100: '半导体', f103: '半导体,芯片' },
  { f12: '000003', f100: '-', f103: '-' },
] } }, new Set(['融资融券']))

test('个股所属概念：统计类概念去掉，"-" 视为缺失；概念提示按当日涨停只数排序且 ≥ 2', () => {
  assert.deepEqual(meta.get('002685').concepts, ['半导体', '氢能源'])
  assert.equal(meta.get('000003').industry, null)
  assert.deepEqual(meta.get('000003').concepts, [])
  const counts = conceptCounts(zt, meta)
  assert.equal(counts.get('半导体'), 3)
  assert.deepEqual(conceptHint('000002', meta, counts), [{ name: '半导体', zt: 3 }]) // 芯片只有 1 只，不提示
  assert.deepEqual(conceptHint('002685', meta, counts, { exclude: '半导体' }), [{ name: '氢能源', zt: 2 }])
})

test('板块表：行业 / 概念映射涨停只数与首只涨停；地域、一级行业不映射（null）', () => {
  const counts = conceptCounts(zt, meta)
  const groups = ztByBoard(zt, meta)
  const rows = boardTable([
    { code: 'BK1', name: '半导体', kind: 'concept', count: 10 },
    { code: 'BK2', name: '工程机械', kind: 'industry2', count: 30 },
    { code: 'BK3', name: '广东板块', kind: 'region', count: 20 },
  ], groups, meta, counts)
  assert.deepEqual(rows.map((r) => [r.name, r.zt]), [['工程机械', 2], ['广东板块', null], ['半导体', 3]])
  assert.deepEqual(rows[2].firstZt, { time: '09:25:00', code: '002685', name: '华东重机' })
})

test('时段归属：竞价、午间、尾盘', () => {
  assert.equal(slotOf('09:25:00'), '09:25')
  assert.equal(slotOf('09:59:59'), '09:30')
  assert.equal(slotOf('11:30:00'), '11:00')
  assert.equal(slotOf('13:00:05'), '13:00')
  assert.equal(slotOf('15:00:00'), '14:30')
  assert.equal(slotOf(null), null)
})

test('时间线：各部分可缺；按时间排序，同一时刻指数在前', () => {
  const sh = indexDay(parseIndexTrends(trendsBody(() => 100)), '2026-11-17', '2026-11-16')
  const groups = ztByBoard(zt, meta)
  const counts = conceptCounts(zt, meta)
  const ev = buildEvents({ indices: { sh }, zt, zb: [{ code: '000009', name: '炸', sector: '', firstSeal: '09:41:00', opens: 3, pct: 2 }], groups, meta, counts, radar: null })
  assert.ok(ev.every((e, i) => i === 0 || ev[i - 1].t <= e.t))
  assert.equal(ev.find((e) => e.t === '09:30:00').kind, 'index')
  assert.ok(ev.some((e) => e.kind === 'board' && e.title === '工程机械 首只涨停：华东重机'))
  assert.ok(ev.some((e) => e.kind === 'board' && e.title === '半导体 涨停扩散到 3 只'))
  assert.ok(ev.some((e) => e.kind === 'touch' && e.detail.includes('收盘 +2.00%')))
  assert.ok(!ev.some((e) => e.kind === 'radar'))
  assert.deepEqual(buildEvents({}), [])
  const withRadar = buildEvents({ radar: { timeline: [{ time: '10:00:01', code: '000001', name: '甲', type: 16, price: 9.9 }], top: { 8193: [{ code: '000002', name: '乙', n: 5, first: '09:31:00', last: '14:00:00' }] } } })
  assert.deepEqual(withRadar.map((e) => [e.t, e.kind, e.title]), [['09:31:00', 'bigbuy', '乙 首笔大笔买入'], ['10:00:01', 'radar', '甲 打开涨停板']])
})

test('半小时小结：涨停新增与累计、上证时段涨跌、新增最多的行业（≥ 2 只）', () => {
  const sh = indexDay(parseIndexTrends(trendsBody((t) => (t >= '10:00' ? 101 : 100.5))), '2026-11-17', '2026-11-16')
  const slots = buildSlots({ zt, zb: [], meta, sh, radar: { buckets: [{ t: '09:30', c: { 4: 3, 16: 1, 8201: 6 } }] } })
  const s0930 = slots.find((s) => s.id === '09:30')
  assert.equal(slots[0].ztNew, 1)
  assert.equal(s0930.ztNew, 1)
  assert.equal(s0930.ztCum, 2)
  assert.equal(s0930.shChange, 0.5)
  assert.equal(s0930.radar, 10)
  assert.equal(s0930.sealEv, 3)
  assert.equal(slots.find((s) => s.id === '13:00').ztCum, 4)
  assert.equal(slots.find((s) => s.id === '13:30').ztNew, 0)
  assert.equal(s0930.topIndustry, null) // 只有 1 只，不算
  const noData = buildSlots({})
  assert.equal(noData[0].shChange, null)
  assert.equal(noData[0].radar, null)
})

test('读其他页签数据：日期对不上就不用', () => {
  assert.equal(fromDaban({ asOf: '2026-11-16', zt: [{ code: '000001' }] }, '2026-11-17'), null)
  const r = fromDaban({ asOf: '2026-11-17', zt: [{ code: '000001', name: '甲', firstSeal: '09:30:00', lastSeal: null, opens: 0, boards: 1, sector: 'x' }], zb: [{ code: '000002', name: '乙', firstSeal: '10:00:00', opens: '', pct: 3 }] }, '2026-11-17')
  assert.equal(r.zt[0].lastSeal, null)
  assert.equal(r.zb[0].opens, null)
  assert.equal(radarOf({ radar: { date: '2026-11-16', timeline: [] } }, '2026-11-17'), null)
  assert.ok(radarOf({ radar: { date: '2026-11-17', timeline: [] } }, '2026-11-17'))
})

test('历史按日期去重', () => {
  const h = mergeHistory([{ date: '2026-11-16', zt: 1 }, { date: '2026-11-17', zt: 2 }], { date: '2026-11-17', zt: 3 })
  assert.deepEqual(h, [{ date: '2026-11-16', zt: 1 }, { date: '2026-11-17', zt: 3 }])
})
