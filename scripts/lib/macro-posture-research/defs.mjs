/** 预注册候选（2026-11-23；阈值与写法冻结，只检验不调参） */

export const PREREGISTERED = '2026 年 11 月 23 日在看到结果前写下候选、阈值与采用标准。'
export const CRITERIA = [
  '两段子样本夏普都提高',
  '两段最大回撤都不恶化超过 1 个百分点',
  '全样本年化收益下降不超过 0.3 个百分点',
  '衰退捕捉（起点前至少 1 个月进入持续防守）不减少，误报月数增加不超过 20%',
  '同口径历史至少 25 年才可进核心；不足则最多观察',
  '只在一段夏普改善且未违反回撤与年化条款 → 观察；违反回撤或年化条款 → 不采用',
  '观察不代表有效，只表示没被否决',
]

export const SPLIT_EARLY_END = '1999-12'
export const SPLIT_LATE_START = '2000-01'
export const HISTORY_YEARS_MIN = 25
export const DRAWDOWN_TOLERANCE = 0.01
export const CAGR_TOLERANCE = 0.003
export const FALSE_ALARM_TOLERANCE = 1.2

/** 候选自身为修订值、基准为当时版本时，比较略偏向候选（适用于建筑许可、周工时、盈利） */
export const REVISION_BIAS_NOTE = '候选自身序列为修订值，基准为当时版本，比较略偏向候选。'
export const REVISION_BIAS_IDS = new Set(['permits', 'hours', 'eps'])

/** @typedef {'rateExp'|'permits'|'hours'|'eps'|'sloos'|'valuationCap'} CandidateId */

export const CANDIDATES = [
  {
    id: 'rateExp',
    name: '加息预期（两年期减联邦基金）',
    pillar: 'liquidity',
    kind: 'component',
    masters: ['德鲁肯米勒', '都铎·琼斯'],
    data: '2 年期美债收益率减联邦基金利率，1976 年 12 月起；当日可得',
    rule: '差值 ≥ +0.75 且 2 年期美债收益率半年升 ≥ 0.50 → −1；否则 0（不给正分）',
    historyStart: '1976-12',
    fred: ['DGS2'],
  },
  {
    id: 'permits',
    name: '建筑许可',
    pillar: 'growth',
    kind: 'component',
    masters: ['德鲁肯米勒', '达利欧'],
    data: '建筑许可，1960 年起；观测月 +1 月末可得',
    rule: '六月均同比 ≤ −30% → −2；≤ −20% → −1；≥ +10% → +1',
    historyStart: '1960-01',
    fred: ['PERMIT'],
  },
  {
    id: 'hours',
    name: '制造业周工时',
    pillar: 'growth',
    kind: 'component',
    masters: ['德鲁肯米勒', '达利欧'],
    data: '制造业平均周工时，1939 年起；观测月 +1 月末可得',
    rule: '半年变化 ≤ −0.5 小时 → −1；≥ +0.3 小时 → +1',
    historyStart: '1939-01',
    fred: ['AWHMAN'],
  },
  {
    id: 'eps',
    name: '标普盈利同比',
    pillar: 'growth',
    kind: 'component',
    masters: ['德鲁肯米勒', '理查德·伯恩斯坦'],
    data: '标普过去 12 个月每股盈利，1871 年起；观测月 +3 月末可得',
    rule: '同比 ≤ −20% → −2；≤ −10% → −1；≥ +10% → +1',
    historyStart: '1871-01',
    fred: [],
    multpl: 's-p-500-earnings/table/by-month',
  },
  {
    id: 'sloos',
    name: '银行收紧企业贷款标准',
    pillar: 'credit',
    kind: 'component',
    masters: ['霍华德·马克斯', '达利欧'],
    data: '银行收紧工商业贷款净比例，1990 年起（季频）；季度观测 → 次季第一个月末可得',
    rule: '≥ 40 → −2；≥ 20 → −1；≤ −5 → +1',
    historyStart: '1990-01',
    fred: ['DRTSCILM'],
  },
  {
    id: 'valuationCap',
    name: '估值上限（CAPE × 加息）',
    pillar: 'cap',
    kind: 'cap',
    masters: ['罗伯特·席勒', '德鲁肯米勒'],
    data: '席勒周期性市盈率自 1900 扩张窗口百分位 × 2 年期美债收益率半年变化；市盈率用站内本地序列',
    rule: '市盈率 ≥ 第 90 百分位且 2 年期美债收益率半年升 ≥ 0.50 → 最终档位最多偏进攻',
    historyStart: '1976-12',
    fred: ['DGS2'],
    local: 'shillerCape',
  },
]

export const CANDIDATE_BY_ID = Object.fromEntries(CANDIDATES.map(c => [c.id, c]))
