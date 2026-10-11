import { findSearchablePage } from '../../data/siteMap'

export const RECENT_PAGES_KEY = 'businessweb.recent-pages.v1'
const MAX = 6

// 只记录跳转面板能搜到的页面；首页本身不算「最近访问」
const trackable = (path: unknown): path is string =>
  typeof path === 'string' && path !== '/' && findSearchablePage(path) !== null

export function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_PAGES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(trackable).slice(0, MAX) : []
  } catch {
    return []
  }
}

export function pushRecent(path: string): void {
  if (!trackable(path)) return
  try {
    const next = [path, ...readRecent().filter(p => p !== path)].slice(0, MAX)
    localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(next))
  } catch {
    // 存储不可用时静默放弃：最近访问只是便利功能
  }
}
