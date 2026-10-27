import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { scrubMissing } from './scrubMissing'

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>)

describe('scrubMissing', () => {
  it('replaces the placeholder in plain strings and nested elements', () => {
    expect(html(scrubMissing('[MISSING]'))).toBe('未取得')
    expect(html(scrubMissing(<span className="rn-nowrap">{'基准'}{'（[MISSING]（未赋概率））'}</span>)))
      .toBe('<span class="rn-nowrap">基准（未取得（未赋概率））</span>')
    expect(html(scrubMissing(<td><strong>[MISSING]</strong> 与 <em>x</em></td>))).toBe('<td><strong>未取得</strong> 与 <em>x</em></td>')
  })
  it('leaves other nodes untouched', () => {
    expect(scrubMissing(null)).toBeNull()
    expect(scrubMissing(12)).toBe(12)
    expect(html(scrubMissing(<b>PE 5.5×</b>))).toBe('<b>PE 5.5×</b>')
  })
})
