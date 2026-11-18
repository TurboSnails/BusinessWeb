// 同花顺 · 技术选股（/ths-mood/screener）的纯计算：收盘后对全市场做机械条件筛选 + 市场宽度。
// 数据只读复用开盘啦「复盘」页维护的全市场日线快照仓 data-raw/kpl-review/closes/<日期>.csv（格式与复权链见 scripts/kpl-review-lib.mjs）。
// 快照仓只有开高低收、没有成交量：量能条件（量比 / 换手 / 放量）只用收盘后一次东财全市场行情快照（clist）做「当日」判定，没有历史回算。
// 这里是历史统计 / 条件筛选，不是买卖信号。
import { prevTradingDay } from './market-mood-lib.mjs'
import { round } from './kpl-review-lib.mjs'

export const HISTORY_DAYS = 20 // 每个预设展示近 20 个交易日命中家数
export const WARM = 60 // MACD / RSI 预热：股票至少有 60 条记录才判定（EMA26 初值影响 < 1%）
export const STREAK_MIN = 5 // 连续上涨 ≥ 5 日
export const RSI_HI = 80
export const RSI_LO = 20
export const HAMMER_MIN = 2 // 锤子线下影线至少为昨收的 2%
export const BOLL_N = 20 // BOLL(20,2)
export const BOLL_K = 2
// 布林带收口：今日带宽处于近 SQUEEZE_WIN 个交易日带宽的最低 10%。快照仓只保留 130 个交易日，带宽要先有 20 日数据，
// 最长只能回看约 110 个带宽值，所以用 100 日而不是常见的 120 日。
export const SQUEEZE_WIN = 100
export const SQUEEZE_PCT = 10
export const TANGLE_MAX = 1 // 均线粘合：MA5 / MA10 / MA20 最大最小之差 ≤ 收盘价的 1%
export const KDJ_WARM = 30 // KDJ 预热：K、D 初值 50，经 SMA(·,3,1) 约 20 日后初值影响 < 0.03%
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

/** 每条记录的连续下跌天数（收盘低于上一条记录收盘） */
export function downStreak(c) {
  const out = new Int32Array(c.length)
  for (let k = 1; k < c.length; k++) out[k] = c[k] < c[k - 1] && !rel(c[k], c[k - 1]) ? out[k - 1] + 1 : 0
  return out
}
/**
 * BOLL(N,K)（同花顺 / 通达信口径）：MID = MA(C,N)，UPPER = MID + K × STD(C,N)，LOWER = MID − K × STD(C,N)，
 * STD 为样本标准差（除以 N−1）。带宽 BW = (UPPER − LOWER) ÷ MID × 100。不足 N 条为 NaN。
 */
export function boll(c, n = BOLL_N, k = BOLL_K) {
  const mid = sma(c, n), up = new Float64Array(c.length).fill(NaN), lo = new Float64Array(c.length).fill(NaN), bw = new Float64Array(c.length).fill(NaN)
  for (let i = n - 1; i < c.length; i++) {
    let ss = 0
    for (let j = i - n + 1; j <= i; j++) ss += (c[j] - mid[i]) ** 2
    const sd = Math.sqrt(ss / (n - 1))
    up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd
    bw[i] = mid[i] > 0 ? ((up[i] - lo[i]) / mid[i]) * 100 : NaN
  }
  return { mid, up, lo, bw }
}
/**
 * KDJ(9,3,3)：RSV = (C − LLV(L,9)) ÷ (HHV(H,9) − LLV(L,9)) × 100，K = SMA(RSV,3,1)，D = SMA(K,3,1)，J = 3K − 2D。
 * K、D 初值 50；不足 9 条时用已有记录的最高 / 最低（与行情软件一致）；9 日最高 = 最低（一字横盘）时 RSV 沿用上一值。
 */
