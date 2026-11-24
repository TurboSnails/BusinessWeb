import type {
  RadarFile,
  RadarForwardStats,
  RadarMetrics,
  RadarStrategyId,
} from './types'
import type { TierId } from '../macro-posture/composite/types'

function metrics(overrides: Partial<RadarMetrics> = {}): RadarMetrics {
  return {
    cagr: 0.1,
    vol: 0.15,
    maxDd: -0.28,
    sharpe: 0.55,
    avgEquity: 0.7,
    switchesPerYear: 1.2,
    ...overrides,
  }
}

function forwardStats(months: number, fwd12: number | null = 0.08): RadarForwardStats {
  if (months === 0) return { months: 0, fwd12: null, neg12: null, maxDd12: null }
  return { months, fwd12, neg12: 0.25, maxDd12: -0.12 }
}

function monthAt(index: number, startYear = 1995): string {
  return `${startYear + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** 1995-01 … 2026-10，共 382 个月，覆盖「2000 年以来」与「近 10 年」 */
export function backtestCurves(): RadarFile['backtest']['curves'] {
  const months = (2026 - 1995) * 12 + 10
  return Array.from({ length: months }, (_, i) => {
    const t = 1 + i * 0.004
    const dip = i > 160 && i < 175 ? 0.85 : 1
    return {
      d: monthAt(i),
      radar: Number((t * 1.05 * dip).toFixed(4)),
      trend: Number((t * 1.02 * (dip > 0.9 ? dip : 0.92)).toFixed(4)),
      buyhold: Number((t * dip).toFixed(4)),
      static70: Number((t * 0.97 * Math.sqrt(dip)).toFixed(4)),
    }
  })
}

function strategyRows(): RadarFile['backtest']['rows'] {
  return [
    {
      id: 'radar',
      label: '市场雷达',
      train: metrics({ cagr: 0.105, vol: 0.14, maxDd: -0.24, sharpe: 0.62, avgEquity: 0.72, switchesPerYear: 1.8 }),
      test: metrics({ cagr: 0.078, vol: 0.16, maxDd: -0.3, sharpe: 0.48, avgEquity: 0.68, switchesPerYear: 2.1 }),
      full: metrics({ cagr: 0.092, vol: 0.15, maxDd: -0.3, sharpe: 0.55, avgEquity: 0.7, switchesPerYear: 1.9 }),
    },
    {
      id: 'trend',
      label: '10 个月均线',
      train: metrics({ cagr: 0.095, vol: 0.13, maxDd: -0.25, sharpe: 0.58, avgEquity: 0.65, switchesPerYear: 1.1 }),
      test: metrics({ cagr: 0.065, vol: 0.14, maxDd: -0.28, sharpe: 0.4, avgEquity: 0.62, switchesPerYear: 1.3 }),
      full: metrics({ cagr: 0.08, vol: 0.135, maxDd: -0.28, sharpe: 0.48, avgEquity: 0.64, switchesPerYear: 1.2 }),
    },
    {
      id: 'buyhold',
      label: '全程持有标普',
      train: metrics({ cagr: 0.11, vol: 0.18, maxDd: -0.45, sharpe: 0.5, avgEquity: 1, switchesPerYear: 0 }),
      test: metrics({ cagr: 0.07, vol: 0.19, maxDd: -0.51, sharpe: 0.35, avgEquity: 1, switchesPerYear: 0 }),
      full: metrics({ cagr: 0.09, vol: 0.185, maxDd: -0.51, sharpe: 0.42, avgEquity: 1, switchesPerYear: 0 }),
    },
    {
      id: 'static70',
      label: '恒定七成股票',
      train: metrics({ cagr: 0.09, vol: 0.13, maxDd: -0.32, sharpe: 0.52, avgEquity: 0.7, switchesPerYear: 0 }),
      test: metrics({ cagr: 0.06, vol: 0.14, maxDd: -0.36, sharpe: 0.38, avgEquity: 0.7, switchesPerYear: 0 }),
      full: metrics({ cagr: 0.075, vol: 0.135, maxDd: -0.36, sharpe: 0.45, avgEquity: 0.7, switchesPerYear: 0 }),
    },
  ]
}

function monthEndRows(): RadarFile['backtest']['monthEndRows'] {
  return [
    { id: 'radar', label: '市场雷达', full: metrics({ sharpe: 0.52, maxDd: -0.32 }), test: metrics({ sharpe: 0.45, maxDd: -0.32 }) },
    { id: 'trend', label: '10 个月均线', full: metrics({ sharpe: 0.46, maxDd: -0.3 }), test: metrics({ sharpe: 0.38, maxDd: -0.3 }) },
    { id: 'buyhold', label: '全程持有标普', full: metrics({ sharpe: 0.4, maxDd: -0.55 }), test: metrics({ sharpe: 0.33, maxDd: -0.55 }) },
    { id: 'static70', label: '恒定七成股票', full: metrics({ sharpe: 0.43, maxDd: -0.38, avgEquity: 0.7 }), test: metrics({ sharpe: 0.36, maxDd: -0.38, avgEquity: 0.7 }) },
  ]
}

/** 含相同差值（应合并）与「不含 0」两种夏普差 */
export function backtestSharpeGaps(): RadarFile['backtest']['sharpeGaps'] {
  return [
    { versus: 'static70' as RadarStrategyId, label: '恒定七成股票', diff: 0.03, low: -0.06, high: 0.15 },
    // 与恒定七成按构造相同，合并成一句
    { versus: 'buyhold' as RadarStrategyId, label: '全程持有标普', diff: 0.03, low: -0.06, high: 0.15 },
    { versus: 'trend' as RadarStrategyId, label: '10 个月均线', diff: 0.13, low: 0.01, high: 0.25 },
  ]
}

export function backtestTierStats(): RadarFile['backtest']['tierStats'] {
  return (['defense', 'lean-defense', 'neutral', 'lean-offense', 'offense'] as TierId[]).map(tier => ({
    tier,
    all: forwardStats(tier === 'offense' ? 80 : 120),
    // offense 在 2000 年以来无样本
    since2000: forwardStats(tier === 'offense' ? 0 : tier === 'lean-offense' ? 20 : 60),
  }))
}

export function backtestHeatStats(): RadarFile['backtest']['heatStats'] {
  return [
    { heat: 'cold', all: forwardStats(180), since2000: forwardStats(90) },
    { heat: 'mid', all: forwardStats(220), since2000: forwardStats(110) },
    { heat: 'hot', all: forwardStats(160), since2000: forwardStats(25) },
  ]
}

function shortTimeline(): RadarFile['backtest']['timeline'] {
  return Array.from({ length: 12 }, (_, i) => ({
    d: `2025-${String(i + 1).padStart(2, '0')}`,
    radar: (['offense', 'lean-offense', 'neutral', 'lean-defense', 'defense'] as TierId[])[i % 5],
    spx: 4800 + i * 20,
    score: -0.2 + Math.sin(i / 4) * 0.15,
    dims: [0, -0.5, -0.67, 0, 1],
  }))
}

export function backtestData(overrides: Partial<RadarFile['backtest']> = {}): RadarFile['backtest'] {
  return {
    start: '1995-01',
    end: '2026-10',
    trainRange: '1995-01–1999-12',
    testRange: '2000-01–2026-10',
    rows: strategyRows(),
    verdict: '雷达全样本夏普 0.55，与恒定七成股票的差异在抽样误差内；最大回撤 −30.0%。雷达只从股市自身看冷热，仓位怎么定见综合策略页。',
    disclosures: [
      '规则先验设定，验证期结果未参与挑选。',
      '雷达与宏观攻守完全独立，互不影响对方结论。',
      '标普收益用月均价近似，未计税费与交易成本。',
      '样本内回测不代表未来表现。',
    ],
    timeline: shortTimeline(),
    curves: backtestCurves(),
    monthEndRows: monthEndRows(),
    sharpeGaps: backtestSharpeGaps(),
    tierStats: backtestTierStats(),
    heatStats: backtestHeatStats(),
    ...overrides,
  }
}

/** 回测区测试用的最小 RadarFile（不依赖 fixture.ts） */
export function backtestRadarFixture(overrides: Partial<RadarFile> = {}): RadarFile {
  const backtest = backtestData(overrides.backtest)
  const { backtest: _bt, current: currentOverride, indicators, ...rest } = overrides
  return {
    generatedAt: '2026-11-24T13:58:00.000Z',
    ruleVersion: 'radar-v1',
    ...rest,
    current: {
      score: -0.2,
      tier: 'lean-defense',
      heatScore: -0.5,
      heat: 'hot',
      headline: '股市偏热',
      dimensions: [],
      counts: {
        total: 0,
        scored: 0,
        core: 0,
        heat: { hot: 0, warm: 0, neutral: 0, cool: 0, cold: 0, na: 0 },
        status: { fresh: 0, stale: 0, discontinued: 0, sparse: 0 },
      },
      caveats: [],
      ...(currentOverride ?? {}),
    },
    indicators: indicators ?? [],
    backtest,
  }
}
