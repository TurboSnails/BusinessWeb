// 同花顺 · 可转债页计算：目标日、东财解析与日期校验、到期收益率、条款计数与状态、全景分布、选债行、打新与抢权配债
import test from 'node:test'
import assert from 'node:assert/strict'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import {
  buildRow, callList, callStatus, clauseCheck, countDays, couponsOf, dcRows, discountList, downList, downStatus, issueList, maturityList, median, mergeHistory,
  numOf, parseClist, parseKline, parseLs, parseProgress, pickTarget, rightsList, secidOf, shouldReplace, summarize, universe, updateRestarts, ytm,
} from './ths-cbond-lib.mjs'

const bars = (closes, end = '2026-11-17') => {
  // 生成以 end 结尾的连续交易日日 K
  const dates = [end]
  while (dates.length < closes.length) dates.unshift(prevTradingDay(dates[0]))
  return closes.map((c, i) => ({ date: dates[i], open: c, close: c, pct: 0 }))
}

test('目标日：交易日 15:10 后取当天，否则取上一交易日', () => {
  const o = { isTradingDay, prevTradingDay }
  assert.deepEqual(pickTarget({ bjDate: '2026-11-17', minutes: 15 * 60 + 40, ...o }), { date: '2026-11-17', sameDay: true })
  assert.deepEqual(pickTarget({ bjDate: '2026-11-18', minutes: 3 * 60, ...o }), { date: '2026-11-17', sameDay: false })
  assert.deepEqual(pickTarget({ bjDate: '2026-11-17', minutes: 14 * 60, ...o }), { date: '2026-11-16', sameDay: false })
  assert.deepEqual(pickTarget({ bjDate: '2026-11-21', minutes: 16 * 60, ...o }), { date: '2026-11-20', sameDay: false })
})

test('缺失值：null / 空串 / - 不当 0', () => {
  assert.equal(numOf('-'), null)
  assert.equal(numOf(''), null)
  assert.equal(numOf(null), null)
  assert.equal(numOf('0'), 0)
  assert.equal(numOf('1.5'), 1.5)
  assert.throws(() => dcRows({ success: false, message: '报表配置不存在' }))
  assert.deepEqual(dcRows({ success: true, result: null }), [])
})

test('逐日估值表只收目标日的行；快照逐行核对交易日', () => {
  const m = parseLs([
    { DATE: '2026-11-17 00:00:00', ZCODE: '118061', FCLOSE: 185.11, SWAPVALUE: 121.1, PUREBONDVALUE: 93.27, SWAPOR: 52.85, PUREBONDOR: 98.46 },
    { DATE: '2026-11-16 00:00:00', ZCODE: '118062', FCLOSE: 100 },
  ], '2026-11-17')
  assert.equal(m.size, 1)
  assert.equal(m.get('118061').premium, 52.85)
  const diff = [{ f12: '118061', f2: 185.11, f18: 167.699, f227: 93.27, f236: 121.1, f237: 52.85, f238: '-', f297: 20261117 }]
  const c = parseClist(diff, '2026-11-17')
  assert.equal(c.get('118061').prevClose, 167.699)
  assert.equal(c.get('118061').bondPremium, null)
  assert.throws(() => parseClist(diff, '2026-11-18'))
})

test('日 K 解析与 secid', () => {
  const k = parseKline({ data: { klines: ['2026-11-17,433.15,432.82,-0.10', '2026-11-16,446.70,433.24,-3.22', 'bad,1,-,1'] } })
  assert.deepEqual(k.map((x) => x.date), ['2026-11-16', '2026-11-17'])
  assert.equal(k[1].pct, -0.1)
  assert.deepEqual(parseKline({ data: null }), [])
  assert.equal(secidOf('688502.SH'), '1.688502')
  assert.equal(secidOf('300181.SZ'), '0.300181')
  assert.equal(secidOf(undefined), null)
})

