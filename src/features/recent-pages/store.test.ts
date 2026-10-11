import { afterEach, describe, expect, it, vi } from 'vitest'
import { RECENT_PAGES_KEY, pushRecent, readRecent } from './store'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('recent pages', () => {
  it('最新在前、去重、最多 6 条', () => {
    for (const p of ['/dcf', '/valuation', '/monitor', '/dcf', '/pulse', '/invest', '/knowledge', '/about']) pushRecent(p)
    expect(readRecent()).toEqual(['/about', '/knowledge', '/invest', '/pulse', '/dcf', '/monitor'])
  })
  it('首页与注册表外的路径不记录', () => {
    pushRecent('/'); pushRecent('/research-notes/us/AAPL'); pushRecent('/nope')
    expect(readRecent()).toEqual([])
  })
  it('存储里的脏数据被过滤', () => {
    localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(['/dcf', 3, '/gone', null]))
    expect(readRecent()).toEqual(['/dcf'])
    localStorage.setItem(RECENT_PAGES_KEY, '{bad json')
    expect(readRecent()).toEqual([])
  })
  it('localStorage 抛错时返回空数组，写入不抛', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(readRecent()).toEqual([])
    expect(() => pushRecent('/dcf')).not.toThrow()
  })
})
