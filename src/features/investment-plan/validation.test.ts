import { describe, expect, it } from 'vitest'
import { createEmptyPlan } from './types'
import { parsePlanDocument } from './validation'

const NOW = '2026-11-14T12:00:00.000Z'
const empty = () => createEmptyPlan(NOW, 'plan-test-1')

describe('parsePlanDocument', () => {
  it('空文档工厂可通过校验', () => {
    const r = parsePlanDocument(empty())
    expect(r.ok).toBe(true)
  })

  it('未知 schema / 未知字段拒绝', () => {
    expect(parsePlanDocument({ ...empty(), schemaVersion: 99 }).ok).toBe(false)
    expect(parsePlanDocument({ ...empty(), extra: 1 }).ok).toBe(false)
  })

  it('UTF-8 字节限长', () => {
    const big = 'x'.repeat(262145)
    expect(parsePlanDocument(big).ok).toBe(false)
  })

  it('重复 id 拒绝', () => {
    const doc = empty()
    const mark = {
      value: { currency: 'CNY' as const, amount: '1.00' },
      asOf: '2026-11-01',
      source: 'manual' as const,
      verifiedAt: NOW,
    }
    doc.core = [
      { id: 'a', label: 'A', targetBps: 5000, relativeBandBps: 2500, mark, riskTags: [] },
      { id: 'a', label: 'B', targetBps: 5000, relativeBandBps: 2500, mark, riskTags: [] },
    ]
    expect(parsePlanDocument(doc).ok).toBe(false)
  })

  it('目标合计错可保存（校验不拒）', () => {
    const doc = empty()
    const mark = {
      value: { currency: 'CNY' as const, amount: '1.00' },
      asOf: '2026-11-01',
      source: 'manual' as const,
      verifiedAt: NOW,
    }
    doc.core = [
      { id: 'a', label: 'A', targetBps: 3000, relativeBandBps: 2500, mark, riskTags: [] },
      { id: 'b', label: 'B', targetBps: 3000, relativeBandBps: 2500, mark, riskTags: [] },
    ]
    expect(parsePlanDocument(doc).ok).toBe(true)
  })

  it('issue 不带原值', () => {
    const r = parsePlanDocument({ ...empty(), id: 'BAD ID' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(JSON.stringify(r.issues)).not.toMatch(/BAD/)
      expect(r.issues[0]).toEqual({ path: 'id', code: 'invalid-id' })
    }
  })

  it('core 与 coreTotalOnly 互斥', () => {
    const doc = empty()
    doc.core = [
      {
        id: 'a',
        label: 'A',
        targetBps: 10000,
        relativeBandBps: 2500,
        mark: { value: null, asOf: null, source: 'manual', verifiedAt: null },
        riskTags: [],
      },
    ]
    doc.coreTotalOnly = { value: { currency: 'CNY', amount: '1.00' }, asOf: '2026-11-01', source: 'manual', verifiedAt: NOW }
    expect(parsePlanDocument(doc).ok).toBe(false)
  })

  it('数组边界 200/30/100', () => {
    const doc = empty()
    doc.contributions = Array.from({ length: 31 }, (_, i) => ({
      id: `c-${i}`,
      label: '定投',
      amount: { currency: 'CNY' as const, amount: '100.00' },
      intervalMonths: 1 as const,
      anchor: '2026-01-15',
      enabled: true,
      acknowledgedDates: [] as string[],
    }))
    expect(parsePlanDocument(doc).ok).toBe(false)
  })

  it('researchCap>500 须 increaseAcknowledgedAt', () => {
    const doc = empty()
    doc.limits.researchCapBps = 600
    expect(parsePlanDocument(doc).ok).toBe(false)
    doc.limits.increaseAcknowledgedAt = NOW
    expect(parsePlanDocument(doc).ok).toBe(true)
  })

  it('legacy mark 可无日期；manual 非空必须有日期', () => {
    const doc = empty()
    doc.funding.reserveActual = {
      value: { currency: 'CNY', amount: '1.00' },
      asOf: null,
      source: 'legacy',
      verifiedAt: null,
    }
    expect(parsePlanDocument(doc).ok).toBe(true)
    doc.funding.reserveActual = {
      value: { currency: 'CNY', amount: '1.00' },
      asOf: null,
      source: 'manual',
      verifiedAt: null,
    }
    expect(parsePlanDocument(doc).ok).toBe(false)
  })

  it('可选 today：省略时行为不变；给定时拒绝未来 asOf', () => {
    const doc = empty()
    doc.funding.reserveActual = {
      value: { currency: 'CNY', amount: '1.00' },
      asOf: '2026-12-01',
      source: 'manual',
      verifiedAt: NOW,
    }
    expect(parsePlanDocument(doc).ok).toBe(true)
    expect(parsePlanDocument(doc, '2026-11-14').ok).toBe(false)
    const r = parsePlanDocument(doc, '2026-11-14')
    if (!r.ok) expect(r.issues.some(i => i.code === 'asOf-future')).toBe(true)
    expect(parsePlanDocument(doc, '2026-12-01').ok).toBe(true)
  })
})
