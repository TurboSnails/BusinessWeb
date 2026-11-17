// 同花顺 · 技术选股（/ths-mood/screener）的纯计算：收盘后对全市场做机械条件筛选 + 市场宽度。
// 数据只读复用开盘啦「复盘」页维护的全市场日线快照仓 data-raw/kpl-review/closes/<日期>.csv（格式与复权链见 scripts/kpl-review-lib.mjs）。
// 快照仓没有成交量，需要量的条件（放量突破）不做。这里是历史统计 / 条件筛选，不是买卖信号。
import { prevTradingDay } from './market-mood-lib.mjs'
import { round } from './kpl-review-lib.mjs'

export const HISTORY_DAYS = 20 // 每个预设展示近 20 个交易日命中家数
export const WARM = 60 // MACD / RSI 预热：股票至少有 60 条记录才判定（EMA26 初值影响 < 1%）
export const STREAK_MIN = 5 // 连续上涨 ≥ 5 日
export const RSI_HI = 80
export const RSI_LO = 20
export const HAMMER_MIN = 2 // 锤子线下影线至少为昨收的 2%
const EPS = 1e-9
const rel = (a, b) => Math.abs(a - b) <= 1e-7 * Math.max(Math.abs(a), Math.abs(b), 1)

/**
 * 复权序列：days 升序 [{date, rows: Map(code → {o,h,l,c,p?})}]。
 * 某条记录带昨收 p 且 p ≠ 上一条记录收盘价（除权除息日）时，之前的价格乘以 p ÷ 上一条收盘价，统一到最新一天的价格基准（后推前复权）。
 * 返回 Map(code → {at: Int32Array(天下标 → 序列位置，无记录 −1), day: 天下标[], o,h,l,c: Float64Array})。
 */
export function buildSeries(days) {
  const raw = new Map()
  days.forEach((d, i) => {
    for (const [code, r] of d.rows) {
      let s = raw.get(code)
      if (!s) { s = { day: [], rows: [] }; raw.set(code, s) }
      s.day.push(i); s.rows.push(r)
    }
  })
  const out = new Map()
  for (const [code, s] of raw) {
    const n = s.rows.length
    const o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n)
    let f = 1
    for (let k = n - 1; k >= 0; k--) {
      const r = s.rows[k]
      o[k] = r.o * f; h[k] = r.h * f; l[k] = r.l * f; c[k] = r.c * f
      if (k > 0 && r.p !== undefined && s.rows[k - 1].c > 0) f *= r.p / s.rows[k - 1].c
    }
    const at = new Int32Array(days.length).fill(-1)
    s.day.forEach((d, k) => { at[d] = k })
    out.set(code, { at, day: s.day, o, h, l, c })
  }
  return out
}

/** 简单移动平均：第 k 位 = 最近 n 条收盘均值，不足 n 条为 NaN */
export function sma(c, n) {
  const out = new Float64Array(c.length).fill(NaN)
  let sum = 0
  for (let k = 0; k < c.length; k++) {
    sum += c[k]
    if (k >= n) sum -= c[k - n]
    if (k >= n - 1) out[k] = sum / n
  }
  return out
}
/** EMA(X,N)：Y = (2X + (N−1)Y') / (N+1)，首值取 X[0] */
export function ema(x, n) {
  const out = new Float64Array(x.length)
  for (let k = 0; k < x.length; k++) out[k] = k ? (2 * x[k] + (n - 1) * out[k - 1]) / (n + 1) : x[0]
  return out
}
/** MACD(12,26,9)：DIF = EMA12 − EMA26，DEA = EMA(DIF,9) */
export function macd(c) {
  const e12 = ema(c, 12), e26 = ema(c, 26)
  const dif = e12.map((v, k) => v - e26[k])
  return { dif, dea: ema(dif, 9) }
}
/** RSI(N)（Wilder / 同花顺 SMA(X,N,1) 平滑）：SMA(MAX(C−LC,0),N,1) ÷ SMA(|C−LC|,N,1) × 100；首条为 NaN */
export function rsi(c, n = 14) {
  const out = new Float64Array(c.length).fill(NaN)
  let up = 0, all = 0
  for (let k = 1; k < c.length; k++) {
    const d = c[k] - c[k - 1]
    up = k === 1 ? Math.max(d, 0) : (Math.max(d, 0) + (n - 1) * up) / n
    all = k === 1 ? Math.abs(d) : (Math.abs(d) + (n - 1) * all) / n
    out[k] = all > EPS ? (up / all) * 100 : NaN
  }
  return out
}
/** 每条记录的连续上涨天数（收盘高于上一条记录收盘） */
export function upStreak(c) {
  const out = new Int32Array(c.length)
  for (let k = 1; k < c.length; k++) out[k] = c[k] > c[k - 1] && !rel(c[k], c[k - 1]) ? out[k - 1] + 1 : 0
  return out
}

