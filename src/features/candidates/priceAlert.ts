// 候选池「触及条件价」规则：纯函数，不读 DOM / localStorage，日后服务端定时任务可直接复用。
// 只按收盘价判断；行情过期、币种不同、盘中价都不比较，并说明原因。这是复核提示，不是买卖信号。
import { thresholdInRange, validAlertRule, ALERT_ANCHOR_LABEL } from './validation'
import type { AlertAnchor, AlertAnchorType, AlertCurrency, AlertDirection, CandidateAlertRule } from './validation'

/** 一条带日期的价格观测（收盘价） */
export interface PriceObservation {
  price: number
  currency: string
  /** 行情所属交易日 YYYY-MM-DD（不是抓取时间） */
  date: string
  /** 来源说明，如「自动 DCF 预填库」「公司页价格锚点」 */
  source: string
  /** 收盘前的盘中价：只按收盘价判断，所以跳过 */
  intraday?: boolean
}

export type SkipReason = 'disabled' | 'snoozed' | 'seen' | 'no-price' | 'stale' | 'currency-mismatch' | 'invalid'
export type PriceAlertEvaluation =
  | { status: 'hit'; observation: PriceObservation }
  | { status: 'clear'; observation: PriceObservation }
  | { status: 'skipped'; reason: SkipReason; observation?: PriceObservation }

export const SKIP_TEXT: Record<SkipReason, string> = {
  disabled: '提醒已关闭',
  snoozed: '已暂停',
  seen: '这一行情日已看过',
  'no-price': '没有可用的收盘价',
  stale: '行情未更新，暂停判断',
  'currency-mismatch': '条件价和行情币种不同，不比较',
  invalid: '提醒设置不完整或条件价不合理',
}

/** 行情日期超过这么多个交易日（按工作日计，不含节假日表）就不判断 */
export const STALE_TRADING_DAYS = 2
export const SNOOZE_DAYS = 7

const DAY = /^\d{4}-\d{2}-\d{2}$/
const utc = (day: string): number => Date.parse(`${day}T00:00:00Z`)
const validDay = (day: string): boolean => DAY.test(day) && Number.isFinite(utc(day))

