import React from 'react'
import { Link } from 'react-router-dom'
import {
  bandPosition, companyHref, fmtAmount, fmtEps, fmtPct, fmtPrice, MARKET_NAME, ratingTone, surpriseClass, TIME_LABEL, ZONE_LABEL,
  type EarningsItem, type ResearchSummary, type SourceStatus,
} from './model'

const CONFIRM_TEXT = (c: boolean | null): string => (c === true ? '日期已确认' : c === false ? '日期为预估' : '确认状态未知')

export function RatingBadge({ rating }: { rating: string | null | undefined }): JSX.Element {
  if (!rating) return <span className="ec-rating is-none">无站内评级</span>
  return <span className={`ec-rating is-${ratingTone(rating)}`}>{rating}</span>
}

export function SurpriseBadge({ item, pct }: { item: Pick<EarningsItem, 'market'>; pct: number | null | undefined }): JSX.Element {
  const text = pct == null ? '超预期幅度缺失' : pct > 0 ? `超预期 ${fmtPct(pct)}` : pct < 0 ? `低于预期 ${fmtPct(pct)}` : '符合预期'
  return <span className={surpriseClass(item.market, pct)}>{text}</span>
}

/** 情景带：悲观—乐观区间上标出现价，写明相对基准情景的幅度与价格日期 */
export function ScenarioBandView({ research }: { research: ResearchSummary }): JSX.Element | null {
  const b = research.scenarios
  if (!b) return null
  const pos = bandPosition(b)
  const baseAt = ((b.base - b.bear) / (b.bull - b.bear || 1)) * 100
  return (
    <div className="ec-band">
      <div className="ec-band__title">站内三情景（研究假设，非目标价）</div>
      <svg className="ec-band__bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect className="ec-band__track" x="0" y="3" width="100" height="4" rx="2" />
        <line className="ec-band__base" x1={baseAt} x2={baseAt} y1="1" y2="9" />
        {pos && <rect className="ec-band__marker" x={Math.min(98.5, Math.max(0, pos.position * 100 - 0.75))} y="0" width="1.5" height="10" />}
      </svg>
      <div className="ec-band__labels"><span>悲观 {fmtPrice(b.bear)}</span><span>基准 {fmtPrice(b.base)}</span><span>乐观 {fmtPrice(b.bull)}</span></div>
      <p className="ec-band__note">
        {pos
          ? <>价格锚点 {fmtPrice(b.price)}{b.priceDate ? `（${b.priceDate}）` : '（研究页价格，日期见研究页）'}：{ZONE_LABEL[pos.zone]}，距基准情景 {fmtPct(pos.vsBase)}</>
          : '价格锚点缺失，无法标出位置'}
      </p>
    </div>
  )
}

