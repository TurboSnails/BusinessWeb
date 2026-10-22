import type { Company } from '../../data/companies'
import { compareValuation, type CompanyValuation } from './model'

export interface ValuationPresentation {
  headline: string
  positionLabel: string | null
  tone: 'under' | 'over' | 'fair' | 'waiting'
  emphasis: 'strong' | 'muted'
  current: number | null
  priceDate: string | null
  basisLabel: string
  timingLabel: string
  evidenceNote: string | null
}
const fmt = (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
// Pure readability switch (current >= 2x base, i.e. +100%); not an investment threshold.
const MULTIPLE_FROM = 2
// Short labels from explicit missing cues only. Generic "未逐家重读"/DCF "桥接未纳入" and
// healthy method reasons never match, so they are never shown as a data error.
const BEFORE_EXTREME: [RegExp, string][] = [
  [/币种.*(桥接|转换|换算)|(桥接|转换|换算).*币种|ADR|ADS|每股.*换算|股份.*(换算|折算)/, '币种/股份换算待核'],
  [/冲突|相差/, '前瞻盈利口径待核'],
  [/撤回/, '原模型已撤回'],
  [/不为正/, '盈利输入待核'],
  [/分部价值|少数股东/, '分部/少数股东桥接待核'],
  [/倍数(缺|非单调|不是)/, '研究倍数待核'],
]
const AFTER_EXTREME: [RegExp, string][] = [[/预测财年|预测年度|未绑定/, '预测年度待绑定']]
// Extreme gap between price and base is a prompt to re-check inputs, not a claim that they are wrong.
function extremeNote(record: CompanyValuation): string {
  const inputs = record.methods.find(m => m.name === record.value?.primaryMethod)?.inputs ?? {}
  return 'epsForward' in inputs || 'epsTrailingTwelveMonths' in inputs || 'researchMultiples' in inputs || 'multiples' in inputs ? '盈利与倍数待核' : '基准输入待核'
}
function evidenceNote(record: CompanyValuation, extreme: boolean): string | null {
  const hit = (cues: [RegExp, string][]) => cues.find(([p]) => record.missing.some(t => p.test(t)))?.[1]
  const found = hit(BEFORE_EXTREME) ?? (extreme ? extremeNote(record) : undefined) ?? hit(AFTER_EXTREME)
  if (found) return found
  return record.status === 'insufficient' || !record.value ? (record.missing.length ? '关键证据待补' : null) : null
}
export function getValuationPresentation(record: CompanyValuation, refreshed?: Company['marketRefresh']): ValuationPresentation {
  const c = compareValuation(record, refreshed?.tradability === 'unverified' ? undefined : refreshed)
  const extreme = !!record.value && record.status !== 'insufficient' && record.value.kind !== 'future' && c.current !== null && record.value.base > 0 && c.current / record.value.base >= MULTIPLE_FROM
  const base = { current: c.current, priceDate: c.priceDate, evidenceNote: evidenceNote(record, extreme) }
  const v = record.value
  if (!v || record.status === 'insufficient') {
    return { ...base, headline: '等待证据', positionLabel: null, tone: 'waiting', emphasis: 'muted', basisLabel: '暂无数值估值', timingLabel: '等待证据' }
  }
  const timingLabel = v.kind === 'future' ? `${v.date}目标` : v.kind === 'undated' ? '未定期限' : '基准日估值'
  const basisLabel = `基准 ${fmt(v.base)} ${record.currency} · 区间 ${fmt(v.low)}–${fmt(v.high)}`
  const waiting = (headline: string): ValuationPresentation => ({ ...base, headline, positionLabel: null, tone: 'waiting', emphasis: 'muted', basisLabel, timingLabel })
  if (c.current === null) return waiting('缺少现价')
  if (v.kind === 'future') {
    // Room vs current price: base / current - 1. Not a statement about today's value.
    const room = Number(((v.base / c.current - 1) * 100).toFixed(1))
    return { ...base, headline: `${v.date}情景目标 相对现价空间 ${room > 0 ? '+' : ''}${room.toFixed(1)}%`, positionLabel: null, tone: 'fair', emphasis: 'muted', basisLabel, timingLabel }
  }
  if (!(v.base > 0)) return waiting('基准不可比')
  // Discount/premium denominator is base: current / base - 1.
  const ratio = c.current / v.base
  const pct = Number(((ratio - 1) * 100).toFixed(1))
  const positionLabel = c.position === 'below' ? '低于区间' : c.position === 'above' ? '高于区间' : c.position === 'within' ? '区间内' : null
  const emphasis = c.position === 'within' || pct === 0 ? 'muted' : 'strong'
  if (pct === 0) return { ...base, headline: '接近基准', positionLabel, tone: 'fair', emphasis, basisLabel, timingLabel }
  const under = pct < 0
  const word = v.kind === 'present' ? (under ? '低估' : '高估') : (under ? '情景偏低' : '情景偏高')
  const size = !under && ratio >= MULTIPLE_FROM ? `现价 ${ratio >= 1000 ? '>1000' : ratio.toFixed(1)}×基准` : `${Math.abs(pct).toFixed(1)}%`
  return { ...base, headline: `${word} ${size}`, positionLabel, tone: under ? 'under' : 'over', emphasis, basisLabel, timingLabel }
}
