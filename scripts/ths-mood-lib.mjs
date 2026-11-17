// 「同花顺」页（/ths-mood）的纯计算：功能参照同花顺 App V11.65.03 与市场情绪、涨停相关的模块，数据全部来自公开行情
// （东财股池、新浪全市场、东财指数日 K）。不调用同花顺自己的接口。
// 同花顺的情绪指数、盘面评分、强弱指数等数值在它的服务器上计算，安装包里没有算法；这里的公式是本站自定，页面上写明口径。
// 只做盘后统计，不做盘中预测，不构成投资建议。
import { computeBreadth } from '../server/market-sentiment.mjs'
import { isST, lin, parseSinaRow } from './market-mood-lib.mjs'

export const EMO_HOT = 70 // 情绪指数 ≥ 70：贪婪风险区（区间名沿用同花顺 App）
export const EMO_COLD = 30 // ≤ 30：恐慌机会区；其余为情绪中立区
export const TERTILE_WINDOW = 90 // 情绪状态：与过去 90 个交易日比较（同花顺「卖空状态」的三分位口径）
export const TERTILE_MIN = 20 // 过去记录少于 20 天时不判断
export const HOT_N = 10 // 短线风向标：昨日最热涨停股取 10 只
export const OPEN_GOOD = 2 // 最热涨停股平均开盘涨幅 ≥ 2% 视为竞价高开
export const OPEN_BAD = -2 // ≤ −2% 视为竞价大幅低开
export const TEN_DAYS = 10 // 近 10 日涨停数