export function indicators(s) {
  const { dif, dea } = macd(s.c)
  return { ...s, ma5: sma(s.c, 5), ma10: sma(s.c, 10), ma20: sma(s.c, 20), ma60: sma(s.c, 60), dif, dea, rsi: rsi(s.c, 14), streak: upStreak(s.c) }
}

const maxOf = (a, from, to) => { let m = -Infinity; for (let k = from; k <= to; k++) if (a[k] > m) m = a[k]; return m }
const minOf = (a, from, to) => { let m = Infinity; for (let k = from; k <= to; k++) if (a[k] < m) m = a[k]; return m }
const pctOf = (a, b) => round((a / b - 1) * 100, 2)

/**
 * 预设。need：股票至少有多少条记录（含当日）才参与判定；prev：是否要求上一条记录正好是上一交易日（快照仓前一天）。
 * test(s, k) → 命中时返回展示值 x（数字或 null），不命中返回 undefined。
 */
export const PRESETS = [
  { id: 'bull', group: '均线', label: '均线多头排列', need: 60, prev: false, xLabel: 'MA5 较 MA60', xUnit: '%',
    formula: 'MA5 > MA10 > MA20 > MA60，且收盘价 > MA5（MAn = 最近 n 个交易日复权收盘价的算术平均）。',
    test: (s, k) => (s.ma5[k] > s.ma10[k] && s.ma10[k] > s.ma20[k] && s.ma20[k] > s.ma60[k] && s.c[k] > s.ma5[k] ? pctOf(s.ma5[k], s.ma60[k]) : undefined) },
  { id: 'up20', group: '均线', label: '站上 20 日线', need: 21, prev: true, xLabel: '收盘较 MA20', xUnit: '%',
    formula: '今日收盘 > 今日 MA20，且上一交易日收盘 ≤ 上一交易日 MA20（今日向上穿越）。',
    test: (s, k) => (s.c[k] > s.ma20[k] && s.c[k - 1] <= s.ma20[k - 1] ? pctOf(s.c[k], s.ma20[k]) : undefined) },
  { id: 'down20', group: '均线', label: '跌破 20 日线', need: 21, prev: true, asc: true, xLabel: '收盘较 MA20', xUnit: '%',
    formula: '今日收盘 < 今日 MA20，且上一交易日收盘 ≥ 上一交易日 MA20（今日向下穿越）。',
    test: (s, k) => (s.c[k] < s.ma20[k] && s.c[k - 1] >= s.ma20[k - 1] ? pctOf(s.c[k], s.ma20[k]) : undefined) },
  { id: 'golden', group: 'MACD / RSI', label: 'MACD 金叉', need: WARM, prev: true, xLabel: 'DIF', xUnit: '',
    formula: '日线 MACD(12,26,9)：DIF = EMA(C,12) − EMA(C,26)，DEA = EMA(DIF,9)。今日 DIF > DEA 且上一交易日 DIF ≤ DEA。',
    test: (s, k) => (s.dif[k] > s.dea[k] && s.dif[k - 1] <= s.dea[k - 1] ? round(s.dif[k], 3) : undefined) },
  { id: 'dead', group: 'MACD / RSI', label: 'MACD 死叉', need: WARM, prev: true, xLabel: 'DIF', xUnit: '',
    formula: '同上参数。今日 DIF < DEA 且上一交易日 DIF ≥ DEA。',
    test: (s, k) => (s.dif[k] < s.dea[k] && s.dif[k - 1] >= s.dea[k - 1] ? round(s.dif[k], 3) : undefined) },
  { id: 'rsiHi', group: 'MACD / RSI', label: `RSI 超买 >${RSI_HI}`, need: WARM, prev: false, xLabel: 'RSI(14)', xUnit: '',
    formula: `RSI(14) = SMA(MAX(C−LC,0),14,1) ÷ SMA(|C−LC|,14,1) × 100（LC 为上一交易日收盘，SMA(X,N,1) 即 Wilder 平滑）。今日 RSI > ${RSI_HI}。`,
    test: (s, k) => (s.rsi[k] > RSI_HI ? round(s.rsi[k], 1) : undefined) },
  { id: 'rsiLo', group: 'MACD / RSI', label: `RSI 超卖 <${RSI_LO}`, need: WARM, prev: false, asc: true, xLabel: 'RSI(14)', xUnit: '',
    formula: `同上口径。今日 RSI < ${RSI_LO}。`,
    test: (s, k) => (s.rsi[k] < RSI_LO ? round(s.rsi[k], 1) : undefined) },
  { id: 'high20', group: '新高新低', label: '20 日新高', need: 20, prev: false, xLabel: '20 日涨幅', xUnit: '%',
    formula: '今日最高价 > 此前 19 个交易日（复权）最高价的最大值，即 20 个交易日窗口内最高。股票需至少有 20 条记录。',
    test: (s, k) => (s.h[k] > maxOf(s.h, k - 19, k - 1) + EPS ? pctOf(s.c[k], s.c[k - 19]) : undefined) },
  { id: 'low20', group: '新高新低', label: '20 日新低', need: 20, prev: false, asc: true, xLabel: '20 日涨幅', xUnit: '%',
    formula: '今日最低价 < 此前 19 个交易日（复权）最低价的最小值。',
    test: (s, k) => (s.l[k] < minOf(s.l, k - 19, k - 1) - EPS ? pctOf(s.c[k], s.c[k - 19]) : undefined) },
  { id: 'high60', group: '新高新低', label: '60 日新高', need: 60, prev: false, xLabel: '60 日涨幅', xUnit: '%',
    formula: '今日最高价 > 此前 59 个交易日（复权）最高价的最大值。股票需至少有 60 条记录。',
    test: (s, k) => (s.h[k] > maxOf(s.h, k - 59, k - 1) + EPS ? pctOf(s.c[k], s.c[k - 59]) : undefined) },
  { id: 'streak', group: 'K 线形态', label: `连续上涨 ≥${STREAK_MIN} 日`, need: STREAK_MIN + 1, prev: true, xLabel: '连涨天数', xUnit: '天',
    formula: `收盘价连续 ≥ ${STREAK_MIN} 个交易日高于上一交易日收盘（复权，平盘中断计数）。`,
    test: (s, k) => (s.streak[k] >= STREAK_MIN ? s.streak[k] : undefined) },
  { id: 'gap', group: 'K 线形态', label: '跳空缺口未回补', need: 2, prev: true, xLabel: '缺口幅度', xUnit: '%',
    formula: '今日最低价 > 上一交易日最高价（开盘跳空高开，且全天直到收盘都没有回落到昨日最高价，缺口未回补）。缺口幅度 =（今日最低 ÷ 昨日最高 − 1）。一字涨停也会命中。',
    test: (s, k) => (s.l[k] > s.h[k - 1] + EPS && !rel(s.l[k], s.h[k - 1]) ? pctOf(s.l[k], s.h[k - 1]) : undefined) },
  { id: 'hammer', group: 'K 线形态', label: '长下影线（锤子线）', need: 2, prev: true, xLabel: '下影线 / 昨收', xUnit: '%',
    formula: `下影线 = min(开,收) − 最低，实体 = |收 − 开|，上影线 = 最高 − max(开,收)。条件：下影线 ≥ 2 × 实体，上影线 ≤ 实体，且下影线 ≥ 昨收的 ${HAMMER_MIN}%（排除振幅极小的 K 线）。只看单日形态，不判断前期是否下跌。`,
    test: (s, k) => {
      const body = Math.abs(s.c[k] - s.o[k]), lower = Math.min(s.o[k], s.c[k]) - s.l[k], upper = s.h[k] - Math.max(s.o[k], s.c[k])
      const lp = (lower / s.c[k - 1]) * 100
      return lower >= 2 * body - EPS && upper <= body + EPS && lp >= HAMMER_MIN - EPS ? round(lp, 2) : undefined
    } },
]

