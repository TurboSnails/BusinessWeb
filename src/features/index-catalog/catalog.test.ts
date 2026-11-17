import { describe, expect, it } from 'vitest'
import { compareIndices, hasHistory, relationsFor, monthlySeries, validCatalog, validRelation, type EtfCatalog, type IndexEtfRelation } from './catalog'
import type { IndexData } from '../macro/valuation'
const ix = (monthly: [string, number][]): IndexData => ({ name: '指数', symbol: 'index', group: 'A 股', note: '', monthly, fpe: [], latest: { date: monthly.at(-1)?.[0] ?? '', value: monthly.at(-1)?.[1] ?? 0 } })
describe('index comparisons', () => {
  it('只在共同月份归一，不用缺失数据插值', () => {
    const result = compareIndices({ a: ix([['2020-01-01', 10], ['2020-02-01', 20], ['2020-03-01', 30]]), b: ix([['2020-02-15', 40], ['2020-03-12', 20]]) }, ['a', 'b'], null)
    expect(result.months).toEqual(['2020-02', '2020-03'])
    expect(result.series.map(s => s.points.map(p => p[1]))).toEqual([[100, 150], [100, 50]])
  })
  it('不足共同月份不比较，24周数据不冒充24个月', () => {
    expect(compareIndices({ a: ix([['2020-01-01', 10]]), b: ix([['2021-01-01', 20]]) }, ['a', 'b'], null).series).toEqual([])
    const weeks: [string, number][] = Array.from({ length: 30 }, (_, i) => [new Date(Date.UTC(2020, 0, 1 + i * 7)).toISOString().slice(0, 10), 10])
    expect(hasHistory(weeks)).toBe(false)
    expect(hasHistory(Array.from({ length: 24 }, (_, i) => [`${2020 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-01`, 10]))).toBe(true)
  })
})
describe('官方关系', () => {
  const relation: IndexEtfRelation = { indexKey: 'csi300', indexCode: '000300', indexName: '沪深300', indexProvider: 'CSI', code: '510300', exchange: 'SH', name: 'ETF', relationship: 'tracks', benchmarkCode: '000300', benchmarkName: '沪深300', verifiedAt: '2026-11-16', disclosureDate: '2026-11-13', evidenceUrl: 'https://www.sse.com.cn/example', evidenceLabel: '官方' }
  it('指数key精确匹配，错误基准不能冒充直接跟踪', () => {
    const catalog: EtfCatalog = { schemaVersion: 1, scope: '', relations: [relation, { ...relation, indexKey: 'csi500' }, { ...relation, benchmarkCode: '000905' }] }
    expect(relationsFor(catalog, 'csi300')).toHaveLength(1)
    expect(relationsFor(catalog, '000300')).toHaveLength(0)
  })
  it('主题相关需明确差异说明', () => {
    const catalog: EtfCatalog = { schemaVersion: 1, scope: '', relations: [{ ...relation, relationship: 'related_theme', benchmarkCode: '000905' }] }
    expect(relationsFor(catalog, 'csi300')).toHaveLength(0)
    catalog.relations[0].relationNote = '范围不同'
    expect(relationsFor(catalog, 'csi300')).toHaveLength(1)
  })
})

it('拒绝指数key伪造、非官方HTTPS、空行与非法日期', () => {
  const r: IndexEtfRelation = { indexKey: 'csi300', indexCode: '000300', indexName: '沪深300', indexProvider: 'CSI', code: '510300', exchange: 'SH', name: 'ETF', relationship: 'tracks', benchmarkCode: '000300', benchmarkName: '沪深300', verifiedAt: '2026-11-16', disclosureDate: '2026-11-13', evidenceUrl: 'https://www.sse.com.cn/example', evidenceLabel: '官方' }
  expect(validRelation({ ...r, indexCode: '399001', benchmarkCode: '399001', indexProvider: 'SZSE' })).toBe(false)
  expect(validRelation({ ...r, evidenceUrl: 'https://example.com/' })).toBe(false)
  expect(validRelation({ ...r, disclosureDate: '2026-02-30' })).toBe(false)
  expect(validRelation(null)).toBe(false)
  expect(validCatalog({ schemaVersion: 1, scope: '', relations: [null] })).toBe(false)
  expect(validCatalog({ schemaVersion: 1, scope: '', relations: [r, r] })).toBe(false)
})

it('月线排除虚构日期，不将11月99日当成观测', () => {
  expect(monthlySeries([['2026-11-99', 10], ['2026-02-30', 10]]).size).toBe(0)
})
