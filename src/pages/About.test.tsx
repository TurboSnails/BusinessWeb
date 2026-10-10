import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import About from './About'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mockFetchOnce = (impl: (url: string) => Promise<Response>): void => {
  vi.stubGlobal('fetch', ((url: string) => impl(url)) as typeof fetch)
}

describe('About 页面：站点介绍', () => {
  it('标题是关于「Live」，不再是 Hassan 投资工作台', () => {
    mockFetchOnce(() => new Promise(() => {}))
    render(<MemoryRouter><About /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 2, name: '关于「Live」' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Hassan 投资工作台/)
  })

  it('介绍里列出三个栏目，并链接到对应页面', () => {
    mockFetchOnce(() => new Promise(() => {}))
    render(<MemoryRouter><About /></MemoryRouter>)
    const hrefs = ['/invest', '/ai', '/life']
    for (const h of hrefs) {
      expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === h), h).toBe(true)
    }
  })

  it('保留免责声明', () => {
    mockFetchOnce(() => new Promise(() => {}))
    render(<MemoryRouter><About /></MemoryRouter>)
    expect(screen.getByText(/不构成投资建议/)).toBeTruthy()
  })
})
