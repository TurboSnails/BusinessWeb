// 开盘啦「异动监管」页签（/market-mood/abnormal）的纯计算。功能对照开盘啦 App 的偏离值 / 严重异动 / 多次异动（复牌）/
// 会不会上龙虎榜 / 市场雷达。全部按沪深交易所公开规则机械计算，不是预测，也不构成投资建议。
//
// 规则（2026-11 查证，见页面「规则」区的链接）：
//   - 收盘价涨跌幅偏离值 = 个股涨跌幅 − 对应基准指数涨跌幅。基准：沪市主板 上证指数（000001），科创板 科创50（000688），
//     深市主板 深证A股指数（399107），创业板 创业板综合指数（399102）。深交所规则写明前两者；沪市两项用上交所
//     每日公开信息里的偏离值反算验证（11-16、11-17 主板，11-11 科创板均一致）。
//   - 「连续三个交易日内偏离值累计」不是三日简单相加，而是窗口内个股累计涨跌幅 − 指数累计涨跌幅（复利）。用沪深两所
//     11-17 公开信息核对：大东方 −25.21%、永臻股份 −25.17%、长虹美菱 24.22%、北鼎股份 44.62%、燧原科技 30.08%
//     都只有按复利才对得上；窗口可以是 1～3 天，交易所公布的是最短的那个达标窗口（北投科技 11.16–11.17 两天）。
//   - 阈值：主板（含 ST，2026-07-06 起风险警示股涨跌幅限制与异常波动指标统一为主板标准）3 日 ±20%；
//     创业板 / 科创板 3 日 ±30%。严重异常波动：10 日内 3 次同向异常波动；10 日偏离累计 +100% / −50%；30 日 +200% / −70%。
//   - 指标自交易所公布之日起重新计算；无价格涨跌幅限制的交易日（新股上市初期）不计入。
//   - 龙虎榜（交易公开信息）当日条件：主板 日偏离值 ±7%、振幅 15%、换手率 20% 各前五只；创业板 / 科创板 日涨跌幅 ±15%、
//     振幅 30%、换手率 30% 各前五只（相同按成交额、成交量）；外加上面的 3 日异常波动（全部列出）。
//     深交所在涨跌停时按涨跌幅限制比例计算（11-17 涨停股偏离值都是 10.90% = 10% + 0.90%），上交所按实际涨跌幅。
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'

/** null / 空串 / 非数字一律视为缺失（null），不能当 0 */
export const num = (x) => (x === null || x === undefined || String(x).trim() === '' || !Number.isFinite(Number(x)) ? null : Number(x))
const round = (x, n = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)

/** 四个板块的规则常量 */
export const BOARDS = {
  sh: { name: '沪市主板', exchange: 'sse', index: { secid: '1.000001', code: '000001', name: '上证指数' }, limit: 10, d3: 20, daily: 'dev', dailyThr: 7, amp: 15, turn: 20, limitRatio: false },
  kcb: { name: '科创板', exchange: 'sse', index: { secid: '1.000688', code: '000688', name: '科创50' }, limit: 20, d3: 30, daily: 'pct', dailyThr: 15, amp: 30, turn: 30, limitRatio: false },
  sz: { name: '深市主板', exchange: 'szse', index: { secid: '0.399107', code: '399107', name: '深证A股指数' }, limit: 10, d3: 20, daily: 'dev', dailyThr: 7, amp: 15, turn: 20, limitRatio: true },
  cyb: { name: '创业板', exchange: 'szse', index: { secid: '0.399102', code: '399102', name: '创业板综合指数' }, limit: 20, d3: 30, daily: 'pct', dailyThr: 15, amp: 30, turn: 30, limitRatio: true },
}
export const SEVERE = { d10: { days: 10, up: 100, down: -50 }, d30: { days: 30, up: 200, down: -70 }, sameDir: { days: 10, times: 3 } }
export const HISTORY_DAYS = 40 // 保存的逐日收益天数（30 日窗口 + 余量）

/** 只算沪深 A 股（不含北交所、B 股）；返回板块 id 或 null */
export function boardOfCode(code) {
  const c = String(code)
  if (!/^\d{6}$/.test(c)) return null
  if (/^68[89]/.test(c)) return 'kcb'
  if (/^60[0135]/.test(c)) return 'sh'
  if (/^30[01]/.test(c)) return 'cyb'
  if (/^00[0123]/.test(c)) return 'sz'
  return null
}
/** 新股上市初期（N / C 开头）不设涨跌幅限制；退市整理期（名称以「退」结尾）另有规则，均不纳入 */
export const noLimitName = (name) => /^[NC]/.test(String(name ?? '').trim())
export const delistName = (name) => /退$/.test(String(name ?? '').trim())

