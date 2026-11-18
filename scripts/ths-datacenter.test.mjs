// 同花顺数据中心页签计算：缺失值、数据日期、日 K 解析、新股/次新、解禁表现、增减持汇总、质押与商誉、回购进度、历史合并
import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, buildBuyback, buildCalendar, buildGoodwill, buildHolders, buildLift, buildPledge, buildSubNew, checkComplete, closeOn, latestPeriod, liftPerf, mergeHistory, num, parseKline, secidOf, shouldReplace, targetDay } from './ths-datacenter-lib.mjs'
import { aimCodes, buildReports, compactReport, groupReports, pickReportDay, ratingChangeOf, reportDayFile, reportFetchRange, reportUrl, staleReportFiles, upside, withUpside } from './ths-datacenter-lib.mjs'

const D = '2026-11-17'
const bars = (pairs) => pairs.map(([date, close]) => ({ date, close }))

test('null / 空串 / "-" 是缺失，不是 0', () => {
  for (const x of [null, undefined, '', ' ', '-', 'abc', true]) assert.equal(num(x), null)
  assert.equal(num(0), 0)
  assert.equal(num('1.5'), 1.5)
})

test('数据日期：交易日 15:30 后取当天，否则上一个交易日；周末取周五', () => {
  assert.equal(targetDay(D, 15 * 60 + 29), '2026-11-16')
  assert.equal(targetDay(D, 15 * 60 + 30), D)
  assert.equal(targetDay('2026-11-18', 60), D)
  assert.equal(targetDay('2026-11-22', 20 * 60), '2026-11-20')
  assert.equal(addDays(D, 30), '2026-12-17')
})

test('secid、行数完整性、日 K 解析只保留 ≤ asOf 的并剔除坏行', () => {
  assert.equal(secidOf('600001.SH', '600001'), '1.600001')
  assert.equal(secidOf('920309.BJ', '920309'), '0.920309')
  assert.equal(secidOf('', '300750'), '0.300750')
  assert.throws(() => checkComplete([1], 2, 'x'))
  assert.deepEqual(checkComplete([1, 2], 2, 'x'), [1, 2])
  const k = parseKline({ data: { klines: ['2026-11-18,9', '2026-11-16,10.5', '2026-11-17,11', 'bad,1', '2026-11-13,-'] } }, D)
  assert.deepEqual(k, bars([['2026-11-16', 10.5], ['2026-11-17', 11]]))
  assert.equal(parseKline({ data: null }, D), null)
  assert.equal(closeOn(k, D), 11)
  assert.equal(closeOn(k, '2026-11-18'), null, '最后一根不是当天（停牌）时为 null，不用更早的收盘')
  assert.equal(closeOn(null, D), null)
})

test('申购日历：近 30 日起，状态、发行 PE 相对行业 PE', () => {
  const rows = [
    { SECURITY_CODE: '301661', SECURITY_NAME_ABBR: '待申', APPLY_DATE: '2026-11-26 00:00:00', INDUSTRY_PE_NEW: 37.08, ISSUE_PRICE: null },
    { SECURITY_CODE: '920067', SECURITY_NAME_ABBR: '待上', APPLY_DATE: '2026-11-11 00:00:00', ISSUE_PRICE: 23.52, AFTER_ISSUE_PE: 13.88, INDUSTRY_PE_NEW: 38.47, ONLINE_ISSUE_LWR: 0.0256 },
    { SECURITY_CODE: '920309', SECURITY_NAME_ABBR: '已上', APPLY_DATE: '2026-11-04 00:00:00', LISTING_DATE: '2026-11-17 00:00:00', ISSUE_PRICE: 31.92, AFTER_ISSUE_PE: 20, INDUSTRY_PE_NEW: 10 },
    { SECURITY_CODE: '000001', SECURITY_NAME_ABBR: '太早', APPLY_DATE: '2026-10-01 00:00:00' },
  ]
  const c = buildCalendar(rows, D)
  assert.deepEqual(c.map((r) => [r.code, r.status]), [['301661', '待申购'], ['920067', '待上市'], ['920309', '已上市']])
  assert.equal(c[0].issuePrice, null)
  assert.equal(c[0].peDiff, null)
  assert.equal(c[1].peDiff, -63.9)
  assert.equal(c[2].peDiff, 100)
  assert.equal(c[1].board, '北交所')
})

