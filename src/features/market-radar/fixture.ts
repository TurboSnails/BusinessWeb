import type { RadarDimensionId, RadarFile, RadarIndicator, RadarMetrics } from './types'
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

function history(n = 12, start = 0.4): [string, number][] {
  return Array.from({ length: n }, (_, i) => {
    const month = String((i % 12) + 1).padStart(2, '0')
    const year = 2025 + Math.floor(i / 12)
    return [`${year}-${month}`, start + Math.sin(i / 3) * 0.15] as [string, number]
  })
}

function indicator(
  partial: Pick<RadarIndicator, 'id' | 'dimension' | 'label' | 'display' | 'inScore'> & Partial<RadarIndicator>,
): RadarIndicator {
  return {
    observedOn: '2026-10-31',
    percentile: 55,
    percentileSince: '1950-01',
    heat: 'neutral',
    score: partial.inScore ? 0 : null,
    rule: partial.inScore ? '预设阈值规则（fixture）' : '历史不足或无长序列，只展示',
    historyYears: partial.inScore ? 40 : 8,
    source: '公开数据',
    history: history(),
    ...partial,
  }
}

const INDICATORS: RadarIndicator[] = [
  indicator({
    id: 'netLiq13w',
    dimension: 'liquidity',
    label: '美元净流动性 13 周变化',
    display: '近 13 周约 +1.2%',
    percentile: 62,
    heat: 'warm',
    score: null,
    inScore: false,
    historyYears: 22,
    rule: '历史不足 25 年，只展示：≥ +2% → +1；≤ −2% → −1',
  }),
  indicator({
    id: 'hySpread',
    dimension: 'liquidity',
    label: '高收益债利差',
    display: '约 340 个基点',
    percentile: 48,
    heat: 'neutral',
    score: null,
    inScore: false,
    historyYears: 3,
    rule: '只展示：≥ 500bp 或 4 周升 ≥ 50bp → −1',
  }),
  indicator({
    id: 'baaAaa6m',
    dimension: 'liquidity',
    label: '企业债 Baa−Aaa 利差 6 个月变化',
    display: '近 6 个月约 −0.08 个百分点',
    percentile: 35,
    heat: 'cool',
    score: 0,
    inScore: true,
    historyYears: 100,
    rule: '≥ +0.20 → −1；≤ −0.15 → +1',
  }),
  indicator({
    id: 'erp',
    dimension: 'valuation',
    label: '股债利差',
    display: '盈利收益率减十年期美债约 1.6 个百分点',
    percentile: 28,
    heat: 'cool',
    score: 0,
    inScore: true,
    historyYears: 70,
    rule: '百分位 ≤ 20 → −1；≥ 80 → +1',
  }),
  indicator({
    id: 'pe12m',
    dimension: 'valuation',
    label: '过去 12 个月市盈率百分位',
    display: '扩张窗口百分位约 82%',
    percentile: 82,
    heat: 'hot',
    score: -1,
    inScore: true,
    historyYears: 120,
    rule: '≥ 80 → −1；≤ 20 → +1',
  }),
  indicator({
    id: 'cape',
    dimension: 'valuation',
    label: 'CAPE 百分位',
    display: '扩张窗口百分位约 78%',
    percentile: 78,
    heat: 'warm',
    score: 0,
    inScore: true,
    historyYears: 120,
    rule: '≥ 80 → −1；≤ 20 → +1',
  }),
  indicator({
    id: 'forwardPe',
    dimension: 'valuation',
    label: '前瞻市盈率',
    display: 'FactSet 前瞻市盈率约 22 倍',
    percentile: null,
    heat: 'na',
    score: null,
    inScore: false,
    historyYears: null,
    rule: '无免费长历史，只展示',
  }),
  indicator({
    id: 'hhEquityShare',
    dimension: 'crowding',
    label: '家庭股票占金融资产比例',
    display: '扩张窗口百分位约 86%',
    percentile: 86,
    heat: 'hot',
    score: -1,
    inScore: true,
    historyYears: 80,
    rule: '百分位 ≥ 80 → −1；≤ 20 → +1',
  }),
  indicator({
    id: 'hhCashShare',
    dimension: 'crowding',
    label: '家庭现金占金融资产比例',
    display: '扩张窗口百分位约 18%',
    percentile: 18,
    heat: 'cold',
    score: -1,
    inScore: true,
    historyYears: 80,
    rule: '百分位 ≤ 20 → −1；≥ 80 → +1',
  }),
  indicator({
    id: 'marginYoy',
    dimension: 'crowding',
    label: '融资余额同比',
    display: '同比约 +12%',
    percentile: 60,
    heat: 'warm',
    score: 0,
    inScore: true,
    historyYears: 28,
    rule: '≥ +30% → −1；≤ −20% → +1',
  }),
  indicator({
    id: 'bofaCash',
    dimension: 'crowding',
    label: '基金经理现金 / 美股超配',
    display: '美银调查：现金约 4.1%，美股超配',
    percentile: null,
    heat: 'na',
    score: null,
    inScore: false,
    historyYears: null,
    rule: '授权、无历史，只展示',
  }),
  indicator({
    id: 'naaim',
    dimension: 'crowding',
    label: '主动经理敞口',
    display: '主动经理敞口约 88%',
    percentile: 88,
    heat: 'hot',
    score: null,
    inScore: false,
    historyYears: 2,
    rule: '只展示：≥ 90 → −1；≤ 30 → +1',
  }),
  indicator({
    id: 'breadth',
    dimension: 'trading',
    label: '行业宽度',
    display: '49 行业站上 10 个月均线约占 58%',
    percentile: 58,
    heat: 'neutral',
    score: 0,
    inScore: true,
    historyYears: 90,
    rule: '≤ 40% → −1；≥ 60% → +1',
  }),
  indicator({
    id: 'volume',
    dimension: 'trading',
    label: '量价',
    display: '3 个月均量约为 12 个月均量的 1.05 倍，价格在均线上方',
    percentile: 52,
    heat: 'neutral',
    score: 0,
    inScore: true,
    historyYears: 70,
    rule: '低于均线且 ≥ 1.10 → −1；不低于且 ≥ 1.10 → +1',
  }),
  indicator({
    id: 'vixTerm',
    dimension: 'trading',
    label: '波动率期限结构',
    display: '近月相对三月约 0.92',
    percentile: 40,
    heat: 'cool',
    score: null,
    inScore: false,
    historyYears: 18,
    rule: '只展示：≥ 1.05（倒挂）→ +1',
  }),
  indicator({
    id: 'above200',
    dimension: 'trading',
    label: '成分股站上 200 日线比例',
    display: '约 62% 站上 200 日线；20 日量比约 1.1',
    percentile: null,
    heat: 'na',
    score: null,
    inScore: false,
    historyYears: 1,
    rule: '站内约 1 年，只展示',
  }),
  indicator({
    id: 'epsYoy',
    dimension: 'earnings',
    label: '标普过去 12 个月盈利同比',
    display: '同比约 +8%',
    percentile: 65,
    heat: 'warm',
    score: 0,
    inScore: true,
    historyYears: 140,
    rule: '≤ −10% → −1；≥ +10% → +1',
  }),
  indicator({
    id: 'epsRevision',
    dimension: 'earnings',
    label: '前瞻盈利修正',
    display: '近四周净上修略为正',
    percentile: null,
    heat: 'na',
    score: null,
    inScore: false,
    historyYears: null,
    rule: 'FactSet 少量周点，只展示',
  }),
]