/** 价格保留两位（交易所申报价位 0.01 元） */
export const round2 = (x) => Math.round(x * 100 + 1e-9) / 100

/** 当日是否收在涨停 / 跌停价（以昨收和涨跌幅限制推算的价位为准） */
export function atLimit(close, prev, limit) {
  if (close === null || prev === null || !(prev > 0)) return 0
  if (Math.abs(close - round2(prev * (1 + limit / 100))) < 0.005) return 1
  if (Math.abs(close - round2(prev * (1 - limit / 100))) < 0.005) return -1
  return 0
}

/* ---------------- 逐日收益序列 ---------------- */

/**
 * 东财日 K（前复权，fields2=f51 日期,f53 收,f54 高,f55 低,f56 量,f57 额,f61 换手）→ 逐日收益。
 * 收益用前复权收盘价相邻两日之比（除权日也连续）；上市不足 lmt 根时，前 5 根视为无涨跌幅限制（null）。
 */
export function parseKline(body, lmt) {
  const d = body?.data
  if (!d || !Array.isArray(d.klines)) return null
  const rows = d.klines.map((k) => {
    const f = String(k).split(',')
    return { date: f[0], close: num(f[1]), high: num(f[2]), low: num(f[3]), volume: num(f[4]), amount: num(f[5]), turnover: num(f[6]) }
  }).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.close !== null && r.close > 0)
  const young = rows.length < lmt
  const bars = rows.map((r, i) => {
    const prev = i > 0 ? rows[i - 1].close : null
    const ret = prev && !(young && i < 5) ? round((r.close / prev - 1) * 100, 4) : null
    return { ...r, prev, ret }
  })
  return { code: String(d.code ?? ''), name: typeof d.name === 'string' ? d.name.trim() : '', bars }
}

/** 指数日 K → Map(date → 涨跌幅%)，用收盘价相邻两日之比 */
export function indexReturns(body) {
  const p = parseKline(body, 0)
  if (!p) return new Map()
  return new Map(p.bars.filter((b) => b.prev).map((b) => [b.date, round((b.close / b.prev - 1) * 100, 4)]))
}

/** 新浪全市场行 → 当日行情（只收沪深 A 股、当日有成交的） */
export function sinaBar(row) {
  const code = String(row?.code ?? '')
  const board = boardOfCode(code)
  if (!board || typeof row.name !== 'string') return null
  const close = num(row.trade), prev = num(row.settlement), high = num(row.high), low = num(row.low)
  if (!(close > 0) || !(prev > 0) || !(num(row.volume) > 0)) return null // 停牌
  const name = row.name.trim()
  return {
    code, name, board, close, prev, high: high > 0 ? high : null, low: low > 0 ? low : null,
    volume: num(row.volume), amount: num(row.amount), turnover: num(row.turnoverratio),
    ret: noLimitName(name) ? null : round((close / prev - 1) * 100, 4),
  }
}

/** 一天的存档：{ date, idx: {sh,kcb,sz,cyb}, s: {code: ret|null} } */
export function dayRecord(date, idx, bars) {
  const s = {}
  for (const b of bars) if (b.board && !delistName(b.name)) s[b.code] = b.ret === null ? null : round(b.ret, 4)
  return { date, idx, s }
}

/** 存档里缺数据的只数：unknown（整天没有存档）记为无穷大；miss 为日 K 获取失败的代码（不是停牌） */
export const missCount = (r) => (!r || !r.s || r.unknown ? Infinity : Array.isArray(r.miss) ? r.miss.length : 0)

/**
 * 是否用新存档替换已有存档：已有的缺失或日期不符时替换；否则只在新存档缺数据更少时替换。
 * tie = true 时同等完整也替换（当日重跑），否则保留已有（不让更差或同等的补数覆盖更好的存档）。
 */
export function replaceRecord(old, next, tie = false) {
  if (!old || old.date !== next.date || !old.s) return true
  const a = missCount(next), b = missCount(old)
  return tie ? a <= b : a < b
}

/**
 * 是否覆盖 public 输出：已有文件日期更新时不覆盖（补算历史日不能倒退）；同一天时只在本次缺失只数不多于已有时覆盖
 * （已有文件没记录缺失只数视为未知，可以覆盖）。
 */