test('存续范围：已上市、未退市、未到期', () => {
  const list = [
    { SECURITY_CODE: 'a', LISTING_DATE: '2026-11-13 00:00:00', DELIST_DATE: null, EXPIRE_DATE: '2032-10-29 00:00:00' },
    { SECURITY_CODE: 'b', LISTING_DATE: null, DELIST_DATE: null, EXPIRE_DATE: '2032-11-16 00:00:00' },
    { SECURITY_CODE: 'c', LISTING_DATE: '2020-01-01 00:00:00', DELIST_DATE: '2026-11-10 00:00:00', EXPIRE_DATE: '2026-12-01 00:00:00' },
    { SECURITY_CODE: 'd', LISTING_DATE: '2020-01-01 00:00:00', DELIST_DATE: null, EXPIRE_DATE: '2026-04-09 00:00:00' },
  ]
  assert.deepEqual(universe(list, '2026-11-17').map((r) => r.SECURITY_CODE), ['a'])
})

test('票息解析与到期税前收益率', () => {
  assert.deepEqual(couponsOf('第1年0.2%,第2年0.4%,第3年0.8%'), [0.2, 0.4, 0.8])
  assert.deepEqual(couponsOf('第一年0.10%、第二年0.30%'), [0.1, 0.3])
  assert.equal(couponsOf('无'), null)
  // 还剩 1 年、到期赎回 110（含最后一年利息），价格 100 → 约 10%
  const y = ytm({ price: 100, coupons: [1, 1, 1, 1, 1, 2], valueDate: '2021-11-17', expireDate: '2027-11-17', redeem: 110, date: '2026-11-17' })
  assert.ok(Math.abs(y - 10) < 0.05, String(y))
  // 价格等于现金流现值时收益率为 0
  assert.equal(ytm({ price: 110, coupons: [1, 1, 1, 1, 1, 2], valueDate: '2021-11-17', expireDate: '2027-11-17', redeem: 110, date: '2026-11-17' }), 0)
  // 不含最后一年利息时另加票息
  const y2 = ytm({ price: 112, coupons: [1, 1, 1, 1, 1, 2], valueDate: '2021-11-17', expireDate: '2027-11-17', redeem: 110, date: '2026-11-17', redeemHasLast: false })
  assert.equal(y2, 0)
  assert.equal(ytm({ price: null, coupons: [1], valueDate: '2021-01-01', expireDate: '2027-01-01', redeem: 110, date: '2026-11-17' }), null)
  assert.equal(ytm({ price: 100, coupons: [1], valueDate: '2021-01-01', expireDate: '2026-11-17', redeem: 110, date: '2026-11-17' }), null)
})

test('条款计数：窗口、起算日、连续天数；目标日没有日 K 时不计', () => {
  const b = bars([10, 14, 14, 9, 14, 14])
  assert.deepEqual(countDays(b, { date: '2026-11-17', threshold: 13, cmp: 'ge', calc: 30 }), { hit: 4, window: 6, consecutive: 2 })
  assert.deepEqual(countDays(b, { date: '2026-11-17', threshold: 13, cmp: 'ge', calc: 3 }), { hit: 2, window: 3, consecutive: 2 })
  assert.deepEqual(countDays(b, { date: '2026-11-17', threshold: 13, cmp: 'ge', calc: 30, from: b[3].date }), { hit: 2, window: 3, consecutive: 2 })
  assert.deepEqual(countDays(b, { date: '2026-11-17', threshold: 13, cmp: 'lt', calc: 30 }), { hit: 2, window: 6, consecutive: 0 })
  assert.equal(countDays(b.slice(0, -1), { date: '2026-11-17', threshold: 13, cmp: 'ge', calc: 30 }), null)
})

test('强赎 / 下修状态与东财计数解析', () => {
  assert.equal(callStatus('已公告强赎', null, '2026-11-17').status, 'announced')
  assert.deepEqual(callStatus('不强赎【2026-11-20】重新计算', '本次内不强赎', '2026-11-17'), { status: 'promised', from: '2026-11-20', note: '本次内不强赎' })
  const c = callStatus('10/15|30', '本次(2026年07月14日至2026年08月03日)内不强赎，2026年11月03日后首个交易日重新计算', '2026-11-17')
  assert.equal(c.status, 'counting')
  assert.equal(c.from, '2026-11-04')
  assert.equal(downStatus('提议下修,【2026-11-26】', '2026-11-17').status, 'proposed')
  assert.deepEqual(downStatus('暂不下修,自【2026-12-01】重新开始', '2026-11-17').status, 'paused')
  assert.equal(downStatus('至少还需13天,2/15|30', '2026-11-17', '2026-11-01').from, '2026-11-01')
  assert.deepEqual(parseProgress('至少还需13天,2/15|30'), { hit: 2, need: 15, calc: 30 })
  assert.equal(parseProgress('已触发'), null)
  assert.deepEqual(updateRestarts({ x: '2026-01-01' }, [{ SECURITY_CODE: 'x', RIVSEDAY: '暂不下修,自【2026-12-01】重新开始' }, { SECURITY_CODE: 'y', RIVSEDAY: '已触发' }]), { x: '2026-12-01' })
})