const DIMENSIONS: RadarFile['current']['dimensions'] = [
  { id: 'liquidity', title: '流动性', score: 0, summary: '信用利差变化中性，净流动性只作参考。' },
  { id: 'valuation', title: '估值', score: -0.33, summary: '市盈率百分位偏高，股债利差与 CAPE 中性。' },
  { id: 'crowding', title: '仓位与拥挤度', score: -0.67, summary: '家庭股票占比偏高、现金占比偏低，拥挤度偏热。' },
  { id: 'trading', title: '交易结构', score: 0, summary: '行业宽度与量价都接近中性。' },
  { id: 'earnings', title: '盈利', score: 0, summary: '过去 12 个月盈利同比尚可，前瞻修正只展示。' },
]

function timeline(): RadarFile['backtest']['timeline'] {
  const radar: Array<TierId | null> = [
    'offense', 'lean-offense', 'neutral', 'lean-defense', 'defense',
    'lean-defense', 'neutral', 'lean-offense', 'offense', 'lean-offense',
    'neutral', 'lean-offense',
  ]
  const masters: Array<TierId | null> = [
    'lean-offense', 'offense', 'lean-offense', 'neutral', 'lean-defense',
    'defense', 'lean-defense', 'neutral', 'lean-offense', 'offense',
    'lean-offense', 'neutral',
  ]
  return radar.map((tier, i) => {
    const month = String((i % 12) + 1).padStart(2, '0')
    const year = 2025 + Math.floor(i / 12)
    return { d: `${year}-${month}`, radar: tier, masters: masters[i], spx: 4800 + i * 20 }
  })
}

