import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyIndustryFetchResult, buildRow, canPublish, danjuanSym, decideIndustryFetchResult, histPayload, industryDateQueried,
  industrySlotHasData, marketCloses, mergeHistory, parseCniSnapshot, parseCsiHistory, parseCsiSnapshot,
  parseDanjuanDetail, parseDanjuanHistory, parseIndustryPb, percentile, pickIndustryMetrics, planIndustryFetch,
  slimRow, sourceDate, valuationStatus, windowStart,
} from './jixing-table-lib.mjs'

const target = '2026-11-17'
const dates = new Map([['2026-11-16', 10690.78], [target, 10638.5242]])
const csi = data => ({ code: '200', success: true, data })
const broad = { code: '000300', name: '沪深300', group: 'broad', basis: 'pe', source: 'csi', csiName: '沪深300', snapshot: true }
const cni = { code: '399001', name: '深证成指', group: 'broad', basis: 'pe', source: 'cni' }
const bank = { code: '399986', name: '中证银行', group: 'industry', basis: 'pb', source: 'csi' }

test('日期严格校验紧凑格式、闰日、溢出与尾缀', () => {
  assert.equal(sourceDate('20240229'), '2024-02-29')
  assert.equal(sourceDate(target), target)
  for (const bad of ['', '-', null, '20230229', '2026-11-31', '2026-11-17x', 20261117]) assert.equal(sourceDate(bad), null)
  assert.equal(windowStart('2024-02-29'), '2014-02-28')
  assert.equal(windowStart(target), '2016-11-17')
})

test('百分位用并列平均名次，保留真实零并忽略缺失', () => {
  assert.equal(percentile([1, 2, 2, 3, null, '', '-', NaN], 2), 0.5)
  assert.equal(percentile([1, 2, 2, 2, 3], 1), 0.1)
  assert.equal(percentile([0, 1], 0), 0.25)
  assert.equal(percentile([], 1), null)
  assert.equal(percentile([1], null), null)
})

test('中证 PE 历史只留下指数匹配的真实交易日，排除请求起点补点及无效 PE', () => {
  const item = (tradeDate, peg, indexName = '沪深300') => ({ tradeDate, peg, indexName })
  const body = csi([
    item('20261113', 20), item('20261114', 20), item('20261116', '-'), item('20261116', ''),
    item('20261117', '13.05'), item('20261118', 15), item('20261117', 100, '上证50'), item('20261131', 100),
  ])
  assert.deepEqual(parseCsiHistory(body, broad, '2026-11-13', target, dates), [[target, 13.05, null]])
  assert.deepEqual(parseCsiHistory({ ...body, success: false }, broad, '2026-11-13', target, dates), [])
  assert.deepEqual(parseCsiHistory(csi([item('20261117', 13.05), item('20261117', 13.06)]), broad, '2026-11-13', target, dates), [])
})

test('中证快照校验总日期与行日期，只映射滚动 PE，股息率零有效', () => {
  const row = { tradeDate: '20261117', indexName: '沪深300', pe: 20, peg: '13.05', pb: '', dp: 0 }
  const data = { tradeDate: '20261117', indexValuations: [row, { ...row, indexName: '中证红利', tradeDate: '20261116' }] }
  assert.deepEqual([...parseCsiSnapshot(csi(data), target)], [['沪深300', { date: target, pe: 13.05, pb: null, dp: 0 }]])
  assert.equal(parseCsiSnapshot(csi({ ...data, tradeDate: '20261116' }), target).size, 0)
  assert.equal(parseCsiSnapshot(csi({ ...data, indexValuations: [row, row] }), target).size, 0)
})

test('国证逐日收盘价按严格日期筛选，快照日期与收盘点位均须吻合', () => {
  const quote = (date, close) => [date, null, null, null, null, close]
  const closes = marketCloses({ code: 200, data: { data: [quote(target, '10638.5242'), quote('2026-11-18', 100), quote('2026-11-16', '-'), quote('2026-11-31', 100)] } }, target)
  const overview = { code: 200, data: [{ indexcode: '399001', indexname: '深证成指', closeingPoint: '10638.5242', peStatic: 22.49, peDynamic: 18.7603, pb: 2.11 }] }
  const day = { code: 200, data: Date.parse('2026-11-17T00:00:00+08:00') }
  assert.deepEqual([...closes], [[target, 10638.5242]])
  assert.deepEqual([...parseCniSnapshot(overview, day, target, [cni], new Map([[cni.code, closes]]))], [
    [cni.code, { date: target, pe: 18.7603, pb: 2.11, dp: null }],
  ])
  assert.equal(parseCniSnapshot(overview, day, target, [cni], new Map([[cni.code, new Map([[target, 10690.78]])]])).size, 0)
  assert.equal(parseCniSnapshot(overview, day, '2026-11-18', [cni], new Map([[cni.code, closes]])).size, 0)
})