const item = (over = {}) => ({
  SECURITY_CODE: '118061', SECURITY_NAME_ABBR: '茂莱转债', CONVERT_STOCK_CODE: '688502', SECURITY_SHORT_NAME: '茂莱光学', VALUE_DATE: '2025-11-21 00:00:00',
  EXPIRE_DATE: '2031-11-21 00:00:00', RATING: 'AA', ...over,
})
const clause = (over = {}) => ({
  TRANSFER_PRICE: 10, EXPIRE_DATE: '2031-11-21 00:00:00', TRANSFER_START_DATE: '2026-05-27 00:00:00', INTEREST_RATE: '第1年0.2%,第2年0.4%,第3年0.8%,第4年1.5%,第5年2.0%,第6年2.5%',
  EXPIRE_REDEEM_PRICE: 113, REMAINVOL: 562123179.25, ZDRZXPJ: 'A+', REDEEM_TRIGGER_PRICE: 13, DAT_SDATEPUTS: '2029-11-21 00:00:00',
  REDEEM_TRIGGER_RATIO: 130, REDEEM_CONTENT_DAYS: 15, REDEEM_CALCULATE_DAYS: 30, TRANSFER_TRIGGER_RATIO: 85, TRANSFER_CONTENT_DAYS: 15, TRANSFER_CALCULATE_DAYS: 30,
  RESALE_TRIGGER_RATIO: 70, RESALE_CONTENT_DAYS: 30, RESALE_CALCULATE_DAYS: 30, CALLDAY: '0/15|30', RIVSEDAY: null, ...over,
})

test('选债行：双低 = 价格 + 溢价率；涨跌用上一交易日收盘；缺失保持 null', () => {
  const r = buildRow({ item: item(), clause: clause(), quote: { close: 120, convValue: 100, bondValue: 93, premium: 20 }, prev: { close: 100 }, bars: bars([13, 14]), date: '2026-11-17' })
  assert.equal(r.dualLow, 140)
  assert.equal(r.pct, 20)
  assert.equal(r.stockPrice, 14)
  assert.equal(r.rating, 'A+')
  assert.equal(r.inConvert, true)
  assert.equal(r.years, 5.01)
  assert.ok(r.ytm < 0)
  const miss = buildRow({ item: item(), clause: undefined, quote: { close: 120, convValue: null, bondValue: null, premium: null }, prev: undefined, bars: bars([13]).map((b) => ({ ...b, date: '2026-11-16' })), date: '2026-11-17' })
  assert.equal(miss.pct, null)
  assert.equal(miss.dualLow, null)
  assert.equal(miss.stockPrice, null) // 正股当天没有日 K（停牌）
  assert.equal(miss.rating, 'AA')
  assert.equal(miss.remain, null)
})

test('全景：中位数、涨跌家数与分布（左闭右开，涨跌单列 0）', () => {
  assert.equal(median([3, 1, 2, 10]), 2.5)
  assert.equal(median([]), null)
  const s = summarize([{ price: 99, premium: -1, pct: -3 }, { price: 100, premium: 10, pct: 0 }, { price: 130, premium: 100, pct: 1 }, { price: 125, premium: null, pct: null }])
  assert.equal(s.count, 4)
  assert.equal(s.medianPrice, 112.5)
  assert.equal(s.avgPremium, 36.33)
  assert.deepEqual([s.up, s.down, s.flat], [1, 1, 1])
  assert.deepEqual(s.priceBins.map((b) => b.n), [1, 1, 0, 1, 1])
  assert.deepEqual(s.premiumBins.map((b) => b.n), [1, 0, 1, 0, 0, 0, 1])
  assert.deepEqual(s.pctBins.map((b) => b.n), [1, 0, 0, 1, 0, 1, 0])
})

