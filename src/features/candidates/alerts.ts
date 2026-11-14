// 「今日待处理」：只列出和候选池相关、需要动手的事项。规则固定、可复核，不是买卖建议。
import { ratingBucket } from '../signals/companySignals'
import { autoDcfOf, dcfOf, venueOf, type ToolSources } from './links'
import { DIRECTION_TEXT, evaluatePriceAlert, priceObservations, VENUE_CURRENCY, type PriceAlertEvaluation, type PriceObservation } from './priceAlert'
import { isReviewDue, latestDecision } from './store'
import { ALERT_ANCHOR_LABEL, candidateKey, type CandidateAlertRule, type CandidateItem } from './validation'

export type AlertKind = 'review' | 'buy-zone' | 'rating' | 'stale-dcf' | 'price-hit'
export interface CandidateAlert {
  kind: AlertKind; market: CandidateItem['market']; code: string; text: string
  /** 仅「触及条件价」：触发时的收盘价（含日期与来源）和当时的规则 */
  price?: PriceObservation; rule?: CandidateAlertRule
}
export const ALERT_LABEL: Record<AlertKind, string> = { review: '到期复查', 'buy-zone': '进入买入区', rating: '评级变化', 'stale-dcf': 'DCF 过期', 'price-hit': '触及条件价' }
export const ALERT_RULES = { dcfMos: 0.2, staleDays: 180 } as const

const DAY = 86_400_000
const pct = (v: number): string => `${(v * 100).toFixed(0)}%`

const fmt = (n: number): string => n.toLocaleString('zh-CN', { maximumFractionDigits: 4 })

/** 某家候选的全部价格观测：自动 DCF 预填库的收盘价 + 调用方补充的（如公司页价格锚点） */
function observationsOf(item: CandidateItem, tools: ToolSources, extra?: Map<string, PriceObservation[]>): PriceObservation[] {
  const auto = autoDcfOf(item.market, item.code, tools)
  return [...priceObservations({ venueCurrency: VENUE_CURRENCY[venueOf(item.market)], autoDcf: auto }), ...(extra?.get(candidateKey(item)) ?? [])]
}

/** 每家设了价位提醒的候选的判断结果（market:code → 结果），供页面说明「为什么没触发」 */
export function priceAlertStates(items: CandidateItem[], tools: ToolSources, today: string, extra?: Map<string, PriceObservation[]>): Map<string, PriceAlertEvaluation> {
  const out = new Map<string, PriceAlertEvaluation>()
  for (const item of items) if (item.alert) out.set(candidateKey(item), evaluatePriceAlert(item.alert, observationsOf(item, tools, extra), today))
  return out
}

/**
 * @param ratings 当前研究评级（market:code → 评级）；未加载公司库时不检查评级变化
 * @param prices 额外的收盘价观测（market:code → 观测），如公司页价格锚点；自动 DCF 预填库的现价总会参与
 */
export function candidateAlerts(items: CandidateItem[], tools: ToolSources, today: string, ratings?: Map<string, string>, prices?: Map<string, PriceObservation[]>): CandidateAlert[] {
  const out: CandidateAlert[] = []
  const now = Date.parse(`${today}T00:00:00Z`)
  for (const item of items) {
    const base = { market: item.market, code: item.code }
    const latest = latestDecision(item)
    if (item.alert) {
      const rule = item.alert
      const result = evaluatePriceAlert(rule, observationsOf(item, tools, prices), today)
      if (result.status === 'hit') {
        const o = result.observation
        out.push({ ...base, kind: 'price-hit', price: o, rule,
          text: `到了你设的价位，该复核一眼：收盘价 ${rule.currency} ${fmt(o.price)}（${o.date}，${o.source}）${DIRECTION_TEXT[rule.kind]} 条件价 ${fmt(rule.threshold)}（来自${ALERT_ANCHOR_LABEL[rule.anchor.type]}，${rule.anchor.asOf}）` })
      }
    }
    if (isReviewDue(item, today)) out.push({ ...base, kind: 'review', text: `决策记录的检查日 ${latest?.nextCheck} 已到：对照证伪条件复查` })

    const dcf = dcfOf(item.market, item.code, tools)
    const belowBuy = dcf?.buyBelow != null && dcf.current != null && dcf.current <= dcf.buyBelow && dcf.credibility !== 'low'
    const mineCheap = dcf?.source === 'mine' && dcf.mos != null && dcf.mos >= ALERT_RULES.dcfMos
    if (belowBuy || mineCheap) {
      const why = belowBuy ? `现价 ${dcf?.current} 低于自动 DCF 买入参考价 ${dcf?.buyBelow?.toFixed(2)}` : `本人 DCF 安全边际 ${pct(dcf!.mos!)}`
      out.push({ ...base, kind: 'buy-zone', text: `${why}${latest ? '' : '；还没有决策记录，行动前先写'}` })
    }

    const before = latest?.snapshot?.rating
    const current = ratings?.get(`${item.market}:${item.code}`)
    if (before && current && ratingBucket(before) !== ratingBucket(current)) out.push({ ...base, kind: 'rating', text: `研究评级从「${ratingBucket(before)}」变为「${ratingBucket(current)}」（记录于 ${latest?.at.slice(0, 10)}）` })

    if (dcf?.source === 'mine' && dcf.savedAt) {
      const days = Math.floor((now - Date.parse(dcf.savedAt)) / DAY)
      if (days >= ALERT_RULES.staleDays) out.push({ ...base, kind: 'stale-dcf', text: `本人 DCF 保存于 ${dcf.savedAt.slice(0, 10)}（${days} 天前），财报和假设可能已变` })
    }
  }
  return out
}

/** 按类别计数，供首页显示 */
export function countAlerts(alerts: CandidateAlert[]): Partial<Record<AlertKind, number>> {
  const out: Partial<Record<AlertKind, number>> = {}
  for (const a of alerts) out[a.kind] = (out[a.kind] ?? 0) + 1
  return out
}
