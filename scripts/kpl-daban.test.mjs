// 打板页计算：股池字段映射、时间格式、板型、曾跌停、竞价、次日表现、归档种子、历史合并与溢价基因
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAuction, buildDaban, buildTouched, computeGenes, hms, mapDt, mapNew, mapZt, mergeStore, nextDayRecord, parseSinaFull, parseTencent,
  poolRaw, sealShape, seedFromArchive, touchCandidates, ymd,
} from './kpl-daban-lib.mjs'

const sina = (code, { name = '股' + code, prev = 10, price, open, high, low, pct } = {}) => {
  const sym = (/^(6|9)/.test(code) ? 'sh' : 'sz') + code
  const p = price ?? prev
  return parseSinaFull({
    symbol: sym, name, trade: String(p), settlement: String(prev), open: open === undefined ? String(p) : String(open), high: String(high ?? Math.max(p, prev)),
    low: String(low ?? Math.min(p, prev)), changepercent: pct ?? ((p - prev) / prev) * 100, amount: 1e8,
  })
}

test('时间与日期：东财时间整数补零，缺失或 0 为 null', () => {
  assert.equal(hms(92500), '09:25:00')
  assert.equal(hms(143544), '14:35:44')
  assert.equal(hms(0), null)
  assert.equal(hms(null), null)
  assert.equal(hms(''), null)
  assert.equal(ymd(20261117), '2026-11-17')
  assert.equal(ymd(''), null)
})

test('股池：日期不符时报错；字段映射价格除以 1000，缺失不当 0', () => {
  const body = { rc: 0, data: { qdate: 20261117, tc: 1, pool: [{ c: '002685', n: '华东重机', p: 6700, zdp: 10.0164, lbc: 3, fbt: 92500, lbt: 92500, fund: 271326704, zbc: 0, hs: 3.3758, ltsz: 6.75e9, amount: 2.28e8, hybk: '工程机械', zttj: { days: 3, ct: 3 } }] } }
  const r = mapZt(poolRaw(body, '2026-11-17')[0])
  assert.equal(r.price, 6.7)
  assert.equal(r.pct, 10.02)
  assert.equal(r.firstSeal, '09:25:00')
  assert.deepEqual(r.streak, { days: 3, ct: 3 })
  assert.throws(() => poolRaw(body, '2026-11-18'))
  const miss = mapZt({ c: '000001', n: '甲', fund: null, zbc: '', lbc: null })
  assert.equal(miss.fund, null)
  assert.equal(miss.opens, null)
  assert.equal(miss.boards, null)
  assert.equal(miss.streak, null)
  const d = mapDt({ c: '600327', n: '大东方', p: 5230, zdp: -9.98, days: 3, lbt: 130101, oc: 17, fund: 1.4e8, fba: 2.2e9 })
  assert.equal(d.lastSeal, '13:01:01')
  assert.equal(d.opens, 17)
  const n = mapNew({ c: '920309', n: 'N菊乐', p: 56780, ztp: 1000000000, ipod: 20261117, ods: 1, nh: 0 })
  assert.equal(n.noLimit, true)
  assert.equal(n.listDate, '2026-11-17')
  assert.equal(n.newHigh, false)
})

test('新浪行：补开盘价与最低价，停牌为 null', () => {
  const r = sina('600001', { prev: 10, price: 11, open: 10.5, low: 10.2 })
  assert.equal(r.open, 10.5)
  assert.equal(r.low, 10.2)
  const s = parseSinaFull({ symbol: 'sz000002', name: '停牌', trade: '0', settlement: '10', open: '0', high: '0', low: '0', changepercent: 0, amount: 0 })
  assert.equal(s.open, null)
  assert.equal(s.low, null)
})

test('板型：一字 / T字 / 换手；缺价为 null', () => {
  assert.equal(sealShape(sina('600001', { price: 11, open: 11, high: 11, low: 11 })), '一字')
  assert.equal(sealShape(sina('600001', { price: 11, open: 11, high: 11, low: 10.5 })), 'T字')
  assert.equal(sealShape(sina('600001', { price: 11, open: 10.2, high: 11, low: 10 })), '换手')
  assert.equal(sealShape(undefined), null)
})

