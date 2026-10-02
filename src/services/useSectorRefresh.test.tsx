import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSectorRefresh } from './useSectorRefresh'
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
it('挂载/切回不立即请求，30秒只刷新最近有效日期，离开即停止', async () => {
  vi.useFakeTimers()
  const refresh = vi.fn(async (_date: string, _signal: AbortSignal) => {})
  const first = renderHook(() => useSectorRefresh(['2026-09-29', '2026-09-30'], refresh))
  expect(refresh).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(refresh.mock.calls[0][0]).toBe('2026-09-30')
  const signal = refresh.mock.calls[0][1]
  first.unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(refresh).toHaveBeenCalledTimes(1)
  const second = renderHook(() => useSectorRefresh(['2026-09-30'], refresh))
  expect(refresh).toHaveBeenCalledTimes(1)
  second.unmount()
})
it('后台页面不请求，慢请求不重叠', async () => {
  vi.useFakeTimers()
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  let finish!: () => void
  const refresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const view = renderHook(() => useSectorRefresh(['2026-09-30'], refresh))
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(refresh).not.toHaveBeenCalled()
  visibility.mockReturnValue('visible')
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000) })
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(async () => { finish() })
  view.unmount()
})
