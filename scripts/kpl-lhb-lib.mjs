// 开盘啦「龙虎榜」页签（/market-mood/lhb）的纯计算。功能对照开盘啦 App 的龙虎榜：当日上榜个股（按上榜原因分组）、
// 个股买入/卖出前五席位、机构专用席位、营业部（活跃度、上榜次数与近期明细）。数据全部来自东方财富数据中心公开报表：
//   RPT_DAILYBILLBOARD_DETAILSNEW   每日上榜明细（一只股票每条上榜原因一行，TRADE_ID 唯一）
//   RPT_BILLBOARD_DAILYDETAILSBUY   每条上榜记录的买入前五席位（每个席位同时给出买入额与卖出额）
//   RPT_BILLBOARD_DAILYDETAILSSELL  每条上榜记录的卖出前五席位（与买入前五可能重复，同一席位数字相同）
// 开盘啦的「一线游资」昵称映射和「会不会上龙虎榜」盘中预测不在公开数据里，本页不做。只做盘后统计，不构成投资建议。
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'

/** null / 空串 / 非数字一律视为缺失（null），不能当 0 */
export const num = (x) => (x === null || x === undefined || String(x).trim() === '' || !Number.isFinite(Number(x)) ? null : Number(x))
const round = (x, n = 2) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
/** 金额求和：全部缺失时为 null，否则只加已知值 */
const sumKnown = (xs) => { const v = xs.filter((x) => x !== null && Number.isFinite(x)); return v.length ? Math.round(v.reduce((s, x) => s + x, 0)) : null }

/** 上榜原因的统计窗口：「连续三个交易日内…」为 3 日累计，其余为当日 */
export function windowOf(reason) {
  const m = /连续(\d+|[一二三四五六七八九十]+)个交易日/.exec(String(reason ?? ''))
  if (!m) return 1
  const cn = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  return /^\d+$/.test(m[1]) ? Number(m[1]) : m[1] === '十' ? 10 : cn[m[1]] ?? 3
}

/**
 * 席位类型：机构专用 / 沪深股通专用（北向）/ 普通营业部 / 投资者类别。
 * 「严重异常波动」类上榜（连续 10 日等）不披露席位，而是按投资者类别（自然人、中小投资者、机构投资者…）披露全部买卖，
 * 这些类别互相包含、金额是整段时间的全部成交，不能当席位汇总。
 */
const TYPE_NAMES = /^(自然人|其他自然人|中小投资者|机构投资者|机构|沪股通|深股通|沪股通投资者|深股通投资者|其他)$/
export const kindOf = (name) => {
  const n = String(name).trim()
  return n === '机构专用' ? 'inst' : /^(沪|深)股通专用$/.test(n) ? 'hk' : TYPE_NAMES.test(n) ? 'type' : 'dept'
}
/** 这条上榜记录是否按投资者类别披露（而不是前五席位） */
export const isByType = (e) => [...e.buySeats, ...e.sellSeats].some((s) => kindOf(s.name) === 'type')

/** 营业部名称去掉公司后缀，便于窄屏显示：「开源证券股份有限公司西安西大街证券营业部」→「开源证券西安西大街证券营业部」 */
export const shortDept = (name) => String(name ?? '').trim().replace(/(股份有限公司|有限责任公司|有限公司)/g, '')

const marketOf = (secucode) => ({ SH: 'sh', SZ: 'sz', BJ: 'bj' })[String(secucode ?? '').split('.')[1]] ?? null

/** 报表行的日期必须是目标交易日 */
const sameDay = (v, date) => String(v ?? '').slice(0, 10) === date

/** 分页取数的完整性：拿到的行数必须等于报表给出的总数 */
export function checkComplete(rows, count, label) {
  if (!Array.isArray(rows) || !Number.isInteger(count) || rows.length !== count) throw new Error(`${label}行数不完整（${rows?.length ?? 0}/${count}）`)
  return rows
}