export function kdj(h, l, c, n = 9) {
  const K = new Float64Array(c.length), D = new Float64Array(c.length), J = new Float64Array(c.length)
  let k0 = 50, d0 = 50, rsv = 50
  for (let i = 0; i < c.length; i++) {
    const from = Math.max(0, i - n + 1)
    const hh = maxOf(h, from, i), ll = minOf(l, from, i)
    if (hh - ll > EPS) rsv = ((c[i] - ll) / (hh - ll)) * 100
    k0 = (rsv + 2 * k0) / 3; d0 = (k0 + 2 * d0) / 3
    K[i] = k0; D[i] = d0; J[i] = 3 * k0 - 2 * d0
  }
  return { k: K, d: D, j: J }
}

export function indicators(s) {
  const { dif, dea } = macd(s.c)
  const b = boll(s.c), kd = kdj(s.h, s.l, s.c)
  return {
    ...s, ma5: sma(s.c, 5), ma10: sma(s.c, 10), ma20: sma(s.c, 20), ma60: sma(s.c, 60), dif, dea, rsi: rsi(s.c, 14), streak: upStreak(s.c), dstreak: downStreak(s.c),
    bup: b.up, blo: b.lo, bw: b.bw, kk: kd.k, kd: kd.d, kj: kd.j,
  }
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
  { id: 'tangle', group: '均线', label: '均线粘合', need: 20, prev: false, asc: true, xLabel: '均线离散度', xUnit: '%',
    formula: `（MA5、MA10、MA20 三者最大值 − 最小值）÷ 今日收盘 × 100 ≤ ${TANGLE_MAX}%，即三条均线挤在收盘价 ${TANGLE_MAX}% 的范围内。展示值为该离散度，越小越粘合。`,
    test: (s, k) => {
      const hi = Math.max(s.ma5[k], s.ma10[k], s.ma20[k]), lo = Math.min(s.ma5[k], s.ma10[k], s.ma20[k])
      const x = ((hi - lo) / s.c[k]) * 100
      return x <= TANGLE_MAX + EPS ? round(x, 2) : undefined
    } },
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
  { id: 'kdjGold', group: 'KDJ / BOLL', label: 'KDJ 金叉', need: KDJ_WARM, prev: true, xLabel: 'K 值', xUnit: '',
    formula: 'KDJ(9,3,3)：RSV = (C − 9 日最低价) ÷ (9 日最高价 − 9 日最低价) × 100，K = SMA(RSV,3,1)，D = SMA(K,3,1)，J = 3K − 2D（SMA(X,3,1) = (X + 2 × 前值) ÷ 3，K、D 初值 50；最高 / 最低价取快照仓的复权日线高低价）。今日 K > D 且上一交易日 K ≤ D。股票需至少 30 条记录。',
    test: (s, k) => (s.kk[k] > s.kd[k] && s.kk[k - 1] <= s.kd[k - 1] ? round(s.kk[k], 1) : undefined) },
  { id: 'kdjDead', group: 'KDJ / BOLL', label: 'KDJ 死叉', need: KDJ_WARM, prev: true, xLabel: 'K 值', xUnit: '',
    formula: '同上口径。今日 K < D 且上一交易日 K ≥ D。',
    test: (s, k) => (s.kk[k] < s.kd[k] && s.kk[k - 1] >= s.kd[k - 1] ? round(s.kk[k], 1) : undefined) },
  { id: 'bollUp', group: 'KDJ / BOLL', label: '收盘上穿布林上轨', need: BOLL_N + 1, prev: true, xLabel: '收盘较上轨', xUnit: '%',
    formula: `BOLL(${BOLL_N},${BOLL_K})：中轨 = MA${BOLL_N}，上轨 = 中轨 + ${BOLL_K} × STD，下轨 = 中轨 − ${BOLL_K} × STD（STD 为最近 ${BOLL_N} 个复权收盘价的样本标准差，除以 N−1，同花顺 / 通达信口径）。今日收盘 > 今日上轨，且上一交易日收盘 ≤ 上一交易日上轨。`,
    test: (s, k) => (s.c[k] > s.bup[k] && s.c[k - 1] <= s.bup[k - 1] ? pctOf(s.c[k], s.bup[k]) : undefined) },
  { id: 'bollDown', group: 'KDJ / BOLL', label: '收盘跌破布林下轨', need: BOLL_N + 1, prev: true, asc: true, xLabel: '收盘较下轨', xUnit: '%',
    formula: '同上口径。今日收盘 < 今日下轨，且上一交易日收盘 ≥ 上一交易日下轨。',
    test: (s, k) => (s.c[k] < s.blo[k] && s.c[k - 1] >= s.blo[k - 1] ? pctOf(s.c[k], s.blo[k]) : undefined) },
  { id: 'squeeze', group: 'KDJ / BOLL', label: '布林带收口', need: BOLL_N + SQUEEZE_WIN - 1, prev: false, asc: true, xLabel: '带宽', xUnit: '%',
    formula: `带宽 = (上轨 − 下轨) ÷ 中轨 × 100（同上 BOLL 口径）。今日带宽不高于近 ${SQUEEZE_WIN} 个交易日（含今日）带宽从小到大第 ${SQUEEZE_WIN * SQUEEZE_PCT / 100} 个值，即处于最低 ${SQUEEZE_PCT}%。快照仓只保留 130 个交易日、带宽要先有 ${BOLL_N} 日数据，所以回看 ${SQUEEZE_WIN} 日而不是常见的 120 日；股票需至少 ${BOLL_N + SQUEEZE_WIN - 1} 条记录。`,
    test: (s, k) => {
      const w = s.bw.slice(k - SQUEEZE_WIN + 1, k + 1).sort()
      const cut = w[SQUEEZE_WIN * SQUEEZE_PCT / 100 - 1]
      return s.bw[k] <= cut + EPS ? round(s.bw[k], 2) : undefined
    } },
  { id: 'high20', group: '新高新低', label: '20 日新高', need: 20, prev: false, xLabel: '20 日涨幅', xUnit: '%',
    formula: '今日最高价 > 此前 19 个交易日（复权）最高价的最大值，即 20 个交易日窗口内最高。股票需至少有 20 条记录。',
    test: (s, k) => (s.h[k] > maxOf(s.h, k - 19, k - 1) + EPS ? pctOf(s.c[k], s.c[k - 19]) : undefined) },
  { id: 'low20', group: '新高新低', label: '20 日新低', need: 20, prev: false, asc: true, xLabel: '20 日涨幅', xUnit: '%',
    formula: '今日最低价 < 此前 19 个交易日（复权）最低价的最小值。',
    test: (s, k) => (s.l[k] < minOf(s.l, k - 19, k - 1) - EPS ? pctOf(s.c[k], s.c[k - 19]) : undefined) },
  { id: 'high60', group: '新高新低', label: '60 日新高', need: 60, prev: false, xLabel: '60 日涨幅', xUnit: '%',
    formula: '今日最高价 > 此前 59 个交易日（复权）最高价的最大值。股票需至少有 60 条记录。',
    test: (s, k) => (s.h[k] > maxOf(s.h, k - 59, k - 1) + EPS ? pctOf(s.c[k], s.c[k - 59]) : undefined) },
  { id: 'high120', group: '新高新低', label: '120 日新高', need: 120, prev: false, xLabel: '120 日涨幅', xUnit: '%',
    formula: '今日最高价 > 此前 119 个交易日（复权）最高价的最大值。股票需至少有 120 条记录（快照仓保留 130 个交易日，次新股和长期停牌股不参与）。',
    test: (s, k) => (s.h[k] > maxOf(s.h, k - 119, k - 1) + EPS ? pctOf(s.c[k], s.c[k - 119]) : undefined) },
  { id: 'low60', group: '新高新低', label: '60 日新低', need: 60, prev: false, asc: true, xLabel: '60 日涨幅', xUnit: '%',
    formula: '今日最低价 < 此前 59 个交易日（复权）最低价的最小值。',
    test: (s, k) => (s.l[k] < minOf(s.l, k - 59, k - 1) - EPS ? pctOf(s.c[k], s.c[k - 59]) : undefined) },
  { id: 'low120', group: '新高新低', label: '120 日新低', need: 120, prev: false, asc: true, xLabel: '120 日涨幅', xUnit: '%',
    formula: '今日最低价 < 此前 119 个交易日（复权）最低价的最小值。股票需至少有 120 条记录。',
    test: (s, k) => (s.l[k] < minOf(s.l, k - 119, k - 1) - EPS ? pctOf(s.c[k], s.c[k - 119]) : undefined) },
  { id: 'streak', group: 'K 线形态', label: `连续上涨 ≥${STREAK_MIN} 日`, need: STREAK_MIN + 1, prev: true, xLabel: '连涨天数', xUnit: '天',
    formula: `收盘价连续 ≥ ${STREAK_MIN} 个交易日高于上一交易日收盘（复权，平盘中断计数）。`,
    test: (s, k) => (s.streak[k] >= STREAK_MIN ? s.streak[k] : undefined) },
  { id: 'dstreak', group: 'K 线形态', label: `连续下跌 ≥${STREAK_MIN} 日`, need: STREAK_MIN + 1, prev: true, xLabel: '连跌天数', xUnit: '天',
    formula: `收盘价连续 ≥ ${STREAK_MIN} 个交易日低于上一交易日收盘（复权，平盘中断计数）。`,
    test: (s, k) => (s.dstreak[k] >= STREAK_MIN ? s.dstreak[k] : undefined) },
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

// ───────────── 量能条件（当日快照）─────────────
// 东财 push2delay clist 全市场快照：不带交易日期，只带每行的行情时间 f124（Unix 秒）。
// 只在目标交易日当天北京时间 15:10 之后抓，并逐行核对 f124 是目标日 15:00 以后；再用收盘价与快照仓当日收盘逐只比对，确认是同一天。
export const SNAP_FS = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048' // 沪深主板、创业板、科创板、北交所
export const SNAP_FIELDS = 'f2,f3,f6,f7,f8,f10,f12,f14,f15,f16,f124'
export const SNAP_PZ = 100
export const SNAP_MIN = 4000
export const SNAP_MAX_PAGES = 80
export const VOL_RATIO = 2 // 放量：量比 ≥ 2
export const VOL_PCT = 3 // 放量上涨 / 下跌：涨跌幅绝对值 ≥ 3%
export const TURNOVER_HI = 10 // 高换手：换手率 ≥ 10%
export const AMP_HI = 10 // 高振幅：振幅 ≥ 10%
export const SNAP_HISTORY_KEEP = 60

export const snapUrl = (pn) => 'https://push2delay.eastmoney.com/api/qt/clist/get?' + new URLSearchParams({ pn: String(pn), pz: String(SNAP_PZ), po: '1', np: '1', fltt: '2', invt: '2', fid: 'f12', fs: SNAP_FS, fields: SNAP_FIELDS })

/** null / '' / '-' / 非有限数 → null（缺失，不是 0） */
export const snapNum = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && x.trim() !== '-' && Number.isFinite(Number(x)) ? Number(x) : null)

