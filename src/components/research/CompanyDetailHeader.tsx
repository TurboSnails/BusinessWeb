import React, { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { Company, Market } from '../../data/companies'
import type { CompanyValuation } from '../../features/company-valuation/model'
import CandidateButton from '../CandidateButton'
import {
  priceLabelAlign,
  resolveHeaderScenarioBundle,
  scenarioExtent,
  type ParsedScenario,
  type PriceLabelAlign,
  type ScenarioTriple,
} from './scenarioPrices'

export type CompanyDetailMetaDates = {
  priceDate?: string
  checkedAt?: string
  scenarioAsOf?: string
  researchAsOf?: string
  priceAgeDays?: number
  priceAgeStale?: boolean
}

export type CompanyDetailHeaderProps = {
  market: Market
  name: string
  code: string
  sector: string
  batch: string
  region?: string
  theme?: string
  rating: string
  price?: number
  currency?: string
  scenarios?: { name: string; price: string }[] | null
  scenRows?: [string, string, string, string][] | null
  valuation?: CompanyValuation
  marketRefresh?: Company['marketRefresh']
  isCandidate: boolean
  onToggleCandidate: () => void
  candidateLink?: React.ReactNode
  valuationHref: string
  dcfHref: string
  notesHref: string
  earningsBadge?: React.ReactNode
  ratingTone?: string
  back: React.ReactNode
  metaDates?: CompanyDetailMetaDates
}

function fmtNum(n: number | undefined): string {
  if (n === undefined) return '未取得'
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function displayOf(parsed: ParsedScenario | undefined, fallback?: string): string {
  if (!parsed) return fallback ?? '未取得'
  return parsed.display || fallback || '未取得'
}

type Mark = {
  key: string
  label: string
  display: string
  parsed: ParsedScenario
  low?: number
  high?: number
}

function ScenarioBar({
  title,
  price,
  triple,
  currency,
  source,
  baseValue,
}: {
  title: string
  price?: number
  triple: ScenarioTriple
  currency?: string
  source: string
  baseValue?: number
}): JSX.Element {
  const railRef = useRef<HTMLDivElement>(null)

  const marks: Mark[] = [
    { key: 'bear', label: triple.bear?.label || '悲观', display: displayOf(triple.bear?.parsed, triple.bear?.display), parsed: triple.bear?.parsed ?? { kind: 'none', display: '未取得' } },
    { key: 'base', label: triple.base?.label || '基准', display: displayOf(triple.base?.parsed, triple.base?.display), parsed: triple.base?.parsed ?? { kind: 'none', display: '未取得' } },
    { key: 'bull', label: triple.bull?.label || '乐观', display: displayOf(triple.bull?.parsed, triple.bull?.display), parsed: triple.bull?.parsed ?? { kind: 'none', display: '未取得' } },
  ].map(m => {
    const ext = scenarioExtent(m.parsed)
    return ext ? { ...m, low: ext.low, high: ext.high } : m
  })

  const drawable = marks.filter((m): m is Mark & { low: number; high: number } => m.low !== undefined && m.high !== undefined)
  const vals = drawable.flatMap(d => [d.low, d.high])
  const minV = vals.length ? Math.min(...vals) : undefined
  const maxV = vals.length ? Math.max(...vals) : undefined
  const span = minV !== undefined && maxV !== undefined ? (maxV - minV || 1) : 1

  const pctOf = (v: number): number => {
    if (minV === undefined) return 0
    return ((v - minV) / span) * 100
  }

  let priceNote: string | undefined
  let priceLeft: string | undefined
  let priceAlign: PriceLabelAlign = 'center'
  if (price !== undefined && minV !== undefined && maxV !== undefined) {
    if (price < minV) {
      priceLeft = 'calc(0% - 12px)'
      priceNote = '低于悲观价'
      priceAlign = 'start'
    } else if (price > maxV) {
      priceLeft = 'calc(100% + 12px)'
      priceNote = '高于乐观价'
      priceAlign = 'end'
    } else {
      const pct = pctOf(price)
      priceLeft = `${pct}%`
      priceAlign = priceLabelAlign(pct)
    }
  }

  useLayoutEffect(() => {
    const el = railRef.current
    if (!el) return
    const set = (name: string, value: string | undefined) => {
      if (value === undefined) el.style.removeProperty(name)
      else el.style.setProperty(name, value)
    }
    for (const m of drawable) {
      if (m.parsed.kind === 'range') {
        const left = pctOf(m.low)
        set(`--seg-${m.key}-left`, `${left}%`)
        set(`--seg-${m.key}-width`, `${Math.max(pctOf(m.high) - left, 0.5)}%`)
        set(`--tick-${m.key}`, undefined)
      } else {
        set(`--tick-${m.key}`, `${pctOf(m.low)}%`)
        set(`--seg-${m.key}-left`, undefined)
        set(`--seg-${m.key}-width`, undefined)
      }
    }
    set('--price-left', priceLeft)
  })

  const positionText = priceNote
    || (price !== undefined && baseValue !== undefined
      ? (price > baseValue ? '高于基准' : price < baseValue ? '低于基准' : '接近基准')
      : '位置未知')

  const aria = [
    `现价 ${price !== undefined ? fmtNum(price) : '未取得'}${currency ? ` ${currency}` : ''}`,
    ...marks.map(m => `${m.label} ${m.display}`),
    `现价${positionText}`,
    `来源 ${source}`,
  ].join('；')

  return (
    <div
      className="cd-scenarios"
      role="img"
      aria-label={aria}
      data-source={source}
      data-base={baseValue !== undefined ? String(baseValue) : undefined}
    >
      <p className="cd-scenarios__title">
        {title}
        <span className="cd-scenarios__disc"> · 模型假设，不是目标价</span>
      </p>

      {drawable.length === 0 ? (
        <p className="cd-scenarios__empty">无可绘制数值，不绘制刻度；下方原文照显。</p>
      ) : (
        <div className="cd-scenarios__rail-wrap" ref={railRef}>
          {price !== undefined && priceLeft !== undefined && (
            <div className="cd-scenarios__price" data-align={priceAlign}>
              <span className="cd-scenarios__price-lab">现价 {fmtNum(price)}</span>
              <span className="cd-scenarios__price-dot" />
            </div>
          )}
          <div className="cd-scenarios__rail">
            {drawable.map(m => (
              m.parsed.kind === 'range' ? (
                <span key={m.key} className={`cd-scenarios__seg cd-scenarios__seg--${m.key}`} />
              ) : (
                <span key={m.key} className={`cd-scenarios__tick cd-scenarios__tick--${m.key}`} />
              )
            ))}
          </div>
        </div>
      )}

      {priceNote && (
        <p className="cd-scenarios__outside">现价 {fmtNum(price)} {priceNote}。</p>
      )}

      <ul className="cd-scenarios__grid">
        {marks.map(m => (
          <li key={m.key} className={`cd-scenarios__cell cd-scenarios__cell--${m.key}`}>
            <span className="cd-scenarios__name">{m.label}</span>
            <strong className="cd-scenarios__amt cd-num">{m.display}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

function dateOnly(v?: string): string | undefined {
  if (!v) return undefined
  const m = v.match(/\d{4}-\d{2}-\d{2}/)
  return m?.[0]
}

function MetaLine({ meta }: { meta?: CompanyDetailMetaDates }): JSX.Element | null {
  if (!meta) return null
  const parts: string[] = []
  const priceDate = dateOnly(meta.priceDate)
  const checked = dateOnly(meta.checkedAt)
  const scenarioAsOf = dateOnly(meta.scenarioAsOf)
  const researchAsOf = dateOnly(meta.researchAsOf)
  if (priceDate) parts.push(`行情日期 ${priceDate}`)
  if (checked) parts.push(`核验日期 ${checked}`)
  if (scenarioAsOf) parts.push(`情景依据日期 ${scenarioAsOf}`)
  if (meta.priceAgeDays !== undefined) {
    const age = meta.priceAgeDays === 0 ? '今天' : `${meta.priceAgeDays} 天前`
    parts.push(`价格锚点距今 ${age}`)
  }
  if (researchAsOf) parts.push(`原研究日期 ${researchAsOf}`)
  if (!parts.length) return null
  return (
    <p className={meta.priceAgeStale ? 'cd-meta-line is-stale' : 'cd-meta-line'} role="status">
      {parts.join(' · ')}
      {meta.priceAgeStale ? ' · 盈亏比与买入价按这个价格算，重新取价后再用' : ''}
    </p>
  )
}

export default function CompanyDetailHeader(props: CompanyDetailHeaderProps): JSX.Element {
  const {
    market, name, code, sector, batch, region, theme, rating,
    price, currency, scenarios, scenRows, valuation, marketRefresh,
    isCandidate, onToggleCandidate, candidateLink,
    valuationHref, dcfHref, notesHref, earningsBadge, ratingTone,
    back, metaDates,
  } = props

  const marketLabel = market === 'us' ? '标普500' : market === 'hk' ? '港股' : market === 'adr' ? '美股非标普' : market === 'ndx' ? '纳指100' : '沪深'
  const bundle = resolveHeaderScenarioBundle({
    valuation,
    marketRefresh,
    price,
    currency,
    scenarios,
    scenRows,
    researchAsOf: metaDates?.researchAsOf || metaDates?.scenarioAsOf,
  })

  return (
    <header className="cd-hero">
      <div className="cd-hero__nav">{back}</div>
      <h1 className="cd-hero__title rn-hero-title">{name}</h1>
      <p className="cd-hero__meta rn-hero-meta">
        {marketLabel} · {code} · {sector}{region ? ` · ${region}` : ''}{theme ? ` · ${theme}` : ''} · {batch}
      </p>

      <div className="cd-price-row">
        <div className="cd-price-row__main">
          <span className="cd-price-row__label">现价</span>
          <strong className="cd-price-row__value cd-num">
            {price !== undefined ? fmtNum(price) : '未取得'}
            {currency ? <span className="cd-price-row__ccy"> {currency}</span> : null}
          </strong>
        </div>
        <span className="rn-rating cd-rating" data-tone={ratingTone || 'gray'}>{rating}</span>
        <span
          className="cd-premium"
          data-base={bundle.baseValue !== undefined ? String(bundle.baseValue) : undefined}
          data-source={bundle.source}
          title="现价相对本卡同一套基准情景价"
        >
          {bundle.premiumLabel}
        </span>
      </div>

      <MetaLine meta={metaDates} />

      <ScenarioBar
        title={bundle.title}
        price={bundle.price}
        triple={bundle.triple}
        currency={bundle.currency}
        source={bundle.source}
        baseValue={bundle.baseValue}
      />

      {earningsBadge && <div className="cd-earnings">{earningsBadge}</div>}

      <div className="cd-actions">
        {candidateLink ?? (
          <span className="cd-actions__primary">
            <CandidateButton on={isCandidate} onClick={onToggleCandidate} />
          </span>
        )}
        <Link to={valuationHref} className="tool-btn">建立估值模型</Link>
        <Link to={dcfHref} className="tool-btn">进入 DCF 估值</Link>
        <Link to={notesHref} className="tool-btn">研究笔记</Link>
      </div>
    </header>
  )
}
