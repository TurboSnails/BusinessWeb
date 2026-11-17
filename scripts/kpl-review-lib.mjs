// 开盘啦 · 复盘页（/market-mood/review）的纯计算：功能对照开盘啦 App「复盘」「赚钱效应」「亏钱效应」「百日新高」「盘面亮点」。
// 数据全部来自公开行情（东财股池、东财日 K、新浪全市场），不调用开盘啦接口。只做盘后统计，不做预测，不构成投资建议。
//
// 全市场日线快照仓 data-raw/kpl-review/closes/<日期>.csv：每个交易日一个文件，每行「代码,开,高,低,收[,昨收]」。
// 昨收只在与该股上一条记录的收盘价不同时才写（除权除息日、首条记录），用来还原复权：百日新高按复权后的最高价比较。
// 首次用东财日 K（前复权）回补约 122 个交易日（可分批多次运行补齐，进度在 backfill.json）；之后每个交易日收盘后用新浪全市场快照滚动追加。
import { prevTradingDay } from './market-mood-lib.mjs'

export const NEW_HIGH_DAYS = 100 // 百日新高：当日最高价高于此前 99 个交易日（复权后）的最高价，即 100 个交易日窗口内最高
export const NEW_HIGH_MIN_ROWS = 60 // 窗口内至少 60 个交易日有行情（容忍停牌），且窗口起点之前已经上市
export const KEEP_CLOSE_DAYS = 130 // 快照仓保留最近 130 个交易日
export const BACKFILL_DAYS = 122 // 首次回补的交易日数（100 日窗口 + 约 20 日新高走势 + 余量）
export const BIG_LOSS = -7 // 大面：昨日涨停、今日跌幅 ≤ −7%
export const BIG_DROP = -5 // 反包里的「大跌」：昨日跌幅 ≤ −5%
export const FLAT_OPEN = 0.5 // 平开：开盘涨跌幅在 ±0.5% 以内
export const KEEP_DAYS = 250

export const num = (x) => (x === null || x === undefined || String(x).trim() === '' || !Number.isFinite(Number(x)) ? null : Number(x))
export const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
export const rate = (part, total) => (total > 0 ? round((part / total) * 100, 1) : null)
const mean = (xs) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }
const near = (a, b) => a !== null && b !== null && Math.abs(a - b) < 0.0051

/* ---------- 快照仓文件 ---------- */

/** 解析一天的快照：Map(code → {o,h,l,c,p?})；p 缺省表示与上一条记录的收盘价相同 */
export function parseCloses(text) {
  const rows = new Map()
  let meta = {}
  for (const line of String(text).split('\n')) {
    if (!line) continue
    if (line.startsWith('#')) { meta = Object.fromEntries(line.slice(1).trim().split(/\s+/).map((kv) => kv.split('='))); continue }
    const f = line.split(',')
    if (!/^\d{6}$/.test(f[0])) continue
    const [o, h, l, c] = f.slice(1, 5).map(num)
    if (c === null || c <= 0 || h === null || l === null || o === null) continue
    const r = { o, h, l, c }
    const p = num(f[5])
    if (p !== null && p > 0) r.p = p
    rows.set(f[0], r)
  }
  return { meta, rows }
}

/** 写一天的快照（按代码排序，便于 diff） */
export function formatCloses(date, source, rows) {
  const out = [`# date=${date} source=${source} fields=code,open,high,low,close,prev?`]
  for (const code of [...rows.keys()].sort()) {
    const r = rows.get(code)
    out.push([code, r.o, r.h, r.l, r.c, ...(r.p !== undefined ? [r.p] : [])].join(','))
  }
  return out.join('\n') + '\n'
}

/** 东财日 K（fqt=1 前复权；fields2=f51 日期,f52 开,f53 收,f54 高,f55 低,f60 涨跌额）→ [{date,o,h,l,c,p}]，p = 收 − 涨跌额 */
export function parseKline(body, end) {
  const kl = body?.data?.klines
  if (body?.rc !== 0 || !body?.data) throw new Error('东财日 K 返回异常')
  if (!Array.isArray(kl)) return []
  const out = []
  for (const s of kl) {
    const [date, o, c, h, l, chg] = String(s).split(',')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (end && date > end)) continue
    const v = [o, c, h, l].map(num)
    if (v.some((x) => x === null || x <= 0)) continue
    const ch = num(chg)
    out.push({ date, o: v[0], h: v[2], l: v[3], c: v[1], p: ch === null ? null : round(v[1] - ch, 3) })
  }
  return out
}

