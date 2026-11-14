// 价位刻度条的纯计算：把本页已有的价格锚点、三情景价、DCF 价整理成可比较的刻度。
// 规则：不补默认值；缺什么就不画什么；币种不一致或数值偏离 10 倍以上（疑似口径不同）时不比较。
import type { Market } from '../../data/companies'
import type { DcfSummary } from '../dcf/filter'

export type Currency = 'USD' | 'CNY' | 'HKD'

export interface PriceAnchorInput {
  price?: number
  date?: string
  days?: number
  stale?: boolean
  currency?: string
}

export interface PriceLevelsInput {
  market: Market
  anchor: PriceAnchorInput
  scenarios?: { name: string; price: string }[]
  dcf?: DcfSummary
}

export type LevelKey = 'bear' | 'base' | 'bull' | 'dcf-buy' | 'dcf-fair'

export interface PriceLevel {
  key: LevelKey
  label: string
  value: number
  currency: Currency | null
  /** 原文里的口径备注，如「估值初稿」 */
  note?: string
  comparable: boolean
  /** 不可比较的原因 */
  reason?: string
  /** 相对价格锚点的涨跌幅（小数），仅可比较且有锚点时给出 */
  change?: number
}

export interface PriceLevelsModel {
  state: 'empty' | 'ready'
  anchor: { price: number; currency: Currency | null; date?: string; days?: number; stale: boolean } | null
  levels: PriceLevel[]
  /** 情景价原文里有、但读不出单一数值的条目（如同时写 A/H 两个价） */
  skipped: string[]
  /** 刻度条上画出来的点（锚点 + 可比较刻度），已按价格从低到高排列 */
  scale: { min: number; max: number } | null
}

const DEFAULT_CURRENCY: Record<Market, Currency> = { us: 'USD', adr: 'USD', ndx: 'USD', cn: 'CNY', hk: 'HKD' }

export function normalizeCurrency(c: string | undefined | null): Currency | null {
  const v = (c ?? '').trim().toUpperCase()
  if (v === 'USD' || v === 'CNY' || v === 'HKD') return v
  if (v === 'RMB' || v === 'CNH') return 'CNY'
  return null
}

/** 从情景价原文读出单一价格与币种；读不出时返回 null，出现多个币种返回 'ambiguous' */
export function parseLevelPrice(text: string): { value: number; currency: Currency | null; note?: string } | null | 'ambiguous' {
  if (!text || /MISSING|缺|待补|未认证|撤回/.test(text)) return null
  const found = new Set<Currency>()
  let rest = text
  if (/HK\$|港元|港币/.test(rest)) { found.add('HKD'); rest = rest.replace(/HK\$|港元|港币/g, ' ') }
  if (/US\$|\$|美元/.test(rest)) { found.add('USD'); rest = rest.replace(/US\$|\$|美元/g, ' ') }
  if (/元|¥|￥|人民币|RMB/.test(rest)) found.add('CNY')
  if (found.size > 1) return 'ambiguous'
  const nums = (text.replace(/（[^）]*）|\([^)]*\)/g, ' ').match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(n => Number(n.replace(/,/g, '')))
  if (nums.length !== 1 || !Number.isFinite(nums[0]) || nums[0] <= 0) return nums.length > 1 ? 'ambiguous' : null
  const note = text.match(/（([^）]+)）|\(([^)]+)\)/)
  return { value: nums[0], currency: found.size ? [...found][0] : null, note: note ? (note[1] ?? note[2]) : undefined }
}

const SCENARIO_KEY: [RegExp, LevelKey, string][] = [
  [/悲观|熊|bear/i, 'bear', '悲观情景'],
  [/基准|中性|base/i, 'base', '基准情景'],
  [/乐观|牛|bull/i, 'bull', '乐观情景'],
]

const CURRENCY_LABEL: Record<Currency, string> = { USD: '美元', CNY: '人民币', HKD: '港元' }

export function buildPriceLevels(input: PriceLevelsInput): PriceLevelsModel {
  const defaultCurrency = DEFAULT_CURRENCY[input.market]
  const anchorCurrency = normalizeCurrency(input.anchor.currency) ?? defaultCurrency
  const anchor = input.anchor.price != null && Number.isFinite(input.anchor.price) && input.anchor.price > 0
    ? { price: input.anchor.price, currency: anchorCurrency, date: input.anchor.date, days: input.anchor.days, stale: !!input.anchor.stale }
    : null

  const raw: Omit<PriceLevel, 'comparable' | 'reason' | 'change'>[] = []
  const skipped: string[] = []
  for (const s of input.scenarios ?? []) {
    const hit = SCENARIO_KEY.find(([re]) => re.test(s.name))
    if (!hit || raw.some(r => r.key === hit[1])) continue
    const parsed = parseLevelPrice(s.price)
    if (parsed === 'ambiguous') { skipped.push(`${hit[2]}：${s.price}`); continue }
    if (!parsed) continue
    // 原文没写币种时按本市场的报价币种理解（情景表与价格锚点同口径）
    raw.push({ key: hit[1], label: hit[2], value: parsed.value, currency: parsed.currency ?? defaultCurrency, note: parsed.note })
  }

  const dcf = input.dcf
  // 自动 DCF 未跑通（金融股、负自由现金流、数据不全）时没有可用价位
  if (dcf && (!dcf.status || dcf.status === 'ok')) {
    const ccy = normalizeCurrency(dcf.currency)
    const who = dcf.source === 'mine' ? '本人 DCF' : '自动 DCF'
    if (dcf.buyBelow != null && Number.isFinite(dcf.buyBelow) && dcf.buyBelow > 0) raw.push({ key: 'dcf-buy', label: `${who}买入参考价`, value: dcf.buyBelow, currency: ccy, note: dcf.credibility ? `可信度${dcf.credibility === 'high' ? '高' : dcf.credibility === 'medium' ? '中' : '低'}` : undefined })
    if (dcf.price != null && Number.isFinite(dcf.price) && dcf.price > 0) raw.push({ key: 'dcf-fair', label: `${who}合理价`, value: dcf.price, currency: ccy })
  }

  const levels: PriceLevel[] = raw.map(r => {
    if (!anchor) return { ...r, comparable: true }
    if (r.currency && anchor.currency && r.currency !== anchor.currency) {
      return { ...r, comparable: false, reason: `币种不同（${CURRENCY_LABEL[r.currency]} vs 价格锚点${CURRENCY_LABEL[anchor.currency]}），不比较` }
    }
    if (!r.currency) return { ...r, comparable: false, reason: '币种未知，不比较' }
    const ratio = r.value / anchor.price
    if (ratio < 0.1 || ratio > 10) return { ...r, comparable: false, reason: '与价格锚点相差 10 倍以上，疑似口径不同，不比较' }
    return { ...r, comparable: true, change: ratio - 1 }
  })

  if (!levels.length) return { state: 'empty', anchor, levels, skipped, scale: null }

  const points = [...levels.filter(l => l.comparable).map(l => l.value), ...(anchor ? [anchor.price] : [])]
  const scale = points.length >= 2 ? { min: Math.min(...points), max: Math.max(...points) } : null
  return { state: 'ready', anchor, levels: [...levels].sort((a, b) => a.value - b.value), skipped, scale }
}

/** 刻度位置：0–100（%），两端各留 4% 边距 */
export function positionOf(value: number, scale: { min: number; max: number }): number {
  if (scale.max === scale.min) return 50
  return 4 + ((value - scale.min) / (scale.max - scale.min)) * 92
}

export function formatChange(change: number): string {
  const pct = change * 100
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(1)}%`
}
