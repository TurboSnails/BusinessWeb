import type {
  MarketComponent,
  MarketConfig,
  MarketFile,
  MarketMetrics,
  TierId,
} from './types'

function metrics(overrides: Partial<MarketMetrics> = {}): MarketMetrics {
  return {
    cagr: 0.1,
    vol: 0.15,
    maxDd: -0.28,
    sharpe: 0.55,
    avgEquity: 0.7,
    switchesPerYear: 1.2,
    recessionsCaught: 5,
    falseAlarmMonths: 40,
    ...overrides,
  }
}

function component(
  partial: Pick<MarketComponent, 'id' | 'label' | 'display' | 'score'> & Partial<MarketComponent>,
): MarketComponent {
  return {
    observedOn: '2026-10-31',
    rule: '预设阈值规则（fixture）',
    inBacktest: partial.id !== 'forwardPe',
    ...partial,
  }
}

function config(
  partial: Pick<MarketConfig, 'id' | 'construction' | 'label'> & Partial<MarketConfig>,
): MarketConfig {
  return {
    train: metrics({ sharpe: 0.5 }),
    test: metrics({ sharpe: 0.48, cagr: 0.08, maxDd: -0.32 }),
    full: metrics({ sharpe: 0.49 }),
    ...partial,
  }
}

const COMPONENTS: MarketComponent[] = [
  component({
    id: 'breadth',
    label: '市场宽度',
    display: '站上自身 10 个月均线的行业约占 62%',
    score: 1,
    rule: '行业占比 ≤40% → −1；≥60% → +1',
  }),
  component({
    id: 'narrow',
    label: '窄幅领涨',
    display: '标普距 12 个月高点约 3%，宽度低于一半',
    score: -1,
    rule: '距 12 个月高点 ≤5% 且行业占比 <50% → −1',
  }),
  component({
    id: 'volume',
    label: '量价',
    display: '3 个月均量约为 12 个月均量的 1.05 倍，价格在均线上方',
    score: 0,
    rule: '价格低于均线且量比 ≥1.10 → −1；价格不低于均线且量比 ≥1.10 → +1',
  }),
  component({
    id: 'erp',
    label: '股债利差',
    display: '盈利收益率减十年期美债约 1.8 个百分点',
    score: 0,
    rule: '利差 ≤1 → −1；≥4 → +1',
  }),
  component({
    id: 'cape',
    label: 'CAPE',
    display: '扩张窗口百分位约 78%',
    score: 0,
    rule: '百分位 ≥80 → −1；≤20 → +1',
  }),
  component({
    id: 'forwardPe',
    label: '前瞻市盈率',
    display: 'FactSet 前瞻市盈率约 22 倍',
    score: null,
    inBacktest: false,
    note: '只展示，无历史可回测',
    rule: '无免费长历史，不参与回测与打分',
  }),
]

const CHOSEN_ID = 'B:breadth-b,volume-a,erp-a'

function configsSorted(): MarketConfig[] {
  const chosen = config({
    id: CHOSEN_ID,
    construction: 'B',
    label: '宽度 + 窄幅领涨 + 量价 + 股债利差',
    train: metrics({ cagr: 0.112, maxDd: -0.22, sharpe: 0.72 }),
    test: metrics({ cagr: 0.086, maxDd: -0.27, sharpe: 0.58 }),
    full: metrics({ cagr: 0.099, maxDd: -0.27, sharpe: 0.64 }),
  })
  const others: MarketConfig[] = [
    config({
      id: 'D:all-a',
      construction: 'D',
      label: '宽度 + 窄幅领涨 + 量价 + 股债利差 + CAPE',
      train: metrics({ sharpe: 0.68, cagr: 0.108, maxDd: -0.24 }),
      test: metrics({ sharpe: 0.52, cagr: 0.08, maxDd: -0.3 }),
    }),
    config({
      id: 'A:breadth-a,volume-a',
      construction: 'A',
      label: '宽度 + 窄幅领涨 + 量价',
      train: metrics({ sharpe: 0.61, cagr: 0.105, maxDd: -0.25 }),
      test: metrics({ sharpe: 0.5, cagr: 0.078, maxDd: -0.31 }),
    }),
    config({
      id: 'C:breadth-b,cape-b',
      construction: 'C',
      label: '宽度 + 窄幅领涨 + 量价 + CAPE',
      train: metrics({ sharpe: 0.55, cagr: 0.1, maxDd: -0.26 }),
      test: metrics({ sharpe: 0.47, cagr: 0.075, maxDd: -0.33 }),
    }),
  ]
  return [chosen, ...others].sort((a, b) => b.train.sharpe - a.train.sharpe)
}

function timeline(): MarketFile['stage1']['timeline'] {
  const tiers: Array<TierId | null> = [
    'offense', 'lean-offense', 'neutral', 'lean-defense', 'defense',
    'lean-defense', 'neutral', 'lean-offense', 'offense', 'lean-offense',
    'neutral', 'lean-offense',
  ]
  return tiers.map((tier, i) => {
    const month = String((i % 12) + 1).padStart(2, '0')
    const year = 2025 + Math.floor(i / 12)
    return { d: `${year}-${month}`, score: tier === 'offense' ? 0.6 : tier === 'defense' ? -1.2 : 0.1, tier }
  })
}