/** f124 行情时间是 date（北京）当天 15:00 以后 */
export function isCloseTs(ts, date) {
  const t = snapNum(ts)
  if (t === null || t <= 0) return false
  const bj = new Date(t * 1000 + 8 * 3600e3)
  return bj.toISOString().slice(0, 10) === date && bj.getUTCHours() * 60 + bj.getUTCMinutes() >= 900
}

/** 一页 clist → { total, rows }；结构异常抛错 */
export function parseSnapPage(body) {
  if (body?.rc !== 0 || !body?.data || !Number.isInteger(body.data.total) || !Array.isArray(body.data.diff)) throw new Error('东财 clist 结构异常')
  const rows = body.data.diff.map((r) => ({
    code: typeof r?.f12 === 'string' && /^\d{6}$/.test(r.f12) ? r.f12 : null, name: typeof r?.f14 === 'string' ? r.f14.trim() : '',
    close: snapNum(r?.f2), pct: snapNum(r?.f3), amount: snapNum(r?.f6), amp: snapNum(r?.f7), turnover: snapNum(r?.f8), volRatio: snapNum(r?.f10),
    high: snapNum(r?.f15), low: snapNum(r?.f16), ts: snapNum(r?.f124),
  }))
  return { total: body.data.total, rows }
}

/**
 * 整份快照校验（分页拼完之后）：
 * - total ≥ 4000，去重后的代码数 = 行数 = total（分页没有漏页、重页）；
 * - 有效行（行情时间为目标日 15:00 后、收盘价和成交额 > 0）≥ 80%（停牌股行情时间停在旧日期，不算有效）；
 * - 有效行里与快照仓当日都有记录的股票，收盘价与快照仓当日收盘相差 ≤ 0.005 元的 ≥ 95%（确认是同一天的收盘）。
 * 返回 { ok, reason, valid: Map(code → row) }
 */
