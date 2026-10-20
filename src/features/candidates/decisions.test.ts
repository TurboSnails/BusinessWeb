import { describe, expect, it } from 'vitest'
import { addDecision, isReviewDue, latestDecision, removeCandidate, toggleCandidate } from './store'
import { MAX_DECISIONS, validCandidatesPayload, validDecisionRecord } from './validation'
import type { CandidateItem, DecisionRecord } from './validation'

const record = (over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  at: '2026-10-20T08:00:00.000Z', action: 'watch', why: '续约稳定，现金回款与利润匹配', wrong: '半年报毛利率同比下降 5 个百分点以上', nextCheck: '2027-04-30', ...over,
})
const item = (over: Partial<CandidateItem> = {}): CandidateItem => ({ market: 'us', code: 'PEP', addedAt: '2026-10-02T00:00:00.000Z', ...over })

describe('决策记录校验', () => {
  it('三行必填：理由、证伪条件、下次检查日', () => {
    expect(validDecisionRecord(record())).toBe(true)
    expect(validDecisionRecord(record({ why: '  ' }))).toBe(false)
    expect(validDecisionRecord(record({ wrong: '' }))).toBe(false)
    expect(validDecisionRecord(record({ nextCheck: '2027-4-30' }))).toBe(false)
  })
  it('完整版字段与快照可选，但拒绝未知字段、原型链上的动作名和非有限数字', () => {
    expect(validDecisionRecord(record({ type: 'value', cyclical: true, evidence: '三条证据', snapshot: { rating: '观察', price: 128.5, priceDate: '2026-10-19', dcfPrice: 140, dcfCurrency: 'USD', dcfMos: 0.08, dcfDate: '2026-10-18' } }))).toBe(true)
    expect(validDecisionRecord({ ...record(), extra: 1 })).toBe(false)
    expect(validDecisionRecord(record({ action: 'toString' as DecisionRecord['action'] }))).toBe(false)
    expect(validDecisionRecord(record({ snapshot: { price: Number.NaN } }))).toBe(false)
    expect(validDecisionRecord(record({ evidence: 'x'.repeat(1001) }))).toBe(false)
  })
  it('候选池载荷：版本须按时间先后、数量有上限；旧数据（无 decisions）仍然有效', () => {
    const later = record({ at: '2026-11-01T00:00:00.000Z', action: 'buy' })
    expect(validCandidatesPayload({ schemaVersion: 1, items: [item()] })).toBe(true)
    expect(validCandidatesPayload({ schemaVersion: 1, items: [item({ decisions: [record(), later] })] })).toBe(true)
    expect(validCandidatesPayload({ schemaVersion: 1, items: [item({ decisions: [later, record()] })] })).toBe(false)
    expect(validCandidatesPayload({ schemaVersion: 1, items: [item({ decisions: [] })] })).toBe(false)
    expect(validCandidatesPayload({ schemaVersion: 1, items: [item({ decisions: Array.from({ length: MAX_DECISIONS + 1 }, () => record()) })] })).toBe(false)
  })
})

describe('决策记录操作', () => {
  it('只追加不覆盖，最新一条决定复查状态', () => {
    let list = [item(), item({ code: 'KO' })]
    list = addDecision(list, 'us', 'PEP', record())
    list = addDecision(list, 'us', 'PEP', record({ at: '2026-11-01T00:00:00.000Z', action: 'buy', nextCheck: '2026-12-01' }))
    expect(list[0].decisions?.map(r => r.action)).toEqual(['watch', 'buy'])
    expect(list[1].decisions).toBeUndefined()
    expect(latestDecision(list[0])?.nextCheck).toBe('2026-12-01')
    expect(isReviewDue(list[0], '2026-11-30')).toBe(false)
    expect(isReviewDue(list[0], '2026-12-01')).toBe(true)
    expect(isReviewDue(list[1], '2099-01-01')).toBe(false)
  })
  it('达到上限后不再追加', () => {
    const full = item({ decisions: Array.from({ length: MAX_DECISIONS }, () => record()) })
    expect(addDecision([full], 'us', 'PEP', record())[0].decisions).toHaveLength(MAX_DECISIONS)
  })
  it('有记录的公司不会被切换移出，只能明确移除', () => {
    const list = [item({ decisions: [record()] })]
    expect(toggleCandidate(list, 'us', 'PEP')).toBe(list)
    expect(removeCandidate(list, 'us', 'PEP')).toEqual([])
    expect(toggleCandidate([item()], 'us', 'PEP')).toEqual([])
  })
})
