// 三市场交易日：周末 + 已公布的休市日。没有列出的年份或市场只排除周末（宁可多报一天滞后，不猜假期）。
// 仅供监控/统计用；落盘与补档仍以接口返回的实际行情日期为准（docs/data-maintenance.md「如何判断过期」）。

/** 上交所 2026 休市通知（与 src/services/limitUp.ts 同源）：
 * https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml */
const CN_CLOSED = [
  ['2026-01-01', '2026-01-03'], ['2026-02-15', '2026-02-23'], ['2026-04-04', '2026-04-06'],
  ['2026-05-01', '2026-05-05'], ['2026-06-19', '2026-06-21'], ['2026-09-25', '2026-09-27'], ['2026-10-01', '2026-10-07'],
]
/** NYSE 2026 全日休市（按交易所固定规则：元旦、MLK、总统日、耶稣受难日、阵亡将士、六月节、独立日补休、劳动节、感恩节、圣诞） */
const US_CLOSED = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
].map(d => [d, d])

/** 每个市场：时区、收盘后多久才认为当天行情应已落地（含采集任务时间余量）、休市日 */
export const MARKETS = {
  cn: { tz: 'Asia/Shanghai', readyAfter: '18:00', closed: CN_CLOSED },
  // 港交所 2026 假期表未在仓库内核实，暂只排除周末
  hk: { tz: 'Asia/Hong_Kong', readyAfter: '19:10', closed: [] },
  us: { tz: 'America/New_York', readyAfter: '19:00', closed: US_CLOSED },
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 自然日差：b − a（a、b 为 YYYY-MM-DD） */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

function marketOf(market) {
  const m = MARKETS[market]
  if (!m) throw new Error(`未知市场 ${market}`)
  return m
}

export function isTradingDay(market, date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  if (day === 0 || day === 6) return false
  return !marketOf(market).closed.some(([from, to]) => date >= from && date <= to)
}

/** 某一时刻在指定时区的本地日期与 HH:MM */
export function localParts(now, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

export function previousTradingDay(market, date) {
  let d = addDays(date, -1)
  while (!isTradingDay(market, d)) d = addDays(d, -1)
  return d
}

/** 截至 now 应已落地的最近一个交易日：当天是交易日且本地时间过了 readyAfter 才算当天 */
export function latestReadySession(market, now = new Date(), readyAfter = marketOf(market).readyAfter) {
  const { date, time } = localParts(now, marketOf(market).tz)
  if (isTradingDay(market, date) && time >= readyAfter) return date
  return previousTradingDay(market, date)
}

/** from 之后（不含）到 to（含）之间的交易日数；from ≥ to 时为 0 */
export function tradingDaysBetween(market, from, to) {
  if (!ISO.test(from) || !ISO.test(to)) throw new Error(`日期格式无效 ${from} / ${to}`)
  let n = 0
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isTradingDay(market, d)) n++
  return n
}

/** to 往前（含 to）最近 count 个交易日，降序 */
export function recentTradingDays(market, to, count) {
  const out = []
  for (let d = to; out.length < count; d = addDays(d, -1)) if (isTradingDay(market, d)) out.push(d)
  return out
}
