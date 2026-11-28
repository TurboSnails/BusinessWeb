import { describe, expect, it } from 'vitest'
import { binCountForHeight, computeVolumeProfile, VOLUME_PROFILE_NOTE } from './volumeProfile'

describe('binCountForHeight', () => {
  it('随高度自适应并夹紧', () => {
    expect(binCountForHeight(0)).toBe(24)
    expect(binCountForHeight(40)).toBe(10)
    expect(binCountForHeight(400)).toBe(80)
  })
})

describe('computeVolumeProfile', () => {
  it('空 / 零成交', () => {
    expect(computeVolumeProfile([], 10).bins).toEqual([])
    const z = computeVolumeProfile([{ o: 1, h: 2, l: 1, c: 1.5, v: 0 }], 8)
    expect(z.totalVolume).toBe(0)
    expect(z.poc).toBeNull()
    expect(z.note).toBe(VOLUME_PROFILE_NOTE)
  })

  it('单根 K 线', () => {
    const r = computeVolumeProfile([{ o: 10, h: 12, l: 8, c: 11, v: 100 }], 4)
    expect(r.totalVolume).toBe(100)
    expect(r.poc).not.toBeNull()
    expect(r.valueAreaLow).not.toBeNull()
    expect(r.valueAreaHigh).not.toBeNull()
    expect(r.bins.reduce((s, b) => s + b.total, 0)).toBeCloseTo(100)
    // 收 > 开 → 上涨量
    expect(r.bins.reduce((s, b) => s + b.upVolume, 0)).toBeCloseTo(100)
  })

  it('全部同价', () => {
    const bars = [
      { o: 5, h: 5, l: 5, c: 5, v: 30 },
      { o: 5, h: 5, l: 5, c: 4.9, v: 70 },
    ]
    const r = computeVolumeProfile(bars, 10)
    expect(r.bins).toHaveLength(1)
    expect(r.poc).toBe(5)
    expect(r.valueAreaLow).toBe(5)
    expect(r.valueAreaHigh).toBe(5)
    expect(r.bins[0].upVolume).toBe(30)
    expect(r.bins[0].downVolume).toBe(70)
  })

  it('70% 价值区从 POC 向两侧扩展', () => {
    // 低档少量、中档大量、高档中量
    const bars = [
      { o: 1, h: 1.1, l: 1, c: 1.05, v: 10 },
      { o: 2, h: 2.1, l: 2, c: 2.05, v: 100 },
      { o: 3, h: 3.1, l: 3, c: 2.9, v: 40 },
    ]
    const r = computeVolumeProfile(bars, 3)
    expect(r.totalVolume).toBe(150)
    expect(r.poc).toBeCloseTo(2.05, 1)
    // 累计应覆盖 ≥ 70%
    const inVa = r.bins.filter(b => b.mid >= r.valueAreaLow! && b.mid <= r.valueAreaHigh!)
    const vaVol = inVa.reduce((s, b) => s + b.total, 0)
    expect(vaVol / r.totalVolume).toBeGreaterThanOrEqual(0.7 - 1e-9)
  })
})
