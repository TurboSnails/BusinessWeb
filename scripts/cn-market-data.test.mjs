import assert from 'node:assert/strict'
import test from 'node:test'
import {
  annualizedBasis, collectCnMarketData, marginSeries, parseChinabondTenYear, parseChinamoneyRecords,
  parseCffexDay, parseCnindexRows, parseCsiPerfRows, parseEmLpr, parseEmMonthly, parseHkexNorth, parseKline, parseRzrq, poolDay,
  spreadSeries, sumAmounts, thirdFriday, volumeRatioFromAmount,
} from './cn-market-data.mjs'

const klineBody = (code, entries) => ({ rc: 0, data: { code, klines: entries.map(([d, v]) => `${d},${v}`) } })

// 2026-10-15 起 26 个工作日（不含周末）
const WEEKDAYS = (() => {
  const days = []
  const d = new Date(Date.UTC(2026, 9, 15))
  while (days.length < 26) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return days
})()
const LAST = WEEKDAYS.at(-1) // 2026-11-19

test('parseCsiPerfRows 与 parseCnindexRows 解析官方行情，scale 归一，空数据抛错', () => {
  const perf = { code: '200', data: [{ tradeDate: '20251110', indexCode: '000001', tradingValue: 9605.89, close: 4018.6 }, { tradeDate: '20251111', indexCode: '399001', tradingValue: 1 }] }
  assert.deepEqual(parseCsiPerfRows(perf, '000001', 'close'), [{ date: '2025-11-10', value: 4018.6 }])
  const amountRows = parseCsiPerfRows(perf, '000001', 'tradingValue', 1e8)
  assert.equal(amountRows[0].date, '2025-11-10')
  assert.equal(Math.round(amountRows[0].value), 960589000000) // 亿元 ×1e8 归一到元
  const cn = { data: { data: [['2025-11-20', 1, 2, 3, 4, 5, 6, '7%', 9968.47, 67314.77, null]] } }
  const cnRows = parseCnindexRows(cn, 1e8)
  assert.equal(cnRows[0].date, '2025-11-20')
  assert.equal(Math.round(cnRows[0].value), 996847000000)
  assert.throws(() => parseCsiPerfRows({ code: '500', data: [] }, '000001', 'close'), /为空/)
  assert.throws(() => parseCnindexRows({ data: { data: [] } }), /为空/)
})

test('parseKline 校验身份与形状，非法行丢弃', () => {
  const body = klineBody('000001', [['2026-11-18', 7e11], ['bad', 1], ['2026-11-19', '-']])
  assert.deepEqual(parseKline(body, '000001'), [{ date: '2026-11-18', value: 7e11 }])
  assert.throws(() => parseKline({ rc: 1 }, '000001'), /身份不符/)
  assert.throws(() => parseKline(klineBody('000002', [['2026-11-18', 1]]), '000001'), /身份不符/)
  assert.throws(() => parseKline({ rc: 0, data: { code: '000001', klines: [] } }, '000001'), /为空/)
})

test('sumAmounts 只保留两日都有的日期、分段重叠去重、元转亿元', () => {
  const sh = [{ date: '2026-11-18', value: 7e11 }, { date: '2026-11-18', value: 7e11 }, { date: '2026-11-19', value: 1 }]
  const sz = [{ date: '2026-11-18', value: 9e11 }, { date: '2026-11-19', value: 9e11 }]
  assert.deepEqual(sumAmounts(sh, sz), [['2026-11-18', 16000], ['2026-11-19', 9000]])
})

test('volumeRatioFromAmount 用此前 20 个交易日均值，不足 21 天没有值', () => {
  const history = Array.from({ length: 21 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, i + 1])
  const ratios = volumeRatioFromAmount(history)
  assert.equal(ratios.length, 1)
  assert.equal(ratios[0][1], 2) // 21 / mean(1..20)=10.5
  assert.deepEqual(volumeRatioFromAmount(history.slice(0, 20)), [])
})