const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
const mean = (xs) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }
const rate = (part, total) => (total > 0 ? round((part / total) * 100, 1) : null)
const sign = (x, unit = '%') => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : ''}${x}${unit}`)

/** 新浪全市场行情行，多取开盘价（今日开盘价即 9:25 集合竞价成交价） */
export function parseQuote(row) {
  const base = parseSinaRow(row)
  const open = Number(row.open)
  return { ...base, open: base.price !== null && Number.isFinite(open) && open > 0 ? open : null }
}

/** 东财股池 → 规整行（比开盘啦页多取封板资金、成交额、价格、涨停统计、昨日封板时间）；校验日期与完整性 */
export function parsePoolFull(body, date) {
  const d = body?.data
  const qdate = String(d?.qdate ?? '')
  if (body?.rc !== 0 || !d || qdate !== date.replaceAll('-', '') || !Array.isArray(d.pool) || d.tc !== d.pool.length) throw new Error(`股池日期或完整性校验失败（${qdate || '无日期'}）`)
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null)
  return d.pool.map((r) => {
    if (!/^\d{6}$/.test(r?.c) || typeof r.n !== 'string') throw new Error('股池字段不完整')
    return {
      code: r.c, name: r.n.trim(), pct: num(r.zdp), price: num(r.p) === null ? null : num(r.p) / 1000,
      boards: num(r.lbc), yBoards: num(r.ylbc), firstSeal: num(r.fbt), yFirstSeal: num(r.yfbt), opens: num(r.zbc),
      fund: num(r.fund), amount: num(r.amount), sector: typeof r.hybk === 'string' ? r.hybk : '',
      days: num(r.zttj?.days), times: num(r.zttj?.ct),
    }
  })
}

/** 东财日 K（fields2=f51,f53,f57：日期、收盘、成交额）→ 升序 [{date, close, amount}] */
export function parseKline(body) {
  if (body?.rc !== 0 || !Array.isArray(body?.data?.klines) || !body.data.klines.length) throw new Error('东财日 K 数据异常')
  return body.data.klines.map((s) => { const [date, close, amount] = String(s).split(','); return { date, close: Number(close), amount: Number(amount) } })
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.close))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 沪深两市成交额（亿元）：上证综指 + 深证综指 日 K 成交额 */
export function hsAmounts(sh, sz) {
  const szMap = new Map(sz.map((r) => [r.date, r.amount]))
  return sh.filter((r) => szMap.has(r.date) && Number.isFinite(r.amount)).map((r) => ({ date: r.date, total: Math.round((r.amount + szMap.get(r.date)) / 1e8) }))
}

/** Wilder RSI：period 日平均涨幅 ÷（平均涨幅 + 平均跌幅）× 100；返回与 closes 等长的数组（前 period 个为 null） */
export function rsiSeries(closes, period = 14) {
  const out = closes.map(() => null)
  if (closes.length <= period) return out
  let gain = 0, loss = 0
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) gain += d; else loss -= d }
  gain /= period; loss /= period
  const val = () => (gain + loss === 0 ? 50 : round((gain / (gain + loss)) * 100, 1))
  out[period] = val()
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = val()
  }
  return out
}

/** 短期大盘趋势四档（文字沿用同花顺「盘面评分：短期大盘趋势弱 / 偏弱 / 偏强 / 强」） */
export const trendLevel = (score) => (score === null || score === undefined ? '无数据' : score <= 1 ? '弱' : score === 2 ? '偏弱' : score === 3 ? '偏强' : '强')

/**
 * 盘面评分与强弱指数（上证指数）：
 * 评分 = 5 项条件满足几项：收盘 > MA5、收盘 > MA10、收盘 > MA20、MA5 > MA20、近 5 日涨幅 > 0；0–1 弱、2 偏弱、3 偏强、4–5 强。
 * 强弱指数 = 14 日 RSI。返回每日序列（前 20 天不足以算均线，跳过）。
 */
export function trendSeries(kline) {
  const closes = kline.map((r) => r.close)
  const rsi = rsiSeries(closes, 14)
  const ma = (i, n) => (i + 1 >= n ? closes.slice(i + 1 - n, i + 1).reduce((s, x) => s + x, 0) / n : null)
  const out = []
  for (let i = 19; i < kline.length; i++) {
    const c = closes[i], ma5 = ma(i, 5), ma10 = ma(i, 10), ma20 = ma(i, 20)
    const chg5 = i >= 5 ? ((c - closes[i - 5]) / closes[i - 5]) * 100 : null
    const checks = [c > ma5, c > ma10, c > ma20, ma5 > ma20, chg5 !== null && chg5 > 0]
    const score = checks.filter(Boolean).length
    out.push({ date: kline[i].date, close: round(c, 2), pct: round(((c - closes[i - 1]) / closes[i - 1]) * 100, 2), ma5: round(ma5, 2), ma10: round(ma10, 2), ma20: round(ma20, 2), chg5: round(chg5, 2), score, level: trendLevel(score), rsi: rsi[i], checks })
  }
  return out
}

/** 情绪指数区间（名称沿用同花顺 App「投资者情绪」） */
export const emotionZone = (v) => (v === null || v === undefined ? '无数据' : v >= EMO_HOT ? '贪婪风险区' : v <= EMO_COLD ? '恐慌机会区' : '情绪中立区')

/**
 * 情绪指数（0–100）：五项各映射到 0–100 后取平均；必须有全市场涨跌（breadth），且至少 3 项有数据才计算（避免只剩涨停类指标时偏高）。
 * breadth 上涨家数 ÷（上涨＋下跌）；limit 涨停 ÷（涨停＋跌停）（不含 ST）；seal 封板率 涨停 ÷（涨停＋炸板）；
 * premium 昨日涨停股今日平均涨幅（−4%→0，+4%→100）；volume 沪深成交额 ÷ 前 20 个交易日均值（0.7→0，1.3→100）。
 */
export function emotionIndex({ up, down, zt, dt, broken, premium, volRatio }) {
  const parts = {
    breadth: Number.isFinite(up) && Number.isFinite(down) && up + down > 0 ? round((up / (up + down)) * 100, 1) : null,
    limit: Number.isFinite(zt) && Number.isFinite(dt) && zt + dt > 0 ? round((zt / (zt + dt)) * 100, 1) : null,
    seal: Number.isFinite(zt) && Number.isFinite(broken) && zt + broken > 0 ? round((zt / (zt + broken)) * 100, 1) : null,
    premium: round(lin(premium ?? null, -4, 4), 1),
    volume: round(lin(volRatio ?? null, 0.7, 1.3), 1),
  }
  const vals = Object.values(parts).filter((x) => x !== null)
  return { value: parts.breadth !== null && vals.length >= 3 ? round(mean(vals), 0) : null, parts }
}

/** 线性插值分位数（xs 已排序） */
export function quantile(sorted, q) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/**
 * 情绪状态（较高 / 正常 / 较低）：今日情绪指数与过去 90 个交易日（不含今天）比较，
 * 高于 66.66% 分位为较高、低于 33.33% 分位为较低，其余为正常；过去不足 20 天不判断。
 */
export function tertileState(value, pastValues) {
  const past = pastValues.filter((x) => Number.isFinite(x)).slice(-TERTILE_WINDOW)
  if (value === null || value === undefined || past.length < TERTILE_MIN) return { state: null, p33: null, p67: null, n: past.length }
  const s = [...past].sort((a, b) => a - b)
  const p33 = round(quantile(s, 1 / 3), 1), p67 = round(quantile(s, 2 / 3), 1)
  return { state: value > p67 ? '较高' : value < p33 ? '较低' : '正常', p33, p67, n: past.length }
}

/** 涨停封成比 = 封板资金 ÷ 当日成交额（同花顺口径为封单量 ÷ 成交量；封单按涨停价计，这里用金额比近似） */
export const fcbOf = (r) => (Number.isFinite(r.fund) && Number.isFinite(r.amount) && r.amount > 0 ? round(r.fund / r.amount, 2) : null)

/** HHMMSS 数字 → "09:25" */
export const hhmm = (t) => (Number.isFinite(t) && t > 0 ? `${String(Math.floor(t / 10000)).padStart(2, '0')}:${String(Math.floor(t / 100) % 100).padStart(2, '0')}` : null)

/**
 * 短线市场风向标（同花顺：观察昨日最热涨停股竞价表现）：
 * 「最热」按昨日连板数从高到低、同板数按昨日首次封板时间从早到晚取前 HOT_N 只（同花顺用自家人气热度，无公开来源）；
 * 竞价表现 = 今日开盘价较昨收涨幅（开盘价即 9:25 集合竞价成交价）。
 */
export function hotVane(yzt, byCode) {
  const withOpen = yzt.map((r) => {
    const q = byCode.get(r.code)
    const openPct = q?.open && q.prev ? round(((q.open - q.prev) / q.prev) * 100, 2) : null
    return { code: r.code, name: r.name, boards: r.yBoards ?? 1, openPct, pct: Number.isFinite(q?.pct) ? round(q.pct, 2) : round(r.pct, 2), sector: r.sector, yFirstSeal: r.yFirstSeal }
  })
  const hot = [...withOpen].sort((a, b) => b.boards - a.boards || (a.yFirstSeal ?? 999999) - (b.yFirstSeal ?? 999999)).slice(0, HOT_N)
  const avgOpen = round(mean(hot.map((r) => r.openPct)), 2)
  return {
    stocks: hot.map(({ yFirstSeal, ...r }) => r),
    avgOpen, avgClose: round(mean(hot.map((r) => r.pct)), 2),
    highOpen: hot.filter((r) => r.openPct !== null && r.openPct > 0).length, lowOpen: hot.filter((r) => r.openPct !== null && r.openPct < 0).length,
    verdict: avgOpen === null ? '无数据' : avgOpen >= OPEN_GOOD ? '竞价高开' : avgOpen <= OPEN_BAD ? '竞价大幅低开' : '竞价平稳',
    // 全部昨日涨停股：涨停次日开盘 / 收盘（同花顺打板栏目的列名）
    allOpen: round(mean(withOpen.map((r) => r.openPct)), 2), allClose: round(mean(withOpen.map((r) => r.pct)), 2), all: withOpen.length,
  }
}

/** 昨日涨停股按昨日封成比三等分，各组今日平均涨幅（检验「封成比越大、封单力度越大」在今天的表现）；匹配不足 6 只时不分组 */
export function fcbGroups(yzt, prevFcb) {
  if (!prevFcb) return null
  const rows = yzt.map((r) => ({ fcb: prevFcb[r.code], pct: r.pct })).filter((r) => Number.isFinite(r.fcb) && Number.isFinite(r.pct)).sort((a, b) => b.fcb - a.fcb)
  if (rows.length < 6) return null
  const k = Math.ceil(rows.length / 3)
  const g = (xs) => ({ n: xs.length, fcbMin: round(Math.min(...xs.map((r) => r.fcb)), 2), fcbMax: round(Math.max(...xs.map((r) => r.fcb)), 2), avgPct: round(mean(xs.map((r) => r.pct)), 2), red: rate(xs.filter((r) => r.pct > 0).length, xs.length) })
  return { high: g(rows.slice(0, k)), mid: g(rows.slice(k, rows.length - k)), low: g(rows.slice(rows.length - k)) }
}

/** 近 10 日涨停数：tradeDates 为截至今日的最近 10 个交易日；store.days 为 {日期: [代码]} */
export function tenDayCounts(store, tradeDates, names) {
  const counts = new Map()
  const covered = tradeDates.filter((d) => Array.isArray(store?.days?.[d]))
  for (const d of covered) for (const c of new Set(store.days[d])) counts.set(c, (counts.get(c) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return {
    covered: covered.length, window: tradeDates.length,
    multi: ranked.filter(([, n]) => n >= 2).length,
    top: ranked.slice(0, 15).map(([code, n]) => ({ code, name: names[code] ?? store?.names?.[code] ?? code, count: n })),
    map: counts,
  }
}

/** 涨停聚焦：按行业统计涨停家数，领涨股取连板最高、封板最早的一只 */
export function sectorFocus(zt) {
  const by = new Map()
  for (const r of zt) { const k = r.sector || '其他'; const a = by.get(k) ?? []; a.push(r); by.set(k, a) }
  return [...by.entries()].map(([sector, list]) => {
    const lead = [...list].sort((a, b) => (b.boards ?? 1) - (a.boards ?? 1) || (a.firstSeal ?? 0) - (b.firstSeal ?? 0))[0]
    return { sector, count: list.length, lead: { code: lead.code, name: lead.name, boards: lead.boards ?? 1 } }
  }).sort((a, b) => b.count - a.count || b.lead.boards - a.lead.boards).slice(0, 12)
}

/** 每日市场复盘：只陈述当日统计，按固定规则拼句，不做预测 */
export function reviewOf({ trend, amount, day, maxBoard, leaders, sectors, vane, emotion }) {
  const s = []
  if (trend) s.push(`上证指数收 ${trend.close}（${sign(trend.pct)}），短期趋势${trend.level}，强弱指数 ${trend.rsi ?? '—'}`)
  if (amount?.today) s.push(`沪深成交 ${amount.today} 亿${amount.prev ? `，较上一交易日${amount.today >= amount.prev ? '放量' : '缩量'} ${Math.abs(amount.today - amount.prev)} 亿` : ''}`)
  if (day.up !== null && day.down !== null) s.push(`上涨 ${day.up} 家、下跌 ${day.down} 家`)
  s.push(`涨停 ${day.zt} 家、跌停 ${day.dt} 家，封板率 ${day.sealRate ?? '—'}%`)
  if (maxBoard > 1 && leaders.length) s.push(`最高 ${maxBoard} 板：${leaders.slice(0, 3).join('、')}`)
  if (sectors[0]) s.push(`涨停最集中的行业是${sectors[0].sector}（${sectors[0].count} 家）`)
  if (vane.avgOpen !== null) s.push(`昨日最热涨停股今日平均开盘 ${sign(vane.avgOpen)}、收盘 ${sign(vane.avgClose)}`)
  s.push(`情绪指数 ${emotion.value ?? '—'}，处于${emotion.zone}`)
  return s.join('；') + '。'
}

/**
 * 当日完整记录。输入都是已校验的当日数据：
 * zt/zb/dt 当日涨停/炸板/跌停池；yzt 昨日涨停池（含今日涨幅、昨日连板数）；rows 新浪全市场（含开盘价）；
 * amounts 沪深成交额历史（含今日更好）；trend 上证指数趋势序列；history 已有每日记录（算情绪状态）；
 * prevFcb 上一交易日涨停股封成比；ztStore 近几日涨停代码（已含今天）；tradeDates 最近 10 个交易日。
 */
export function buildDay({ date, zt, zb, dt, yzt, rows, amounts = [], trend = [], history = [], prevFcb = null, ztStore = null, tradeDates = [] }) {
  const byCode = new Map(rows.map((r) => [r.code, r]))
  const ztCodes = new Set(zt.map((r) => r.code))
  const breadth = computeBreadth({ rows: rows.map((r) => ({ code: r.code, pct: r.pct })), limitUp: zt.filter((r) => byCode.has(r.code)), limitDown: dt.filter((r) => byCode.has(r.code)) })
  const ztReal = zt.filter((r) => !isST(r.name)).length, dtReal = dt.filter((r) => !isST(r.name)).length
  // 成交额：优先用指数日 K（与历史同口径），今天没有日 K 时用新浪全市场沪深合计
  const sinaHs = Math.round(rows.filter((r) => !r.symbol.startsWith('bj')).reduce((s, r) => s + r.amount, 0) / 1e8)
  const todayAmt = amounts.find((a) => a.date === date)?.total ?? sinaHs
  const before = amounts.filter((a) => a.date < date)
  const prevAmt = before.at(-1)?.total ?? null
  const avg20 = before.length >= 20 ? mean(before.slice(-20).map((a) => a.total)) : null
  const volRatio = avg20 ? round(todayAmt / avg20, 3) : null
  const vane = hotVane(yzt, byCode)
  const premium = round(mean(yzt.map((r) => r.pct)), 2)
  const emo = emotionIndex({ up: breadth.up, down: breadth.down, zt: ztReal, dt: dtReal, broken: zb.length, premium, volRatio })
  const tert = tertileState(emo.value, history.filter((d) => d.date < date).map((d) => d.emotion))
  const t = trend.find((r) => r.date === date) ?? null
  const maxBoard = Math.max(0, ...zt.map((r) => r.boards ?? 0))
  const leaders = zt.filter((r) => r.boards === maxBoard).map((r) => r.name)
  const sectors = sectorFocus(zt)
  const names = Object.fromEntries([...zt, ...yzt].map((r) => [r.code, r.name]))
  const ten = tenDayCounts(ztStore, tradeDates, names)
  const ztList = [...zt].sort((a, b) => (b.boards ?? 1) - (a.boards ?? 1) || (a.firstSeal ?? 0) - (b.firstSeal ?? 0)).map((r) => ({
    code: r.code, name: r.name, price: r.price, pct: round(r.pct, 2), boards: r.boards ?? 1, days: r.days, times: r.times,
    firstSeal: hhmm(r.firstSeal), opens: r.opens ?? 0, fund: round((r.fund ?? 0) / 1e8, 2), fcb: fcbOf(r), sector: r.sector, ten: ten.map.get(r.code) ?? null,
  }))
  const fcbVals = ztList.map((r) => r.fcb).filter((x) => x !== null).sort((a, b) => a - b)
  const day = {
    date, up: breadth.up, down: breadth.down, flat: breadth.flat, zt: zt.length, dt: dt.length, ztReal, dtReal, broken: zb.length,
    sealRate: rate(zt.length, zt.length + zb.length), premium, openPremium: vane.allOpen, hotOpen: vane.avgOpen,
    amount: todayAmt, volRatio, emotion: emo.value, parts: emo.parts, maxBoard,
  }
  const emotion = { value: emo.value, zone: emotionZone(emo.value), parts: emo.parts, ...tert }
  const latest = {
    ...day, buckets: breadth.buckets, medianPct: breadth.medianPct, suspended: breadth.suspended,
    amountPrev: prevAmt, emotionInfo: emotion, trend: t, vane,
    fcb: { median: round(quantile(fcbVals, 0.5), 2), top: [...ztList].filter((r) => r.fcb !== null).sort((a, b) => b.fcb - a.fcb).slice(0, 10).map((r) => ({ code: r.code, name: r.name, fcb: r.fcb, boards: r.boards, fund: r.fund })), groups: fcbGroups(yzt, prevFcb) },
    ztList, sectors,
    ten: { covered: ten.covered, window: ten.window, multi: ten.multi, top: ten.top.map((x) => ({ ...x, todayZt: ztCodes.has(x.code) })) },
    review: reviewOf({ trend: t, amount: { today: todayAmt, prev: prevAmt }, day, maxBoard, leaders, sectors, vane, emotion }),
  }
  const state = { date, fcb: Object.fromEntries(ztList.filter((r) => r.fcb !== null).map((r) => [r.code, r.fcb])) }
  return { day, latest, state }
}

/** 涨停代码库：写入当日代码，保留最近 keep 天 */
export function saveZtCodes(store, date, zt, keep = 15) {
  const days = { ...(store?.days ?? {}), [date]: zt.map((r) => r.code) }
  const kept = Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-keep))
  const live = new Set(Object.values(kept).flat())
  const names = Object.fromEntries(Object.entries({ ...(store?.names ?? {}), ...Object.fromEntries(zt.map((r) => [r.code, r.name])) }).filter(([c]) => live.has(c)))
  return { days: kept, names }
}

/** 状态文件：按日期保存最近几天的封成比；取早于 date 的最近一天 */
export function pickPrevFcb(store, date) {
  const key = Object.keys(store?.days ?? {}).filter((d) => d < date).sort().at(-1)
  return key ? store.days[key].fcb ?? null : null
}
export function saveState(store, state, keep = 5) {
  const days = { ...(store?.days ?? {}), [state.date]: { fcb: state.fcb } }
  return { days: Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-keep)) }
}

/**
 * 从每日复盘归档（public/data/daily-analysis.json）补出早期历史与涨停代码：
 * 只有涨停池、跌停数、炸板数，部分日期有全市场涨跌与昨日涨停今表现；缺的项留空，情绪指数用其余项（至少 3 项）。
 */
export function seedFromArchive(snapshots, amounts = []) {
  const ok = snapshots.filter((s) => s.session === 'closed' && Array.isArray(s.upStocks) && s.sources?.some((x) => x.id === 'limitUp' && x.status === 'ready'))
    .sort((a, b) => a.dataDate.localeCompare(b.dataDate))
  const days = [], codes = {}, names = {}
  for (const s of ok) {
    const zt = s.upStocks
    const br = s.sentiment?.breadth?.status === 'ready' ? s.sentiment.breadth : null
    const lu = s.sentiment?.limitUp?.status === 'ready' ? s.sentiment.limitUp : null
    const broken = Number.isInteger(s.metrics?.ztOpen) ? s.metrics.ztOpen : null
    const dt = Number.isInteger(s.metrics?.dtCount) ? s.metrics.dtCount : null
    const before = amounts.filter((a) => a.date < s.dataDate)
    const amount = amounts.find((a) => a.date === s.dataDate)?.total ?? null
    const avg20 = before.length >= 20 ? mean(before.slice(-20).map((a) => a.total)) : null
    const volRatio = amount && avg20 ? round(amount / avg20, 3) : null
    const ztReal = zt.filter((r) => !isST(r.name)).length
    const emo = emotionIndex({ up: br?.up ?? null, down: br?.down ?? null, zt: ztReal, dt, broken, premium: lu?.averagePct ?? null, volRatio })
    days.push({
      date: s.dataDate, seeded: true, up: br?.up ?? null, down: br?.down ?? null, flat: br?.flat ?? null, zt: zt.length, dt: dt ?? 0, ztReal, dtReal: null, broken,
      sealRate: broken === null ? null : rate(zt.length, zt.length + broken), premium: lu?.averagePct ?? null, openPremium: null, hotOpen: null,
      amount, volRatio, emotion: emo.value, parts: emo.parts, maxBoard: Math.max(0, ...zt.map((r) => r.boards ?? 0)),
    })
    codes[s.dataDate] = zt.map((r) => r.code)
    for (const r of zt) names[r.code] = r.name
  }
  return { days, ztStore: { days: codes, names } }
}

/** 合并涨停代码库：真实记录优先，种子只补缺的日期 */
export function mergeZtStore(store, seed) {
  return { days: { ...(seed?.days ?? {}), ...(store?.days ?? {}) }, names: { ...(seed?.names ?? {}), ...(store?.names ?? {}) } }
}
