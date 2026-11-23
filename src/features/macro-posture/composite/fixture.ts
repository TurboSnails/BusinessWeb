import type {
  Backtest,
  CompositeFile,
  ComponentState,
  Current,
  OuterItem,
  Pillar,
  TierDef,
  TierId,
  TierStats,
  Variant,
} from './types'

const TIERS: TierDef[] = [
  { id: 'offense', label: '进攻', equityShare: 1, range: 'R ≥ 0.50', meaning: '宏观证据偏积极，股票仓位可靠近你的上限。' },
  { id: 'lean-offense', label: '偏进攻', equityShare: 0.85, range: '0.15 ≤ R < 0.50', meaning: '证据略偏积极，仓位可略高于中性。' },
  { id: 'neutral', label: '中性', equityShare: 0.7, range: '−0.25 < R < 0.15', meaning: '证据互相抵消，按你的中性仓位即可。' },
  { id: 'lean-defense', label: '偏防守', equityShare: 0.5, range: '−0.75 < R ≤ −0.25', meaning: '证据偏谨慎，仓位宜低于中性。' },
  { id: 'defense', label: '防守', equityShare: 0.3, range: 'R ≤ −0.75', meaning: '宏观证据偏弱，仓位宜靠近防守端。' },
]

function emptyTierStats(): TierStats {
  return {
    months: 12,
    share: 0.2,
    fwd3: 0.012,
    fwd6: 0.024,
    fwd12: 0.048,
    fwd12Median: 0.04,
    neg12: 0.25,
    maxDd12: -0.08,
  }
}

function component(partial: Partial<ComponentState> & Pick<ComponentState, 'id' | 'pillar' | 'label'>): ComponentState {
  return {
    masters: ['斯坦利·德鲁肯米勒'],
    value: 0,
    unit: '',
    display: '读数正常',
    observedOn: '2026-10',
    availableOn: '2026-11-30',
    stale: false,
    score: 0,
    rule: '示例阈值规则',
    source: 'https://fred.stlouisfed.org/',
    history: [
      ['2026-09', 0],
      ['2026-10', 0.1],
    ],
    ...partial,
  }
}

function pillar(partial: Partial<Pillar> & Pick<Pillar, 'id' | 'title'>): Pillar {
  return {
    weight: 0.25,
    score: 0.2,
    tone: 'positive',
    summary: '支柱概况正常。',
    components: [
      component({ id: `${partial.id}-a`, pillar: partial.id, label: `${partial.title}组件甲`, score: 1, display: '偏强' }),
      component({ id: `${partial.id}-b`, pillar: partial.id, label: `${partial.title}组件乙`, score: 0, display: '中性' }),
    ],
    history: [
      ['2026-06', 0.1],
      ['2026-07', 0.2],
      ['2026-08', 0.15],
      ['2026-09', 0.25],
      ['2026-10', 0.2],
    ],
    ...partial,
  }
}

const OUTER: OuterItem[] = [
  {
    id: 'hy-oas',
    name: '高收益债利差',
    grade: 'B',
    category: '信用',
    status: 'warn',
    value: '520 个基点',
    observedOn: '2026-11-20',
    signal: '信用压力升高',
    uncertainty: { kind: '历史太短', text: '可用历史偏短，触发时只降置信度。' },
    promote: '同口径历史满 20 年且覆盖至少两次衰退后可考虑计票。',
    masters: ['霍华德·马克斯'],
    source: 'https://fred.stlouisfed.org/series/BAMLH0A0HYM2',
  },
  {
    id: 'vix',
    name: 'VIX',
    grade: 'B',
    category: '情绪',
    status: 'clear',
    value: '18',
    observedOn: '2026-11-20',
    signal: '波动正常',
    uncertainty: { kind: '历史太短', text: '短线波动指标，不作计票依据。' },
    promote: '与核心组件回测对照改善后再议。',
    masters: ['保罗·都铎·琼斯'],
  },
  {
    id: 'ism-new',
    name: 'ISM 新订单',
    grade: 'B',
    category: '增长',
    status: 'clear',
    value: '48.2',
    observedOn: '2026-10',
    signal: '未到预警线',
    uncertainty: { kind: '历史太短', text: '样本偏短。' },
    promote: '覆盖两次衰退后再议。',
    masters: ['斯坦利·德鲁肯米勒'],
  },
  {
    id: 'cape',
    name: '席勒 CAPE',
    grade: 'C',
    category: '估值',
    status: 'info',
    level: 'high',
    value: '第 92 百分位',
    uncertainty: { kind: '择时力弱', text: '估值对短线切换帮助有限。' },
    promote: '仅作风险预算背景，不计票。',
    masters: ['杰里米·格兰桑'],
  },
  {
    id: 'buffett',
    name: '巴菲特指标',
    grade: 'C',
    category: '估值',
    status: 'info',
    level: 'neutral',
    value: '居中',
    uncertainty: { kind: '择时力弱', text: '长周期估值，短线帮助有限。' },
    promote: '仅作背景。',
    masters: ['沃伦·巴菲特'],
  },
  {
    id: 'ism',
    name: 'ISM 制造业 PMI',
    grade: 'D',
    category: '增长',
    status: 'na',
    uncertainty: { kind: '授权受限', text: '本站暂无可用授权序列。' },
    promote: '取得可用授权数据后接入。',
    masters: ['斯坦利·德鲁肯米勒'],
  },
]

