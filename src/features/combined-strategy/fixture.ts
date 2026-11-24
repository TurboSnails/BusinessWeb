import type {
  CellStats,
  CombinedStrategyFile,
  FusionRow,
  Heat,
  MacroSide,
  MatrixCell,
  StrategyMetrics,
} from './types'
import type { TierId } from '../macro-posture/composite/types'

function metrics(overrides: Partial<StrategyMetrics> = {}): StrategyMetrics {
  return {
    cagr: 0.1,
    maxDd: -0.2,
    sharpe: 0.7,
    avgEquity: 0.72,
    switchesPerYear: 3.9,
    ...overrides,
  }
}

function stats(months: number, fwd12: number | null, neg12: number | null, maxDd12: number | null): CellStats {
  if (months === 0) return { months: 0, fwd12: null, neg12: null, maxDd12: null }
  return { months, fwd12, neg12, maxDd12 }
}

function cell(
  macroSide: MacroSide,
  heat: Heat,
  all: CellStats,
  since2000: CellStats,
  action: string,
): MatrixCell {
  const thin = all.months > 0 && all.months < 30
  const parts = [
    all.months === 0
      ? '这一格历史上没有出现过。'
      : `这一格历史上有 ${all.months} 个月，之后 12 个月标普平均 ${((all.fwd12 ?? 0) * 100).toFixed(1)}%，${Math.round((all.neg12 ?? 0) * 100)}% 的时候为负，期间平均最大回撤 ${((all.maxDd12 ?? 0) * 100).toFixed(1)}%。`,
  ]
  if (since2000.months > 0) {
    parts.push(`2000 年以后 ${since2000.months} 个月，平均 ${((since2000.fwd12 ?? 0) * 100).toFixed(1)}%。`)
  }
  if (thin) parts.push('样本少，仅供参考。')
  return {
    macroSide,
    heat,
    all,
    since2000,
    action,
    evidence: parts.join(''),
    thin,
  }
}

/** 设计文档第 3 节的九格顺序 */
const MATRIX: MatrixCell[] = [
  cell('offense', 'cold', stats(3, 0.009, 0, -0.041), stats(0, null, null, null), '按档位持有。这一格历史上极少出现。'),
  cell('offense', 'mid', stats(123, 0.129, 0.17, -0.066), stats(74, 0.133, 0.12, -0.051), '按档位持有，按月正常再平衡。'),
  cell('offense', 'hot', stats(122, 0.135, 0.15, -0.075), stats(72, 0.071, 0.22, -0.089), '按档位持有，不因为贵提前减仓。不加杠杆；新增资金分批投入；不再提高单一行业或个股的集中度。'),
  cell('neutral', 'cold', stats(25, 0.077, 0.24, -0.061), stats(0, null, null, null), '按档位持有。需要补仓时可以在这个阶段完成。'),
  cell('neutral', 'mid', stats(104, 0.168, 0.15, -0.064), stats(50, 0.17, 0.1, -0.068), '按档位持有，按月正常再平衡。'),
  cell('neutral', 'hot', stats(57, 0.08, 0.18, -0.075), stats(34, 0.051, 0.29, -0.11), '按档位持有。减仓时先减值高、杠杆高的部分，留下现金流好的。'),
  cell('defense', 'cold', stats(70, 0.2, 0.16, -0.079), stats(0, null, null, null), '按档位持有，不再继续砍仓。这是历史上之后回报最好的一格；档位一旦上调（修复确认），当月就回补到位，不拖延。'),
  cell('defense', 'mid', stats(106, 0.096, 0.31, -0.119), stats(62, 0.112, 0.29, -0.13), '按档位持有，等档位上调再回补。'),
  cell('defense', 'hot', stats(23, -0.035, 0.57, -0.158), stats(17, -0.102, 0.76, -0.201), '历史上最差的一格。严格减到档位对应的仓位，不抄底，不以「已经跌了不少」为由少减。'),
]

function fusionRow(
  id: FusionRow['id'],
  label: string,
  rule: string,
  train: Partial<StrategyMetrics>,
  test: Partial<StrategyMetrics>,
  full: Partial<StrategyMetrics>,
  passTrain: boolean | null,
): FusionRow {
  return {
    id,
    label,
    rule,
    train: metrics(train),
    test: metrics(test),
    full: metrics(full),
    passTrain,
  }
}

const FUSION_ROWS: FusionRow[] = [
  fusionRow('macro', '宏观攻守（基线）', '只用宏观攻守最终档位定仓位。',
    { cagr: 0.118, maxDd: -0.2, sharpe: 0.82, avgEquity: 0.74 },
    { cagr: 0.085, maxDd: -0.2, sharpe: 0.62, avgEquity: 0.7 },
    { cagr: 0.1018, maxDd: -0.2, sharpe: 0.715, avgEquity: 0.72 },
    null),
  fusionRow('radar', '我的市场雷达', '只用雷达综合档位定仓位。',
    { cagr: 0.105, maxDd: -0.24, sharpe: 0.62, avgEquity: 0.68 },
    { cagr: 0.078, maxDd: -0.3, sharpe: 0.48, avgEquity: 0.65 },
    { cagr: 0.092, maxDd: -0.3, sharpe: 0.55, avgEquity: 0.66 },
    null),
  fusionRow('m1', 'M1 平均仓位', '雷达仓位与宏观仓位取平均。',
    { sharpe: 0.81 }, { sharpe: 0.55 }, { sharpe: 0.66 }, false),
  fusionRow('m2', 'M2 热度上限', '偏热时档位最高到偏进攻。',
    { sharpe: 0.815 }, { sharpe: 0.58 }, { sharpe: 0.69 }, false),
  fusionRow('m3', 'M3 偏热且破位再降一档', '偏热且标普月均价低于十个月均线时，再下调一档。',
    { sharpe: 0.808 }, { sharpe: 0.57 }, { sharpe: 0.68 }, false),
  fusionRow('m4', 'M4 偏冷加码', '偏冷且标普月均价不低于十个月均线时，上调一档。',
    { sharpe: 0.819 }, { sharpe: 0.59 }, { sharpe: 0.7 }, false),
  fusionRow('m5', 'M5 全套热度修正', 'M2 + M3 + M4。',
    { sharpe: 0.812 }, { sharpe: 0.56 }, { sharpe: 0.675 }, false),
  fusionRow('m6', 'M6 雷达否决', '雷达综合档位为偏防守或防守时，再下调一档。',
    { sharpe: 0.805 }, { sharpe: 0.54 }, { sharpe: 0.65 }, false),
]

