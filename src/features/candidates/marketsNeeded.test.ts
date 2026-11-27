import { describe, expect, it } from 'vitest'
import { marketsForTab } from './marketsNeeded'

describe('marketsForTab', () => {
  it('空候选不请求任何市场', () => {
    expect(marketsForTab('mine', [])).toEqual([])
  })

  it('我的候选只返回池内出现的市场，顺序稳定', () => {
    expect(marketsForTab('mine', [
      { market: 'cn' },
      { market: 'us' },
      { market: 'cn' },
    ])).toEqual(['us', 'cn'])
  })

  it('研究筛出只拉区分标普与纳指所需的名单', () => {
    expect(marketsForTab('research', [])).toEqual(['us', 'ndx'])
  })
})
