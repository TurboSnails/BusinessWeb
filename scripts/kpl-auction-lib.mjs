// 开盘啦 · 竞价尾盘页的纯函数（scripts/kpl-auction.mjs 调用，scripts/kpl-auction.test.mjs 覆盖）。
//
// 数据来自东财分时 push2his trends2（iscr=0&ndays=5，每根分钟线带日期，盘后可取近 5 个交易日）。实测口径（2026-11-17 核对）：
// - 每天 241 根：09:30 一根 + 09:31…15:00。09:30 那根只含开盘集合竞价撮合（成交量与 iscr=1 版本 09:26 那根完全相同），价格即开盘价；
// - 14:58 / 14:59 两根基本为 0（收盘集合竞价期间不连续成交），15:00 那根只含收盘集合竞价撮合，价格即收盘价；
// - 盘后固定价格交易（科创板 / 创业板 15:05–15:30）不在这 241 根里；
// - 早于最近一天的分钟线开盘价字段为 0，只用收盘价（f53）与成交额（f57）。
// null / '' / '-' 视为缺失，不当 0。

export const BUCKETS = [
  { key: 'le5', label: '≤−5%', up: false, test: (p) => p <= -5 },
  { key: 'm5', label: '−5~−2%', up: false, test: (p) => p > -5 && p <= -2 },
  { key: 'm2', label: '−2~0%', up: false, test: (p) => p > -2 && p < 0 },
  { key: 'flat', label: '平开', up: null, test: (p) => p === 0 },
  { key: 'p2', label: '0~2%', up: true, test: (p) => p > 0 && p < 2 },
  { key: 'p5', label: '2~5%', up: true, test: (p) => p >= 2 && p < 5 },
  { key: 'ge5', label: '≥5%', up: true, test: (p) => p >= 5 },
]
export const SNAPSHOT_TOLERANCE = 0.03 // 候选股排名快照的成交额与分时合计相差 3% 以内算同一天
export const SNAPSHOT_MIN_MATCH = 0.8 // 至少 80% 的成交额前列候选股对得上，才认为快照就是目标交易日收盘后的

export const num = (x) => (x === null || x === undefined || typeof x === 'boolean' || ['', '-'].includes(String(x).trim()) || !Number.isFinite(Number(x)) ? null : Number(x))
const r2 = (x, d = 2) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d)
const pctOf = (a, b) => (a === null || b === null || !(b > 0) || !(a > 0) ? null : r2((a / b - 1) * 100))
const share = (part, total) => (part === null || total === null || !(total > 0) ? null : r2((part / total) * 100))
export const secidOf = (code, market) => `${market ?? (/^6/.test(code) ? 1 : 0)}.${code}`
export const isBj = (code) => /^(4|8|92)/.test(String(code))

/** trends2 响应 → { code, name, preClose, days: { 'YYYY-MM-DD': [{ t, close, amount }] } }；请求 fields2=f51,f53,f57 */
export function parseMinutes(body) {
  const d = body?.data
  if (body?.rc !== 0 || !d || !Array.isArray(d.trends) || !d.trends.length) throw new Error('东财分时数据为空')
  const days = {}
  for (const s of d.trends) {
    const [stamp, close, amount] = String(s).split(',')
    const [date, t] = String(stamp ?? '').split(' ')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(t ?? '')) continue
    ;(days[date] ??= []).push({ t, close: num(close), amount: num(amount) })
  }
  for (const k of Object.keys(days)) days[k].sort((a, b) => a.t.localeCompare(b.t))
  return { code: String(d.code ?? ''), name: String(d.name ?? ''), preClose: num(d.preClose), days }
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/** 一个交易日应有的 241 个分钟时间戳：09:30、09:31…11:30、13:01…15:00（2026-11-17 实测各股各日一致） */
export const EXPECTED_MINUTES = [
  '09:30',
  ...Array.from({ length: 120 }, (_, i) => hhmm(9 * 60 + 31 + i)),
  ...Array.from({ length: 120 }, (_, i) => hhmm(13 * 60 + 1 + i)),
]
const EXPECTED_SET = new Set(EXPECTED_MINUTES)
/** 分钟线是否恰好是 241 个不重复、且都在交易时段内的时间戳（重复一根 + 缺一根也不算完整） */
export function completeBars(bars) {
  if (!Array.isArray(bars) || bars.length !== EXPECTED_MINUTES.length) return false
  const seen = new Set()
  for (const b of bars) {
    if (!EXPECTED_SET.has(b?.t) || seen.has(b.t)) return false
    seen.add(b.t)
  }
  return seen.size === EXPECTED_MINUTES.length
}

