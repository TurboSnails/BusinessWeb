// 「今日待处理」：只列出和候选池相关、需要动手的事项。规则固定、可复核，不是买卖建议。
// 单家公司的规则在 alertRules.ts（服务端每日提醒邮件共用），这里只负责从本机工具记录取数。
import { autoDcfOf, dcfOf, venueOf, type ToolSources } from './links'
import { itemAlerts, type CandidateAlert, type AlertKind } from './alertRules'
import { evaluatePriceAlert, priceObservations, VENUE_CURRENCY, type PriceAlertEvaluation, type PriceObservation } from './priceAlert'
import { candidateKey, type CandidateItem } from './validation'

export { ALERT_LABEL, ALERT_RULES, type AlertKind, type CandidateAlert } from './alertRules'

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
  return items.flatMap(item => itemAlerts(item, {
    today,
    observations: item.alert ? observationsOf(item, tools, prices) : [],
    dcf: dcfOf(item.market, item.code, tools),
    rating: ratings?.get(candidateKey(item)),
  }))
}

/** 按类别计数，供首页显示 */
export function countAlerts(alerts: CandidateAlert[]): Partial<Record<AlertKind, number>> {
  const out: Partial<Record<AlertKind, number>> = {}
  for (const a of alerts) out[a.kind] = (out[a.kind] ?? 0) + 1
  return out
}
