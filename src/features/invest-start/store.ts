// 唯一写入键 start:v1。所有存取都包 try/catch：隐私模式或存储被禁时页面照常可用（内存模式）。
// 绝不写 plan2026:*，清除只清 start:v1，不清空整个本机存储。
import { parseStartState } from './validation'
import type { StartState } from './types'

export const START_KEY = 'start:v1'
/** 本机 payload 上限（arch-r2 §3 性能预算） */
export const MAX_PAYLOAD_BYTES = 64 * 1024

/**
 * ok：读到合法数据；empty：没有数据；corrupt：有数据但不认识（保留原文，不覆盖）；
 * unavailable：浏览器不允许读本机存储。
 */
export type LoadMode = 'ok' | 'empty' | 'corrupt' | 'unavailable'
export interface LoadResult { mode: LoadMode; state: StartState | null; questionnaireChanged: boolean }

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const storage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadStart(s: StorageLike | null = storage()): LoadResult {
  if (!s) return { mode: 'unavailable', state: null, questionnaireChanged: false }
  let raw: string | null
  try {
    raw = s.getItem(START_KEY)
  } catch {
    return { mode: 'unavailable', state: null, questionnaireChanged: false }
  }
  if (raw === null) return { mode: 'empty', state: null, questionnaireChanged: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { mode: 'corrupt', state: null, questionnaireChanged: false }
  }
  const r = parseStartState(parsed)
  return r.ok ? { mode: 'ok', state: r.state, questionnaireChanged: r.questionnaireChanged } : { mode: 'corrupt', state: null, questionnaireChanged: false }
}

/** 写入 start:v1；失败（配额、隐私模式、超出上限）返回 false，不抛错 */
export function saveStart(state: StartState, s: StorageLike | null = storage()): boolean {
  if (!s) return false
  try {
    const text = JSON.stringify(state)
    if (new TextEncoder().encode(text).length > MAX_PAYLOAD_BYTES) return false
    s.setItem(START_KEY, text)
    return true
  } catch {
    return false
  }
}

/** 只清本页的 start:v1；投资计划页的 plan2026:* 与其他页面数据不动 */
export function clearStart(s: StorageLike | null = storage()): boolean {
  if (!s) return false
  try {
    s.removeItem(START_KEY)
    return true
  } catch {
    return false
  }
}