export const latestDay = (m) => Object.keys(m?.days ?? {}).sort().at(-1) ?? null

/**
 * 某一交易日的竞价 / 尾盘指标。bars 不完整（不是 241 个不重复的交易分钟）返回 null。
 * prevClose：优先用调用方给的昨收（最近一天用东财 preClose，已按除权调整）；否则取 prevDate 那天 15:00 收盘价；都没有则相关涨幅为 null。
 * 早盘：auctionPrice = 09:30 价，auctionAmount = 09:30 成交额（为 0 说明竞价没有撮合成交，此时竞价涨幅记 null）。
 * 尾盘：ref = 14:59 那根的收盘价（收盘集合竞价开始前最后的连续竞价价格），closeAuctionAmount = 15:00 成交额，
 *       closeAuctionPct = 收盘价较 ref 的涨跌（%）；15:00 成交额为 0 时记 null。
 */
export function dayStats(m, date, prevDate, prevCloseOverride = null) {
  const bars = m?.days?.[date]
  if (!completeBars(bars)) return null
  const at = (t) => bars.find((b) => b.t === t) ?? null
  const open = at('09:30'), last = at('15:00'), before = at('14:59')
  if (!open || !last) return null
  const prevBars = prevDate ? m.days?.[prevDate] : null
  const prevFromBars = prevBars?.find((b) => b.t === '15:00')?.close ?? null
  const prevClose = num(prevCloseOverride) ?? prevFromBars
  let dayAmount = 0
  for (const b of bars) { if (b.amount === null) return null; dayAmount += b.amount }
  const auctionAmount = open.amount
  const auctionPrice = auctionAmount > 0 ? open.close : null
  const close = last.close
  const ref = before?.close ?? null
  const closeAuctionAmount = last.amount
  return {
    date, prevClose, auctionPrice, auctionAmount, dayAmount, close,
    auctionPct: pctOf(auctionPrice, prevClose),
    closePct: pctOf(close, prevClose),
    afterAuctionPct: pctOf(close, auctionPrice), // 收盘较竞价价（开盘价）
    auctionShare: share(auctionAmount, dayAmount),
    closeRef: ref,
    closeAuctionAmount,
    closeAuctionPct: closeAuctionAmount > 0 ? pctOf(close, ref) : null,
    closeAuctionShare: share(closeAuctionAmount, dayAmount),
    prevAuctionAmount: prevBars?.find((b) => b.t === '09:30')?.amount ?? null,
  }
}

/** 竞价量比：今日竞价成交额 ÷ 上一交易日竞价成交额（上一交易日缺失或为 0 时 null） */
export const auctionRatio = (s) => (s && s.prevAuctionAmount > 0 && s.auctionAmount !== null ? r2(s.auctionAmount / s.prevAuctionAmount) : null)

/**
 * 候选集合：成交额前 topN（快照排名，剔除北交所）∪ 当日涨停池 ∪ 昨日涨停池（昨日涨停今日表现）。
 * 返回 [{ code, name, market, industry, tags: ['top'|'zt'|'yzt'], yBoards, rank }]
 */
export function pickCandidates({ snapshot = [], zt = [], yzt = [], topN = 400 }) {
  const map = new Map()
  const add = (code, base, tag) => {
    if (!code || isBj(code)) return
    const cur = map.get(code) ?? { code, name: base.name ?? '', market: base.market ?? null, industry: base.industry ?? '', tags: [], yBoards: null, rank: null }
    if (!cur.tags.includes(tag)) cur.tags.push(tag)
    if (!cur.industry && base.industry) cur.industry = base.industry
    if (cur.market === null && base.market !== undefined && base.market !== null) cur.market = base.market
    if (base.yBoards !== undefined && base.yBoards !== null) cur.yBoards = base.yBoards
    if (base.rank !== undefined) cur.rank = base.rank
    map.set(code, cur)
  }
  const ranked = snapshot.filter((r) => r.code && !isBj(r.code) && num(r.amount) !== null).sort((a, b) => b.amount - a.amount).slice(0, topN)
  ranked.forEach((r, i) => add(r.code, { name: r.name, market: r.market, industry: r.industry, rank: i + 1 }, 'top'))
  const ind = new Map(snapshot.map((r) => [r.code, r.industry]))
  for (const r of zt) add(r.c, { name: r.n, market: r.m, industry: ind.get(r.c) ?? r.hybk ?? '' }, 'zt')
  for (const r of yzt) add(r.c, { name: r.n, market: r.m, industry: ind.get(r.c) ?? r.hybk ?? '', yBoards: num(r.ylbc) }, 'yzt')
  return [...map.values()]
}

