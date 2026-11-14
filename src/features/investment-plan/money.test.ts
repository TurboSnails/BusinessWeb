import { describe, expect, it } from 'vitest'
import {
  annualWanToMonthlyYuan,
  fenToYuan,
  isRelativeBandBreached,
  isYuan,
  normalizeYuanInput,
  percentToBps,
  wanToYuan,
  yuanToFen,
} from './money'

describe('money yuan normalize', () => {
  it('空串→null；明确 0→0.00', () => {
    expect(normalizeYuanInput('')).toBeNull()
    expect(normalizeYuanInput('  ')).toBeNull()
    expect(normalizeYuanInput('0')).toBe('0.00')
    expect(normalizeYuanInput('0.0')).toBe('0.00')
    expect(normalizeYuanInput('0.00')).toBe('0.00')
  })

  it('两位规范化；拒负数/指数/NaN/逗号/三位小数截断', () => {
    expect(normalizeYuanInput('12.3')).toBe('12.30')
    expect(normalizeYuanInput('12.34')).toBe('12.34')
    expect(normalizeYuanInput('-1')).toBeNull()
    expect(normalizeYuanInput('1e2')).toBeNull()
    expect(normalizeYuanInput('NaN')).toBeNull()
    expect(normalizeYuanInput('1,000.00')).toBeNull()
    expect(normalizeYuanInput('1.234')).toBeNull()
    expect(normalizeYuanInput('Infinity')).toBeNull()
  })

  it('最大 999999999999.99；isYuan 规范两位', () => {
    expect(isYuan('999999999999.99')).toBe(true)
    expect(normalizeYuanInput('1000000000000')).toBeNull()
    expect(isYuan('01.00')).toBe(false)
    expect(isYuan('1.0')).toBe(false)
  })
})

describe('wanToYuan / annualWanToMonthlyYuan', () => {
  it('万元→元无浮点漂移', () => {
    expect(wanToYuan('1')).toEqual({ ok: true, yuan: '10000.00', rounded: false })
    expect(wanToYuan('0.01')).toEqual({ ok: true, yuan: '100.00', rounded: false })
    expect(wanToYuan('100')).toEqual({ ok: true, yuan: '1000000.00', rounded: false })
  })

  it('超分精度 half-up 并标 rounded', () => {
    expect(wanToYuan('0.000001')).toEqual({ ok: true, yuan: '0.01', rounded: false })
    // 0.0000005 万 → 0.5 分 → half-up → 1 分
    expect(wanToYuan('0.0000005')).toEqual({ ok: true, yuan: '0.01', rounded: true })
    // 0.0000001 万 → 0.1 分 → 舍去 → 0 分
    expect(wanToYuan('0.0000001')).toEqual({ ok: true, yuan: '0.00', rounded: true })
  })

  it('年万元→月元 ÷12 half-up', () => {
    // 12 万/年 → 120000 元/年 → 10000 元/月
    expect(annualWanToMonthlyYuan('12')).toMatchObject({ ok: true, yuan: '10000.00', annualYuan: '120000.00', rounded: false })
    // 1 万/年 → 10000/12 = 833.333... → 833.33
    const r = annualWanToMonthlyYuan('1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.yuan).toBe('833.33')
      expect(r.rounded).toBe(true)
    }
  })

  it('拒负数', () => {
    expect(wanToYuan('-1').ok).toBe(false)
  })
})

describe('percentToBps', () => {
  it('百分数×100→bps', () => {
    expect(percentToBps('5')).toEqual({ ok: true, bps: 500 })
    expect(percentToBps('15')).toEqual({ ok: true, bps: 1500 })
    expect(percentToBps('25.5')).toEqual({ ok: true, bps: 2550 })
  })

  it('超过两位小数 → precision', () => {
    expect(percentToBps('5.001')).toEqual({ ok: false, reason: 'precision' })
  })
})

describe('relative band 8.3 oracle 15%±25%', () => {
  // 目标 15%，带宽相对 ±25% → 11.25%–18.75% 含边界 within
  // S=10000 分(=100.00元)，targetBps=1500，band=2500
  // 11.25% of 10000 = 1125 分；18.75% = 1875 分
  const S = 10000n
  const target = 1500
  const band = 2500

  it('边界含 within；越界严格 >', () => {
    expect(isRelativeBandBreached({ amountFen: 1125n, totalFen: S, targetBps: target, relativeBandBps: band })).toBe(false)
    expect(isRelativeBandBreached({ amountFen: 1875n, totalFen: S, targetBps: target, relativeBandBps: band })).toBe(false)
    // 11.24% = 1124
    expect(isRelativeBandBreached({ amountFen: 1124n, totalFen: S, targetBps: target, relativeBandBps: band })).toBe(true)
    // 18.76% = 1876
    expect(isRelativeBandBreached({ amountFen: 1876n, totalFen: S, targetBps: target, relativeBandBps: band })).toBe(true)
  })

  it('fen roundtrip', () => {
    expect(fenToYuan(0n)).toBe('0.00')
    expect(yuanToFen('12.34')).toBe(1234n)
  })
})
