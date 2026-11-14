// 财报前瞻 earnings-calendar.json 的共享读取：公司页徽章、候选池「财报临近」与「本周变化」共用一次请求。
// 模块级缓存：在公司之间切换不重复请求；成功后整页会话内复用，失败不缓存（下次挂载再试）。
// 所有调用方都卸载（signal 中止）且请求还没完成时，中止这次请求并清掉缓存。
import { useEffect, useState } from 'react'
import { asEarningsCalendar, type EarningsCalendar } from './model'

interface Pending { promise: Promise<EarningsCalendar | null>; controller: AbortController; users: number; done: boolean }
let pending: Pending | null = null
let loaded: EarningsCalendar | null = null

const url = (): string => `${import.meta.env.BASE_URL}data/earnings-calendar.json`

/** 读取并解析财报日历；失败或文件形状不对时返回 null。signal 中止后结果对该调用方无意义（返回 null）。 */
export function loadEarningsCalendar(signal?: AbortSignal): Promise<EarningsCalendar | null> {
  if (loaded) return Promise.resolve(loaded)
  if (!pending) {
    const controller = new AbortController()
    const entry: Pending = {
      controller, users: 0, done: false,
      promise: fetch(url(), { cache: 'no-cache', signal: controller.signal })
        .then(res => (res.ok ? res.json() : null))
        .then(body => asEarningsCalendar(body))
        .catch(() => null)
        .then(cal => {
          entry.done = true
          if (cal) loaded = cal
          if (pending === entry) pending = null
          return cal
        }),
    }
    pending = entry
  }
  const entry = pending
  entry.users += 1
  signal?.addEventListener('abort', () => {
    entry.users -= 1
    if (entry.users <= 0 && !entry.done) {
      entry.controller.abort()
      if (pending === entry) pending = null
    }
  }, { once: true })
  return entry.promise.then(cal => (signal?.aborted ? null : cal))
}

/** 测试用：清掉模块级缓存 */
export function resetEarningsCalendarCache(): void { pending?.controller.abort(); pending = null; loaded = null }

export interface EarningsCalendarState { cal: EarningsCalendar | null; loading: boolean }

/** 组件里读财报日历；卸载时中止（其他调用方仍在等时不影响它们） */
export function useEarningsCalendar(enabled = true): EarningsCalendarState {
  const [state, setState] = useState<EarningsCalendarState>(() => ({ cal: loaded, loading: enabled && !loaded }))
  useEffect(() => {
    if (!enabled) return
    if (loaded) { setState({ cal: loaded, loading: false }); return }
    const controller = new AbortController()
    void loadEarningsCalendar(controller.signal).then(cal => { if (!controller.signal.aborted) setState({ cal, loading: false }) })
    return () => controller.abort()
  }, [enabled])
  return state
}
