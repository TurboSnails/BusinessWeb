// 候选池云同步的严格校验：服务端（api/candidates-sync.ts）与客户端共用。
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export type CandidateMarket = 'us' | 'cn' | 'hk' | 'adr' | 'ndx'
export type CandidateItem = { market: CandidateMarket; code: string; addedAt: string; note?: string; decisions?: DecisionRecord[]; alert?: CandidateAlertRule }

// ── 价位提醒（可选字段，schemaVersion 仍为 1）：条件价必须挂在一个研究锚点上，记录来源与日期 ──
// 只是「到了你设的价位，该复核一眼」，不是买卖指令。站内与日后的服务端定时任务共用同一份规则。
export type AlertDirection = 'price-below' | 'price-above'
export type AlertAnchorType = 'manual' | 'dcf-buy-below' | 'research-bear' | 'research-base'
export type AlertCurrency = 'CNY' | 'HKD' | 'USD'
export const ALERT_CURRENCIES: readonly AlertCurrency[] = ['CNY', 'HKD', 'USD']
export const ALERT_ANCHOR_LABEL: Record<AlertAnchorType, string> = {
  manual: '手动填写', 'dcf-buy-below': '自动 DCF 买入参考价', 'research-bear': '研究估值·悲观价', 'research-base': '研究估值·基准价',
}
export interface AlertAnchor {
  type: AlertAnchorType
  /** 锚点价格（手动时为设置当时的现价，用来做 0.1×–10× 合理性检查） */
  value: number
  /** 锚点日期 YYYY-MM-DD */
  asOf: string
  /** 研究版本标识（如 valuation:2026-11-13:PE），研究更新后可据此判断条件价是否过时 */
  researchVersion?: string
}
export interface CandidateAlertRule {
  kind: AlertDirection
  /** 条件价，正数，币种同 currency；只按收盘价比较 */
  threshold: number
  currency: AlertCurrency
  anchor: AlertAnchor
  enabled: boolean
  createdAt: string // ISO
  /** 暂停到这一天（YYYY-MM-DD，当天恢复） */
  snoozedUntil?: string
  /** 上次点「已看过」的时间（ISO）；同一行情日不再重复列出 */
  lastSeenAt?: string
}

// ── 统一决策记录（《正念投资》第37章 37.4）：只追加不覆盖，每次观察/暂缓/买入/调整/卖出都是一个新版本 ──
export type DecisionAction = 'watch' | 'hold' | 'buy' | 'adjust' | 'sell'
export const DECISION_ACTIONS: Record<DecisionAction, string> = { watch: '观察', hold: '暂缓', buy: '买入', adjust: '调整', sell: '卖出' }
export type DecisionType = 'value' | 'growth' | 'turnaround'
export const DECISION_TYPES: Record<DecisionType, string> = { value: '价值回归', growth: '快速增长', turnaround: '困境反转' }
/** 记录当时自动带上的依据，复盘时看「当时到底依据的是什么」 */
export type DecisionSnapshot = { rating?: string; price?: number; priceDate?: string; dcfPrice?: number; dcfCurrency?: string; dcfMos?: number; dcfDate?: string }
export type DecisionRecord = {
  at: string // 记录时间（ISO）
  action: DecisionAction
  why: string // ① 我为什么买：经营上的理由
  wrong: string // ② 什么情况说明我错了：可核查的条件
  nextCheck: string // ③ 下次检查日 YYYY-MM-DD
  // 完整版（可选）
  funds?: string // 资金：用款期限、参考总额、主动额度
  type?: DecisionType
  cyclical?: boolean // 周期选修
  evidence?: string // 经营依据：三条证据、原始来源、公开日期
  valuation?: string // 估值：口径、情景与区间
  position?: string // 仓位：单股、行业和共同风险上限
  exit?: string // 退出：证伪条件、估值条件、重新评估时点
  result?: string // 结果：比较基准、预计成本 / 实际成本、收益、回撤与耗时
  snapshot?: DecisionSnapshot
}
export const MAX_DECISIONS = 30
export const MAX_DECISION_TEXT = 1000
const DECISION_TEXT = ['why', 'wrong', 'funds', 'evidence', 'valuation', 'position', 'exit', 'result'] as const
const DECISION_KEYS = new Set<string>(['at', 'action', 'nextCheck', 'type', 'cyclical', 'snapshot', ...DECISION_TEXT])
const SNAPSHOT_KEYS = new Set(['rating', 'price', 'priceDate', 'dcfPrice', 'dcfCurrency', 'dcfMos', 'dcfDate'])
const DAY = /^\d{4}-\d{2}-\d{2}$/
const validDay = (v: unknown): boolean => typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
const shortText = (v: unknown, max: number): boolean => v === undefined || (typeof v === 'string' && v.length <= max)
const finiteOrUndefined = (v: unknown): boolean => v === undefined || (typeof v === 'number' && Number.isFinite(v))

