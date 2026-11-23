import React, { useId, useState } from 'react'
import { Badge } from '../../../components/ui'
import { formatContributionSum, formatNum2, scoreBadge, toneClass } from './labels'
import type { ComponentState, Pillar } from './types'

const SCORE_MIN = -2
const SCORE_MAX = 1
const SCORE_SPAN = SCORE_MAX - SCORE_MIN
const NEAR_THRESHOLD_TIP = '读数离阈值很近，数据修订或四舍五入就可能翻档'

function scoreToPct(score: number): number {
  return ((score - SCORE_MIN) / SCORE_SPAN) * 100
}

function ScoreBar({ score }: { score: number | null }): JSX.Element {
  const W = 300
  const H = 18
  const trackY = 4
  const trackH = 10
  const zeroX = (scoreToPct(0) / 100) * W
  const valueX = score == null ? null : (scoreToPct(score) / 100) * W
  const fillX = valueX == null ? 0 : Math.min(valueX, zeroX)
  const fillW = valueX == null ? 0 : Math.abs(valueX - zeroX)
  return (
    <div
      className="mp-scorebar"
      role="img"
      aria-label={score == null ? '支柱分暂无' : `支柱分 ${formatNum2(score, { signed: true })}，刻度负二到正一`}
    >
      <div className="mp-scorebar__frame">
        <svg className="mp-scorebar__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <rect className="mp-scorebar__track" x={0} y={trackY} width={W} height={trackH} rx={5} />
          <line className="mp-scorebar__baseline" x1={zeroX} x2={zeroX} y1={1} y2={H - 1} />
          {valueX != null && (
            <rect className="mp-scorebar__fill" x={fillX} y={trackY} width={Math.max(fillW, 1)} height={trackH} rx={5} />
          )}
          {valueX != null && (
            <circle className="mp-scorebar__thumb" cx={valueX} cy={trackY + trackH / 2} r={5} />
          )}
        </svg>
        <div className="mp-scorebar__ticks" aria-hidden="true">
          <span className="mp-scorebar__tick mp-scorebar__tick--min">−2</span>
          <span className="mp-scorebar__tick mp-scorebar__tick--zero">0</span>
          <span className="mp-scorebar__tick mp-scorebar__tick--max">+1</span>
        </div>
      </div>
    </div>
  )
}

function PillarSparkline({ history }: { history: Pillar['history'] }): JSX.Element | null {
  const labelId = useId()
  const liveId = useId()
  const pts = history.filter(([, v]) => v != null) as [string, number][]
  const [index, setIndex] = useState(() => Math.max(0, pts.length - 1))
  if (pts.length < 2) return null
  const W = 300
  const H = 48
  const PAD = 4
  const values = pts.map(([, v]) => v)
  const loScale = Math.min(SCORE_MIN, ...values)
  const hiScale = Math.max(SCORE_MAX, ...values)
  const span = hiScale - loScale || 1
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + (1 - (v - loScale) / span) * (H - PAD * 2)
  const zeroY = y(0)
  const safeIndex = Math.min(index, pts.length - 1)
  const shown = pts[safeIndex]
  const last = pts[pts.length - 1]
  const hiVal = Math.max(...values)
  const loVal = Math.min(...values)
  const d = pts.map(([, v], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')

  const pickFromClientX = (clientX: number, target: SVGSVGElement): void => {
    const box = target.getBoundingClientRect()
    const rel = ((clientX - box.left) / box.width) * W
    const t = Math.max(0, Math.min(1, (rel - PAD) / (W - PAD * 2)))
    setIndex(Math.round(t * (pts.length - 1)))
  }

  return (
    <div className="mp-spark-wrap">
      <svg
        className="mp-spark"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={labelId}
        aria-describedby={liveId}
        tabIndex={0}
        onPointerMove={e => pickFromClientX(e.clientX, e.currentTarget)}
        onPointerDown={e => pickFromClientX(e.clientX, e.currentTarget)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            setIndex(i => Math.max(0, i - 1))
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            setIndex(i => Math.min(pts.length - 1, i + 1))
          }
        }}
      >
        <title id={labelId}>近六十个月支柱分走势，可用方向键逐月查看</title>
        <line className="mp-spark__zero" x1={PAD} x2={W - PAD} y1={zeroY} y2={zeroY} />
        <path className="mp-spark__line" d={d} />
        <circle className="mp-spark__dot" cx={x(pts.length - 1)} cy={y(last[1])} r={3.5} />
        <circle className="mp-spark__cursor" cx={x(safeIndex)} cy={y(shown[1])} r={3} />
      </svg>
      <p id={liveId} className="mp-spark__live" aria-live="polite">
        {shown[0]}
        {' · '}
        {formatNum2(shown[1], { signed: true })}
      </p>
      <p className="mp-spark__stats" data-testid="mp-spark-stats">
        近 5 年最高 {formatNum2(hiVal, { signed: true })}
        {' · 最低 '}
        {formatNum2(loVal, { signed: true })}
        {' · 当前 '}
        {formatNum2(last[1], { signed: true })}
      </p>
    </div>
  )
}

