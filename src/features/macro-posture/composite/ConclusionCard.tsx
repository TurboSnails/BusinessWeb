import React, { useId, useState } from 'react'
import { Badge } from '../../../components/ui'
import {
  confidenceBadgeText,
  DRIVER_LABEL,
  TIER_ORDER_DEFENSE_LEFT,
  formatNum2,
  formatSharePct,
} from './labels'
import type { CompositeFile, TierId } from './types'

const EQUITY_CAP_KEY = 'mp-equity-cap'

function readEquityCap(): number {
  try {
    const raw = localStorage.getItem(EQUITY_CAP_KEY)
    if (raw == null) return 100
    const n = Number(raw)
    if (!Number.isFinite(n)) return 100
    return Math.min(100, Math.max(0, n))
  } catch {
    return 100
  }
}

function writeEquityCap(value: number): void {
  try {
    localStorage.setItem(EQUITY_CAP_KEY, String(value))
  } catch {
    /* ignore quota / private mode */
  }
}

function confidenceTone(level: 'high' | 'medium' | 'low'): 'accent' | 'neutral' | 'warm' {
  if (level === 'high') return 'accent'
  if (level === 'medium') return 'neutral'
  return 'warm'
}

function tierLabel(tiers: CompositeFile['tiers'], id: TierId | null | undefined): string {
  if (!id) return '证据不足'
  return tiers.find(t => t.id === id)?.label ?? '—'
}