test('次新股：后复权累计涨幅、首日涨幅、破发率；停牌或首根日期不符时留空、不计入统计', () => {
  const rows = [
    { SECURITY_CODE: '688001', SECURITY_NAME_ABBR: '涨', LISTING_DATE: '2026-11-10 00:00:00', ISSUE_PRICE: 10 },
    { SECURITY_CODE: '300002', SECURITY_NAME_ABBR: '破', LISTING_DATE: '2026-06-01 00:00:00', ISSUE_PRICE: 20 },
    { SECURITY_CODE: '000003', SECURITY_NAME_ABBR: '停', LISTING_DATE: '2026-05-01 00:00:00', ISSUE_PRICE: 5 },
    { SECURITY_CODE: '000004', SECURITY_NAME_ABBR: '超一年', LISTING_DATE: '2025-11-17 00:00:00', ISSUE_PRICE: 5 },
    { SECURITY_CODE: '000005', SECURITY_NAME_ABBR: '未上市', LISTING_DATE: '2026-11-20 00:00:00', ISSUE_PRICE: 5 },
  ]
  const m = new Map([
    ['688001', bars([['2026-11-10', 25], ['2026-11-17', 20]])],
    ['300002', bars([['2026-06-01', 30], ['2026-11-17', 18]])],
    ['000003', bars([['2026-05-06', 8], ['2026-11-14', 9]])],
  ])
  const s = buildSubNew(rows, m, D)
  assert.equal(s.count, 3)
  assert.deepEqual(s.rows.map((r) => r.code), ['688001', '300002', '000003'])
  const [a, b, c] = s.rows
  assert.equal(a.firstPct, 150)
  assert.equal(a.cumPct, 100)
  assert.equal(a.sinceFirstPct, -20)
  assert.equal(a.broke, false)
  assert.equal(b.cumPct, -10)
  assert.equal(b.broke, true)
  assert.equal(c.firstPct, null, '首根 K 线不是上市日')
  assert.equal(c.cumPct, null, '当天停牌')
  assert.equal(c.broke, null)
  assert.equal(s.valid, 2)
  assert.equal(s.brokeCount, 1)
  assert.equal(s.brokeRate, 50)
  assert.equal(s.medianCum, 45)
})

test('解禁日后表现：基准为解禁前一交易日；非交易日解禁顺延；不足 5 日留空', () => {
  const k = bars([['2026-11-06', 10], ['2026-11-09', 11], ['2026-11-10', 12], ['2026-11-11', 9], ['2026-11-12', 10], ['2026-11-13', 10.5], ['2026-11-16', 10], ['2026-11-17', 10]])
  assert.deepEqual(liftPerf(k, '2026-11-09'), { tDate: '2026-11-09', d1: 10, d5: 5 })
  assert.deepEqual(liftPerf(k, '2026-11-08'), { tDate: '2026-11-09', d1: 10, d5: 5 }, '周日解禁按周一算')
  assert.deepEqual(liftPerf(k, '2026-11-16'), { tDate: '2026-11-16', d1: -4.76, d5: null })
  assert.deepEqual(liftPerf(k, '2026-11-01'), { tDate: '2026-11-02', d1: null, d5: null }, 'T 日与基准日都没有 K 线')
  assert.deepEqual(liftPerf(null, D), { tDate: null, d1: null, d5: null })
})