test('parseRzrq 过滤非法行，marginSeries 计算余额/占流通市值/换手率/买入占比/月末同比', () => {
  const rows = [
    { DIM_DATE: '2026-11-18 00:00:00', RZYE: 2208261728901, RQYE: 29568073863, RZMRE: 108280896678, LTSZ: 87601756387269.47 },
    { DIM_DATE: '2026-11-17 00:00:00', RZYE: 2200000000000, RQYE: 30000000000, RZMRE: 80000000000 },
    { DIM_DATE: 'bad', RZYE: 1, RQYE: 1 },
    { DIM_DATE: '2026-11-16 00:00:00', RZYE: -5, RQYE: 1 },
  ]
  const cleaned = parseRzrq(rows)
  assert.equal(cleaned.length, 2)
  assert.equal(cleaned[0].ltsz, null) // 11-17 行缺 LTSZ，不补 0
  assert.equal(cleaned.at(-1).ltsz, 87601756387269.47)
  const amount = new Map([['2026-11-18', 1600], ['2026-11-17', 1500]])
  const s = marginSeries(cleaned, amount)
  assert.deepEqual(s.balance[0], ['2026-11-17', 22300])
  assert.deepEqual(s.balance[1], ['2026-11-18', 22378.3])
  assert.deepEqual(s.ratio, [['2026-11-18', 2.52]])
  assert.deepEqual(s.turnover, [['2026-11-18', 0.18]])
  assert.deepEqual(s.buyShare, [['2026-11-17', 53.33], ['2026-11-18', 67.68]])
  assert.throws(() => parseRzrq([]), /两融数据为空/)
  assert.throws(() => parseRzrq([{ DIM_DATE: '2026-11-18 00:00:00', RZYE: 'x', RQYE: 1 }]), /无有效观测/)
})

test('marginSeries 月末同比按同月比较，春节季节性不用环比', () => {
  const monthly = (() => {
    const out = []
    for (let m = 1; m <= 12; m++) out.push({ date: `2025-${String(m).padStart(2, '0')}-15`, rzye: 1000e8, rqye: 0, rzmre: null, ltsz: null })
    for (let m = 1; m <= 11; m++) out.push({ date: `2026-${String(m).padStart(2, '0')}-15`, rzye: 1100e8, rqye: 0, rzmre: null, ltsz: null })
    return out
  })()
  const { yoy } = marginSeries(monthly, new Map())
  assert.deepEqual(yoy[0], ['2026-01-31', 10])
  assert.equal(yoy.length, 11)
  assert.equal(yoy.at(-1)[0], '2026-11-30')
})

const CB_HTML = `<table>
<tr><td>曲线名称</td><td>日期</td><td>3月</td><td>6月</td><td>1年</td><td>3年</td><td>5年</td><td>7年</td><td>10年</td><td>30年</td></tr>
<tr><td>中债国债收益率曲线</td><td>2026-11-18</td><td>1.1689</td><td>1.1756</td><td>1.1731</td><td>1.2402</td><td>1.3262</td><td>1.4264</td><td>1.5755</td><td>2.0400</td></tr>
<tr><td>中债商业银行普通债收益率曲线(AAA)</td><td>2026-11-18</td><td>9.9</td><td>9.9</td><td>9.9</td><td>9.9</td><td>9.9</td><td>9.9</td><td>9.9999</td><td>9.9</td></tr>
<tr><td>中债国债收益率曲线</td><td>2026-11-17</td><td>1.17</td><td>1.17</td><td>1.17</td><td>1.25</td><td>1.33</td><td>1.44</td><td>1.59</td><td>2.05</td></tr>
</table>`

test('parseChinabondTenYear 只取国债曲线并按表头定位 10 年列', () => {
  assert.deepEqual(parseChinabondTenYear(CB_HTML), [['2026-11-17', 1.59], ['2026-11-18', 1.58]])
  assert.deepEqual(parseChinabondTenYear('<html><body>无数据</body></html>'), [])
})

test('parseChinamoneyRecords 解析 records，缺 records 抛错', () => {
  const json = { records: [{ showDateCN: '2026-11-19', '3M': '1.3990' }, { showDateCN: '2026-11-18', '3M': 'x' }, { showDateCN: 'bad', '3M': '1' }] }
  assert.deepEqual(parseChinamoneyRecords(json, '3M'), [['2026-11-19', 1.4]])
  assert.throws(() => parseChinamoneyRecords({}, '3M'), /records/)
})

