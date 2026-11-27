import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BackToTop from './BackToTop'

function mockMatchMedia(matchesReduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({
      matches: matchesReduce && String(q).includes('prefers-reduced-motion'),
      media: q,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
})

beforeEach(() => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0, writable: true })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  document.body.innerHTML = '<main id="main-content" tabindex="-1">正文</main>'
  mockMatchMedia(false)
})

function setScrollY(y: number): void {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y, writable: true })
  fireEvent.scroll(window)
}

describe('BackToTop', () => {
  it('滚过约两屏后才出现', () => {
    render(<BackToTop />)
    expect(screen.queryByRole('button', { name: '回到顶部' })).toBeNull()
    act(() => setScrollY(1599))
    expect(screen.queryByRole('button', { name: '回到顶部' })).toBeNull()
    act(() => setScrollY(1600))
    expect(screen.getByRole('button', { name: '回到顶部' })).toBeTruthy()
  })

  it('点击平滑回顶并把焦点移到主内容', () => {
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo as typeof window.scrollTo
    setScrollY(2000)
    render(<BackToTop />)
    fireEvent.click(screen.getByRole('button', { name: '回到顶部' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    act(() => {
      window.dispatchEvent(new Event('scrollend'))
    })
    expect(document.activeElement?.id).toBe('main-content')
  })

  it('prefers-reduced-motion 时直接跳顶', () => {
    mockMatchMedia(true)
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo as typeof window.scrollTo
    setScrollY(2000)
    render(<BackToTop />)
    fireEvent.click(screen.getByRole('button', { name: '回到顶部' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
    expect(document.activeElement?.id).toBe('main-content')
  })
})