test('PE/PB 历史按日期排序去重，缺项与未来数据不会覆盖已知记录', () => {
  const existing = [[target, 13.05, 1.28], ['2026-11-16', 13.05, null]]
  const extra = [[target, null, 1.29], [target, 13.06, null], ['2026-11-18', 15, 1.3], ['2026-11-15', 13, 1.2], ['2026-11-31', 1, 1]]
  const expected = [['2026-11-16', 13.05, null], [target, 13.06, 1.29]]
  assert.deepEqual(mergeHistory(existing, extra, target), expected)
  assert.deepEqual(mergeHistory(expected, extra, target), expected)
  assert.deepEqual(existing[0], [target, 13.05, 1.28])
})

test('PE 与 PB 的估值状态分别取指定指标，恰好 30% 与 70% 都是正常', () => {
  assert.equal(valuationStatus('pe', 0.299, 0.9), 'low')
  assert.equal(valuationStatus('pe', 0.701, 0.1), 'high')
  assert.equal(valuationStatus('pb', 0.8, 0.1), 'low')
  assert.equal(valuationStatus('pb', 0.1, 0.8), 'high')
  assert.equal(valuationStatus('pb', 0.5, null), null)
  for (const p of [0.3, 0.7]) assert.equal(valuationStatus('pe', p, null), 'normal')
})

test('表格按近十年逐日样本计算，样本不足时保留起点和数量但不计算 PE/PB 分位', () => {
  const history = [['2016-11-16', 99, 0.1], ['2016-11-17', 10, null], ['2026-11-16', 20, 1], [target, 20, 2]]
  const row = buildRow(bank, target, { date: target, pe: 20, pb: 2, dp: 3 }, history)
  assert.deepEqual(row.peHistory, { since: '2016-11-17', count: 3 })
  assert.deepEqual(row.pbHistory, { since: '2026-11-16', count: 2 })
  assert.equal(row.pePct, null)
  assert.equal(row.pbPct, null)
  assert.equal(row.roe, 0.1)
  assert.equal(row.status, null)
  assert.deepEqual(row.peRefs, [10, 20])
  assert.deepEqual(row.peSeries.at(-1), [target, 20])
})

test('n=1 时 PE 分位与状态均为 null（不给「正常/50%」）', () => {
  const row = buildRow(bank, target, { date: target, pe: 22.5, pb: 2, dp: null }, [[target, 22.5, 2]])
  assert.equal(row.peHistory.count, 1)
  assert.equal(row.pePct, null)
  assert.equal(row.status, null)
  assert.deepEqual(row.peRefs, [22.5, 22.5])
})

test('PB 满 250 个有效交易日才计算并应用分位', () => {
  const days = Array.from({ length: 370 }, (_, i) => new Date(Date.UTC(2024, 0, i + 1)))
    .filter(d => ![0, 6].includes(d.getUTCDay())).slice(0, 249).map(d => [d.toISOString().slice(0, 10), 20, 1])
  const current = { date: target, pe: 20, pb: 2, dp: null }
  const peReady = [...days, [target, 20, 2]] // 249 + 当日 = 250
  assert.equal(buildRow(bank, target, current, peReady).peHistory.count, 250)
  assert.ok(Number.isFinite(buildRow(bank, target, current, peReady).pePct))
  assert.equal(buildRow(bank, target, current, peReady).status, 'high')
  assert.equal(buildRow(bank, target, current, [...days.slice(1), [target, 20, 2]]).status, null)
})

