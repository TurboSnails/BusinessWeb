import { scoreMarket } from '../macro-posture-market/components.mjs'
import { formatDate, formatReading } from '../macro-posture/format.mjs'
import { average, baseTier, TIERS } from '../macro-posture/model.mjs'
import { ageDays, clean, percentile, valueAt } from '../macro-posture/panel.mjs'

export const DIMENSIONS = [
  ['liquidity', '流动性'],
  ['valuation', '估值'],
  ['crowding', '仓位与拥挤度'],
  ['trading', '交易结构'],
  ['earnings', '盈利'],
]

const band = (value, low, high, lowScore = -1) => value <= low ? lowScore : value >= high ? -lowScore : 0
const percent = n => formatReading(n, '%', 2)
const pp = n => formatReading(n, '百分点', 2)
const times = n => formatReading(n, '倍', 2)
const bp = n => `${Math.round(n).toLocaleString('en-US').replace('-', '−')} 个基点`
const signed = (n, format) => (n > 0 ? '+' : '') + format(n)
const bottom = '第 20 百分位'
const top = '第 80 百分位'
const highExpensive = `达到${top}扣 1 分，不高于${bottom}加 1 分，其余 0 分。`
const highSupportive = `不高于${bottom}扣 1 分，达到${top}加 1 分，其余 0 分。`
const factset = 'FactSet 仅有少量已发布周报读数，缺少可公开复核的长期同口径历史。'
const survey = '美银调查只有零星已发布读数，完整历史受授权限制。'

