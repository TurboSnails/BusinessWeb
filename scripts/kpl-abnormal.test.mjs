import test from 'node:test'
import assert from 'node:assert/strict'
import {
  actualFlags, actualFromLhbDay, atLimit, boardOfCode, buildAbnormal, buildSuspend, canReplaceOut, compareLhb, firstTrigger, longestDev, nextNeed,
  missCount, parseChanges, parseKline, predictLhb, reasonCat, replaceRecord, replay, sinaBar, summarizeRadar, tradingDaysBetween, windowDev,
} from './kpl-abnormal-lib.mjs'
import {
  attachToday, mergeReg, parseCninfoReplies, parseSseReg, parseSzseDiscipline, parseSzseInquiry, parseSzseMeasures, regCounts, regKind, regText, szDocLink,
} from './kpl-abnormal-lib.mjs'

// 用收盘价构造序列：r、i 都按相邻收盘价之比（与脚本一致）
const seqOf = (dates, closes, idx) => dates.slice(1).map((d, k) => ({ date: d, r: (closes[k + 1] / closes[k] - 1) * 100, i: (idx[k + 1] / idx[k] - 1) * 100 }))

test('板块归属：只算沪深 A 股', () => {
  assert.equal(boardOfCode('600206'), 'sh')
  assert.equal(boardOfCode('688801'), 'kcb')
  assert.equal(boardOfCode('002242'), 'sz')
  assert.equal(boardOfCode('300824'), 'cyb')
  assert.equal(boardOfCode('920489'), null)
  assert.equal(boardOfCode('900939'), null)
  assert.equal(boardOfCode('200016'), null)
})

test('3 日累计偏离值是复利口径，与交易所公开信息一致（真实数据核对）', () => {
  // 上交所 11-17：大东方 −25.21%（11.13–11.17），基准上证指数
  const dd = seqOf(['11-12', '11-13', '11-16', '11-17'], [7.18, 6.46, 5.81, 5.23], [3655.83, 3634.35, 3602.57, 3584.58])
  assert.equal(Math.round(windowDev(dd, 2, 3) * 100) / 100, -25.21)
  // 简单相加会得到 −28.1%，对不上
  const simple = dd.reduce((s, x) => s + x.r - x.i, 0)
  assert.ok(simple < -28)
  // 深交所 11-17：长虹美菱 24.22%，交易所公布的是两天窗口（最短达标窗口），基准深证A指
  const cm = seqOf(['11-12', '11-13', '11-16', '11-17'], [3.96, 3.92, 4.31, 4.74], [2248.08, 2200.53, 2147.26, 2127.97])
  const t = firstTrigger(cm, 2, 3, 20, -20)
  assert.deepEqual([t.dir, t.L, t.v], [1, 2, 24.22])
  // 创业板 北鼎股份 44.62%（创业板综指），科创板 燧原科技 30.08%（科创50）
  const bd = seqOf(['11-13', '11-16', '11-17'], [7.17, 8.60, 9.98], [3153.31, 3030.20, 2982.12])
  assert.equal(firstTrigger(bd, 1, 3, 30, -30).v, 44.62)
  const sy = seqOf(['11-06', '11-09', '11-10', '11-11'], [369.09, 432.80, 443.95, 494.00], [1253.20, 1256.96, 1265.02, 1300.38])
  assert.deepEqual(firstTrigger(sy, 2, 3, 30, -30), { dir: 1, L: 3, v: 30.08 })
})

test('窗口不跨过重新计算起点和不设涨跌幅限制的日子', () => {
  const seq = [{ date: 'a', r: 10, i: 0 }, { date: 'b', r: 10, i: 0 }, { date: 'c', r: 2, i: 0 }]
  assert.ok(windowDev(seq, 2, 3) > 20)
  assert.equal(windowDev(seq, 2, 3, 0), null)
  assert.equal(longestDev(seq, 2, 3, 0).L, 2)
  const gap = [{ date: 'a', r: null, i: 0 }, ...seq.slice(1)]
  assert.equal(windowDev(gap, 2, 3), null)
})