/** 每日上榜明细 → 上榜记录 */
export function parseList(rows, date) {
  return rows.map((r) => {
    if (!sameDay(r?.TRADE_DATE, date)) throw new Error(`上榜明细日期不符（${r?.TRADE_DATE}）`)
    if (!/^\d{6}$/.test(String(r.SECURITY_CODE)) || typeof r.SECURITY_NAME_ABBR !== 'string' || r.TRADE_ID === null || r.TRADE_ID === undefined) throw new Error('上榜明细字段不完整')
    const reason = String(r.EXPLANATION ?? '').trim()
    return {
      // 只统计 A 股（058001001）；可转债（060）金额口径不同、B 股以外币计价，不混入汇总
      aShare: String(r.SECURITY_TYPE_CODE ?? '') === '058001001',
      id: String(r.TRADE_ID), code: String(r.SECURITY_CODE), name: r.SECURITY_NAME_ABBR.trim(), market: marketOf(r.SECUCODE), board: String(r.TRADE_MARKET ?? ''),
      reason, window: windowOf(reason),
      close: num(r.CLOSE_PRICE), pct: round(num(r.CHANGE_RATE), 2), turnover: round(num(r.TURNOVERRATE), 2),
      amount: num(r.ACCUM_AMOUNT), // 统计窗口内的总成交额（3 日口径为 3 日累计）
      buy: num(r.BILLBOARD_BUY_AMT), sell: num(r.BILLBOARD_SELL_AMT), net: num(r.BILLBOARD_NET_AMT), deal: num(r.BILLBOARD_DEAL_AMT),
      dealRatio: round(num(r.DEAL_AMOUNT_RATIO), 2), // 龙虎榜成交额占总成交额（%）
      netRatio: round(num(r.DEAL_NET_RATIO), 2), // 龙虎榜净买额占总成交额（%）
      freeCap: num(r.FREE_MARKET_CAP),
    }
  })
}

/** 买入/卖出前五席位 → 席位行（side 标明来自哪张表） */
export function parseSeats(rows, date, side) {
  return rows.map((r) => {
    if (!sameDay(r?.TRADE_DATE, date)) throw new Error(`席位明细日期不符（${r?.TRADE_DATE}）`)
    if (r.TRADE_ID === null || r.TRADE_ID === undefined || typeof r.OPERATEDEPT_NAME !== 'string') throw new Error('席位明细字段不完整')
    const name = r.OPERATEDEPT_NAME.trim()
    const buy = num(r.BUY), sell = num(r.SELL)
    return {
      tradeId: String(r.TRADE_ID), code: String(r.SECURITY_CODE), side,
      dept: String(r.OPERATEDEPT_CODE ?? ''), name, kind: kindOf(name),
      buy, sell, net: num(r.NET) ?? (buy === null && sell === null ? null : (buy ?? 0) - (sell ?? 0)),
    }
  })
}

const seatOut = (s) => ({ dept: s.dept, name: shortDept(s.name), kind: s.kind, buy: s.buy, sell: s.sell, net: s.net })

/**
 * 一个交易日的完整数据：上榜记录 + 每条记录的买入前五、卖出前五。
 * 校验：席位必须属于当日上榜记录；每条记录必须同时有买入与卖出席位（东财通常各 5 行），缺了说明数据还没发全，整天不用。
 */
export function assembleDay(date, allList, buySeats, sellSeats) {
  const allIds = new Set(allList.map((e) => e.id))
  if (allIds.size !== allList.length) throw new Error('上榜记录 TRADE_ID 重复')
  const list = allList.filter((e) => e.aShare)
  if (!list.length) throw new Error(`${date} 没有 A 股上榜记录`)
  const ids = new Set(list.map((e) => e.id))
  const by = (seats) => {
    const m = new Map()
    for (const s of seats) {
      if (!allIds.has(s.tradeId)) throw new Error(`席位不属于当日上榜记录（${s.tradeId}）`)
      if (!ids.has(s.tradeId)) continue // 可转债、B 股的席位
      const a = m.get(s.tradeId) ?? []; a.push(s); m.set(s.tradeId, a)
    }
    return m
  }
  const bm = by(buySeats), sm = by(sellSeats)
  const entries = list.map((e) => {
    const b = bm.get(e.id), s = sm.get(e.id)
    if (!b?.length || !s?.length) throw new Error(`${e.name}（${e.code}）缺少买入或卖出席位，数据未发全`)
    const sortBy = (xs, k) => [...xs].sort((x, y) => (y[k] ?? -Infinity) - (x[k] ?? -Infinity))
    const { aShare: _a, ...rest } = e
    return { ...rest, buySeats: sortBy(b, 'buy').map(seatOut), sellSeats: sortBy(s, 'sell').map(seatOut) }
  })
  return { date, entries }
}

/** 一条记录的去重席位：同一席位可能同时出现在买入前五和卖出前五（数字相同），只算一次 */
export function uniqueSeats(entry) {
  const seen = new Map()
  for (const s of [...entry.buySeats, ...entry.sellSeats]) {
    const k = `${s.dept}|${s.name}|${s.buy}|${s.sell}`
    if (!seen.has(k)) seen.set(k, { ...s, kind: kindOf(s.name) }) // 类型按名称重算，旧原始文件也适用
  }
  return [...seen.values()]
}

/**
 * 每只股票取一条「主记录」做汇总：同一股票同日可能因多条原因上榜（当日口径的几条席位相同，3 日口径是 3 日累计），
 * 优先披露席位的记录（不用投资者类别披露的），再优先当日口径（窗口最短），同口径取 TRADE_ID 最小的一条。
 * 只有 3 日口径的个股用 3 日累计数据计入；只有投资者类别披露的个股不计入金额汇总。
 */
