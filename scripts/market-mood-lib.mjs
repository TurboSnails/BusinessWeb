// 短线情绪页（/market-mood）的纯计算：功能对照开盘啦「市场情绪」页，数据全部来自公开行情（东财股池、新浪全市场、东财融资余额）。
// 开盘啦的综合强度、连板强度、活跃股数值在它的服务器上计算，安装包里没有算法；这里的公式是本站自定，页面上写明口径。
// 只做盘后统计，不做盘中预测，不构成投资建议。
import { computeBreadth } from '../server/market-sentiment.mjs'

export const RETREAT_MIN = 7 // 大幅回撤：较当日最高价回落 ≥ 7 个百分点（以昨收为基数）
export const BIG_RISE = 7 // 「大涨」口径：当日涨幅或最高涨幅 ≥ 7%
export const MOOD_HOT = 2 // 活跃股平均涨幅 ≥ 2% 视为短线活跃（开盘啦页面注释同口径）
export const MOOD_ICE = -1 // ≤ −1% 视为冰点
export const LB_HOT = 75 // 连板强度 > 75 偏热、< 25 偏冷（开盘啦页面注释同口径）
export const LB_COLD = 25

const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
const mean = (xs) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }
const rate = (part, total) => (total > 0 ? round((part / total) * 100, 1) : null)
/** 把 v 从 [lo, hi] 线性映射到 [0, 100] 并截断 */
// 上交所 2026 年休市安排（同 src/services/limitUp.ts）；之后的年份需要补充，缺失时只按周末判断
const HOLIDAYS = [
  ['2026-01-01', '2026-01-03'], ['2026-02-15', '2026-02-23'], ['2026-04-04', '2026-04-06'],
  ['2026-05-01', '2026-05-05'], ['2026-06-19', '2026-06-21'], ['2026-09-25', '2026-09-27'], ['2026-10-01', '2026-10-07'],
]
/** 休市表是否覆盖 date 所在年份：不覆盖时 isTradingDay 只能按周末判断，依赖精确交易日的脚本应拒绝运行 */
export const calendarCovers = (d) => HOLIDAYS.some(([a]) => a.slice(0, 4) === String(d).slice(0, 4))
export const isTradingDay = (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !HOLIDAYS.some(([a, b]) => d >= a && d <= b)
/** date 之前最近的交易日 */
export function prevTradingDay(date) {
  let t = Date.parse(`${date}T00:00:00Z`)
  for (;;) { t -= 864e5; const d = new Date(t).toISOString().slice(0, 10); if (isTradingDay(d)) return d }
}
export const lin = (v, lo, hi) => (v === null || !Number.isFinite(v) ? null : Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)))
export const isST = (name) => /ST/i.test(String(name ?? ''))
/** 新股（上市首日 N、注册制前 5 日 C）：涨跌幅不设限，不计入大幅回撤 */
export const isNew = (name) => /^[NC]/.test(String(name ?? ''))

/** 证券所属板块：上证主板 / 科创板 / 深证主板 / 创业板 / 北证 */
export function boardOf(symbolOrCode) {
  const s = String(symbolOrCode)
  const code = s.replace(/^(sh|sz|bj)/, '')
  if (s.startsWith('bj') || /^(4|8|92)/.test(code)) return 'bj'
  if (/^68/.test(code)) return 'kcb'
  if (/^6/.test(code)) return 'sh'
  if (/^3/.test(code)) return 'cyb'
  return 'sz'
}

/** 新浪全市场行情行 → {code, name, pct, price, high, prev, amount}（停牌 pct 为 null） */
export function parseSinaRow(row) {
  if (!/^(sh|sz|bj)\d{6}$/.test(row?.symbol) || typeof row.name !== 'string') throw new Error('全市场证券字段异常')
  const n = (x) => (x === null || x === undefined || String(x).trim() === '' || !Number.isFinite(Number(x)) ? null : Number(x))
  const price = n(row.trade), prev = n(row.settlement), high = n(row.high)
  const live = price !== null && price > 0
  return {
    symbol: row.symbol, code: row.symbol.slice(2), name: row.name.trim(),
    pct: live ? n(row.changepercent) : null, price: live ? price : null, high: live && high > 0 ? high : null, prev: prev > 0 ? prev : null,
    amount: live ? n(row.amount) ?? 0 : 0,
  }
}