test('下一交易日需要的涨跌幅：假设指数持平，取最容易达到的窗口', () => {
  // 前两天各涨 5%、指数持平：L=3 时需要 (1.2/1.1025 − 1) ≈ 8.84%
  const seq = [{ date: 'a', r: 0, i: 0 }, { date: 'b', r: 5, i: 0 }, { date: 'c', r: 5, i: 0 }]
  const n = nextNeed(seq, 3, 20, -20)
  assert.equal(n.up, 8.84)
  assert.equal(n.down, -20) // 跌方向最容易的是单日窗口
  // 今天刚触发（reset = 最后一天），明天只能单日窗口
  assert.equal(nextNeed(seq, 3, 20, -20, 2).up, 20)
})

test('逐日回放：触发后重新计算；有实际龙虎榜的日子以实际为准；10 日内 3 次同向构成严重异常', () => {
  const seq = Array.from({ length: 12 }, (_, k) => ({ date: `d${String(k).padStart(2, '0')}`, r: 10, i: 0 }))
  const rp = replay(seq, 'sh')
  const trig = rp.days.filter((d) => d.calc3).map((d) => d.date)
  // 两天 +21% 触发，之后重新计算：第 2、4、6… 天触发
  assert.deepEqual(trig.slice(0, 3), ['d01', 'd03', 'd05'])
  assert.ok(rp.days[5].sev?.same) // 第三次同向
  assert.ok(rp.days[6].sev?.d10 === null || rp.days[6].sev === null || rp.days[6].sev) // 不抛错
  // 实际龙虎榜说没上榜：不重新计算
  const rp2 = replay(seq.slice(0, 3), 'sh', (d) => (d === 'd01' ? { d3: 0, severe: false } : undefined))
  assert.equal(rp2.days[1].calc3.dir, 1)
  assert.equal(rp2.reset3, 2) // d02 按计算触发（窗口 d00–d02）
})

test('涨跌停判断与深交所按限制比例计算日偏离值', () => {
  assert.equal(atLimit(31.52, 28.65, 10), 1)
  assert.equal(atLimit(5.23, 5.81, 10), -1)
  assert.equal(atLimit(5.3, 5.81, 10), 0)
  const bars = [
    { code: '002242', name: '九阳股份', board: 'sz', close: 31.52, prev: 28.65, high: 31.52, low: 25.79, turnover: 16.35, amount: 3.5e9, volume: 1, ret: 10.02 },
    { code: '600206', name: '有研新材', board: 'sh', close: 39.33, prev: 35.75, high: 39.33, low: 35.29, turnover: 14.51, amount: 4.7e9, volume: 1, ret: 10.0140 },
  ]
  const p = predictLhb(bars, { sz: -0.9, sh: -0.5, kcb: 0, cyb: 0 }, [])
  assert.equal(p.find((x) => x.code === '002242' && x.cat === 'devup').value, 10.9) // 交易所公布 10.90%
  assert.equal(p.find((x) => x.code === '600206' && x.cat === 'devup').value, 10.51) // 上交所公布 10.51%
  assert.ok(p.find((x) => x.code === '002242' && x.cat === 'amp')) // (31.52−25.79)/25.79 = 22.22%
  assert.equal(p.find((x) => x.code === '002242' && x.cat === 'amp').value, 22.22)
})

test('上榜原因归类与对照', () => {
  assert.equal(reasonCat('有价格涨跌幅限制的日收盘价格涨幅偏离值达到7%的前五只证券'), 'devup')
  assert.equal(reasonCat('日跌幅偏离值达到7%的前5只证券'), 'devdown')
  assert.equal(reasonCat('非S证券连续三个交易日内收盘价格跌幅偏离值累计达到20%的证券'), 'd3down')
  assert.equal(reasonCat('有价格涨跌幅限制的连续3个交易日内收盘价格涨幅偏离值累计达到30%的证券'), 'd3up')
  assert.equal(reasonCat('日涨幅达到15%的前5只证券'), 'pctup')
  assert.equal(reasonCat('有价格涨跌幅限制的日收盘价格跌幅达到15%的前五只证券'), 'pctdown')
  assert.equal(reasonCat('当日价格振幅达到30%的前5只股票'), 'amp')
  assert.equal(reasonCat('日换手率达到20%的前5只证券'), 'turn')
  assert.equal(reasonCat('连续10个交易日内日收盘价格涨跌幅偏离值累计达到100%'), 'severe')
  const actual = actualFromLhbDay({ entries: [
    { code: '002242', reason: '日涨幅偏离值达到7%的前5只证券' }, { code: '002242', reason: '连续三个交易日内，涨幅偏离值累计达到20%的证券' },
    { code: '920489', reason: '当日换手率达到20%的前5只股票' }, { code: '000530', reason: '日换手率达到20%的前5只证券' },
  ] })
  assert.equal(actual.has('920489'), false) // 北交所不纳入
  assert.deepEqual(actualFlags(actual.get('002242')), { d3: 1, severe: false })
  const cmp = compareLhb([{ code: '002242', name: '九阳股份', board: 'sz', cat: 'devup', value: 10.9 }, { code: '600000', name: '甲', board: 'sh', cat: 'amp', value: 16 }], actual)
  assert.deepEqual(cmp.rows.map((r) => r.hit), [true, false])
  assert.deepEqual(cmp.missed.map((m) => `${m.code}|${m.cat}`).sort(), ['000530|turn', '002242|d3up'])
  assert.deepEqual(cmp.stats, { predicted: 2, actual: 3, hit: 1, precision: 50, recall: 33.3 })
  assert.equal(compareLhb([], null).available, false)
})

