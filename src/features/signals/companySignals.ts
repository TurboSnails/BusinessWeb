// 公司页「决策信号汇总」：把研究评级、三情景、DCF、林奇分类与本人决策记录放在一起，
// 标出方向不一致之处。规则固定、可复核，只帮助发现分歧，不是买卖建议。
import type { DcfSummary } from '../dcf/filter'
import { DECISION_ACTIONS, type DecisionAction } from '../candidates/validation'

export type RatingBucket = '优先关注' | '条件关注' | '观察' | '回避' | '未估值'

/** 各来源评级用语不一（逢低增持/买入/首选/核心配置…），统一归到五档；未识别的一律「观察」 */
export function ratingBucket(rating: string): RatingBucket {
  if (/^未估值/.test(rating)) return '未估值'
  if (/^(回避|暂不|暂缓)/.test(rating)) return '回避'
  if (/^(优先关注|优先跟踪|买入|首选|核心配置|均衡优选|稳健增配)/.test(rating)) return '优先关注'
  if (/^(条件|HOLD（条件候选）|优先观察|观察优先|重点观察|邮轮组优先|质地优先|增长可持续|质量观察（第|优质但待价|逢低增持)/.test(rating)) return '条件关注'
  return '观察'
}

/** 偏积极 / 中性 / 偏谨慎；null 表示数据不足，不参与分歧判断 */
export type Direction = 1 | 0 | -1 | null
export interface Signal {
  id: 'rating' | 'scenario' | 'dcf' | 'lynch' | 'decision'
  label: string
  verdict: string
  detail: string
  direction: Direction
}
export interface SignalInput {
  rating: string
  /** 已核验可交易的最新价；未知时情景与 DCF 只给数据，不判断方向 */
  price?: number
  priceDate?: string
  priceStale?: boolean
  scenarios?: { name: string; price: string }[]
  dcf?: DcfSummary
  lynch?: { type: string; attention: string; moat?: string }
  decision?: { action: DecisionAction; nextCheck: string; count: number }
  today: string
}
export interface SignalSummary { signals: Signal[]; conflicts: string[]; notes: string[] }