test('发布时拒绝错日、缺指数、缺预期字段、同日重跑和历史回跑', () => {
  const indices = [broad, cni]
  const ready = new Map([[broad.code, { date: target, pe: 13.05, pb: 1.28, dp: 3.05 }], [cni.code, { date: target, pe: 18.76, pb: 2.11, dp: null }]])
  assert.equal(canPublish(null, target, indices, ready), true)
  assert.equal(canPublish('2026-11-16', target, indices, ready), true)
  assert.equal(canPublish(target, target, indices, ready), false)
  assert.equal(canPublish('2026-11-18', target, indices, ready), false)
  assert.equal(canPublish(null, target, indices, new Map([[broad.code, ready.get(broad.code)]])), false)
  assert.equal(canPublish(null, target, indices, new Map(ready).set(broad.code, { ...ready.get(broad.code), pb: null })), false)
  assert.equal(canPublish(null, target, indices, new Map(ready).set(cni.code, { ...ready.get(cni.code), date: '2026-11-16' })), false)
})

test('行业市盈率按 codes 优先级取 PB，错日不取；新代码优先旧代码回退', () => {
  const child = (code, name, pe, children = []) => ({ industryCode: code, industryName: name, pe, children })
  const body = {
    code: '200',
    data: {
      tradeDate: '20261117',
      csipeindustryMapList: {
        3: [child('40', '金融', '0.72', [child('4010', '银行', '0.63')])],
        4: [child('40', '金融', '4.1', [child('4010', '银行', '5.2')])],
      },
    },
  }
  const parsed = parseIndustryPb(body, target, { '399986': { name: '银行', codes: ['4010', '0601'] } })
  assert.deepEqual([...parsed], [['399986', { pb: 0.63, dp: 5.2, industryCode: '4010', industryName: '银行' }]])
  assert.equal(parseIndustryPb(body, '2026-11-16', { '399986': { name: '银行', codes: ['4010'] } }).size, 0)
  const oldOnly = {
    code: '200',
    data: {
      tradeDate: '20180105',
      csipeindustryMapList: {
        3: [child('0603', '资本市场', '1.3', [child('06030102', '投资银行业与经纪业', '1.29')])],
        4: [],
      },
    },
  }
  const legacy = parseIndustryPb(oldOnly, '2018-01-05', { '399975': { name: '证券公司', codes: ['403010', '06030102'] } })
  assert.deepEqual([...legacy], [['399975', {
    pb: 1.29, dp: null, industryCode: '06030102', industryName: '投资银行业与经纪业',
  }]])
  assert.equal(pickIndustryMetrics(oldOnly.data.csipeindustryMapList['3'], ['403010', '06030102'])?.code, '06030102')
})

test('行业 PB 行：ROE/股息率不混口径；分位用周采样；hist 含 PB 序列与参考线', () => {
  // 约 6 年交易日 → 周采样后仍 ≥ 250
  const history = Array.from({ length: 2200 }, (_, i) => new Date(Date.UTC(2018, 0, i + 1)))
    .filter(d => ![0, 6].includes(d.getUTCDay()))
    .slice(0, 1600)
    .map((d, i) => [d.toISOString().slice(0, 10), 20, 1 + (i % 5) * 0.01])
  history[history.length - 1] = [target, 20, 0.63]
  const row = buildRow({ ...bank, pbIndustry: { name: '银行', codes: ['4010'] } }, target, {
    date: target, pe: 20, pb: 0.63, dp: 5, industryCode: '4010', industryName: '银行',
  }, history)
  assert.equal(row.pbKind, 'industry')
  assert.equal(row.pbIndustry.name, '银行')
  assert.equal(row.roe, null)
  assert.equal(row.dp, null)
  assert.equal(row.status, 'low')
  assert.ok(row.pbHistory.count >= 250)
  assert.equal(slimRow(row).peSeries.length, 0)
  assert.ok(histPayload(row).peSeries.length > 0)
  assert.ok(histPayload(row).pbSeries.length > 0)
  assert.ok(histPayload(row).pbRefs[0] > 0)
})