export function primaryEntries(entries) {
  const m = new Map()
  for (const e of entries) {
    const o = m.get(e.code)
    if (!o) { m.set(e.code, e); continue }
    const [a, b] = [isByType(e), isByType(o)]
    if ((!a && b) || (a === b && (e.window < o.window || (e.window === o.window && Number(e.id) < Number(o.id))))) m.set(e.code, e)
  }
  return [...m.values()]
}

/** 席位按类型汇总：买入、卖出、净额与出现次数 */
function seatTotals(entries, kind) {
  const seats = entries.flatMap((e) => uniqueSeats(e).filter((s) => s.kind === kind).map((s) => ({ ...s, code: e.code })))
  return {
    buy: sumKnown(seats.map((s) => s.buy)), sell: sumKnown(seats.map((s) => s.sell)), net: sumKnown(seats.map((s) => s.net)),
    stocks: new Set(seats.map((s) => s.code)).size,
  }
}

/** 机构专用席位：每只股票的买入/卖出额、净额、买入与卖出席位数（按主记录） */
export function instByStock(prim) {
  const out = []
  for (const e of prim) {
    const seats = uniqueSeats(e).filter((s) => s.kind === 'inst')
    if (!seats.length) continue
    out.push({
      code: e.code, name: e.name, pct: e.pct, window: e.window,
      buy: sumKnown(seats.map((s) => s.buy)), sell: sumKnown(seats.map((s) => s.sell)), net: sumKnown(seats.map((s) => s.net)),
      buyCount: e.buySeats.filter((s) => s.kind === 'inst').length, sellCount: e.sellSeats.filter((s) => s.kind === 'inst').length,
    })
  }
  return out.sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity))
}

/** 营业部（不含机构专用、沪深股通）按日汇总：每只股票只计主记录 */
export function deptByDay(day) {
  const m = new Map()
  for (const e of primaryEntries(day.entries)) {
    for (const s of uniqueSeats(e)) {
      if (s.kind !== 'dept') continue
      const key = s.dept || s.name
      const o = m.get(key) ?? { dept: s.dept, name: s.name, trades: [] }
      o.trades.push({ date: day.date, code: e.code, name: e.name, pct: e.pct, window: e.window, buy: s.buy, sell: s.sell, net: s.net })
      m.set(key, o)
    }
  }
  return m
}

const rankDepts = (m, limit) => [...m.values()].map((o) => ({
  dept: o.dept, name: o.name, count: o.trades.length, days: new Set(o.trades.map((t) => t.date)).size,
  buy: sumKnown(o.trades.map((t) => t.buy)), sell: sumKnown(o.trades.map((t) => t.sell)), net: sumKnown(o.trades.map((t) => t.net)),
  last: o.trades.map((t) => t.date).sort().at(-1), stocks: [...new Set(o.trades.map((t) => t.name))].slice(0, 8),
})).sort((a, b) => (b.buy ?? 0) - (a.buy ?? 0) || b.count - a.count).slice(0, limit)

/** 当日页面数据 */
export function buildLatest(day) {
  const prim = primaryEntries(day.entries)
  const primIds = new Set(prim.map((e) => e.id))
  const instMap = new Map(instByStock(prim).map((r) => [r.code, r]))
  // 个股：主记录的数据 + 全部上榜原因（每条原因各自的前五席位）
  const seatPrim = prim.filter((e) => !isByType(e))
  const stocks = prim.map((e) => {
    const inst = instMap.get(e.code)
    const t = isByType(e) // 投资者类别披露：金额是整段时间全部成交，不当龙虎榜席位金额显示
    return {
      code: e.code, name: e.name, market: e.market, board: e.board, close: e.close, pct: e.pct, turnover: e.turnover, window: e.window, byType: t,
      amount: e.amount, buy: t ? null : e.buy, sell: t ? null : e.sell, net: t ? null : e.net, dealRatio: t ? null : e.dealRatio, netRatio: t ? null : e.netRatio,
      instNet: inst ? inst.net : null, instBuyCount: inst?.buyCount ?? 0, instSellCount: inst?.sellCount ?? 0,
      hasHk: uniqueSeats(e).some((s) => s.kind === 'hk'),
      reasons: day.entries.filter((x) => x.code === e.code)
        .sort((a, b) => Number(primIds.has(b.id)) - Number(primIds.has(a.id)) || a.window - b.window || Number(a.id) - Number(b.id))
        .map((x) => ({ id: x.id, reason: x.reason, window: x.window, byType: isByType(x), amount: x.amount, buy: x.buy, sell: x.sell, net: x.net, dealRatio: x.dealRatio, buySeats: x.buySeats, sellSeats: x.sellSeats })),
    }
  }).sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity))
  // 上榜原因分组（与开盘啦列表一致：每个原因下列出个股）
  const groups = new Map()
  for (const e of day.entries) { const a = groups.get(e.reason) ?? []; a.push(e.code); groups.set(e.reason, a) }
  const reasons = [...groups.entries()].map(([reason, codes]) => ({ reason, window: windowOf(reason), codes })).sort((a, b) => b.codes.length - a.codes.length || a.reason.localeCompare(b.reason))
  return {
    date: day.date, stockCount: prim.length, entryCount: day.entries.length,
    up: prim.filter((e) => e.pct !== null && e.pct > 0).length, down: prim.filter((e) => e.pct !== null && e.pct < 0).length,
    netBuyCount: seatPrim.filter((e) => e.net !== null && e.net > 0).length, netSellCount: seatPrim.filter((e) => e.net !== null && e.net < 0).length,
    byTypeCount: prim.length - seatPrim.length,
    totals: { buy: sumKnown(seatPrim.map((e) => e.buy)), sell: sumKnown(seatPrim.map((e) => e.sell)), net: sumKnown(seatPrim.map((e) => e.net)) },
    inst: seatTotals(prim, 'inst'), hk: seatTotals(prim, 'hk'),
    stocks, reasons, instRank: [...instMap.values()], deptRank: rankDepts(deptByDay(day), 30),
  }
}

