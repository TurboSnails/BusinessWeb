// 虚构数据验证星级公式、滚动窗口与日期门禁，不把测试数据当公开快照。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STAR, STEP, bandOf, parsePerfSeries, parseMarketVal, treasuryMap, pctRank, rolling, buildStarRows, pickAsOf, buildStarData, weeklyRows, addYears,
  applyNeutralIndustry, buildNeutralData, buildNeutralRow, neutralScore, planNeutralIndustryDates, parseNeutralIndustry, NEUTRAL_INDUSTRIES, staleStarMessage,
} from './jixing-star-lib.mjs'

/** 生成连续工作日（不含周末）。 */
function weekdays(from, n) {
  const out = []
  let t = Date.parse(`${from}T00:00:00Z`)
  while (out.length < n) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); t += 864e5 }
  return out
}

test('分位定义：(低于 + 0.5 × 相等) / n', () => {
  assert.equal(pctRank([1, 2, 3, 4], 3), 62.5)
  assert.equal(pctRank([2, 2, 2, 2], 2), 50)
  assert.equal(pctRank([1, 2, 3, 4], 0), 0)
})

test('星级区间文字与 1 星 = 估值下跌 20%', () => {
  assert.equal(bandOf(5.9), '估值很低'); assert.equal(bandOf(4.0), '部分低估'); assert.equal(bandOf(3.9), '正常偏低')
  assert.equal(bandOf(2.0), '偏高'); assert.equal(bandOf(1.0), '很高'); assert.equal(bandOf(null), null)
  assert.ok(Math.abs(Math.log(1 / 0.8) / STEP - 1) < 1e-12)
  assert.equal(STAR.center, (STAR.min + STAR.max) / 2)
})

test('中证行情：周末与节假日复制行去掉，负 PE 视为缺失', () => {
  const body = { code: '200', data: [['20261113', 10, 12, 5], ['20261114', 10, 12, 5], ['20261116', 10, 12, 5], ['20261117', 11, -3, 6]].map(([tradeDate, close, peg, tradingVol]) => ({ tradeDate, close, peg, tradingVol })) }
  const rows = parsePerfSeries(body)
  assert.deepEqual(rows.map(r => r.date), ['2026-11-13', '2026-11-17'])
  assert.equal(rows[1].pe, null)
  assert.throws(() => parsePerfSeries({ code: '500', data: [] }))
})

test('板块 PB：日期必须对上，当日数值为空 = 未发布', () => {
  const body = (td, pb) => ({ code: '200', data: { tradeDate: td, csipeindustryMapList: { 2: [{ industryName: '沪深市场', pe: '16.26' }], 3: pb === undefined ? [] : [{ industryName: '沪深市场', pe: pb }], 4: [{ industryName: '沪深市场', pe: '2.14' }] } } })
  assert.deepEqual(parseMarketVal(body('20261117', '1.58'), '2026-11-17'), { status: 'ok', pb: 1.58, pe: 16.26, dp: 2.14 })
  assert.equal(parseMarketVal(body('20261118'), '2026-11-18').status, 'pending')
  assert.equal(parseMarketVal(body('20261118', '-'), '2026-11-18').status, 'pending')
  assert.equal(parseMarketVal(body('20240208', '1.36'), '2024-02-10').status, 'other-day')
  assert.equal(parseMarketVal({ code: '500' }, '2026-11-17').status, 'error')
})

test('国债：只收有限值，按日期取', () => {
  const m = treasuryMap([{ SOLAR_DATE: '2026-11-17 00:00:00', EMM00166466: 1.6 }, { SOLAR_DATE: '2026-11-16 00:00:00', EMM00166466: null }])
  assert.equal(m.get('2026-11-17'), 1.6); assert.equal(m.has('2026-11-16'), false)
})

