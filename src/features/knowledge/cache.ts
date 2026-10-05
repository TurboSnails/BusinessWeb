import { isCloudKnowledge } from './api'
import type { KnowledgeApi } from './api'

type ReadMethod = 'status' | 'list' | 'graph' | 'read' | 'related' | 'search'
const READS: ReadMethod[] = ['status', 'list', 'graph', 'read', 'related', 'search']

export interface CachedKnowledgeApi extends KnowledgeApi {
  /** 同步取已缓存的结果，切回页面时直接显示上次的数据 */
  peek<T>(method: ReadMethod, arg?: string): T | undefined
  /** 清空缓存，下一次读取重新请求（用户点「刷新」时调用） */
  invalidate(): void
}

// 同一个底层 api 只包一层，组件卸载再挂载（切走再切回）时共用这份缓存
const wrappers = new WeakMap<KnowledgeApi, CachedKnowledgeApi>()

export function cachedKnowledgeApi(api: KnowledgeApi): CachedKnowledgeApi {
  const existing = wrappers.get(api)
  if (existing) return existing
  const values = new Map<string, unknown>()
  const pending = new Map<string, Promise<unknown>>()
  // 本地 Vault 与云端副本是两份数据，缓存分开存
  const keyOf = (method: string, arg = ''): string => `${isCloudKnowledge() ? 'cloud' : 'local'}|${method}|${arg}`

  const memo = <T>(method: ReadMethod, arg: string | undefined, load: () => Promise<T>): Promise<T> => {
    const key = keyOf(method, arg)
    if (values.has(key)) return Promise.resolve(values.get(key) as T)
    const inflight = pending.get(key)
    if (inflight) return inflight as Promise<T>
    // 失败不缓存，下次读取重新请求
    const request = load().then(value => { values.set(key, value); return value }).finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
  const invalidate = (): void => { values.clear(); pending.clear() }

  const wrapper: CachedKnowledgeApi = {
    status: () => memo('status', undefined, () => api.status()),
    list: () => memo('list', undefined, () => api.list()),
    search: query => memo('search', query, () => api.search(query)),
    read: path => memo('read', path, () => api.read(path)),
    related: path => memo('related', path, () => api.related(path)),
    graph: api.graph ? () => memo('graph', undefined, () => api.graph!()) : undefined,
    write: async (...args) => { try { return await api.write(...args) } finally { invalidate() } },
    inbox: async (...args) => { try { return await api.inbox(...args) } finally { invalidate() } },
    peek: <T>(method: ReadMethod, arg?: string) => (READS.includes(method) ? values.get(keyOf(method, arg)) as T | undefined : undefined),
    invalidate,
  }
  wrappers.set(api, wrapper)
  return wrapper
}
