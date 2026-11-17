// 虚构响应验证字段、日期与发布门禁，不把测试数据当公开快照。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ahIndexStats, buildAh, buildHoldings, buildShort, buildSouth, compactShort, hkOnly, numberOrNull, parseAhList, parseConnectStat, parseKline, parseQt,
  parseShortSelling, parseSouthHistory, settled, settledKline, shortLabel, validDate,
} from './ths-hk-lib.mjs'

const date = '2026-11-17'
const afterClose = new Date('2026-11-17T08:20:00Z') // 北京 16:20
const beforeClose = new Date('2026-11-17T07:40:00Z') // 北京 15:40

test('缺值不是零，千分位数字可解析', () => {
  for (const x of [null, undefined, '', ' ', '-', '--', 'abc', Infinity]) assert.equal(numberOrNull(x), null)
  assert.equal(numberOrNull('0'), 0)
  assert.equal(numberOrNull('51,937.74'), 51937.74)
  assert.equal(validDate('2026-02-30'), false)
})

test('港股收盘门禁：当天 16:15 前不接纳，之前的日期随时可用', () => {
  assert.equal(settled(date, beforeClose, 975), false)
  assert.equal(settled(date, afterClose, 975), true)
  assert.equal(settled('2026-11-16', beforeClose, 975), true)
  const rows = parseKline({ rc: 0, data: { klines: ['2026-11-16,130.59', `${date},132.74`] } })
  assert.equal(settledKline(rows, beforeClose, 975).length, 1)
  assert.throws(() => parseKline({ rc: 0, data: { klines: [`${date},1`, '2026-11-16,1'] } }))
  // 香港假期的 HSAHP K 线去掉
  assert.deepEqual(hkOnly([{ date: '2026-10-16' }, { date: '2026-10-19' }, { date: '2026-10-20' }], ['2026-10-16', '2026-10-20']).map(r => r.date), ['2026-10-16', '2026-10-20'])
})

const southBody = (type, rows) => ({ success: true, result: { data: rows.map(([d, net, buy, sell, deal]) => ({ MUTUAL_TYPE: type, TRADE_DATE: `${d} 00:00:00`, NET_DEAL_AMT: net, BUY_AMT: buy, SELL_AMT: sell, DEAL_AMT: deal })) } })
const south = () => ({
  all: southBody('006', [[date, 2203.66, 40937.42, 38733.76, 79671.18], ['2026-11-16', -4226.73, 32412.72, 36639.45, 69052.17]]),
  sh: southBody('002', [[date, 2686.44, 27312.09, 24625.65, 51937.74]]),
  sz: southBody('004', [[date, -482.78, 13625.33, 14108.11, 27733.44], ['2026-11-16', null, null, null, null]]),
})
test('南向历史：三种口径按日期合并，净买入 = 买入 − 卖出，缺值保留 null', () => {
  const rows = parseSouthHistory(south())
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[1], { date, net: 2203.66, netSh: 2686.44, netSz: -482.78, buy: 40937.42, sell: 38733.76, turnover: 79671.18 })
  assert.equal(rows[0].netSh, null)
  const bad = south(); bad.all.result.data[0].NET_DEAL_AMT = 9999
  assert.throws(() => parseSouthHistory(bad), /口径/)
  const wrongType = south(); wrongType.sh.result.data[0].MUTUAL_TYPE = '004'
  assert.throws(() => parseSouthHistory(wrongType))
})

