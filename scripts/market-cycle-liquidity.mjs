// Index turnover is not interchangeable with the whole-market turnover carried by hkHSI.
// Tencent hkHSTECH day[5] was checked against HSI's official Index Performance Summary:
// 2026-10-14/15/16: HKD Mn 53172 / 58698 / 40120 (official rounds to whole millions).
export const TURNOVER_URLS = {
  hsi: 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=hkHSI,day,,,400,qfq',
  hstech: 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=hkHSTECH,day,,,400,qfq',
}
const dateOK = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
const add = (date, days) => new Date(Date.parse(date) + days * 864e5).toISOString().slice(0, 10)
const monday = date => add(date, -((new Date(date).getUTCDay() + 6) % 7))
export function parseTencentIndexTurnover(body, symbol) {
  if (!['HSI', 'HSTECH'].includes(symbol) || body?.code !== 0) throw new Error('腾讯指数响应无效')
  const code = `hk${symbol}`, data = body.data?.[code], quote = data?.qt?.[code]
  if (quote?.[2] !== symbol || quote?.[75] !== 'HKD' || !Array.isArray(data?.day) || !data.day.length) throw new Error('腾讯指数身份/港元单位/日线无效')
  const rows = []
  let prior = ''
  for (const row of data.day) {
    if (!Array.isArray(row) || row.length !== 6 || !dateOK(row[0]) || row[0] <= prior || ![1, 2, 3, 4, 5].includes(new Date(row[0]).getUTCDay())) throw new Error('腾讯交易日乱序/重复/无效')
    if (typeof row[5] !== 'string' || !/^\d+(?:\.\d+)?$/.test(row[5]) || !(Number(row[5]) > 0) || !Number.isFinite(Number(row[5]))) throw new Error('腾讯成交额无效')
    prior = row[0]
    rows.push({ date: row[0], amount: Number(row[5]) })
  }
  return rows
}
/** Previous calendar week only. The baseline is exactly the preceding 52 calendar weeks,
 * divided by actual trading sessions, not by an assumed five-day week or 252-day year.
 * Reference dates come from a second HK index response, so a missing target session fails closed. */
export function computeWeeklyTurnoverRatio(rows, calendarDates, asOf) {
  if (!dateOK(asOf)) throw new Error('观察日无效')
  const currentMonday = monday(asOf), weekday = new Date(asOf).getUTCDay()
  // The automated run can happen before the Friday close, so never confirm a week on Friday.
  // Saturday/Sunday may use the week that ended; weekdays use the prior calendar week.
  const weekStart = weekday === 0 || weekday === 6 ? currentMonday : add(currentMonday, -7)
  const weekEnd = add(weekStart, 6), baselineStart = add(weekStart, -364)
  if (!rows.length || rows[0].date > baselineStart || !calendarDates.length || calendarDates[0] > baselineStart) throw new Error('历史不足前52周')
  const expected = calendarDates.filter(d => d >= baselineStart && d <= weekEnd)
  if (new Set(expected).size !== expected.length || expected.some(d => !dateOK(d))) throw new Error('参考交易日历重复/无效')
  const points = rows.filter(r => r.date >= baselineStart && r.date <= weekEnd)
  const lookup = new Map(points.map(r => [r.date, r.amount]))
  if (lookup.size !== points.length || expected.some(d => !lookup.has(d)) || points.some(r => !expected.includes(r.date))) throw new Error('指数与参考交易日不一致')
  if (points.some(r => typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount <= 0)) throw new Error('成交额非正数')
  // Require all 52 calendar weeks represented. Holiday weeks have fewer real sessions, never synthetic zeroes.
  const baseline = points.filter(r => r.date < weekStart), week = points.filter(r => r.date >= weekStart)
  if (new Set(baseline.map(r => monday(r.date))).size !== 52 || baseline.length < 200 || !week.length) throw new Error('完整52周交易日覆盖不足')
  if (week[week.length - 1].date < add(weekStart, 3)) throw new Error('完整周缺少周末行情确认')
  const avg = list => list.reduce((sum, r) => sum + r.amount, 0) / list.length
  return { value: avg(week) / avg(baseline), observationDate: week.at(-1).date, weekStart, weekEnd, baselineStart, baselineEnd: add(weekStart, -1), days: week.length, baselineDays: baseline.length, weekDailyAverage: avg(week), baselineDailyAverage: avg(baseline) }
}
export async function collectHkLiquidity(ctx) {
  try {
    const techBody = await ctx.get(TURNOVER_URLS.hstech)
    const hsiBody = await ctx.get(TURNOVER_URLS.hsi)
    const tech = parseTencentIndexTurnover(techBody, 'HSTECH'), calendar = parseTencentIndexTurnover(hsiBody, 'HSI').map(r => r.date)
    const result = computeWeeklyTurnoverRatio(tech, calendar, ctx.now.slice(0, 10))
    if (result.observationDate > ctx.now.slice(0, 10) || (Date.parse(ctx.now.slice(0, 10)) - Date.parse(result.observationDate)) / 864e5 > 14) throw new Error('完整周观测超过14天')
    return [{ metricId: 'turnover_ratio_52w', market: 'hstech', value: Number(result.value.toFixed(6)), observationDate: result.observationDate, source: TURNOVER_URLS.hstech, unit: '倍', kind: 'observed', frequency: 'weekly',
      description: `恒生科技指数成交额（腾讯hkHSTECH day第6列，港元；与恒生官方Index Performance Summary的Index Turnover(Mn)核对2026-10-14/15/16吻合，非全港股成交额）；完整周${result.weekStart}~${result.weekEnd}共${result.days}个真实交易日，日均${(result.weekDailyAverage / 1e8).toFixed(2)}亿港元；基准为此前52个日历周${result.baselineStart}~${result.baselineEnd}，${result.baselineDays}个真实交易日，日均${(result.baselineDailyAverage / 1e8).toFixed(2)}亿港元，排除当前周；与恒指交易日历逐日交叉校验。官方核验来源：https://www.hsi.com.hk/en-hk/index-resources/index-reports/` }]
  } catch (e) { ctx.issue(`hstech-liquidity: ${e instanceof Error ? e.message : String(e)}`); return [] }
}