const DEFINITIONS = {
  netLiquidity: {
    dimension: 'liquidity', label: '美元净流动性 13 周变化', frequency: 'weekly',
    display: p => `联储资产扣除财政部存款和隔夜逆回购后，近 13 周变化 ${signed(p.value, percent)}，` +
      (p.value >= 2 ? '流动性偏强。' : p.value <= -2 ? '流动性偏弱。' : '未达偏强或偏弱的阈值。'),
    rule: '历史不足 25 年，只展示。13 周升幅达到 2% 为偏强，降幅达到 2% 为偏弱。',
  },
  hy: {
    inverse: true,
    dimension: 'liquidity', label: '高收益债利差',
    display: p => `高收益债利差 ${bp(p.value)}` +
      (p.change == null ? '，四周变化暂缺。' : `，近 4 周变化 ${signed(p.change, bp)}。`) +
      (p.value >= 500 || p.change >= 50 ? '已达信用压力阈值。' : ''),
    rule: '公开同口径历史较短，只展示。利差达到 500 个基点，或 4 周内扩大至少 50 个基点，为信用压力信号。',
  },
  baaChange: {
    inverse: true,
    dimension: 'liquidity', label: '企业债利差半年变化', frequency: 'monthly',
    display: p => `Baa 与 Aaa 企业债利差近 6 个月变化 ${signed(p.value, pp)}。`,
    rule: '扩大至少 0.20 个百分点扣 1 分，收窄至少 0.15 个百分点加 1 分，其余 0 分。',
    score: p => band(p.value, -0.15, 0.20, 1),
  },
  erp: {
    inverse: true,
    dimension: 'valuation', label: '股债利差', frequency: 'monthly',
    display: p => `过去 12 个月盈利收益率 ${percent(100 / p.pe.value)}，` +
      `${formatDate(p.gs10.observedOn, 'monthly')}的 10 年期美债月均收益率 ${percent(p.gs10.value)}，相差 ${pp(p.value)}。`,
    rule: highSupportive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80),
  },
  pe: {
    dimension: 'valuation', label: '过去 12 个月市盈率', frequency: 'monthly',
    display: p => `按过去 12 个月实际盈利计，标普 500 市盈率为 ${times(p.value)}。`,
    rule: highExpensive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80, 1),
  },
  cape: {
    dimension: 'valuation', label: '周期调整市盈率（CAPE）', frequency: 'monthly',
    display: p => `按长期实际盈利平滑后，标普 500 市盈率为 ${times(p.value)}。`,
    rule: highExpensive,
    score: (_, rank) => scoreMarket('cape', 'b', { cape: { value: rank } }),
  },
  forwardPe: {
    dimension: 'valuation', label: '前瞻市盈率',
    display: p => `按未来 12 个月预期盈利计，标普 500 市盈率为 ${times(p.value)}。`,
    rule: factset,
  },
  equityShare: {
    staleDays: 280,
    dimension: 'crowding', label: '家庭股票占金融资产比例', frequency: 'monthly',
    display: p => `股票占家庭和非营利组织金融资产的 ${percent(p.value)}。`,
    rule: highExpensive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80, 1),
  },
  cashShare: {
    staleDays: 280,
    inverse: true,
    dimension: 'crowding', label: '家庭现金占金融资产比例', frequency: 'monthly',
    display: p => `现金、存款和货币基金占家庭和非营利组织金融资产的 ${percent(p.value)}。`,
    rule: highSupportive,
    score: (_, rank) => rank == null ? null : band(rank, 20, 80),
  },
  finraDebtYoy: {
    dimension: 'crowding', label: '融资余额同比', frequency: 'monthly',
    display: p => `证券保证金借方余额较去年同月变化 ${signed(p.value, percent)}。`,
    rule: '同比升幅达到 30% 扣 1 分，降幅达到 20% 加 1 分，其余 0 分。',
    score: p => band(p.value, -20, 30, 1),
  },
  managerCash: {
    inverse: true,
    dimension: 'crowding', label: '基金经理现金比例',
    display: p => `美银调查中，基金经理持有的现金比例为 ${percent(p.value)}。`,
    rule: survey,
  },
  managerUsOverweight: {
    dimension: 'crowding', label: '基金经理美股净超配',
    display: p => `美银调查中，基金经理美股净超配为 ${percent(p.value)}。`,
    rule: survey,
  },
  naaim: {
    dimension: 'crowding', label: 'NAAIM 主动经理敞口', frequency: 'weekly',
    display: p => `受访主动投资经理平均美股敞口为 ${percent(p.value)}` +
      (p.value >= 90 ? '，敞口偏高。' : p.value <= 30 ? '，敞口偏低。' : '。'),
    rule: '站内同口径历史自 2024 年起，只展示。敞口达到 90 为偏高，不高于 30 为偏低。',
  },
  breadth: {
    dimension: 'trading', label: '行业宽度', frequency: 'monthly',
    display: p => `${percent(p.value)} 的可用行业站上各自的 10 个月均线。`,
    rule: '宽度不高于 40% 扣 1 分，达到 60% 加 1 分，其余 0 分。',
    score: p => scoreMarket('breadth', 'b', { breadth: p }),
  },
  volume: {
    dimension: 'trading', label: '量价（3 月 / 12 月均量）', frequency: 'monthly',
    display: p => `近 3 个月日均量是近 12 个月的 ${times(p.value)}，标普月均价${p.below ? '低于' : '不低于'} 10 个月均线。`,
    rule: '量比达到 1.10 倍时，标普月均价低于 10 个月均线扣 1 分，不低于均线加 1 分，其余 0 分。',
    score: p => scoreMarket('volume', 'a', { volume: p }),
  },
  vixTerm: {
    inverse: true,
    dimension: 'trading', label: 'VIX 期限结构',
    display: p => `VIX ${formatReading(p.vix, '点')}，三个月 VIX ${formatReading(p.vix3m, '点')}，两者之比为 ${times(p.value)}。` +
      (p.value >= 1.05 ? '短期波动预期显著高于三个月预期。' : ''),
    rule: '历史不足 25 年，只展示。比值达到 1.05 倍表示近端波动预期显著高于三个月预期。',
  },
  breadth200: {
    dimension: 'trading', label: '成分股站上 200 日线比例',
    display: p => `${percent(p.value)} 的可用标普成分股站上自己的 200 日均线。`,
    rule: '站内历史约一年，按当前成分名单回算的部分存在幸存者偏差，只展示。',
  },
  volumeRatio: {
    dimension: 'trading', label: '美股 20 日量比',
    display: p => `全美股票当日成交量为前 20 个完整交易日均量的 ${times(p.value)}。`,
    rule: '站内历史较短，只展示。涵盖全美交易所及场外申报成交。',
  },
  epsYoy: {
    staleDays: 160,
    dimension: 'earnings', label: '标普过去 12 个月每股盈利同比', frequency: 'monthly',
    display: p => `过去 12 个月每股盈利较去年同期变化 ${signed(p.value, percent)}。`,
    rule: '同比降幅达到 10% 扣 1 分，升幅达到 10% 加 1 分，其余 0 分。',
    score: p => band(p.value, -10, 10),
  },
  forwardEps: {
    dimension: 'earnings', label: '前瞻每股盈利修正',
    display: p => `未来 12 个月每股盈利预期变化 ${signed(p.value, percent)}。`,
    rule: factset,
  },
}