function variants(): Variant[] {
  return [
    { id: 'full', label: '完整模型', cagr: 0.092, vol: 0.121, maxDd: -0.28, sharpe: 0.55, calmar: 0.33, avgEquity: 0.72, switchesPerYear: 1.4 },
    { id: 'v20', label: 'v2.0 无修复', cagr: 0.09, vol: 0.122, maxDd: -0.29, sharpe: 0.53, calmar: 0.31, avgEquity: 0.71, switchesPerYear: 1.5 },
    { id: 'macro', label: '仅宏观', cagr: 0.088, vol: 0.125, maxDd: -0.31, sharpe: 0.5, calmar: 0.28, avgEquity: 0.74, switchesPerYear: 1.1 },
    { id: 'trend', label: '仅趋势', cagr: 0.081, vol: 0.13, maxDd: -0.35, sharpe: 0.42, calmar: 0.23, avgEquity: 0.78, switchesPerYear: 0.8 },
    { id: 'static70', label: '恒定 70%', cagr: 0.079, vol: 0.11, maxDd: -0.3, sharpe: 0.45, calmar: 0.26, avgEquity: 0.7, switchesPerYear: 0 },
    { id: 'buyhold', label: '始终满仓', cagr: 0.095, vol: 0.15, maxDd: -0.45, sharpe: 0.4, calmar: 0.21, avgEquity: 1, switchesPerYear: 0 },
  ]
}

function backtest(): Backtest {
  const tierIds: TierId[] = ['offense', 'lean-offense', 'neutral', 'lean-defense', 'defense']
  const tiers = Object.fromEntries(tierIds.map(id => [id, emptyTierStats()])) as Record<TierId, TierStats>
  return {
    start: '1973-01',
    end: '2026-10',
    months: 646,
    disclosures: [
      '样本内回测，不代表未来表现。',
      '阈值先验设定，未针对历史调参。',
      '除萨姆规则外为修订后数据。',
      '标普收益用月均价近似，未计税费与交易成本。',
    ],
    tiers,
    variants: variants(),
    recessions: [
      {
        start: '1981-08',
        end: '1982-11',
        firstDefensive: '1980-08',
        leadMonths: 12,
        note: '窗口开始前已持续防守（自 1979-07 起）',
      },
      { start: '2008-01', end: '2009-06', firstDefensive: '2007-08', leadMonths: 5 },
      { start: '2020-03', end: '2020-04', firstDefensive: '2020-02', leadMonths: 1 },
    ],
    falseAlarms: [
      { start: '2016-01', end: '2016-03', months: 3, spxFwd12: 0.18, maxDd12: -0.05 },
    ],
    singles: [
      { componentId: 'sahm', label: '萨姆规则', negMonths: 40, spread12: -0.06, negHit12: 0.55 },
      { componentId: 'claims', label: '初请失业救济', negMonths: 30, spread12: 0.02, negHit12: 0.35 },
      { componentId: 'nfci', label: '金融条件', negMonths: 25, spread12: 0.005, negHit12: 0.4 },
    ],
    timeline: [
      { d: '2024-01', regime: 'neutral', final: 'neutral', spx: 4800, rec: 0 },
      { d: '2024-02', regime: 'lean-offense', final: 'lean-offense', spx: 5000, rec: 0 },
      { d: '2024-03', regime: 'lean-offense', final: 'neutral', spx: 5100, rec: 0 },
      { d: '2024-04', regime: 'offense', final: 'lean-offense', spx: 5200, rec: 0 },
      { d: '2024-05', regime: 'offense', final: 'offense', spx: 5300, rec: 0 },
      { d: '2025-01', regime: 'lean-defense', final: 'lean-defense', spx: 4900, rec: 0 },
      { d: '2025-02', regime: 'defense', final: 'defense', spx: 4600, rec: 1 },
      { d: '2025-03', regime: 'defense', final: 'defense', spx: 4500, rec: 1 },
      { d: '2026-09', regime: 'lean-offense', final: 'lean-offense', spx: 5600, rec: 0 },
      { d: '2026-10', regime: 'lean-offense', final: 'lean-offense', spx: 5700, rec: 0 },
    ],
  }
}