test('日 K 解析：前复权收益、上市不足时前 5 根不计', () => {
  const body = { data: { code: '600001', name: '甲', klines: ['2026-11-10,10,10,10,1,1,1', '2026-11-11,11,11,10,1,1,1', '2026-11-12,12.1,12.1,11,1,1,1'] } }
  const k = parseKline(body, 3)
  assert.equal(k.bars[1].ret, 10)
  assert.equal(k.bars[2].ret, 10)
  const young = parseKline(body, 10)
  assert.deepEqual(young.bars.map((b) => b.ret), [null, null, null])
  assert.equal(parseKline({ data: null }, 3), null)
})

test('新浪行：停牌和北交所不收，新股不计收益', () => {
  assert.equal(sinaBar({ code: '600000', name: '甲', trade: '0.000', settlement: '10', volume: 0 }), null)
  assert.equal(sinaBar({ code: '920000', name: '乙', trade: '10', settlement: '10', volume: 5 }), null)
  const n = sinaBar({ code: '301999', name: 'C新股', trade: '20', settlement: '10', volume: 5, high: '21', low: '15', amount: 1, turnoverratio: 60 })
  assert.equal(n.ret, null)
  const s = sinaBar({ code: '600000', name: '甲', trade: '11', settlement: '10', volume: 5, high: '11', low: '9.5', amount: 1, turnoverratio: '3.2' })
  assert.equal(s.ret, 10)
  assert.equal(s.turnover, 3.2)
})

test('停复牌：当日全天停牌、盘中停牌、复牌 10 个交易日内', () => {
  const r = (code, start, end, kind, resume = null) => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: code, SECURITY_TYPE_CODE: '058001001', TRADE_MARKET: '深交所主板', SUSPEND_START_DATE: `${start} 00:00:00`, SUSPEND_START_TIME: `${start} 09:30:00`, SUSPEND_END_TIME: end ? `${end} 15:00:00` : null, SUSPEND_EXPIRE: kind, SUSPEND_REASON: '拟筹划重大资产重组', PREDICT_RESUME_DATE: resume ? `${resume} 00:00:00` : null })
  const s = buildSuspend([
    r('000635', '2026-11-13', '2026-11-19', '连续停牌', '2026-11-20'),
    r('600185', '2026-11-12', null, '连续停牌'),
    r('000831', '2026-11-02', '2026-11-13', '连续停牌', '2026-11-16'),
    r('601326', '2026-10-21', '2026-11-03', '连续停牌', '2026-11-04'),
    { ...r('920309', '2026-11-17', '2026-11-17', '盘中停牌'), SUSPEND_START_TIME: '2026-11-17 13:16:06', SUSPEND_END_TIME: '2026-11-17 13:26:06' },
    r('605255', '2026-11-18', null, '连续停牌'),
    { ...r('900939', '2026-11-10', null, '连续停牌'), SECURITY_TYPE_CODE: '058001002' },
  ], '2026-11-17')
  assert.deepEqual(s.today.map((x) => x.code), ['000635', '600185'])
  assert.equal(s.today[0].days, 3)
  assert.deepEqual(s.intraday.map((x) => [x.code, x.startTime, x.endTime]), [['920309', '13:16', '13:26']])
  assert.deepEqual(s.resumed.map((x) => [x.code, x.nth]), [['000831', 2], ['601326', 10]])
  assert.equal(tradingDaysBetween('2026-11-16', '2026-11-17'), 2)
})

