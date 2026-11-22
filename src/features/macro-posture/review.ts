import type { MarketData, PostureReview, Signal, SubIndex } from './types'

const reassess: PostureReview['reassess'] = [
  { label: '转向积极', detail: 'HY 近四周转为收窄，CCC 相对 HY 的压力停止扩大，再等市场广度连续两周改善。' },
  { label: '加深防守', detail: '低评级压力向广义 HY 扩散，同时盈利预期下修或初请失业金持续走高。' },
  { label: '反弹待确认', detail: '指数先反弹、信用还未好转时维持观察，等融资压力和参与度给出进一步证据。' },
]

const guidance: Record<Signal['tone'], string> = {
  positive: '增长与资金支持进一步评估新增战术风险。同步复核估值、市场参与度和原定风险上限。',
  neutral: '维持长期底仓的目标权重，等信用和增长有更清楚的方向再评估战术仓。',
  caution: '长期底仓维持目标权重，暂缓新增战术风险。已超出计划上限的集中度或杠杆按原计划复核。',
  negative: '优先复核杠杆、集中度和依赖再融资的敞口，按组合风险上限评估降档。',
  unknown: '目前只展示可用的风险证据。补齐关键数据后再评估战术敞口。',
}

export function buildPostureReview(
  metrics: MarketData['metrics'], posture: Signal, growth: SubIndex, inflation: SubIndex, credit: SubIndex,
): PostureReview {
  const read = (key: string) => metrics[key]?.stale ? undefined : metrics[key]?.value
  const vix = read('vix')
  const breadth = read('breadth200')
  const flags = [vix !== undefined && vix >= 30 ? '波动升高' : '', breadth !== undefined && breadth < 50 ? '广度偏弱' : ''].filter(Boolean)
  const hasBoth = vix !== undefined && breadth !== undefined
  const epsRevision = read('epsRevision')
  const hyChange = read('hy') === undefined ? undefined : metrics.hy?.changes.twelveWeeks?.difference
  const cccChange = read('cccSpread') === undefined ? undefined : metrics.cccSpread?.changes.twelveWeeks?.difference
  const gap = hyChange === undefined || cccChange === undefined ? undefined : cccChange - hyChange
  const reasons = [
    (credit.score ?? 0) < 0 ? gap !== undefined && gap > 0
      ? `${credit.label}，近 12 周 CCC 利差比 HY 多走阔 ${Math.round(gap)} 个基点。` : `${credit.label}。` : '',
    (inflation.score ?? 0) < 0 ? `${inflation.label}。` : '',
  ].filter(Boolean)
  return {
    guidance: guidance[posture.tone],
    risk: reasons.join('') || posture.detail,
    counterpoint: (epsRevision ?? 0) > 0 ? '远期盈利预期仍在上修，为避免追跌减仓提供了反向证据。'
      : growth.score === 1 ? '增长读数回升，为保持长期股票敞口提供支持。'
        : epsRevision === undefined ? '等待新鲜的盈利修正读数和更明确的增长证据。' : '现有盈利和增长读数尚未提供明确支持。',
    counterEvidence: [
      { key: 'epsRevision', label: '标普 500 前瞻 EPS 预期较季末变化', metric: metrics.epsRevision },
      { key: 'forwardPe', label: '标普 500 前瞻市盈率', metric: metrics.forwardPe },
    ],
    market: {
      label: flags.join(' · ') || (hasBoth ? '波动与广度未触及观察线' : '市场证据不足'),
      tone: flags.length ? 'caution' : hasBoth ? 'neutral' : 'unknown',
      detail: 'VIX 达 30 或站上 200 日线的成分占比低于 50% 时提示压力。此栏用于检查市场表现，宏观档位独立计算。',
      evidence: [
        { key: 'vix', label: 'VIX 波动率', metric: metrics.vix },
        { key: 'breadth200', label: '标普成分站上 200 日线的占比', metric: metrics.breadth200 },
      ],
    },
    reassess,
  }
}
