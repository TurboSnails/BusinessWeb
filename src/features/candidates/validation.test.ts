import { describe, expect, it } from 'vitest'
import { validAlertRule, validCandidateItem, validCandidatesPayload, type CandidateAlertRule } from './validation'

const rule = (over: Partial<CandidateAlertRule> = {}): CandidateAlertRule => ({
  kind: 'price-below', threshold: 120, currency: 'CNY',
  anchor: { type: 'research-bear', value: 120, asOf: '2026-11-13', researchVersion: 'valuation:2026-11-13:PE' },
  enabled: true, createdAt: '2026-11-14T01:00:00.000Z', ...over,
})
const item = { market: 'cn', code: '600519', addedAt: '2026-01-01T00:00:00.000Z' }

describe('候选池 payload：价位提醒为可选字段，schemaVersion 仍为 1', () => {
  it('旧数据（没有 alert）照常通过', () => {
    expect(validCandidatesPayload({ schemaVersion: 1, items: [item, { ...item, code: '000001', note: 'n' }] })).toBe(true)
  })
  it('新数据（带 alert，含暂停、已看过）通过', () => {
    const full = rule({ snoozedUntil: '2026-11-21', lastSeenAt: '2026-11-14T02:00:00.000Z' })
    expect(validCandidatesPayload({ schemaVersion: 1, items: [{ ...item, alert: rule() }, { ...item, code: '000001', alert: full }] })).toBe(true)
    expect(validAlertRule(rule({ kind: 'price-above', anchor: { type: 'manual', value: 100, asOf: '2026-11-14' } }))).toBe(true)
  })
  it('schemaVersion 不是 1 或条目外多字段仍然拒绝', () => {
    expect(validCandidatesPayload({ schemaVersion: 2, items: [{ ...item, alert: rule() }] })).toBe(false)
    expect(validCandidateItem({ ...item, alerts: [rule()] })).toBe(false)
  })
})

describe('validAlertRule 拒绝不合规的提醒', () => {
  const bad: [string, unknown][] = [
    ['非法币种', rule({ currency: 'RMB' as never })],
    ['币种小写', rule({ currency: 'usd' as never })],
    ['条件价为 0', rule({ threshold: 0 })],
    ['条件价为负', rule({ threshold: -1 })],
    ['条件价非数字', rule({ threshold: '120' as never })],
    ['条件价 NaN', rule({ threshold: Number.NaN })],
    ['条件价是锚点 10 倍', rule({ threshold: 1200 })],
    ['条件价超过锚点 10 倍', rule({ threshold: 1500 })],
    ['条件价是锚点 0.1 倍', rule({ threshold: 12 })],
    ['条件价低于锚点 0.1 倍', rule({ threshold: 5 })],
    ['未知方向', rule({ kind: 'cross' as never })],
    ['未知锚点类型', rule({ anchor: { type: 'guess' as never, value: 120, asOf: '2026-11-13' } })],
    ['锚点日期不合法', rule({ anchor: { type: 'manual', value: 120, asOf: '2026/11/13' } })],
    ['锚点价格非正', rule({ anchor: { type: 'manual', value: 0, asOf: '2026-11-13' } })],
    ['提醒里有未知字段', { ...rule(), channel: 'email' }],
    ['锚点里有未知字段', rule({ anchor: { type: 'manual', value: 120, asOf: '2026-11-13', currency: 'CNY' } as never })],
    ['缺 enabled', (({ enabled: _e, ...r }) => r)(rule())],
    ['缺 anchor', (({ anchor: _a, ...r }) => r)(rule())],
    ['缺 createdAt', (({ createdAt: _c, ...r }) => r)(rule())],
    ['暂停日期格式错', rule({ snoozedUntil: '下周' })],
    ['已看过时间无效', rule({ lastSeenAt: 'yesterday' })],
    ['研究版本为空串', rule({ anchor: { type: 'research-base', value: 120, asOf: '2026-11-13', researchVersion: '' } })],
  ]
  it.each(bad)('%s', (_name, value) => {
    expect(validAlertRule(value)).toBe(false)
    expect(validCandidatesPayload({ schemaVersion: 1, items: [{ ...item, alert: value }] })).toBe(false)
  })
})