test('滚动统计：只看过去、窗口 10 年、历史不足 3 年为 null', () => {
  const days = weekdays('2010-01-04', 260 * 14)
  const s = days.map((date, i) => ({ date, v: i === 5 ? null : 10 + (i % 7) }))
  const r = rolling(s)
  assert.equal(r[100], null) // 不足 3 年
  const i3 = days.findIndex(d => d > addYears(days[0], 3))
  assert.ok(r[i3] && r[i3].start === days[0])
  const last = r.at(-1)
  assert.ok(last.start > addYears(days.at(-1), -10)) // 窗口不超过 10 年
  assert.equal(r[5], null) // 当日缺值
  // 不看未来：改动未来数据不影响过去的结果
  const s2 = s.map((p, i) => (i > i3 ? { ...p, v: 99 } : p))
  assert.deepEqual(rolling(s2)[i3], r[i3])
})

function scenario({ factor = 1, pbFrom = 0 } = {}) {
  const days = weekdays('2011-01-03', 260 * 8)
  const perf = days.map((date, i) => ({ date, close: 100, pe: i === days.length - 1 ? 15 * factor : 15 + Math.sin(i / 50), amount: 1 }))
  const pb = Object.fromEntries(days.filter((_, i) => i >= pbFrom).map((d, i) => [d, days.indexOf(d) === days.length - 1 ? 1.5 * factor : 1.5 + Math.sin(i / 40) / 10]))
  const y10 = new Map(days.map(d => [d, 3]))
  return { days, perf, pb, y10 }
}

test('星级：等于中位数 ≈ 中心；估值低 20% ≈ +1 星；截断在 1.0–5.9', () => {
  const base = scenario()
  const rows = buildStarRows(base)
  const last = rows.at(-1)
  assert.deepEqual(last.inputs, ['pe', 'pb', 'erp'])
  assert.ok(Math.abs(last.raw - STAR.center) < 0.35, `raw ${last.raw}`)
  const cheap = buildStarRows(scenario({ factor: 0.8 })).at(-1)
  assert.ok(Math.abs(cheap.sPe - (1 + last.sPe)) < 0.05, `sPe ${cheap.sPe}`)
  assert.ok(Math.abs(cheap.sPb - (1 + last.sPb)) < 0.05)
  assert.ok(cheap.raw - last.raw > 0.8 && cheap.raw - last.raw < 1.4, `diff ${cheap.raw - last.raw}`)
  assert.equal(buildStarRows(scenario({ factor: 0.2 })).at(-1).star, 5.9)
  assert.equal(buildStarRows(scenario({ factor: 4 })).at(-1).star, 1.0)
})

test('星级：某项历史够长后必须参与，当天缺该项则为 null；PB 记 null 的日子整天去掉', () => {
  const sc = scenario({ pbFrom: 300 })
  const last = sc.days.at(-1)
  delete sc.pb[last]
  const rows = buildStarRows(sc)
  assert.equal(rows.at(-1).star, null)
  assert.equal(pickAsOf(rows, last), rows.length - 2)
  const sc2 = scenario(); sc2.pb[sc2.days[2000]] = null
  assert.equal(buildStarRows(sc2).some(r => r.date === sc2.days[2000]), false)
  // 早期 PB 历史不足 3 年时只用两项
  const early = buildStarRows(scenario({ pbFrom: 300 })).find(r => r.star !== null)
  assert.deepEqual(early.inputs, ['pe', 'erp'])
})

test('数据日：不晚于 candidate，且三项当日齐全；组装文件', () => {
  const sc = scenario()
  sc.y10.delete(sc.days.at(-1))
  const rows = buildStarRows(sc)
  const idx = pickAsOf(rows, sc.days.at(-1))
  assert.equal(rows[idx].date, sc.days.at(-2))
  assert.equal(pickAsOf(rows, '2000-01-01'), -1)
  const d = buildStarData(rows, idx)
  assert.equal(d.asOf, sc.days.at(-2)); assert.equal(d.prevDate, sc.days.at(-3))
  assert.equal(d.history.at(-1)[0], d.asOf)
  assert.ok(d.history.every(p => p[0] <= d.asOf))
  assert.equal(d.change, Math.round((d.star - d.prevStar) * 10) / 10)
  assert.ok(d.inputs.pe.pct >= 0 && d.inputs.pe.pct <= 100 && d.inputs.pe.n > 0)
  assert.equal(d.checks.length, 9)
  assert.equal(d.band, bandOf(d.star))
})

