import React from 'react'
import { Link } from 'react-router-dom'
import { confidenceBadgeText, formatNum2 as mpFormatNum2 } from '../macro-posture/composite/labels'
import { useCompositePosture } from '../macro-posture/composite/load'
import { useMarketRadar } from '../market-radar/load'
import { formatNum2, heatLabel, tierLabel, visibleText } from './labels'
import type { CombinedStrategyFile } from './types'

/** 支柱分数：带正负号，一位或两位小数 */
function pillarScoreText(score: number): string {
  const abs = Math.abs(score)
  const decimals = Math.round(abs * 100) % 10 === 0 ? 1 : 2
  const body = abs.toFixed(decimals)
  if (score === 0) return '0.0'
  return `${score > 0 ? '+' : '−'}${body}`
}

export default function PositionPanel({ data }: { data: CombinedStrategyFile }): JSX.Element {
  const composite = useCompositePosture()
  const radar = useMarketRadar()
  const cell = data.current.cell

  const postureReady = composite.status === 'ready' ? composite.data : null
  const radarReady = radar.status === 'ready' ? radar.data : null

  const regime = postureReady?.current.regime
  const pillars = postureReady?.current.pillars
  const confidence = postureReady?.current.confidence
  const tactical = postureReady?.current.tactical

  const heat = data.current.heat
  const heatScore = data.current.heatScore
  const dims = radarReady?.current.dimensions ?? []
  const valuation = dims.find(d => d.id === 'valuation')
  const crowding = dims.find(d => d.id === 'crowding')
  const scored = (radarReady?.indicators ?? []).filter(
    ind => ind.inScore && (ind.dimension === 'valuation' || ind.dimension === 'crowding') && ind.score != null,
  )
  const deducting = scored.filter(ind => (ind.score as number) < 0).map(ind => ind.label)
  const adding = scored.filter(ind => (ind.score as number) > 0).map(ind => ind.label)

  return (
    <section className="cs-position" id="cs-position" aria-labelledby="cs-position-title">
      <h2 id="cs-position-title">现在处在什么位置</h2>

      {cell ? (
        <div className="cs-position__cell" data-testid="cs-position-cell">
          <h3 className="cs-position__name" data-testid="cs-position-name">{cell.name}</h3>
          <p className="cs-position__meaning" data-testid="cs-position-meaning">{visibleText(cell.meaning)}</p>
          <p className="cs-position__aside">
            <a href="#cs-matrix">九种状态之一，见下方</a>
          </p>
        </div>
      ) : null}

      <ul className="cs-position__rows" data-testid="cs-position-rows">
        <li className="cs-position__row" data-testid="cs-position-macro">
          <div className="cs-position__row-head">
            <strong>宏观周期</strong>
            <span className="cs-position__conclusion" data-testid="cs-position-macro-conclusion">
              {postureReady
                ? `${tierLabel(data.current.macroTier)} — 综合分 ${regime ? mpFormatNum2(regime.score) : '—'}`
                : '暂缺'}
            </span>
          </div>
          {postureReady && pillars ? (
            <>
              <ul className="cs-position__pillars" data-testid="cs-position-pillars">
                {pillars.map(p => (
                  <li key={p.id}>
                    {p.title} {p.score == null ? '—' : pillarScoreText(p.score)}：{visibleText(p.summary)}
                  </li>
                ))}
              </ul>
              {confidence ? (
                <p className="cs-position__conf" data-testid="cs-position-confidence">
                  {confidenceBadgeText(confidence)}
                  {confidence.notes.length > 0 ? `。${confidence.notes.join('；')}` : ''}
                </p>
              ) : null}
              <p className="cs-position__link">
                <Link to="/invest/macro-posture">看全部依据 →</Link>
              </p>
            </>
          ) : null}
        </li>

        <li className="cs-position__row" data-testid="cs-position-tactical">
          <div className="cs-position__row-head">
            <strong>价格趋势</strong>
            <span className="cs-position__conclusion" data-testid="cs-position-tactical-conclusion">
              {postureReady && tactical
                ? (tactical.below ? '低于均线，已下调一档' : '在均线上方，没有触发下调')
                : '暂缺'}
            </span>
          </div>
          {postureReady && tactical ? (
            <p className="cs-position__evidence" data-testid="cs-position-tactical-evidence">
              {visibleText(tactical.display)}
            </p>
          ) : null}
        </li>

        <li className="cs-position__row" data-testid="cs-position-heat">
          <div className="cs-position__row-head">
            <strong>股市冷热</strong>
            <span className="cs-position__conclusion" data-testid="cs-position-heat-conclusion">
              {radarReady
                ? `${heatLabel(heat)}${heatScore == null ? '' : ` ${visibleText(formatNum2(heatScore, { signed: true }))}`}`
                : '暂缺'}
            </span>
          </div>
          {radarReady ? (
            <>
              <p className="cs-position__evidence" data-testid="cs-position-heat-evidence">
                估值维度分 {valuation?.score == null ? '—' : visibleText(formatNum2(valuation.score, { signed: true }))}
                ，拥挤度维度分 {crowding?.score == null ? '—' : visibleText(formatNum2(crowding.score, { signed: true }))}
                {deducting.length > 0 ? `；扣分：${deducting.join('、')}` : ''}
                {adding.length > 0 ? `；加分：${adding.join('、')}` : ''}
                。
              </p>
              <p className="cs-muted">热度只看估值和拥挤度：≤ −0.5 偏热，≥ +0.5 偏冷。</p>
              <p className="cs-position__link">
                <Link to="/invest/market-radar">看全部指标 →</Link>
              </p>
            </>
          ) : null}
        </li>
      </ul>
    </section>
  )
}
