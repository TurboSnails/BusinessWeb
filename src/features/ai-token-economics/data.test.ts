import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_FINANCIALS, SAVED_SNAPSHOTS, SENSITIVITY_DEFAULT, UNIT_EXAMPLE, pickLatest, vendorPrices,
  changeOf, grossPerUnit, impliedPriceChange, lossGrowth, naiveSpendChange, revenueAfter, sensitivity, volumeMultipleToKeepGross,
} from './data'

const latest = pickLatest(SAVED_SNAPSHOTS)
const RAMP_WEEKLY = { tokenUsage: latest.tokenUsage, tokenSpend: latest.tokenSpend, openaiAnthropicBlendedPrice: latest.price.combined.change }

describe('Ramp 样本复算', () => {
  it('由支出与用量反推平均单价约 −19.3%', () => {
    expect(impliedPriceChange(RAMP_WEEKLY.tokenSpend, RAMP_WEEKLY.tokenUsage)).toBeCloseTo(-0.193, 3)
  })
  it('用 −25.4% 直接相乘得到约 +13.7%，与报告的 +23% 不一致', () => {
    expect(naiveSpendChange(RAMP_WEEKLY.tokenUsage, RAMP_WEEKLY.openaiAnthropicBlendedPrice)).toBeCloseTo(0.137, 3)
  })
  it('厂商均价由前后价格复算，与披露降幅的差在 1 个百分点内（价格已四舍五入）', () => {
    for (const v of vendorPrices(latest)) expect(Math.abs(changeOf(v.before, v.after) - v.reportedChange)).toBeLessThan(0.01)
  })
})

describe('快照选择', () => {
  const older = { ...latest, weekEnding: '2026-09-13' }, newer = { ...latest, weekEnding: '2026-10-18' }
  it('更晚的实时数据优先；更早的忽略；同一周以实时为准', () => {
    expect(pickLatest([latest], newer)).toBe(newer)
    expect(pickLatest([latest], older)).toBe(latest)
    const same = { ...latest, tokenUsage: 0.6 }
    expect(pickLatest([latest], same)).toBe(same)
    expect(pickLatest([latest], null)).toBe(latest)
  })
})

describe('单位毛利', () => {
  it('售价 10→5、成本 5→3：毛利 5→2，下降 60%，需销量 2.5 倍', () => {
    expect(grossPerUnit(UNIT_EXAMPLE.before)).toBe(5)
    expect(grossPerUnit(UNIT_EXAMPLE.after)).toBe(2)
    expect(changeOf(5, 2)).toBeCloseTo(-0.6)
    expect(volumeMultipleToKeepGross(UNIT_EXAMPLE.before, UNIT_EXAMPLE.after)).toBe(2.5)
  })
  it('价格 −50%：需求 3 倍收入 +50%，需求 +50% 收入 −25%', () => {
    expect(revenueAfter(-0.5, 3)).toBeCloseTo(0.5)
    expect(revenueAfter(-0.5, 1.5)).toBeCloseTo(-0.25)
  })
})

describe('敏感性模型', () => {
  it('默认情形：收入 +14.0%、毛利 60.8（+21.6%）', () => {
    const r = sensitivity(SENSITIVITY_DEFAULT)
    expect(r.revenueChange).toBeCloseTo(0.14, 3)
    expect(r.gross).toBeCloseTo(60.8, 1)
    expect(r.grossChange).toBeCloseTo(0.216, 3)
  })
  it('基础毛利为 0 时变化率未定义', () => {
    expect(sensitivity({ ...SENSITIVITY_DEFAULT, cost: 100 }).grossChange).toBeNaN()
  })
})

describe('Anthropic 财务', () => {
  it('营业亏损 2.98→8.06 亿美元，扩大约 170%', () => {
    expect(lossGrowth()).toBeCloseTo(1.705, 2)
    expect(ANTHROPIC_FINANCIALS.computeAndInfra2025).toBeGreaterThan(ANTHROPIC_FINANCIALS.revenue2025)
  })
})