test('parseEmLpr 丢弃 LPR1Y 为空的早年行', () => {
  const rows = [{ TRADE_DATE: '2026-10-20 00:00:00', LPR1Y: 3 }, { TRADE_DATE: '1993-05-15 00:00:00', LPR1Y: null }]
  assert.deepEqual(parseEmLpr(rows), [['2026-10-20', 3]])
})

test('parseEmMonthly 月初转月末，spreadSeries 同月相减', () => {
  const rows = [{ REPORT_DATE: '2026-10-01 00:00:00', CURRENCY_SAME: 4.4 }, { REPORT_DATE: '2026-02-01 00:00:00', CURRENCY_SAME: 3 }]
  assert.deepEqual(parseEmMonthly(rows, 'CURRENCY_SAME'), [['2026-02-28', 3], ['2026-10-31', 4.4]])
  assert.deepEqual(spreadSeries([['2026-10-31', 4.4]], [['2026-10-31', 7.1]]), [['2026-10-31', -2.7]])
  assert.deepEqual(spreadSeries([['2026-10-31', 4.4]], [['2026-09-30', 7.1]]), [])
})

const pool = (tc, poolRows) => ({ rc: 0, data: { tc, qdate: 20261119, pool: poolRows } })

test('poolDay 三池计数与最高连板，三池全空视为无数据，rc 异常抛错', () => {
  const zt = pool(3, [{ c: '000001', lbc: 2 }, { c: '000002', lbc: 5 }, { c: '000003', zttj: { days: 9 } }])
  const day = poolDay(zt, pool(1, []), pool(4, []))
  assert.deepEqual(day, { up: 3, down: 1, broken: 4, maxBoard: 9 })
  assert.equal(poolDay(pool(0, []), pool(0, []), pool(0, [])), null)
  assert.throws(() => poolDay({ rc: 1 }, pool(0, []), pool(0, [])), /股池返回异常/)
})

test('thirdFriday 是合约月第三个周五', () => {
  assert.equal(thirdFriday(2026, 12), '2026-12-18')
  assert.equal(thirdFriday(2027, 1), '2027-01-15')
  assert.equal(thirdFriday(2026, 11), '2026-11-20')
})

const CFFEX_CSV = ['合约代码,今开盘,最高价,最低价,成交量,成交金额,持仓量,持仓变化,今收盘,今结算,前结算,涨跌1,涨跌2,Delta',
  'IF2612,1,1,1,10,1,100,0,1,3900,1,0,0,--',
  'IF2701,1,1,1,10,1,50,0,1,3850,1,0,0,--',
  'IM2612,1,1,1,10,1,80,0,1,5800,1,0,0,--',
  'IM2703,1,1,1,10,1,70,0,1,5700,1,0,0,--',
  'IO2611-C-3000,1,1,1,100,1,1,0,1,1,1,0,0,0.9',
  'IO2611-P-3000,1,1,1,250,1,1,0,1,1,1,0,0,0.9',
  'MO2611-C-5000,1,1,1,50,1,1,0,1,1,1,0,0,0.9',
].join('\n')

test('parseCffexDay 取持仓量最大 IF/IM 合约与期权成交量，空表返回 null', () => {
  const day = parseCffexDay(CFFEX_CSV)
  assert.equal(day.ifSettlement, 3900) // IF2612 持仓 100 > IF2701 50
  assert.equal(day.ifExpiry, '2026-12-18')
  assert.equal(day.imSettlement, 5800) // IM2612 持仓 80 > IM2703 70
  assert.equal(day.imExpiry, '2026-12-18')
  assert.equal(day.callVol, 150)
  assert.equal(day.putVol, 250)
  assert.equal(parseCffexDay('合约代码,今开盘\n'), null)
  assert.throws(() => parseCffexDay('垃圾内容'), /表头异常/)
})