function Details({ item, sources }: { item: EarningsItem; sources: Record<string, SourceStatus> }): JSX.Element {
  const r = item.research
  const c = item.consensus
  const ccy = c?.currency ?? item.result?.currency ?? null
  return (
    <div className="ec-detail">
      <dl className="ec-kv">
        <div><dt>日期</dt><dd>{item.date} · {TIME_LABEL[item.time]} · {CONFIRM_TEXT(item.confirmed)}{item.appoint?.changes ? `（预约变更 ${item.appoint.changes} 次，首次预约 ${item.appoint.first ?? '缺失'}）` : ''}</dd></div>
        {item.note && <div><dt>说明</dt><dd>{item.note}</dd></div>}
        <div><dt>一致预期</dt><dd>{c ? <>EPS {fmtEps(c.eps, ccy)}（{c.analysts ?? '缺失'} 家）· 营收 {fmtAmount(c.revenue, ccy)}（{c.revenueAnalysts ?? '缺失'} 家）<small>{sources[c.source]?.label ?? c.source}，{c.asOf}{c.note ? `；${c.note}` : ''}</small></> : item.market === 'cn' ? 'A 股季报没有可用的一致预期；年报条目使用机构年度 EPS 预测' : '缺失'}</dd></div>
        {item.lastYear && <div><dt>去年同期</dt><dd>EPS {fmtEps(item.lastYear.eps, ccy)} · 营收 {fmtAmount(item.lastYear.revenue, ccy)}</dd></div>}
      </dl>
      {item.history.length > 0 && (
        <div className="ec-history">
          <div className="ec-sub">近 {item.history.length} 季 EPS 实际 vs 预期</div>
          <ul>
            {item.history.map(h => (
              <li key={h.date}>
                <span className="ec-history__date">{h.date}</span>
                <span>{fmtEps(h.epsActual, ccy)} / {fmtEps(h.epsEstimate, ccy)}</span>
                <SurpriseBadge item={item} pct={h.surprisePct} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {r?.scenarios && <ScenarioBandView research={r} />}
      <div className="ec-verify">
        <div className="ec-sub">这次要验证什么（站内研究{r?.asOf ? `，原研究日期 ${r.asOf}` : ''}）</div>
        {r && r.verify.length > 0 ? (
          <ul>{r.verify.map(t => <li key={t}>{t}</li>)}</ul>
        ) : <p className="ec-muted">研究页没有写后续验证项</p>}
        {r?.auto && <p className="ec-muted">程序化研究页：验证项为统一模板，需回到公司公告核对。</p>}
        {r?.risk && <p className="ec-risk"><span>风险首条：</span>{r.risk}</p>}
      </div>
      <p className="ec-source">日期来源：{sources[item.dateSource]?.label ?? item.dateSource}（抓取 {item.asOf}）{item.carried ? ' · 本次该源失败，沿用上次数据' : ''}</p>
    </div>
  )
}

/** 一家公司一次财报：日历格子里的紧凑卡片，展开看历史、情景与待验证项 */
export function EarningsCard({ item, inPool, sources, showDate = false }: { item: EarningsItem; inPool: boolean; sources: Record<string, SourceStatus>; showDate?: boolean }): JSX.Element {
  const c = item.consensus
  const res = item.result
  const ccy = c?.currency ?? res?.currency ?? null
  return (
    <article className={`ec-card${inPool ? ' is-pool' : ''}`} aria-label={`${item.name} 财报`}>
      <div className="ec-card__head">
        <Link to={companyHref(item)} className="ec-card__name">{item.name}</Link>
        <span className="ec-card__code">{item.code} · {MARKET_NAME[item.market]}</span>
      </div>
      <div className="ec-card__tags">
        {showDate && <span className="ec-tag">{item.date.slice(5)} {TIME_LABEL[item.time]}</span>}
        {item.period && <span className="ec-tag">{item.period}</span>}
        <span className={`ec-tag ${item.confirmed === true ? 'is-confirmed' : 'is-estimate'}`}>{item.confirmed === true ? '已确认' : item.confirmed === false ? '预估日期' : '确认未知'}</span>
        {inPool && <span className="ec-tag is-pool">候选池</span>}
        <RatingBadge rating={item.research?.rating} />
        {item.research?.lynch && <span className="ec-tag is-muted">{item.research.lynch}</span>}
      </div>
      {res ? (
        <p className="ec-card__nums">
          EPS {fmtEps(res.epsActual, ccy)}<span className="ec-muted"> vs 预期 {fmtEps(res.epsEstimate, ccy)}</span> <SurpriseBadge item={item} pct={res.surprisePct} />
          <br />营收 {fmtAmount(res.revenueActual, ccy)}<span className="ec-muted"> · 同比 {fmtPct(res.revenueYoY)}{res.netProfitYoY != null ? ` · 净利同比 ${fmtPct(res.netProfitYoY)}` : ''}</span>
        </p>
      ) : (
        <p className="ec-card__nums">
          EPS 预期 {fmtEps(c?.eps, ccy)}{c?.analysts != null && <span className="ec-muted">（{c.analysts} 家）</span>}
          <span className="ec-muted"> · 营收预期 {fmtAmount(c?.revenue, ccy)}</span>
        </p>
      )}
      <details className="ec-more">
        <summary>历史、情景与待验证</summary>
        <Details item={item} sources={sources} />
      </details>
    </article>
  )
}
