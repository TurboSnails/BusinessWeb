// 板块题材页计算：字段缺失不当 0、板块数据日期核对、强度公式、涨停分组、日 K 与每日存档合并、归档种子
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MIN_MEMBERS, annotateBoards, bjTime, boardSeries, boardStrength, compactDay, num, parseBoardRow, parseClistPage, parseKline,
  parseStockMeta, rangeReturn, secidOf, seedDays, sortByStrength, strongHistory, validateBoards, ztGroups,
} from './kpl-plates-lib.mjs'

// 2026-11-17 15:39:57 北京时间
const TS = Date.UTC(2026, 10, 17, 7, 39, 57) / 1000
const raw = (code, name, over = {}) => ({ f12: code, f14: name, f3: 1.5, f6: 1.23e10, f62: 3e8, f184: 2.4, f104: 20, f105: 8, f106: 2, f128: '领涨甲', f140: '000001', f136: 10.01, f124: TS, ...over })
const zt = (code, boards = 1, firstSeal = 93000, name = '股' + code) => ({ code, name, pct: 10, boards, yBoards: null, sector: '', firstSeal, opens: 0 })

test('字段：null / 空串 / "-" 都是缺失，不当 0', () => {
  assert.equal(num(null), null)
  assert.equal(num(''), null)
  assert.equal(num('-'), null)
  assert.equal(num('0'), 0)
  const r = parseBoardRow(raw('BK0001', '甲', { f3: '-', f62: null, f104: '-', f128: '-' }))
  assert.equal(r.pct, null)
  assert.equal(r.mainNet, null)
  assert.equal(r.members, null) // 上涨家数缺失 → 成分股数也缺失，不按 0 算
  assert.equal(r.leader, null)
})

test('板块行：金额换算成亿元，成分股数 = 涨 + 跌 + 平', () => {
  const r = parseBoardRow(raw('BK0001', '甲'))
  assert.equal(r.amount, 123)
  assert.equal(r.mainNet, 3)
  assert.equal(r.members, 30)
  assert.deepEqual(r.leader, { code: '000001', name: '领涨甲', pct: 10.01 })
  assert.throws(() => parseBoardRow({ f12: 'X', f14: '甲' }))
})

test('clist 结构校验', () => {
  assert.deepEqual(parseClistPage({ rc: 0, data: { total: 1, diff: [{ f12: 'BK0001' }] } }).total, 1)
  assert.throws(() => parseClistPage({ rc: 102, data: null }))
})

test('板块数据日期：更新时间必须是当天 15:00 后，否则放弃（板块行情本身不带日期）', () => {
  assert.deepEqual(bjTime(TS), { date: '2026-11-17', minutes: 15 * 60 + 39 })
  const rows = Array.from({ length: 20 }, (_, i) => parseBoardRow(raw(`BK${String(i).padStart(4, '0')}`, `板${i}`)))
  assert.equal(validateBoards(rows, '2026-11-17', { min: 10, max: 30, label: '行业' }).length, 20)
  // 次日凌晨跑：数据是 11-17 的，不能当 11-18 写
  assert.throws(() => validateBoards(rows, '2026-11-18', { min: 10, max: 30, label: '行业' }), /不是 2026-11-18 收盘后数据/)
  // 盘中数据
  const intraday = rows.map((r) => ({ ...r, updatedAt: TS - 3 * 3600 }))
  assert.throws(() => validateBoards(intraday, '2026-11-17', { min: 10, max: 30, label: '行业' }))
  assert.throws(() => validateBoards(rows.slice(0, 5), '2026-11-17', { min: 10, max: 30, label: '行业' }), /数量异常/)
  assert.throws(() => validateBoards([...rows, rows[0]], '2026-11-17', { min: 10, max: 30, label: '行业' }), /重复/)
})

test('个股所属板块：f100 行业、f103 概念逗号分隔，"-" 视为缺失', () => {
  const m = parseStockMeta({ rc: 0, data: { diff: [{ f12: '000001', f100: '银行Ⅱ', f103: '融资融券, 深股通,-' }, { f12: '000002', f100: '-', f103: '-' }] } })
  assert.deepEqual(m.get('000001'), { industry: '银行Ⅱ', concepts: ['融资融券', '深股通'] })
  assert.deepEqual(m.get('000002'), { industry: null, concepts: [] })
  assert.equal(secidOf('600519'), '1.600519')
  assert.equal(secidOf('688981'), '1.688981')
  assert.equal(secidOf('300750'), '0.300750')
  assert.equal(secidOf('920001'), '0.920001')
})

test('板块强度：四项平均；成分股不足时不计；缺项用其余项', () => {
  // 涨幅 1%（50）、上涨 20/40（50）、涨停 0 家（0）、主力净占比 0（50） → 37.5 → 38
  assert.equal(boardStrength({ pct: 1, up: 20, members: 40, zt: 0, mainNetPct: 0 }), 38)
  // 满分
  assert.equal(boardStrength({ pct: 6, up: 40, members: 40, zt: 9, mainNetPct: 12 }), 100)
  assert.equal(boardStrength({ pct: 5, up: 5, members: MIN_MEMBERS - 1, zt: 5, mainNetPct: 5 }), null)
  assert.equal(boardStrength({ pct: null, up: 20, members: 40, zt: 5, mainNetPct: null }), 75)
  assert.equal(boardStrength({ pct: 1, up: 1, members: null, zt: 1, mainNetPct: 1 }), null)
})