export function validateSnapshot(rows, total, date, storeRows) {
  if (!Number.isInteger(total) || total < SNAP_MIN) return { ok: false, reason: `快照总数 ${total} 少于 ${SNAP_MIN}` }
  const codes = new Set(rows.map((r) => r.code).filter(Boolean))
  if (codes.size !== total || rows.length !== total) return { ok: false, reason: `快照去重 ${codes.size} / 行数 ${rows.length} ≠ 总数 ${total}（分页不完整）` }
  const valid = new Map()
  for (const r of rows) if (r.code && isCloseTs(r.ts, date) && r.close !== null && r.close > 0 && r.amount !== null && r.amount > 0) valid.set(r.code, r)
  if (valid.size < total * 0.8) return { ok: false, reason: `只有 ${valid.size} / ${total} 行是 ${date} 收盘后行情` }
  let both = 0, same = 0
  for (const [code, r] of valid) {
    const s = storeRows.get(code)
    if (!s) continue
    both++
    if (Math.abs(s.c - r.close) <= 0.005 + EPS) same++
  }
  if (both < SNAP_MIN * 0.8 || same < both * 0.95) return { ok: false, reason: `快照收盘价与快照仓 ${date} 收盘一致 ${same} / ${both}，疑似不是同一天` }
  return { ok: true, reason: null, valid }
}

