import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TradingPhilosophy from './TradingPhilosophy'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage(): void {
  render(
    <MemoryRouter>
      <TradingPhilosophy />
    </MemoryRouter>,
  )
}

describe('TradingPhilosophy 章节目录', () => {
  it('是目录导航而非 tablist；所有章节按钮都在 Tab 顺序里', () => {
    renderPage()
    expect(screen.queryByRole('tablist')).toBeNull()
    const nav = screen.getByRole('navigation', { name: '章节' })
    const items = screen.getAllByRole('button').filter(b => nav.contains(b))
    expect(items.length).toBeGreaterThanOrEqual(9)
    for (const item of items) {
      expect(item.getAttribute('tabindex')).not.toBe('-1')
    }
    expect(items[0].getAttribute('aria-current')).toBe('true')
  })

  it('Tab 能离开章节目录进入正文控件', () => {
    renderPage()
    const nav = screen.getByRole('navigation', { name: '章节' })
    const first = screen.getAllByRole('button').find(b => nav.contains(b))!
    first.focus()
    expect(document.activeElement).toBe(first)

    // 模拟用户连按 Tab：目录内按钮都可聚焦，最后应离开目录
    let guard = 0
    while (nav.contains(document.activeElement) && guard < 20) {
      fireEvent.keyDown(document.activeElement!, { key: 'Tab', code: 'Tab' })
      // jsdom 不会自动移动焦点，手动移到下一个 tabindex>=0
      const focusables = Array.from(
        document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter(el => !el.hasAttribute('disabled') && el.tabIndex >= 0)
      const idx = focusables.indexOf(document.activeElement as HTMLElement)
      const next = focusables[idx + 1]
      next?.focus()
      guard++
    }
    expect(nav.contains(document.activeElement)).toBe(false)
  })

  it('点击章节更新 aria-current 并滚动', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    renderPage()
    const nav = screen.getByRole('navigation', { name: '章节' })
    const risk = screen.getAllByRole('button').find(b => nav.contains(b) && b.textContent?.includes('风险控制'))!
    fireEvent.click(risk)
    expect(risk.getAttribute('aria-current')).toBe('true')
    expect(scrollTo).toHaveBeenCalled()
  })
})
