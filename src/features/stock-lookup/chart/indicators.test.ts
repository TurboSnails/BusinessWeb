import { describe, expect, it } from 'vitest'
import {
  commonMaCrosses, detectMaCrosses, ema, macd, sma, volumeSpikes,
} from './indicators'

describe('sma', () => {
  it('不足周期为 null，之后为均值', () => {
    expect(sma([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3])
  })
  it('空序列', () => {
    expect(sma([], 5)).toEqual([])
  })
})

describe('ema / macd', () => {
  it('ema 在 period-1 处等于 SMA', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const e = ema(v, 3)
    expect(e[2]).toBeCloseTo(2)
    expect(e[0]).toBeNull()
    expect(e[9]).not.toBeNull()
  })

  it('macd 12/26/9：前期 null，其后 DIF/DEA/柱齐全', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 5 + i * 0.1)
    const rows = macd(closes)
    expect(rows).toHaveLength(60)
    expect(rows[24].dif).toBeNull() // slow=26 → index 25 才有
    expect(rows[25].dif).not.toBeNull()
    // DEA 还要再等 signal-1 根 DIF
    const firstDea = rows.findIndex(r => r.dea != null)
    expect(firstDea).toBeGreaterThanOrEqual(25 + 8)
    const last = rows[rows.length - 1]
    expect(last.dif).not.toBeNull()
    expect(last.dea).not.toBeNull()
    expect(last.hist).toBeCloseTo(last.dif! - last.dea!)
  })
})

describe('detectMaCrosses / commonMaCrosses', () => {
  it('金叉死叉', () => {
    // fast: 下面交叉到上面再下去
    const fast = [1, 1, 3, 3, 0]
    const slow = [2, 2, 2, 2, 2]
    const crosses = detectMaCrosses(fast, slow, 5, 10)
    expect(crosses).toEqual([
      { index: 2, kind: 'golden', fast: 5, slow: 10 },
      { index: 4, kind: 'death', fast: 5, slow: 10 },
    ])
  })

  it('常见指标：相邻周期对', () => {
    const closes = Array.from({ length: 40 }, (_, i) => (i < 20 ? 10 + i * 0.5 : 20 - (i - 20) * 0.4))
    const xs = commonMaCrosses(closes, [5, 10])
    expect(xs.some(x => x.kind === 'golden' || x.kind === 'death')).toBe(true)
  })
})

describe('volumeSpikes', () => {
  it('量 > 20 根均量 2 倍', () => {
    const vols = Array.from({ length: 25 }, () => 100)
    vols[24] = 250
    expect(volumeSpikes(vols, 20, 2)).toEqual([24])
  })
  it('均量为 0 不报', () => {
    const vols = Array(25).fill(0)
    vols[24] = 10
    expect(volumeSpikes(vols, 20, 2)).toEqual([])
  })
})