test('盘口异动：结构与条数校验、汇总', () => {
  const body = { data: { tc: 3, allstock: [
    { tm: 93512, c: '600770', m: 1, n: '综艺股份', t: 4, i: '5.530000,0.099404' },
    { tm: 150000, c: '600770', m: 1, n: '综艺股份', t: 16, i: '5.520000,0.097' },
    { tm: 145541, c: '603370', m: 1, n: '华新精科', t: 8193, i: '92800,23.36000,-0.035611,2167808.00' },
  ] } }
  const ev = parseChanges(body)
  assert.equal(ev[0].time, '09:35:12')
  assert.equal(ev[2].amount, 2167808)
  const s = summarizeRadar(ev)
  assert.equal(s.total, 3)
  assert.deepEqual(s.types.map((t) => [t.name, t.count]), [['封涨停板', 1], ['打开涨停板', 1], ['大笔买入', 1]])
  assert.deepEqual(s.buckets.map((b) => b.t), ['09:30', '14:30'])
  assert.equal(s.timeline.length, 2)
  assert.equal(s.top[8193][0].amount, 2167808)
  assert.throws(() => parseChanges({ data: { tc: 4, allstock: body.data.allstock } }), /不完整/)
  assert.throws(() => parseChanges({ data: { tc: 1, allstock: [{ tm: 80000, c: '600000', t: 4, i: '' }] } }), /字段异常/)
})

test('汇总：已触发、下一交易日可能触发、回测', () => {
  const dates = ['2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17']
  const idx = { sh: 0, kcb: 0, sz: 0, cyb: 0 }
  const history = dates.map((d, k) => ({ date: d, idx, s: { 600001: [0, 10, 10, 10][k], 600002: [0, 0, 6, 6][k], 300001: [0, 0, 0, -1][k] } }))
  const bars = [
    { code: '600001', name: '连涨', board: 'sh', close: 13.31, prev: 12.1, ret: 10 },
    { code: '600002', name: '接近', board: 'sh', close: 11.24, prev: 10.6, ret: 6 },
    { code: '300001', name: '平淡', board: 'cyb', close: 9.9, prev: 10, ret: -1 },
  ]
  const actualByDate = new Map([['2026-11-16', new Map()]])
  const r = buildAbnormal({ date: '2026-11-17', history, bars, actualByDate, todayActual: null })
  assert.deepEqual(r.triggered.map((x) => x.code), ['600001'])
  assert.ok(r.triggered[0].trig.includes('d3up'))
  // 600002：前两天各 +6%，明天约需 +6.8% 即可触发 3 日 +20%
  const n = r.near.find((x) => x.code === '600002')
  assert.ok(n.up3.need > 6 && n.up3.need < 7)
  assert.ok(n.up3.price > 11.24)
  assert.equal(r.near.find((x) => x.code === '300001'), undefined)
  // 11-16：按计算 600001 已触发（两天 +21%），实际龙虎榜没有 → 回测记 1 次计算、0 次命中
  assert.equal(r.backtest.days, 1)
  assert.equal(r.backtest.calc, 1)
  assert.equal(r.backtest.hit, 0)
  assert.throws(() => buildAbnormal({ date: '2026-11-18', history, bars, actualByDate, todayActual: null }))
})

test('缺数据 ≠ 停牌：日 K 获取失败（miss）或整天无存档（unknown）时偏离值为空，不桥接；真停牌才跳过', () => {
  const dates = ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17']
  const idx = { sh: 0, kcb: 0, sz: 0, cyb: 0 }
  // 600001：11-11 持平，之后每个有数据的交易日 +8%；11-13 那天不在存档里
  const mk = (extra = {}) => dates.map((d, k) => ({ date: d, idx, s: k === 2 ? {} : { 600001: k === 0 ? 0 : 8 }, ...(k === 2 ? extra : {}) }))
  const bars = [{ code: '600001', name: '甲', board: 'sh', close: 10, prev: 9.26, ret: 8 }]
  const run = (history) => buildAbnormal({ date: '2026-11-17', history, bars, actualByDate: new Map(), todayActual: null })
  // 真停牌（数据完整而不在）：跳过那天，11-12 / 11-16 / 11-17 三天连起来 +25.97% → 触发
  assert.ok(run(mk()).triggered[0]?.trig.includes('d3up'))
  // 获取失败：窗口不得跨过 11-13，只剩两天 +16.64%，不触发；3 日偏离值只算到 2 天
  const missed = run(mk({ miss: ['600001'] }))
  assert.equal(missed.triggered.length, 0)
  assert.equal(missed.devOf.get('600001'), 16.64)
  // 整天没有存档：同样按缺失处理
  const unknown = mk({ unknown: true })
  assert.equal(run(unknown).devOf.get('600001'), 16.64)
})