/** 快照（clist）行 → { code, name, market, amount, industry } */
export function parseSnapshotRow(r) {
  return { code: String(r.f12 ?? ''), name: String(r.f14 ?? ''), market: num(r.f13), amount: num(r.f6), industry: ['', '-'].includes(String(r.f100 ?? '').trim()) ? '' : String(r.f100) }
}

/**
 * 快照是否就是目标交易日收盘后的：拿成交额前列候选股的快照成交额与分时当日合计对比。
 * 快照是不带日期的实时行情，只拿来挑候选股和行业名；所有数值都来自带日期的分时。
 * 样本固定为前 sample 只：快照有效行不足 sample（被截断）直接不通过，不能随快照变短而降低门槛；
 * 其中至少 minMatch 比例要有分时，有分时的里面也至少 minMatch 比例对得上。
 */
export function checkSnapshot(snapshot, statsByCode, { tolerance = SNAPSHOT_TOLERANCE, minMatch = SNAPSHOT_MIN_MATCH, sample = 100 } = {}) {
  const top = snapshot.filter((r) => num(r.amount) > 0).sort((a, b) => b.amount - a.amount).slice(0, sample)
  let n = 0, ok = 0
  for (const r of top) {
    const s = statsByCode.get(r.code)
    if (!s || !(s.dayAmount > 0)) continue
    n++
    if (Math.abs(r.amount / s.dayAmount - 1) <= tolerance) ok++
  }
  return { n, ok, pass: top.length >= sample && n >= sample * minMatch && ok / n >= minMatch }
}

/**
 * 快照必须覆盖完整候选范围：剔除北交所后有成交额的行至少 topN 行，否则「成交额前 N」其实是残缺列表。
 */
export function snapshotCovers(snapshot, topN) {
  return snapshot.filter((r) => r.code && !isBj(r.code) && num(r.amount) > 0).length >= topN
}

/**
 * 同一天重跑时与已发布文件合并：指数、板块段旧的更全就保留旧的；个股段（失败数）更差返回 null（整份不替换）。
 * 新的一天（或没有旧文件）直接用新的。
 */
export function mergeSameDay(prev, next) {
  if (!prev || prev.asOf !== next.asOf) return next
  if (num(prev.universe?.failed) !== null && prev.universe.failed < next.universe.failed) return null
  const industries = (p) => (Array.isArray(p?.boards) ? p.boards.filter((b) => b?.kind === 'industry').length : 0)
  return {
    ...next,
    indexes: Array.isArray(prev.indexes) && prev.indexes.length > next.indexes.length ? prev.indexes : next.indexes,
    boards: industries(prev) > industries(next) ? prev.boards : next.boards,
  }
}

/** 日期回退保护：已发布文件的 asOf 比本次目标日新时不替换 */
export const isRegression = (prev, date) => typeof prev?.asOf === 'string' && prev.asOf > date

/** 个股输出行（金额单位：元） */
export function stockRow(c, s) {
  return {
    code: c.code, name: c.name, industry: c.industry || '', tags: c.tags, yBoards: c.yBoards ?? null,
    auctionPrice: s.auctionPrice, auctionPct: s.auctionPct, auctionAmount: s.auctionAmount,
    auctionRatio: auctionRatio(s), auctionShare: s.auctionShare, closePct: s.closePct, afterAuctionPct: s.afterAuctionPct,
    dayAmount: s.dayAmount, closeAuctionPct: s.closeAuctionPct, closeAuctionAmount: s.closeAuctionAmount, closeAuctionShare: s.closeAuctionShare,
  }
}

