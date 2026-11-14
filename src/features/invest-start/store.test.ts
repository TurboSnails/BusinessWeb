import { describe, expect, it } from 'vitest'
import { START_KEY, clearStart, loadStart, saveStart } from './store'
import { parseStartState } from './validation'
import { emptyState, type StartState } from './types'

function memStorage(init: Record<string, string> = {}) {
  const data = { ...init }
  const writes: string[] = []
  return {
    data,
    writes,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { writes.push(k); data[k] = v },
    removeItem: (k: string) => { writes.push(`-${k}`); delete data[k] },
  }
}
const throwing = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceededError') },
  removeItem: () => { throw new Error('SecurityError') },
}

const sample = (): StartState => ({
  ...emptyState(),
  answers: { q1: 'c', q2: 'b' },
  steps: { 'read-four-steps': { checked: true, at: '2026-11-14T00:00:00.000Z' } },
  review: { id: 'abc-123', anchor: '2027-01-15', intervalMonths: 6, completedDates: [], calendarSequence: 0 },
  userResearchCapBps: 800,
})

describe('store', () => {
  it('只写 start:v1，不写 plan2026:*；读回一致', () => {
    const s = memStorage({ 'plan2026:fund-total': '"100"' })
    expect(saveStart(sample(), s)).toBe(true)
    expect(s.writes).toEqual([START_KEY])
    expect(s.data['plan2026:fund-total']).toBe('"100"')
    const r = loadStart(s)
    expect(r.mode).toBe('ok')
    expect(r.state).toEqual(sample())
  })

  it('清除只删 start:v1，其他键原样保留', () => {
    const s = memStorage({ [START_KEY]: JSON.stringify(sample()), 'plan2026:holdings': '[]', 'rn-candidates': '[]' })
    expect(clearStart(s)).toBe(true)
    expect(s.writes).toEqual([`-${START_KEY}`])
    expect(Object.keys(s.data).sort()).toEqual(['plan2026:holdings', 'rn-candidates'])
  })

  it('存储抛错（隐私模式 / 配额）时不抛出：读为 unavailable，写返回 false', () => {
    expect(loadStart(throwing).mode).toBe('unavailable')
    expect(saveStart(sample(), throwing)).toBe(false)
    expect(clearStart(throwing)).toBe(false)
    expect(loadStart(null).mode).toBe('unavailable')
  })

  it('没有数据 → empty；无法识别 → corrupt（调用方不覆盖原文）', () => {
    expect(loadStart(memStorage()).mode).toBe('empty')
    expect(loadStart(memStorage({ [START_KEY]: '{oops' })).mode).toBe('corrupt')
    expect(loadStart(memStorage({ [START_KEY]: JSON.stringify({ schemaVersion: 99 }) })).mode).toBe('corrupt')
  })

  it('超过 64KB 不写入', () => {
    const s = memStorage()
    const big = { ...sample(), assessedAt: 'x'.repeat(70 * 1024) }
    expect(saveStart(big, s)).toBe(false)
    expect(s.writes).toEqual([])
  })

  it('结果不持久化：保存的内容里没有 route / result', () => {
    const s = memStorage()
    saveStart(sample(), s)
    expect(s.data[START_KEY]).not.toMatch(/"route"|"result"|"reasonIds"/)
  })
})

describe('parseStartState', () => {
  it('rulesVersion 从 1 升到 2：已勾选的 stepId 仍然保留', () => {
    const r = parseStartState({ ...sample(), rulesVersion: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.rulesVersion).toBe(2)
      expect(r.state.steps['read-four-steps'].checked).toBe(true)
    }
  })

  it('题目版本变了：丢弃答案，保留清单和检查日', () => {
    const r = parseStartState({ ...sample(), questionnaireVersion: 2 })
    expect(r.ok && r.questionnaireChanged).toBe(true)
    if (r.ok) {
      expect(r.state.answers).toEqual({})
      expect(r.state.steps['read-four-steps']).toBeTruthy()
      expect(r.state.review?.anchor).toBe('2027-01-15')
    }
  })

  it('逐字段校验：非法答案、非法额度、29 日锚点被丢弃', () => {
    const r = parseStartState({
      ...sample(),
      answers: { q1: 'z', q2: 'a' },
      userResearchCapBps: 1000.5,
      review: { id: 'x', anchor: '2027-01-30', intervalMonths: 6, completedDates: [], calendarSequence: 0 },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.answers).toEqual({ q2: 'a' })
      expect(r.state.userResearchCapBps).toBeUndefined()
      expect(r.state.review).toBeUndefined()
    }
  })

  it('额度超过 2000 被丢弃；没有额度时不生成默认值', () => {
    const r = parseStartState({ ...sample(), userResearchCapBps: 2500 })
    expect(r.ok && r.state.userResearchCapBps).toBeUndefined()
    const r2 = parseStartState({ ...emptyState() })
    expect(r2.ok && 'userResearchCapBps' in r2.state).toBe(false)
  })

  it('步骤结构错 → 整体不认识（不当空状态覆盖）', () => {
    expect(parseStartState({ ...sample(), steps: { 'a b': { checked: true, at: 'x' } } }).ok).toBe(false)
    expect(parseStartState('text').ok).toBe(false)
  })
})
