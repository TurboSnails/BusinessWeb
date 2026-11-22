import { describe, expect, it } from 'vitest'
import { MASTER_ARTICLES } from './articles'
import { MASTERS, masterBySlug } from './masters'
import type { ReadingKey } from './types'

const ORDER = ['druckenmiller', 'dalio', 'marks', 'tudor-jones', 'zweig', 'grantham', 'soros', 'templeton', 'kostolany'] as const
const READING_KEYS: readonly ReadingKey[] = [
  'fedAssets', 'netLiquidity', 'bankReserves', 'realRate', 'tenYear', 'curve10y2y', 'nfci',
  'hySpread', 'baaAaa', 'spxAbove200', 'netNewHighs', 'advDecLine', 'mcclellan', 'spxVs200dma',
  'epsRevision', 'forwardPe', 'cape', 'vix', 'fearGreed', 'retailBullBear', 'naaim', 'marginDebtYoy',
  'managerCash', 'copperGold', 'copper',
]

describe('MASTERS', () => {
  it('按约定顺序收录九位大师且 slug 唯一', () => {
    expect(MASTERS.map(master => master.slug)).toEqual(ORDER)
    expect(new Set(MASTERS.map(master => master.slug)).size).toBe(9)
    expect(MASTERS.map(master => masterBySlug(master.slug)?.slug)).toEqual(ORDER)
    expect(masterBySlug('missing')).toBeUndefined()
    expect(masterBySlug(undefined)).toBeUndefined()
  })

  it('每位大师都有完整摘要、3–5 条核心思路和至少一项指标', () => {
    for (const master of MASTERS) {
      expect(master.name.trim()).not.toBe('')
      expect(master.nameEn.trim()).not.toBe('')
      expect(master.oneLiner.trim()).not.toBe('')
      expect(master.tags.length).toBeGreaterThan(0)
      expect(master.ideas.length).toBeGreaterThanOrEqual(3)
      expect(master.ideas.length).toBeLessThanOrEqual(5)
      expect(master.limits.trim()).not.toBe('')
      expect(['quant', 'qualitative']).toContain(master.kind)
      expect(master.indicators.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('读数键全部合法，无本站读数的指标给出外部来源', () => {
    for (const master of MASTERS) {
      const indicatorNames = new Set<string>()
      for (const indicator of master.indicators) {
        expect(indicator.name.trim()).not.toBe('')
        expect(indicator.howToRead.trim()).not.toBe('')
        expect(indicatorNames.has(indicator.name)).toBe(false)
        indicatorNames.add(indicator.name)
        expect(['quote', 'paraphrase', 'unverified']).toContain(indicator.evidence)
        for (const key of indicator.readings ?? []) expect(READING_KEYS).toContain(key)
        if (!indicator.readings?.length) expect(indicator.external?.trim()).not.toBe('')
      }
    }
  })

  it('九位大师都有对应的研究正文', () => {
    expect(Object.keys(MASTER_ARTICLES).sort()).toEqual([...ORDER].sort())
    for (const slug of ORDER) {
      expect(MASTER_ARTICLES[slug].length).toBeGreaterThan(1000)
      expect(MASTER_ARTICLES[slug]).toContain('可映射到本站数据的指标清单')
    }
  })
})
