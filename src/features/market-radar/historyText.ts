import { formatNum2, formatPct1, visibleText } from './labels'
import type { RadarCorrelation, RadarFile, RadarForwardStats, RadarPredictive, RadarPredictiveSet } from './types'

/** |t| 达到这个值才说「有关系」；与常用的 5% 显著性大致对应 */
export const T_THRESHOLD = 2

type HeatRow = RadarFile['backtest']['heatStats'][number]
type Gap = RadarFile['backtest']['sharpeGaps'][number]

const num2 = (n: number) => formatNum2(n)
const pct = (n: number | null) => (n == null ? '—' : visibleText(formatPct1(n)))

export function isSignificant(c: RadarCorrelation | null | undefined): boolean {
  return c?.t != null && Math.abs(c.t) >= T_THRESHOLD
}

/** 「相关系数 0.01（t 0.11）」；t 缺失时只给相关系数 */
export function corrFigures(c: RadarCorrelation): string {
  if (c.r == null) return '样本不足'
  return c.t == null ? `相关系数 ${num2(c.r)}` : `相关系数 ${num2(c.r)}（t ${num2(c.t)}）`
}

/**
 * 三段相关性的一句话；不显著的段统一说「不显著」，显著的说方向。
 * rising 是分数变大的含义：综合分说「越高」；冷热分正数为偏冷，说「越偏冷」。
 */
export function correlationSentence(subject: string, p: RadarPredictive, rising = '越高'): string {
  const tag = (c: RadarCorrelation) => {
    if (c.r == null) return ''
    if (!isSignificant(c)) return '，不显著'
    return c.r > 0 ? `，${rising}之后越好` : `，${rising}之后越差`
  }
  return `${subject}与之后 12 个月回报：全样本${corrFigures(p.all)}${tag(p.all)}；` +
    `1973–1999 年${corrFigures(p.before2000)}${tag(p.before2000)}；` +
    `2000 年以后${corrFigures(p.since2000)}${tag(p.since2000)}。`
}

function has(stats: RadarForwardStats | undefined): stats is RadarForwardStats {
  return stats != null && stats.months > 0 && stats.fwd12 != null
}

/**
 * 冷热分组的结论句：比较两段「偏热 − 居中」的方向。
 * 两段同号说「两段都是…」，异号说「两段方向相反，不能当择时信号」；没有样本的组明说没出现过。
 * 旧数据没有 before2000 时返回 null，由调用方退回旧句式。
 */
export function heatHistorySentence(rows: HeatRow[]): string | null {
  const by = new Map(rows.map(row => [row.heat, row]))
  const hot = by.get('hot')
  const mid = by.get('mid')
  const cold = by.get('cold')
  if (!hot?.before2000 || !mid?.before2000) return null
  const eras = [
    { name: '1973–1999 年', hot: hot.before2000, mid: mid.before2000 },
    { name: '2000 年以后', hot: hot.since2000, mid: mid.since2000 },
  ]
  const figures = (era: typeof eras[number]) =>
    `${era.name}偏热 ${pct(era.hot.fwd12)}、居中 ${pct(era.mid.fwd12)}`
  const comparable = eras.filter(era => has(era.hot) && has(era.mid))
  const parts: string[] = ['偏热只说明估值与持股拥挤度不便宜。']
  if (comparable.length === 2) {
    const signs = comparable.map(era => Math.sign((era.hot.fwd12 ?? 0) - (era.mid.fwd12 ?? 0)))
    // 先说 2000 年以后（离现在近），再说 1973–1999 年
    const text = [figures(comparable[1]), figures(comparable[0])].join('；')
    if (signs.includes(0)) {
      parts.push(`之后 12 个月平均：${text}。至少一段偏热与居中没有差别，不能当择时信号。`)
    } else if (signs[0] !== signs[1]) {
      parts.push(`之后 12 个月平均：${text}。两段方向相反，不能当择时信号。`)
    } else {
      const word = signs[0] < 0 ? '低于' : '高于'
      parts.push(`之后 12 个月平均：${text}。两段都是偏热之后${word}居中，但独立样本少，仍不宜当择时信号。`)
    }
  } else if (comparable.length === 1) {
    parts.push(`之后 12 个月平均：${figures(comparable[0])}。另一段缺少可比样本，不能当择时信号。`)
  }
  const missing: string[] = []
  for (const [row, label] of [[hot, '偏热'], [mid, '居中'], [cold, '偏冷']] as const) {
    if (!row) continue
    if (row.before2000 && row.before2000.months === 0) missing.push(`1973–1999 年没有出现过${label}`)
    if (row.since2000.months === 0) missing.push(`2000 年以后没有出现过${label}`)
  }
  if (missing.length) parts.push(`${missing.join('，')}。`)
  return parts.join('')
}

/**
 * 折叠区「把五个维度平均成一个分数行不行」标题下的摘要。
 * 开头由全样本 t 决定；再给两段相关性与按综合分持仓相对十个月均线的夏普差。
 */
export function compositeFoldSummary(
  predictive: RadarPredictiveSet | undefined,
  gaps: Gap[],
): string {
  const parts: string[] = []
  if (predictive) {
    parts.push(isSignificant(predictive.score.all) ? '全样本上有一定关系，但要看两段是否一致。' : '没有证据显示可行。')
    parts.push(correlationSentence('综合分', predictive.score))
  }
  const trend = gaps.find(gap => gap.versus === 'trend')
  if (trend) {
    const within = trend.low <= 0 && trend.high >= 0
    const tail = within ? '在抽样误差内' : trend.low > 0 ? '高于十个月均线' : '低于十个月均线'
    parts.push(`按综合分持仓与十个月均线的夏普差 ${num2(trend.diff)}（95% 区间 ${num2(trend.low)} 至 ${num2(trend.high)}），${tail}。`)
  }
  return parts.join('')
}