export function radarFixture(overrides: Partial<RadarFile> = {}): RadarFile {
  const base: RadarFile = {
    generatedAt: '2026-11-23T12:00:00.000Z',
    ruleVersion: 'radar-v1',
    current: {
      score: -0.2,
      tier: 'lean-defense',
      headline: '估值与拥挤度偏热，流动性与交易结构中性，综合偏防守。',
      dimensions: DIMENSIONS,
    },
    indicators: INDICATORS,
    backtest: {
      start: '1973-01',
      end: '2026-10',
      trainRange: '1973-01–1999-12',
      testRange: '2000-01–2026-10',
      rows: [
        {
          id: 'radar',
          label: '我的市场雷达',
          train: metrics({ cagr: 0.105, maxDd: -0.24, sharpe: 0.62 }),
          test: metrics({ cagr: 0.078, maxDd: -0.3, sharpe: 0.48 }),
          full: metrics({ cagr: 0.092, maxDd: -0.3, sharpe: 0.55 }),
        },
        {
          id: 'masters',
          label: '大师方案',
          train: metrics({ cagr: 0.11, maxDd: -0.22, sharpe: 0.68 }),
          test: metrics({ cagr: 0.082, maxDd: -0.27, sharpe: 0.52 }),
          full: metrics({ cagr: 0.096, maxDd: -0.27, sharpe: 0.6 }),
        },
        {
          id: 'blend',
          label: '两者平均',
          train: metrics({ cagr: 0.108, maxDd: -0.23, sharpe: 0.65 }),
          test: metrics({ cagr: 0.08, maxDd: -0.28, sharpe: 0.5 }),
          full: metrics({ cagr: 0.094, maxDd: -0.28, sharpe: 0.57 }),
        },
        {
          id: 'trend',
          label: '10 个月均线',
          train: metrics({ cagr: 0.095, maxDd: -0.25, sharpe: 0.58 }),
          test: metrics({ cagr: 0.065, maxDd: -0.28, sharpe: 0.4 }),
          full: metrics({ cagr: 0.08, maxDd: -0.28, sharpe: 0.48 }),
        },
        {
          id: 'buyhold',
          label: '全程持有',
          train: metrics({ cagr: 0.11, maxDd: -0.45, sharpe: 0.5 }),
          test: metrics({ cagr: 0.07, maxDd: -0.51, sharpe: 0.35 }),
          full: metrics({ cagr: 0.09, maxDd: -0.51, sharpe: 0.42 }),
        },
        {
          id: 'static70',
          label: '恒定七成',
          train: metrics({ cagr: 0.09, maxDd: -0.32, sharpe: 0.52, avgEquity: 0.7 }),
          test: metrics({ cagr: 0.06, maxDd: -0.36, sharpe: 0.38, avgEquity: 0.7 }),
          full: metrics({ cagr: 0.075, maxDd: -0.36, sharpe: 0.45, avgEquity: 0.7 }),
        },
      ],
      disclosures: [
        '规则先验设定，验证期结果未参与挑选。',
        '雷达与大师方案完全独立，互不影响对方结论。',
        '标普收益用月均价近似，未计税费与交易成本。',
        '样本内回测不代表未来表现。',
      ],
      timeline: timeline(),
    },
    comparison: {
      mastersTier: 'lean-offense',
      radarTier: 'lean-defense',
      text: '雷达偏防守，大师方案偏进攻：估值与拥挤度拉低了雷达档位。',
    },
  }
  return {
    ...base,
    ...overrides,
    current: { ...base.current, ...(overrides.current ?? {}) },
    backtest: {
      ...base.backtest,
      ...(overrides.backtest ?? {}),
      rows: overrides.backtest?.rows ?? base.backtest.rows,
      disclosures: overrides.backtest?.disclosures ?? base.backtest.disclosures,
      timeline: overrides.backtest?.timeline ?? base.backtest.timeline,
    },
    comparison: { ...base.comparison, ...(overrides.comparison ?? {}) },
    indicators: overrides.indicators ?? base.indicators,
  }
}

export function dimensionIds(): RadarDimensionId[] {
  return ['liquidity', 'valuation', 'crowding', 'trading', 'earnings']
}
