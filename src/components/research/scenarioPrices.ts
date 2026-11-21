/** 情景价严格解析：不编中点、不吞无关数字。 */

import type { Company } from '../../data/companies'
import {
  compareValuation,
  STATUS_LABEL,
  valuationReliability,
  type CompanyValuation,
  type ValuationReliabilityReason,
} from '../../features/company-valuation/model'

export type ParsedScenario =
  | { kind: 'point'; value: number; display: string }
  | { kind: 'range'; low: number; high: number; display: string }
  | { kind: 'none'; display: string }

const RANGE_SEP = /(?:–|—|−|-|〜|~|至)/

function num(s: string): number {
  return Number(s.replace(/,/g, ''))
}

/**
 * 只接受：
 * - 单值：整段文本里恰好一个数字（可带币种/「元」等前后缀）
 * - 区间：恰好两个数字，且由 –/-/~/至 连接
 * 其余（含日期括号、两地报价等）→ none，原文照显，不画刻度。
 */
export function parseScenarioPrice(text: string | null | undefined): ParsedScenario {
  if (!text || !String(text).trim()) return { kind: 'none', display: '未取得' }
  const display = String(text).trim()
  if (/MISSING|待补|未取得|不适用/i.test(display)) return { kind: 'none', display }

  const allNums = display.match(/[\d,]+(?:\.\d+)?/g) || []
  if (allNums.length === 1) {
    const value = num(allNums[0])
    if (Number.isFinite(value) && value > 0) return { kind: 'point', value, display }
    return { kind: 'none', display }
  }

  if (allNums.length === 2) {
    const rangeMatch = display.match(
      new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s*${RANGE_SEP.source}\\s*([\\d,]+(?:\\.\\d+)?)`),
    )
    if (rangeMatch) {
      const a = num(rangeMatch[1])
      const b = num(rangeMatch[2])
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
        return { kind: 'range', low: Math.min(a, b), high: Math.max(a, b), display }
      }
    }
  }

  return { kind: 'none', display }
}

/** @deprecated 兼容旧调用：仅单值时返回数字，区间/无法识别返回 undefined */
export function parseScenarioPoint(text: string | null | undefined): number | undefined {
  const p = parseScenarioPrice(text)
  return p.kind === 'point' ? p.value : undefined
}

export type ScenarioEntry = {
  label: string
  display: string
  parsed: ParsedScenario
}

export type ScenarioTriple = {
  bear?: ScenarioEntry
  base?: ScenarioEntry
  bull?: ScenarioEntry
}

const NAME_BEAR = /悲观|Bear|熊|低/i
const NAME_BASE = /基准|Base|基本/i
const NAME_BULL = /乐观|Bull|牛|高/i

function cleanPointDisplay(raw: string, value: number, currency?: string): string {
  if (/HK\$|港元|HKD/i.test(raw)) return formatMoneyAmount(value, 'HKD')
  if (/CN¥|￥|人民币|CNY|\d\s*元/.test(raw) || /元/.test(raw)) return formatMoneyAmount(value, 'CNY')
  if (/US\$|USD|\$/.test(raw)) return formatMoneyAmount(value, currency === 'HKD' ? 'USD' : (currency || 'USD'))
  return formatMoneyAmount(value, currency)
}

export function pickScenarioTriple(
  scenarios?: { name: string; price: string }[] | null,
  rows?: [string, string, string, string][] | null,
  currency?: string,
): ScenarioTriple {
  const out: ScenarioTriple = {}
  const put = (name: string, price: string) => {
    const parsed0 = parseScenarioPrice(price)
    // 单值：只显示币种+数字，状态/草案后缀留给标题
    const parsed: ParsedScenario = parsed0.kind === 'point'
      ? { kind: 'point', value: parsed0.value, display: cleanPointDisplay(price, parsed0.value, currency) }
      : parsed0
    const entry: ScenarioEntry = {
      label: name,
      display: parsed.kind === 'none' && (!price || !price.trim()) ? '未取得' : parsed.display,
      parsed,
    }
    if (NAME_BEAR.test(name) && !NAME_BASE.test(name)) out.bear = entry
    else if (NAME_BASE.test(name)) out.base = entry
    else if (NAME_BULL.test(name)) out.bull = entry
  }
  if (scenarios?.length) scenarios.forEach(s => put(s.name, s.price))
  else if (rows?.length) rows.forEach(([name, price]) => put(name, price))
  return out
}

/** 刻度用的数值范围：单值取自身，区间取 [low, high]。 */
export function scenarioExtent(parsed: ParsedScenario): { low: number; high: number } | undefined {
  if (parsed.kind === 'point') return { low: parsed.value, high: parsed.value }
  if (parsed.kind === 'range') return { low: parsed.low, high: parsed.high }
  return undefined
}

/** 现价相对基准的折溢价（%）；基准仅在单值时可比。 */
export function premiumToBase(price: number | undefined, base: number | undefined): number | undefined {
  if (price === undefined || base === undefined || !(base > 0)) return undefined
  return ((price / base) - 1) * 100
}

/** 文案：写清谁比谁，不用涨跌色。 */
export function formatPremiumVsBase(pct: number | undefined): string {
  if (pct === undefined || !Number.isFinite(pct)) return '相对基准情景价暂不可比'
  if (Math.abs(pct) < 0.05) return '现价接近基准情景价'
  const abs = Math.abs(pct).toFixed(1)
  return pct > 0 ? `现价高于基准情景价 ${abs}%` : `现价低于基准情景价 ${abs}%`
}

export function isUsStyleMarket(market: string): boolean {
  return market === 'us' || market === 'adr' || market === 'ndx'
}

/** 现价标签相对圆点的对齐：靠左端左齐、靠右端右齐，避免裁切。 */
export type PriceLabelAlign = 'start' | 'center' | 'end'

export function priceLabelAlign(pctAlongRail: number): PriceLabelAlign {
  if (pctAlongRail < 15) return 'start'
  if (pctAlongRail > 85) return 'end'
  return 'center'
}

/** 币种 + 数字，不含状态后缀。 */
export function formatMoneyAmount(n: number, currency?: string): string {
  const body = n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (!currency) return body
  if (currency === 'USD') return `$${body}`
  if (currency === 'HKD') return `HK$${body}`
  if (currency === 'CNY') return `${body} 元`
  return `${body} ${currency}`
}

function pointEntry(label: string, value: number, currency?: string): ScenarioEntry {
  const display = formatMoneyAmount(value, currency)
  return { label, display, parsed: { kind: 'point', value, display } }
}

export type HeaderScenarioSource = 'valuation' | 'valuation-unreliable' | 'research' | 'none'

/** 头部折溢价与刻度条的同一套数（禁止混用综合估值与原研究）。 */
export type HeaderScenarioBundle = {
  source: HeaderScenarioSource
  /** 主标题，含来源说明 */
  title: string
  triple: ScenarioTriple
  /** 用于折溢价的现价（估值路径可能来自 compareValuation.current） */
  price: number | undefined
  /** 基准数值（与刻度中列同源）；无可比时 undefined */
  baseValue: number | undefined
  premiumLabel: string
  currency?: string
  /** 综合估值不可信时的原因（不画刻度、不显示折溢价） */
  unreliableReasons?: ValuationReliabilityReason[]
}

function researchTitle(researchAsOf?: string): string {
  const d = researchAsOf?.match(/\d{4}-\d{2}-\d{2}/)?.[0]
  return d ? `情景价位 · 原研究情景（原研究日期 ${d}）` : '情景价位 · 原研究情景'
}

function valuationTitle(record: CompanyValuation): string {
  const status = STATUS_LABEL[record.status]
  const method = record.value?.primaryMethod
  const date = record.asOf
  const bits = [status, method ? `方法 ${method}` : null, date].filter(Boolean)
  return `情景价位 · 综合估值（${bits.join('，')}）`
}

/**
 * 有可用综合估值（含 low/base/high）→ 整套用估值；
 * 否则整套退回原研究情景。折溢价与刻度共用 baseValue。
 */
export function resolveHeaderScenarioBundle(input: {
  valuation?: CompanyValuation
  marketRefresh?: Company['marketRefresh']
  price?: number
  currency?: string
  scenarios?: { name: string; price: string }[] | null
  scenRows?: [string, string, string, string][] | null
  researchAsOf?: string
}): HeaderScenarioBundle {
  const { valuation, marketRefresh, price, currency, scenarios, scenRows, researchAsOf } = input
  const v = valuation?.value
  const usableValuation = !!(
    valuation
    && v
    && valuation.status !== 'insufficient'
    && v.base > 0
    && v.low >= 0
    && v.high >= v.base
  )

  if (usableValuation && valuation && v) {
    const refreshed = marketRefresh?.tradability === 'unverified' ? undefined : marketRefresh
    const c = compareValuation(valuation, refreshed)
    const ccy = valuation.currency || currency
    const triple: ScenarioTriple = {
      bear: pointEntry('低', v.low, ccy),
      base: pointEntry('基准', v.base, ccy),
      bull: pointEntry('高', v.high, ccy),
    }
    const px = c.current !== null ? c.current : price
    const reliability = valuationReliability(valuation, refreshed)
    if (!reliability.ok) {
      // 不可信时仍用综合估值三档，不退回原研究情景（避免两套数混用）。
      return {
        source: 'valuation-unreliable',
        title: '情景价位 · 综合估值待核',
        triple,
        price: px,
        baseValue: undefined,
        premiumLabel: '',
        currency: ccy,
        unreliableReasons: reliability.reasons,
      }
    }
    return {
      source: 'valuation',
      title: valuationTitle(valuation),
      triple,
      price: px,
      baseValue: v.base,
      premiumLabel: formatPremiumVsBase(premiumToBase(px, v.base)),
      currency: ccy,
    }
  }

  const triple = pickScenarioTriple(scenarios, scenRows, currency)
  const baseValue = triple.base?.parsed.kind === 'point' ? triple.base.parsed.value : undefined
  const hasAny = !!(triple.bear || triple.base || triple.bull)
  return {
    source: hasAny ? 'research' : 'none',
    title: researchTitle(researchAsOf),
    triple,
    price,
    baseValue,
    premiumLabel: formatPremiumVsBase(premiumToBase(price, baseValue)),
    currency,
  }
}
