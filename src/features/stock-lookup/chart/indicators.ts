/** 均线 / MACD / 金叉死叉 / 成交量突增 —— 纯函数，供图与单测共用 */

export const MA_OPTIONS = [5, 10, 20, 60, 120, 250] as const
export type MaPeriod = (typeof MA_OPTIONS)[number]

export interface MacdPoint {
  dif: number | null
  dea: number | null
  hist: number | null
}

export type CrossKind = 'golden' | 'death'

export interface MaCross {
  index: number
  kind: CrossKind
  /** 发生交叉的两根均线周期 */
  fast: number
  slow: number
}

/** 简单移动平均；不足 period 的位置为 null */
export function sma(values: readonly number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error('period must be > 0')
  const out: (number | null)[] = Array(values.length).fill(null)
  if (!values.length) return out
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** EMA；seed 用前 period 根 SMA */
export function ema(values: readonly number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error('period must be > 0')
  const out: (number | null)[] = Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let prev = 0
  for (let i = 0; i < period; i++) prev += values[i]
  prev /= period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** MACD(12,26,9)：DIF = EMA12−EMA26，DEA = DIF 的 EMA9，柱 = DIF−DEA */
export function macd(
  closes: readonly number[],
  fast = 12,
  slow = 26,
  signal = 9,
): MacdPoint[] {
  const fastE = ema(closes, fast)
  const slowE = ema(closes, slow)
  const dif: (number | null)[] = closes.map((_, i) => {
    const a = fastE[i], b = slowE[i]
    return a == null || b == null ? null : a - b
  })
  // DEA 只对已有 DIF 的序列算 EMA：把 null 前段跳过，用连续 DIF 值
  const difVals: number[] = []
  const difIdx: number[] = []
  dif.forEach((v, i) => { if (v != null) { difVals.push(v); difIdx.push(i) } })
  const deaOnDif = ema(difVals, signal)
  const deaByIndex = new Map<number, number | null>()
  difIdx.forEach((idx, j) => deaByIndex.set(idx, deaOnDif[j]))

  return closes.map((_, i) => {
    const d = dif[i]
    const dea = deaByIndex.has(i) ? deaByIndex.get(i)! : null
    return {
      dif: d,
      dea,
      hist: d != null && dea != null ? d - dea : null,
    }
  })
}

/** 快线上穿慢线 = 金叉，下穿 = 死叉；两端均线都有值才判定 */
export function detectMaCrosses(
  fastLine: readonly (number | null)[],
  slowLine: readonly (number | null)[],
  fastPeriod: number,
  slowPeriod: number,
): MaCross[] {
  const out: MaCross[] = []
  const n = Math.min(fastLine.length, slowLine.length)
  for (let i = 1; i < n; i++) {
    const f0 = fastLine[i - 1], s0 = slowLine[i - 1]
    const f1 = fastLine[i], s1 = slowLine[i]
    if (f0 == null || s0 == null || f1 == null || s1 == null) continue
    const prev = f0 - s0
    const curr = f1 - s1
    if (prev <= 0 && curr > 0) out.push({ index: i, kind: 'golden', fast: fastPeriod, slow: slowPeriod })
    else if (prev >= 0 && curr < 0) out.push({ index: i, kind: 'death', fast: fastPeriod, slow: slowPeriod })
  }
  return out
}

/**
 * 常见均线交叉：在已启用的均线里，对相邻周期对（如 5×10、10×20…）检测金叉死叉。
 * periods 会排序去重。
 */
export function commonMaCrosses(
  closes: readonly number[],
  periods: readonly number[],
): MaCross[] {
  const sorted = [...new Set(periods.filter(p => p > 0))].sort((a, b) => a - b)
  if (sorted.length < 2) return []
  const lines = new Map(sorted.map(p => [p, sma(closes, p)] as const))
  const out: MaCross[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const fast = sorted[i], slow = sorted[i + 1]
    out.push(...detectMaCrosses(lines.get(fast)!, lines.get(slow)!, fast, slow))
  }
  return out
}

/**
 * 成交量突增：当前量 > 前 lookback 根均量 × multiple（不含当前根）。
 * 返回突增的下标。
 */
export function volumeSpikes(
  volumes: readonly number[],
  lookback = 20,
  multiple = 2,
): number[] {
  const out: number[] = []
  if (lookback <= 0 || multiple <= 0) return out
  for (let i = lookback; i < volumes.length; i++) {
    let sum = 0
    for (let j = i - lookback; j < i; j++) sum += volumes[j]
    const avg = sum / lookback
    if (avg > 0 && volumes[i] > avg * multiple) out.push(i)
  }
  return out
}
