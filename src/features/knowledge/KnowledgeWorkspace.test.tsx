import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KnowledgeWorkspace from './KnowledgeWorkspace'
import type { KnowledgeApi, Note } from './api'

const note: Note = { vaultId: 'd'.repeat(64), path: '01-Investment/META.md', title: 'META', content: '# META\n广告增长', version: 'a'.repeat(64) }
function api(overrides: Partial<KnowledgeApi> = {}): KnowledgeApi {
  return {
    status: async () => ({ connected: true, vaultId: 'd'.repeat(64), vaultPath: '/private/SecondBrain', directories: ['00-Inbox', '01-Investment'] }),
    list: async () => [{ ...note, excerpt: '广告增长' }], search: async () => [{ ...note, excerpt: '广告增长' }],
    read: async () => note, related: async () => ({ outgoing: [{ target: 'AI', label: 'AI', status: 'missing', path: null, candidates: [] }], backlinks: [] }),
    write: async (path, content) => ({ ...note, path, content, version: 'b'.repeat(64) }),
    inbox: async (date, content) => ({ vaultId: 'd'.repeat(64), path: `00-Inbox/${date}.md`, title: date, content, version: 'c'.repeat(64) }),
    ...overrides,
  }
}
afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks() })

describe('知识工作台', () => {
  it('云端只读副本可以阅读，但不能编辑、收集或保存', async () => {
    render(<KnowledgeWorkspace api={api({ status: async () => ({ connected: true, vaultId: note.vaultId, vaultPath: 'cloud:personal-brain', directories: [], source: 'cloud', readOnly: true }) })} />)
    fireEvent.click(await screen.findByRole('button', { name: /打开笔记 META/ }))
    expect(await screen.findByText('已连接云端资料库')).toBeTruthy()
    expect(screen.queryByLabelText('每日 Inbox')).toBeNull()
    expect(screen.queryByLabelText('Markdown 内容')).toBeNull()
    expect(screen.queryByRole('button', { name: '保存笔记' })).toBeNull()
    expect(screen.getByRole('button', { name: '新建笔记' })).toHaveProperty('disabled', true)
  })
  it('断线时提供启动说明，不能假装连接', async () => {
    render(<KnowledgeWorkspace api={api({ status: async () => { throw new Error('未连接') } })} />)
    expect(await screen.findByText('连接本地知识库')).toBeTruthy()
    expect(screen.getByText('npm run knowledge:app')).toBeTruthy()
    expect(screen.queryByText('已连接本地 Vault')).toBeNull()
  })
  it('读取真实笔记，保存携带原始版本，关联缺失明确呈现', async () => {
    const write = vi.fn(api().write)
    render(<KnowledgeWorkspace api={api({ write })} />)
    fireEvent.click(await screen.findByRole('button', { name: /打开笔记 META/ }))
    const editor = await screen.findByLabelText('Markdown 内容')
    expect((editor as HTMLTextAreaElement).value).toContain('广告增长')
    expect(await screen.findByText('未创建')).toBeTruthy()
    fireEvent.change(editor, { target: { value: '# META\n更新研究' } })
    fireEvent.click(screen.getByRole('button', { name: '保存笔记' }))
    await waitFor(() => expect(write).toHaveBeenCalledWith(note.path, '# META\n更新研究', note.version, note.vaultId))
    expect(await screen.findByText('已保存到 Markdown')).toBeTruthy()
  })
  it('保存冲突时保留草稿，刷新不会覆盖未保存内容', async () => {
    const client = api({ write: async () => { throw new Error('笔记已被修改') } })
    render(<KnowledgeWorkspace api={client} />)
    fireEvent.click(await screen.findByRole('button', { name: /打开笔记 META/ }))
    const editor = await screen.findByLabelText('Markdown 内容')
    fireEvent.change(editor, { target: { value: '我的草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '保存笔记' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '笔记已被修改')
    fireEvent.click(screen.getByRole('button', { name: '刷新知识库' }))
    await waitFor(() => expect((screen.getByLabelText('Markdown 内容') as HTMLTextAreaElement).value).toBe('我的草稿'))
    expect(screen.queryByText('已保存到 Markdown')).toBeNull()
  })
  it('新建笔记写入 null 版本，能搜索现有笔记', async () => {
    const write = vi.fn(api().write)
    const search = vi.fn(api().search)
    render(<KnowledgeWorkspace api={api({ write, search })} />)
    fireEvent.click(await screen.findByRole('button', { name: '新建笔记' }))
    fireEvent.change(screen.getByLabelText('笔记路径'), { target: { value: '02-AI/RAG.md' } })
    fireEvent.change(screen.getByLabelText('Markdown 内容'), { target: { value: '# RAG' } })
    fireEvent.click(screen.getByRole('button', { name: '保存笔记' }))
    await waitFor(() => expect(write).toHaveBeenCalledWith('02-AI/RAG.md', '# RAG', null, note.vaultId))
    fireEvent.change(screen.getByLabelText('搜索知识库'), { target: { value: '广告' } })
    fireEvent.submit(screen.getByRole('search'))
    await waitFor(() => expect(search).toHaveBeenCalledWith('广告'))
  })
  it('Inbox 失败保留输入，成功追加前读取版本', async () => {
    const inbox = vi.fn(async () => { throw new Error('Inbox 保存失败') })
    render(<KnowledgeWorkspace api={api({ inbox })} />)
    const input = await screen.findByLabelText('每日 Inbox')
    fireEvent.change(input, { target: { value: '今天的想法' } })
    fireEvent.click(screen.getByRole('button', { name: '记入 Inbox' }))
    await waitFor(() => expect(inbox).toHaveBeenCalled())
    expect(inbox.mock.calls[0]).toHaveLength(4)
    expect((screen.getByLabelText('每日 Inbox') as HTMLTextAreaElement).value).toBe('今天的想法')
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Inbox 保存失败')
  })
})

it('Vault 更换后不把旧库草稿写入新库，旧草稿仍留在旧库键下', async () => {
  let vaultPath = '/private/First'
  const write = vi.fn(api().write)
  const client = api({ status: async () => ({ connected: true, vaultId: vaultPath === '/private/First' ? 'd'.repeat(64) : 'e'.repeat(64), vaultPath, directories: [] }), write })
  render(<KnowledgeWorkspace api={client} />)
  fireEvent.click(await screen.findByRole('button', { name: /打开笔记 META/ }))
  fireEvent.change(await screen.findByLabelText('Markdown 内容'), { target: { value: '旧 Vault 的私人草稿' } })
  vaultPath = '/private/Second'
  fireEvent.click(screen.getByRole('button', { name: '刷新知识库' }))
  await waitFor(() => expect(screen.queryByLabelText('Markdown 内容')).toBeNull())
  expect(sessionStorage.getItem('knowledge-draft:/private/First')).toContain('旧 Vault 的私人草稿')
  expect(sessionStorage.getItem('knowledge-draft:/private/Second')).toBeNull()
  expect(write).not.toHaveBeenCalled()
})

it('未保存的本会话草稿在重新进入工作台后恢复', async () => {
  const first = render(<KnowledgeWorkspace api={api()} />)
  fireEvent.click(await screen.findByRole('button', { name: /打开笔记 META/ }))
  fireEvent.change(await screen.findByLabelText('Markdown 内容'), { target: { value: '保留草稿' } })
  first.unmount()
  render(<KnowledgeWorkspace api={api()} />)
  expect((await screen.findByLabelText('Markdown 内容') as HTMLTextAreaElement).value).toBe('保留草稿')
})

it('新笔记模板含实际换行', async () => {
  render(<KnowledgeWorkspace api={api()} />)
  fireEvent.click(await screen.findByRole('button', { name: '新建笔记' }))
  expect((screen.getByLabelText('Markdown 内容') as HTMLTextAreaElement).value).toBe('# 新笔记\n\n')
})