function readyCurrent(overrides: Partial<Current> = {}): Current {
  return {
    asOf: '2026-10-31',
    regime: { score: 0.32, tier: 'lean-offense' },
    tactical: {
      below: false,
      price: 5700,
      sma10: 5400,
      display: '标普月均价高于近 10 个月均价',
      mtd: {
        month: '2026-11',
        days: 14,
        average: 5750,
        sma10: 5450,
        below: false,
        display: '11 月至今 14 个交易日均价约 5750，仍高于预估十个月均线',
      },
    },
    repair: {
      active: false,
      rule: '趋势回到十个月均线上方，且信用支柱不再恶化时，把偏防守/防守上调一档。',
      display: '修复确认未触发',
    },
    final: { tier: 'lean-offense', equityShare: 0.85 },
    driver: 'macro',
    headline: '增长与流动性偏积极，信用尚可，整体偏进攻。',
    reasons: [
      '增长与就业支柱为正。',
      '货币与流动性支柱偏松。',
      '暂无熔断触发。',
    ],
    confidence: { level: 'high', agree: 3, total: 4, notes: ['四根支柱里三根与最终档位同向'] },
    breakers: [
      { id: 'recessionCredit', label: '衰退式信用', active: false, effect: '最多防守', rule: '增长与信用同时很差时强制防守' },
      { id: 'creditStress', label: '信用压力', active: false, effect: '最多偏防守', rule: '信用支柱极差时上限偏防守' },
      { id: 'sahmTrigger', label: '萨姆触发', active: false, effect: '最多偏防守', rule: '萨姆规则打到 −2 时上限偏防守' },
      { id: 'inflationSqueeze', label: '通胀挤压', active: false, effect: '最多中性', rule: '通胀极差且流动性紧时上限中性' },
    ],
    distance: {
      up: { tier: 'offense', scoreGap: 0.18, text: '综合分再升约 0.18 可到进攻' },
      down: { tier: 'neutral', scoreGap: 0.17, text: '综合分再降约 0.17 可到中性' },
      nearest: [
        { componentId: 'sahm', text: '萨姆规则再升 0.10 个百分点会打到 −1' },
        { componentId: 'nfci', text: '金融条件再收紧到 0 附近会打到 0 分' },
        { componentId: 'curve', text: '期限利差再倒挂 0.20 个百分点会打到 −1' },
      ],
      tactical: '月均价距十个月均线大约还有 5.6% 缓冲，月内至今亦未跌破。',
    },
    warnings: {
      on: 1,
      total: 3,
      names: ['高收益债利差'],
    },
    pillars: [
      pillar({ id: 'growth', title: '增长与就业', weight: 0.3, score: 0.5, summary: '就业与产出仍偏稳。' }),
      pillar({ id: 'credit', title: '信用', weight: 0.25, score: 0.1, summary: '利差尚可，压力有限。' }),
      pillar({ id: 'liquidity', title: '货币与流动性', weight: 0.25, score: 0.4, summary: '政策与金融条件偏松。' }),
      pillar({ id: 'inflation', title: '通胀', weight: 0.2, score: -0.2, tone: 'caution', summary: '核心通胀仍略偏高。' }),
    ],
    ...overrides,
  }
}

/** 美国综合指标：偏进攻就绪态 */
export function compositeFixture(overrides: Partial<CompositeFile> = {}): CompositeFile {
  return {
    ruleVersion: 'v2.0',
    generatedAt: '2026-11-23T06:00:00.000Z',
    tiers: TIERS,
    current: readyCurrent(),
    outer: OUTER,
    backtest: backtest(),
    failedSources: [],
    ...overrides,
  }
}

/** final.tier 为 null 的证据不足态 */
export function insufficientFixture(): CompositeFile {
  return compositeFixture({
    current: readyCurrent({
      regime: { score: null, tier: null },
      final: { tier: null, equityShare: null },
      driver: 'insufficient',
      headline: '核心支柱缺数过多，暂不给档。',
      reasons: ['增长与就业支柱缺数过半。', '信用支柱缺数过半。'],
      confidence: {
        level: 'low',
        agree: 0,
        total: 2,
        notes: ['增长与就业缺可用组件', '信用缺可用组件'],
      },
      distance: { nearest: [] },
      warnings: { on: 0, total: 3, names: [] },
      pillars: [
        pillar({
          id: 'growth',
          title: '增长与就业',
          score: null,
          tone: 'unknown',
          summary: '可用组件不足一半。',
          components: [
            component({ id: 'sahm', pillar: 'growth', label: '萨姆规则', score: null, display: '暂无', stale: true }),
          ],
        }),
        pillar({
          id: 'credit',
          title: '信用',
          score: null,
          tone: 'unknown',
          summary: '可用组件不足一半。',
        }),
        pillar({ id: 'liquidity', title: '货币与流动性', score: 0.2, summary: '流动性尚可。' }),
        pillar({ id: 'inflation', title: '通胀', score: 0, summary: '通胀中性。' }),
      ],
    }),
  })
}

/** 缺 mtd / repair / warnings 等新字段：页面对可选字段容错 */
export function legacyFieldsFixture(): CompositeFile {
  const base = compositeFixture()
  const tactical = { ...base.current.tactical }
  delete tactical.mtd
  const distance = { ...base.current.distance }
  delete distance.tactical
  return {
    ...base,
    current: {
      ...base.current,
      tactical,
      distance,
      repair: undefined as unknown as Current['repair'],
      warnings: undefined as unknown as Current['warnings'],
    },
  }
}