const meta = new Map([
  ['000001', { industry: '半导体', concepts: ['芯片', '华为'] }],
  ['000002', { industry: '半导体', concepts: ['芯片'] }],
  ['000003', { industry: '银行Ⅱ', concepts: ['华为'] }],
  ['000004', { industry: null, concepts: [] }],
])
const zts = [zt('000001', 3, 93100), zt('000002', 1, 92500), zt('000003', 1, 100000, '*ST丙'), zt('000004', 2)]

test('涨停家数与最高连板按所属板块统计；不在名单里的涨停股不硬塞', () => {
  const rows = [parseBoardRow(raw('BK0001', '半导体')), parseBoardRow(raw('BK0002', '银行Ⅱ', { f3: 2 })), parseBoardRow(raw('BK0003', '白酒'))]
  const out = sortByStrength(annotateBoards(rows, zts, meta, (m) => (m.industry ? [m.industry] : [])))
  const semi = out.find((b) => b.code === 'BK0001')
  assert.equal(semi.zt, 2)
  assert.equal(semi.maxBoards, 3)
  assert.equal(semi.upRatio, 66.7)
  assert.equal(out.find((b) => b.code === 'BK0003').zt, 0)
  assert.equal(out.find((b) => b.code === 'BK0003').maxBoards, null)
  assert.equal(out[0].code, 'BK0001')
  assert.equal('updatedAt' in semi, false)
})

test('题材涨停分布：组内按连板数、封板时间排，概念分组可重叠，只列名单内板块', () => {
  const boards = [{ name: '芯片', code: 'BK1', pct: 2 }, { name: '华为', code: 'BK2', pct: 1 }]
  const g = ztGroups(zts, meta, (m) => m.concepts, { minCount: 1, boards })
  assert.deepEqual(g.map((x) => [x.name, x.count]), [['芯片', 2], ['华为', 2]])
  assert.deepEqual(g[0].stocks.map((s) => [s.code, s.boards, s.firstSeal]), [['000001', 3, '09:31'], ['000002', 1, '09:25']])
  assert.equal(g[1].stocks.find((s) => s.code === '000003').st, true)
  assert.equal(ztGroups(zts, meta, (m) => m.concepts, { minCount: 3, boards }).length, 0)
})

test('日 K：解析、升序，区间涨幅不足时为 null', () => {
  const k = parseKline({ rc: 0, data: { klines: ['2026-11-17,110,1.5', '2026-11-16,100,-1', 'bad'] } })
  assert.deepEqual(k.map((x) => x.date), ['2026-11-16', '2026-11-17'])
  assert.equal(rangeReturn(k, 1), 10)
  assert.equal(rangeReturn(k, 5), null)
  assert.throws(() => parseKline({ rc: 0, data: null }))
})

test('走势合并：日 K 给收盘与涨幅，存档给涨停家数与强度；种子记录未列出即 0 家，真实记录未列出即缺失', () => {
  const kline = [{ date: '2026-11-13', close: 100, pct: 1 }, { date: '2026-11-16', close: 101, pct: 1 }, { date: '2026-11-17', close: 102, pct: 1 }]
  const days = [
    { date: '2026-11-13', seeded: true, industry: { BK9: [null, 2, null] } },
    { date: '2026-11-16', industry: { BK9: [1, 1, 40] } },
    { date: '2026-11-17', industry: { BK8: [1, 3, 70] } },
  ]
  const s = boardSeries({ code: 'BK8', kind: 'industry', kline, days })
  assert.deepEqual(s.map((p) => p.zt), [0, null, 3])
  assert.deepEqual(s.map((p) => p.strength), [null, null, 70])
  assert.equal(s[2].close, 102)
})

test('近几日强势板块：跳过种子日，按强度取前几', () => {
  const days = [
    { date: '2026-11-13', seeded: true, industry: { BK1: [null, 5, null] } },
    { date: '2026-11-16', industry: { ...compactDay([{ code: 'BK1', pct: 1, zt: 1, strength: 40 }, { code: 'BK2', pct: 2, zt: 0, strength: 60 }, { code: 'BK3', pct: 0, zt: 0, strength: null }]) } },
  ]
  const h = strongHistory(days, 'industry', new Map([['BK2', '乙']]), { top: 2 })
  assert.equal(h.length, 1)
  assert.deepEqual(h[0].boards.map((b) => [b.name, b.strength]), [['乙', 60], ['BK1', 40]])
})

test('归档种子：用现在的分类回填各板块涨停家数；查不到所属板块的超过 5% 整天不补', () => {
  const snap = (date, codes) => ({ dataDate: date, session: 'closed', upStocks: codes.map((code) => ({ code, boards: 1 })), sources: [{ id: 'limitUp', status: 'ready' }] })
  const out = seedDays([snap('2026-11-13', ['000001', '000002', '000003']), snap('2026-11-12', ['000001', '999999']), snap('2026-11-11', ['000001'])],
    meta, new Map([['半导体', 'BK1'], ['银行Ⅱ', 'BK2']]), new Map([['芯片', 'BK10'], ['华为', 'BK11']]), new Set(['2026-11-11']))
  assert.deepEqual(out.map((d) => d.date), ['2026-11-13'])
  assert.deepEqual(out[0].industry, { BK1: [null, 2, null], BK2: [null, 1, null] })
  assert.deepEqual(out[0].concept, { BK10: [null, 2, null], BK11: [null, 2, null] })
  assert.equal(out[0].seeded, true)
})