function sourceLink(source: string): { href: string; label: string } | null {
  const match = source.match(/https?:\/\/[^\s·）)\]]+/i)
  if (!match) return null
  const href = match[0].replace(/[.,;:]+$/, '')
  try {
    const host = new URL(href).hostname.replace(/^www\./, '')
    if (/fred\.stlouisfed\.org/i.test(host)) return { href, label: 'FRED' }
    return { href, label: host }
  } catch {
    return null
  }
}

function ComponentRow({ item }: { item: ComponentState }): JSX.Element {
  const link = item.source ? sourceLink(item.source) : null
  return (
    <li className="mp-component">
      <div className="mp-component__main">
        <span className="mp-component__name">{item.label}</span>
        <span className="mp-component__display">{item.display}</span>
        <Badge tone={item.score == null ? 'muted' : item.score > 0 ? 'down' : item.score < 0 ? 'warm' : 'neutral'}>
          {scoreBadge(item.score)}
        </Badge>
        {item.nearThreshold ? (
          <Badge tone="warm">
            <span title={NEAR_THRESHOLD_TIP} data-testid="mp-near-threshold">临界</span>
          </Badge>
        ) : null}
        {item.stale ? <Badge tone="warm">已过期</Badge> : null}
      </div>
      {item.nearThreshold ? (
        <p className="mp-component__near" data-testid="mp-near-threshold-note">{NEAR_THRESHOLD_TIP}</p>
      ) : null}
      <p className="mp-component__rule">{item.rule}</p>
      <p className="mp-component__meta">
        {item.masters.length ? `对应：${item.masters.join('、')}` : null}
        {link ? (
          <>
            {item.masters.length ? ' · ' : null}
            <a className="mp-source" href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
          </>
        ) : null}
      </p>
    </li>
  )
}

function PillarCard({ pillar }: { pillar: Pillar }): JSX.Element {
  const weightPct = `${(pillar.weight * 100).toFixed(0)}%`
  const contribution = pillar.contribution
  return (
    <article className="mp-pillar" aria-labelledby={`mp-pillar-${pillar.id}`}>
      <div className="mp-pillar__head">
        <h3 id={`mp-pillar-${pillar.id}`}>{pillar.title}</h3>
        <span className="mp-pillar__weight">权重 {weightPct}</span>
      </div>
      <p className={`mp-pillar__score ${toneClass(pillar.tone)}`}>
        {pillar.score == null ? '暂无分数' : formatNum2(pillar.score, { signed: true })}
      </p>
      {contribution != null && Number.isFinite(contribution) ? (
        <p className="mp-pillar__contribution" data-testid="mp-pillar-contribution">
          对综合分贡献 {formatNum2(contribution, { signed: true })}
        </p>
      ) : null}
      <ScoreBar score={pillar.score} />
      <p className="mp-pillar__summary">{pillar.summary}</p>
      <PillarSparkline history={pillar.history} />
      <details className="mp-pillar__details">
        <summary>组件明细（{pillar.components.length}）</summary>
        <ul className="mp-component-list">
          {pillar.components.map(item => <ComponentRow key={item.id} item={item} />)}
        </ul>
      </details>
    </article>
  )
}

export default function PillarsSection({ pillars }: { pillars: Pillar[] }): JSX.Element {
  const sumLine = formatContributionSum(pillars.map(p => p.contribution))
  return (
    <section className="mp-pillars" id="mp-pillars" aria-labelledby="mp-pillars-title">
      <h2 id="mp-pillars-title">四根支柱</h2>
      {sumLine ? (
        <p className="mp-pillars__sum" data-testid="mp-contribution-sum">
          综合分 = 各支柱贡献之和：
          {sumLine}
        </p>
      ) : null}
      <div className="mp-pillars__grid">
        {pillars.map(pillar => <PillarCard key={pillar.id} pillar={pillar} />)}
      </div>
    </section>
  )
}
