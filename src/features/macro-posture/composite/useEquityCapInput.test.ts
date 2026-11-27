import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RECOMMENDED_EQUITY_CAP, useEquityCapInput } from './useEquityCapInput'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('useEquityCapInput', () => {
  it('合法值立即写入存储', () => {
    const { result } = renderHook(() => useEquityCapInput())
    act(() => result.current.onChange('55'))
    expect(result.current.cap).toBe(55)
    expect(result.current.draft).toBe('55')
    expect(result.current.error).toBeNull()
    expect(localStorage.getItem('mp-equity-cap')).toBe('55')
  })

  it('非法值保留原文且不存储，失焦校正并提示', () => {
    localStorage.setItem('mp-equity-cap', '80')
    const { result } = renderHook(() => useEquityCapInput())
    act(() => result.current.onChange('-20'))
    expect(result.current.draft).toBe('-20')
    expect(result.current.cap).toBe(80)
    expect(result.current.invalid).toBe(true)
    expect(localStorage.getItem('mp-equity-cap')).toBe('80')
    act(() => result.current.onBlur())
    expect(result.current.draft).toBe('0')
    expect(result.current.cap).toBe(0)
    expect(result.current.correction).toBe('已改为 0')
    expect(localStorage.getItem('mp-equity-cap')).toBe('0')
  })

  it('空值与字母失焦恢复上次有效值', () => {
    localStorage.setItem('mp-equity-cap', '70')
    const { result } = renderHook(() => useEquityCapInput())
    act(() => result.current.onChange(''))
    expect(localStorage.getItem('mp-equity-cap')).toBe('70')
    act(() => result.current.onBlur())
    expect(result.current.draft).toBe('70')
    act(() => result.current.onChange('abc'))
    act(() => result.current.onBlur())
    expect(result.current.draft).toBe('70')
    expect(localStorage.getItem('mp-equity-cap')).toBe('70')
  })

  it('reset 回到建议值', () => {
    const { result } = renderHook(() => useEquityCapInput())
    act(() => result.current.onChange('40'))
    act(() => result.current.reset())
    expect(result.current.cap).toBe(RECOMMENDED_EQUITY_CAP)
    expect(result.current.draft).toBe(String(RECOMMENDED_EQUITY_CAP))
    expect(localStorage.getItem('mp-equity-cap')).toBe(String(RECOMMENDED_EQUITY_CAP))
  })
})