test('解禁：未来/近 30 日分组、按数据日期收盘重算市值、停牌时市值缺失、只要 A 股', () => {
  const row = (code, date, shares, over = {}) => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: 'S' + code, FREE_DATE: `${date} 00:00:00`, CURRENT_FREE_SHARES: shares, ABLE_FREE_SHARES: shares, FREE_RATIO: 0.1, TOTAL_RATIO: 0.05, FREE_SHARES_TYPE: '首发原股东限售股份', SECURITY_TYPE_CODE: '058001001', ...over })
  const up = [row('000001', '2026-11-18', 100), row('000002', '2026-11-18', 50), row('000003', '2026-12-17', 10), row('000004', '2026-12-18', 10), row('900001', '2026-11-20', 10, { SECURITY_TYPE_CODE: '058001002' })]
  const past = [row('000005', '2026-11-16', 20), row('000006', '2026-10-17', 20)]
  const m = new Map([['000001', bars([['2026-11-17', 10]])], ['000002', bars([['2026-11-14', 10]])], ['000003', bars([['2026-11-17', 5]])], ['000005', bars([['2026-11-13', 10], ['2026-11-16', 11], ['2026-11-17', 12]])]])
  const l = buildLift(up, past, m, D)
  assert.equal(l.upcoming.from, '2026-11-18')
  assert.equal(l.upcoming.to, '2026-12-17')
  assert.deepEqual(l.upcoming.rows.map((r) => r.code), ['000001', '000002', '000003'])
  assert.equal(l.upcoming.rows[0].cap, 100 * 1e4 * 10)
  assert.equal(l.upcoming.rows[0].ratio, 10)
  assert.equal(l.upcoming.rows[0].totalRatio, 5)
  assert.equal(l.upcoming.rows[1].cap, null)
  assert.equal(l.upcoming.cap, 1e7 + 5e5)
  assert.equal(l.upcoming.capMissing, 1)
  assert.deepEqual(l.upcoming.byDate, [{ date: '2026-11-18', count: 2, cap: 1e7, capMissing: 1 }, { date: '2026-12-17', count: 1, cap: 5e5, capMissing: 0 }])
  assert.deepEqual(l.past.rows.map((r) => r.code), ['000005'])
  assert.equal(l.past.rows[0].d1, 10)
  assert.equal(l.past.d1.n, 1)
  assert.equal(l.past.d5.n, 0)
  assert.equal(l.past.d5.mean, null)
})

test('增减持：只认公告均价，均价缺失时金额为 null；按个股净额排行；公告日晚于数据日期的不计', () => {
  const row = (code, dir, n, avg, notice = D, over = {}) => ({ SECURITY_CODE: code, SECURITY_NAME_ABBR: 'S' + code, HOLDER_NAME: 'H' + code, DIRECTION: dir, CHANGE_NUM: n, AFTER_CHANGE_RATE: 0.5, TRADE_AVERAGE_PRICE: avg, CLOSE_PRICE: 9, NOTICE_DATE: `${notice} 00:00:00`, START_DATE: '2026-11-01 00:00:00', END_DATE: '2026-11-16 00:00:00', MARKET: '二级市场', ...over })
  const h = buildHolders([
    row('000001', '增持', 100, 10), row('000001', '减持', 20, 10, '2026-11-10', { HOLDER_NAME: '另一人' }),
    row('000002', '减持', 50, 4), row('000003', '增持', 10, null), row('000004', '增持', 10, 10, '2026-11-18'), row('000005', '增持', 10, 10, '2026-10-18'), row('000006', '其他', 10, 10),
  ], D)
  assert.equal(h.count, 4)
  assert.equal(h.from, '2026-10-19')
  assert.equal(h.rows.find((r) => r.code === '000003').amount, null, '不用收盘价估算')
  assert.equal(h.rows.find((r) => r.code === '000002').amount, -2e6)
  assert.equal(h.missing, 1)
  assert.equal(h.incAmount, 1e7)
  assert.equal(h.decAmount, -4e6)
  assert.deepEqual(h.rank.inc.map((r) => [r.code, r.net, r.count, r.holders, r.netRatio]), [['000001', 8e6, 2, 2, 0]])
  assert.deepEqual(h.rank.dec.map((r) => [r.code, r.net]), [['000002', -2e6]])
})

