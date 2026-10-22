import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseValuationDocument } from './model'
import type { CompanyValuation } from './model'
import type { Market } from '../../data/companies'

describe('全公司估值交付数据', () => {
  for (const market of ['us', 'cn', 'hk', 'adr', 'ndx'] as Market[]) {
    it(`${market} 覆盖冻结清单每个证券，浏览器可解析且来源可追溯`, () => {
      const universe = JSON.parse(readFileSync(`public/research/comprehensive-valuation-2026-10-22/universe-${market}.json`, 'utf8')) as { market: Market; code: string }[]
      const document = JSON.parse(readFileSync(`public/data/company-valuations/${market}.json`, 'utf8')) as { records: CompanyValuation[] }
      const records = parseValuationDocument(document, market)
      expect(records.size).toBe(universe.length)
      expect(document.records.length).toBe(universe.length)
      expect([...records.keys()].sort()).toEqual(universe.map(r => r.code).sort())
      for (const r of records.values()) {
        expect(r.price.currency).toBe(r.currency)
        expect(r.review.mode === 'programmatic' && r.status === 'reviewed').toBe(false)
        if (r.status === 'insufficient') { expect(r.value).toBeNull(); expect(r.missing.length).toBeGreaterThan(0) }
        if (r.value) expect(r.methods.find(m => m.name === r.value!.primaryMethod)?.values).toEqual([r.value.low, r.value.base, r.value.high])
        // Recalculate disclosed inputs independently of the generators. In
        // particular, an old scenario price must not acquire a new EPS label.
        for (const method of r.methods) {
          if (!method.values || method.name !== 'PE') continue
          const inputs = method.inputs
          if (r.value?.primaryMethod === 'PE' && inputs.epsForward && inputs.forwardYearBound !== true && !Array.isArray(inputs.eps2027)) {
            expect(r.value.kind, `${r.key}: 未绑定预测财年的forward EPS不能认证为今日价值`).toBe('undated')
          }
          const multiples = Array.isArray(inputs.multiples) ? inputs.multiples
            : ['low', 'base', 'high'].map(k => (inputs.researchMultiples as Record<string, number>)[k])
          const earnings = Array.isArray(inputs.eps2027) ? inputs.eps2027 : Array(3).fill(inputs.epsForward)
          expect(multiples).toHaveLength(3)
          method.values.forEach((v, i) => {
            expect(typeof earnings[i]).toBe('number')
            expect(typeof multiples[i]).toBe('number')
            // Different rounding conventions can differ by one cent.
            expect(Math.abs(v - earnings[i] * multiples[i]), r.key).toBeLessThanOrEqual(.010001)
          })
        }
        for (const source of r.sources) {
          if (/^https?:\/\//i.test(source.url)) continue
          expect(source.url.startsWith('.local/')).toBe(false)
          const path = /^(research|data)\//.test(source.url) ? `public/${source.url}` : source.url
          expect(existsSync(path), `${r.key} source ${path}`).toBe(true)
        }
      }
    })
  }
})
