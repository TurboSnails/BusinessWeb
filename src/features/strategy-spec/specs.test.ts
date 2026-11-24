import { describe, expect, it } from 'vitest'
// 规则代码：说明书里的数字必须和它一致
import { BREAKERS, COMPONENTS, PILLARS, RULE_VERSION, TIERS } from '../../../scripts/lib/macro-posture/model.mjs'
import { STRATEGY_SPECS, currentSpec, findSpec } from './index'
import type { SpecSection } from './types'

const tableRows = (section: SpecSection | undefined, caption?: string) =>
  section?.blocks.flatMap(block => block.type === 'table' && (caption == null || block.caption === caption) ? block.rows : []) ?? []

describe('版本登记', () => {
  it('版本号是语义化版本、互不重复，且恰好一个现行版本，排在最前', () => {
    const versions = STRATEGY_SPECS.map(spec => spec.version)
    expect(versions.every(v => /^\d+\.\d+\.\d+$/.test(v))).toBe(true)
    expect(new Set(versions).size).toBe(versions.length)
    expect(STRATEGY_SPECS.filter(spec => spec.status === 'current')).toHaveLength(1)
    expect(STRATEGY_SPECS[0].status).toBe('current')
    expect(currentSpec().version).toBe(STRATEGY_SPECS[0].version)
  })

  it('findSpec 接受带 v 前缀的版本号，找不到返回 null', () => {
    const v = STRATEGY_SPECS[0].version
    expect(findSpec(`v${v}`)?.version).toBe(v)
    expect(findSpec('9.9.9')).toBeNull()
    expect(findSpec(null)).toBeNull()
  })

  it('每个版本的章节 id 不重复，每章都有内容', () => {
    for (const spec of STRATEGY_SPECS) {
      const ids = spec.sections.map(section => section.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(spec.sections.every(section => section.blocks.length > 0)).toBe(true)
      expect(spec.changes.length).toBeGreaterThan(0)
    }
  })
})

describe('现行说明书与规则代码一致', () => {
  const spec = currentSpec()
  const section = (id: string) => spec.sections.find(s => s.id === id)

  it('宏观攻守的规则版本与代码相同', () => {
    expect(spec.components.find(c => c.label === '宏观攻守')?.version).toBe(RULE_VERSION)
  })

  it('五档的名称、分数线与仓位比例与代码相同', () => {
    const rows = tableRows(section('tiers'))
    expect(rows.map(row => row[0])).toEqual(TIERS.map(tier => tier.label))
    expect(rows.map(row => row[2])).toEqual(TIERS.map(tier => `${Math.round(tier.equityShare * 100)}%`))
    const bounds = rows.map(row => row[1]).join(' ')
    for (const n of [TIERS[0].min, TIERS[1].min, TIERS[3].max, TIERS[4].max]) {
      expect(bounds).toContain(Math.abs(n ?? NaN).toFixed(2))
    }
  })

  it('四根支柱的权重与指标数量与代码相同', () => {
    const tables = section('macro-score')?.blocks.filter(block => block.type === 'table') ?? []
    expect(tables).toHaveLength(PILLARS.length)
    PILLARS.forEach((pillar, i) => {
      const table = tables[i]
      if (table.type !== 'table') throw new Error('not table')
      expect(table.caption).toBe(`${pillar.title}（权重 ${Math.round(pillar.weight * 100)}%）`)
      expect(table.rows).toHaveLength(COMPONENTS.filter(c => c.pillar === pillar.id).length)
    })
    expect(section('macro-score')?.title).toContain(`${COMPONENTS.length} 项指标`)
  })

  it('熔断条数、名称与封顶档位与代码相同', () => {
    const rows = tableRows(section('breakers'))
    expect(rows.map(row => row[0])).toEqual(BREAKERS.map(b => b.label))
    expect(rows.map(row => row[2])).toEqual(
      BREAKERS.map(b => TIERS.find(t => t.id === b.cap)?.label),
    )
  })
})