test('质押与商誉：日期校验、比例换算、净资产为负的剔除；报告期按法定披露截止日', () => {
  const p = buildPledge([{ SECURITY_CODE: '600370', SECURITY_NAME_ABBR: '甲', TRADE_DATE: '2026-11-13 00:00:00', PLEDGE_RATIO: 78.74, PLEDGE_DEAL_NUM: 34, REPURCHASE_BALANCE: 100, PLEDGE_MARKET_CAP: 2.5, INDUSTRY: '化纤' }], '2026-11-13', { 50: 1, 30: 2 }, 2000)
  assert.equal(p.rows[0].cap, 25000)
  assert.equal(p.rows[0].ratio, 78.74)
  assert.throws(() => buildPledge([{ SECURITY_CODE: '600370', TRADE_DATE: '2026-11-06 00:00:00', PLEDGE_RATIO: 1 }], '2026-11-13', {}, 1))
  const g = buildGoodwill([
    { SECURITY_CODE: '002775', SECURITY_NAME_ABBR: '乙', REPORT_DATE: '2026-09-30 00:00:00', GOODWILL: 44, SUMSHEQUITY: 4, SUMSHEQUITY_RATIO: 11.5222, NOTICE_DATE: '2026-10-24' },
    { SECURITY_CODE: '000001', SECURITY_NAME_ABBR: '负', REPORT_DATE: '2026-09-30 00:00:00', GOODWILL: 4, SUMSHEQUITY: -1, SUMSHEQUITY_RATIO: -4 },
  ], '2026-09-30', { 100: 1 }, 10, 1)
  assert.deepEqual(g.rows.map((r) => [r.code, r.ratio]), [['002775', 1152.22]])
  assert.throws(() => buildGoodwill([{ SECURITY_CODE: '1', REPORT_DATE: '2026-06-30' }], '2026-09-30', {}, 1, 0))
  assert.equal(latestPeriod(D), '2026-09-30')
  assert.equal(latestPeriod('2026-10-31'), '2026-06-30')
  assert.equal(latestPeriod('2026-05-06'), '2026-03-31')
  assert.equal(latestPeriod('2026-02-01'), '2025-09-30')
})

test('回购：近 30 日公告、状态文字、进度相对计划金额上下限、新预案合计', () => {
  const row = (code, status, upd, over = {}) => ({ DIM_SCODE: code, SECURITYSHORTNAME: 'S' + code, REPURPROGRESS: status, UPD: `${upd} 00:00:00`, DIM_DATE: `${upd} 00:00:00`, REPURAMOUNTLOWER: 1e8, REPURAMOUNTLIMIT: 2e8, REPURAMOUNT: null, ...over })
  const b = buildBuyback([row('000001', '004', D, { REPURAMOUNT: 5e7, DIM_DATE: '2026-08-01 00:00:00' }), row('000002', '001', '2026-11-10'), row('000003', '007', D, { REPURAMOUNTLIMIT: 3e8 }), row('000004', '006', '2026-11-18'), row('000005', '004', '2026-10-01')], D)
  assert.deepEqual(b.rows.map((r) => r.code), ['000003', '000001', '000002'])
  assert.equal(b.rows[0].statusLabel, '未标注')
  assert.equal(b.rows[1].progressLow, 50)
  assert.equal(b.rows[1].progressHigh, 25)
  assert.equal(b.rows[2].progressLow, null)
  assert.deepEqual(b.counts, { 未标注: 1, 实施中: 1, 董事会预案: 1 })
  assert.equal(b.newPlans, 1)
  assert.equal(b.newPlanHigh, 2e8)
})

test('历史：同日覆盖、按日期排序', () => {
  const h = mergeHistory([{ date: '2026-11-16', a: 1 }, { date: '2026-11-17', a: 1 }], { date: '2026-11-17', a: 2 })
  assert.deepEqual(h, [{ date: '2026-11-16', a: 1 }, { date: '2026-11-17', a: 2 }])
})

test('解禁表现按交易日历精确对应：基准日 / T 日 / 第 5 日缺 K 线时留空，不用相邻日子顶替', () => {
  // 11-06（基准日）缺失：旧逻辑会拿 11-05 当基准
  const noBase = bars([['2026-11-05', 8], ['2026-11-09', 11], ['2026-11-10', 12], ['2026-11-11', 9], ['2026-11-12', 10], ['2026-11-13', 10.5]])
  assert.deepEqual(liftPerf(noBase, '2026-11-09'), { tDate: '2026-11-09', d1: null, d5: null })
  // T 日 11-09 停牌：旧逻辑会把 11-10 当 T
  const noT = bars([['2026-11-06', 10], ['2026-11-10', 12], ['2026-11-11', 9], ['2026-11-12', 10], ['2026-11-13', 10.5], ['2026-11-16', 10]])
  assert.deepEqual(liftPerf(noT, '2026-11-09'), { tDate: '2026-11-09', d1: null, d5: 5 })
  // 中间 11-11 缺失：第 5 个交易日仍是 11-13，不是顺延到 11-16
  const gap = bars([['2026-11-06', 10], ['2026-11-09', 11], ['2026-11-10', 12], ['2026-11-12', 10], ['2026-11-13', 10.5], ['2026-11-16', 20]])
  assert.deepEqual(liftPerf(gap, '2026-11-09'), { tDate: '2026-11-09', d1: 10, d5: 5 })
  const gap5 = bars([['2026-11-06', 10], ['2026-11-09', 11], ['2026-11-10', 12], ['2026-11-11', 9], ['2026-11-12', 10], ['2026-11-16', 20]])
  assert.deepEqual(liftPerf(gap5, '2026-11-09'), { tDate: '2026-11-09', d1: 10, d5: null })
})

