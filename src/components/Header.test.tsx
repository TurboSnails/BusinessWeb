import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Header from './Header'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>
  )

describe('Header', () => {
  it('品牌名是Live，链接回首页', () => {
    renderAt('/invest')
    const brand = screen.getByRole('link', { name: /Live/ })
    expect(brand.getAttribute('href')).toBe('/')
  })

  it('主导航含知识图谱，共 6 项', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: '主导航' })
    expect(within(nav).getAllByRole('link').map(a => a.textContent)).toEqual([
      '首页', '投资', 'AI实验室', '知识图谱', '自由空间', '关于',
    ])
  })

  it('旧页面路径点亮「投资」', () => {
    renderAt('/sector-rotation')
    const nav = screen.getByRole('navigation', { name: '主导航' })
    const active = within(nav).getAllByRole('link').filter(a => a.getAttribute('aria-current') === 'page')
    expect(active.map(a => a.textContent)).toEqual(['投资'])
  })

  it('未知路径没有高亮项且不报错', () => {
    renderAt('/nope')
    const nav = screen.getByRole('navigation', { name: '主导航' })
    const active = within(nav).getAllByRole('link').filter(a => a.getAttribute('aria-current') === 'page')
    expect(active).toHaveLength(0)
  })

  it('抽屉：默认不渲染，点按钮打开并锁定滚动，再点关闭并恢复', () => {
    renderAt('/')
    expect(screen.queryByRole('navigation', { name: '移动导航' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    expect(screen.getByRole('navigation', { name: '移动导航' })).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: '关闭菜单' }))
    expect(screen.queryByRole('navigation', { name: '移动导航' })).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('抽屉：点链接后关闭', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    const drawer = screen.getByRole('navigation', { name: '移动导航' })
    fireEvent.click(within(drawer).getByRole('link', { name: '投资' }))
    expect(screen.queryByRole('navigation', { name: '移动导航' })).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('抽屉：按 Esc 关闭', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: '移动导航' })).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('抽屉打开时屏幕变宽到桌面断点：自动关闭并恢复滚动', () => {
    let listener: ((e: { matches: boolean }) => void) | null = null
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listener = cb },
      removeEventListener: () => { listener = null },
    }))
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    expect(document.body.style.overflow).toBe('hidden')
    expect(listener).not.toBeNull()
    act(() => { listener?.({ matches: true }) })
    expect(screen.queryByRole('navigation', { name: '移动导航' })).toBeNull()
    expect(document.body.style.overflow).toBe('')
    vi.unstubAllGlobals()
  })
})

it('知识中心点亮桌面与移动导航', () => {
  renderAt('/knowledge')
  expect(screen.getByRole('link', { name: '知识图谱' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
  const drawer = screen.getByRole('navigation', { name: '移动导航' })
  expect(within(drawer).getByRole('link', { name: '知识图谱' }).getAttribute('aria-current')).toBe('page')
})