/** 某股第 k 条记录是否满足预设的数据前提 */
function eligible(p, s, k, i) {
  if (k + 1 < p.need) return false
  if (p.prev && (k < 1 || s.day[k - 1] !== i - 1)) return false
  return true
}

/** 第 i 天各预设命中：Map(id → {hits: [[code, x]], eligible}) */
export function screenDay(ind, i) {
  const out = new Map(PRESETS.map((p) => [p.id, { hits: [], eligible: 0 }]))
  for (const [code, s] of ind) {
    const k = s.at[i]
    if (k < 0) continue
    for (const p of PRESETS) {
      if (!eligible(p, s, k, i)) continue
      const o = out.get(p.id)
      o.eligible++
      const x = p.test(s, k)
      if (x !== undefined) o.hits.push([code, Number.isFinite(x) ? x : null])
    }
  }
  return out
}

/**
 * 第 i 天的市场宽度。只统计当日有行情的股票：
 * 站上 MA20 / MA60 占比 = 收盘 > MAn 的家数 ÷ 有 n 条以上记录的家数；20 日新高 / 新低同上面预设；
 * 涨 / 跌 / 平：当日收盘较上一交易日收盘（复权），上一条记录不在上一交易日的不计。
 */
export function breadthDay(ind, i) {
  let n20 = 0, a20 = 0, n60 = 0, a60 = 0, hi = 0, lo = 0, up = 0, down = 0, flat = 0
  for (const s of ind.values()) {
    const k = s.at[i]
    if (k < 0) continue
    if (k >= 19) {
      n20++
      if (s.c[k] > s.ma20[k]) a20++
      if (s.h[k] > maxOf(s.h, k - 19, k - 1) + EPS) hi++
      if (s.l[k] < minOf(s.l, k - 19, k - 1) - EPS) lo++
    }
    if (k >= 59) { n60++; if (s.c[k] > s.ma60[k]) a60++ }
    if (k >= 1 && s.day[k - 1] === i - 1) {
      if (rel(s.c[k], s.c[k - 1])) flat++
      else if (s.c[k] > s.c[k - 1]) up++
      else down++
    }
  }
  const pct = (a, n) => (n >= 1000 ? round((a / n) * 100, 1) : null)
  return {
    above20: pct(a20, n20), above60: pct(a60, n60), high20: n20 >= 1000 ? hi : null, low20: n20 >= 1000 ? lo : null,
    up, down, flat, ratio: down > 0 ? round(up / down, 2) : null, n: n20,
  }
}