test('annualizedBasis 年化公式与剩余天数校验', () => {
  assert.equal(annualizedBasis(3900, 4000, '2026-12-18', '2026-11-18'), -30.42)
  assert.equal(annualizedBasis(null, 4000, '2026-12-18', '2026-11-18'), null)
  assert.equal(annualizedBasis(3900, 4000, '2026-11-18', '2026-11-18'), null)
  assert.equal(annualizedBasis(3900, null, '2026-12-18', '2026-11-18'), null)
})

const HKEX_JS = `tabData = [
 {"id":0,"date":"2026-11-18","market":"SSE Northbound","tradingDay":1,"content":[{"style":1,"table":{"schema":[["Total Turnover","Total Trade Count","DQB","ETF Turnover"]],"tr":[{"td":[["108,240.34"]]},{"td":[["6,378,637"]]},{"td":[["999,999,999"]]},{"td":[["2,791.36"]]}]}}]},
 {"id":1,"date":"2026-11-18","market":"SSE Southbound","tradingDay":1,"content":[{"style":1,"table":{"schema":[["Total Turnover"]],"tr":[{"td":[["56,683.53"]]}]}}]},
 {"id":2,"date":"2026-11-18","market":"SZSE Northbound","tradingDay":1,"content":[{"style":1,"table":{"schema":[["Total Turnover","Total Trade Count","DQB","ETF Turnover"]],"tr":[{"td":[["101,895.75"]]},{"td":[["1"]]},{"td":[["1"]]},{"td":[["1"]]}]}}]}
];`

test('parseHkexNorth 汇总 SSE+SZSE 北向成交额（百万港元→亿港元），结构不符返回 null', () => {
  assert.equal(parseHkexNorth(HKEX_JS), 2101.36)
  assert.equal(parseHkexNorth('<html>404</html>'), null)
  assert.equal(parseHkexNorth('tabData = [{“market”:“SSE Northbound”}]'), null)
})

// ---------- 集成：collectCnMarketData 用桩 read 走通全部来源与合并/容错 ----------

const emBody = (data) => JSON.stringify({ success: true, result: { data, count: data.length, pages: 1 }, code: 0 })

