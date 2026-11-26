// 板块轮动 ETF 影子运行：只记录、不操作。来自 docs/research/sector-rotation-2026-11-26（L-037）的落地规则：
// 两个候选在预注册检验里「通过」，用 9 只板块 SPDR 跑 12 个月（2026-12 至 2027-11），期满由用户决定。
// S1 = 按 t−12 至 t−2 月（跳过最近一个月）累计收益选前 3；S2 = 按截至 t−1 月末的 3、6、12 个月收益平均选前 3。
// 每个完整月份在 10 只 ETF 行情都齐全后冻结一行，冻结后不再改动；当月只给入选名单与预估。

import { etfMonthReturn, monthEnds } from './defensive-tilt-shadow.mjs'
import { monthAfter } from './late-cycle-shadow.mjs'

export const SHADOW_SINCE = '2026-12'
export const SHADOW_UNTIL = '2027-11'
export const SECTOR_ETFS = ['XLB', 'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLU', 'XLV', 'XLY']
export const SYMBOLS = [...SECTOR_ETFS, 'SPY']
export const TOP = 3
export const NAMES = {
  XLB: '原材料', XLE: '能源', XLF: '金融', XLI: '工业', XLK: '科技', XLP: '日常消费', XLU: '公用事业', XLV: '医疗', XLY: '可选消费', SPY: '标普 500',
}
// 超过这么多个月仍有缺项，就带着缺项冻结，避免永远留空
const FREEZE_ANYWAY_AFTER = 3

export const RULE = '每月初按上月底的数据，在 9 只板块 SPDR（XLB、XLE、XLF、XLI、XLK、XLP、XLU、XLV、XLY）里等权持有动量最强的 3 只。'
  + 'S1：按 t−12 至 t−2 月的累计收益（跳过最近一个月）；S2：按截至上月底的 3、6、12 个月收益的平均。'
  + '对照：9 只等权、SPY。收益按月末复权收盘（含分红），不扣交易成本。'

const round = (x, digits = 6) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** digits) / 10 ** digits)
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length

/** 某只 ETF 在完整月份 m 的月末复权收盘；要求已经出现 m 之后的交易日（确认月末已收录）。 */
export function closeAt(rows, m) {
  if (!rows.some(([d]) => d.slice(0, 7) > m)) return null
  return monthEnds(rows).get(m)?.close ?? null
}

/** 持有月 t 的动量：S1 = end(t−2)/end(t−13) − 1；S2 = 平均_L end(t−1)/end(t−1−L) − 1，L = 3、6、12。缺数据返回 null。 */
export function momentumFor(rows, t, kind) {
  const c = m => closeAt(rows, m)
  if (kind === 'S1') {
    const a = c(monthAfter(t, -2)); const b = c(monthAfter(t, -13))
    return a && b ? a / b - 1 : null
  }
  const last = c(monthAfter(t, -1))
  if (!last) return null
  const parts = [3, 6, 12].map(L => c(monthAfter(t, -1 - L)))
  return parts.every(Boolean) ? mean(parts.map(p => last / p - 1)) : null
}

/** 持有月 t 的入选：先按代码排列，再按动量稳定降序，取前 3。任何一只缺动量就返回 null。 */
export function picksFor(prices, t, kind) {
  const mom = SECTOR_ETFS.map(s => [s, momentumFor(prices[s] ?? [], t, kind)])
  if (mom.some(([, v]) => v == null)) return null
  return [...mom].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([s]) => s)
}

/** 某月的一行。partial = true 为当月至今的预估。 */
export function rowFor(t, prices, { partial = false } = {}) {
  const missing = []
  const etf = {}
  let period = null
  for (const s of SYMBOLS) {
    const x = etfMonthReturn(prices[s] ?? [], t, { partial })
    if (!x) missing.push(s)
    etf[s] = x ? round(x.r) : null
    if (x && s === 'SPY') period = [x.from, x.to]
  }
  const picks = { S1: picksFor(prices, t, 'S1'), S2: picksFor(prices, t, 'S2') }
  if (!picks.S1) missing.push('S1 入选')
  if (!picks.S2) missing.push('S2 入选')
  const basket = list => (list && list.every(s => etf[s] != null) ? round(mean(list.map(s => etf[s]))) : null)
  return {
    month: t,
    picks,
    ret: { S1: basket(picks.S1), S2: basket(picks.S2), EW9: basket(SECTOR_ETFS), SPY: etf.SPY },
    etf,
    period,
    missing,
  }
}

export function summarize(rows) {
  const keys = ['S1', 'S2', 'EW9', 'SPY']
  const full = rows.filter(r => keys.every(k => r.ret[k] != null))
  const cum = k => (full.length ? round(full.reduce((w, r) => w * (1 + r.ret[k]), 1) - 1) : null)
  return { through: rows.at(-1)?.month ?? null, months: full.length, cumulative: Object.fromEntries(keys.map(k => [k, cum(k)])) }
}

/** 在已有记录上追加新的完整月份（不改已有行），并更新当月入选与预估。 */
export function buildShadow({ previous, prices, today, generatedAt }) {
  const currentMonth = today.slice(0, 7)
  const rows = [...(previous?.rows ?? [])]
  const have = new Set(rows.map(r => r.month))
  for (let t = SHADOW_SINCE; t < currentMonth && t <= SHADOW_UNTIL; t = monthAfter(t, 1)) {
    if (have.has(t)) continue
    const r = rowFor(t, prices)
    const overdue = monthAfter(t, FREEZE_ANYWAY_AFTER) <= currentMonth
    if (r.missing.length && !overdue) continue
    rows.push({ ...r, frozenAt: today })
  }
  rows.sort((a, b) => a.month.localeCompare(b.month))
  const inWindow = currentMonth >= SHADOW_SINCE && currentMonth <= SHADOW_UNTIL
  const current = inWindow ? { ...rowFor(currentMonth, prices, { partial: true }), estimate: true } : null
  // 影子期开始前，先给出首月（SHADOW_SINCE）的入选名单（若上月底已结束）
  const upcoming = currentMonth < SHADOW_SINCE
    ? { month: SHADOW_SINCE, picks: { S1: picksFor(prices, SHADOW_SINCE, 'S1'), S2: picksFor(prices, SHADOW_SINCE, 'S2') } }
    : null
  return {
    generatedAt, rule: RULE, since: SHADOW_SINCE, until: SHADOW_UNTIL, names: NAMES,
    note: '影子运行：只记录、不操作，现行仓位仍按宏观攻守执行，股票部分仍买宽基。L-037 预注册「通过」后的落地规则：'
      + '12 个月统计上说明不了什么，主要看执行是否顺畅、与研究口径是否一致；期满由用户决定。完整月份在 10 只 ETF 行情齐全后冻结（超过 3 个月仍缺则带缺项冻结），之后不再改动。收益均为小数，不扣成本。',
    upcoming,
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