export function canReplaceOut(prev, date, missing) {
  const d = typeof prev?.date === 'string' ? prev.date : ''
  if (!d || d < date) return true
  if (d > date) return false
  const old = Number.isFinite(prev?.archive?.missing) ? prev.archive.missing : Infinity
  return missing <= old
}

/** 最近 n 个交易日（含 date），从近到远 */
export function tradingDaysBack(date, n) {
  const out = [date]
  while (out.length < n) out.push(prevTradingDay(out.at(-1)))
  return out
}

/* ---------------- 偏离值与触发判断 ---------------- */

/**
 * 某只股票的序列 seq（从远到近，每项 {date, r, i}，r/i 为 %，r 为 null 表示该日不计入）在第 end 天、
 * 窗口长度 L 的累计偏离值（%）：∏(1+r) − ∏(1+i)。窗口不得跨过 reset（含）与不计入的日子。
 */
export function windowDev(seq, end, L, reset = -1) {
  const start = end - L + 1
  if (start < 0 || start <= reset) return null
  let p = 1, q = 1
  for (let k = start; k <= end; k++) {
    const { r, i } = seq[k]
    if (r === null || i === null || i === undefined) return null
    p *= 1 + r / 100
    q *= 1 + i / 100
  }
  return (p - q) * 100
}

/** 第 end 天是否触发：从短到长找第一个达标窗口（与交易所公布的异常期间一致）→ {dir, L, v} | null */
export function firstTrigger(seq, end, maxL, up, down, reset = -1) {
  for (let L = 1; L <= maxL; L++) {
    const v = windowDev(seq, end, L, reset)
    if (v === null) return null
    if (v >= up - 1e-9) return { dir: 1, L, v: round(v, 2) }
    if (v <= down + 1e-9) return { dir: -1, L, v: round(v, 2) }
  }
  return null
}

/** 第 end 天最长可用窗口（≤ maxL）的累计偏离值 → {v, L} | null */
export function longestDev(seq, end, maxL, reset = -1) {
  let best = null
  for (let L = 1; L <= maxL; L++) {
    const v = windowDev(seq, end, L, reset)
    if (v === null) break
    best = { v: round(v, 2), L }
  }
  return best
}

/**
 * 下一交易日的触发条件（机械估算）：假设下一交易日基准指数持平（涨跌 0），窗口为「下一交易日 + 之前 L−1 天」，
 * 解 ∏前(1+r)·(1+x) − ∏前(1+i) ≥ up（或 ≤ down）得 x 的门槛，取所有窗口里最容易达到的那个。
 * 返回 { up: x%, down: x% }（达不到时为 null 不出现：由调用方按涨跌幅限制判断）。
 */
export function nextNeed(seq, maxL, up, down, reset = -1) {
  const n = seq.length
  let needUp = null, needDown = null
  for (let L = 1; L <= maxL; L++) {
    let p = 1, q = 1, ok = true
    for (let k = n - (L - 1); k < n; k++) {
      if (k < 0 || k <= reset || seq[k].r === null || seq[k].i === null) { ok = false; break }
      p *= 1 + seq[k].r / 100
      q *= 1 + seq[k].i / 100
    }
    if (!ok) break
    const xu = ((up / 100 + q) / p - 1) * 100
    const xd = ((down / 100 + q) / p - 1) * 100
    if (needUp === null || xu < needUp) needUp = xu
    if (needDown === null || xd > needDown) needDown = xd
  }
  return { up: round(needUp, 2), down: round(needDown, 2) }
}

/**
 * 逐日回放一只股票，得到每天的异常波动 / 严重异常波动判断与重新计算的起点。
 * actualOf(date) → undefined（那天没有实际龙虎榜数据）| { d3: 1 | -1 | 0, severe: boolean }。
 * 有实际数据的日子以交易所实际公布为准决定「重新计算」的起点；计算结果另存（用于回测命中率）。
 */