test('历史合并：逐日估值表优先于快照，按日期排序', () => {
  const h = mergeHistory([{ date: '2026-11-16', source: 'report', count: 1 }], [{ date: '2026-11-16', source: 'snapshot', count: 2 }, { date: '2026-11-13', source: 'report', count: 3 }])
  assert.deepEqual(h.map((d) => [d.date, d.count]), [['2026-11-13', 3], ['2026-11-16', 1]])
  assert.equal(mergeHistory([{ date: '2026-11-16', source: 'snapshot', count: 2 }], [{ date: '2026-11-16', source: 'report', count: 1 }])[0].count, 1)
})

test('套利与条款列表：折价转股、强赎、下修、到期回售', () => {
  const date = '2026-11-17'
  const base = { stockPct: 0, remain: 1e8, inConvert: true, convStart: '2026-01-01', convPrice: 10, stockPrice: 14, years: 3, putStart: null, expireDate: '2029-11-17', expireRedeem: 110, ytm: 1 }
  const rows = [
    { ...base, code: 'a', name: '折价', price: 99, convValue: 100, premium: -1 },
    { ...base, code: 'b', name: '未转股期', price: 99, convValue: 100, premium: -1, inConvert: false },
    { ...base, code: 'c', name: '到期', price: 105, convValue: 60, premium: 75, years: 0.5, putStart: '2025-01-01' },
  ]
  const d = discountList(rows)
  assert.deepEqual(d.map((r) => r.code), ['a'])
  assert.equal(d[0].gapPerLot, 10)
  const clauses = new Map([
    ['a', clause({ CALLDAY: '3/15|30' })],
    ['b', clause({ CALLDAY: '已公告强赎' })],
    ['c', clause({ CALLDAY: '0/15|30', RIVSEDAY: '至少还需5天,10/15|30' })],
  ])
  const bm = new Map([['a', bars([10, 14, 14, 14])], ['b', bars([14])], ['c', bars([5, 5, 5])]])
  const call = callList(rows, { clauses, bars: bm, date })
  assert.deepEqual(call.map((r) => [r.code, r.status, r.hit, r.emHit]), [['a', 'counting', 3, 3]]) // b 不在转股期
  assert.deepEqual(clauseCheck([...call, ...call, ...call], date), { agree: 3, total: 3, asOf: date })
  assert.equal(clauseCheck(call, date).asOf, null) // 样本太少不下结论
  const down = downList(rows, { clauses, bars: bm, date })
  assert.deepEqual(down.map((r) => [r.code, r.hit, r.emHit]), [['c', 3, 10]])
  const m = maturityList(rows, { clauses, bars: bm, date })
  assert.deepEqual(m.map((r) => [r.code, r.inPut, r.putHit, r.redeemGap]), [['c', true, 3, 5]])
})

test('打新债与抢权配债：首日表现须是上市日，含权与最低配售股数', () => {
  const list = [
    { SECURITY_CODE: '111027', SECURITY_NAME_ABBR: '新债甲', PUBLIC_START_DATE: '2026-11-19 00:00:00', SECURITY_START_DATE: '2026-11-18 00:00:00', LISTING_DATE: null, FIRST_PER_PREPLACING: 1.781, ONLINE_GENERAL_LWR: null, ACTUAL_ISSUE_SCALE: 7.48149, RATING: 'AA', CORRECODE: '713016', CONVERT_STOCK_CODE: '605016', SECURITY_SHORT_NAME: '正股甲' },
    { SECURITY_CODE: '123291', SECURITY_NAME_ABBR: '新债乙', PUBLIC_START_DATE: '2026-10-29 00:00:00', SECURITY_START_DATE: '2026-10-28 00:00:00', LISTING_DATE: '2026-11-13 00:00:00', FIRST_PER_PREPLACING: 1.9704, ONLINE_GENERAL_LWR: 0.0038604778, FIRST_PROFIT: 317.896, ACTUAL_ISSUE_SCALE: 13.709297 },
    { SECURITY_CODE: '100000', SECURITY_NAME_ABBR: '老债', PUBLIC_START_DATE: '2026-01-01 00:00:00' },
  ]
  const issues = issueList(list, {
    date: '2026-11-17',
    firstBars: new Map([['123291', { date: '2026-11-13', open: 130, close: 132 }]]),
    stockBars: new Map([['111027', bars([20, 20.5])], ['123291', [{ date: '2026-10-28', close: 12.85 }, { date: '2026-11-17', close: 14 }]]]),
  })
  assert.deepEqual(issues.map((r) => r.code), ['111027', '123291'])
  const [a, b] = issues
  assert.equal(a.rightsPer100, 8.69) // 1.781 / 20.5 × 100
  assert.equal(a.minShares, 600)
  assert.equal(a.winRate, null)
  assert.equal(a.listDate, null)
  assert.equal(b.refPrice, 12.85) // 登记日已过：按登记日收盘
  assert.equal(b.firstPct, 32)
  assert.equal(b.profitPerLot, 317.9)
  assert.equal(b.winRate, 0.00386)
  assert.deepEqual(rightsList(issues, '2026-11-17').map((r) => r.code), ['111027'])
})