function timeline(): CombinedStrategyFile['timeline'] {
  const macros: Array<TierId | null> = [
    'lean-offense', 'offense', 'lean-offense', 'neutral', 'lean-defense',
    'defense', 'lean-defense', 'neutral', 'lean-offense', 'offense',
    'lean-offense', 'lean-offense',
  ]
  const radars: Array<TierId | null> = [
    'offense', 'lean-offense', 'neutral', 'lean-defense', 'defense',
    'lean-defense', 'neutral', 'lean-offense', 'offense', 'lean-offense',
    'neutral', 'lean-defense',
  ]
  const heats: Array<Heat | null> = [
    'mid', 'mid', 'hot', 'hot', 'hot',
    'mid', 'mid', 'cold', 'mid', 'hot',
    'hot', 'hot',
  ]
  return macros.map((macro, i) => {
    const month = String((i % 12) + 1).padStart(2, '0')
    const year = 2025 + Math.floor(i / 12)
    return { d: `${year}-${month}`, macro, radar: radars[i], heat: heats[i], spx: 4800 + i * 20 }
  })
}

const CURRENT_CELL = MATRIX.find(c => c.macroSide === 'offense' && c.heat === 'hot')!

export function combinedStrategyFixture(overrides: Partial<CombinedStrategyFile> = {}): CombinedStrategyFile {
  const base: CombinedStrategyFile = {
    generatedAt: '2026-11-24T12:00:00.000Z',
    ruleVersion: 'fusion-v1',
    current: {
      macroTier: 'lean-offense',
      equityShare: 0.85,
      macroSide: 'offense',
      radarTier: 'lean-defense',
      heatScore: -0.5,
      heat: 'hot',
      headline: '宏观偏进攻、市场偏热：股票仓位按自设上限的 85%，按档位持有，不因为贵提前减仓。',
      cell: CURRENT_CELL,
      dates: [
        { label: '宏观攻守', date: '2026 年 11 月 23 日' },
        { label: '市场雷达', date: '2026 年 10 月 31 日' },
      ],
    },
    matrix: MATRIX,
    fusion: {
      start: '1973-01',
      end: '2026-10',
      trainRange: '1973-01–1999-12',
      testRange: '2000-01–2026-10',
      rows: FUSION_ROWS,
      adopted: null,
      verdict: '六个候选在训练期夏普都没有超过基线，没有一个过线。综合策略的仓位只按宏观攻守的档位定，雷达不改变仓位。',
      disclosures: [
        '规则先验设定，验证期结果未参与挑选。',
        '热度取雷达估值与拥挤度两个维度分的等权平均。',
        '样本内回测不代表未来表现。',
      ],
    },
    timeline: timeline(),
  }
  return {
    ...base,
    ...overrides,
    current: { ...base.current, ...(overrides.current ?? {}) },
    fusion: {
      ...base.fusion,
      ...(overrides.fusion ?? {}),
      rows: overrides.fusion?.rows ?? base.fusion.rows,
      disclosures: overrides.fusion?.disclosures ?? base.fusion.disclosures,
    },
    matrix: overrides.matrix ?? base.matrix,
    timeline: overrides.timeline ?? base.timeline,
  }
}

/** 当前格缺失：只显示 headline */
export function combinedStrategyNoCellFixture(): CombinedStrategyFile {
  return combinedStrategyFixture({
    current: {
      macroTier: null,
      equityShare: null,
      macroSide: null,
      radarTier: null,
      heatScore: null,
      heat: null,
      headline: '宏观或雷达一侧缺数，暂不定位格子。',
      cell: null,
      dates: [{ label: '宏观攻守', date: '2026 年 11 月 23 日' }],
    },
  })
}

/** since2000 全空；adopted 非 null */
export function combinedStrategyAdoptedFixture(): CombinedStrategyFile {
  const matrix = MATRIX.map(c => ({
    ...c,
    since2000: stats(0, null, null, null),
  }))
  return combinedStrategyFixture({
    matrix,
    fusion: {
      start: '1973-01',
      end: '2026-10',
      trainRange: '1973-01–1999-12',
      testRange: '2000-01–2026-10',
      rows: FUSION_ROWS.map(row => (
        row.id === 'm4' ? { ...row, passTrain: true } : row
      )),
      adopted: 'm4',
      verdict: '测试夹具：假设 M4 被采用。',
      disclosures: ['夹具披露。'],
    },
  })
}