/** 历史序列的一行（画图用） */
export function dayStats(day) {
  const l = buildLatest(day)
  return { date: day.date, stockCount: l.stockCount, entryCount: l.entryCount, net: l.totals.net, instNet: l.inst.net, instStocks: l.inst.stocks, hkNet: l.hk.net }
}

/** 近 N 个交易日的营业部排行、个股上榜次数，以及排行靠前营业部的近期明细 */
export function buildWindow(days, { deptLimit = 50, detailLimit = 30, tradeLimit = 30 } = {}) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const all = new Map()
  const stockMap = new Map()
  for (const d of sorted) {
    for (const [k, o] of deptByDay(d)) { const a = all.get(k) ?? { dept: o.dept, name: o.name, trades: [] }; a.trades.push(...o.trades); a.name = o.name; all.set(k, a) }
    for (const e of primaryEntries(d.entries)) {
      const s = stockMap.get(e.code) ?? { code: e.code, name: e.name, count: 0, nets: [], last: d.date }
      s.count++; s.nets.push(isByType(e) ? null : e.net); s.name = e.name; s.last = d.date
      stockMap.set(e.code, s)
    }
  }
  const deptRank = rankDepts(all, deptLimit)
  const deptTrades = {}
  for (const r of deptRank.slice(0, detailLimit)) {
    const o = all.get(r.dept || r.name)
    deptTrades[r.dept || r.name] = [...o.trades].sort((a, b) => b.date.localeCompare(a.date) || (b.buy ?? 0) - (a.buy ?? 0)).slice(0, tradeLimit)
  }
  const stockRank = [...stockMap.values()].map((s) => ({ code: s.code, name: s.name, count: s.count, last: s.last, net: sumKnown(s.nets) }))
    .sort((a, b) => b.count - a.count || (b.net ?? -Infinity) - (a.net ?? -Infinity)).slice(0, 30)
  return { days: sorted.length, from: sorted[0]?.date ?? null, to: sorted.at(-1)?.date ?? null, deptRank, deptTrades, stockRank }
}

/** 合并历史序列：同日期以新记录为准，但上榜记录数变少的不覆盖（防止残缺的重抓顶掉完整数据）；升序，保留最近 keep 天 */
export function mergeHistory(history, rows, keep = 250) {
  const map = new Map(history.map((d) => [d.date, d]))
  for (const d of rows) { const o = map.get(d.date); if (!o || d.entryCount >= o.entryCount) map.set(d.date, d) }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep)
}

/** 重抓同一天时选哪份：新数据记录数不少于旧数据才替换 */
export const pickDay = (oldDay, newDay) => (!oldDay || newDay.entries.length >= oldDay.entries.length ? newDay : oldDay)

/**
 * 要尝试的交易日（降序）：今天（北京时间 16:30 之后才算，龙虎榜约 17:00–18:30 公布）及之前 n−1 个交易日。
 * 晚间、凌晨运行都可以：凌晨时「今天」还没收盘，会从上一交易日开始。
 */
export function candidateDays(today, minutes, n, force = false) {
  const out = []
  let d = isTradingDay(today) && (minutes >= 16 * 60 + 30 || force) ? today : prevTradingDay(today)
  while (out.length < n) { out.push(d); d = prevTradingDay(d) }
  return out
}
