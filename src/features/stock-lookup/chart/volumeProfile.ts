/** 价位成交量：按 K 线高低价区间均摊成交量到价格档（不是逐笔） */

export interface ProfileBar {
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface VolumeBin {
  /** 档位下沿（含） */
  low: number
  /** 档位上沿（不含，最高档含） */
  high: number
  mid: number
  upVolume: number
  downVolume: number
  total: number
}

export interface VolumeProfileResult {
  bins: VolumeBin[]
  /** 成交最多价位（档中点） */
  poc: number | null
  /** 70% 价值区下沿 / 上沿 */
  valueAreaLow: number | null
  valueAreaHigh: number | null
  totalVolume: number
  note: string
}

export const VOLUME_PROFILE_NOTE = '按 K 线均摊估算，不是逐笔数据'

/** 按图高度估算档数：大约每 4px 一档，夹在 [8, 80] */
export function binCountForHeight(heightPx: number): number {
  if (!(heightPx > 0)) return 24
  return Math.max(8, Math.min(80, Math.round(heightPx / 4)))
}

/**
 * 把可见区间 K 线的成交量均摊到价格档。
 * - 上涨量：收 ≥ 开；下跌量：收 < 开
 * - 价值区：从 POC 档向两侧扩展，直到累计 ≥ 总成交的 70%
 */
export function computeVolumeProfile(
  bars: readonly ProfileBar[],
  binCount: number,
): VolumeProfileResult {
  const empty = (): VolumeProfileResult => ({
    bins: [],
    poc: null,
    valueAreaLow: null,
    valueAreaHigh: null,
    totalVolume: 0,
    note: VOLUME_PROFILE_NOTE,
  })

  if (!bars.length || binCount <= 0) return empty()

  let minP = Infinity
  let maxP = -Infinity
  let totalVolume = 0
  for (const b of bars) {
    if (Number.isFinite(b.l)) minP = Math.min(minP, b.l)
    if (Number.isFinite(b.h)) maxP = Math.max(maxP, b.h)
    totalVolume += Math.max(0, b.v)
  }
  if (!Number.isFinite(minP) || !Number.isFinite(maxP)) return empty()

  // 全部同价：仍建一档，成交量全进这档
  if (maxP === minP) {
    let up = 0, down = 0
    for (const b of bars) {
      if (b.v <= 0) continue
      if (b.c >= b.o) up += b.v
      else down += b.v
    }
    const mid = minP
    const bins: VolumeBin[] = [{
      low: mid, high: mid, mid, upVolume: up, downVolume: down, total: up + down,
    }]
    return {
      bins,
      poc: totalVolume > 0 ? mid : null,
      valueAreaLow: totalVolume > 0 ? mid : null,
      valueAreaHigh: totalVolume > 0 ? mid : null,
      totalVolume,
      note: VOLUME_PROFILE_NOTE,
    }
  }

  const n = Math.max(1, Math.floor(binCount))
  const span = maxP - minP
  const step = span / n
  const bins: VolumeBin[] = Array.from({ length: n }, (_, i) => {
    const low = minP + i * step
    const high = i === n - 1 ? maxP : minP + (i + 1) * step
    return { low, high, mid: (low + high) / 2, upVolume: 0, downVolume: 0, total: 0 }
  })

  for (const b of bars) {
    if (!(b.v > 0) || !(b.h >= b.l)) continue
    const lo = b.l
    const hi = b.h
    const up = b.c >= b.o
    // 同价 K 线：整根量进落点那一档
    if (hi === lo) {
      const idx = Math.min(n - 1, Math.max(0, Math.floor((lo - minP) / step)))
      if (up) bins[idx].upVolume += b.v
      else bins[idx].downVolume += b.v
      bins[idx].total += b.v
      continue
    }
    // 与 [lo,hi] 相交的档位均摊
    const first = Math.max(0, Math.floor((lo - minP) / step))
    const last = Math.min(n - 1, Math.floor((hi - minP) / step - 1e-12))
    const count = last - first + 1
    if (count <= 0) continue
    const share = b.v / count
    for (let i = first; i <= last; i++) {
      if (up) bins[i].upVolume += share
      else bins[i].downVolume += share
      bins[i].total += share
    }
  }

  if (!(totalVolume > 0)) {
    return { bins, poc: null, valueAreaLow: null, valueAreaHigh: null, totalVolume: 0, note: VOLUME_PROFILE_NOTE }
  }

  let pocIdx = 0
  for (let i = 1; i < bins.length; i++) {
    if (bins[i].total > bins[pocIdx].total) pocIdx = i
  }

  const target = totalVolume * 0.7
  let acc = bins[pocIdx].total
  let left = pocIdx
  let right = pocIdx
  while (acc < target && (left > 0 || right < bins.length - 1)) {
    const leftVol = left > 0 ? bins[left - 1].total : -1
    const rightVol = right < bins.length - 1 ? bins[right + 1].total : -1
    if (leftVol >= rightVol && left > 0) {
      left -= 1
      acc += bins[left].total
    } else if (right < bins.length - 1) {
      right += 1
      acc += bins[right].total
    } else if (left > 0) {
      left -= 1
      acc += bins[left].total
    } else break
  }

  return {
    bins,
    poc: bins[pocIdx].mid,
    valueAreaLow: bins[left].low,
    valueAreaHigh: bins[right].high,
    totalVolume,
    note: VOLUME_PROFILE_NOTE,
  }
}