/**
 * 把一只股票的日 K 并入各日快照：已有的行不覆盖（新浪当日行情优先）。
 * 昨收只在与上一条日 K 收盘价不同（首条、除权）时写入。dayMaps: Map(date → Map(code → row))。
 */
export function mergeKline(dayMaps, code, bars) {
  let last = null
  for (const b of bars) {
    const m = dayMaps.get(b.date)
    if (m && !m.has(code)) {
      const r = { o: b.o, h: b.h, l: b.l, c: b.c }
      if (b.p !== null && b.p > 0 && (last === null || !near(b.p, last))) r.p = b.p
      m.set(code, r)
    }
    last = b.c
  }
}

/** 当日新浪行（parseSinaFull）→ 快照行；停牌（无成交价）不写。lastClose(code) 给出该股上一条记录的收盘价 */
export function sinaToRows(rows, lastClose) {
  const out = new Map()
  for (const r of rows) {
    if (r.price === null || r.open === null || r.high === null || r.low === null) continue
    const row = { o: r.open, h: r.high, l: r.low, c: r.price }
    const lc = lastClose(r.code)
    if (r.prev && (lc === null || !near(r.prev, lc))) row.p = r.prev
    out.set(r.code, row)
  }
  return out
}

/** 某日某股的昨收：显式昨收，否则取更早一条记录的收盘价；days 为升序 [{date, rows}]，i 为该日下标 */
export function prevCloseAt(days, i, code) {
  const r = days[i]?.rows.get(code)
  if (!r) return null
  if (r.p !== undefined) return r.p
  for (let j = i - 1; j >= 0; j--) { const q = days[j].rows.get(code); if (q) return q.c }
  return null
}
export function pctAt(days, i, code) {
  const r = days[i]?.rows.get(code)
  const p = prevCloseAt(days, i, code)
  return r && p ? round(((r.c - p) / p) * 100) : null
}

/* ---------- 百日新高 ---------- */

/**
 * 第 i 天的百日新高名单。窗口 = 第 i−99 … i 天（快照仓里的交易日）。
 * 复权：从第 i 天往前走，遇到某日昨收 ≠ 更早一条记录的收盘价（除权除息），之前的价格乘以 昨收 ÷ 前收盘。
 * 条件：第 i 天有行情；窗口起点当天或之前已有记录（上市满 100 个交易日）；窗口内有行情的天数 ≥ NEW_HIGH_MIN_ROWS；
 * 当日最高价 > 此前窗口内复权最高价。返回 { codes:Set, eligible } 或 null（天数不够）。
 */
export function newHighsAt(days, i, firstSeen) {
  const start = i - (NEW_HIGH_DAYS - 1)
  if (start < 0) return null
  const codes = new Set()
  let eligible = 0
  for (const [code, today] of days[i].rows) {
    if (!(firstSeen.get(code) <= start)) continue
    let factor = 1, maxPrev = -Infinity, n = 1, prevRow = today
    for (let j = i - 1; j >= start; j--) {
      const r = days[j].rows.get(code)
      if (!r) continue
      if (prevRow.p !== undefined) factor *= prevRow.p / r.c
      maxPrev = Math.max(maxPrev, r.h * factor)
      n++
      prevRow = r
    }
    if (n < NEW_HIGH_MIN_ROWS) continue
    eligible++
    if (today.h > maxPrev + 1e-9) codes.add(code)
  }
  return { codes, eligible }
}

export function firstSeenOf(days) {
  const m = new Map()
  days.forEach((d, i) => { for (const c of d.rows.keys()) if (!m.has(c)) m.set(c, i) })
  return m
}

/** 百日新高每日计数（快照仓天数够的日子）；当日新增 = 当日新高且上一交易日不是新高 */
export function newHighHistory(days, firstSeen = firstSeenOf(days)) {
  const out = []
  let prev = null
  for (let i = NEW_HIGH_DAYS - 1; i < days.length; i++) {
    const r = newHighsAt(days, i, firstSeen)
    const fresh = prev && days[i - 1] && prevTradingDay(days[i].date) === days[i - 1].date ? [...r.codes].filter((c) => !prev.has(c)).length : null
    out.push({ date: days[i].date, count: r.codes.size, fresh, eligible: r.eligible })
    prev = r.codes
  }
  return out
}

/* ---------- 涨跌停价与盘面亮点 ---------- */