/** (from, to] 之间的工作日数；节假日按交易日算，因此长假后会更早判为过期（宁可不判，也不误判） */
export function tradingDaysBetween(from: string, to: string): number {
  let n = 0
  for (let t = utc(from) + 86_400_000, end = utc(to); t <= end; t += 86_400_000) {
    const wd = new Date(t).getUTCDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return n
}

export const addDays = (day: string, days: number): string => new Date(utc(day) + days * 86_400_000).toISOString().slice(0, 10)

const usable = (o: PriceObservation, today: string): boolean =>
  Number.isFinite(o.price) && o.price > 0 && validDay(o.date) && o.date <= today && !o.intraday

/** 同币种中行情日期最新的一条；同日先出现的优先（调用方按来源优先级排序） */
export function pickObservation(observations: PriceObservation[], currency: string, today: string): PriceObservation | undefined {
  return observations.filter(o => usable(o, today) && o.currency === currency)
    .reduce<PriceObservation | undefined>((best, o) => (!best || o.date > best.date ? o : best), undefined)
}

/** 比较规则：price-below 为 价格 ≤ 条件价，price-above 为 价格 ≥ 条件价；相等算触及 */
export const reached = (kind: AlertDirection, price: number, threshold: number): boolean =>
  kind === 'price-below' ? price <= threshold : price >= threshold

/**
 * 判断一条价位提醒。
 * @param today 判断日 YYYY-MM-DD（站内用本地日期，服务端用对应市场的交易日）
 */
export function evaluatePriceAlert(alert: CandidateAlertRule, observations: PriceObservation[], today: string): PriceAlertEvaluation {
  if (!validAlertRule(alert)) return { status: 'skipped', reason: 'invalid' }
  if (!alert.enabled) return { status: 'skipped', reason: 'disabled' }
  if (alert.snoozedUntil && today < alert.snoozedUntil) return { status: 'skipped', reason: 'snoozed' }
  const observation = pickObservation(observations, alert.currency, today)
  if (!observation) {
    const other = observations.some(o => usable(o, today))
    return { status: 'skipped', reason: other ? 'currency-mismatch' : 'no-price' }
  }
  if (tradingDaysBetween(observation.date, today) > STALE_TRADING_DAYS) return { status: 'skipped', reason: 'stale', observation }
  if (!reached(alert.kind, observation.price, alert.threshold)) return { status: 'clear', observation }
  if (alert.lastSeenAt && alert.lastSeenAt.slice(0, 10) >= observation.date) return { status: 'skipped', reason: 'seen', observation }
  return { status: 'hit', observation }
}

// ── 预填：条件价从研究数据来，每个候选都写明来源与日期 ──
export interface AnchorOption extends AlertAnchor { currency: AlertCurrency; label: string; note?: string }

/** 研究估值区间（CompanyValuation.value）与自动 DCF 的必要字段，避免本模块依赖页面数据层 */
export interface AnchorInputs {
  valuation?: { currency: string; asOf: string; value: null | { low: number; base: number; date: string | null; primaryMethod: string } }
  autoDcf?: { buyBelow: number | null; currency: string; credibility: string | null; priceDate?: string | null }
}

const isCurrency = (c: string): c is AlertCurrency => c === 'CNY' || c === 'HKD' || c === 'USD'
const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** 可选的条件价锚点，按优先级：研究悲观价 > 研究基准价 > 自动 DCF 买入参考价 */
export function anchorOptions({ valuation, autoDcf }: AnchorInputs): AnchorOption[] {
  const out: AnchorOption[] = []
  const v = valuation?.value
  if (valuation && v && isCurrency(valuation.currency) && validDay(v.date ?? valuation.asOf)) {
    const asOf = v.date ?? valuation.asOf
    const researchVersion = `valuation:${valuation.asOf}:${v.primaryMethod}`.slice(0, 100)
    const add = (type: AlertAnchorType, value: number): void => { if (ok(value)) out.push({ type, value, asOf, researchVersion, currency: valuation.currency as AlertCurrency, label: ALERT_ANCHOR_LABEL[type] }) }
    add('research-bear', v.low)
    add('research-base', v.base)
  }
  if (autoDcf && ok(autoDcf.buyBelow) && isCurrency(autoDcf.currency) && autoDcf.priceDate && validDay(autoDcf.priceDate)) {
    out.push({
      type: 'dcf-buy-below', value: autoDcf.buyBelow, asOf: autoDcf.priceDate, researchVersion: `dcf-auto:${autoDcf.priceDate}`,
      currency: autoDcf.currency, label: ALERT_ANCHOR_LABEL['dcf-buy-below'], ...(autoDcf.credibility === 'low' ? { note: '可信度低，仅供参考' } : {}),
    })
  }
  return out
}

/** 手动锚点：以当时现价作参照（用于合理性检查），日期为当天 */
export const manualAnchor = (price: PriceObservation | undefined, threshold: number, today: string): AlertAnchor =>
  ({ type: 'manual', value: price && price.price > 0 ? price.price : threshold, asOf: today })

export function buildAlertRule(input: { kind: AlertDirection; threshold: number; currency: AlertCurrency; anchor: AlertAnchor; enabled: boolean; createdAt: string }): CandidateAlertRule {
  const anchor: AlertAnchor = { type: input.anchor.type, value: input.anchor.value, asOf: input.anchor.asOf, ...(input.anchor.researchVersion ? { researchVersion: input.anchor.researchVersion } : {}) }
  return { kind: input.kind, threshold: input.threshold, currency: input.currency, anchor, enabled: input.enabled, createdAt: input.createdAt }
}

/** 保存前的人话校验；返回 null 表示可以保存 */
export function alertProblem(alert: CandidateAlertRule): string | null {
  if (!(Number.isFinite(alert.threshold) && alert.threshold > 0)) return '条件价要填一个大于 0 的数'
  if (!thresholdInRange(alert.threshold, alert.anchor.value)) return `条件价离参照价 ${alert.anchor.value} 超过 10 倍，可能填错了单位或币种`
  if (!validAlertRule(alert)) return '提醒设置不完整，请检查条件价和来源'
  return null
}

export const DIRECTION_TEXT: Record<AlertDirection, string> = { 'price-below': '≤', 'price-above': '≥' }

// ── 价格来源：与 alerts.ts 一致，先用自动 DCF 预填库的现价，再用公司页的价格锚点；都要有行情日期 ──
export interface PriceInputs {
  /** 交易地默认币种（价格锚点没写币种时用） */
  venueCurrency: AlertCurrency
  autoDcf?: { current: number; currency: string; priceDate?: string | null; priceLive?: boolean }
  marketRefresh?: { price: number; priceDate: string; currency?: string; source: string; tradability?: string }
}
export const VENUE_CURRENCY = { cn: 'CNY', hk: 'HKD', us: 'USD' } as const satisfies Record<'cn' | 'hk' | 'us', AlertCurrency>

export function priceObservations({ venueCurrency, autoDcf, marketRefresh }: PriceInputs): PriceObservation[] {
  const out: PriceObservation[] = []
  if (autoDcf?.priceDate) out.push({ price: autoDcf.current, currency: autoDcf.currency, date: autoDcf.priceDate, source: '自动 DCF 预填库收盘价', ...(autoDcf.priceLive ? { intraday: true } : {}) })
  if (marketRefresh && marketRefresh.tradability !== 'unverified')
    out.push({ price: marketRefresh.price, currency: marketRefresh.currency ?? venueCurrency, date: marketRefresh.priceDate, source: `公司页价格锚点（${marketRefresh.source}）` })
  return out
}
