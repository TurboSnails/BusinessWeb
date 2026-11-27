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
  it('有「跳转到页面」搜索按钮', () => {
    renderAt('/')
    expect(screen.getAllByRole('button', { name: /跳转到页面/ }).length).toBeGreaterThan(0)
  })

  it('品牌名是Live，链接回首页', () => {
    renderAt('/invest')
    const brand = screen.getByRole('link', { name: /Live/ })
    expect(brand.getAttribute('href')).toBe('/')
  })

  it('主导航含博客与知识图谱', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: '主导航' })
    expect(within(nav).getAllByRole('link').map(a => a.textContent)).toEqual([
      '首页', '投资', 'AI实验室', '博客', '知识图谱', '自由之路', '关于',
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

  it('抽屉：按 Esc 关闭并把焦点回到菜单按钮', () => {
    renderAt('/')
    const toggle = screen.getByRole('button', { name: '打开菜单' })
    fireEvent.click(toggle)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: '移动导航' })).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(toggle)
  })

  it('抽屉打开时给 main/footer 加 inert，Tab 不落到被遮住的页面', () => {
    const main = document.createElement('main')
    main.id = 'main-content'
    const pageBtn = document.createElement('button')
    pageBtn.textContent = '页面按钮'
    main.appendChild(pageBtn)
    const footer = document.createElement('footer')
    footer.className = 'site-footer'
    const footLink = document.createElement('a')
    footLink.href = '/about'
    footLink.textContent = '页脚'
    footer.appendChild(footLink)
    document.body.append(main, footer)

    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    expect(main.hasAttribute('inert')).toBe(true)
    expect(footer.hasAttribute('inert')).toBe(true)

    const drawer = screen.getByRole('navigation', { name: '移动导航' })
    const first = within(drawer).getByRole('link', { name: '首页' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(within(drawer).getByRole('link', { name: '投资' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(main.hasAttribute('inert')).toBe(false)
    expect(footer.hasAttribute('inert')).toBe(false)
    main.remove()
    footer.remove()
  })

  it('窄屏搜索按钮 aria-label 不带快捷键', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('max-width: 767px'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    renderAt('/')
    expect(screen.getByRole('button', { name: '跳转到页面' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /⌘K|Ctrl/ })).toBeNull()
    vi.unstubAllGlobals()
  })

  it('抽屉打开时屏幕变宽到桌面断点：自动关闭并恢复滚动', () => {
    let wideListener: ((e: { matches: boolean }) => void) | null = null
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        if (q.includes('min-width: 768px')) wideListener = cb
      },
      removeEventListener: () => {
        if (q.includes('min-width: 768px')) wideListener = null
      },
    }))
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    expect(document.body.style.overflow).toBe('hidden')
    expect(wideListener).not.toBeNull()
    act(() => { wideListener?.({ matches: true }) })
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
