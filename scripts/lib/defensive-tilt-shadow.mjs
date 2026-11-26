// 防守倾斜 ETF 影子运行：只记录、不操作。来自 docs/research/defensive-tilt-2026-11-26（L-026）的预注册下一步：
// 用可交易 ETF 跑 12 个月（2026-12 至 2027-11），只检验执行一致（ETF 与研究口径篮子的跟踪差），不对收益做判定。
// P1 = XLP、XLV、XLU 等权（对应防守九行业）；P2 = USMV（SPLV 作备选同时记录，对应低波十行业）。
// 每个完整月份在 ETF 行情与 Ken French 行业数据都齐全后冻结一行，冻结后不再改动；当月只给预估。

import { INDUSTRIES, monthAfter } from './late-cycle-shadow.mjs'

export const SHADOW_SINCE = '2026-12'
export const SHADOW_UNTIL = '2027-11'
export const SYMBOLS = ['SPY', 'XLP', 'XLV', 'XLU', 'USMV', 'SPLV']
export const P1_ETFS = ['XLP', 'XLV', 'XLU']
export const TILT = 0.3
const DEFENSIVE = ['Food', 'Soda', 'Beer', 'Smoke', 'Hshld', 'Hlth', 'MedEq', 'Drugs', 'Util'].map(n => INDUSTRIES.indexOf(n))
const LOW_VOL_WINDOW = 36
const LOW_VOL_COUNT = 10
// 超过这么多个月仍有缺项，就带着缺项冻结，避免永远留空
const FREEZE_ANYWAY_AFTER = 3

export const RULE = '股票部分 70% SPY + 30% 防守腿，每月初再平衡。S1：防守腿 = XLP、XLV、XLU 等权（对应 P1 防守九行业）；'
  + 'S2：防守腿 = USMV（对应 P2 低波十行业），S2b 用 SPLV。研究口径对照：P1 = Food、Soda、Beer、Smoke、Hshld、Hlth、MedEq、Drugs、Util 等权；'
  + 'P2 = 该月之前 36 个月月收益无缺失的行业中样本标准差最低的 10 个等权（同值按行业顺序）。ETF 月收益按月末复权收盘（含分红）。'

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sampleStd = xs => (xs.length < 2 ? null : Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1)))
const round = (x, digits = 6) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** digits) / 10 ** digits)

/**
 * 合并复权收盘：Yahoo 的 adjclose 在每次分红后会把更早的价格整体重算，
 * 所以新抓到的窗口整段替换缓存中的同期数据；窗口之前的旧数据按首个重叠日的比例换算到新口径。
 * 无重叠时无法对齐，返回 null（调用方应改抓更长的窗口）。
 */
export function mergeAdjusted(old = [], incoming = []) {
  if (!incoming.length) return old
  if (!old.length) return incoming
  const start = incoming[0][0]
  const oldMap = new Map(old)
  const anchor = incoming.find(([d]) => oldMap.has(d))
  const before = old.filter(([d]) => d < start)
  if (!before.length) return incoming
  if (!anchor) return null
  const ratio = anchor[1] / oldMap.get(anchor[0])
  return [...before.map(([d, v]) => [d, v * ratio]), ...incoming]
}

/** [[日期, 复权收盘], ...] 升序 → Map(月 → { d, close }：当月最后一个交易日) */
export function monthEnds(rows) {
  const m = new Map()
  for (const [d, v] of rows) if (Number.isFinite(v) && v > 0) m.set(d.slice(0, 7), { d, close: v })
  return m
}

/**
 * 某只 ETF 在 t 月的总收益。完整月份要求 t−1 月与 t 月都有收盘，且已有 t+1 月的交易日（确认 t 月最后一个交易日已收录）。
 * partial = true 时用于当月至今：只要求 t−1 月月末与 t 月最新收盘。
 */
export function etfMonthReturn(rows, t, { partial = false } = {}) {
  const ends = monthEnds(rows)
  const prev = ends.get(monthAfter(t, -1)); const cur = ends.get(t)
  if (!prev || !cur) return null
  if (!partial && !rows.some(([d]) => d.slice(0, 7) > t)) return null
  return { r: cur.close / prev.close - 1, from: prev.d, to: cur.d }
}

/** 研究口径 P1：防守九行业等权（只用当月有收益的成员）。industry：Map(月 → 49 行业月收益 %)。返回小数。 */
export function researchP1(t, industry) {
  const r = industry.get(t)
  if (!r) return null
  const xs = DEFENSIVE.map(i => r[i]).filter(v => v != null)
  return xs.length ? mean(xs) / 100 : null
}

/** 研究口径 P2 的成员：t 月之前 36 个月（t−36 至 t−1）月收益无缺失的行业中样本标准差最低的 10 个，同值按行业顺序。 */
export function lowVolMembers(t, industry) {
  const hist = Array.from({ length: LOW_VOL_WINDOW }, (_, k) => industry.get(monthAfter(t, -1 - k)))
  if (hist.some(h => !h)) return null
  const cand = INDUSTRIES.map((_, i) => i).filter(i => hist.every(h => h[i] != null))
  const vol = new Map(cand.map(i => [i, sampleStd(hist.map(h => h[i]))]))
  return cand.sort((a, b) => vol.get(a) - vol.get(b) || a - b).slice(0, LOW_VOL_COUNT)
}