function stubRead(overrides = {}) {
  const marginRows = [
    ...Array.from({ length: 12 }, (_, i) => ({ DIM_DATE: `2025-${String(i + 1).padStart(2, '0')}-15 00:00:00`, RZYE: 1000e8, RQYE: 0 })),
    ...Array.from({ length: 11 }, (_, i) => ({ DIM_DATE: `2026-${String(i + 1).padStart(2, '0')}-15 00:00:00`, RZYE: 1100e8, RQYE: 0 })),
    { DIM_DATE: '2026-11-17 00:00:00', RZYE: 2200000000000, RQYE: 30000000000, RZMRE: 80000000000, LTSZ: 8.6e13 },
    { DIM_DATE: '2026-11-18 00:00:00', RZYE: 2208261728901, RQYE: 29568073863, RZMRE: 108280896678, LTSZ: 87601756387269.47 },
  ]
  const stub = (url) => {
    if (url.includes('secid=1.000001')) return klineBody('000001', WEEKDAYS.map((d) => [d, 7e11]))
    if (url.includes('secid=0.399106')) return klineBody('399106', WEEKDAYS.map((d) => [d, 9e11]))
    if (url.includes('secid=1.000300')) return klineBody('000300', WEEKDAYS.map((d) => [d, 4000]))
    if (url.includes('secid=1.000852')) return klineBody('000852', WEEKDAYS.map((d) => [d, 6000]))
    if (url.includes('RPTA_RZRQ_LSHJ')) return emBody(marginRows)
    if (url.includes('historyQuery')) return CB_HTML
    if (url.includes('ShiborHis')) return JSON.stringify({ records: [{ showDateCN: '2026-11-18', '3M': '1.3990' }, { showDateCN: '2026-11-17', '3M': '1.4000' }] })
    if (url.includes('LprHis')) return JSON.stringify({ records: [{ showDateCN: '2026-10-20', '1Y': '3.00' }] })
    if (url.includes('RPTA_WEB_RATE')) return emBody([{ TRADE_DATE: '2026-10-20 00:00:00', LPR1Y: 3 }, { TRADE_DATE: '2019-08-20 00:00:00', LPR1Y: 4.25 }])
    if (url.includes('RPTA_WEB_TREASURYYIELD')) return emBody([{ SOLAR_DATE: '2026-11-17 00:00:00', EMM00166466: 1.5892 }, { SOLAR_DATE: '2002-01-04 00:00:00', EMM00166466: 3.2 }])
    if (url.includes('RPT_ECONOMY_CURRENCY_SUPPLY')) return emBody([{ REPORT_DATE: '2026-10-01 00:00:00', CURRENCY_SAME: 4.4, BASIC_CURRENCY_SAME: 7.1 }, { REPORT_DATE: '2026-09-01 00:00:00', CURRENCY_SAME: 3.2, BASIC_CURRENCY_SAME: 7.2 }])
    if (url.includes('RPT_ECONOMY_PMI')) return emBody([{ REPORT_DATE: '2026-10-01 00:00:00', MAKE_INDEX: 49.3 }])
    if (url.includes('RPT_ECONOMY_PPI')) return emBody([{ REPORT_DATE: '2026-10-01 00:00:00', BASE_SAME: 5.7 }])
    if (url.includes('getTopicZTPool')) return JSON.stringify(pool(3, [{ lbc: 2 }, { lbc: 5 }, { zttj: { days: 4 } }]))
    if (url.includes('getTopicDTPool')) return JSON.stringify(pool(1, []))
    if (url.includes('getTopicZBPool')) return JSON.stringify(pool(4, []))
    if (url.includes('cffex.com.cn')) return CFFEX_CSV
    if (url.includes('hkex.com.hk')) return HKEX_JS
    throw new Error('未知 URL：' + url.slice(0, 80))
  }
  return async (url) => {
    for (const [pattern, value] of Object.entries(overrides)) {
      if (url.includes(pattern)) {
        if (value instanceof Error) throw value
        return typeof value === 'function' ? value(url) : value
      }
    }
    const value = stub(url)
    return typeof value === 'string' ? value : JSON.stringify(value)
  }
}

const KEYS = ['cnAmount', 'cnVolumeRatio', 'cnTurnover', 'cnMarginBalance', 'cnMarginRatio', 'cnMarginYoy', 'cnMarginBuyShare',
  'cnTenYear', 'cnShibor3m', 'cnLpr1y', 'cnM1Yoy', 'cnM2Yoy', 'cnM1M2', 'cnPmi', 'cnPpi',
  'cnLimitUp', 'cnLimitDown', 'cnBrokenBoards', 'cnSealRate', 'cnMaxBoard',
  'cnIfBasis', 'cnImBasis', 'cnOptionPcr', 'cnNorthTurnover']