test('存档 / 输出替换规则：更完整才替换，同天重跑同等完整可覆盖；更新日期的输出不倒退', () => {
  const full = { date: 'd', s: { a: 1 } }
  const part = { date: 'd', s: { a: 1 }, miss: ['b', 'c'] }
  assert.equal(missCount(full), 0)
  assert.equal(missCount(part), 2)
  assert.equal(missCount({ date: 'd', s: {}, unknown: true }), Infinity)
  assert.equal(replaceRecord(undefined, part), true)
  assert.equal(replaceRecord(full, part), false) // 补数不覆盖更完整的已有存档
  assert.equal(replaceRecord(part, full), true)
  assert.equal(replaceRecord(full, { ...full }), false)
  assert.equal(replaceRecord(full, { ...full }, true), true)
  assert.equal(canReplaceOut({ date: '2026-11-17' }, '2026-11-16', 0), false)
  assert.equal(canReplaceOut({ date: '2026-11-16' }, '2026-11-17', 9), true)
  assert.equal(canReplaceOut({ date: '2026-11-17', archive: { missing: 0 } }, '2026-11-17', 3), false)
  assert.equal(canReplaceOut({ date: '2026-11-17', archive: { missing: 3 } }, '2026-11-17', 3), true)
  assert.equal(canReplaceOut({ date: '2026-11-17', archive: {} }, '2026-11-17', 3), true)
  assert.equal(canReplaceOut(null, '2026-11-17', 3), true)
})

/* ---------------- 监管问询 ---------------- */
// 字段取自 2026-11-18 实测返回（上交所 commonSoaQuery.do、深交所 ShowReport、巨潮 hisAnnouncement/query）
const sseRow = (over = {}) => ({
  createTime: '2026-11-12 18:14:53', channelId: '10010', stockcode: '603366', extSECURITY_CODE: '603366', extGSJC: '日出东方', extWTFL: '监管工作函', extTYPE: '监管工作函',
  docTitle: '关于日出东方控股股份有限公司股价波动事项的监管工作函', extDWDM: '0', docURL: 'www.sse.com.cn/disclosure/credibility/supervision/measures/other/c/10837562/files/x.doc', ...over,
})
const bjMs = (d) => Date.parse(`${d}T00:00:00+08:00`)

test('监管问询：分组规则', () => {
  assert.equal(regKind('通报批评'), 'discipline')
  assert.equal(regKind('公开认定'), 'discipline')
  assert.equal(regKind('关注函'), 'attention')
  assert.equal(regKind('提请关注函（会计师事务所模板）'), 'attention')
  assert.equal(regKind('年报问询函'), 'inquiry')
  assert.equal(regKind('问询函', '关于*ST太和股票预计触及财务类终止上市情形相关事项的监管工作函'), 'measure')
  assert.equal(regKind('监管函'), 'measure')
  assert.equal(regKind(''), 'measure')
  assert.equal(regText("<a href='#'>详细&nbsp;内容</a>"), '详细 内容')
})

test('监管问询：上交所解析（链接只在 extDWDM=1 时给出；监管关注 → 监管警示；公开认定截短；北交所 / 无代码不收）', () => {
  const rows = [
    sseRow(),
    sseRow({ channelId: '10008', extWTFL: '通报批评', extDWDM: '1', docURL: 'www.sse.com.cn/a/b.pdf', stockcode: '688022', extSECURITY_CODE: '688022', extGSJC: 'ST瀚川' }),
    sseRow({ channelId: '10007', extWTFL: '监管关注', extDWDM: '1', docURL: 'https://www.sse.com.cn/c.pdf', stockcode: '', extSECURITY_CODE: '601611' }),
    sseRow({ channelId: '10009', extWTFL: '公开认定一定期限内不适合担任上市公司董事、监事和高级管理人员', stockcode: '688496' }),
    sseRow({ channelId: '10743', extWTFL: '问询函', stockcode: '603626', docTitle: '关于昆山科森科技股份有限公司对外投资暨购买资产相关事项的监管问询函' }),
    sseRow({ stockcode: '920001', extSECURITY_CODE: '920001' }),
    sseRow({ stockcode: '', extSECURITY_CODE: '-' }),
    sseRow({ createTime: '' }),
    null,
  ]
  const out = parseSseReg(rows)
  assert.equal(out.length, 5)
  assert.deepEqual(out[0], { ex: 'sh', code: '603366', name: '日出东方', date: '2026-11-12', kind: 'measure', type: '监管工作函', title: '关于日出东方控股股份有限公司股价波动事项的监管工作函', url: null, src: 'sse' })
  assert.equal(out[1].kind, 'discipline')
  assert.equal(out[1].url, 'https://www.sse.com.cn/a/b.pdf')
  assert.equal(out[2].code, '601611')
  assert.equal(out[2].type, '监管警示')
  assert.equal(out[2].url, 'https://www.sse.com.cn/c.pdf')
  assert.equal(out[3].type, '公开认定')
  assert.equal(out[3].kind, 'discipline')
  assert.equal(out[4].kind, 'inquiry')
  assert.deepEqual(parseSseReg(undefined), [])
})