test('腾讯报价：只收当日行情，取涨跌停价，-1 记为 null', () => {
  // 腾讯字段：3 现价、4 昨收、5 今开、30 时间、33 最高、34 最低、47 涨停价、48 跌停价
  const q = (sym, name, f) => { const a = Array(50).fill('x'); a[0] = '1'; a[1] = name; a[2] = sym.slice(2); for (const [i, v] of Object.entries(f)) a[i] = v; return `v_${sym}="${a.join('~')}";` }
  const t = [
    q('sh600831', '广电网络', { 3: '3.17', 4: '3.52', 5: '3.40', 30: '20261117161458', 33: '3.46', 34: '3.17', 47: '3.87', 48: '3.17' }),
    q('bj920309', 'N菊乐', { 3: '56.78', 4: '31.92', 5: '48.00', 30: '20261117153238', 33: '70.02', 34: '47.00', 47: '-1', 48: '-1' }),
    q('sz000001', '旧', { 3: '10', 4: '10', 5: '10', 30: '20261116150000', 33: '10', 34: '10', 47: '11', 48: '9' }),
  ].join('\n')
  const m = parseTencent(t, '2026-11-17')
  assert.deepEqual(m.get('600831'), { price: 3.17, prev: 3.52, open: 3.4, high: 3.46, low: 3.17, limitUp: 3.87, limitDown: 3.17 })
  assert.equal(m.get('920309').limitDown, null)
  assert.equal(m.has('000001'), false)
})

test('曾跌停：最低触及跌停价且收盘高于跌停价；收在跌停、无跌停价、新股都不算', () => {
  const rows = [
    sina('600001', { prev: 10, price: 9.5, low: 9 }), // 触及后打开
    sina('600002', { prev: 10, price: 9.6, low: 9.3 }), // 没到跌停价（5% 候选但跌停价 9.00）
    sina('600003', { prev: 10, price: 9, low: 9 }), // 收在跌停（在跌停池）
    sina('600004', { name: 'N新股', prev: 10, price: 9.5, low: 8 }),
    sina('600005', { prev: 10, price: 9.99, low: 9.7 }), // 跌幅不够，不进候选
  ]
  const cands = touchCandidates(rows, { dtCodes: new Set(['600003']) })
  assert.deepEqual(cands.map((r) => r.code), ['600001', '600002'])
  const limits = new Map([
    ['600001', { price: 9.5, prev: 10, low: 9, limitDown: 9 }],
    ['600002', { price: 9.6, prev: 10, low: 9.3, limitDown: 9 }],
  ])
  const out = buildTouched(cands, limits, { ztCodes: new Set(), sectorOf: new Map([['600001', '银行']]) })
  assert.equal(out.length, 1)
  assert.deepEqual({ ...out[0], amount: undefined }, { code: '600001', name: '股600001', pct: -5, price: 9.5, limitDown: 9, lowPct: -10, rebound: 5, amount: undefined, sector: '银行', limitUpToo: false })
  // 没有腾讯报价（取数失败）的候选不算，不按自己猜的涨跌幅判定
  assert.equal(buildTouched(cands, new Map()).length, 0)
})

test('竞价（盘后）：开盘较昨收、收盘较开盘、今日是否再封；缺开盘价时为 null 且排在最后', () => {
  const by = new Map([
    ['600001', sina('600001', { prev: 10, open: 10.5, price: 11 })],
    ['600002', sina('600002', { prev: 10, open: 9.6, price: 9.5 })],
  ])
  const yzt = [{ code: '600002', name: '乙', pct: -5, yBoards: 1, amount: 1 }, { code: '600003', name: '丙', pct: null, yBoards: 2 }, { code: '600001', name: '甲', pct: 10, yBoards: 2 }]
  const { rows, summary } = buildAuction(yzt, by, new Set(['600001']))
  assert.deepEqual(rows.map((r) => r.code), ['600001', '600002', '600003'])
  assert.equal(rows[0].openPct, 5)
  assert.equal(rows[0].closeVsOpen, 4.76)
  assert.equal(rows[0].sealed, true)
  assert.equal(rows[2].openPct, null)
  assert.equal(rows[2].pct, null)
  assert.deepEqual(summary, { n: 3, avgOpen: 0.5, highOpen: 1, lowOpen: 1, sealed: 1 })
  const next = nextDayRecord(yzt, by)
  assert.deepEqual(next, [['600002', -4, 0, -5], ['600001', 5, 10, 10]])
})