test('周采样：每周最后一个交易日', () => {
  const rows = weekdays('2026-11-02', 10).map(date => ({ date }))
  assert.deepEqual(weeklyRows(rows).map(r => r.date), ['2026-11-06', '2026-11-13'])
})

const industryRow = (industryCode, pe, level = '1') => ({ industryCode, level, pe })
const industryBody = (tradeDate, pe, pb) => ({ code: '200', data: { tradeDate, csipeindustryMapList: { 2: pe, 3: pb } } })

test('行业中性只读一级并衔接新旧行业代码，跳过金融和房地产', () => {
  const rows = [
    industryRow('00', 11), industryRow('06', 1), industryRow('60', 2), industryRow('40', 2),
    industryRow('08', '32'), industryRow('02', '-3'), industryRow('05', 0), industryRow('45', 3, '2'),
  ]
  const pb = rows.map(r => ({ ...r, pe: 2 }))
  assert.deepEqual(parseNeutralIndustry(industryBody('20211209', rows, pb), '2021-12-09'), {
    10: [11, 2], 20: [null, 2], 35: [null, 2], 50: [32, 2],
  })
  assert.deepEqual(parseNeutralIndustry(industryBody('20211210', [industryRow('50', '21')], [industryRow('50', '3.0')]), '2021-12-10'), {
    50: [21, 3],
  })
})

test('行业估值未发布时不写库存，目标日和前十个交易日可重试', () => {
  const store = {}
  const date = '2026-11-18'
  const dates = weekdays('2026-10-26', 17)
  assert.equal(planNeutralIndustryDates(store, date, dates).length, 11)
  assert.equal(planNeutralIndustryDates(store, date, dates, true).includes('2015-06-12'), true)
  const values = [industryRow('10', 12)]
  assert.equal(applyNeutralIndustry(store, date, industryBody('20261118', [], [])), false)
  assert.equal(applyNeutralIndustry(store, date, industryBody('20261118', values, [])), false)
  assert.equal(applyNeutralIndustry(store, date, industryBody('20261117', values, values)), false)
  assert.deepEqual(store, {})
  assert.equal(planNeutralIndustryDates(store, date, dates)[0], date)
  assert.equal(applyNeutralIndustry(store, date, industryBody('20261118', values, values)), true)
  assert.equal(planNeutralIndustryDates(store, date, dates).includes(date), true)
  const full = NEUTRAL_INDUSTRIES.map(({ code }) => industryRow(code, 14))
  assert.equal(applyNeutralIndustry(store, date, industryBody('20261118', full, full)), true)
  assert.equal(planNeutralIndustryDates(store, date, dates).includes(date), false)
  assert.equal(applyNeutralIndustry(store, date, industryBody('20261118', values, values)), false)
  assert.equal(Object.keys(store[date]).length, 9)
})

const previousWeeks = (date, count, values) => Array.from({ length: count }, (_, index) => ({
  date: new Date(Date.parse(date) - (count - index) * 7 * 864e5).toISOString().slice(0, 10),
  values,
}))