test('汇总里缺失不当 0：增减持金额全缺 → null，回购计划金额只加披露的、全缺 → null', () => {
  const h = buildHolders([
    { SECURITY_CODE: '000001', SECURITY_NAME_ABBR: 'A', HOLDER_NAME: '甲', DIRECTION: '增持', NOTICE_DATE: D, CHANGE_NUM: 10, TRADE_AVERAGE_PRICE: ' ', AFTER_CHANGE_RATE: '-' },
  ], D)
  assert.equal(h.incAmount, null)
  assert.equal(h.decAmount, 0, '没有减持记录是真实的 0')
  assert.equal(h.incMissing, 1)
  assert.equal(h.rank.inc.length, 0)
  const row = (code, low, high) => ({ DIM_SCODE: code, SECURITYSHORTNAME: code, REPURPROGRESS: '001', UPD: D, DIM_DATE: D, REPURAMOUNTLOWER: low, REPURAMOUNTLIMIT: high })
  const none = buildBuyback([row('000001', '-', ''), row('000002', null, ' ')], D)
  assert.equal(none.newPlans, 2)
  assert.equal(none.newPlanLow, null)
  assert.equal(none.newPlanHigh, null)
  const part = buildBuyback([row('000001', 1e8, 2e8), row('000002', '-', 3e8)], D)
  assert.equal(part.newPlanLow, 1e8)
  assert.equal(part.newPlanHigh, 5e8)
  assert.equal(part.newPlanLowMissing, 1)
  assert.equal(part.newPlanHighMissing, 0)
})

test('发布替换：更晚的已发布文件不被历史重跑覆盖；同日日 K 失败更多的不覆盖', () => {
  const cur = { asOf: D, quality: { klineMiss: 0 } }
  assert.equal(shouldReplace(null, cur), true)
  assert.equal(shouldReplace({ asOf: '2026-11-16', quality: { klineMiss: 0 } }, { asOf: D, quality: { klineMiss: 5 } }), true)
  assert.equal(shouldReplace(cur, { asOf: '2026-11-16', quality: { klineMiss: 0 } }), false)
  assert.equal(shouldReplace(cur, { asOf: D, quality: { klineMiss: 3 } }), false)
  assert.equal(shouldReplace({ asOf: D, quality: { klineMiss: 3 } }, cur), true)
  assert.equal(shouldReplace({ asOf: D }, { asOf: D, quality: { klineMiss: 3 } }), true)
})

/* ---------------- 研报评级 ---------------- */
const rep = (id, date, over = {}) => ({ infoCode: id, publishDate: `${date} 00:00:00.000`, stockCode: '600573', stockName: '惠泉啤酒', orgSName: '东吴证券', emRatingName: '增持', sRatingName: '增持', lastEmRatingName: '', ratingChange: 3, indvAimPriceT: '', indvAimPriceL: '', indvInduName: '非白酒', industryName: '', title: '标题', ...over })

test('研报：评级变动代码（0 上调 1 下调 2 首次 3 维持 4 无），空串为未标注；链接只接受报告编号格式', () => {
  assert.deepEqual([0, 1, 2, 3, 4, '3'].map(ratingChangeOf), ['上调', '下调', '首次', '维持', '无', '维持'])
  for (const x of ['', null, undefined, 9]) assert.equal(ratingChangeOf(x), null)
  assert.equal(reportUrl('AP202611181831818610'), 'https://data.eastmoney.com/report/info/AP202611181831818610.html')
  assert.equal(reportUrl('../x'), null)
  assert.equal(reportUrl(null), null)
})