/**
 * 当日量能条件。test(r, ctx) 命中返回展示值，不命中 undefined；need 列出参与判定必须非空的字段。
 * ctx.high20：快照仓同日「20 日新高」命中代码集合。
 */
export const SNAP_PRESETS = [
  { id: 'volUp', label: '放量上涨', xLabel: '量比', xUnit: '', need: ['volRatio', 'pct'],
    formula: `量比 ≥ ${VOL_RATIO} 且涨幅 ≥ ${VOL_PCT}%。量比 = 今日成交量 ÷（过去 5 个交易日平均每分钟成交量 × 今日累计开市分钟数），收盘后即约等于全天成交量 ÷ 近 5 日日均成交量；取东方财富行情快照的量比字段。`,
    test: (r) => (r.volRatio >= VOL_RATIO && r.pct >= VOL_PCT ? r.volRatio : undefined) },
  { id: 'volDown', label: '放量下跌', xLabel: '量比', xUnit: '', need: ['volRatio', 'pct'],
    formula: `量比 ≥ ${VOL_RATIO} 且涨跌幅 ≤ −${VOL_PCT}%。量比口径同上。`,
    test: (r) => (r.volRatio >= VOL_RATIO && r.pct <= -VOL_PCT ? r.volRatio : undefined) },
  { id: 'volBreak', label: '放量创 20 日新高', xLabel: '量比', xUnit: '', need: ['volRatio'],
    formula: `量比 ≥ ${VOL_RATIO}，且同日命中上面「20 日新高」（今日最高价 > 此前 19 个交易日复权最高价的最大值，来自快照仓）。`,
    test: (r, ctx) => (r.volRatio >= VOL_RATIO && ctx.high20.has(r.code) ? r.volRatio : undefined) },
  { id: 'turnover', label: `高换手 ≥${TURNOVER_HI}%`, xLabel: '换手率', xUnit: '%', need: ['turnover'],
    formula: `换手率 ≥ ${TURNOVER_HI}%。换手率 = 今日成交量 ÷ 流通股本 × 100，取东方财富行情快照的换手率字段。`,
    test: (r) => (r.turnover >= TURNOVER_HI ? r.turnover : undefined) },
  { id: 'amp', label: `高振幅 ≥${AMP_HI}%`, xLabel: '振幅', xUnit: '%', need: ['amp'],
    formula: `振幅 ≥ ${AMP_HI}%。振幅 =（今日最高价 − 今日最低价）÷ 昨日收盘价 × 100，取东方财富行情快照的振幅字段。`,
    test: (r) => (r.amp >= AMP_HI ? r.amp : undefined) },
]