/** 研究口径 P2：低波十行业在 t 月等权收益（小数），并给出成员名。 */
export function researchP2(t, industry) {
  const members = lowVolMembers(t, industry)
  const r = industry.get(t)
  if (!members) return { r: null, members: null }
  const xs = r ? members.map(i => r[i]).filter(v => v != null) : []
  return { r: xs.length ? mean(xs) / 100 : null, members: members.map(i => INDUSTRIES[i]) }
}

/**
 * 某月的一行。prices：{ 代码: [[日期, 复权收盘], ...] }；industry：Map(月 → 49 行业月收益 %)。
 * partial = true 为当月至今的预估（研究篮子通常还没有数据）。
 */
export function rowFor(t, { prices, industry }, { partial = false } = {}) {
  const missing = []
  const etf = {}; const span = {}
  for (const s of SYMBOLS) {
    const x = etfMonthReturn(prices[s] ?? [], t, { partial })
    if (!x) missing.push(s)
    etf[s] = x ? round(x.r) : null
    if (x) span[s] = [x.from, x.to]
  }
  const p1Parts = P1_ETFS.map(s => etf[s])
  const p1Etf = p1Parts.every(v => v != null) ? mean(p1Parts) : null
  const spy = etf.SPY
  const blend = leg => (spy == null || leg == null ? null : (1 - TILT) * spy + TILT * leg)

  const p1 = researchP1(t, industry)
  const p2 = researchP2(t, industry)
  if (p1 == null) missing.push('研究 P1')
  if (p2.r == null) missing.push('研究 P2')
  const diff = (a, b) => (a == null || b == null ? null : a - b)

  return {
    month: t,
    etf,
    // 收益区间：上月最后一个交易日至本月最后一个（当月为最新一个）收盘日，以 SPY 为准
    period: span.SPY ?? null,
    p1Etf: round(p1Etf),
    S1: round(blend(p1Etf)), S2: round(blend(etf.USMV)), S2b: round(blend(etf.SPLV)),
    research: { p1: round(p1), p2: round(p2.r), p2Members: p2.members },
    tracking: {
      p1: round(diff(p1Etf, p1)),
      p2Usmv: round(diff(etf.USMV, p2.r)),
      p2Splv: round(diff(etf.SPLV, p2.r)),
    },
    missing,
  }
}

/** 截至最新冻结月的累计：S1、S2、S2b、SPY 的累计收益（只用四者都有的月份），跟踪差的均值与样本标准差。 */
export function summarize(rows) {
  const full = rows.filter(r => ['S1', 'S2', 'S2b'].every(k => r[k] != null) && r.etf.SPY != null)
  const cum = pick => (full.length ? full.reduce((w, r) => w * (1 + pick(r)), 1) - 1 : null)
  const stat = key => {
    const xs = rows.map(r => r.tracking[key]).filter(v => v != null)
    return { months: xs.length, mean: xs.length ? round(mean(xs)) : null, std: round(sampleStd(xs)) }
  }
  return {
    through: rows.at(-1)?.month ?? null,
    months: full.length,
    cumulative: { S1: round(cum(r => r.S1)), S2: round(cum(r => r.S2)), S2b: round(cum(r => r.S2b)), SPY: round(cum(r => r.etf.SPY)) },
    tracking: { p1: stat('p1'), p2Usmv: stat('p2Usmv'), p2Splv: stat('p2Splv') },
  }
}

/**
 * 在已有记录上追加新的完整月份（不改已有行），并更新当月预估。
 * - previous：已有文件内容（可为 null）
 * - prices：{ 代码: [[日期, 复权收盘], ...] }
 * - industry：Map(月 → 49 行业月收益 %)
 * - today：YYYY-MM-DD
 */
export function buildShadow({ previous, prices, industry, today, generatedAt }) {
  const currentMonth = today.slice(0, 7)
  const rows = [...(previous?.rows ?? [])]
  const have = new Set(rows.map(r => r.month))
  for (let t = SHADOW_SINCE; t < currentMonth && t <= SHADOW_UNTIL; t = monthAfter(t, 1)) {
    if (have.has(t)) continue
    const r = rowFor(t, { prices, industry })
    const overdue = monthAfter(t, FREEZE_ANYWAY_AFTER) <= currentMonth
    if (r.missing.length && !overdue) continue
    rows.push({ ...r, frozenAt: today })
  }
  rows.sort((a, b) => a.month.localeCompare(b.month))
  const current = currentMonth <= SHADOW_UNTIL ? { ...rowFor(currentMonth, { prices, industry }, { partial: true }), estimate: true } : null
  return {
    generatedAt, rule: RULE, since: SHADOW_SINCE, until: SHADOW_UNTIL,
    note: '影子运行：只记录、不操作，现行仓位仍按宏观攻守执行。L-026 的预注册下一步，只检验 ETF 执行与研究口径是否一致（看跟踪差），'
      + '不对收益做判定；期满由用户决定是否采用。研究口径篮子用 Ken French 49 行业数据，约晚 1–2 个月发布，'
      + '完整月份在 ETF 行情与研究数据都齐全后冻结（超过 3 个月仍缺则带缺项冻结），之后不再改动。收益均为小数。',
    current,
    rows,
    summary: summarize(rows),
  }
}

/** 已冻结的行不能改、不能删：返回违规的月份列表。 */
export function frozenViolations(previous, next) {
  const after = new Map((next?.rows ?? []).map(r => [r.month, JSON.stringify(r)]))
  return (previous?.rows ?? []).filter(r => after.get(r.month) !== JSON.stringify(r)).map(r => r.month)
}
