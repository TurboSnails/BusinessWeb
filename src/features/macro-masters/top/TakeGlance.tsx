import React from 'react'
import { ModeChip, PostureChip } from '../chips'
import type { MasterTake } from '../types'
import { countsBarText, leanCounts, postureLabel } from './consensus'

export default function TakeGlance({ take, temperature = false }: {
  take: MasterTake
  temperature?: boolean
}): JSX.Element {
  const counts = leanCounts(take)

  return (
    <div className="tm-glance__take">
      <div className="tm-glance__chips">
        <ModeChip mode={take.mode} />
        {take.mode === 'rule' && take.posture && (
          <PostureChip posture={take.posture} prefix="按他的规则：" />
        )}
      </div>
      {take.mode === 'rule' ? (
        <p className="tm-glance__posture">档位：{postureLabel(take.posture)}</p>
      ) : (
        <p className="tm-glance__counts" aria-label="读数计数">
          {countsBarText(counts, temperature)}
          {counts.unknown > 0 ? ` · 缺数据 ${counts.unknown}` : ''}
        </p>
      )}
      <p className="tm-glance__headline">{take.headline}</p>
    </div>
  )
}