export function replay(seq, board, actualOf = () => undefined) {
  const b = BOARDS[board]
  let reset3 = -1, resetS = -1
  const days = []
  const t3 = [] // 实际采用的 3 日异常波动 {k, dir}
  for (let k = 0; k < seq.length; k++) {
    if (seq[k].r === null) { days.push({ date: seq[k].date, calc3: null, act: undefined, sev: null, r3: reset3, rS: resetS }); reset3 = k; resetS = k; continue }
    const calc3 = firstTrigger(seq, k, 3, b.d3, -b.d3, reset3)
    const act = actualOf(seq[k].date)
    const use3 = act ? (act.d3 ? { dir: act.d3 } : null) : calc3
    if (use3) t3.push({ k, dir: use3.dir })
    const c10 = firstTrigger(seq, k, SEVERE.d10.days, SEVERE.d10.up, SEVERE.d10.down, resetS)
    const c30 = firstTrigger(seq, k, SEVERE.d30.days, SEVERE.d30.up, SEVERE.d30.down, resetS)
    const recent = t3.filter((t) => t.k > k - SEVERE.sameDir.days && t.k > resetS)
    const same = use3 ? recent.filter((t) => t.dir === use3.dir).length >= SEVERE.sameDir.times : false
    const sev = c10 || c30 || same ? { d10: c10, d30: c30, same } : null
    const useSev = act ? act.severe : !!sev
    days.push({ date: seq[k].date, calc3, act, sev, r3: reset3, rS: resetS }) // r3 / rS：当天之前的重新计算起点
    if (use3) reset3 = k
    if (useSev) { resetS = k; reset3 = k }
  }
  const sameCount = (dir) => t3.filter((t) => t.k > seq.length - SEVERE.sameDir.days && t.k > resetS && t.dir === dir).length
  return { days, reset3, resetS, t3, sameUp: sameCount(1), sameDown: sameCount(-1) }
}

/* ---------------- 实际龙虎榜（kpl-lhb）对照 ---------------- */

/** 上榜原因 → 规则类别；对不上的记为 other（严重异常波动、无涨跌幅限制等） */
export function reasonCat(reason) {
  const s = String(reason ?? '')
  if (/连续(三|3)个交易日/.test(s) && /换手率/.test(s)) return 'other'
  if (/连续(三|3)个交易日/.test(s)) return /涨幅/.test(s) ? 'd3up' : /跌幅/.test(s) ? 'd3down' : 'other'
  if (/连续(十|10|三十|30)个交易日|严重异常/.test(s)) return 'severe'
  if (/无价格涨跌幅限制/.test(s) && !/有价格涨跌幅限制/.test(s)) return 'other'
  if (/偏离值达到7%/.test(s)) return /涨幅/.test(s) ? 'devup' : 'devdown'
  if (/涨幅达到15%/.test(s)) return 'pctup'
  if (/跌幅达到15%/.test(s)) return 'pctdown'
  if (/振幅/.test(s)) return 'amp'
  if (/换手率/.test(s)) return 'turn'
  return 'other'
}
export const CAT_LABEL = {
  devup: '日涨幅偏离 7%', devdown: '日跌幅偏离 7%', pctup: '日涨幅 15%', pctdown: '日跌幅 15%', amp: '日振幅', turn: '日换手率',
  d3up: '3 日涨幅偏离累计', d3down: '3 日跌幅偏离累计', severe: '严重异常波动', other: '其他',
}

/** kpl-lhb 每日原始文件（data-raw/kpl-lhb/days/<date>.json）→ Map(code → Set(cat))，只收沪深 A 股 */
export function actualFromLhbDay(day) {
  const out = new Map()
  for (const e of day?.entries ?? []) {
    if (e.aShare === false || !boardOfCode(e.code)) continue
    const set = out.get(e.code) ?? new Set()
    set.add(reasonCat(e.reason))
    out.set(e.code, set)
  }
  return out
}
/** kpl-lhb.json 的 latest（按股票汇总）→ Map(code → Set(cat)) */
export function actualFromLhbLatest(latest) {
  const out = new Map()
  for (const s of latest?.stocks ?? []) {
    if (!boardOfCode(s.code)) continue
    const set = out.get(s.code) ?? new Set()
    for (const r of s.reasons ?? []) set.add(reasonCat(r.reason))
    out.set(s.code, set)
  }
  return out
}
/** 一天的实际判断：{ d3: 1 | -1 | 0, severe } */
export const actualFlags = (cats) => ({ d3: cats?.has('d3up') ? 1 : cats?.has('d3down') ? -1 : 0, severe: !!cats?.has('severe') })

/* ---------------- 当日龙虎榜按规则判断 ---------------- */

const byAmount = (a, b) => (b.amount ?? 0) - (a.amount ?? 0) || (b.volume ?? 0) - (a.volume ?? 0)
/**
 * 当日按规则「应上榜」的条目：每板块 日偏离 / 日涨跌幅、振幅、换手率各前五只（达到门槛才算），以及当日 3 日异常波动。
 * bars：当日行情（含 board、ret、close、prev、high、low、turnover、amount、volume）；idx：当日基准指数涨跌幅。
 */
