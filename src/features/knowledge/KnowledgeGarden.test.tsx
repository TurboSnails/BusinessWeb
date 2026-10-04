import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import KnowledgeGarden from './KnowledgeGarden'
import type { KnowledgeApi } from './api'

describe('蒲公英知识网络', () => {
  it('shows real counts, narrows to neighbors and opens the original note', async () => {
    const onOpen = vi.fn()
    const api = { graph: async () => ({ vaultId: 'brain', nodes: [{ path: 'AI/A.md', title: 'RAG' }, { path: 'AI/B.md', title: 'Embedding' }, { path: 'Life/C.md', title: 'Diary' }], edges: [{ source: 'AI/A.md', target: 'AI/B.md' }], unresolved: 1 }) } as KnowledgeApi
    render(<KnowledgeGarden api={api} vaultId="brain" onOpen={onOpen} />)
    expect(await screen.findByText('3 篇笔记 · 1 条真实引用 · 1 处未解析引用')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '聚焦 RAG' }))
    expect(screen.queryByRole('button', { name: '聚焦 Diary' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '阅读这篇笔记' }))
    expect(onOpen).toHaveBeenCalledWith('AI/A.md')
    fireEvent.click(screen.getByRole('button', { name: '返回全景' }))
    expect(screen.getByRole('button', { name: '聚焦 Diary' })).toBeTruthy()
  })
  it('never substitutes demo notes for an unavailable private Vault', () => {
    render(<KnowledgeGarden api={{} as KnowledgeApi} onOpen={() => {}} />)
    expect(screen.getByText('连接资料库，让蒲公英生长。')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /聚焦/ })).toBeNull()
  })
})