const mean = (xs) => (xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

/** 一组个股的竞价分布与均值（只统计竞价涨幅非 null 的） */
export function groupSummary(rows) {
  const valid = rows.filter((r) => r.auctionPct !== null)
  const buckets = Object.fromEntries(BUCKETS.map((b) => [b.key, valid.filter((r) => b.test(r.auctionPct)).length]))
  const highOpen = valid.filter((r) => r.auctionPct > 0).length
  const lowOpen = valid.filter((r) => r.auctionPct < 0).length
  return {
    n: valid.length, highOpen, lowOpen, flat: valid.length - highOpen - lowOpen,
    highOpenRate: valid.length ? r2((highOpen / valid.length) * 100, 1) : null,
    avgAuctionPct: mean(valid.map((r) => r.auctionPct)),
    avgAfterAuction: mean(valid.filter((r) => r.afterAuctionPct !== null).map((r) => r.afterAuctionPct)),
    avgClosePct: mean(valid.filter((r) => r.closePct !== null).map((r) => r.closePct)),
    auctionAmount: valid.reduce((a, r) => a + (r.auctionAmount ?? 0), 0),
    buckets,
  }
}

/** 指数 / 板块的竞价行 */
export function indexRow({ code, name, kind }, s) {
  return {
    code, name, kind,
    auctionPct: s.auctionPct, auctionAmount: s.auctionAmount, prevAuctionAmount: s.prevAuctionAmount, auctionRatio: auctionRatio(s), auctionShare: s.auctionShare,
    closePct: s.closePct, afterAuctionPct: s.afterAuctionPct, dayAmount: s.dayAmount,
    closeAuctionPct: s.closeAuctionPct, closeAuctionAmount: s.closeAuctionAmount, closeAuctionShare: s.closeAuctionShare,
  }
}

/**
 * 两市合计（上证综指 + 深证综指的分时成交额，东财口径即沪 / 深全市场）：当日与上一交易日竞价额、尾盘竞价额、全天成交额。
 * 任一指数当天不完整返回 null。
 */
export function marketDay(sh, sz, date, prevDate) {
  const a = dayStats(sh, date, prevDate), b = dayStats(sz, date, prevDate)
  if (!a || !b) return null
  const pa = prevDate ? dayStats(sh, prevDate, null) : null, pb = prevDate ? dayStats(sz, prevDate, null) : null
  const sum = (x, y, k) => (x?.[k] === null || y?.[k] === null || x?.[k] === undefined || y?.[k] === undefined ? null : x[k] + y[k])
  const auctionAmount = sum(a, b, 'auctionAmount'), dayAmount = sum(a, b, 'dayAmount'), closeAuctionAmount = sum(a, b, 'closeAuctionAmount')
  const prev = pa && pb ? { auctionAmount: sum(pa, pb, 'auctionAmount'), dayAmount: sum(pa, pb, 'dayAmount'), closeAuctionAmount: sum(pa, pb, 'closeAuctionAmount') } : null
  return {
    date, prevDate: prev ? prevDate : null,
    auctionAmount, closeAuctionAmount, dayAmount,
    auctionShare: share(auctionAmount, dayAmount), closeAuctionShare: share(closeAuctionAmount, dayAmount),
    prevAuctionAmount: prev?.auctionAmount ?? null, prevCloseAuctionAmount: prev?.closeAuctionAmount ?? null, prevDayAmount: prev?.dayAmount ?? null,
    sh: { auctionAmount: a.auctionAmount, closeAuctionAmount: a.closeAuctionAmount }, sz: { auctionAmount: b.auctionAmount, closeAuctionAmount: b.closeAuctionAmount },
  }
}

const yi = (x) => (x === null || x === undefined ? null : r2(x / 1e8, 2))

/** 历史一行（金额单位：亿元） */
export function historyRow(mkt, all, yzt, { backfilled = false } = {}) {
  const a = groupSummary(all), y = groupSummary(yzt)
  return {
    date: mkt.date, ...(backfilled ? { backfilled: true } : {}),
    auctionAmount: yi(mkt.auctionAmount), closeAuctionAmount: yi(mkt.closeAuctionAmount), dayAmount: yi(mkt.dayAmount),
    auctionShare: mkt.auctionShare, closeAuctionShare: mkt.closeAuctionShare,
    n: a.n || null, highOpenRate: a.highOpenRate, avgAuctionPct: a.avgAuctionPct, avgAfterAuction: a.avgAfterAuction,
    yztN: backfilled ? null : y.n || null, yztAvgAuction: backfilled ? null : y.avgAuctionPct,
  }
}

/** 合并历史：正式运行的记录覆盖回补记录；回补记录不覆盖正式记录 */
export function mergeHistory(history, rows, keep = 250) {
  const map = new Map((history ?? []).map((d) => [d.date, d]))
  for (const d of rows) { const old = map.get(d.date); if (!old || old.backfilled || !d.backfilled) map.set(d.date, d) }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep)
}

/** 榜单截取：按 key 排序（null 排除），取前 n */
export function topBy(rows, key, n = 30, dir = 'desc') {
  return rows.filter((r) => r[key] !== null && r[key] !== undefined).sort((a, b) => (dir === 'desc' ? b[key] - a[key] : a[key] - b[key])).slice(0, n)
}
