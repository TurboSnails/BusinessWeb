import { describe, expect, it } from 'vitest'
import { backtestHeatStats, backtestPredictive, backtestSharpeGaps } from './backtest.fixture'
import { compositeFoldSummary, correlationSentence, heatHistorySentence, isSignificant } from './historyText'
import type { RadarFile, RadarForwardStats } from './types'

const stats = (months: number, fwd12: number | null): RadarForwardStats =>
  months === 0
    ? { months: 0, episodes: 0, independent: 0, fwd12: null, neg12: null, maxDd12: null }
    : { months, episodes: 6, independent: 6, fwd12, neg12: 0.2, maxDd12: -0.1 }

function heatRows(pre: [number, number], post: [number, number]): RadarFile['backtest']['heatStats'] {
  return [
    { heat: 'hot', all: stats(200, 0.1), before2000: stats(100, pre[0]), since2000: stats(100, post[0]) },
    { heat: 'mid', all: stats(200, 0.1), before2000: stats(100, pre[1]), since2000: stats(100, post[1]) },
    { heat: 'cold', all: stats(100, 0.1), before2000: stats(50, 0.1), since2000: stats(50, 0.1) },
  ]
}

describe('isSignificant', () => {
  it('|t| ≥ 2 才算显著；t 缺失不显著', () => {
    expect(isSignificant({ months: 100, r: 0.3, t: 2 })).toBe(true)
    expect(isSignificant({ months: 100, r: -0.3, t: -2.5 })).toBe(true)
    expect(isSignificant({ months: 100, r: 0.3, t: 1.99 })).toBe(false)
    expect(isSignificant({ months: 10, r: 0.3, t: null })).toBe(false)
  })
})

describe('heatHistorySentence', () => {
  it('两段方向相反：明说相反，不能当择时信号；先说 2000 年以后', () => {
    const text = heatHistorySentence(backtestHeatStats())!
    expect(text).toContain('两段方向相反，不能当择时信号')
    expect(text.indexOf('2000 年以后偏热')).toBeLessThan(text.indexOf('1973–1999 年偏热'))
    expect(text).toContain('2000 年以后没有出现过偏冷')
  })

  it('两段同为偏热之后较低：写「两段都是偏热之后低于居中」，仍提示独立样本少', () => {
    const text = heatHistorySentence(heatRows([0.05, 0.12], [0.03, 0.1]))!
    expect(text).toContain('两段都是偏热之后低于居中')
    expect(text).toContain('独立样本少')
    expect(text).not.toContain('方向相反')
    expect(text).not.toContain('没有出现过')
  })

  it('两段同为偏热之后较高：写「高于」', () => {
    expect(heatHistorySentence(heatRows([0.15, 0.1], [0.12, 0.1]))).toContain('两段都是偏热之后高于居中')
  })

  it('某段偏热与居中恰好相同：不判方向', () => {
    const text = heatHistorySentence(heatRows([0.1, 0.1], [0.05, 0.12]))!
    expect(text).toContain('没有差别')
    expect(text).not.toMatch(/方向相反|两段都是/)
  })

  it('只有一段可比：不比较方向', () => {
    const rows = heatRows([0.15, 0.1], [0.12, 0.1])
    rows[0] = { ...rows[0], since2000: stats(0, null) }
    const text = heatHistorySentence(rows)!
    expect(text).toContain('另一段缺少可比样本')
    expect(text).toContain('2000 年以后没有出现过偏热')
  })

  it('旧数据没有 before2000：返回 null', () => {
    const rows = backtestHeatStats().map(({ before2000: _omit, ...row }) => row)
    expect(heatHistorySentence(rows)).toBeNull()
  })
})

describe('correlationSentence', () => {
  it('三段各给相关系数与 t；不显著的写不显著，显著的写方向', () => {
    const text = correlationSentence('冷热分', backtestPredictive().heat)
    expect(text).toBe(
      '冷热分与之后 12 个月回报：全样本相关系数 0.15（t 1.36），不显著；' +
      '1973–1999 年相关系数 −0.04（t −0.30），不显著；' +
      '2000 年以后相关系数 0.33（t 3.26），越高之后越好。',
    )
  })

  it('样本不足时写样本不足；t 缺失只给相关系数', () => {
    const text = correlationSentence('综合分', {
      all: { months: 2, r: null, t: null },
      before2000: { months: 10, r: -0.5, t: null },
      since2000: { months: 300, r: -0.3, t: -2.4 },
    })
    expect(text).toContain('全样本样本不足；')
    expect(text).toContain('1973–1999 年相关系数 −0.50，不显著')
    expect(text).toContain('2000 年以后相关系数 −0.30（t −2.40），越高之后越差')
  })
})

describe('compositeFoldSummary', () => {
  it('全样本不显著：以「没有证据显示可行」开头；夏普差按区间措辞', () => {
    const gaps = backtestSharpeGaps().map(gap => gap.versus === 'trend' ? { ...gap, diff: -0.05, low: -0.17, high: 0.06 } : gap)
    const text = compositeFoldSummary(backtestPredictive(), gaps)
    expect(text).toMatch(/^没有证据显示可行。综合分与之后 12 个月回报：全样本相关系数 0\.01（t 0\.11），不显著；/)
    expect(text).toContain('按综合分持仓与十个月均线的夏普差 −0.05（95% 区间 −0.17 至 0.06），在抽样误差内。')
  })

  it('全样本显著：不写「没有证据」；区间不含 0 时写低于', () => {
    const p = backtestPredictive()
    const text = compositeFoldSummary(
      { ...p, score: { ...p.score, all: { months: 600, r: 0.2, t: 2.5 } } },
      [{ versus: 'trend', label: '10 个月均线', diff: -0.2, low: -0.3, high: -0.1 }],
    )
    expect(text).toMatch(/^全样本上有一定关系，但要看两段是否一致。/)
    expect(text).toContain('低于十个月均线')
  })

  it('没有 predictive 也没有十个月均线一项：返回空串', () => {
    expect(compositeFoldSummary(undefined, [])).toBe('')
  })
})
