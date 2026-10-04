import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import MyBooks from './MyBooks'

afterEach(cleanup)

const renderPage = () => render(<MemoryRouter><MyBooks /></MemoryRouter>)

describe('我的书', () => {
  it('卡片左侧仍是进入网页版的链接', () => {
    renderPage()
    const link = screen.getByRole('link', { name: /查看本书/ })
    expect(link.getAttribute('href')).toBe('/first-book/slow-is-fast')
  })

  it('右侧有 PDF 阅读入口：新标签打开，指向 first-book 下的 PDF', () => {
    renderPage()
    const read = screen.getByRole('link', { name: /阅读 PDF/ })
    expect(decodeURIComponent(read.getAttribute('href') ?? '')).toMatch(/first-book\/正念投资\.pdf$/)
    expect(read.getAttribute('target')).toBe('_blank')
    expect(read.getAttribute('rel')).toContain('noopener')
  })

  it('PDF 另有下载入口，带 download 属性', () => {
    renderPage()
    const dl = screen.getByRole('link', { name: /下载/ })
    expect(dl.hasAttribute('download')).toBe(true)
    expect(decodeURIComponent(dl.getAttribute('href') ?? '')).toMatch(/正念投资\.pdf$/)
  })

  it('标出页数与体积，方便手机用户决定是否下载', () => {
    renderPage()
    expect(screen.getByText(/235 页/)).toBeTruthy()
    expect(screen.getByText(/4\.8 ?MB/)).toBeTruthy()
  })

  it('链接不嵌套：没有 <a> 里再套 <a>', () => {
    const { container } = renderPage()
    expect(container.querySelectorAll('a a').length).toBe(0)
  })
})
