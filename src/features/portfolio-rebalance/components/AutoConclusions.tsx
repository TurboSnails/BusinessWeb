import React from 'react'
import { buildConclusions } from '../conclusions'
import type { CompareSet, PriceIndex, RunInput } from '../types'

export function AutoConclusions({ comparison, index, input }: {
  comparison: CompareSet
  index: PriceIndex
  input: RunInput
}): JSX.Element {
  const conclusions = buildConclusions({ comparison, index, input })
  return (
    <section className="pr-section pr-conclusions" aria-labelledby="pr-conclusions-title">
      <h2 id="pr-conclusions-title">这次回测说明了什么</h2>
      <div className="pr-conclusions__body">
        {conclusions.map((text, position) => <p key={position}>{text}</p>)}
      </div>
    </section>
  )
}