test('行业分位按近十年周样本计算，同一周多个点只留截至目标日最后一个', () => {
  const rows = [
    { date: '2014-01-03', values: { 10: [20, 2] } },
    { date: '2016-11-18', values: { 10: [50, 5] } }, // 窗口左端不含
    ...previousWeeks('2026-11-13', 154, { 10: [20, 2] }),
    { date: '2026-11-09', values: { 10: [999, 100] } },
    { date: '2026-11-13', values: { 10: [20, 1], 15: [90, 1] } },
    { date: '2026-11-17', values: { 10: [999, 100] } },
    { date: '2026-11-18', values: { 10: [20, 2], 15: [95, null], 20: [10, 2] } },
    { date: '2026-11-20', values: { 10: [1, 1] } }, // 目标日后
  ]
  const current = buildNeutralRow(rows, '2026-11-18')
  const start = rows[2].date
  assert.deepEqual(current.industries[0].pe, { value: 20, pct: 50, start, n: 156 })
  assert.deepEqual(current.industries[0].pb, { value: 2, pct: (1 + 0.5 * 155) / 156 * 100, start, n: 156 })
  assert.deepEqual(current.industries[1].pb, { value: null, pct: null, start: '2026-11-13', n: 1 })
  assert.equal(current.industries[2].pe.pct, null)
  assert.equal(current.count, 1)
  assert.equal(current.star, 3.4)
})

test('PE 和 PB 分别满 156 周才计入，不足时保留样本信息', () => {
  const target = '2026-11-13'
  const rows = previousWeeks(target, 155, { 10: [20, 2], 15: [20, null] })
  rows[1].values = { 10: [20, 2], 15: [20, 1] }
  const store = Object.fromEntries(rows.map(({ date, values }) => [date, values]))
  assert.equal(buildNeutralData(store, target, () => '2026-11-12'), null)
  const data = buildNeutralData({ ...store, [target]: { 10: [20, 2], 15: [20, 2] } }, target, () => '2026-11-12')
  assert.deepEqual(data.history, [[target, 3.5, 1]])
  assert.equal(data.industries[1].pe.n, 156)
  assert.equal(data.industries[1].pb.n, 2)
  assert.equal(data.industries[1].cheapness, null)
})

test('缓存落后超过两个交易日时报告原因，休市与周末不计入', () => {
  assert.equal(staleStarMessage('行业中性', '2026-09-30', '2026-10-09', '未发布'), null)
  assert.match(staleStarMessage('行业中性', '2026-09-29', '2026-10-09', '未发布'), /2026-09-29.*超过 2 个交易日：未发布/)
  assert.match(staleStarMessage('中证全指', null, '2026-10-09', 'HTTP 403'), /缺少已发布星级.*HTTP 403/)
})

test('市场便宜度对有数据的行业等权，原始星级不先截断', () => {
  assert.deepEqual(neutralScore([{ cheapness: null }]), { count: 0, cheapness: null, raw: null, star: null })
  assert.deepEqual(neutralScore([{ cheapness: 0 }, { cheapness: null }, { cheapness: 1 }]), { count: 2, cheapness: 0.5, raw: 3.45, star: 3.5 })
  assert.equal(neutralScore([{ cheapness: 0 }]).star, 1)
  assert.equal(neutralScore([{ cheapness: 1 }]).star, 5.9)
})

test('历史每周一行，近日报价缺一项时仍取最后一个有星级的交易日', () => {
  const seed = previousWeeks('2026-11-13', 155, { 10: [15, 3] })
  const data = buildNeutralData({
    ...Object.fromEntries(seed.map(({ date, values }) => [date, values])),
    '2026-11-12': { 10: [16, 3] },
    '2026-11-13': { 10: [15, 3] },
    '2026-11-16': { 10: [10, 2] },
    '2026-11-17': { 10: [11, 2] },
    '2026-11-18': { 10: [10, null] },
  }, '2026-11-18', () => '2026-11-16')
  assert.equal(data.asOf, '2026-11-17')
  assert.equal(data.prevDate, '2026-11-16')
  assert.equal(data.prevStar, 5.9)
  assert.deepEqual(data.history, [['2026-11-13', 3.5, 1], ['2026-11-17', 5.9, 1]])
  assert.equal(data.checks.at(-1).star, null)
})