test('研报：紧凑行——目标价空串为 null（不是 0），缺编号或日期丢弃', () => {
  const c = compactReport(rep('AP1', '2026-11-17', { indvAimPriceT: '4.61', indvAimPriceL: '-', ratingChange: '' }), 'stock')
  assert.equal(c.date, '2026-11-17')
  assert.equal(c.row[6], null, 'ratingChange 空串 → null')
  assert.equal(c.row[8], 4.61)
  assert.equal(c.row[9], null)
  assert.equal(compactReport(rep('', '2026-11-17'), 'stock'), null)
  assert.equal(compactReport({ infoCode: 'AP1', publishDate: '' }, 'stock'), null)
  assert.deepEqual(compactReport(rep('AP2', '2026-11-17', { industryName: '房地产开发', ratingChange: 0 }), 'industry').row.slice(0, 2), ['AP2', '房地产开发'])
})

test('研报：分页校验——行数 ≠ hits、编号重复、发布日越界都抛错；区间内无研报的日子是空数组', () => {
  const g = groupReports([rep('AP1', '2026-11-16'), rep('AP2', '2026-11-16')], 2, '2026-11-15', '2026-11-16', 'stock')
  assert.deepEqual([...g.keys()], ['2026-11-15', '2026-11-16'])
  assert.equal(g.get('2026-11-15').length, 0)
  assert.equal(g.get('2026-11-16').length, 2)
  assert.throws(() => groupReports([rep('AP1', '2026-11-16')], 2, '2026-11-15', '2026-11-16', 'stock'), /不完整/)
  assert.throws(() => groupReports([rep('AP1', '2026-11-16'), rep('AP1', '2026-11-16')], 2, '2026-11-15', '2026-11-16', 'stock'), /重复/)
  assert.throws(() => groupReports([rep('AP1', '2026-11-18')], 1, '2026-11-15', '2026-11-16', 'stock'), /不在/)
  assert.throws(() => groupReports([{ infoCode: 'AP1' }], 1, '2026-11-15', '2026-11-16', 'stock'), /缺编号/)
})

test('研报：取数区间——平时重取最近 7 天，30 日窗口里缺日文件时从最早缺的一天起取', () => {
  const T = '2026-11-18'
  const all = new Set(); for (let i = 0; i <= 30; i++) all.add(addDays(T, -i))
  assert.deepEqual(reportFetchRange(all, T), { from: '2026-11-12', to: T })
  all.delete('2026-10-25')
  assert.deepEqual(reportFetchRange(all, T), { from: '2026-10-25', to: T })
  assert.deepEqual(reportFetchRange(new Set(), T), { from: '2026-10-19', to: T })
})

const dayMap = (entries) => new Map(entries.map(([d, stock, ind = []]) => [d, reportDayFile(d, stock.map((r) => compactReport(r, 'stock').row), ind.map((r) => compactReport(r, 'industry').row), 'x')]))

test('研报：统计日——今天 18:00 前不完整，取前一个有研报的自然日；18:00 后取今天；没有研报的日子跳过', () => {
  const m = dayMap([['2026-11-16', [rep('A1', '2026-11-16')]], ['2026-11-17', []], ['2026-11-18', [rep('A2', '2026-11-18')]]])
  assert.equal(pickReportDay(m, '2026-11-18', 15 * 60 + 40), '2026-11-16', '11-17 没有个股研报，跳过')
  assert.equal(pickReportDay(m, '2026-11-18', 18 * 60), '2026-11-18')
  assert.equal(pickReportDay(new Map(), '2026-11-18', 20 * 60), null)
})