test('监管问询：深交所三个报表解析与全文链接', () => {
  const ck = "<a href='javascript:void(0)' encode-open='/UpFiles/zqjghj/sup_jghj_1.pdf'>详细内容</a>"
  assert.equal(szDocLink(ck), 'https://reportdocs.static.szse.cn/UpFiles/zqjghj/sup_jghj_1.pdf')
  assert.equal(szDocLink(''), null)
  assert.equal(szDocLink("encode-open='http://evil/x'"), null)
  const inq = parseSzseInquiry([
    { gsdm: '300364', gsjc: '中文在线', fhrq: '2026-10-02', hjlb: '问询函', ck, hfck: "<a encode-open='/UpFiles/zqjghj/sup_jgdxhh_2.pdf'>回复</a>" },
    { gsdm: '000078', gsjc: 'ST海王', fhrq: '2026-08-28', hjlb: '关注函', ck, hfck: '' },
    { gsdm: '', gsjc: '无代码', fhrq: '2026-10-02', hjlb: '问询函', ck },
    { gsdm: '000001', gsjc: '缺日期', fhrq: '-', hjlb: '问询函', ck },
  ])
  assert.equal(inq.length, 2)
  assert.equal(inq[0].replyUrl, 'https://reportdocs.static.szse.cn/UpFiles/zqjghj/sup_jgdxhh_2.pdf')
  assert.equal(inq[1].kind, 'attention')
  assert.equal('replyUrl' in inq[1], false)
  const mea = parseSzseMeasures([
    { gkxx_gsdm: '003036', gkxx_gsjc: '泰坦股份', gkxx_gdrq: '2026-11-11', gkxx_jgcs: '监管函', hjnr: ck, gkxx_sjdx: '上市公司<br/>董监高' },
    { gkxx_gsdm: '', gkxx_gsjc: '', gkxx_gdrq: '2026-08-28', gkxx_jgcs: '监管函', hjnr: ck, gkxx_sjdx: '董监高' },
  ])
  assert.equal(mea.length, 1)
  assert.equal(mea[0].title, '泰坦股份 监管函（涉及：上市公司、董监高）')
  assert.equal(mea[0].kind, 'measure')
  const dis = parseSzseDiscipline([{ gsdm: '000821', jc_gsjc: 'ST京机', fhrq: '2026-11-06', cflb: '公开谴责', hjbt: '关于对湖北京山轻工机械股份有限公司及相关当事人给予纪律处分的决定', ck }])
  assert.equal(dis[0].kind, 'discipline')
})

