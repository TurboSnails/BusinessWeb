// 开盘啦「人气排行」页签（/market-mood/rank）的纯计算。功能对照开盘啦 App 的人气榜、区间排行榜、板块多日统计 / 领涨次数、机构榜多日统计。
// 数据全部来自公开接口，口径与开盘啦不同的地方在页面上写明：
//   人气榜      东方财富股吧人气排名（emappdata.eastmoney.com/stockrank：当前前 100、飙升榜、个股每日排名历史），不是开盘啦人气值
//   个股区间    东财 clist 区间字段（已用日 K / 资金流日线逐项核对：f127/f109/f160/f110/f24 = 3/5/10/20/60 日涨幅，
//               f267/f164/f174 = 3/5/10 日主力净额）；净流入天数用资金流日线（带日期）自己数
//   板块区间    东财板块资金流日线 push2his fflow/daykline（带日期，每根含主力净额、收盘、涨跌幅）
//   机构多日    已落盘的龙虎榜明细 data-raw/kpl-lhb/days（scripts/kpl-lhb.mjs 生成），机构专用席位自行汇总
// 只做盘后统计，不构成投资建议。
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import { isByType, primaryEntries, uniqueSeats } from './kpl-lhb-lib.mjs'

/** null / 空串 / '-' / 非数字一律视为缺失（null），不能当 0 */
export const num = (x) => (x === null || x === undefined || typeof x === 'boolean' || ['', '-'].includes(String(x).trim()) || !Number.isFinite(Number(x)) ? null : Number(x))
const str = (x) => (typeof x === 'string' && x.trim() && x.trim() !== '-' ? x.trim() : null)
export const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
const sumKnown = (xs) => { const v = xs.filter((x) => x !== null && Number.isFinite(x)); return v.length ? Math.round(v.reduce((s, x) => s + x, 0)) : null }

export const STOCK_WINDOWS = [
  { days: 3, field: 'f127' }, { days: 5, field: 'f109' }, { days: 10, field: 'f160' }, { days: 20, field: 'f110' }, { days: 60, field: 'f24' },
]
export const NET_WINDOWS = [{ days: 3, field: 'f267' }, { days: 5, field: 'f164' }, { days: 10, field: 'f174' }]
export const BOARD_WINDOWS = [5, 10, 20]
export const INST_WINDOWS = [3, 5, 10, 20]
export const LIST_LIMIT = 50
export const STREAK_TOP = 10 // 「连续上榜」：连续 7 个交易日人气排名前 10（开盘啦同名标签的口径）
export const STREAK_DAYS = 7
export const SURGE_FROM = 1000 // 「人气激增」：当日进入前 100，且上一交易日排名在 1000 名之后（本站自定）

/** 东财时间戳（秒）→ 北京时间 { date, minutes } */
export function bjTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return null
  const d = new Date(sec * 1000 + 8 * 3600_000)
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() }
}
/** 行情时间是 date 当天 15:00 以后（收盘数据） */
export const isClose = (sec, date) => { const t = bjTime(num(sec)); return !!t && t.date === date && t.minutes >= 15 * 60 }

/** 最近一个已收盘的交易日：交易日 15:10 之后为当天，否则为上一交易日 */
export function lastClosedDay(today, minutes) {
  return isTradingDay(today) && minutes >= 15 * 60 + 10 ? today : prevTradingDay(today)
}
/** 盘后快照（不带日期的行情）只能在交易日 15:10 之后、同一北京日期内取 */
export const snapshotAllowed = (today, minutes) => isTradingDay(today) && minutes >= 15 * 60 + 10
/** 快照取完后的复核：now（{ today, minutes }，北京时间）必须仍是开始时的 today 且仍在盘后时段；跨过午夜即作废 */
export const snapshotStillValid = (today, now) => now?.today === today && snapshotAllowed(now.today, now.minutes)

/** date（含）往前数 n 个交易日，升序 */
export function tradingDaysBack(date, n) {
  const out = [date]
  while (out.length < n) out.unshift(prevTradingDay(out[0]))
  return out
}

/* ---------------- 人气榜 ---------------- */

/** 'SZ002242' → { code, secid }；北交所代码东财也标 SZ，secid 用 0 */
export function parseSc(sc) {
  const m = /^(SH|SZ|BJ)(\d{6})$/.exec(String(sc ?? ''))
  return m ? { code: m[2], secid: `${m[1] === 'SH' ? 1 : 0}.${m[2]}` } : null
}

/** stockrank 接口外壳：code 0 才是成功 */
export function stockrankData(body, label) {
  if (body?.code !== 0 || !Array.isArray(body?.data)) throw new Error(`${label} 返回异常：${body?.message ?? '无数据'}`)
  return body.data
}

