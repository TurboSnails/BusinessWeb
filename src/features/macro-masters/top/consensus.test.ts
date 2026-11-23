import { describe, expect, it } from 'vitest'
import type { MasterTake } from '../types'
import {
  consensusSummary,
  countsBarText,
  leanCounts,
  masterLeanBias,
  roleDivisions,
  sortTopMasters,
} from './consensus'
import { TOP_MASTERS_FIXTURE } from './fixture'

function take(partial: Partial<MasterTake> & Pick<MasterTake, 'slug' | 'mode' | 'headline'>): MasterTake {
  return { items: [], missing: '', ...partial }
}

describe('sortTopMasters', () => {
  it('按 rank 升序', () => {
    const shuffled = [TOP_MASTERS_FIXTURE[3], TOP_MASTERS_FIXTURE[0], TOP_MASTERS_FIXTURE[5]]
    expect(sortTopMasters(shuffled).map(m => m.rank)).toEqual([1, 4, 6])
  })
})

describe('leanCounts / masterLeanBias / consensusSummary', () => {
  it('计数条文案', () => {
    const t = take({
      slug: 'dalio',
      mode: 'checklist',
      headline: 'x',
      items: [
        { label: 'a', lean: 'caution', text: '', basis: 'own', keys: ['hySpread'] },
        { label: 'b', lean: 'caution', text: '', basis: 'own', keys: ['hySpread'] },
        { label: 'c', lean: 'neutral', text: '', basis: 'site', keys: ['cape'] },
        { label: 'd', lean: 'support', text: '', basis: 'site', keys: ['nfci'] },
      ],
    })
    expect(leanCounts(t)).toEqual({ caution: 2, support: 1, neutral: 1, unknown: 0 })
    expect(countsBarText(leanCounts(t))).toBe('谨慎 2 · 中性 1 · 积极 1')
    expect(masterLeanBias(t)).toBe('caution')
  })

  it('rule 模式用档位', () => {
    expect(masterLeanBias(take({
      slug: 'tudor-jones', mode: 'rule', posture: 'defense', headline: '离场',
    }))).toBe('caution')
    expect(masterLeanBias(take({
      slug: 'tudor-jones', mode: 'rule', posture: 'offense', headline: '进攻',
    }))).toBe('support')
  })

  it('共识汇总：偏谨慎为主', () => {
    const takes: MasterTake[] = [
      take({ slug: 'tudor-jones', mode: 'rule', posture: 'defense', headline: 'a' }),
      take({
        slug: 'druckenmiller', mode: 'checklist', headline: 'b',
        items: [
          { label: '1', lean: 'caution', text: '', basis: 'own', keys: ['policyRate'] },
          { label: '2', lean: 'caution', text: '', basis: 'own', keys: ['hySpread'] },
          { label: '3', lean: 'neutral', text: '', basis: 'site', keys: ['copper'] },
        ],
      }),
      take({
        slug: 'marks', mode: 'checklist', headline: 'c',
        items: [
          { label: '1', lean: 'support', text: '', basis: 'site', keys: ['vix'] },
          { label: '2', lean: 'neutral', text: '', basis: 'site', keys: ['cape'] },
        ],
      }),
    ]
    expect(consensusSummary(takes)).toBe('3 位中 2 位的读数以偏谨慎为主。')
  })

  it('共识汇总：无一边倒', () => {
    const takes = [
      take({ slug: 'tudor-jones', mode: 'rule', posture: 'neutral', headline: 'a' }),
      take({
        slug: 'soros', mode: 'reference', headline: 'b',
        items: [
          { label: '波动', lean: 'neutral', text: '', basis: 'site', keys: ['vix'] },
        ],
      }),
    ]
    expect(consensusSummary(takes)).toBe('2 位的读数没有一边倒，暂看不出统一方向。')
  })
})

describe('roleDivisions', () => {
  it('从 role 抽流动性/信用/趋势/估值/选股', () => {
    const rows = roleDivisions(TOP_MASTERS_FIXTURE, slug => slug)
    const map = Object.fromEntries(rows.map(r => [r.dimension, r.names]))
    expect(map['流动性']).toEqual(expect.arrayContaining(['druckenmiller', 'dalio']))
    expect(map['信用']).toEqual(expect.arrayContaining(['druckenmiller', 'dalio', 'marks']))
    expect(map['趋势']).toEqual(expect.arrayContaining(['druckenmiller', 'tudor-jones']))
    expect(map['估值']).toEqual(['marks'])
    expect(map['选股']).toEqual(['templeton'])
  })
})