test('collectCnMarketData 全来源走通：21 项序列齐全、数值与派生序列正确', async () => {
  const cffexUrls = []
  const read = stubRead({ 'cffex.com.cn': (url) => { cffexUrls.push(url); return CFFEX_CSV } })
  const { snapshot, warnings, sourcesUpdated } = await collectCnMarketData({ series: {} }, {
    read, now: new Date('2026-11-20T12:00:00Z'), backfill: 15,
  })
  assert.deepEqual(cffexUrls[0], 'http://www.cffex.com.cn/sj/hqsj/rtj/202610/30/20261030_1.csv')
  assert.deepEqual(warnings, [])
  assert.equal(sourcesUpdated, 11)
  const { series } = snapshot
  for (const key of KEYS) assert.ok(series[key], key + ' 缺失')
  assert.deepEqual(series.cnAmount.history.at(-1), [LAST, 16000])
  assert.equal(series.cnVolumeRatio.history.at(-1)[1], 1)
  assert.deepEqual(series.cnMarginBalance.history.at(-1), ['2026-11-18', 22378.3])
  assert.deepEqual(series.cnMarginRatio.history.at(-1), ['2026-11-18', 2.52])
  assert.deepEqual(series.cnTurnover.history.at(-1), ['2026-11-18', 1.83])
  assert.deepEqual(series.cnMarginBuyShare.history.at(-1), ['2026-11-18', 6.77])
  assert.deepEqual(series.cnMarginYoy.history[0], ['2026-01-31', 10])
  assert.deepEqual(series.cnTenYear.history, [['2002-01-04', 3.2], ['2026-11-17', 1.59], ['2026-11-18', 1.58]])
  assert.deepEqual(series.cnShibor3m.history.at(-1), ['2026-11-18', 1.4])
  assert.deepEqual(series.cnLpr1y.history, [['2019-08-20', 4.25], ['2026-10-20', 3]])
  assert.deepEqual(series.cnM1Yoy.history.at(-1), ['2026-10-31', 4.4])
  assert.deepEqual(series.cnM2Yoy.history.at(-1), ['2026-10-31', 7.1])
  assert.deepEqual(series.cnM1M2.history.at(-1), ['2026-10-31', -2.7])
  assert.deepEqual(series.cnPmi.history.at(-1), ['2026-10-31', 49.3])
  assert.deepEqual(series.cnPpi.history.at(-1), ['2026-10-31', 5.7])
  for (const day of WEEKDAYS.slice(-15)) {
    assert.deepEqual(series.cnLimitUp.history.find(([d]) => d === day), [day, 3])
    assert.deepEqual(series.cnSealRate.history.find(([d]) => d === day), [day, 42.86])
    assert.deepEqual(series.cnMaxBoard.history.find(([d]) => d === day), [day, 5])
    assert.ok(series.cnIfBasis.history.find(([d]) => d === day), day + ' 缺 IF 基差')
    assert.ok(series.cnImBasis.history.find(([d]) => d === day), day + ' 缺 IM 基差')
    assert.deepEqual(series.cnOptionPcr.history.find(([d]) => d === day), [day, 1.67])
    assert.deepEqual(series.cnNorthTurnover.history.find(([d]) => d === day), [day, 2101.36])
  }
  assert.deepEqual(series.cnIfBasis.history.find(([d]) => d === '2026-11-18'), ['2026-11-18', -30.42])
  assert.deepEqual(series.cnImBasis.history.find(([d]) => d === '2026-11-18'), ['2026-11-18', -40.56])
  assert.equal(series.cnAmount.frequency, '日频')
  assert.equal(series.cnMarginYoy.frequency, '月频')
  assert.ok(series.cnTenYear.source.startsWith('https://yield.chinabond.com.cn'))
})

test('collectCnMarketData 失败保留旧序列并写 refreshError，成功来源清除', async () => {
  const previous = {
    series: {
      cnAmount: { name: '两市成交额', unit: '亿元', source: 'x', scope: 'y', frequency: '日频', history: [['2026-11-18', 1500]], refreshError: '旧错误' },
      cnMarginBalance: { name: '两融余额', unit: '亿元', source: 'x', scope: 'y', frequency: '日频', history: [['2026-11-17', 22000]] },
      cnLimitUp: { name: '涨停家数', unit: '家', source: 'x', scope: 'y', frequency: '日频', history: WEEKDAYS.slice(-15, -1).map((d) => [d, 9]) },
    },
  }
  const netErr = Object.assign(new Error('fetch failed'), { name: 'TypeError' })
  const { snapshot, warnings } = await collectCnMarketData(previous, {
    read: stubRead({ RPTA_RZRQ_LSHJ: netErr, getTopicZTPool: netErr, getTopicDTPool: netErr, getTopicZBPool: netErr }),
    now: new Date('2026-11-20T12:00:00Z'), backfill: 15,
  })
  const { series } = snapshot
  assert.equal(series.cnAmount.refreshError, undefined) // 成功来源清除旧错误
  assert.deepEqual(series.cnAmount.history.at(-1), [LAST, 16000])
  assert.equal(series.cnMarginBalance.refreshError, '来源连接失败')
  assert.deepEqual(series.cnMarginBalance.history, [['2026-11-17', 22000]])
  assert.equal(series.cnMarginRatio, undefined) // 无旧值且无新值 → 跳过
  assert.equal(series.cnLimitUp.refreshError, '来源连接失败')
  assert.equal(series.cnLimitUp.history.length, 14) // 旧 14 天保留，失败不丢历史
  assert.ok(warnings.some((w) => w.includes('两融')))
  assert.ok(warnings.some((w) => w.includes('涨跌停池')))
})