/** 涨跌幅限制：按股池里的当日涨幅就近取 5 / 10 / 20 / 30%（避免依赖 ST 名称历史）；找不到返回 null */
export function limitRateOf(pct) {
  if (pct === null || !Number.isFinite(pct)) return null
  const a = Math.abs(pct)
  const r = [5, 10, 20, 30].find((x) => Math.abs(a - x) <= 1.2)
  return r ?? null
}
export const limitPrice = (prev, r, dir) => (prev && r ? Math.round((prev * (1 + (dir * r) / 100) + 1e-9) * 100) / 100 : null)

export const TAGS = [
  { id: 'yizi', label: '一字板', polarity: 'up', def: '收盘涨停，且全天开盘价 = 最高价 = 最低价 = 收盘价（只有一个价位）。' },
  { id: 'tzi', label: 'T字板', polarity: 'up', def: '收盘涨停，开盘价即涨停价，盘中最低价低于涨停价（开过板又封回）。' },
  { id: 'huanshou', label: '换手板', polarity: 'up', def: '收盘涨停，开盘价低于涨停价（盘中换手封上）。' },
  { id: 'shouban', label: '首板', polarity: 'up', def: '收盘涨停且连板数为 1（东财涨停池连板数）。' },
  { id: 'fanbao', label: '反包', polarity: 'up', def: `今日收盘涨停，且上一交易日炸板（触及涨停未封住）或上一交易日跌幅 ≤ ${BIG_DROP}%。` },
  { id: 'ditian', label: '地天板', polarity: 'up', def: '今日收盘涨停，且盘中最低价触及跌停价。' },
  { id: 'duanban', label: '断板', polarity: 'down', def: '上一交易日连板（连板数 ≥ 2），今日收盘未涨停。' },
  { id: 'tiandi', label: '天地板', polarity: 'down', def: '今日收盘跌停，且盘中最高价触及涨停价。' },
  { id: 'damian', label: '大面', polarity: 'down', def: `上一交易日涨停，今日跌幅 ≤ ${BIG_LOSS}%。` },
]

/**
 * 当日个股标签。输入：zt/zb/dt/yzt 已校验的当日股池（规整行，含 pct/boards/yBoards/sector）；
 * today/yesterday 快照行 Map；prevClose(code) 当日昨收；yZb 上一交易日炸板代码集合（缺记录为 null）；yPct(code) 上一交易日涨幅。
 * 返回 Map(tagId → [{code,name,pct,sector,boards}])
 */
export function tagStocks({ zt, dt, yzt, today, prevClose, yZb, yPct }) {
  const tags = new Map(TAGS.map((t) => [t.id, []]))
  const add = (id, r, extra = {}) => tags.get(id).push({ code: r.code, name: r.name, pct: round(r.pct), sector: r.sector || '', boards: r.boards ?? null, ...extra })
  const ztCodes = new Set(zt.map((r) => r.code))
  for (const r of zt) {
    const q = today.get(r.code)
    const p = prevClose(r.code)
    const lr = limitRateOf(r.pct)
    if (q) {
      if (q.o === q.h && q.h === q.l && q.l === q.c) add('yizi', r)
      else if (q.o >= q.c - 1e-9) add('tzi', r)
      else add('huanshou', r)
      const ld = limitPrice(p, lr, -1)
      if (ld !== null && q.l <= ld + 1e-9) add('ditian', r)
    }
    if (r.boards === 1) add('shouban', r)
    const yp = yPct(r.code)
    if ((yZb && yZb.has(r.code)) || (yp !== null && yp <= BIG_DROP)) add('fanbao', r, { why: yZb?.has(r.code) ? '昨日炸板' : `昨日 ${yp}%` })
  }
  for (const r of dt) {
    const q = today.get(r.code)
    const lu = limitPrice(prevClose(r.code), limitRateOf(r.pct), 1)
    if (q && lu !== null && q.h >= lu - 1e-9) add('tiandi', r)
  }
  for (const r of yzt) {
    if (r.yBoards >= 2 && !ztCodes.has(r.code)) add('duanban', { ...r, boards: r.yBoards })
    if (r.pct !== null && r.pct <= BIG_LOSS) add('damian', { ...r, boards: r.yBoards })
  }
  return tags
}

/* ---------- 赚钱效应 / 亏钱效应 ---------- */