test('行业 PB 待抓计划：目标日优先；空列表且日期=请求日不算已查，下次仍含 target（B1\'）', () => {
  const byDate = Object.fromEntries(
    Array.from({ length: 200 }, (_, i) => {
      const d = new Date(Date.UTC(2014, 0, 3 + i * 7)).toISOString().slice(0, 10)
      return [d, { '399986': { pb: 0.7 } }] // 部分行业，但已查询
    }),
  )
  assert.equal(industryDateQueried({ byDate }, Object.keys(byDate)[0]), true)
  assert.equal(industryDateQueried({ byDate }, target), false)
  const planned = planIndustryFetch({ byDate }, target, { recent: 10, extra: Object.keys(byDate) })
  assert.equal(planned[0], target)
  assert.ok(planned.includes(target))
  // extra（rebuild 周采样）空槽仍算已查，不进计划；近窗有数据的日期也不进
  assert.equal(planned.some(d => industrySlotHasData(byDate[d])), false)

  // B1'：空列表且日期等于请求日 → 不锁死；下次计划仍含 target
  const emptySameDay = { byDate: { ...byDate, [target]: {} } }
  assert.equal(industryDateQueried(emptySameDay, target, { emptyCounts: false }), false)
  assert.equal(industrySlotHasData(emptySameDay.byDate[target]), false)
  const afterEmpty = planIndustryFetch(emptySameDay, target, { recent: 3 })
  assert.ok(afterEmpty.includes(target), '空槽同日未发布，下次仍应抓 target')

  // 休市回退写成的 {}：extra 路径仍视为已查；近窗 emptyCounts=false 会重抓——这是刻意（近 N 日可补）
  const holidayEmpty = { byDate: { [target]: {} } }
  assert.equal(industryDateQueried(holidayEmpty, target, { emptyCounts: true }), true)
  assert.equal(industryDateQueried(holidayEmpty, target, { emptyCounts: false }), false)
})

test('早班未发布 → 晚班补到当天：同日空不写，有数据后写入且不再进计划', () => {
  const store = { version: 1, byDate: {} }
  const emptyBody = {
    code: '200',
    data: {
      tradeDate: target.replaceAll('-', ''),
      csipeindustryMapList: { 3: [], 4: [], 5: [], 6: [] },
    },
  }
  const morning = decideIndustryFetchResult(target, emptyBody)
  assert.equal(morning.action, 'pending')
  assert.equal(morning.slot, null)
  applyIndustryFetchResult(store, target, emptyBody)
  assert.equal(Object.prototype.hasOwnProperty.call(store.byDate, target), false)
  assert.ok(planIndustryFetch(store, target, { recent: 0 }).includes(target))

  const eveningBody = {
    code: '200',
    data: {
      tradeDate: target.replaceAll('-', ''),
      csipeindustryMapList: {
        3: [{ industryCode: '4010', industryName: '银行', pe: '0.63', children: [] }],
        4: [{ industryCode: '4010', industryName: '银行', pe: '5', children: [] }],
      },
    },
  }
  const evening = applyIndustryFetchResult(store, target, eveningBody)
  assert.equal(evening.action, 'wrote')
  assert.ok(industrySlotHasData(store.byDate[target]))
  assert.equal(store.byDate[target]['399986']?.pb, 0.63)
  assert.ok(!planIndustryFetch(store, target, { recent: 0 }).includes(target))

  // 休市回退：tradeDate ≠ 请求日 → 记 {}
  const holidayReq = '2026-11-15' // 周日附近用任意日，只测决策
  const holidayBody = {
    code: '200',
    data: {
      tradeDate: '20261114',
      csipeindustryMapList: { 3: [], 4: [], 5: [], 6: [] },
    },
  }
  const holiday = applyIndustryFetchResult(store, holidayReq, holidayBody)
  assert.equal(holiday.action, 'holiday')
  assert.deepEqual(store.byDate[holidayReq], {})
})

test('蛋卷详情须同日且 pe 为正；历史按北京日合并 pe/pb', () => {
  assert.equal(danjuanSym('399006'), 'SZ399006')
  assert.equal(danjuanSym('000300'), 'SH000300')
  const ts = Date.parse(`${target}T00:00:00+08:00`)
  assert.deepEqual(
    parseDanjuanDetail({ result_code: 0, data: { ts, pe: 24.03, pb: 2.16 } }, target),
    { date: target, pe: 24.03, pb: 2.16, dp: null },
  )
  assert.equal(parseDanjuanDetail({ result_code: 0, data: { ts, pe: 24.03 } }, '2026-11-16'), null)
  assert.equal(parseDanjuanDetail({ result_code: 1, data: { ts, pe: 24.03 } }, target), null)
  const peBody = { data: { index_eva_pe_growths: [{ ts, pe: 24.03 }, { ts: Date.parse('2026-11-16T00:00:00+08:00'), pe: 24.12 }] } }
  const pbBody = { data: { index_eva_pb_growths: [{ ts, pb: 2.16 }, { ts: Date.parse('2026-11-16T00:00:00+08:00'), pb: 2.2 }] } }
  assert.deepEqual(parseDanjuanHistory(peBody, pbBody, target), [
    ['2026-11-16', 24.12, 2.2],
    [target, 24.03, 2.16],
  ])
})
