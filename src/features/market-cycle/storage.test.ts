import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadState, persistState, parseBackup, EMPTY_STATE } from './storage'
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
describe('周期记录持久化', () => {
  it('备份恢复校验版本、非有限数值和预算范围', () => {
    expect(parseBackup(JSON.stringify(EMPTY_STATE))).toEqual(EMPTY_STATE)
    expect(() => parseBackup(JSON.stringify({ ...EMPTY_STATE, schemaVersion: 2 }))).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...EMPTY_STATE, budgets: { csi300: { capital: 1, currentPosition: 101, maxPosition: 50, maxDrawdown: 20 } } }))).toThrow()
    expect(() => parseBackup('{ broken')).toThrow()
  })
  it('损坏记录不静默覆盖，存储失败向调用方抛出', () => {
    localStorage.setItem('businessweb.market-cycle.v1', 'broken')
    expect(loadState().error).toMatch(/无法读取/)
    expect(localStorage.getItem('businessweb.market-cycle.v1')).toBe('broken')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => persistState(EMPTY_STATE)).toThrow('quota')
  })
})