export const OPEN_BUCKETS = [
  { id: 'le5', label: '≤ −5%', test: (x) => x <= -5 },
  { id: 'm5', label: '−5% ~ −2%', test: (x) => x > -5 && x <= -2 },
  { id: 'm2', label: `−2% ~ −${FLAT_OPEN}%`, test: (x) => x > -2 && x <= -FLAT_OPEN },
  { id: 'flat', label: '平开', test: (x) => x > -FLAT_OPEN && x < FLAT_OPEN },
  { id: 'p2', label: `${FLAT_OPEN}% ~ 2%`, test: (x) => x >= FLAT_OPEN && x < 2 },
  { id: 'p5', label: '2% ~ 5%', test: (x) => x >= 2 && x < 5 },
  { id: 'ge5', label: '≥ 5%', test: (x) => x >= 5 },
]

/**
 * 昨日非一字涨停股今日开盘分布。yCodes 昨日涨停代码；yRow(code) 昨日快照行（判断一字）；openPct(code) 今日开盘涨跌幅。
 * 昨日快照缺失时无法剔除一字板，返回 null。
 */
export function openDistribution(yCodes, yRow, openPct, haveYesterday) {
  if (!haveYesterday) return null
  let oneWord = 0
  const vals = []
  for (const c of yCodes) {
    const y = yRow(c)
    if (!y) continue
    if (y.o === y.h && y.h === y.l && y.l === y.c) { oneWord++; continue }
    const v = openPct(c)
    if (v !== null) vals.push(v)
  }
  const buckets = OPEN_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: vals.filter(b.test).length }))
  return {
    n: vals.length, oneWord, buckets, avg: round(mean(vals)),
    high: vals.filter((x) => x >= FLAT_OPEN).length, flat: vals.filter((x) => x > -FLAT_OPEN && x < FLAT_OPEN).length, low: vals.filter((x) => x <= -FLAT_OPEN).length,
  }
}