/** 东财股池（涨停/炸板/跌停/昨日涨停）→ 规整行；校验日期与完整性 */
export function parsePool(body, date) {
  const d = body?.data
  const qdate = String(d?.qdate ?? '')
  const want = date.replaceAll('-', '')
  if (body?.rc !== 0 || !d || qdate !== want || !Array.isArray(d.pool) || d.tc !== d.pool.length) throw new Error(`股池日期或完整性校验失败（${qdate || '无日期'}）`)
  return d.pool.map((r) => {
    if (!/^\d{6}$/.test(r?.c) || typeof r.n !== 'string') throw new Error('股池字段不完整')
    // null / 空串不能当 0：缺失就是缺失
    const num = (x) => (x === null || x === undefined || String(x).trim() === '' || !Number.isFinite(Number(x)) ? null : Number(x))
    return { code: r.c, name: r.n.trim(), pct: num(r.zdp), boards: num(r.lbc), yBoards: num(r.ylbc), sector: typeof r.hybk === 'string' ? r.hybk : '', firstSeal: num(r.fbt), opens: num(r.zbc) }
  })
}

/** 东财融资余额（RPTA_RZRQ_LSHJ）→ 升序 [{date, balance(亿), ratio(%), hs300}]；NEW 字段是沪深300 收盘点位 */
export function parseMargin(body) {
  const rows = body?.result?.data
  if (!Array.isArray(rows) || !rows.length) throw new Error('融资余额数据为空')
  const n = (x) => (x === null || x === undefined || String(x).trim() === '' || !Number.isFinite(Number(x)) ? null : Number(x))
  return rows.map((r) => ({ date: String(r.DIM_DATE).slice(0, 10), balance: n(r.RZYE) === null ? null : round(n(r.RZYE) / 1e8, 0), ratio: round(n(r.RZYEZB), 3), hs300: round(n(r.NEW), 2) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.balance !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 各板块成交额（亿元） */
export function amountByBoard(rows) {
  const out = { total: 0, sh: 0, kcb: 0, sz: 0, cyb: 0, bj: 0 }
  for (const r of rows) { const b = boardOf(r.symbol); out[b] += r.amount; out.total += r.amount }
  for (const k of Object.keys(out)) out[k] = round(out[k] / 1e8, 0)
  return out
}

/** 涨停池按连板数统计：一板、二板、三板、四板、五板及以上（高度板），最高板 */
export function boardCounts(zt, key = 'boards') {
  const c = { b1: 0, b2: 0, b3: 0, b4: 0, high: 0, max: 0 }
  for (const r of zt) {
    const b = r[key]
    if (!Number.isInteger(b) || b < 1) continue
    if (b === 1) c.b1++; else if (b === 2) c.b2++; else if (b === 3) c.b3++; else if (b === 4) c.b4++; else c.high++
    c.max = Math.max(c.max, b)
  }
  return c
}

/** 连板强度（0–100）：昨日连板股今日平均涨幅、连板晋级率、最高板三项各映射到 0–100 后取平均；缺项时用其余项 */
export function lbStrength({ lbPerf, lbPromotion, maxBoard }) {
  const parts = [lin(lbPerf, -5, 5), lin(lbPromotion, 0, 50), lin(maxBoard, 2, 7)].filter((x) => x !== null)
  return parts.length ? round(mean(parts), 0) : null
}

/** 综合强度（0–100）：上涨家数占比、涨停占（涨停+跌停）比、活跃股表现、连板强度取平均 */
export function compositeStrength({ up, down, zt, dt, mood, lb }) {
  const parts = [up + down > 0 ? (up / (up + down)) * 100 : null, zt + dt > 0 ? (zt / (zt + dt)) * 100 : null, lin(mood, -3, 4), lb].filter((x) => x !== null && x !== undefined)
  return parts.length ? round(mean(parts), 0) : null
}

export const moodStatus = (m) => (m === null || m === undefined ? '无数据' : m >= MOOD_HOT ? '活跃' : m <= MOOD_ICE ? '冰点' : '不活跃')
export const zoneOf = (s) => (s === null || s === undefined ? '无数据' : s >= 70 ? '偏热' : s <= 30 ? '偏冷' : '中性')

const sign = (x, unit = '%') => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : ''}${x}${unit}`)

/** 盘面点评：只陈述当日统计，按固定规则拼句，不做预测 */
export function commentOf(day, hsAmount) {
  const s = []
  if (day.up !== null && day.down !== null) s.push(`上涨 ${day.up} 家、下跌 ${day.down} 家${day.up > day.down * 1.5 ? '，普涨' : day.down > day.up * 1.5 ? '，普跌' : ''}`)
  s.push(`涨停 ${day.zt} 家、跌停 ${day.dt} 家，封板率 ${day.sealRate ?? '—'}%`)
  if (day.amount?.total) s.push(`沪深京成交 ${day.amount.total} 亿${hsAmount?.prev ? `，沪深较上一交易日${hsAmount.today >= hsAmount.prev ? '放量' : '缩量'} ${Math.abs(hsAmount.today - hsAmount.prev)} 亿` : ''}`)
  s.push(`最高 ${day.boards.max} 板，连板晋级率 ${day.rates.lbPromotion ?? '—'}%`)
  if (day.perf.zt !== null) s.push(`昨日涨停今日平均 ${sign(day.perf.zt)}`)
  s.push(`短线情绪${moodStatus(day.mood)}，综合强度${zoneOf(day.composite)}`)
  return s.join('；') + '。'
}

/**
 * 当日完整记录。输入都是已校验的当日数据：
 * zt/zb/dt 当日涨停/炸板/跌停池；yzt 昨日涨停池（含今日涨幅、昨日连板数）；
 * rows 新浪全市场；prevState 上一交易日留下的代码清单（昨日炸板、昨日大涨）。
 */
export function buildDay({ date, zt, zb, dt, yzt, rows, prevState, hsAmountPrev = null, weight }) {
  const byCode = new Map(rows.map((r) => [r.code, r]))
  const breadth = computeBreadth({ rows: rows.map((r) => ({ code: r.code, pct: r.pct })), limitUp: zt.filter((r) => byCode.has(r.code)), limitDown: dt.filter((r) => byCode.has(r.code)) })
  const ztCodes = new Set(zt.map((r) => r.code))
  // 只认上一交易日的清单：中间漏采一天时，前天的炸板/大涨不能当昨天的用
  const statePrev = prevState && prevState.date === prevTradingDay(date) ? prevState : null
  // 昨日表现
  const yLb = yzt.filter((r) => r.yBoards >= 2)
  const yBrokenPct = (statePrev?.zbCodes ?? []).map((c) => byCode.get(c)?.pct).filter((x) => Number.isFinite(x))
  const perf = {
    zt: round(mean(yzt.map((r) => r.pct)), 2),
    lb: round(mean(yLb.map((r) => r.pct)), 2),
    broken: statePrev ? round(mean(yBrokenPct), 2) : null,
    ztRed: rate(yzt.filter((r) => r.pct > 0).length, yzt.filter((r) => Number.isFinite(r.pct)).length),
  }
  // 晋级率：今日 n 板家数 ÷ 昨日 n−1 板家数
  const yb = boardCounts(yzt, 'yBoards'), tb = boardCounts(zt)
  const rates = {
    r12: rate(tb.b2, yb.b1), r23: rate(tb.b3, yb.b2), r34: rate(tb.b4, yb.b3), rHigh: rate(tb.high, yb.b4 + yb.high),
    lb: rate(yzt.filter((r) => ztCodes.has(r.code)).length, yzt.length),
    lbPromotion: rate(yLb.filter((r) => ztCodes.has(r.code)).length, yLb.length),
  }
  // 活跃股（短线情绪）：昨日涨停 + 昨日炸板股今日平均涨幅
  const moodPcts = [...yzt.map((r) => r.pct), ...yBrokenPct]
  const mood = round(mean(moodPcts), 2)
  // 大幅回撤：昨日涨停/大涨、今日有过涨停/大涨的股票里，较最高价回落 ≥ RETREAT_MIN 个百分点
  const pool = new Set([...yzt.map((r) => r.code), ...(statePrev?.bigCodes ?? []), ...ztCodes, ...zb.map((r) => r.code)])
  const sectorOf = new Map([...dt, ...yzt, ...zb, ...zt].map((r) => [r.code, r.sector]))
  const retreatStocks = []
  for (const r of rows) {
    if (r.pct === null || !r.high || !r.prev || isNew(r.name)) continue
    const highPct = ((r.high - r.prev) / r.prev) * 100
    if (!(pool.has(r.code) || highPct >= BIG_RISE)) continue
    const back = round(((r.high - r.price) / r.prev) * 100, 2) // 先取两位小数再比较，避免 6.9999 这类浮点误差
    if (back >= RETREAT_MIN) retreatStocks.push({ code: r.code, name: r.name, pct: round(r.pct, 2), retreat: back, sector: sectorOf.get(r.code) || '' })
  }
  retreatStocks.sort((a, b) => b.retreat - a.retreat)
  const ztReal = zt.filter((r) => !isST(r.name)).length, dtReal = dt.filter((r) => !isST(r.name)).length
  const amount = amountByBoard(rows)
  const lb = lbStrength({ lbPerf: perf.lb, lbPromotion: rates.lbPromotion, maxBoard: tb.max || null })
  const day = {
    date, amount, up: breadth.up, down: breadth.down, flat: breadth.flat,
    zt: zt.length, dt: dt.length, ztReal, dtReal, broken: zb.length,
    sealRate: rate(zt.length, zt.length + zb.length), brokenRate: rate(zb.length, zt.length + zb.length),
    boards: tb, rates, perf, mood, lbStrength: lb, retreat: retreatStocks.length,
  }
  day.composite = compositeStrength({ up: day.up, down: day.down, zt: ztReal, dt: dtReal, mood, lb })
  // 风向标：涨停最集中的两个行业
  const bySector = new Map()
  for (const r of zt) { if (!r.sector) continue; const a = bySector.get(r.sector) ?? []; a.push(r); bySector.set(r.sector, a) }
  const vane = [...bySector.entries()].sort((a, b) => b[1].length - a[1].length || Math.max(...b[1].map((x) => x.boards ?? 1)) - Math.max(...a[1].map((x) => x.boards ?? 1))).slice(0, 2)
    .map(([sector, list]) => ({ sector, count: list.length, stocks: [...list].sort((a, b) => (b.boards ?? 1) - (a.boards ?? 1) || (a.firstSeal ?? 0) - (b.firstSeal ?? 0)).slice(0, 6).map((r) => ({ code: r.code, name: r.name, boards: r.boards })) }))
  // 连板天梯（二板及以上）
  const ladder = []
  for (let b = tb.max; b >= 2; b--) { const list = zt.filter((r) => r.boards === b); if (list.length) ladder.push({ boards: b, stocks: list.map((r) => ({ code: r.code, name: r.name, sector: r.sector })) }) }
  const latest = {
    ...day, buckets: breadth.buckets, medianPct: breadth.medianPct, suspended: breadth.suspended,
    retreatStocks: retreatStocks.slice(0, 50), vane, ladder, weight: weight ?? null,
    moodStatus: moodStatus(mood), zone: zoneOf(day.composite), comment: commentOf(day, { today: amount.total - amount.bj, prev: hsAmountPrev }),
  }
  const state = {
    date, zbCodes: zb.map((r) => r.code),
    bigCodes: rows.filter((r) => r.pct !== null && r.pct >= BIG_RISE && !ztCodes.has(r.code)).map((r) => r.code),
  }
  return { day, latest, state }
}

/** 从每日复盘归档（public/data/daily-analysis.json）补出早期历史：只有涨停池与连板，没有全市场与昨日涨停池的项留空 */
export function seedFromArchive(snapshots) {
  const ok = snapshots.filter((s) => s.session === 'closed' && Array.isArray(s.upStocks) && s.sources?.some((x) => x.id === 'limitUp' && x.status === 'ready'))
    .sort((a, b) => a.dataDate.localeCompare(b.dataDate))
  const out = []
  ok.forEach((s, i) => {
    // 只和上一交易日比；归档缺天时该日晋级率留空，不拿更早的一天充数
    const prev = ok[i - 1]?.dataDate === prevTradingDay(s.dataDate) ? ok[i - 1] : null
    const zt = s.upStocks
    const tb = boardCounts(zt)
    const prevB = prev ? boardCounts(prev.upStocks) : null
    const codes = new Set(zt.map((r) => r.code))
    const pLb = prev ? prev.upStocks.filter((r) => r.boards >= 2) : []
    const br = s.sentiment?.breadth?.status === 'ready' ? s.sentiment.breadth : null
    const lu = s.sentiment?.limitUp?.status === 'ready' ? s.sentiment.limitUp : null
    const broken = Number.isInteger(s.metrics?.ztOpen) ? s.metrics.ztOpen : null
    const dt = Number.isInteger(s.metrics?.dtCount) ? s.metrics.dtCount : 0
    const rates = prev ? {
      r12: rate(tb.b2, prevB.b1), r23: rate(tb.b3, prevB.b2), r34: rate(tb.b4, prevB.b3), rHigh: rate(tb.high, prevB.b4 + prevB.high),
      lb: rate(prev.upStocks.filter((r) => codes.has(r.code)).length, prev.upStocks.length),
      lbPromotion: rate(pLb.filter((r) => codes.has(r.code)).length, pLb.length),
    } : { r12: null, r23: null, r34: null, rHigh: null, lb: null, lbPromotion: null }
    const lb = lbStrength({ lbPerf: null, lbPromotion: rates.lbPromotion, maxBoard: tb.max || null })
    const day = {
      date: s.dataDate, seeded: true, amount: null, // 归档成交额只含沪深，与沪深京口径不同，量能历史改用 amountHistory
      up: br?.up ?? null, down: br?.down ?? null, flat: br?.flat ?? null,
      zt: zt.length, dt, ztReal: zt.filter((r) => !isST(r.name)).length, dtReal: null, broken,
      sealRate: broken === null ? null : rate(zt.length, zt.length + broken), brokenRate: broken === null ? null : rate(broken, zt.length + broken),
      boards: tb, rates, perf: { zt: lu?.averagePct ?? null, lb: null, broken: null, ztRed: lu?.redRate ?? null }, mood: null, lbStrength: lb, retreat: null,
    }
    day.composite = br ? compositeStrength({ up: br.up, down: br.down, zt: day.ztReal, dt, mood: null, lb }) : null
    out.push(day)
  })
  return out
}

/** 状态文件按日期保存最近几天的代码清单；取早于 date 的最近一天（同一天重跑不会把当天清单当成昨天的） */
export function pickPrevState(store, date) {
  const days = store?.days ?? (store?.date ? { [store.date]: store } : {})
  const key = Object.keys(days).filter((d) => d < date).sort().at(-1)
  return key ? { date: key, ...days[key] } : null
}
export function saveState(store, state, keep = 5) {
  const days = { ...(store?.days ?? {}), [state.date]: { zbCodes: state.zbCodes, bigCodes: state.bigCodes } }
  return { days: Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-keep)) }
}

/** 合并历史：同日期以新记录为准（种子记录永远让位给真实记录），按日期升序，保留最近 keep 天 */
export function mergeHistory(history, days, keep = 250) {
  const map = new Map(history.map((d) => [d.date, d]))
  for (const d of days) { const old = map.get(d.date); if (!old || old.seeded || !d.seeded) map.set(d.date, d) }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep)
}

/** 东财指数分时（trends2，ndays=2）→ {日期: [{t:'HH:MM', amount(元)}]}；f57 为每分钟成交额 */
export function parseTrends(body) {
  const rows = body?.data?.trends
  if (body?.rc !== 0 || !Array.isArray(rows) || !rows.length) throw new Error('东财分时数据异常')
  const out = {}
  for (const s of rows) {
    const f = String(s).split(',')
    const [date, t] = (f[0] ?? '').split(' ')
    const amount = f[6] === undefined || f[6].trim() === '' ? NaN : Number(f[6])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(t ?? '') || !Number.isFinite(amount)) continue
    ;(out[date] ??= []).push({ t, amount })
  }
  return out
}

/**
 * 当日量能：上证综指 + 深证综指（+ 北证50）每分钟成交额累加，与上一交易日同一时刻比较（开盘啦「市场量能 · 当日」）。
 * 开盘啦的「沪深京」量能就是这三个指数成交额之和（2026-11-17/18 两天与 App 显示的 14676 亿 / 13801 亿一致）。
 * 上证、深证当天与上一交易日都要齐全（每天 241 个分钟点），否则返回 null，不画半截曲线；北证50 不齐全时退回沪深口径。
 */
export function intradayAmount(sh, sz, date, bj = null) {
  const prev = prevTradingDay(date)
  const ok = (m) => m?.[date]?.length >= 241 && m?.[prev]?.length >= 241
  if (!ok(sh) || !ok(sz)) return null
  const parts = ok(bj) ? [sz, bj] : [sz]
  const cum = (day) => {
    const maps = parts.map((m) => new Map(m[day].map((r) => [r.t, r.amount])))
    let acc = 0
    return sh[day].filter((r) => maps.every((m) => m.has(r.t))).map((r) => { acc += r.amount + maps.reduce((a, m) => a + m.get(r.t), 0); return { t: r.t, cum: acc } })
  }
  const today = cum(date), before = new Map(cum(prev).map((r) => [r.t, r.cum]))
  const points = today.filter((r) => before.has(r.t)).map((r) => ({ t: r.t, cum: round(r.cum / 1e8, 0), prevCum: round(before.get(r.t) / 1e8, 0) }))
  if (points.length < 240) return null
  const last = points.at(-1)
  return { date, prevDate: prev, scope: parts.length === 2 ? '沪深京' : '沪深', total: last.cum, prevTotal: last.prevCum, points }
}

/**
 * 量能历史（指数口径，元 → 亿元）：total 为沪深两市（上证综指 + 深证综指），另给分板块：
 * 上证主板 = 上证综指 − 科创综指，科创板 = 科创综指，深证主板 = 深证综指 − 创业板综指，创业板 = 创业板综指，北证 = 北证50。
 * 某板块的指数缺这一天就记 null，不当 0。
 */
export function boardAmountHistory({ sh, sz, kcb = null, cyb = null, bj = null }) {
  const yi = (v) => (Number.isFinite(v) ? Math.round(v / 1e8) : null)
  return [...sh.keys()].filter((d) => sz.has(d)).sort().map((d) => {
    const k = kcb?.get(d), c = cyb?.get(d), b = bj?.get(d)
    return {
      date: d, total: yi(sh.get(d) + sz.get(d)),
      sh: Number.isFinite(k) ? yi(sh.get(d) - k) : null, kcb: yi(k),
      sz: Number.isFinite(c) ? yi(sz.get(d) - c) : null, cyb: yi(c), bj: yi(b),
    }
  })
}

/**
 * 融资余额全历史：东财 RPTA_RZRQ_LSHJ 分页行 → [日期, 融资余额(亿元), 占流通市值(%), 沪深300]，按日期升序、去重。
 * 行数与接口 count 不符（漏页/重页）时抛错，不写半截历史；单个字段缺失记 null，不当 0。
 */
export function marginHistoryRows(rows, count) {
  const parsed = parseMargin({ result: { data: rows } })
  const byDate = new Map(parsed.map((r) => [r.date, r]))
  if (!Number.isInteger(count) || rows.length !== count || byDate.size !== count) throw new Error(`融资余额历史不完整（${byDate.size}/${rows.length}/${count}）`)
  return [...byDate.values()].map((r) => [r.date, r.balance, r.ratio, r.hs300])
}
