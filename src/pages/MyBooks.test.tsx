import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import MyBooks from './MyBooks'

afterEach(cleanup)

const renderPage = (showPdf?: boolean) => render(<MemoryRouter><MyBooks showPdf={showPdf} /></MemoryRouter>)

describe('我的书', () => {
  it('卡片左侧仍是进入网页版的链接', () => {
    renderPage()
    const link = screen.getByRole('link', { name: /查看本书/ })
    expect(link.getAttribute('href')).toBe('/first-book/slow-is-fast')
  })

  it('右侧有 PDF 阅读入口：新标签打开，指向 first-book 下的 PDF', () => {
    renderPage(true)
    const read = screen.getByRole('link', { name: /阅读 PDF/ })
    expect(decodeURIComponent(read.getAttribute('href') ?? '')).toMatch(/first-book\/正念投资\.pdf$/)
    expect(read.getAttribute('target')).toBe('_blank')
    expect(read.getAttribute('rel')).toContain('noopener')
  })

  it('PDF 另有下载入口，带 download 属性', () => {
    renderPage(true)
    const dl = screen.getByRole('link', { name: /下载/ })
    expect(dl.hasAttribute('download')).toBe(true)
    expect(decodeURIComponent(dl.getAttribute('href') ?? '')).toMatch(/正念投资\.pdf$/)
  })

  it('标出页数与体积，方便手机用户决定是否下载', () => {
    renderPage(true)
    expect(screen.getByText(/235 页/)).toBeTruthy()
    expect(screen.getByText(/4\.8 ?MB/)).toBeTruthy()
  })

  it('链接不嵌套：没有 <a> 里再套 <a>', () => {
    const { container } = renderPage(true)
    expect(container.querySelectorAll('a a').length).toBe(0)
  })

  it('默认隐藏 PDF 入口：页面上没有 PDF 面板、PDF 链接和下载按钮', () => {
    const { container } = renderPage()
    expect(container.querySelector('.book-card__pdf')).toBeNull()
    expect(screen.queryByRole('link', { name: /阅读 PDF/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /下载/ })).toBeNull()
    expect(container.innerHTML).not.toMatch(/\.pdf/)
    expect(screen.queryByText(/235 页/)).toBeNull()
  })

  it('隐藏 PDF 时网页版入口不受影响', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /查看本书/ }).getAttribute('href')).toBe('/first-book/slow-is-fast')
  })
})