/** 当日个股信息：名称、行业、复权收盘（= 当日实际收盘）、涨跌幅、收盘较 MA20、RSI */
export function stockInfo(s, k, i) {
  const prevOk = k >= 1 && s.day[k - 1] === i - 1
  return {
    close: round(s.c[k], 2),
    pct: prevOk ? pctOf(s.c[k], s.c[k - 1]) : null,
    dev20: Number.isFinite(s.ma20[k]) ? pctOf(s.c[k], s.ma20[k]) : null,
    rsi: k + 1 >= WARM && Number.isFinite(s.rsi[k]) ? round(s.rsi[k], 1) : null,
  }
}

/**
 * 主计算：days 快照仓（升序，只含 ≤ 目标日），i 目标日下标；meta Map(code → {name, industry})。
 * 返回页面 JSON 的 presets / stocks / breadth / universe 部分。
 */
export function buildScreener(days, i, meta = new Map()) {
  const ind = new Map([...buildSeries(days.slice(0, i + 1))].map(([code, s]) => [code, indicators(s)]))
  const today = screenDay(ind, i)
  const used = new Set()
  const presets = PRESETS.map((p) => {
    const t = today.get(p.id)
    const dir = p.asc ? -1 : 1 // 展示值默认从大到小，跌破 / 超卖 / 新低从小到大；null 排最后
    t.hits.sort((a, b) => (a[1] === null) - (b[1] === null) || dir * ((b[1] ?? 0) - (a[1] ?? 0)) || a[0].localeCompare(b[0]))
    for (const [c] of t.hits) used.add(c)
    return { id: p.id, group: p.group, label: p.label, formula: p.formula, xLabel: p.xLabel, xUnit: p.xUnit, asc: !!p.asc, count: t.hits.length, eligible: t.eligible, hits: t.hits, history: [] }
  })
  for (let j = Math.max(0, i - HISTORY_DAYS + 1); j <= i; j++) {
    const r = j === i ? today : screenDay(ind, j)
    presets.forEach((p, n) => {
      const need = PRESETS[n].need
      p.history.push({ date: days[j].date, count: j + 1 >= need ? r.get(p.id).hits.length : null })
    })
  }
  const stocks = {}
  for (const code of [...used].sort()) {
    const s = ind.get(code)
    const m = meta.get(code) ?? {}
    const info = stockInfo(s, s.at[i], i)
    stocks[code] = [m.name ?? '', m.industry ?? '', info.close, info.pct, info.dev20, info.rsi]
  }
  const breadth = []
  for (let j = 19; j <= i; j++) {
    const b = breadthDay(ind, j)
    const consecutive = j > 0 && prevTradingDay(days[j].date) === days[j - 1].date
    if (!consecutive) { b.up = null; b.down = null; b.flat = null; b.ratio = null }
    breadth.push({ date: days[j].date, seeded: days[j].source !== 'sina', ...b })
  }
  let universe = 0
  for (const s of ind.values()) if (s.at[i] >= 0) universe++
  return { presets, stocks, breadth, universe }
}

/** 目标交易日：北京时间交易日 15:10 之后为当天，否则为上一交易日 */
export function expectedDate(now, isTradingDay) {
  const bj = new Date(now.getTime() + 8 * 3600e3)
  const today = bj.toISOString().slice(0, 10)
  return isTradingDay(today) && bj.getUTCHours() * 60 + bj.getUTCMinutes() >= 910 ? today : prevTradingDay(today)
}