const top10 = (codes) => ({ style: 2, table: { classname: 'top10Table', schema: [['Rank', 'Stock Code', 'Stock Name', 'Buy Turnover', 'Sell Turnover', 'Total Turnover']], tr: codes.map((c, i) => ({ td: [[String(i + 1), c, '阿里巴巴－Ｗ\u3000\u3000', '2,080,341,645', '3,134,711,076', '5,215,052,721']] })) } })
const sum = (turnover) => ({ style: 1, table: { classname: 'tradingTable', schema: [['Total Turnover', 'Buy Turnover', 'Sell Turnover']], tr: [{ td: [[turnover]] }, { td: [['1']] }, { td: [['2']] }] } })
const codes = Array.from({ length: 10 }, (_, i) => String(9980 + i).padStart(5, '0'))
const stat = (d = date, tradingDay = 1) => 'tabData = ' + JSON.stringify([
  { date: d, market: 'SSE Southbound', tradingDay, content: [sum('51,937.74'), top10(codes)] },
  { date: d, market: 'SZSE Southbound', tradingDay, content: [sum('27,733.44'), top10(codes)] },
]) + ';'
test('HKEX 每日统计：十大成交股、净买入、名称全角归一；休市日返回 null；日期必须相符', () => {
  const s = parseConnectStat(stat(), date)
  assert.equal(s.sh.turnover, 51937.74)
  assert.equal(s.sh.top10.length, 10)
  assert.equal(s.sh.top10[0].name, '阿里巴巴-W')
  assert.equal(s.sh.top10[0].net, 2080341645 - 3134711076)
  assert.equal(parseConnectStat(stat(date, 0), date), null)
  // 中文名为空时回落到英文名
  const blank = stat().replaceAll('阿里巴巴－Ｗ\u3000\u3000', '\u3000\u3000')
  assert.equal(parseConnectStat(blank, date).sh.top10[0].name, codes[0])
  assert.equal(parseConnectStat(blank, date, stat().replaceAll('阿里巴巴－Ｗ\u3000\u3000', 'BABA-W')).sh.top10[0].name, 'BABA-W')
  assert.throws(() => parseConnectStat(stat('2026-11-16'), date))
  assert.throws(() => parseConnectStat('<html>', date))
  const out = buildSouth(parseSouthHistory(south()), s)
  assert.equal(out.asOf, date)
  // 两个来源成交额对不上时拒绝
  assert.throws(() => buildSouth(parseSouthHistory(south()), { ...s, sz: { ...s.sz, turnover: 1 } }))
})

const holdRow = (i, extra = {}) => ({ SECURITY_CODE: String(i).padStart(5, '0'), SECURITY_NAME: `港股${i}`, HOLD_DATE: `${date} 00:00:00`, HOLD_SHARES: 1e9, HOLD_SHARES_CHANGE: (i - 200) * 1e6, HOLD_SHARES_RATIO: 10, HOLD_MARKET_CAP: 1e9 + i, ADD_MARKET_CAP: 1, CLOSE_PRICE: 10, CHANGE_RATE: 1.234, INDUSTRY: '-', ...extra })
test('港股通持股：比例变化 = 比例 × 变动 / 持股；条数必须完整；小市值不进变化排行', () => {
  const rows = Array.from({ length: 400 }, (_, i) => holdRow(i + 1))
  rows[0].HOLD_MARKET_CAP = 1000 // 小市值
  const h = buildHoldings([{ success: true, result: { count: 400, data: rows.slice(0, 300) } }, { success: true, result: { count: 400, data: rows.slice(300) } }], date)
  assert.equal(h.ratioUp[0].code, '00400')
  assert.equal(h.ratioUp[0].ratioChg, 2)
  assert.equal(h.ratioDown[0].code, '00002') // 00001 市值过小被排除
  assert.equal(h.top[0].code, '00400')
  assert.equal(h.top[0].industry, null)
  assert.throws(() => buildHoldings([{ success: true, result: { count: 401, data: rows } }], date))
  rows[5].HOLD_DATE = '2026-11-16 00:00:00'
  assert.throws(() => buildHoldings([{ success: true, result: { count: 400, data: rows } }], date))
})

test('AH：溢价率按中间价换算；停牌（报价日期不符）置空；汇率日期不符或 H 股未收盘则拒绝', () => {
  const pairs = parseAhList([{ rc: 0, data: { total: 100, diff: Array.from({ length: 100 }, (_, i) => ({ f12: String(i).padStart(5, '0'), f14: 'H', f191: String(600000 + i), f192: 1, f193: `样本${i}` })) } }])
  const hk = (c, price, d = '2026/11/17 16:08:20') => `v_r_hk${c}="100~名~${c}~${price}~${'0~'.repeat(26)}${d}~1~2.5~${'0~'.repeat(5)}";`
  const a = (c, price) => `v_sh${c}="1~名~${c}~${price}~${'0~'.repeat(26)}20261117150003~1~-1.5~${'0~'.repeat(5)}";`
  const text = pairs.map((p, i) => hk(p.hCode, 10, i === 0 ? '2026/11/14 16:08:20' : undefined) + a(p.aCode, 9)).join('\n')
  const quotes = parseQt(text)
  assert.equal(quotes.get('hk00001').date, date)
  const idx = [{ date: '2023-11-01', close: 140 }, { date: '2025-11-18', close: 120 }, { date, close: 130 }]
  const out = buildAh(pairs, quotes, { date, rate: 0.9 }, idx, afterClose)
  const r = out.rows.find(x => x.hCode === '00001')
  assert.equal(r.premium, 0) // 9 / (10 × 0.9) − 1
  assert.equal(r.aPct, -1.5)
  assert.equal(out.rows.at(-1).premium, null) // 停牌行排最后
  assert.throws(() => buildAh(pairs, quotes, { date: '2026-11-16', rate: 0.9 }, idx, afterClose), /中间价/)
  assert.throws(() => buildAh(pairs, quotes, { date, rate: 0.9 }, idx, beforeClose), /未收盘/)
  assert.throws(() => parseAhList([{ rc: 0, data: { total: 211, diff: [] } }]))
})