export function rankAt(series, date) {
  const point = valueAt(series, date)
  if (!point) return null
  const known = series.filter(row => row.availableOn <= date)
  return {
    point, known,
    percentile: known.length < 2 ? null : percentile(point.value, known.map(row => row.value)),
  }
}

export function scoreIndicator(id, point, rank) {
  return Number.isFinite(point?.value) ? DEFINITIONS[id].score?.(point, rank) ?? null : null
}

/** 冷热按「风险偏好与拥挤程度」定：数值越高越代表恐慌、便宜或现金多的指标（inverse）反向。 */
function heatFor(raw, inverse) {
  const rank = raw == null ? null : inverse ? 100 - raw : raw
  if (rank == null) return 'na'
  if (rank >= 80) return 'hot'
  if (rank >= 60) return 'warm'
  if (rank <= 20) return 'cold'
  if (rank <= 40) return 'cool'
  return 'neutral'
}

export function buildIndicators(series, sources, date) {
  return Object.entries(DEFINITIONS).map(([id, def]) => {
    const reading = rankAt(series[id] ?? [], date)
    const { point, known, percentile: rawRank } = reading ?? { known: [], percentile: null }
    const first = known[0]?.observedOn ?? null
    const years = first && point ? ageDays(point.observedOn, first) / 365.2425 : 0
    // 历史不足 3 年不给百分位（样本太少，百分位没有意义）
    const rank = years >= 3 ? rawRank : null
    const stale = point ? ageDays(date, point.observedOn) > (def.staleDays ?? (def.frequency === 'monthly' ? 75 : 45)) : false
    const notes = [
      rawRank != null && rank == null ? '历史不足 3 年，不给百分位' : '',
      rank != null && years < 25 ? `百分位只基于约 ${Math.round(years)} 年历史` : '',
      stale ? '读数较旧' : '',
    ].filter(Boolean)
    return {
      id, dimension: def.dimension, label: def.label,
      display: point ? `${def.display(point).replace(/。$/, '')}（${formatDate(point.observedOn, def.frequency)}）。` : '读数暂缺。',
      observedOn: point?.observedOn ?? null, percentile: rank, percentileSince: rawRank == null ? null : first,
      heat: heatFor(rank, def.inverse), score: scoreIndicator(id, point, rawRank), rule: def.rule,
      historyYears: first ? clean(ageDays(point.observedOn, first) / 365.2425) : null,
      inScore: Boolean(def.score), source: sources[id] ?? '站内市场快照',
      history: known.slice(-120).map(row => [row.observedOn, row.value]),
      ...(notes.length ? { note: notes.join('；') } : {}),
    }
  })
}

export function scoreAt(series, date) {
  const indicators = Object.entries(DEFINITIONS).flatMap(([id, def]) => {
    if (!def.score) return []
    const rows = series[id] ?? []
    const reading = ['erp', 'pe', 'cape', 'equityShare', 'cashShare'].includes(id) ? rankAt(rows, date) : null
    const point = reading?.point ?? valueAt(rows, date)
    return [{ dimension: def.dimension, inScore: true, score: scoreIndicator(id, point, reading?.percentile ?? null) }]
  })
  return aggregateScores(indicators).score
}

export function aggregateScores(indicators) {
  const dimensions = DIMENSIONS.map(([id, title]) => {
    const scored = indicators.filter(row => row.dimension === id && row.inScore && Number.isFinite(row.score))
    const score = average(scored.map(row => row.score))
    const summary = score == null ? '暂无可计分读数。' :
      `${scored.length} 项计分，${scored.filter(row => row.score > 0).length} 项加分、${scored.filter(row => row.score < 0).length} 项扣分。`
    return { id, title, score, summary }
  })
  const mean = average(dimensions.flatMap(row => row.score == null ? [] : [row.score]))
  const score = mean == null ? null : clean(mean)
  return { dimensions, score, tier: baseTier(score) }
}

export function buildCurrent(indicators) {
  const current = aggregateScores(indicators)
  const tier = TIERS.find(row => row.id === current.tier)
  return {
    ...current,
    headline: tier
      ? `雷达为${tier.label}档，五维综合分 ${formatReading(current.score, '', 2)}，对应股票仓位上限的 ${formatReading(tier.equityShare * 100, '%', 0)}。`
      : '计分读数暂缺，雷达档位待定。',
  }
}
