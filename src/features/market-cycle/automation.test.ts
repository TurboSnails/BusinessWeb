import { describe, expect, it } from 'vitest'
import { automaticRows, parseAutomaticSnapshot, shadowState } from './automation'
import type { AutomaticFact } from './automation'
import type { Evidence } from './engine'

const now = '2026-10-17T10:00:00Z'
const fact = (patch: Partial<AutomaticFact> = {}): AutomaticFact => ({ metricId: 'erp_z', market: 'csi300', value: 2,
  observationDate: '2026-10-16', availableAt: null, firstSeenAt: now, fetchedAt: now,
  source: 'https://www.csindex.com.cn/', unit: 'z-score', kind: 'observed', frequency: 'daily', description: '5年同日ERP', ...patch })
const row = (id: string, signal: Evidence['signal']): Evidence => ({ id, signal, available: signal !== 'missing', name: id, detail: '' })

describe('自动证据与影子规则', () => {
  it('验证公开契约，拒绝重复、未来、非法日期与非有限事实', () => {
    const body = (facts: AutomaticFact[]) => ({ schemaVersion: 1, generatedAt: now, facts, issues: [] })
    expect(parseAutomaticSnapshot(body([fact()])).facts).toHaveLength(1)
    for (const facts of [[fact(), fact()], [fact({ value: Infinity })], [fact({ observationDate: '2026-02-30' })], [fact({ observationDate: '2026-10-18' })], [fact({ fetchedAt: 'tomorrow' })]]) expect(() => parseAutomaticSnapshot(body(facts))).toThrow()
  })
  it('日频过期或未来可得数据不计票；月PE保持可见但不伪造长期分位', () => {
    const snap = { schemaVersion: 1 as const, generatedAt: now, facts: [fact()], issues: [] }
    expect(automaticRows('csi300', snap, null, '2026-10-17').valuation?.signal).toBe('bottom')
    expect(automaticRows('csi300', { ...snap, facts: [fact({ observationDate: '2026-09-01' })] }, null, '2026-10-17').valuation).toBeUndefined()
    expect(automaticRows('csi300', { ...snap, facts: [fact({ availableAt: '2026-10-18T00:00:00Z' })] }, null, '2026-10-17').valuation).toBeUndefined()
    expect(automaticRows('hsi', { ...snap, facts: [fact({ market: 'hsi', metricId: 'pe', value: 11, frequency: 'monthly', observationDate: '2026-09-30' })] }, null, '2026-10-17').valuation?.available).toBe(false)
  })
  it('代理估值不能当精确ERP票；融资原值不能冒充比例', () => {
    const snap = { schemaVersion: 1 as const, generatedAt: now, facts: [fact({ kind: 'proxy' }), fact({ metricId: 'financing_buy', value: 1234 })], issues: [] }
    expect(automaticRows('csi300', snap, null, '2026-10-17').valuation).toBeUndefined()
    expect(automaticRows('csi300', snap, null, '2026-10-17').funding?.available).toBe(false)
  })
  it('低估与技术防守并存，缺数不会转换为可加仓状态', () => {
    const state = shadowState([row('valuation', 'bottom'), row('technical', 'risk')])
    expect(state.valuationZone).toBe('低估候选')
    expect(state.trendState).toBe('防守')
    expect(state.riskGate).toBe('防守复核')
    expect(state.dataQuality).toBe('证据不足')
  })
  it('趋势修复需连续两份不同周记录；相同周重跑由归档层替换，不增加确认', () => {
    const rows = [row('technical', 'positive'), row('valuation', 'neutral'), row('funding', 'neutral'), row('breadth', 'neutral')]
    const first = shadowState(rows)
    expect(first.trendState).toBe('修复待确认')
    expect(shadowState(rows, first).trendState).toBe('上行观察')
    expect(shadowState([row('technical', 'risk')], first).trendState).toBe('防守')
  })
})