test('研报：统计日列表、变动计数、近 7 日上调/首次、近 30 日覆盖排行、行业计数、缺日与今天待计入', () => {
  const m = dayMap([
    ['2026-10-20', [rep('B0', '2026-10-20', { stockCode: '300750', stockName: '宁德时代', orgSName: '甲' })], [rep('I0', '2026-10-20', { industryName: '电池' })]],
    ['2026-11-12', [rep('B1', '2026-11-12', { stockCode: '300750', stockName: '宁德时代', orgSName: '乙', ratingChange: 0 })], [rep('I1', '2026-11-12', { industryName: '电池' })]],
    ['2026-11-17', [
      rep('B2', '2026-11-17', { stockCode: '300750', stockName: '宁德时代', orgSName: '甲', ratingChange: 2, indvAimPriceT: '400', indvAimPriceL: '380' }),
      rep('B3', '2026-11-17', { ratingChange: '' }),
      rep('B4', '2026-11-17', { stockCode: '600519', stockName: '贵州茅台', ratingChange: 1 }),
    ], [rep('I2', '2026-11-17', { industryName: '' }), rep('I3', '2026-11-17', { industryName: '电池' })]],
    ['2026-11-18', [rep('B5', '2026-11-18')]],
  ])
  const s = buildReports(m, '2026-11-17', '2026-11-18')
  assert.equal(s.w7, '2026-11-11')
  assert.equal(s.w30, '2026-10-19')
  assert.equal(s.dayStock, 3)
  assert.equal(s.dayIndustry, 2)
  assert.deepEqual(s.counts, { 上调: 0, 下调: 1, 首次: 1, 维持: 0, 无: 0, 未标注: 1 })
  assert.deepEqual(s.rows.map((r) => r.code), ['300750', '600519', '600573'])
  assert.equal(s.rows[0].url, null, '测试编号不是报告编号格式时不给链接')
  assert.deepEqual(s.upgrades.map((r) => [r.date, r.code]), [['2026-11-12', '300750']])
  assert.deepEqual(s.initiations.map((r) => r.id), ['B2'])
  assert.deepEqual(s.covered[0], { code: '300750', name: '宁德时代', ind: '非白酒', count: 3, latest: '2026-11-17', first: 1, up: 1, orgs: 2 })
  assert.deepEqual(s.industries.find((x) => x.name === '电池'), { name: '电池', n7: 2, n30: 3 })
  assert.ok(s.industries.some((x) => x.name === '未标注行业'))
  assert.equal(s.stock30, 5)
  assert.equal(s.stock7, 4)
  assert.equal(s.industry7, 3)
  assert.equal(s.missingDays.length, 30 - 3, '没有日文件的天列出来，不当 0')
  assert.deepEqual(s.pending, { date: '2026-11-18', stock: 1, industry: 0 })
  assert.equal(s.daily.length, 3)
  // 18:00 后统计日就是今天，不再有待计入
  assert.equal(buildReports(m, '2026-11-18', '2026-11-18').pending, null)
})

test('研报：目标价空间只用当天收盘；停牌（收盘缺失）或无目标价为 null', () => {
  assert.equal(upside(110, 100), 10)
  assert.equal(upside(null, 100), null)
  assert.equal(upside(110, null), null)
  assert.equal(upside(110, 0), null)
  const m = dayMap([['2026-11-17', [
    rep('C1', '2026-11-17', { stockCode: '000001', indvAimPriceT: '12', indvAimPriceL: '11' }),
    rep('C2', '2026-11-17', { stockCode: '000002', indvAimPriceT: '20', indvAimPriceL: '20' }),
    rep('C3', '2026-11-17', { stockCode: '000003' }),
  ]]])
  const s = buildReports(m, '2026-11-17', '2026-11-17')
  assert.deepEqual(aimCodes(s), ['000001', '000002'])
  const f = withUpside(s, new Map([['000001', 10], ['000002', null]]), '2026-11-17')
  assert.equal(f.closeDate, '2026-11-17')
  assert.deepEqual([f.rows[0].close, f.rows[0].upLow, f.rows[0].upHigh], [10, 10, 20])
  assert.deepEqual([f.rows[1].close, f.rows[1].upLow, f.rows[1].upHigh], [null, null, null])
  assert.deepEqual([f.rows[2].aimHigh, f.rows[2].upHigh], [null, null])
})

test('研报：超过 90 天的日文件清理', () => {
  assert.deepEqual(staleReportFiles(['2026-08-19.json', '2026-08-20.json', 'seed.json', '2026-11-18.json'], '2026-11-18'), ['2026-08-19.json'])
})
