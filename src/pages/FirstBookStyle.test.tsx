import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FirstBook from './FirstBook'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('书稿阅读页样式钩子', () => {
  it('章节正文使用 book-reader，翻页区使用 book-pager', async () => {
    vi.stubGlobal('fetch', (async () => ({ ok: true, text: async () => '# 标题\n\n正文一段。' })) as unknown as typeof fetch)
    const { container } = render(
      <MemoryRouter initialEntries={[`/first-book/${encodeURIComponent('开篇-美好的愿望.md')}`]}>
        <Routes>
          <Route path="/first-book/:file" element={<FirstBook />} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('正文一段。')).toBeTruthy())
    expect(container.querySelector('.book-reader')).toBeTruthy()
    expect(container.querySelector('.book-pager')).toBeTruthy()
  })
})
