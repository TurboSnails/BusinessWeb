import { describe, expect, it } from 'vitest'
import { buildConclusions } from './conclusions'
import { createConclusionFixture, loadPublicPriceBook } from './fixtures'
import { compareSet } from './engine'
import type { RunInput } from './types'

const ENDING = '以上是所选历史区间的事后回测描述；选股与规则存在事后挑选和幸存者偏差，不代表未来，也不构成买卖建议。'

describe('自动结论纯函数', () => {
  it('规则 1 同时说明期末金额相对差、年化百分点与回撤绝对幅度', () => {
    const fixture = createConclusionFixture()
    const lines = buildConclusions(fixture)
    expect(lines[0]).toBe('按当前规则，期末金额比不动高 26.7%；年化收益为 13.0%（不动 10.0%，高 3.0 个百分点），最大回撤为 −30.0%（不动 −25.0%，加深 5.0 个百分点）。')
    expect(lines.at(-1)).toBe(ENDING)
  })

  it('年化差不足 0.5 个百分点时使用材料性门槛文案', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.custom.active.cagr = 0.1049
    const lines = buildConclusions(fixture)
    expect(lines[0]).toContain('年化差不足 0.5 个百分点（10.5% 对 10.0%）')
    expect(lines[0]).toContain('请结合调仓次数与成本判断')
  })

  it('开启大跌切换时说明合计效果，不生成规则 2、3', () => {
    const fixture = createConclusionFixture()
    fixture.input.switch = { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05 }
    const lines = buildConclusions(fixture)
    expect(lines[0]).toContain('按当前『再平衡＋大跌切换』')
    expect(lines[0]).toContain('这些差额包含大跌切换的影响，不能全部归因于普通再平衡')
    expect(lines.join('')).not.toMatch(/历史敏感性|稳定组成员的历史/)
  })

  it('不动叠加大跌切换时描述仅切换与不动的实际差值', () => {
    const fixture = createConclusionFixture()
    const input: RunInput = {
      symbols: ['AAPL', 'MSFT', 'CB'],
      weights: [0.4, 0.35, 0.25],
      rule: { kind: 'buyHold' },
      switch: { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05 },
      start: '2021-01-01',
      end: '2026-11-20',
      cost: 0.001,
      initial: 1,
    }
    const comparison = compareSet(loadPublicPriceBook(['AAPL', 'MSFT', 'CB', 'QQQ']), input)
    const index = {
      ...fixture.index,
      items: [
        { ...fixture.index.items[0], symbol: 'AAPL', name: '苹果' },
        { ...fixture.index.items[1], symbol: 'MSFT', name: '微软' },
        fixture.index.items[2],
      ],
    }
    expect(comparison.custom.active.tradeCount).toBe(7)
    expect(comparison.custom.active.final.toFixed(4)).toBe('2.9183')
    expect(comparison.custom.hold.final.toFixed(4)).toBe('2.5821')
    const lines = buildConclusions({ comparison, input, index })
    expect(lines[0]).toContain('按当前『不再平衡，只做大跌切换』')
    expect(lines[0]).toContain('期末金额比不动高 13.0%')
    expect(lines.join('')).not.toContain('两种结果相同')
    expect(lines.join('')).not.toMatch(/历史敏感性|稳定组成员的历史/)
  })

  it('切换开启且年化差很小时仍保留切换影响提示', () => {
    const fixture = createConclusionFixture()
    fixture.input.switch = { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05 }
    fixture.comparison.custom.active.cagr = 0.102
    expect(buildConclusions(fixture)[0]).toContain('这些差额包含大跌切换的影响')
  })

  it('10.5% 对 10.0% 恰好达到 0.5 个百分点门槛', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.custom.active.cagr = 0.105
    fixture.comparison.custom.hold.cagr = 0.1
    const lines = buildConclusions(fixture)
    expect(lines[0]).toContain('高 0.5 个百分点')
    expect(lines[0]).not.toContain('年化差不足 0.5 个百分点')
  })

  it.each([
    { start: '2023-01-03', end: '2024-01-03', underThree: true },
    { start: '2021-01-04', end: '2024-01-04', underThree: false },
  ])('日历周年边界 $start 到 $end', ({ start, end, underThree }) => {
    const fixture = createConclusionFixture()
    fixture.comparison.custom.active.start = start
    fixture.comparison.custom.active.end = end
    const lines = buildConclusions(fixture)
    expect(lines[0]).not.toContain('区间不足一年')
    expect(lines.includes('区间不足三年，以下仅描述本次结果，不用于归纳一般规律。')).toBe(underThree)
  })

  it('不足一年只概括累计收益和回撤', () => {
    const fixture = createConclusionFixture()
    for (const result of [fixture.comparison.custom.active, fixture.comparison.custom.hold]) {
      result.start = '2026-01-01'
      result.end = '2026-06-01'
    }
    const lines = buildConclusions(fixture)
    expect(lines[0]).toBe('本区间仅 151 天：当前规则累计收益 90.0%，不动 50.0%；最大回撤 −30.0%，不动 −25.0%。区间不足一年，不展示年化差，也不生成规律判断。')
    expect(lines).toHaveLength(2)
  })

  it('一到三年追加本次结果提示', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.custom.active.end = '2023-06-01'
    expect(buildConclusions(fixture)).toContain('区间不足三年，以下仅描述本次结果，不用于归纳一般规律。')
  })

  it('不动规则只给无法判断再平衡效果的兜底', () => {
    const fixture = createConclusionFixture()
    fixture.input.rule = { kind: 'buyHold' }
    fixture.comparison.custom.active.tradeCount = 0
    const lines = buildConclusions(fixture)
    expect(lines[0]).toBe('当前未启用再平衡，两种结果相同，无法据此判断再平衡效果。')
    expect(lines).toHaveLength(2)
  })

  it('动态版本零调仓时不判断规则效果', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.custom.active.tradeCount = 0
    expect(buildConclusions(fixture)[0]).toBe('本区间没有发生调仓，当前规则与不动结果相同；这段样本不能检验该规则的效果。')
  })

  it('非有限指标不显示 NaN，改给数据不足提示', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.custom.active.cagr = Number.NaN
    const lines = buildConclusions(fixture)
    expect(lines[0]).toBe('该项数据不足，暂不自动概括；请查看已计算的原始指标。')
    expect(lines.join('')).not.toContain('NaN')
  })

  it.each([
    ['过期', { status: 'stale' as const }],
    ['缺分红', { dividendStatus: 'missing' as const }],
    ['单一来源', { crossCheck: 'unavailable' as const }],
  ])('数据质量提示：%s', (_name, patch) => {
    const fixture = createConclusionFixture()
    Object.assign(fixture.index.items[0], patch)
    expect(buildConclusions(fixture)).toContain('部分输入数据存在质量提示，自动结论仅作描述，解释前请先核对数据状态。')
  })

  it('规则 2 选择下降最多且达到门槛的一只，并说明权重已重分', () => {
    const fixture = createConclusionFixture()
    const lines = buildConclusions(fixture)
    expect(lines[1]).toContain('历史敏感性：剔除 博通（AVGO，原目标权重 40.0%）后')
    expect(lines[1]).toContain('动态年化由 13.0% 降至 12.0%，下降 1.0 个百分点')
    expect(lines[1]).toContain('其余权重已按比例重分')
  })

  it('所有剔除行都未下降时不生成收益依赖', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.leaveOneOut[0].active.cagr = 0.13
    expect(buildConclusions(fixture)[1]).toContain('本区间剔除任何一只后，动态年化都未下降')
  })

  it('所有剔除差异都不到 0.5 点时使用无突出敏感性兜底', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.leaveOneOut[0].active.cagr = 0.127
    fixture.comparison.leaveOneOut[1].active.cagr = 0.132
    fixture.comparison.leaveOneOut[2].active.cagr = 0.128
    expect(buildConclusions(fixture)[1]).toBe('逐一剔除后的年化与原组合差异都不到 0.5 个百分点，本区间未显示突出的单只敏感性。')
  })

  it('只有正向大差异而负向差异未达门槛时不挑收益依赖', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.leaveOneOut[0].active.cagr = 0.128
    expect(buildConclusions(fixture)[1]).toContain('未出现剔除后年化下降至少 0.5 个百分点的成员')
  })

  it('最大目标权重超过 50% 时追加组合结构提示', () => {
    const fixture = createConclusionFixture()
    fixture.input.weights = [0.6, 0.3, 0.1]
    expect(buildConclusions(fixture)[1]).toContain('博通（AVGO）的原目标权重为 60.0%，组合权重较集中')
  })

  it('只有两只股票时说明剔除后为单资产', () => {
    const fixture = createConclusionFixture()
    fixture.input.symbols = ['AVGO', 'META']
    fixture.input.weights = [0.5, 0.5]
    fixture.comparison.leaveOneOut = fixture.comparison.leaveOneOut.slice(0, 2)
    const lines = buildConclusions(fixture)
    expect(lines[1]).toBe('当前仅两只股票；逐一剔除后会变成单资产，不能据此判断谁在拉高分散组合，也不生成收益集中结论。')
    expect(lines.join('')).not.toContain('稳定组成员')
  })

  it('剔除结果缺失时给数据不足提示', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.leaveOneOut = []
    expect(buildConclusions(fixture)[1]).toBe('该项数据不足，暂不自动概括；请查看已计算的原始指标。')
  })

  it('剔除行窗口与原组合不同则不生成自动归因', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.leaveOneOut[0].active.start = '2021-01-04'
    const lines = buildConclusions(fixture)
    expect(lines[1]).toBe('该项数据不足，暂不自动概括；请查看已计算的原始指标。')
    expect(lines.join('')).not.toMatch(/历史敏感性|稳定组成员的历史/)
  })

  it('剔除行起止相同但内部多一天时停用自动归因', () => {
    const fixture = createConclusionFixture()
    const dates = ['2024-01-31', '2024-02-01', '2024-02-02', '2025-02-03']
    const base = fixture.comparison.custom.active
    Object.assign(base, { start: dates[0], end: dates[3], dates: dates.filter((_, i) => i !== 1) })
    for (const row of fixture.comparison.leaveOneOut) {
      Object.assign(row.active, { start: base.start, end: base.end, dates: base.dates })
    }
    fixture.comparison.leaveOneOut[0].active.dates = dates
    const lines = buildConclusions(fixture)
    expect(lines).toContain('该项数据不足，暂不自动概括；请查看已计算的原始指标。')
    expect(lines.join('')).not.toMatch(/历史敏感性|稳定组成员的历史/)
  })

  it('剔除结果含非有限数时不生成规则 2、3', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.leaveOneOut[0].active.maxDrawdown.value = Number.POSITIVE_INFINITY
    const lines = buildConclusions(fixture)
    expect(lines[1]).toBe('该项数据不足，暂不自动概括；请查看已计算的原始指标。')
    expect(lines.join('')).not.toContain('Infinity')
  })

  it('规则 3 达到双门槛时描述历史收益与回撤取舍', () => {
    const fixture = createConclusionFixture()
    expect(buildConclusions(fixture)[2]).toBe('稳定组成员的历史取舍：剔除 安达保险（CB）后，年化由 13.0% 升至 14.0%（+1.0 个百分点），最大回撤由 −30.0% 变为 −38.0%（加深 8.0 个百分点）。它在本组合、本区间呈现了『年化较低、回撤较浅』的取舍，不代表未来仍能降风险。')
  })

  it('没有稳定组成员时给无稳定成员兜底', () => {
    const fixture = createConclusionFixture()
    fixture.index.items[2].group = 'growth'
    expect(buildConclusions(fixture)[2]).toBe('当前没有页面分类为『稳定』的成员，不生成稳定资产结论；这不代表其余股票必然高波动或高风险。')
  })

  it('全部属于稳定组时给缺少对照兜底', () => {
    const fixture = createConclusionFixture()
    for (const item of fixture.index.items) item.group = 'stable'
    expect(buildConclusions(fixture)[2]).toBe('全部成员都属于页面的『稳定』分组，缺少其他分组对照，不自动概括稳定股作用。')
  })

  it('有多只稳定组成员时不挑一只代表全组', () => {
    const fixture = createConclusionFixture()
    fixture.index.items[1].group = 'stable'
    expect(buildConclusions(fixture)[2]).toBe('组合有多只稳定组成员，不自动挑一只代表全组；请逐行比较剔除后的收益与回撤。')
  })

  it('稳定组剔除未满足双门槛时只指向原表', () => {
    const fixture = createConclusionFixture()
    fixture.comparison.leaveOneOut[2].active.maxDrawdown.value = -0.29
    expect(buildConclusions(fixture)[2]).toBe('稳定组成员的历史剔除结果见下表；本区间未呈现统一的收益—回撤取舍。')
  })

  it('不输出离散度胜率或适不适合再平衡判断', () => {
    const text = buildConclusions(createConclusionFixture()).join('')
    expect(text).not.toMatch(/离散度|胜率|适合再平衡/)
  })
})
