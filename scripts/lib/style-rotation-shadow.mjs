// 风格轮动 ETF 影子运行与风格雷达读数：只记录、不操作。来自 docs/research/style-rotation-2026-11-28（L-042）：
// 两个候选按预注册「通过」，ETF 写法见同目录 CLARIFY-1.md，影子期 2026-12 至 2027-11，期满由用户决定。
// R1 = 6 只风格 ETF 按 12 个月复利收益取前 2；R2 = 价值、动量、盈利、规模四对按 12 个月月收益差之和选边，投资一对固定放市场，各 20%。
// 每个完整月份在两组 ETF 行情都齐全后冻结一行，冻结后不再改动；当月只给入选名单与预估。

import { etfMonthReturn } from './defensive-tilt-shadow.mjs'
import { monthAfter } from './late-cycle-shadow.mjs'
import { closeAt } from './sector-rotation-shadow.mjs'

export const SHADOW_SINCE = '2026-12'
export const SHADOW_UNTIL = '2027-11'
export const LOOKBACK = 12
export const TOP = 2

/** 每组 6 只，顺序即同值时的优先顺序（V+, V−, M+, P+, S+, 市场）。 */
export const GROUPS = {
  us: { label: '美国', legs: { 'V+': 'IVE', 'V-': 'IVW', 'M+': 'MTUM', 'P+': 'QUAL', 'S+': 'IJR', MKT: 'IVV' } },
  intl: { label: '海外发达市场', legs: { 'V+': 'EFV', 'V-': 'EFG', 'M+': 'IMTM', 'P+': 'IQLT', 'S+': 'SCZ', MKT: 'EFA' } },
}
export const LEG_NAMES = { 'V+': '价值', 'V-': '成长', 'M+': '动量', 'P+': '高盈利', 'S+': '小盘', MKT: '大盘' }
export const LEG_ORDER = ['V+', 'V-', 'M+', 'P+', 'S+', 'MKT']
// R2 的四对（正向, 反向）；投资一对没有 ETF，固定放市场
export const PAIRS = [['V+', 'V-'], ['M+', 'MKT'], ['P+', 'MKT'], ['S+', 'MKT']]
export const STATIC_LEGS = ['V+', 'M+', 'P+', 'S+']
export const SYMBOLS = Object.values(GROUPS).flatMap(g => Object.values(g.legs))
const FREEZE_ANYWAY_AFTER = 3

export const RULE = '每月初按上月底为止 12 个月的月收益，在 6 只风格 ETF 里选。R1：12 个月复利收益最高的 2 只等权；'
  + 'R2：价值（价值 ETF 对成长 ETF）、动量、高盈利、小盘（各自对大盘 ETF）四对按 12 个月月收益差之和选边，投资因子没有 ETF 固定放大盘，五份各 20%。'
  + '对照：6 只等权；一直持有价值、动量、高盈利、小盘各 25%（事后补充）；大盘。收益按月末复权收盘（含分红），不扣成本。'

const round = (x, digits = 6) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** digits) / 10 ** digits)
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length

/** 完整月份 m 的月收益（月末复权收盘之比），缺数据返回 null。 */
export function monthReturn(rows, m) {
  const a = closeAt(rows, m); const b = closeAt(rows, monthAfter(m, -1))
  return a && b ? a / b - 1 : null
}

/** 持有月 t 之前 12 个月（t−12 至 t−1）的月收益；任一缺失返回 null。 */
export function trailing(rows, t) {
  const out = []
  for (let k = LOOKBACK; k >= 1; k -= 1) {
    const r = monthReturn(rows, monthAfter(t, -k))
    if (r == null) return null
    out.push(r)
  }
  return out
}