export const TOP_SIZE = 100

/** 当前人气前 100（getAllCurrentList）：必须恰好是名次 1..100、代码不重复，缺一名也不收（不能用残缺榜替换完整榜） */
export function parseCurrentList(data, size = TOP_SIZE) {
  const rows = data.map((r) => ({ ...parseSc(r?.sc), rank: num(r?.rk) })).filter((r) => r.code && Number.isInteger(r.rank))
  if (rows.length !== size || data.length !== size) throw new Error(`人气榜条数异常：${rows.length}/${data.length}，应为 ${size}`)
  rows.sort((a, b) => a.rank - b.rank)
  if (rows.some((r, i) => r.rank !== i + 1)) throw new Error('人气榜名次不连续')
  if (new Set(rows.map((r) => r.code)).size !== rows.length) throw new Error('人气榜代码重复')
  return rows
}

/** 飙升榜（getAllHisRcList）：rk 当前排名，hrc = 上一自然日排名 − 当前排名（已核对），hrcrk 飙升名次。空榜视为没取到 */
export function parseSurgeList(data) {
  const rows = data.map((r) => ({ ...parseSc(r?.sc), rank: num(r?.rk), rise: num(r?.hrc), order: num(r?.hrcrk) }))
    .filter((r) => r.code && Number.isInteger(r.rank))
    .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9))
  if (!rows.length) throw new Error('飙升榜为空')
  return rows
}

/** 个股人气排名历史（getHisList）→ Map(date → rank)。接口按自然日给出每天的排名 */
export function parseHisList(data) {
  const m = new Map()
  for (const r of data) {
    const d = String(r?.calcTime ?? '').slice(0, 10)
    const k = num(r?.rank)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isInteger(k) && k > 0) m.set(d, k)
  }
  return m
}

/** 连续上榜天数：今天（快照名次）在前 limit 名算第 1 天，再按交易日往前数历史名次；缺一天就停 */
export function streakOf(todayRank, hist, today, limit) {
  if (!(todayRank <= limit)) return 0
  let n = 1
  for (let d = prevTradingDay(today), i = 0; i < 250; i++, d = prevTradingDay(d)) {
    const k = hist?.get(d)
    if (!(k <= limit)) break
    n++
  }
  return n
}

/** 组装人气榜：top 为前 100，surge 为飙升榜；prevRank 一律取上一交易日（历史缺失时为 null） */
export function buildPopularity({ date, takenAt, top, surge, hist, quotes }) {
  const prev = prevTradingDay(date)
  const q = (code) => quotes.get(code) ?? null
  const base = (r) => {
    const h = hist.get(r.code)
    const prevRank = h ? h.get(prev) ?? null : null
    return { code: r.code, name: q(r.code)?.name ?? null, price: q(r.code)?.price ?? null, pct: q(r.code)?.pct ?? null, rank: r.rank, prevRank, change: prevRank === null ? null : prevRank - r.rank }
  }
  const topRows = top.map((r) => {
    const b = base(r)
    const h = hist.get(r.code)
    const streak10 = h ? streakOf(r.rank, h, date, STREAK_TOP) : null
    const streak100 = h ? streakOf(r.rank, h, date, 100) : null
    const tags = []
    if (streak10 !== null && streak10 >= STREAK_DAYS) tags.push('连续上榜')
    if (b.prevRank !== null && b.prevRank > SURGE_FROM) tags.push('人气激增')
    return { ...b, streak10, streak100, tags }
  })
  const surgeRows = surge.map(base).filter((r) => r.change !== null).sort((a, b) => b.change - a.change || a.rank - b.rank)
  return { date, prevDate: prev, takenAt, top: topRows, surge: surgeRows }
}

/** ulist 行情 → Map(code → { name, price, pct })；只收当天收盘后的行情 */
export function parseQuotes(body, date) {
  const m = new Map()
  for (const r of body?.data?.diff ?? []) {
    const code = str(r?.f12)
    if (!code || !isClose(r.f124, date)) continue
    m.set(code, { name: str(r.f14), price: num(r.f2), pct: num(r.f3) })
  }
  return m
}

/* ---------------- 个股区间排行 ---------------- */