test('collectCnMarketData 官方兜底：push2his 被限流时成交额与中基差收盘走中证/国证', async () => {
  const netErr = Object.assign(new Error('fetch failed'), { name: 'TypeError' })
  let csiRequests = 0
  const read = stubRead({
    'secid=1.000001': netErr, 'secid=0.399106': netErr,
    'secid=1.000300': netErr, 'secid=1.000852': netErr,
    'csindex.com.cn': (url) => {
      csiRequests++
      const code = url.includes('indexCode=000300') ? '000300' : url.includes('indexCode=000852') ? '000852' : '000001'
      return JSON.stringify({
        code: '200',
        data: WEEKDAYS.map((d) => ({ tradeDate: ymdOf(d), indexCode: code, tradingValue: 9600, close: 4000 })),
      })
    },
    'hq.cnindex.com.cn': JSON.stringify({ data: { data: WEEKDAYS.map((d) => [d, 1, 2, 3, 4, 5, 6, '0%', 9800, 1, null]) } }),
  })
  const { snapshot, warnings } = await collectCnMarketData({ series: {} }, { read, now: new Date('2026-11-20T12:00:00Z'), backfill: 15 })
  assert.ok(csiRequests > 0)
  assert.deepEqual(warnings, [])
  assert.deepEqual(snapshot.series.cnAmount.history.at(-1), [LAST, 19400])
  assert.equal(snapshot.series.cnVolumeRatio.history.at(-1)[1], 1)
  assert.deepEqual(snapshot.series.cnIfBasis.history.find(([d]) => d === '2026-11-18'), ['2026-11-18', -30.42])
})

test('collectCnMarketData 10 年期国债：中债主源在、东财补缺失败也能出数', async () => {
  const netErr = Object.assign(new Error('fetch failed'), { name: 'TypeError' })
  const { snapshot, warnings } = await collectCnMarketData({ series: {} }, {
    read: stubRead({ RPTA_WEB_TREASURYYIELD: netErr }),
    now: new Date('2026-11-20T12:00:00Z'), backfill: 15,
  })
  assert.deepEqual(snapshot.series.cnTenYear.history.at(-1), ['2026-11-18', 1.58])
  assert.deepEqual(warnings, [])
})

const ymdOf = (s) => s.replaceAll('-', '')

test('collectCnMarketData 逐日来源跳过已存在日期，无需回补时不动旧序列', async () => {
  const poolHistory = WEEKDAYS.slice(-15).map((d) => [d, 7])
  const previous = {
    series: {
      cnLimitUp: { name: '涨停家数', unit: '家', source: 'x', scope: 'y', frequency: '日频', history: poolHistory },
      cnLimitDown: { name: '跌停家数', unit: '家', source: 'x', scope: 'y', frequency: '日频', history: poolHistory },
      cnBrokenBoards: { name: '炸板家数', unit: '家', source: 'x', scope: 'y', frequency: '日频', history: poolHistory },
      cnMaxBoard: { name: '最高连板', unit: '板', source: 'x', scope: 'y', frequency: '日频', history: poolHistory },
      cnNorthTurnover: { name: '北向', unit: '亿港元', source: 'x', scope: 'y', frequency: '日频', history: WEEKDAYS.slice(-15).map((d) => [d, 1]) },
    },
  }
  let poolRequests = 0, hkexRequests = 0
  const read = stubRead({
    getTopicZTPool: () => { poolRequests++; return JSON.stringify(pool(3, [{ lbc: 2 }])) },
    'hkex.com.hk': () => { hkexRequests++; return HKEX_JS },
  })
  const { snapshot } = await collectCnMarketData(previous, { read, now: new Date('2026-11-20T12:00:00Z'), backfill: 15 })
  assert.equal(poolRequests, 0)
  assert.equal(hkexRequests, 0)
  assert.deepEqual(snapshot.series.cnLimitUp.history.at(-1), [LAST, 7])
})
