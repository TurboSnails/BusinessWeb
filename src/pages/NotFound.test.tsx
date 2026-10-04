import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import NotFound from './NotFound'

afterEach(cleanup)

describe('NotFound', () => {
  it('说明页面不存在，并给出回首页和正念投资的链接', () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: '这一页不存在' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '回到首页' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: '去看《正念投资》' }).getAttribute('href')).toBe('/first-book')
  })

  it('作为 App 的兜底路由：未知路径渲染它，已知路径不渲染', () => {
    const tree = (path: string) => (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/ai" element={<p>AI 页</p>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>
    )
    const a = render(tree('/nope/deep/path'))
    expect(screen.getByText('这一页不存在')).toBeTruthy()
    a.unmount()
    render(tree('/ai'))
    expect(screen.queryByText('这一页不存在')).toBeNull()
  })

  it('App.tsx 确实注册了 path="*" 兜底路由', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../App.tsx'), 'utf8') as string
    expect(src).toMatch(/<Route path="\*" element=\{<NotFound \/>\} \/>/)
  })
})