export function predictLhb(bars, idx, d3Hits) {
  const out = []
  for (const [id, b] of Object.entries(BOARDS)) {
    const rows = bars.filter((r) => r.board === id && r.ret !== null && !delistName(r.name))
    const daily = rows.map((r) => {
      const lim = atLimit(r.close, r.prev, b.limit)
      const pctV = b.limitRatio && lim ? lim * b.limit : r.ret // 深交所涨跌停按限制比例
      const v = b.daily === 'dev' ? (idx[id] === null || idx[id] === undefined ? null : pctV - idx[id]) : pctV
      return { r, v } // 排名用未四舍五入的值（两位小数相同的按真实大小，再按成交额）
    })
    const top = (list, cat) => list.slice(0, 5).forEach(({ r, v }) => out.push({ code: r.code, name: r.name, board: id, cat, value: round(v, 2) }))
    const up = b.daily === 'dev' ? 'devup' : 'pctup', down = b.daily === 'dev' ? 'devdown' : 'pctdown'
    top(daily.filter((x) => x.v !== null && x.v >= b.dailyThr).sort((a, c) => c.v - a.v || byAmount(a.r, c.r)), up)
    top(daily.filter((x) => x.v !== null && x.v <= -b.dailyThr).sort((a, c) => a.v - c.v || byAmount(a.r, c.r)), down)
    const amp = rows.filter((r) => r.high !== null && r.low > 0).map((r) => ({ r, v: ((r.high - r.low) / r.low) * 100 }))
    top(amp.filter((x) => x.v >= b.amp).sort((a, c) => c.v - a.v || byAmount(a.r, c.r)), 'amp')
    const turn = rows.filter((r) => r.turnover !== null).map((r) => ({ r, v: r.turnover }))
    top(turn.filter((x) => x.v >= b.turn).sort((a, c) => c.v - a.v || byAmount(a.r, c.r)), 'turn')
  }
  for (const h of d3Hits) out.push({ code: h.code, name: h.name, board: h.board, cat: h.dir > 0 ? 'd3up' : 'd3down', value: h.v })
  return out
}

/** 规则判断 vs 实际上榜：每条标命中；另列实际上榜但规则没判出的（只看本页建模的类别） */
export function compareLhb(predicted, actual, names = new Map()) {
  if (!actual) return { available: false, rows: predicted.map((p) => ({ ...p, hit: null })), missed: [], stats: null }
  const modeled = new Set(['devup', 'devdown', 'pctup', 'pctdown', 'amp', 'turn', 'd3up', 'd3down'])
  const rows = predicted.map((p) => ({ ...p, hit: !!actual.get(p.code)?.has(p.cat) }))
  const key = new Set(predicted.map((p) => `${p.code}|${p.cat}`))
  const missed = []
  for (const [code, cats] of actual) for (const cat of cats) if (modeled.has(cat) && !key.has(`${code}|${cat}`)) missed.push({ code, name: names.get(code) ?? code, board: boardOfCode(code), cat })
  const hit = rows.filter((r) => r.hit).length
  const actualN = [...actual.values()].reduce((s, c) => s + [...c].filter((x) => modeled.has(x)).length, 0)
  return {
    available: true, rows, missed,
    stats: { predicted: rows.length, actual: actualN, hit, precision: rows.length ? round((hit / rows.length) * 100, 1) : null, recall: actualN ? round((hit / actualN) * 100, 1) : null },
  }
}

/* ---------------- 停牌 / 复牌 ---------------- */

const dateOf = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
/** 第一个严格晚于 d 的交易日 */
export function nextTradingDay(d) {
  let t = Date.parse(`${d}T00:00:00Z`)
  for (;;) { t += 864e5; const s = new Date(t).toISOString().slice(0, 10); if (isTradingDay(s)) return s }
}
/** from（含）到 to（含）之间的交易日数 */
export function tradingDaysBetween(from, to) {
  if (!from || !to || from > to) return null
  let n = 0
  for (let d = from; d <= to; d = nextTradingDay(d)) if (isTradingDay(d)) n++
  return n
}

/**
 * 东财停复牌报表（RPT_CUSTOM_SUSPEND_DATA_INTERFACE，DATETIME 取窗口起点时返回之后仍有效的全部记录）→
 * 当日全天停牌、当日盘中临时停牌、复牌后 10 个交易日内。只收沪深北 A 股（058001001）。
 */