test('归档种子：只收已收盘且涨停数据就绪的快照；真实记录覆盖种子，种子不覆盖真实记录', () => {
  const snaps = [
    { dataDate: '2026-11-16', session: 'closed', upStocks: [{ code: '600001', name: '甲', boards: 1 }], sources: [{ id: 'limitUp', status: 'ready' }] },
    { dataDate: '2026-11-13', session: 'open', upStocks: [], sources: [] },
  ]
  const seed = seedFromArchive(snaps)
  assert.deepEqual(Object.keys(seed), ['2026-11-16'])
  assert.equal(seed['2026-11-16'].zb, null)
  const real = { zt: [['600009', 1]], zb: [], next: [], counts: { zt: 1 } }
  let s = mergeStore({ days: {} }, { '2026-11-16': real })
  s = mergeStore(s, seed)
  assert.deepEqual(s.days['2026-11-16'], real)
  const s2 = mergeStore(mergeStore({ days: {} }, seed), { '2026-11-16': real })
  assert.deepEqual(s2.days['2026-11-16'], real)
  assert.equal(Object.keys(mergeStore({ days: { '2026-01-05': real, '2026-01-06': real, '2026-01-07': real } }, {}, 2).days).join(), '2026-01-06,2026-01-07')
})

test('溢价基因：次日只认下一交易日，缺天不充数；首板尝试只在有炸板名单的日子统计', () => {
  const store = { days: {
    // 周五涨停（首板），周一（下一交易日）再涨停且次日最高 +6%、收 +10%
    '2026-11-13': { zt: [['600001', 1]], zb: ['600002'], next: [] },
    '2026-11-16': { zt: [['600001', 2], ['600002', 1]], zb: [], next: [['600001', 3, 6, 10]] },
    // 11-17 缺；11-18 的记录不是 11-16 的下一交易日
    '2026-11-18': { zt: [['600002', 1]], zb: ['600001'], next: [['600002', 1, 9, 5]] },
    '2026-11-10': { zt: [['600001', 1]], zb: null, next: null, seeded: true },
  } }
  const { byCode, window } = computeGenes(['600001', '600002'], store)
  const a = byCode['600001']
  assert.equal(a.zt, 3)
  assert.equal(a.lbBase, 1) // 只有 11-13 → 11-16 有下一交易日；11-10 的下一交易日 11-11 没有记录，11-16 的 11-17 也没有
  assert.equal(a.lb, 1)
  assert.equal(a.nextN, 1)
  assert.equal(a.p5, 1)
  assert.equal(a.redRate, 100)
  // 首板尝试：11-13 首板封住；11-18 炸板但上一交易日 11-17 没记录 → 不计；11-10 是种子（无炸板名单）→ 不计
  assert.equal(a.firstTry, 1)
  assert.equal(a.firstSealRate, 100)
  assert.equal(a.firstBreakRate, 0)
  const b = byCode['600002']
  // 11-13 炸板且 11-12 没记录 → 不计；11-16 首板封住；11-18 首板封住
  assert.equal(b.firstTry, 2)
  assert.equal(b.nextN, 0)
  assert.equal(b.redRate, null)
  assert.deepEqual(window, { from: '2026-11-10', to: '2026-11-18', days: 4, fullFrom: '2026-11-13', fullDays: 3 })
})

test('当日结果：板型与自然涨停、曾跌停、竞价汇总、历史记录与溢价基因都在', () => {
  const rows = [
    sina('600001', { prev: 10, price: 11, open: 11, high: 11, low: 11 }), // 一字
    sina('600002', { prev: 10, price: 11, open: 10.1, high: 11, low: 10 }), // 换手
    sina('600003', { prev: 10, price: 9.5, low: 9 }), // 曾跌停
  ]
  const zt = [
    { code: '600001', name: '甲', pct: 10, boards: 2, firstSeal: '09:25:00', sector: '算力' },
    { code: '600002', name: '乙', pct: 10, boards: 1, firstSeal: '10:00:00', sector: '' },
  ]
  const store = { days: { '2026-11-16': { zt: [['600001', 1]], zb: [], next: [] } } }
  const { payload, record } = buildDaban({
    date: '2026-11-17', zt, zb: [{ code: '600009', name: '炸', firstSeal: '09:40:00' }], dt: [], cx: [],
    yzt: [{ code: '600001', name: '甲', pct: 10, yBoards: 1 }], rows,
    limits: new Map([['600003', { price: 9.5, prev: 10, low: 9, limitDown: 9 }]]), store,
  })
  assert.deepEqual(payload.zt.map((r) => [r.code, r.shape, r.natural]), [['600001', '一字', false], ['600002', '换手', true]])
  assert.equal(payload.summary.natural, 1)
  assert.equal(payload.summary.touched, 1)
  assert.equal(payload.summary.sealRate, 66.7)
  assert.equal(payload.zt[0].gene.lbRate, 100)
  assert.equal(payload.zt[0].gene.nextN, 1)
  assert.deepEqual(record.zt, [['600001', 2], ['600002', 1]])
  assert.equal(payload.history.at(-1).date, '2026-11-17')
  assert.equal(payload.history.at(-1).touched, 1)
})