export function marketFixture(overrides: Partial<MarketFile> = {}): MarketFile {
  const base: MarketFile = {
    generatedAt: '2026-11-23T12:00:00.000Z',
    preregistered: '2026-11-23 预注册：市场综合组件、阈值与采用标准在看到结果前写定。',
    stage1: {
      trainRange: '1955-01–1999-12',
      testRange: '2000-01–2026-10',
      configs: configsSorted(),
      chosenId: CHOSEN_ID,
      benchmarks: [
        {
          id: 'buyhold',
          label: '全程持有',
          train: metrics({ cagr: 0.11, maxDd: -0.45, sharpe: 0.5 }),
          test: metrics({ cagr: 0.07, maxDd: -0.51, sharpe: 0.35 }),
          full: metrics({ cagr: 0.09, maxDd: -0.51, sharpe: 0.42 }),
        },
        {
          id: 'trend',
          label: '10 个月均线',
          train: metrics({ cagr: 0.095, maxDd: -0.25, sharpe: 0.58 }),
          test: metrics({ cagr: 0.065, maxDd: -0.28, sharpe: 0.4 }),
          full: metrics({ cagr: 0.08, maxDd: -0.28, sharpe: 0.48 }),
        },
        {
          id: 'static70',
          label: '恒定七成',
          train: metrics({ cagr: 0.09, maxDd: -0.32, sharpe: 0.52, avgEquity: 0.7 }),
          test: metrics({ cagr: 0.06, maxDd: -0.36, sharpe: 0.38, avgEquity: 0.7 }),
          full: metrics({ cagr: 0.075, maxDd: -0.36, sharpe: 0.45, avgEquity: 0.7 }),
        },
      ],
      current: {
        score: 0.2,
        tier: 'lean-offense',
        components: COMPONENTS,
        headline: '市场宽度偏强，但窄幅领涨提醒集中度风险，综合偏进攻。',
      },
      timeline: timeline(),
    },
    stage2: {
      baselineLabel: 'v2.2（实时数据口径）',
      trainRange: '1973-01–1999-12',
      testRange: '2000-01–2026-10',
      weights: [
        { w: 0.1, train: metrics({ sharpe: 0.7, cagr: 0.101, maxDd: -0.21 }), test: metrics({ sharpe: 0.71, cagr: 0.102, maxDd: -0.2 }), full: metrics({ sharpe: 0.705 }) },
        { w: 0.15, train: metrics({ sharpe: 0.72, cagr: 0.103, maxDd: -0.2 }), test: metrics({ sharpe: 0.73, cagr: 0.104, maxDd: -0.195 }), full: metrics({ sharpe: 0.725 }) },
        { w: 0.2, train: metrics({ sharpe: 0.71, cagr: 0.102, maxDd: -0.205 }), test: metrics({ sharpe: 0.72, cagr: 0.103, maxDd: -0.2 }), full: metrics({ sharpe: 0.715 }) },
        { w: 0.25, train: metrics({ sharpe: 0.69, cagr: 0.1, maxDd: -0.22 }), test: metrics({ sharpe: 0.7, cagr: 0.101, maxDd: -0.21 }), full: metrics({ sharpe: 0.695 }) },
      ],
      baseline: {
        train: metrics({ sharpe: 0.68, cagr: 0.1, maxDd: -0.22 }),
        test: metrics({ sharpe: 0.7, cagr: 0.101, maxDd: -0.205 }),
        full: metrics({ sharpe: 0.69, cagr: 0.1005, maxDd: -0.22 }),
      },
      chosenW: 0.15,
      checks: [
        { id: 'testSharpeDd', label: '验证期夏普提高且回撤不恶化超过 1 个百分点', pass: true, detail: '验证期夏普 0.70 → 0.73；回撤 −20.5% → −19.5%' },
        { id: 'trainNoWorse', label: '训练期不恶化', pass: true, detail: '训练期夏普 0.68 → 0.72；回撤未恶化' },
        { id: 'fullCagr', label: '全样本年化下降不超过 0.3 个百分点', pass: true, detail: '全样本年化 10.0% → 10.3%' },
        { id: 'recessions', label: '衰退捕捉不减少、误报月数增加不超过 20%', pass: true, detail: '捕捉 5 → 5；误报月 40 → 38' },
      ],
      verdict: 'adopt',
      reason: '验证期夏普提高约 0.03，回撤略改善，四项预注册标准都通过，市场综合并入核心。',
    },
    disclosures: [
      '第一阶段只在训练期按夏普挑选组合，验证期结果未参与挑选。',
      '组合数量较多，存在多重比较风险，验证期表现只作原样报告。',
      '前瞻市盈率没有免费长历史，只展示当前读数，不进回测。',
      '行业宽度数据按发布滞后计入可得日；成交量用指数日线汇总的月均量。',
      '战术修正已用 10 个月均线；市场综合里的量价、窄幅领涨也涉及均线与高点，存在口径重叠。',
    ],
  }
  return {
    ...base,
    ...overrides,
    stage1: { ...base.stage1, ...(overrides.stage1 ?? {}) },
    stage2: { ...base.stage2, ...(overrides.stage2 ?? {}) },
    disclosures: overrides.disclosures ?? base.disclosures,
  }
}

/** 独立参考版：第二阶段未通过采用标准 */
export function marketReferenceFixture(): MarketFile {
  return marketFixture({
    stage2: {
      ...marketFixture().stage2,
      verdict: 'reference',
      reason: '验证期夏普几乎没提高，回撤也没有改善，市场综合只作独立参考，不并入总结论。',
      checks: marketFixture().stage2.checks.map((check, index) => (
        index === 0
          ? { ...check, pass: false, detail: '验证期夏普 0.70 → 0.705，提高不足 0.01' }
          : check
      )),
    },
  })
}