/** 上市日期 f26（YYYYMMDD）距 date 的交易日数（上市当天算 1）；未知时 null */
export function listedDays(f26, date) {
  const s = String(f26 ?? '')
  if (!/^\d{8}$/.test(s)) return null
  const from = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  if (from > date) return 0
  let n = 0
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${date}T00:00:00Z`); t <= end && n <= 400; t += 864e5) {
    if (isTradingDay(new Date(t).toISOString().slice(0, 10))) n++
  }
  return n
}

/**
 * 一页按某区间字段排序的 clist 行 → 规整行。剔除：停牌 / 无成交、行情不是 date 收盘后、区间值缺失、
 * 上市不足 days+1 个交易日的新股（区间起点前还没上市，东财如何计算未公开）。
 */
export function stockRangeRows(diff, date, field, days) {
  return (diff ?? []).map((r) => ({
    code: str(r?.f12), name: str(r?.f14), price: num(r?.f2), pct: num(r?.f3), amount: num(r?.f6),
    value: num(r?.[field]), listed: listedDays(r?.f26, date), fresh: isClose(r?.f124, date),
  })).filter((r) => r.code && r.name && r.fresh && r.price !== null && r.amount !== null && r.amount > 0 && r.value !== null && (r.listed === null || r.listed > days))
    .map(({ fresh: _f, listed: _l, ...r }) => r)
}

/** 一次请求的新鲜度检查：大部分行的行情时间必须是 date 收盘后，否则整段不写 */
export function assertFresh(diff, date, label) {
  const rows = diff ?? []
  const fresh = rows.filter((r) => isClose(r?.f124, date)).length
  if (!rows.length || fresh < rows.length * 0.8) throw new Error(`${label} 不是 ${date} 收盘后数据（${fresh}/${rows.length}）`)
}

/** 资金流日线（fflow/daykline）→ 升序 [{ date, main, close, pct }]；f52 主力净额（元），f62 收盘，f63 涨跌幅 */
export function parseFflow(body) {
  const ks = body?.data?.klines
  if (body?.rc !== 0 || !Array.isArray(ks)) throw new Error('东财资金流日线结构异常')
  return ks.map((s) => String(s).split(',')).map((x) => ({ date: x[0], main: num(x[1]), close: num(x[11]), pct: num(x[12]) }))
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k.date))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 截到 target（含）为止；最后一根不是 target 时返回 null（数据还没到或停牌） */
export function cutTo(series, target) {
  const s = series.filter((k) => k.date <= target)
  return s.length && s.at(-1).date === target ? s : null
}

/**
 * 最后一根往前、按交易日历逐日对齐的 n 根。窗口按确切交易日取（tradingDaysBack），
 * 中间缺任何一天（漏数据或停牌）都返回 null，不能拿更早的一根顶上。
 */
export function lastBars(series, n) {
  if (!series?.length || n < 1) return null
  const dates = tradingDaysBack(series.at(-1).date, n)
  const byDate = new Map(series.map((k) => [k.date, k]))
  const bars = dates.map((d) => byDate.get(d))
  return bars.every(Boolean) ? bars : null
}
/** 最近 n 个交易日里主力净流入（>0）的天数；缺日或有缺失值时 null */
export function inflowDays(series, n) {
  const xs = lastBars(series, n)?.map((k) => k.main)
  return !xs || xs.some((x) => x === null) ? null : xs.filter((x) => x > 0).length
}
const sumLast = (series, n) => {
  const xs = lastBars(series, n)?.map((k) => k.main)
  return !xs || xs.some((x) => x === null) ? null : Math.round(xs.reduce((s, x) => s + x, 0))
}
/** 区间涨幅：最后一根收盘相对 n 个交易日之前那天的收盘（那天缺失则 null） */
export function rangePct(series, n) {
  const bars = lastBars(series, n + 1)
  if (!bars) return null
  const a = bars[0].close, b = bars.at(-1).close
  return a > 0 && b !== null ? round((b / a - 1) * 100, 2) : null
}

/* ---------------- 板块区间排行 ---------------- */

/** 一个板块的区间统计（series 已截到 target） */
export function boardStats(series) {
  const out = { pct: series.at(-1).pct, close: series.at(-1).close, net1: series.at(-1).main }
  for (const n of BOARD_WINDOWS) {
    out[`r${n}`] = rangePct(series, n)
    out[`net${n}`] = sumLast(series, n)
    out[`in${n}`] = inflowDays(series, n)
  }
  return out
}

/**
 * 领涨次数：每个交易日在同类板块（行业 / 概念 分开）里涨幅第一的板块记一次，统计最近 5 / 10 / 20 个交易日。
 * boards: [{ code, name, series }]（series 已截到 target）。返回 { counts: Map(code → {lead5, lead10, lead20}), leaders: [{date, code, name, pct}] }
 */
export function leaderCounts(boards, dates) {
  const byDate = new Map(boards.map((b) => [b.code, new Map(b.series.map((k) => [k.date, k.pct]))]))
  const leaders = dates.map((d) => {
    let best = null
    for (const b of boards) {
      const p = byDate.get(b.code).get(d)
      if (p === null || p === undefined) continue
      if (!best || p > best.pct) best = { date: d, code: b.code, name: b.name, pct: p }
    }
    return best ?? { date: d, code: null, name: null, pct: null }
  })
  const counts = new Map()
  for (const n of BOARD_WINDOWS) {
    for (const l of leaders.slice(-n)) {
      if (!l.code) continue
      const c = counts.get(l.code) ?? { lead5: 0, lead10: 0, lead20: 0 }
      c[`lead${n}`]++
      counts.set(l.code, c)
    }
  }
  return { counts, leaders }
}

const NO_LEAD = { lead5: null, lead10: null, lead20: null }
/**
 * 汇总某一类板块：只保留截到 target 的板块，附领涨次数。
 * 只要有一个板块缺日线，它可能正是某天的涨幅第一，领涨次数与每日领涨都不发布（leaders: null，lead* 为 null）。
 */
export function buildBoardKind(list, target, dates) {
  const ok = list.map((b) => ({ ...b, series: b.series ? cutTo(b.series, target) : null })).filter((b) => b.series)
  const missing = list.length - ok.length
  const { counts, leaders } = missing ? { counts: null, leaders: null } : leaderCounts(ok, dates)
  const rows = ok.map((b) => ({ code: b.code, name: b.name, ...boardStats(b.series), ...(counts ? counts.get(b.code) ?? { lead5: 0, lead10: 0, lead20: 0 } : NO_LEAD) }))
  return { rows, leaders, missing }
}

/** 同一天已有的板块段缺得更少时保留旧的，不用更残缺的结果替换 */
export function keepBetterBoards(prev, next) {
  if (!prev || prev.date !== next.date) return next
  const miss = (b) => ['industry', 'concept', 'region'].reduce((s, k) => s + (b?.[k]?.missing ?? Infinity), 0)
  return miss(prev) < miss(next) ? prev : next
}

/* ---------------- 机构多日榜 ---------------- */

/**
 * 某天每只股票的机构专用席位汇总。只用当日口径的上榜记录（主记录是「连续三日」累计口径的跳过，避免与相邻几天重复计入）；
 * 按投资者类别披露的记录没有席位，也跳过。同一席位同时出现在买入、卖出前五只算一次。
 */
export function instDay(day) {
  const out = []
  for (const e of primaryEntries(day.entries)) {
    if (e.window !== 1 || isByType(e)) continue
    const seats = uniqueSeats(e).filter((s) => s.kind === 'inst')
    if (!seats.length) continue
    out.push({ date: day.date, code: e.code, name: e.name, pct: e.pct, buy: sumKnown(seats.map((s) => s.buy)), sell: sumKnown(seats.map((s) => s.sell)), net: sumKnown(seats.map((s) => s.net)), seats: seats.length })
  }
  return out
}

/**
 * 最近 n 个交易日（截至 asOf）的机构净买排行；days: Map(date → 龙虎榜原始日数据)。
 * 窗口内缺任何一天的明细就标 complete: false，合计与排行都不发布（不能把 2 天的合计当 3 日榜）。
 */
export function instWindow(days, asOf, n, limit = 40) {
  const dates = tradingDaysBack(asOf, n)
  const missing = dates.filter((d) => !days.has(d))
  if (missing.length) return { days: n, from: dates[0], to: asOf, missing, complete: false, totals: { net: null, stocks: null }, buy: [], sell: [] }
  const m = new Map()
  for (const d of dates) {
    const day = days.get(d)
    if (!day) continue
    for (const r of instDay(day)) {
      const o = m.get(r.code) ?? { code: r.code, name: r.name, trades: [] }
      o.name = r.name
      o.trades.push(r)
      m.set(r.code, o)
    }
  }
  const rows = [...m.values()].map((o) => {
    const last = o.trades.at(-1)
    return {
      code: o.code, name: o.name,
      buy: sumKnown(o.trades.map((t) => t.buy)), sell: sumKnown(o.trades.map((t) => t.sell)), net: sumKnown(o.trades.map((t) => t.net)),
      times: o.trades.length, seats: o.trades.reduce((s, t) => s + t.seats, 0), last: last.date, lastPct: last.pct,
    }
  })
  const byNet = (a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity) || b.times - a.times
  const buy = rows.filter((r) => r.net !== null && r.net > 0).sort(byNet).slice(0, limit)
  const sell = rows.filter((r) => r.net !== null && r.net < 0).sort((a, b) => a.net - b.net).slice(0, limit)
  const totals = { net: sumKnown(rows.map((r) => r.net)), stocks: rows.length }
  return { days: n, from: dates[0], to: asOf, missing, complete: true, totals, buy, sell }
}
