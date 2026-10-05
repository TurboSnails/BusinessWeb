import { describe, expect, it, vi } from 'vitest'
import { cachedKnowledgeApi } from './cache'
import type { KnowledgeApi } from './api'

const base = (): KnowledgeApi => ({
  status: vi.fn(async () => ({ vaultId: 'v', connected: true, vaultPath: '/v', directories: [] })),
  list: vi.fn(async () => [{ path: 'a.md', title: 'a' }]),
  search: vi.fn(async () => []),
  read: vi.fn(async (path: string) => ({ vaultId: 'v', path, title: path, content: '', version: '1' })),
  related: vi.fn(async () => ({ outgoing: [], backlinks: [] })),
  graph: vi.fn(async () => ({ vaultId: 'v', nodes: [], edges: [], unresolved: 0 })),
  write: vi.fn(async (path: string) => ({ vaultId: 'v', path, title: path, content: '', version: '2' })),
  inbox: vi.fn(async (date: string) => ({ vaultId: 'v', path: date, title: date, content: '', version: '2' })),
})

describe('知识库读取缓存', () => {
  it('同一底层 api 共用一份缓存，重复读取只请求一次，peek 可同步取到', async () => {
    const raw = base()
    const a = cachedKnowledgeApi(raw)
    expect(cachedKnowledgeApi(raw)).toBe(a)
    await a.list(); await a.list(); await a.read('x.md'); await a.read('x.md'); await a.read('y.md')
    expect(raw.list).toHaveBeenCalledTimes(1)
    expect(raw.read).toHaveBeenCalledTimes(2)
    expect(a.peek('list')).toEqual([{ path: 'a.md', title: 'a' }])
  })

  it('invalidate 后重新请求；失败不缓存', async () => {
    const raw = base()
    const a = cachedKnowledgeApi(raw)
    await a.status(); a.invalidate(); await a.status()
    expect(raw.status).toHaveBeenCalledTimes(2)
    ;(raw.graph as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'))
    await expect(a.graph!()).rejects.toThrow('down')
    await a.graph!()
    expect(raw.graph).toHaveBeenCalledTimes(2)
  })

  it('写入后清空缓存，避免读到旧列表', async () => {
    const raw = base()
    const a = cachedKnowledgeApi(raw)
    await a.list(); await a.write('a.md', '#', '1', 'v'); await a.list()
    expect(raw.list).toHaveBeenCalledTimes(2)
  })
})
