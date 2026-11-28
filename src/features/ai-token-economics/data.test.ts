import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_FINANCIALS, SAVED_SNAPSHOTS, SENSITIVITY_DEFAULT, UNIT_EXAMPLE, pickLatest, vendorPrices,
  changeOf, grossPerUnit, impliedPriceChange, revenueGrowthH1, naiveSpendChange, revenueAfter, sensitivity, volumeMultipleToKeepGross,
} from './data'

const latest = pickLatest(SAVED_SNAPSHOTS)
// 复算数值固定用 2026-10-11 当周（报告原文核对过的一期），每周新增快照不影响这些断言
const audited = SAVED_SNAPSHOTS.find(s => s.weekEnding === '2026-10-11')!
const RAMP_WEEKLY = { tokenUsage: audited.tokenUsage, tokenSpend: audited.tokenSpend, openaiAnthropicBlendedPrice: audited.price.combined.change }
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

describe('Ramp 样本复算', () => {
  it('由支出与用量反推平均单价约 −19.3%', () => {
    expect(impliedPriceChange(RAMP_WEEKLY.tokenSpend, RAMP_WEEKLY.tokenUsage)).toBeCloseTo(-0.193, 3)
  })
  it('用 −25.4% 直接相乘得到约 +13.7%，与报告的 +23% 不一致', () => {
    expect(naiveSpendChange(RAMP_WEEKLY.tokenUsage, RAMP_WEEKLY.openaiAnthropicBlendedPrice)).toBeCloseTo(0.137, 3)
  })
  it('厂商均价由前后价格复算，与披露降幅的差不超过四舍五入到分可能造成的误差', () => {
    // 前后价各有 ±0.005 美元的舍入误差；单价越低，复算降幅的误差越大（如 0.45→0.38）
    for (const s of SAVED_SNAPSHOTS) for (const v of vendorPrices(s)) {
      const tol = 0.005 / v.before + 0.005 * v.after / (v.before * v.before) + 1e-9
      expect(Math.abs(changeOf(v.before, v.after) - v.reportedChange)).toBeLessThanOrEqual(tol)
    }
  })
})

describe('快照选择', () => {
  const older = { ...latest, weekEnding: addDays(latest.weekEnding, -28) }, newer = { ...latest, weekEnding: addDays(latest.weekEnding, 7) }
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
  it('2025 年算力支出高于收入；2026 上半年收入约为去年同期 13.6 倍', () => {
    expect(ANTHROPIC_FINANCIALS.computeAndInfra2025).toBeGreaterThan(ANTHROPIC_FINANCIALS.revenue2025)
    expect(revenueGrowthH1()).toBeCloseTo(13.58, 1)
  })
  it('季度数字与上半年一致：一季度约 47 + 二季度 116 ≈ 163 亿；一季度营业亏损约 16.7 亿', () => {
    const f = ANTHROPIC_FINANCIALS
    expect(f.revenueQ1_2026 + f.revenueQ2_2026).toBeCloseTo(f.revenueH1_2026, 5)
    expect(f.operatingIncomeQ2_2026 + f.operatingLossH1_2026).toBeCloseTo(1.667, 3)
  })
})