export function buildSuspend(rows, date, resumeWindow = 10) {
  const today = [], intraday = [], resumed = []
  for (const r of rows ?? []) {
    if (String(r.SECURITY_TYPE_CODE ?? '') !== '058001001' || !/^\d{6}$/.test(String(r.SECURITY_CODE))) continue
    const start = dateOf(r.SUSPEND_START_DATE) ?? dateOf(r.SUSPEND_START_TIME)
    const end = dateOf(r.SUSPEND_END_TIME)
    if (!start || start > date) continue
    const base = {
      code: String(r.SECURITY_CODE), name: String(r.SECURITY_NAME_ABBR ?? '').trim(), market: String(r.TRADE_MARKET ?? ''),
      start, startTime: String(r.SUSPEND_START_TIME ?? '').slice(11, 16) || null, end, kind: String(r.SUSPEND_EXPIRE ?? ''), reason: String(r.SUSPEND_REASON ?? ''),
      resume: dateOf(r.PREDICT_RESUME_DATE),
    }
    if (base.kind === '盘中停牌') { if (start === date) intraday.push({ ...base, endTime: String(r.SUSPEND_END_TIME ?? '').slice(11, 16) || null }); continue }
    if (end === null || end >= date) { today.push({ ...base, days: tradingDaysBetween(start, date) }); continue }
    const resume = base.resume ?? nextTradingDay(end)
    const nth = tradingDaysBetween(resume, date)
    if (resume <= date && nth !== null && nth <= resumeWindow) resumed.push({ ...base, resume, nth, suspendedDays: tradingDaysBetween(start, end) })
  }
  const by = (a, b) => (b.start ?? '').localeCompare(a.start ?? '') || a.code.localeCompare(b.code)
  return { today: today.sort(by), intraday: intraday.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')), resumed: resumed.sort((a, b) => a.nth - b.nth || a.code.localeCompare(b.code)) }
}

/* ---------------- 盘口异动（东财 push2ex getAllStockChanges） ---------------- */

/** 东财盘口异动类型（取自 quote.eastmoney.com/changes 页面脚本）；dir 1 偏多、−1 偏空 */
export const CHANGE_TYPES = {
  4: ['封涨停板', 1], 8: ['封跌停板', -1], 16: ['打开涨停板', -1], 32: ['打开跌停板', 1],
  64: ['有大买盘', 1], 128: ['有大卖盘', -1], 8193: ['大笔买入', 1], 8194: ['大笔卖出', -1],
  8201: ['火箭发射', 1], 8202: ['快速反弹', 1], 8203: ['高台跳水', -1], 8204: ['加速下跌', -1],
  8207: ['竞价上涨', 1], 8208: ['竞价下跌', -1], 8209: ['高开5日线', 1], 8210: ['低开5日线', -1],
  8211: ['向上缺口', 1], 8212: ['向下缺口', -1], 8213: ['60日新高', 1], 8214: ['60日新低', -1],
  8215: ['60日大幅上涨', 1], 8216: ['60日大幅下跌', -1],
}
const hhmmss = (tm) => { const s = String(tm).padStart(6, '0'); return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}` }

/** 接口返回 → 事件列表；结构不对或条数不完整时抛错（不写残缺数据） */
export function parseChanges(body) {
  const d = body?.data
  if (!d || !Array.isArray(d.allstock) || !Number.isInteger(d.tc)) throw new Error('盘口异动返回结构异常')
  if (d.allstock.length !== d.tc) throw new Error(`盘口异动条数不完整（${d.allstock.length}/${d.tc}）`)
  return d.allstock.map((e) => {
    const t = Number(e.t), tm = Number(e.tm)
    if (!CHANGE_TYPES[t] || !Number.isFinite(tm) || tm < 91500 || tm > 150500 || !/^\d{6}$/.test(String(e.c))) throw new Error('盘口异动字段异常')
    const f = String(e.i ?? '').split(',').map(num)
    // i 的第一项：价格类为价格、成交类为股数、涨速类为涨跌幅（小数）；买卖类第二项为价格、末项为金额
    const amount = t === 8193 || t === 8194 ? f[3] ?? null : null
    return { time: hhmmss(tm), code: String(e.c), name: String(e.n ?? '').trim(), type: t, info: f[0] ?? null, amount }
  })
}

/** 盘口异动汇总：每类计数、半小时分布、各类事件最多的个股、关键事件时间线（封涨停 / 打开涨停 / 大笔买入大单） */
export function summarizeRadar(events) {
  const types = Object.entries(CHANGE_TYPES).map(([id, [name, dir]]) => ({ id: Number(id), name, dir, count: 0 }))
  const byType = new Map(types.map((t) => [t.id, t]))
  const bucketOf = (time) => {
    if (time < '09:30:00') return '09:15'
    if (time >= '11:30:00' && time < '13:00:00') return '11:00'
    if (time >= '15:00:00') return '14:30'
    const [h, m] = time.split(':').map(Number)
    return `${String(h).padStart(2, '0')}:${m < 30 ? '00' : '30'}`
  }
  const buckets = new Map()
  const perStock = new Map()
  for (const e of events) {
    byType.get(e.type).count++
    const bk = bucketOf(e.time)
    const row = buckets.get(bk) ?? {}
    row[e.type] = (row[e.type] ?? 0) + 1
    buckets.set(bk, row)
    const key = `${e.type}|${e.code}`
    const s = perStock.get(key) ?? { type: e.type, code: e.code, name: e.name, n: 0, first: e.time, last: e.time, amount: 0 }
    s.n++
    if (e.time < s.first) s.first = e.time
    if (e.time > s.last) s.last = e.time
    if (e.amount) s.amount += e.amount
    perStock.set(key, s)
  }
  const top = {}
  for (const t of types) {
    const list = [...perStock.values()].filter((s) => s.type === t.id)
    if (!list.length) continue
    top[t.id] = list.sort((a, b) => b.n - a.n || (t.id === 8193 || t.id === 8194 ? b.amount - a.amount : 0) || a.first.localeCompare(b.first)).slice(0, 10)
      .map(({ code, name, n, first, last, amount }) => ({ code, name, n, first, last, amount: amount ? Math.round(amount) : null }))
  }
  const KEY = new Set([4, 16])
  const timeline = events.filter((e) => KEY.has(e.type)).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 400).map(({ time, code, name, type, info }) => ({ time, code, name, type, price: info }))
  return {
    total: events.length,
    types: types.filter((t) => t.count > 0),
    buckets: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, c]) => ({ t, c })),
    top, timeline,
  }
}

/* ---------------- 汇总 ---------------- */

/**
 * 主计算。history：从远到近的日存档（含当日），bars：当日行情，actualByDate：Map(date → Map(code → Set(cat)))，
 * names：Map(code → name)。返回页面需要的各个列表（不含 meta）。
 */
export function buildAbnormal({ date, history, bars, actualByDate, todayActual }) {
  if (history.at(-1)?.date !== date) throw new Error('存档最后一天不是目标交易日')
  const triggered = [], near = [], severeWatch = [], d3Hits = []
  const devOf = new Map() // 每只股票今日的 3 日累计偏离值（复牌列表等处引用）
  const bt = { days: 0, calc: 0, actual: 0, hit: 0, from: null, to: null }
  const btDays = new Set()
  // 每天缺数据的代码：unknown（整天没有存档）= 全部缺失；miss = 日 K 获取失败。缺数据 ≠ 停牌，记为不计入（r = null），窗口不得跨过
  const missOf = history.map((day) => (day.unknown ? null : new Set(day.miss ?? [])))
  for (const b of bars) {
    if (!b.board || delistName(b.name) || b.ret === null) continue
    const rule = BOARDS[b.board]
    const seq = []
    history.forEach((day, k) => {
      const i = day.idx?.[b.board] ?? null
      if (!missOf[k] || missOf[k].has(b.code)) { seq.push({ date: day.date, r: null, i }); return } // 缺数据：偏离值为空，不桥接
      if (!(b.code in day.s)) return // 当日停牌（数据完整而不在）：不占用交易日
      seq.push({ date: day.date, r: day.s[b.code], i })
    })
    if (!seq.length || seq.at(-1).date !== date) continue
    const actualOf = (d) => { const m = actualByDate.get(d); return m ? actualFlags(m.get(b.code)) : undefined }
    const rp = replay(seq, b.board, actualOf)
    // 回测：有实际龙虎榜的日子，按规则计算的 3 日异常波动 vs 实际
    for (const day of rp.days) {
      if (day.act === undefined) continue
      btDays.add(day.date)
      const c = day.calc3?.dir ?? 0
      if (c) bt.calc++
      if (day.act.d3) bt.actual++
      if (c && c === day.act.d3) bt.hit++
    }
    const last = rp.days.at(-1)
    const k = seq.length - 1
    // 今日的累计偏离值按今日之前的重新计算起点显示
    const dev3 = longestDev(seq, k, 3, last.r3)
    const dev10 = longestDev(seq, k, 10, last.rS)
    const dev30 = longestDev(seq, k, 30, last.rS)
    devOf.set(b.code, dev3?.v ?? null)
    const base = {
      code: b.code, name: b.name, board: b.board, close: b.close, pct: round(b.ret, 2),
      dev1: seq[k].i === null ? null : round(b.ret - seq[k].i, 2),
      dev3: dev3?.v ?? null, dev3Days: dev3?.L ?? null, dev10: dev10?.v ?? null, dev10Days: dev10?.L ?? null, dev30: dev30?.v ?? null, dev30Days: dev30?.L ?? null,
    }
    const t = []
    if (last.calc3) { t.push(last.calc3.dir > 0 ? 'd3up' : 'd3down'); d3Hits.push({ code: b.code, name: b.name, board: b.board, dir: last.calc3.dir, v: last.calc3.v }) }
    if (last.sev?.d10) t.push(last.sev.d10.dir > 0 ? 'd10up' : 'd10down')
    if (last.sev?.d30) t.push(last.sev.d30.dir > 0 ? 'd30up' : 'd30down')
    if (last.sev?.same) t.push('same3')
    const official = todayActual ? actualFlags(todayActual.get(b.code)) : null
    if (t.length || official?.d3 || official?.severe) {
      triggered.push({ ...base, trig: t, trigDev: last.calc3?.v ?? null, trigDays: last.calc3?.L ?? null, official: official ? (official.d3 ? (official.d3 > 0 ? 'd3up' : 'd3down') : official.severe ? 'severe' : 'none') : null })
    }
    // 下一交易日：按今天收盘后的重新计算起点
    const n3 = nextNeed(seq, 3, rule.d3, -rule.d3, rp.reset3)
    const n10 = nextNeed(seq, SEVERE.d10.days, SEVERE.d10.up, SEVERE.d10.down, rp.resetS)
    const n30 = nextNeed(seq, SEVERE.d30.days, SEVERE.d30.up, SEVERE.d30.down, rp.resetS)
    const reach = (x, dir) => x !== null && (dir > 0 ? x <= rule.limit + 1e-9 : x >= -rule.limit - 1e-9)
    const price = (x, dir) => { const p = b.close * (1 + x / 100); return dir > 0 ? Math.ceil(p * 100 - 1e-6) / 100 : Math.floor(p * 100 + 1e-6) / 100 }
    const pick = (n, dir) => (reach(dir > 0 ? n.up : n.down, dir) ? { need: dir > 0 ? n.up : n.down, price: price(dir > 0 ? n.up : n.down, dir) } : null)
    const up3 = pick(n3, 1), down3 = pick(n3, -1)
    const nearRow = { ...base, up3, down3, sameUp: rp.sameUp, sameDown: rp.sameDown }
    if (up3 || down3) near.push(nearRow)
    const up10 = pick(n10, 1), down10 = pick(n10, -1), up30 = pick(n30, 1), down30 = pick(n30, -1)
    const sameNext = (up3 && rp.sameUp >= SEVERE.sameDir.times - 1) || (down3 && rp.sameDown >= SEVERE.sameDir.times - 1)
    if (up10 || down10 || up30 || down30 || sameNext) severeWatch.push({ ...base, up10, down10, up30, down30, sameUp: rp.sameUp, sameDown: rp.sameDown, sameNext: !!sameNext })
  }
  const sortedDays = [...btDays].sort()
  bt.days = sortedDays.length
  bt.from = sortedDays[0] ?? null
  bt.to = sortedDays.at(-1) ?? null
  bt.precision = bt.calc ? round((bt.hit / bt.calc) * 100, 1) : null
  bt.recall = bt.actual ? round((bt.hit / bt.actual) * 100, 1) : null
  const absNeed = (r) => Math.min(r.up3 ? Math.abs(r.up3.need) : 99, r.down3 ? Math.abs(r.down3.need) : 99)
  near.sort((a, c) => absNeed(a) - absNeed(c) || a.code.localeCompare(c.code))
  triggered.sort((a, c) => Math.abs(c.dev3 ?? 0) - Math.abs(a.dev3 ?? 0) || a.code.localeCompare(c.code))
  return { triggered, near, severeWatch, d3Hits, backtest: bt, devOf }
}

/** 每日计数历史：同一天以新记录为准，保留最近 keep 天 */
export function mergeHistory(history, day, keep = 250) {
  const map = new Map((history ?? []).map((h) => [h.date, h]))
  map.set(day.date, { ...(map.get(day.date) ?? {}), ...day })
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep)
}