function validSnapshot(value: unknown): boolean {
  return object(value) && Object.keys(value).every(k => SNAPSHOT_KEYS.has(k))
    && shortText(value.rating, 100) && shortText(value.dcfCurrency, 8)
    && finiteOrUndefined(value.price) && finiteOrUndefined(value.dcfPrice) && finiteOrUndefined(value.dcfMos)
    && (value.priceDate === undefined || validDay(value.priceDate)) && (value.dcfDate === undefined || validDay(value.dcfDate))
}

export function validDecisionRecord(value: unknown): value is DecisionRecord {
  return object(value)
    && Object.keys(value).every(k => DECISION_KEYS.has(k))
    && typeof value.at === 'string' && !Number.isNaN(Date.parse(value.at))
    && typeof value.action === 'string' && Object.hasOwn(DECISION_ACTIONS, value.action)
    && typeof value.why === 'string' && value.why.trim().length > 0
    && typeof value.wrong === 'string' && value.wrong.trim().length > 0
    && validDay(value.nextCheck)
    && DECISION_TEXT.every(k => shortText(value[k], MAX_DECISION_TEXT))
    && (value.type === undefined || (typeof value.type === 'string' && Object.hasOwn(DECISION_TYPES, value.type)))
    && (value.cyclical === undefined || typeof value.cyclical === 'boolean')
    && (value.snapshot === undefined || validSnapshot(value.snapshot))
}

/** 版本按记录时间先后排列，最多 MAX_DECISIONS 条 */
function validDecisions(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_DECISIONS && value.every(validDecisionRecord)
    && value.every((r, i) => i === 0 || Date.parse(r.at) >= Date.parse(value[i - 1].at))
}
export type CandidatesPayload = { schemaVersion: 1; items: CandidateItem[] }

export const MAX_CANDIDATES = 2000
export const MAX_NOTE = 500
const MARKETS = new Set<string>(['us', 'cn', 'hk', 'adr', 'ndx'])
const ITEM_KEYS = new Set(['market', 'code', 'addedAt', 'note', 'decisions', 'alert'])
const ALERT_KEYS = new Set(['kind', 'threshold', 'currency', 'anchor', 'enabled', 'createdAt', 'snoozedUntil', 'lastSeenAt'])
const ANCHOR_KEYS = new Set(['type', 'value', 'asOf', 'researchVersion'])
const ALERT_KINDS = new Set<string>(['price-below', 'price-above'])
const MAX_PRICE = 1e7
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < MAX_PRICE
const isoTime = (v: unknown): boolean => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))

/** 条件价相对锚点的合理范围（开区间），沿用公司页情景价的 0.1×–10× 判断 */
export const thresholdInRange = (threshold: number, anchor: number): boolean => threshold > anchor * 0.1 && threshold < anchor * 10

export function validAlertRule(value: unknown): value is CandidateAlertRule {
  if (!object(value) || !Object.keys(value).every(k => ALERT_KEYS.has(k))) return false
  const a = value.anchor
  return typeof value.kind === 'string' && ALERT_KINDS.has(value.kind)
    && positive(value.threshold)
    && typeof value.currency === 'string' && (ALERT_CURRENCIES as readonly string[]).includes(value.currency)
    && object(a) && Object.keys(a).every(k => ANCHOR_KEYS.has(k))
    && typeof a.type === 'string' && Object.hasOwn(ALERT_ANCHOR_LABEL, a.type)
    && positive(a.value) && validDay(a.asOf)
    && (a.researchVersion === undefined || (typeof a.researchVersion === 'string' && a.researchVersion.length > 0 && a.researchVersion.length <= 100))
    && thresholdInRange(value.threshold, a.value)
    && typeof value.enabled === 'boolean'
    && isoTime(value.createdAt)
    && (value.snoozedUntil === undefined || validDay(value.snoozedUntil))
    && (value.lastSeenAt === undefined || isoTime(value.lastSeenAt))
}

export const candidateKey = (item: { market: string; code: string }): string => `${item.market}:${item.code}`

export function validCandidateItem(value: unknown): value is CandidateItem {
  return object(value)
    && Object.keys(value).every(k => ITEM_KEYS.has(k))
    && typeof value.market === 'string' && MARKETS.has(value.market)
    && typeof value.code === 'string' && /^[\w.\-^=]{1,32}$/.test(value.code)
    && typeof value.addedAt === 'string' && !Number.isNaN(Date.parse(value.addedAt))
    && (value.note === undefined || (typeof value.note === 'string' && value.note.length <= MAX_NOTE))
    && (value.decisions === undefined || validDecisions(value.decisions))
    && (value.alert === undefined || validAlertRule(value.alert))
}

export function validCandidatesPayload(value: unknown): value is CandidatesPayload {
  if (!object(value) || value.schemaVersion !== 1 || Object.keys(value).some(k => k !== 'schemaVersion' && k !== 'items')) return false
  if (!Array.isArray(value.items) || value.items.length > MAX_CANDIDATES || !value.items.every(validCandidateItem)) return false
  return new Set(value.items.map(candidateKey)).size === value.items.length
}
