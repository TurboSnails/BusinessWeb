// 「今日待处理」的单家公司规则：纯函数，只依赖 validation / priceAlert / ratingBucket，不读 DOM、localStorage。
// 站内（alerts.ts 从本机工具记录取数）与服务端每日提醒邮件（server/functions/candidate-alerts-digest.js）共用这一份规则。
// 规则固定、可复核，不是买卖建议。服务端看不到本机保存的 DCF，所以不传 dcf，「进入买入区」「DCF 过期」不会出现在邮件里。
import { ratingBucket } from '../signals/ratingBucket.js'
import { DIRECTION_TEXT, evaluatePriceAlert, type PriceObservation } from './priceAlert.js'
import { ALERT_ANCHOR_LABEL, type CandidateAlertRule, type CandidateItem, type DecisionRecord } from './validation.js'

export type AlertKind = 'review' | 'buy-zone' | 'rating' | 'stale-dcf' | 'price-hit'
export interface CandidateAlert {
  kind: AlertKind; market: CandidateItem['market']; code: string; text: string
  /** 仅「触及条件价」：触发时的收盘价（含日期与来源）和当时的规则 */
  price?: PriceObservation; rule?: CandidateAlertRule
  /** 仅「到期复查」：决策记录的检查日 */
  nextCheck?: string
  /** 仅「评级变化」：决策时与当前的评级档位 */
  rating?: { before: string; after: string }
}
export const ALERT_LABEL: Record<AlertKind, string> = { review: '到期复查', 'buy-zone': '进入买入区', rating: '评级变化', 'stale-dcf': 'DCF 过期', 'price-hit': '触及条件价' }
export const ALERT_RULES = { dcfMos: 0.2, staleDays: 180 } as const

export const latestDecision = (item: CandidateItem): DecisionRecord | undefined => item.decisions?.[item.decisions.length - 1]
/** 最新一条记录的下次检查日已到（含当天） */
export const isReviewDue = (item: CandidateItem, today: string): boolean => {
  const latest = latestDecision(item)
  return !!latest && latest.nextCheck <= today
}

const DAY = 86_400_000
const pct = (v: number): string => `${(v * 100).toFixed(0)}%`
const fmt = (n: number): string => n.toLocaleString('zh-CN', { maximumFractionDigits: 4 })

/** 触及条件价的说明：收盘价、行情日期、来源、条件价及其来源。措辞是「该复核一眼」，不是买入信号 */
export const priceHitText = (rule: CandidateAlertRule, o: PriceObservation): string =>
  `到了你设的价位，该复核一眼：收盘价 ${rule.currency} ${fmt(o.price)}（${o.date}，${o.source}）${DIRECTION_TEXT[rule.kind]} 条件价 ${fmt(rule.threshold)}（来自${ALERT_ANCHOR_LABEL[rule.anchor.type]}，${rule.anchor.asOf}）`

/** DCF 判断所需的最少字段（DcfSummary 的子集） */
export interface AlertDcfInput {
  source?: 'mine' | 'auto'
  current?: number | null
  buyBelow?: number | null
  credibility?: string | null
  mos: number | null
  savedAt?: string
}
export interface ItemAlertContext {
  /** 判断日 YYYY-MM-DD */
  today: string
  /** 这家公司的全部收盘价观测（按来源优先级排序）；只在设了价位提醒时用到 */
  observations: PriceObservation[]
  /** 列表展示用的 DCF（本人记录优先，否则自动 DCF）；不传则不判断买入区与 DCF 过期 */
  dcf?: AlertDcfInput
  /** 当前研究评级；不传则不判断评级变化 */
  rating?: string
}

/** 一家候选今天需要动手的事项，顺序：触及条件价 → 到期复查 → 进入买入区 → 评级变化 → DCF 过期 */
export function itemAlerts(item: CandidateItem, { today, observations, dcf, rating }: ItemAlertContext): CandidateAlert[] {
  const out: CandidateAlert[] = []
  const base = { market: item.market, code: item.code }
  const latest = latestDecision(item)
  if (item.alert) {
    const rule = item.alert
    const result = evaluatePriceAlert(rule, observations, today)
    if (result.status === 'hit') out.push({ ...base, kind: 'price-hit', price: result.observation, rule, text: priceHitText(rule, result.observation) })
  }
  if (latest && isReviewDue(item, today)) out.push({ ...base, kind: 'review', nextCheck: latest.nextCheck, text: `决策记录的检查日 ${latest.nextCheck} 已到：对照证伪条件复查` })

  const belowBuy = dcf?.buyBelow != null && dcf.current != null && dcf.current <= dcf.buyBelow && dcf.credibility !== 'low'
  const mineCheap = dcf?.source === 'mine' && dcf.mos != null && dcf.mos >= ALERT_RULES.dcfMos
  if (belowBuy || mineCheap) {
    const why = belowBuy ? `现价 ${dcf?.current} 低于自动 DCF 买入参考价 ${dcf?.buyBelow?.toFixed(2)}` : `本人 DCF 安全边际 ${pct(dcf!.mos!)}`
    out.push({ ...base, kind: 'buy-zone', text: `${why}${latest ? '' : '；还没有决策记录，行动前先写'}` })
  }

  const before = latest?.snapshot?.rating
  if (before && rating && ratingBucket(before) !== ratingBucket(rating)) {
    const r = { before: ratingBucket(before), after: ratingBucket(rating) }
    out.push({ ...base, kind: 'rating', rating: r, text: `研究评级从「${r.before}」变为「${r.after}」（记录于 ${latest?.at.slice(0, 10)}）` })
  }

  if (dcf?.source === 'mine' && dcf.savedAt) {
    const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(dcf.savedAt)) / DAY)
    if (days >= ALERT_RULES.staleDays) out.push({ ...base, kind: 'stale-dcf', text: `本人 DCF 保存于 ${dcf.savedAt.slice(0, 10)}（${days} 天前），财报和假设可能已变` })
  }
  return out
}