/** 一组在持有月 t 的读数：各腿 12 个月复利收益、R1 前 2、R2 选边与权重。缺数据返回 null。 */
export function readingFor(group, prices, t) {
  const legs = GROUPS[group].legs
  const tr = {}
  for (const leg of LEG_ORDER) {
    const x = trailing(prices[legs[leg]] ?? [], t)
    if (!x) return null
    tr[leg] = x
  }
  const mom = Object.fromEntries(LEG_ORDER.map(l => [l, round(tr[l].reduce((w, r) => w * (1 + r), 1) - 1)]))
  const r1 = [...LEG_ORDER].sort((a, b) => mom[b] - mom[a] || LEG_ORDER.indexOf(a) - LEG_ORDER.indexOf(b)).slice(0, TOP)
  const w2 = Object.fromEntries(LEG_ORDER.map(l => [l, 0]))
  w2.MKT += 0.2 // 投资因子
  const sides = {}
  for (const [a, b] of PAIRS) {
    const d = Math.round(tr[a].reduce((s, r, i) => s + r - tr[b][i], 0) * 1e10) / 1e10
    if (d > 0) { w2[a] += 0.2; sides[a] = a } else if (d < 0) { w2[b] += 0.2; sides[a] = b } else { w2[a] += 0.1; w2[b] += 0.1; sides[a] = 'half' }
  }
  return { mom, r1, r2: Object.fromEntries(LEG_ORDER.map(l => [l, round(w2[l], 4)])), sides }
}

/** 某月的一行（两组）。partial = true 为当月至今的预估。 */
export function rowFor(t, prices, { partial = false } = {}) {
  const missing = []
  const groups = {}
  for (const g of Object.keys(GROUPS)) {
    const legs = GROUPS[g].legs
    const etf = {}
    for (const leg of LEG_ORDER) {
      const x = etfMonthReturn(prices[legs[leg]] ?? [], t, { partial })
      if (!x) missing.push(legs[leg])
      etf[leg] = x ? round(x.r) : null
    }
    const reading = readingFor(g, prices, t)
    if (!reading) missing.push(`${GROUPS[g].label}读数`)
    const have = ls => ls.every(l => etf[l] != null)
    const ret = {
      R1: reading && have(reading.r1) ? round(mean(reading.r1.map(l => etf[l]))) : null,
      R2: reading && have(LEG_ORDER) ? round(LEG_ORDER.reduce((s, l) => s + reading.r2[l] * etf[l], 0)) : null,
      EW6: have(LEG_ORDER) ? round(mean(LEG_ORDER.map(l => etf[l]))) : null,
      STATIC: have(STATIC_LEGS) ? round(mean(STATIC_LEGS.map(l => etf[l]))) : null,
      MKT: etf.MKT,
    }
    groups[g] = { reading, ret, etf }
  }
  return { month: t, groups, missing }
}

export function summarize(rows) {
  const keys = ['R1', 'R2', 'EW6', 'STATIC', 'MKT']
  const out = {}
  for (const g of Object.keys(GROUPS)) {
    const full = rows.filter(r => keys.every(k => r.groups?.[g]?.ret?.[k] != null))
    out[g] = {
      months: full.length,
      cumulative: Object.fromEntries(keys.map(k => [k, full.length ? round(full.reduce((w, r) => w * (1 + r.groups[g].ret[k]), 1) - 1) : null])),
    }
  }
  return { through: rows.at(-1)?.month ?? null, ...out }
}

/** 在已有记录上追加新的完整月份（不改已有行），并更新当月读数。radar 字段始终给出下一持有月的读数，供风格雷达展示。 */
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
  // 风格雷达：当月读数（用到上月底）；上月底那个月若还没被确认收录，就退回上一个月
  let radarMonth = currentMonth
  const radar = {}
  for (const g of Object.keys(GROUPS)) radar[g] = readingFor(g, prices, radarMonth)
  if (Object.values(radar).some(v => !v)) {
    radarMonth = monthAfter(currentMonth, -1)
    for (const g of Object.keys(GROUPS)) radar[g] = readingFor(g, prices, radarMonth)
  }
  return {
    generatedAt, rule: RULE, since: SHADOW_SINCE, until: SHADOW_UNTIL,
    groups: Object.fromEntries(Object.entries(GROUPS).map(([k, v]) => [k, { label: v.label, legs: v.legs }])),
    legNames: LEG_NAMES,
    note: '影子运行：只记录、不操作，现行仓位仍按宏观攻守执行，股票部分仍买宽基。L-042 预注册「通过」后的落地规则；ETF 写法见 CLARIFY-1。'
      + '12 个月统计上说明不了什么，主要看执行是否顺畅、R1/R2 与「一直持有正向腿」的差别是否与历史一致；期满由用户决定。收益均为小数，不扣成本。',
    radar: { month: radarMonth, ...radar },
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
