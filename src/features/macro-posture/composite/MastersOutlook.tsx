import React from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../../components/ui'
import { MASTERS } from '../../macro-masters/masters'
import { buildCycleView } from '../../macro-masters/cycleView'
import { useReadings } from '../../macro-masters/readings'
import type { Lean, MasterTake } from '../../macro-masters/types'
import { alignMaster } from './labels'
import type { TierId } from './types'

function alignTone(kind: ReturnType<typeof alignMaster>): 'accent' | 'warm' | 'muted' | 'neutral' {
  if (kind === '同向') return 'accent'
  if (kind === '反向') return 'warm'
  if (kind === '只能逐项对照') return 'neutral'
  return 'muted'
}

function leanCounts(take: MasterTake): { caution: number; neutral: number; support: number } {
  let caution = 0
  let neutral = 0
  let support = 0
  for (const item of take.items) {
    const lean: Lean = item.lean
    if (lean === 'caution') caution += 1
    else if (lean === 'support') support += 1
    else if (lean === 'neutral') neutral += 1
  }
  return { caution, neutral, support }
}

function buildSummary(takes: MasterTake[], siteTier: TierId | null): string {
  const total = takes.length
  const rules = takes.filter(t => t.mode === 'rule')
  let same = 0
  let opposite = 0
  for (const take of rules) {
    const kind = alignMaster(siteTier, take)
    if (kind === '同向') same += 1
    if (kind === '反向') opposite += 1
  }
  const checklist = takes.filter(t => t.mode !== 'rule')
  let cautionItems = 0
  let supportItems = 0
  for (const take of checklist) {
    for (const item of take.items) {
      if (item.lean === 'caution') cautionItems += 1
      if (item.lean === 'support') supportItems += 1
    }
  }
  let checklistTone = '偏谨慎居多'
  if (supportItems > cautionItems) checklistTone = '偏积极居多'
  else if (supportItems === cautionItems) checklistTone = '谨慎与积极大致相当'

  return `${total} 位里：规则明确的 ${rules.length} 位中 ${same} 位与本站同向、${opposite} 位反向；其余只能逐项对照，其中${checklistTone}。`
}

export default function MastersOutlook({ siteTier }: { siteTier: TierId | null }): JSX.Element {
  const readings = useReadings()

  return (
    <section className="mp-masters" id="mp-masters" aria-labelledby="mp-masters-title">
      <div className="mp-masters__head">
        <h2 id="mp-masters-title">大师怎么看</h2>
        <Link to="/invest/macro-masters">打开宏观大师</Link>
      </div>

      {readings.state === 'loading' && (
        <p className="mp-status" role="status">大师读数加载中…</p>
      )}
      {readings.state === 'error' && (
        <p className="mp-partial" role="status">
          大师读数暂时不可用，不影响上方综合结论。可稍后再看，或直接打开宏观大师页。
        </p>
      )}
      {readings.state === 'ok' && (() => {
        const view = buildCycleView(readings.readings)
        const bySlug = new Map(MASTERS.map(m => [m.slug, m]))
        const summary = buildSummary(view.masters, siteTier)
        return (
          <>
            <p className="mp-masters__summary" data-testid="mp-masters-summary">{summary}</p>
            <ul className="mp-masters__list">
              {view.masters.map(take => {
                const master = bySlug.get(take.slug)
                const align = alignMaster(siteTier, take)
                const counts = leanCounts(take)
                const showCounts = take.mode !== 'rule'
                return (
                  <li key={take.slug} className="mp-masters__row">
                    <div className="mp-masters__name">
                      <Link to={`/invest/macro-masters/${take.slug}`}>{master?.name ?? take.slug}</Link>
                      <Badge tone={alignTone(align)}>{align}</Badge>
                    </div>
                    <p className="mp-masters__headline">{take.headline}</p>
                    {showCounts ? (
                      <p className="mp-masters__leans" data-testid={`mp-masters-leans-${take.slug}`}>
                        谨慎 {counts.caution} · 中性 {counts.neutral} · 积极 {counts.support}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </>
        )
      })()}
    </section>
  )
}