test('AH 溢价指数：近 1 年均值与分位；历史不足 3 年时 3 年统计为空', () => {
  const s = ahIndexStats([{ date: '2025-11-10', close: 100 }, { date: '2025-11-18', close: 120 }, { date: '2026-05-01', close: 140 }, { date, close: 130 }])
  assert.equal(s.y1.mean, 130)
  assert.equal(s.y1.pctile, 66.7)
  assert.equal(s.y3.mean, null)
})

const shortText = (d = '17 NOV 2026') => `日期 DATE : ${d} (星期二 TUESDAY)
<a name = "short_selling">賣空成交-每日報表</a>
  代號  股票名稱              股數(SH)          金額($)           股數(SH)           金額($)
${Array.from({ length: 250 }, (_, i) => `  ${String(i + 1).padStart(5)} 樣本\u3000股份\u3000${i}\u3000\u3000      1,000          ${(i + 1) * 1000000}       4,000         400000000`).join('\n')}
 %83437 博時央企紅利－Ｒ            100                 824             100                 824
</font></pre><pre><font size='1'> % 9067 安碩恒生科技－Ｕ         66,300              67,245         219,600             222,754
錄得賣空交易之證券（所有證券）數目\u3000\u3000\u3000\u3000：                  252
（C） 賣空指定證券（所有指定證券）
\u3000\u3000\u3000賣空交易成交金額\u3000\u3000\u3000\u3000\u3000： HKD\u3000     39,727,930,174
市場總成交\u3000\u3000\u3000\u3000\u3000\u3000\u3000\u3000\u3000\u3000\u3000： HKD\u3000    198,051,560,759
<a name = "adj_short">上日經調整賣空成交</a>
      1 長和                       603,500           41,533,325`
test('HKEX 卖空日报：个股比例、全市场占比、日期校验；非港元证券不入存档', () => {
  const day = parseShortSelling(shortText(), date)
  assert.equal(day.stocks.length, 252)
  assert.equal(day.stocks.at(-1).code, '09067')
  assert.equal(day.stocks[0].code, '00001')
  assert.equal(day.stocks[0].name, '樣本股份0')
  assert.equal(day.stocks[0].ratio, 0.25)
  assert.equal(day.stocks[249].ratio, 62.5)
  assert.equal(day.market.ratio, 20.06)
  assert.equal(day.stocks.at(-1).currency, 'other')
  assert.throws(() => parseShortSelling(shortText().replace('：                  252', '：                  253'), date), /不符/)
  assert.equal(compactShort(day).ratios['83437'], undefined)
  assert.throws(() => parseShortSelling(shortText('16 NOV 2026'), date))
  assert.throws(() => parseShortSelling('公眾假期，休市一天。', date))
})

test('卖空分位标签：≥80 较高、≤20 较低；样本少于 20 日不标', () => {
  const xs = Array.from({ length: 30 }, (_, i) => i + 1)
  assert.equal(shortLabel(xs, 30).label, '较高')
  assert.equal(shortLabel(xs, 1).label, '较低')
  assert.equal(shortLabel(xs, 15).label, '正常')
  assert.equal(shortLabel(xs.slice(0, 19), 19).label, null)
  const day = parseShortSelling(shortText(), date)
  const store = Array.from({ length: 25 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, market: { short: 1, turnover: 10, ratio: 10 }, ratios: { '00250': 10 } }))
  const types = new Map(day.stocks.map(x => [x.code, x.code === '00249' ? 'GP-FUND' : 'GP']))
  const s = buildShort(day, store, types)
  assert.ok(!s.top.some(r => r.code === '00249')) // 基金 / 杠反产品排除
  assert.throws(() => buildShort(day, store, new Map()), /类型/)
  assert.equal(s.top[0].code, '00250')
  assert.equal(s.top.length, 30)
  assert.equal(s.top[0].label, '较高')
  assert.equal(s.top[0].n, 26)
  assert.equal(s.history.at(-1).date, date)
  assert.ok(s.top.every(r => r.turnover >= 1e8))
})