/** 盘中涨停 / 曾涨停 / 跌停累计家数（按股池时间还原）。时间格 09:25、09:30…11:30、13:00…15:00，每 5 分钟 */
export const GRID = (() => {
  const out = ['09:25']
  const push = (from, to) => { for (let m = from; m <= to; m += 5) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`) }
  push(9 * 60 + 30, 11 * 60 + 30); push(13 * 60, 15 * 60)
  return out
})()
/** zt：涨停池首次封板时间；touched：涨停池 + 炸板池首次封板时间（曾触及涨停）；dt：跌停池最后封板时间。时间为 'HH:MM:SS' */
export function intradayCurve({ zt, zb, dt }) {
  const at = (times, t) => times.filter((x) => x !== null && x <= `${t}:59`).length
  const ztT = zt.map((r) => r.firstSeal), zbT = zb.map((r) => r.firstSeal), dtT = dt.map((r) => r.lastSeal)
  const missing = { zt: ztT.filter((x) => x === null).length, touched: ztT.filter((x) => x === null).length + zbT.filter((x) => x === null).length, dt: dtT.filter((x) => x === null).length }
  const points = GRID.map((t) => ({ t, zt: at(ztT, t), touched: at(ztT, t) + at(zbT, t), dt: at(dtT, t) }))
  return { points, missing }
}

/**
 * 当日完整记录（历史与页面共用）。
 * pools: {zt, zb, dt, yzt} 规整行（firstSeal/lastSeal 为 'HH:MM:SS'）；days 快照仓升序（含当日）；
 * prevRec 上一交易日的复盘记录（只认 prevTradingDay）；yZbFallback 上一交易日炸板名单（来自打板页历史，可为 null）；industry Map(code→行业)；names Map。
 */
export function buildDay({ date, pools, days, prevRec, yZbFallback = null, industry = new Map(), names = new Map() }) {
  const { zt, zb, dt, yzt } = pools
  const i = days.findIndex((d) => d.date === date)
  if (i < 0) throw new Error(`快照仓缺 ${date}`)
  const today = days[i].rows
  const yDate = prevTradingDay(date)
  const yi = days[i - 1]?.date === yDate ? i - 1 : -1
  const yRows = yi >= 0 ? days[yi].rows : null
  const prevClose = (c) => prevCloseAt(days, i, c)
  const yPct = (c) => (yi >= 0 ? pctAt(days, yi, c) : null)
  const yZb = prevRec?.date === yDate && Array.isArray(prevRec.zb) ? new Set(prevRec.zb) : yZbFallback
  const ztCodes = new Set(zt.map((r) => r.code))

  // 赚钱效应
  const yztPct = yzt.filter((r) => r.pct !== null)
  const first = yzt.filter((r) => r.yBoards === 1)
  const openPct = (c) => { const q = today.get(c), p = prevClose(c); return q && p ? round(((q.o - p) / p) * 100) : null }
  const dist = openDistribution(yzt.map((r) => r.code), (c) => yRows?.get(c), openPct, !!yRows)
  // 亏钱效应
  let drop7 = 0
  for (const c of today.keys()) { const v = pctAt(days, i, c); if (v !== null && v <= BIG_LOSS) drop7++ }
  const tags = tagStocks({ zt, dt, yzt, today, prevClose, yZb, yPct })
  const counts = {
    zt: zt.length, zb: zb.length, dt: dt.length,
    sealRate: rate(zt.length, zt.length + zb.length), brokenRate: rate(zb.length, zt.length + zb.length),
    yzt: yzt.length, yztProfit: rate(yztPct.filter((r) => r.pct > 0).length, yztPct.length), yztAvg: round(mean(yztPct.map((r) => r.pct))),
    first: first.length, firstOk: first.filter((r) => ztCodes.has(r.code)).length, firstToSecond: rate(first.filter((r) => ztCodes.has(r.code)).length, first.length),
    openAvg: dist?.avg ?? null, openHighRate: dist ? rate(dist.high, dist.n) : null,
    bigLoss: tags.get('damian').length, drop7, maxBoard: Math.max(0, ...zt.map((r) => r.boards ?? 0)) || null,
  }
  const record = {
    date, counts, zb: zb.map((r) => r.code),
    tags: Object.fromEntries([...tags].map(([k, v]) => [k, v.map((r) => r.code)])),
  }
  return { record, tags, dist, intraday: intradayCurve({ zt, zb, dt }), industry, names }
}

/** 标签次日表现：对上一交易日记录里的各标签股票，取今日涨幅（快照仓收盘 ÷ 昨收），按标签汇总 {n,sum,red} */
export function nextPerf(prevTags, days, i) {
  const out = {}
  for (const [tag, codes] of Object.entries(prevTags ?? {})) {
    const v = codes.map((c) => pctAt(days, i, c)).filter((x) => x !== null)
    out[tag] = { n: v.length, sum: round(v.reduce((s, x) => s + x, 0), 2), red: v.filter((x) => x > 0).length }
  }
  return out
}

/** 全部历史汇总各标签次日表现：平均涨幅（样本均值）、红盘率、样本数、覆盖天数 */
export function tagStats(store) {
  const acc = new Map(TAGS.map((t) => [t.id, { n: 0, sum: 0, red: 0, days: 0 }]))
  const dates = []
  for (const [d, rec] of Object.entries(store?.days ?? {})) {
    if (!rec.next) continue
    dates.push(d)
    for (const [tag, s] of Object.entries(rec.next)) {
      const a = acc.get(tag)
      if (!a || !s.n) continue
      a.n += s.n; a.sum += s.sum; a.red += s.red; a.days++
    }
  }
  dates.sort()
  const rows = TAGS.map((t) => { const a = acc.get(t.id); return { id: t.id, label: t.label, polarity: t.polarity, n: a.n, days: a.days, avg: a.n ? round(a.sum / a.n) : null, red: rate(a.red, a.n) } })
  return { rows, from: dates[0] ?? null, to: dates.at(-1) ?? null, days: dates.length }
}

/* ---------- 历史种子 ---------- */

/**
 * 早期历史：每日复盘归档（涨停 / 炸板 / 跌停家数）+ 打板页历史（每日涨停名单与连板数、炸板名单）+ 快照仓（收盘涨幅、开盘价）。
 * 只补能从带日期的数据算出的项；昨日记录缺失的项留空。返回 {日期: record}，均标 seeded。
 */
export function seedDays({ snapshots = [], daban = {}, days = [] }) {
  const out = {}
  const idx = new Map(days.map((d, i) => [d.date, i]))
  for (const s of snapshots) {
    if (s?.session !== 'closed' || !/^\d{4}-\d{2}-\d{2}$/.test(s.dataDate ?? '')) continue
    if (!s.sources?.some((x) => x.id === 'limitUp' && x.status === 'ready')) continue
    const m = s.metrics ?? {}
    const zt = Number.isInteger(m.ztCount) ? m.ztCount : Array.isArray(s.upStocks) ? s.upStocks.length : null
    const zb = Number.isInteger(m.ztOpen) ? m.ztOpen : null
    const dt = Number.isInteger(m.dtCount) ? m.dtCount : null
    out[s.dataDate] = { date: s.dataDate, seeded: true, counts: { zt, zb, dt, sealRate: zb === null || zt === null ? null : rate(zt, zt + zb), brokenRate: zb === null || zt === null ? null : rate(zb, zt + zb) } }
  }
  for (const [d, rec] of Object.entries(daban)) {
    const c = out[d]?.counts ?? {}
    const zt = rec.counts?.zt ?? rec.zt?.length ?? c.zt ?? null
    const zb = rec.counts?.zb ?? (Array.isArray(rec.zb) ? rec.zb.length : c.zb ?? null)
    const dt = rec.counts?.dt ?? c.dt ?? null
    out[d] = { date: d, seeded: true, counts: { ...c, zt, zb, dt, sealRate: zt !== null && zb !== null ? rate(zt, zt + zb) : null, brokenRate: zt !== null && zb !== null ? rate(zb, zt + zb) : null } }
  }
  // 依赖昨日涨停名单 + 快照仓的项
  for (const [d, rec] of Object.entries(out)) {
    const y = daban[prevTradingDay(d)]
    const i = idx.get(d)
    if (!y?.zt || i === undefined) continue
    const todayZt = daban[d]?.zt ? new Set(daban[d].zt.map(([c]) => c)) : null
    const yi = days[i - 1]?.date === prevTradingDay(d) ? i - 1 : -1
    const pcts = y.zt.map(([c]) => pctAt(days, i, c)).filter((x) => x !== null)
    const first = y.zt.filter(([, b]) => b === 1)
    const openPct = (c) => { const q = days[i].rows.get(c), p = prevCloseAt(days, i, c); return q && p ? round(((q.o - p) / p) * 100) : null }
    const dist = openDistribution(y.zt.map(([c]) => c), (c) => (yi >= 0 ? days[yi].rows.get(c) : undefined), openPct, yi >= 0)
    let drop7 = 0
    for (const c of days[i].rows.keys()) { const v = pctAt(days, i, c); if (v !== null && v <= BIG_LOSS) drop7++ }
    Object.assign(rec.counts, {
      yzt: y.zt.length, yztProfit: rate(pcts.filter((x) => x > 0).length, pcts.length), yztAvg: round(mean(pcts)),
      first: todayZt ? first.length : null, firstOk: todayZt ? first.filter(([c]) => todayZt.has(c)).length : null,
      firstToSecond: todayZt ? rate(first.filter(([c]) => todayZt.has(c)).length, first.length) : null,
      openAvg: dist?.avg ?? null, openHighRate: dist ? rate(dist.high, dist.n) : null,
      bigLoss: pcts.filter((x) => x <= BIG_LOSS).length, drop7,
      maxBoard: daban[d]?.zt ? Math.max(0, ...daban[d].zt.map(([, b]) => b ?? 0)) || null : null,
    })
  }
  return out
}

/** 合并：真实记录覆盖种子，种子不覆盖真实记录 */
export function mergeStore(store, days, keep = KEEP_DAYS) {
  const all = { ...(store?.days ?? {}) }
  for (const [d, rec] of Object.entries(days)) { const old = all[d]; if (!old || old.seeded || !rec.seeded) all[d] = rec }
  return { days: Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)).slice(-keep)) }
}

const HIST_KEYS = ['zt', 'zb', 'dt', 'sealRate', 'brokenRate', 'yztProfit', 'yztAvg', 'firstToSecond', 'openAvg', 'openHighRate', 'bigLoss', 'drop7', 'maxBoard']
/** 走势用的每日序列（含百日新高计数） */
export function historyOf(store, highs = []) {
  const hi = new Map(highs.map((h) => [h.date, h]))
  const dates = [...new Set([...Object.keys(store?.days ?? {}), ...hi.keys()])].sort()
  return dates.map((d) => {
    const rec = store.days[d]
    const c = rec?.counts ?? {}
    return { date: d, ...(rec && !rec.seeded ? {} : { seeded: true }), ...Object.fromEntries(HIST_KEYS.map((k) => [k, c[k] ?? null])), newHigh: hi.get(d)?.count ?? null, newHighFresh: hi.get(d)?.fresh ?? null }
  })
}

/** 快照仓需要回补的交易日列表：end 往前 n 个交易日（升序） */
export function tradingDaysBack(end, n, isTrading) {
  const out = [end]
  let d = end
  while (out.length < n) { d = prevTradingDay(d); if (!isTrading || isTrading(d)) out.unshift(d) }
  return out
}