test('缺失值：只有空白的字符串也算缺失，不当 0', () => {
  assert.equal(numOf(' '), null)
  assert.equal(numOf('  -  '), null)
  assert.equal(numOf('\t'), null)
  assert.equal(numOf(' 1.5 '), 1.5)
  const m = parseLs([{ DATE: '2026-11-17 00:00:00', ZCODE: '113001', FCLOSE: ' ', SWAPVALUE: '-', PUREBONDVALUE: '', SWAPOR: '  ', PUREBONDOR: null }], '2026-11-17')
  assert.deepEqual(m.get('113001'), { close: null, convValue: null, bondValue: null, premium: null, bondPremium: null })
})

test('票息年份必须连续：缺一年不算；现值算不出时不返回区间端点', () => {
  assert.equal(couponsOf('第1年0.2%,第3年0.8%'), null)
  assert.equal(couponsOf('第2年0.4%'), null)
  const base = { price: 100, valueDate: '2021-11-17', expireDate: '2027-11-17', redeem: 110, date: '2026-11-17' }
  // 稀疏数组（第 5 年空位）直接拒绝，而不是得到 NaN 现值后返回 −90%
  const sparse = [1, 1, 1, 1]; sparse[5] = 2
  assert.equal(ytm({ ...base, coupons: sparse }), null)
  assert.equal(ytm({ ...base, coupons: [1, 1, 1, 1, NaN, 2] }), null)
  assert.equal(ytm({ ...base, redeem: NaN }), null)
})

test('发布替换：更晚的已发布文件、同日逐日估值表、同日更完整的结果都不被替换', () => {
  const q = { clauses: 400, quotes: 398, klineFail: 0 }
  const rep = { asOf: '2026-11-17', source: 'report', quality: q }
  assert.equal(shouldReplace(null, rep), true)
  assert.equal(shouldReplace({ asOf: '2026-11-16', source: 'report', quality: q }, rep), true)
  // DATE 历史重跑不覆盖更新的公开文件
  assert.equal(shouldReplace(rep, { ...rep, asOf: '2026-11-16' }), false)
  // 同日：快照不覆盖逐日估值表；逐日估值表可覆盖快照
  assert.equal(shouldReplace(rep, { ...rep, source: 'snapshot' }), false)
  assert.equal(shouldReplace({ ...rep, source: 'snapshot' }, rep), true)
  // 同日同来源：条款 / 估值覆盖更少、日 K 失败更多的不覆盖
  assert.equal(shouldReplace(rep, { ...rep, quality: { ...q, klineFail: 3 } }), false)
  assert.equal(shouldReplace(rep, { ...rep, quality: { ...q, quotes: 390 } }), false)
  assert.equal(shouldReplace(rep, { ...rep, quality: { ...q, clauses: 395 } }), false)
  assert.equal(shouldReplace(rep, { ...rep, quality: { ...q } }), true)
  // 旧文件没有完整度记录时允许替换
  assert.equal(shouldReplace({ asOf: '2026-11-17', source: 'report' }, rep), true)
})