test('监管问询：巨潮回复公告筛选（排除审核问询、异常波动自查问询；优先公司本身公告；中介兜底）', () => {
  const a = (secCode, title, d = '2026-11-14', adj = 'finalpage/2026-11-14/1.PDF') => ({ secCode, secName: '名称', announcementTitle: title, announcementTime: bjMs(d), adjunctUrl: adj })
  const out = parseCninfoReplies([
    a('300197', '大华会计师事务所（特殊普通合伙）关于对中节能铁汉生态环境股份有限公司重组<em>问询</em><em>函</em>的回复'),
    a('300197', '中节能铁汉生态环境股份有限公司关于重组<em>问询函</em>回复的公告', '2026-11-14', 'finalpage/2026-11-14/2.PDF'),
    a('002859', '金证（上海）资产评估有限公司关于深圳证券交易所《关于对浙江洁美电子科技股份有限公司的问询函》的回复'),
    a('301079', '邵阳维克液压股份有限公司关于深圳证券交易所《关于邵阳维克液压股份有限公司发行股份及支付现金购买资产并募集配套资金申请的审核问询函》之回复报告'),
    a('605169', '关于《新疆洪通燃气股份有限公司股票交易异常波动问询函》的回函'),
    a('000001', '关于收到深圳证券交易所关注函的公告'), // 没有「回复」：只是收到
    a('600001', '关于对上海证券交易所关注函的回复公告', '2026-11-13'),
    a('920001', '关于问询函的回复'),
    { secCode: '000002', announcementTitle: '问询函的回复', announcementTime: null },
  ])
  const by = Object.fromEntries(out.map((x) => [x.code, x]))
  assert.deepEqual(Object.keys(by).sort(), ['002859', '300197', '600001'])
  assert.equal(by['300197'].title, '中节能铁汉生态环境股份有限公司关于重组问询函回复的公告')
  assert.equal(by['300197'].url, 'https://static.cninfo.com.cn/finalpage/2026-11-14/2.PDF')
  assert.equal(by['300197'].reply, true)
  assert.equal(by['300197'].ex, 'sz')
  assert.equal(by['600001'].kind, 'attention')
  assert.equal(by['600001'].date, '2026-11-13')
  assert.equal(by['600001'].ex, 'sh')
})

test('监管问询：合并去重、窗口、回复并入函件、按日期倒序', () => {
  const L = (over) => ({ ex: 'sz', code: '000821', name: 'ST京机', date: '2026-11-06', kind: 'discipline', type: '公开谴责', title: '决定', url: 'u1', src: 'szse', ...over })
  const items = mergeReg(
    [L({}), L({ code: '600001', ex: 'sh', date: '2026-10-01', title: '旧' })],
    [
      L({ type: '通报批评' }), // 同一份决定的另一处分类别 → 合并
      L({ code: '300364', date: '2026-11-02', kind: 'inquiry', type: '问询函', url: 'u2', title: '中文在线 问询函' }),
      { ex: 'sz', code: '300364', name: '中文在线', date: '2026-11-10', kind: 'inquiry', type: '问询函回复', title: '回复', url: 'r1', src: 'cninfo', reply: true },
      { ex: 'sz', code: '300197', name: '节能铁汉', date: '2026-11-14', kind: 'inquiry', type: '问询函回复', title: '回复2', url: 'r2', src: 'cninfo', reply: true },
      L({ date: '2026-11-19', title: '未来' }),
      L({ code: '920001' }),
    ],
    '2026-10-19', '2026-11-18',
  )
  assert.deepEqual(items.map((x) => `${x.date}|${x.code}`), ['2026-11-14|300197', '2026-11-06|000821', '2026-11-02|300364'])
  assert.equal(items[1].type, '公开谴责、通报批评')
  assert.equal(items[2].replyUrl, 'r1') // 回复公告并入交易所函件
  assert.equal(items[0].reply, true)
})

test('监管问询：近 5 / 20 个交易日计数与今日表现', () => {
  const it = (date, kind, code, reply = false) => ({ ex: 'sz', code, name: 'x', date, kind, type: 't', title: 't', url: null, src: 'szse', ...(reply ? { reply } : {}) })
  const items = [it('2026-11-18', 'inquiry', '000001', true), it('2026-11-15', 'measure', '000001'), it('2026-11-12', 'discipline', '000002'), it('2026-11-11', 'attention', '000003'), it('2026-10-22', 'inquiry', '000004'), it('2026-10-21', 'inquiry', '000005')]
  const c = regCounts(items, '2026-11-18')
  assert.equal(c.d5.from, '2026-11-12')
  assert.deepEqual({ ...c.d5 }, { from: '2026-11-12', inquiry: 1, attention: 0, measure: 1, discipline: 1, replies: 1, companies: 2 })
  assert.equal(c.d20.from, '2026-10-22')
  assert.equal(c.d20.inquiry, 2)
  assert.equal(c.d20.companies, 4)
  const t = attachToday(items.slice(0, 2), new Map([['000001', 3.14159]]), new Map([['000001', null]]))
  assert.equal(t[0].pct, 3.14)
  assert.equal(t[0].dev3, null)
  assert.equal(attachToday([it('2026-11-18', 'inquiry', '000009')], new Map(), undefined)[0].pct, null)
})
