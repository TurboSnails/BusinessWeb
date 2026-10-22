import { describe, expect, it } from 'vitest'
import fixture from '../valuation/report.fixture.json'
import { importReport } from '../valuation'
import { calculateMultiples, emptyMultiples, researchFromReport, applyMultiple, exportMultiples } from './multiples'
import { exampleInputs } from './model'

describe('综合估值复用乘数法', () => {
  it('导出保留经营口径、方法分歧、倍数依据、计算及来源缺项', () => {
    const imported = researchFromReport(JSON.stringify(fixture))
    imported.research.differences = 'PE与PEG共享盈利，不作为独立证据'
    const markdown = exportMultiples(imported.research, imported.years).join('\n')
    expect(markdown).toContain('PE与PEG共享盈利，不作为独立证据')
    expect(markdown).toContain('2026-10-04')
    expect(markdown).toContain('来源数据缺口：未采集同业财报')
    expect(markdown).toContain(fixture.assumptions.methodSuitability.pb.reason)
    expect(markdown).toContain('未经独立核验')
  })
  it('由财务指标和目标倍数推导三种价格，并区分未来价与要求回报下现价', () => {
    const research = emptyMultiples()
    research.rows = research.rows.map(() => ({ eps: '2', growth: '20', bvps: '10', pe: '20', peg: '1', pb: '1.5' }))
    research.requiredReturn = '10'
    const result = calculateMultiples(research, '2')
    expect(result[0].pe.price).toBe(40)
    expect(result[0].peg.price).toBe(40)
    expect(result[0].pb.price).toBe(15)
    expect(result[0].pe.presentPrice).toBeCloseTo(40 / 1.1 ** 2)
  })

  it('缺项、亏损、非正增长与不适用方法不编造目标价', () => {
    const research = emptyMultiples()
    expect(calculateMultiples(research, '2')[0].pe.status).toBe('missingData')
    research.rows[0] = { eps: '-2', growth: '0', bvps: '-1', pe: '20', peg: '1', pb: '1' }
    expect(calculateMultiples(research, '2')[0].pe.status).toBe('notApplicable')
    research.rows[0].eps = '2'
    expect(calculateMultiples(research, '2')[0].peg.status).toBe('notApplicable')
    expect(calculateMultiples(research, '2')[0].pb.status).toBe('notApplicable')
    research.applicable.pe = false
    expect(calculateMultiples(research, '2')[0].pe.price).toBeNull()
  })

  it('导入报告保留来源和适用性，重新计算而非信任缓存目标价', () => {
    const report = structuredClone(fixture)
    report.results.base.pe.price = 999999
    const imported = researchFromReport(JSON.stringify(report))
    expect(imported.company).toContain('AAPL')
    expect(imported.currency).toBe('USD')
    expect(imported.research.source?.asOf).toBe('2026-10-04')
    expect(imported.research.source?.sources.length).toBeGreaterThan(0)
    expect(imported.research.rows[1].growth).toBe('8')
    const result = calculateMultiples(imported.research, imported.years)
    expect(result[1].pe.price).toBeCloseTo(report.assumptions.scenarios.base.eps * report.assumptions.scenarios.base.pe)
  })

  it('导入异年情景或没有汇率的跨币种报告时拒绝误导性的拼接', () => {
    const report = structuredClone(fixture)
    report.assumptions.scenarios.bull.year += 1
    expect(() => researchFromReport(JSON.stringify(report))).toThrow(/同一预测年度/)
    report.assumptions.scenarios.bull.year -= 1
    report.snapshot.facts.eps.currency = 'EUR'
    expect(() => researchFromReport(JSON.stringify(report))).toThrow(/汇率/)
  })

  it('即使有汇率，也不把外币现价直接当作报价币种；非法日期不覆盖研究', () => {
    const report = importReport(JSON.stringify(fixture))
    report.snapshot.facts.price.currency = 'EUR'
    report.snapshot.facts.fx_EUR = { ...report.snapshot.facts.price, value: 2, currency: '', unit: 'ratio' }
    expect(() => researchFromReport(JSON.stringify(report))).toThrow(/现价币种/)
    report.snapshot.facts.price.currency = 'USD'
    report.snapshot.asOf = 'not-a-date'
    report.assumptions.valuationDate = 'not-a-date'
    expect(() => researchFromReport(JSON.stringify(report))).toThrow(/日期/)
  })

  it('仅显式选定的方法带入价格，分红和概率重置，拒绝倒置及非法期限', () => {
    const research = emptyMultiples()
    research.rows = ['1', '2', '3'].map(eps => ({ eps, growth: '20', bvps: '10', pe: '20', peg: '1', pb: '1' }))
    const old = exampleInputs()
    old.scenarios[0].dividend = '5'
    old.scenarios[0].probability = '25'
    const applied = applyMultiple(research, 'pe', old)
    expect(applied.scenarios.map(row => row.price)).toEqual(['20', '40', '60'])
    expect(applied.scenarios[0].dividend).toBe('0')
    expect(applied.scenarios[0].probability).toBe('')
    expect(() => applyMultiple(research, 'pe', { ...old, years: '' })).toThrow(/期限/)
    research.rows[0].eps = '4'
    expect(() => applyMultiple(research, 'pe', old)).toThrow(/悲观/)
  })
})