// 估值本身有误差：小幅低于现价算中性，明显低于才记为偏谨慎
export const SIGNAL_RULES = { scenarioUp: 0.15, scenarioDown: -0.05, dcfMos: 0.2, dcfDown: -0.1 } as const
const pct = (v: number): string => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`

/** 情景价字符串里的第一个数字；[MISSING] 或偏离现价 10 倍以上（口径不同）时返回 null */
function scenarioPrice(text: string | undefined, price: number | undefined): number | null {
  if (!text || /MISSING/.test(text)) return null
  const m = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  const v = m ? Number(m[0]) : NaN
  if (!Number.isFinite(v) || v <= 0) return null
  return price && (v < price * 0.1 || v > price * 10) ? null : v
}

function ratingSignal(rating: string): Signal {
  const bucket = ratingBucket(rating)
  return { id: 'rating', label: '研究评级', verdict: bucket, detail: rating, direction: bucket === '优先关注' ? 1 : bucket === '回避' ? -1 : bucket === '未估值' ? null : 0 }
}

function scenarioSignal(input: SignalInput): Signal {
  const find = (re: RegExp) => input.scenarios?.find(s => re.test(s.name))?.price
  const base = scenarioPrice(find(/^(基准|中性|Base)/i), input.price)
  const bear = scenarioPrice(find(/^(悲观|Bear)/i), input.price)
  const empty: Signal = { id: 'scenario', label: '三情景', verdict: input.scenarios?.length ? '情景价未认证' : '没有情景', detail: '没有可用的基准情景价', direction: null }
  if (base == null) return empty
  if (!input.price) return { ...empty, verdict: `基准 ${base}`, detail: '缺少可交易的最新价，无法比较' }
  const up = base / input.price - 1
  const down = bear != null ? bear / input.price - 1 : null
  return {
    id: 'scenario', label: '三情景',
    verdict: `基准 ${pct(up)}`,
    detail: `基准情景价 ${base}${down != null ? `；悲观 ${bear}（${pct(down)}）` : ''}；按现价 ${input.price}`,
    direction: up >= SIGNAL_RULES.scenarioUp ? 1 : up < SIGNAL_RULES.scenarioDown ? -1 : 0,
  }
}

function dcfSignal(dcf: DcfSummary | undefined): Signal {
  const source = dcf?.source === 'mine' ? '本人 DCF' : '自动 DCF'
  if (!dcf || dcf.price == null || dcf.mos == null || !Number.isFinite(dcf.mos)) {
    const why = dcf?.status === 'financial' ? '金融企业不适用' : dcf?.status === 'negativeFcf' ? '自由现金流为负，不适用' : '暂无可用估值'
    return { id: 'dcf', label: 'DCF', verdict: why, detail: '可在快速 DCF 或完整 DCF 页自行测算', direction: null }
  }
  const low = dcf.credibility === 'low'
  const below = dcf.buyBelow != null && dcf.current != null && dcf.current <= dcf.buyBelow
  return {
    id: 'dcf', label: 'DCF',
    verdict: `安全边际 ${pct(dcf.mos)}`,
    detail: [`${source}合理价 ${dcf.currency ?? ''} ${dcf.price.toFixed(2)}`.trim(), below && `现价已低于买入参考价 ${dcf.buyBelow?.toFixed(2)}`, low && '模型可信度低，不参与判断', dcf.savedAt && `保存于 ${dcf.savedAt.slice(0, 10)}`].filter(Boolean).join('；'),
    direction: low ? null : dcf.mos >= SIGNAL_RULES.dcfMos ? 1 : dcf.mos < SIGNAL_RULES.dcfDown ? -1 : 0,
  }
}

function lynchSignal(lynch: SignalInput['lynch']): Signal {
  if (!lynch) return { id: 'lynch', label: '林奇分类', verdict: '暂无', detail: '分类数据加载中或未覆盖', direction: null }
  return {
    id: 'lynch', label: '林奇分类', verdict: `${lynch.type} · 关注度${lynch.attention}`, detail: lynch.moat ?? '同类内关注度按统一规则计算',
    direction: lynch.attention === '高' ? 1 : lynch.attention === '低' ? -1 : 0,
  }
}

const NAMES: Record<Signal['id'], string> = { rating: '研究评级', scenario: '三情景', dcf: 'DCF', lynch: '林奇分类', decision: '我的决策' }

export function companySignals(input: SignalInput): SignalSummary {
  const signals = [ratingSignal(input.rating), scenarioSignal(input), dcfSignal(input.dcf), lynchSignal(input.lynch)]
  const d = input.decision
  if (d) signals.push({ id: 'decision', label: '我的决策', verdict: DECISION_ACTIONS[d.action], detail: `${d.count} 个版本；下次检查 ${d.nextCheck}`, direction: null })

  const positive = signals.filter(s => s.direction === 1).map(s => NAMES[s.id])
  const negative = signals.filter(s => s.direction === -1).map(s => NAMES[s.id])
  const conflicts: string[] = []
  if (positive.length && negative.length) conflicts.push(`${positive.join('、')}偏积极，而${negative.join('、')}偏谨慎：先弄清是模型假设、数据时点还是研究结论不同，再决定是否行动。`)
  const bucket = ratingBucket(input.rating)
  if (d && (d.action === 'buy' || d.action === 'adjust') && bucket === '回避') conflicts.push(`你最近的决策是「${DECISION_ACTIONS[d.action]}」，但最新研究评级为回避：按决策记录复查证伪条件。`)

  const notes: string[] = []
  if (input.priceStale) notes.push(`价格锚点${input.priceDate ? ` ${input.priceDate}` : ''}已过期，情景与 DCF 的比较按旧价计算。`)
  if (d && d.nextCheck <= input.today) notes.push(`决策记录的检查日 ${d.nextCheck} 已到，请到候选池复查。`)
  if (!positive.length && !negative.length && !conflicts.length) notes.push('可比较的信号不足或都为中性，没有明显方向。')
  else if (!conflicts.length) notes.push(positive.length ? '有方向的信号都偏积极，没有发现分歧；仍需核对数据时点与假设。' : '有方向的信号都偏谨慎，没有发现分歧。')
  return { signals, conflicts, notes }
}
