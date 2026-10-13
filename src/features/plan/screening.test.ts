import { describe, expect, it } from 'vitest'
import { INVEST_GROUPS } from '../../data/siteMap'
import { CORE_QUALITY, GOOD_COMPANY_BASELINE, GOOD_COMPANY_BY_TYPE, SCREENING_GATES } from './screening'

describe('选股漏斗', () => {
  it('八道关按序编号，每关入口都是站内真实页面', () => {
    expect(SCREENING_GATES.map(g => g.step)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7'])
    const paths = INVEST_GROUPS.flatMap(g => g.links.map(l => l.path))
    for (const g of SCREENING_GATES) expect(paths).toContain(g.to.split('?')[0])
  })
  it('每一关都写明通过条件和产出', () => {
    for (const g of SCREENING_GATES) { expect(g.pass.length).toBeGreaterThan(5); expect(g.out.length).toBeGreaterThan(2); expect(g.actions.length).toBeGreaterThan(1) }
  })
  it('好公司标准覆盖公司研究页的全部林奇类型，且每类都给出合理价格口径', () => {
    expect(GOOD_COMPANY_BY_TYPE.map(t => t.type).sort()).toEqual(['困境反转型', '周期型', '快速增长型', '稳健型', '缓慢增长型', '资产型'].sort())
    for (const t of GOOD_COMPANY_BY_TYPE) { expect(t.good.length).toBeGreaterThan(8); expect(t.price.length).toBeGreaterThan(5) }
    expect(GOOD_COMPANY_BASELINE.length).toBeGreaterThan(2)
  })
  it('核心白马档是三条硬指标，且都写明如何核实', () => {
    expect(CORE_QUALITY.map(c => c.name)).toEqual(['资本回报稳定', '管理层长期持股不减持', '难以复制的护城河'])
    for (const c of CORE_QUALITY) expect(c.check.length).toBeGreaterThan(8)
  })
})