/** 把当日各条件命中家数并入快照历史（只记真实采集日，不回算），保留最近 60 个交易日 */
export function mergeSnapHistory(hist, date, counts) {
  const days = { ...(hist?.days ?? {}), [date]: counts }
  return { version: 1, days: Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-SNAP_HISTORY_KEEP)) }
}

/**
 * 当日量能区块。valid：validateSnapshot 返回的有效行；high20：同日 20 日新高代码集合；meta：代码 → {industry}；
 * hist：快照历史（{days: {日期: {条件: 家数}}}，当日以本次计算为准）。
 * stocks: code → [名称, 行业, 收盘, 涨跌幅 %, 量比, 换手率 %, 成交额（亿元）, 振幅 %]
 */
export function buildSnapshot(valid, date, high20, meta = new Map(), hist = { days: {} }) {
  const ctx = { high20 }
  const used = new Set()
  const histDates = [...new Set([...Object.keys(hist?.days ?? {}).filter((d) => d < date), date])].sort().slice(-HISTORY_DAYS)
  const presets = SNAP_PRESETS.map((p) => {
    const hits = []
    let eligible = 0
    for (const r of valid.values()) {
      if (p.need.some((f) => r[f] === null)) continue
      eligible++
      const x = p.test(r, ctx)
      if (x !== undefined) hits.push([r.code, round(x, 2)])
    }
    hits.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    for (const [c] of hits) used.add(c)
    return {
      id: p.id, group: '量能（当日快照）', label: p.label, formula: p.formula, xLabel: p.xLabel, xUnit: p.xUnit, asc: false,
      count: hits.length, eligible, hits,
      history: histDates.map((d) => ({ date: d, count: d === date ? hits.length : Number.isInteger(hist.days[d]?.[p.id]) ? hist.days[d][p.id] : null })),
    }
  })
  const stocks = {}
  for (const code of [...used].sort()) {
    const r = valid.get(code)
    stocks[code] = [r.name, meta.get(code)?.industry ?? '', r.close, r.pct, r.volRatio, r.turnover, r.amount === null ? null : round(r.amount / 1e8, 2), r.amp]
  }
  return { date, eligible: valid.size, presets, stocks }
}

/** 只有目标日 = 北京今天、是交易日且已过 15:10 时才抓当日快照（快照不带日期） */
export function snapshotWindow(now, date, isTradingDay) {
  const bj = new Date(now.getTime() + 8 * 3600e3)
  return bj.toISOString().slice(0, 10) === date && isTradingDay(date) && bj.getUTCHours() * 60 + bj.getUTCMinutes() >= 910
}
