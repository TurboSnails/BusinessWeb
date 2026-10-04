import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MarkdownPreview from './MarkdownPreview'
afterEach(cleanup)
it('安全显示 Markdown，wikilink 只打开已解析笔记，不执行 HTML', () => {
  const open = vi.fn()
  const { container } = render(<MarkdownPreview content={'# 研究\n[[AI|人工智能]]\n<img src=x onerror=alert(1)>\n```\n[[AI]]\n```'} relations={{ outgoing: [{ target: 'AI', label: '人工智能', status: 'resolved', path: 'AI.md', candidates: ['AI.md'] }], backlinks: [] }} onOpen={open} />)
  fireEvent.click(screen.getByRole('button', { name: '人工智能' }))
  expect(open).toHaveBeenCalledWith('AI.md')
  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('pre')?.textContent).toBe('[[AI]]')
  expect(screen.getByRole('heading', { name: '研究' })).toBeTruthy()
})
