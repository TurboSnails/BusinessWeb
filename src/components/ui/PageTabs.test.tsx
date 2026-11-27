import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageTabs } from './PageTabs'

afterEach(cleanup)

const ITEMS = [
  { id: 'a', label: '总览' },
  { id: 'b', label: '配置' },
  { id: 'c', label: '复盘' },
] as const

function Harness({ initial = 'a' as const }: { initial?: 'a' | 'b' | 'c' } = {}): JSX.Element {
  const [v, setV] = useState<'a' | 'b' | 'c'>(initial)
  return <PageTabs items={[...ITEMS]} value={v} onChange={setV} label="测试页签" />
}

describe('PageTabs 键盘操作', () => {
  it('只有当前页签在 Tab 顺序里', () => {
    render(<Harness />)
    expect(screen.getByRole('tab', { name: '总览' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('tab', { name: '配置' }).getAttribute('tabindex')).toBe('-1')
  })

  it('方向键循环切换并移动焦点，Home/End 跳到首尾', () => {
    render(<Harness />)
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: '配置' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '配置' }))
    expect(screen.getByRole('tab', { name: '配置' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('tab', { name: '总览' }).getAttribute('tabindex')).toBe('-1')
    fireEvent.keyDown(list, { key: 'End' })
    expect(screen.getByRole('tab', { name: '复盘' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '复盘' }))
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: '总览' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: '复盘' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(screen.getByRole('tab', { name: '总览' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '总览' }))
  })

  it('其他按键不拦截', () => {
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' })
    expect(screen.getByRole('tab', { name: '总览' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('PageTabs 分组', () => {
  const GROUPED = [
    { id: 'overview', label: '温度总览' },
    { id: 'us', label: '美股市场', group: '市场', shortLabel: '美股' },
    { id: 'cn', label: '中国市场', group: '市场', shortLabel: '中国' },
    { id: 'macro', label: '美国宏观', group: '宏观', shortLabel: '美国' },
  ] as const

  function GroupHarness({ initial = 'overview' as const }: { initial?: typeof GROUPED[number]['id'] } = {}): JSX.Element {
    const [v, setV] = useState<typeof GROUPED[number]['id']>(initial)
    return <PageTabs items={[...GROUPED]} value={v} onChange={setV} label="分组页签" />
  }

  it('同组前显示分组名，短名可见，完整名在 aria-label', () => {
    render(<GroupHarness />)
    expect(screen.getByText('市场')).toBeTruthy()
    expect(screen.getByText('宏观')).toBeTruthy()
    const us = screen.getByRole('tab', { name: '美股市场' })
    expect(us.textContent).toContain('美股')
    expect(us.getAttribute('aria-label')).toBe('美股市场')
    expect(us.getAttribute('title')).toBe('美股市场')
    expect(screen.getByRole('tab', { name: '温度总览' }).getAttribute('aria-label')).toBeNull()
  })

  it('分组名 presentation，不进入 Tab 顺序；方向键跳过分组名', () => {
    render(<GroupHarness />)
    const market = screen.getByText('市场')
    expect(market.getAttribute('role')).toBe('presentation')
    expect(market.closest('[tabindex]')).toBeNull()
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: '美股市场' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '美股市场' }))
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: '中国市场' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(list, { key: 'End' })
    expect(screen.getByRole('tab', { name: '美国宏观' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(screen.getByRole('tab', { name: '温度总览' }).getAttribute('aria-selected')).toBe('true')
  })

  it('未传 group 时不渲染分组样式类', () => {
    render(<Harness />)
    expect(screen.getByRole('tablist').className).not.toContain('page-tabs__inner--grouped')
  })
})

describe('PageTabs 当前项入可视区', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    })
    vi.stubGlobal('MutationObserver', class {
      observe() {}
      disconnect() {}
      takeRecords() { return [] }
    })
  })

  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    vi.unstubAllGlobals()
  })

  it('切换时设置容器 scrollLeft，且不调用 scrollIntoView', () => {
    const intoView = vi.fn()
    Element.prototype.scrollIntoView = intoView

    render(<Harness initial="a" />)
    const list = screen.getByRole('tablist')
    let left = 0
    Object.defineProperty(list, 'clientWidth', { configurable: true, get: () => 100 })
    Object.defineProperty(list, 'scrollWidth', { configurable: true, get: () => 400 })
    Object.defineProperty(list, 'scrollLeft', {
      configurable: true,
      get: () => left,
      set: (v: number) => { left = v },
    })

    const tabC = screen.getByRole('tab', { name: '复盘' })
    Object.defineProperty(tabC, 'offsetLeft', { configurable: true, get: () => 280 })
    Object.defineProperty(tabC, 'offsetWidth', { configurable: true, get: () => 80 })
    Object.defineProperty(tabC, 'offsetParent', { configurable: true, get: () => list })

    fireEvent.click(tabC)
    // target = 280 + 40 - 50 = 270
    expect(left).toBe(270)
    expect(intoView).not.toHaveBeenCalled()
  })
})