function TierStrip({
  tiers,
  current,
}: {
  tiers: CompositeFile['tiers']
  current: TierId | null
}): JSX.Element {
  const byId = new Map(tiers.map(t => [t.id, t]))
  const ordered = TIER_ORDER_DEFENSE_LEFT.map(id => byId.get(id)).filter(Boolean) as CompositeFile['tiers']

  return (
    <ol className="mp-tier-strip" aria-label="风险档位，防守在左、进攻在右">
      {ordered.map(tier => {
        const active = tier.id === current
        return (
          <li
            key={tier.id}
            className={`mp-tier-strip__seg mp-tier-strip__seg--${tier.id}${active ? ' is-active' : ''}`}
            aria-current={active ? 'true' : undefined}
          >
            <span className="mp-tier-strip__label">{tier.label}</span>
            {active ? <span className="visually-hidden">（当前）</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

function EquityCapInput({ equityShare }: { equityShare: number | null }): JSX.Element {
  const id = useId()
  const [cap, setCap] = useState(readEquityCap)
  const [draft, setDraft] = useState(() => String(readEquityCap()))
  const implied = equityShare == null || !Number.isFinite(equityShare)
    ? null
    : Math.round(cap * equityShare)

  return (
    <div className="mp-equity-cap" data-testid="mp-equity-cap">
      <label htmlFor={id} className="mp-equity-cap__label">
        你的股票仓位上限
      </label>
      <span className="mp-equity-cap__field">
        <input
          id={id}
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          value={draft}
          aria-describedby={`${id}-hint`}
          onChange={e => {
            const raw = e.target.value
            setDraft(raw)
            if (raw.trim() === '') return
            const next = Number(raw)
            if (!Number.isFinite(next)) return
            const clamped = Math.min(100, Math.max(0, next))
            setCap(clamped)
            writeEquityCap(clamped)
          }}
          onBlur={() => {
            setDraft(String(cap))
          }}
        />
        <span aria-hidden="true">%</span>
      </span>
      <p id={`${id}-hint`} className="mp-equity-cap__hint" data-testid="mp-equity-cap-implied">
        {implied == null ? '暂不换算仓位' : `现在约 ${implied}%`}
      </p>
    </div>
  )
}

function SnapshotPanels({ data }: { data: CompositeFile }): JSX.Element {
  const { current, tiers } = data
  const regimeTier = tierLabel(tiers, current.regime.tier)
  const rScore = current.regime.score
  const warnings = current.warnings
  const mtd = current.tactical?.mtd
  const tacticalDistance = current.distance?.tactical
  const pillarScores = current.pillars
    .map(p => `${p.title} ${formatNum2(p.score, { signed: true })}`)
    .join(' · ')

  return (
    <div className="mp-snapshot" data-testid="mp-snapshot">
      <article className="mp-snapshot__panel" aria-labelledby="mp-snap-macro">
        <h3 id="mp-snap-macro">宏观底子</h3>
        <p className="mp-snapshot__main" data-testid="mp-snap-regime">
          周期档位 {regimeTier}
          {rScore != null && Number.isFinite(rScore) ? (
            <>
              {' · 综合分 '}
              <strong>{formatNum2(rScore, { signed: true })}</strong>
            </>
          ) : null}
        </p>
        {pillarScores ? (
          <p className="mp-snapshot__pillars" data-testid="mp-snap-pillar-scores">{pillarScores}</p>
        ) : null}
      </article>
      <article className="mp-snapshot__panel" aria-labelledby="mp-snap-tactical">
        <h3 id="mp-snap-tactical">短线压力</h3>
        {tacticalDistance ? (
          <p className="mp-snapshot__main" data-testid="mp-snap-tactical-distance">{tacticalDistance}</p>
        ) : null}
        {warnings ? (
          <p className="mp-snapshot__main" data-testid="mp-snap-warnings">
            预警亮灯 {warnings.on}/{warnings.total}
            {warnings.names?.length ? `：${warnings.names.join('、')}` : ''}
          </p>
        ) : null}
        {mtd?.display && !tacticalDistance ? (
          <p className="mp-snapshot__mtd" data-testid="mp-snap-mtd">{mtd.display}</p>
        ) : null}
        {!tacticalDistance && !warnings && !mtd?.display ? (
          <p className="mp-snapshot__main mp-muted">暂无短线压力读数</p>
        ) : null}
      </article>
    </div>
  )
}

function DataDates({
  dates,
  asOf,
  generatedAt,
}: {
  dates: CompositeFile['current']['dates'] | undefined
  asOf: string
  generatedAt?: string
}): JSX.Element {
  const rows = Array.isArray(dates) ? dates : []
  return (
    <div className="mp-conclusion__meta" data-testid="mp-data-dates">
      {rows.length > 0 ? (
        <ul className="mp-conclusion__dates">
          {rows.map(row => (
            <li key={`${row.label}-${row.date}`}>
              {row.label}
              {' '}
              {row.date}
            </li>
          ))}
        </ul>
      ) : (
        <p>数据截至 {asOf}</p>
      )}
      {generatedAt ? (
        <p className="mp-conclusion__generated">
          生成于 {generatedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}
        </p>
      ) : null}
    </div>
  )
}

export default function ConclusionCard({ data }: { data: CompositeFile }): JSX.Element {
  const { current, tiers, generatedAt } = data
  const tier = current.final.tier
  const tierMeta = tier ? tiers.find(t => t.id === tier) : undefined
  const share = formatSharePct(current.final.equityShare)
  const insufficient = tier == null
  const missingNotes = current.confidence.notes.length
    ? current.confidence.notes
    : current.pillars.filter(p => p.score == null).map(p => `${p.title}缺可用组件`)
  const driverLabel = DRIVER_LABEL[current.driver] ?? current.driver

  return (
    <section className="mp-conclusion" id="mp-conclusion" aria-labelledby="mp-conclusion-title">
      <header className="mp-conclusion__head">
        <h2 id="mp-conclusion-title" className="visually-hidden">结论</h2>
        <TierStrip tiers={tiers} current={tier} />
        {insufficient ? (
          <p className="mp-conclusion__tier-name" data-testid="mp-tier-name">证据不足</p>
        ) : (
          <p className="mp-conclusion__tier-name" data-testid="mp-tier-name">{tierMeta?.label ?? '—'}</p>
        )}
        {share ? (
          <p className="mp-conclusion__share" data-testid="mp-share">
            股票仓位约为你自设上限的 {share}
          </p>
        ) : (
          <p className="mp-conclusion__share mp-conclusion__share--muted">暂不给出仓位建议</p>
        )}
        <EquityCapInput equityShare={current.final.equityShare} />
        {tierMeta?.actions?.length ? (
          <div className="mp-tier-actions" data-testid="mp-tier-actions">
            <h3>这一档怎么配</h3>
            <ul>
              {tierMeta.actions.map(action => <li key={action}>{action}</li>)}
            </ul>
            <p>只是组合结构倾向，不是个股建议。</p>
          </div>
        ) : null}
        <div className="mp-conclusion__badges" data-testid="mp-confidence">
          <Badge tone={confidenceTone(current.confidence.level)}>
            {confidenceBadgeText(current.confidence)}
          </Badge>
          <Badge tone="muted">驱动：{driverLabel}</Badge>
        </div>
        {current.confidence.notes.length > 0 && (
          <p className="mp-conclusion__conf-notes" data-testid="mp-confidence-notes">
            {current.confidence.notes.join('；')}
          </p>
        )}
      </header>

      <p className="mp-conclusion__headline">{current.headline}</p>
      <SnapshotPanels data={data} />
      {insufficient && missingNotes.length > 0 && (
        <div className="mp-conclusion__missing" role="status" data-testid="mp-insufficient">
          <p>证据不足，缺这些：</p>
          <ul>
            {missingNotes.map(note => <li key={note}>{note}</li>)}
          </ul>
        </div>
      )}
      <ul className="mp-conclusion__reasons">
        {current.reasons.map(reason => <li key={reason}>{reason}</li>)}
      </ul>

      <DataDates dates={current.dates} asOf={current.asOf} generatedAt={generatedAt} />

      <aside className="mp-distance" aria-labelledby="mp-distance-title">
        <h3 id="mp-distance-title">距离改判</h3>
        {current.distance.tactical ? (
          <p data-testid="mp-distance-tactical">{current.distance.tactical}</p>
        ) : null}
        {current.distance.up ? (
          <p data-testid="mp-distance-up">升一档：{current.distance.up.text}</p>
        ) : (
          <p className="mp-muted">升一档：暂无</p>
        )}
        {current.distance.down ? (
          <p data-testid="mp-distance-down">降一档：{current.distance.down.text}</p>
        ) : (
          <p className="mp-muted">降一档：暂无</p>
        )}
        {current.distance.nearest.length > 0 && (
          <ul className="mp-distance__nearest" data-testid="mp-distance-nearest">
            {current.distance.nearest.slice(0, 3).map(item => (
              <li key={item.componentId}>{item.text}</li>
            ))}
          </ul>
        )}
      </aside>
    </section>
  )
}
