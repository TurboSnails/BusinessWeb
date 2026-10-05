export interface Note {
  vaultId: string
  path: string
  title: string
  content: string
  version: string | null
  updatedAt?: string
}
export interface NoteInfo { vaultId?: string; path: string; title: string; excerpt?: string; version?: string | null; updatedAt?: string }
export interface VaultStatus { vaultId: string; connected: boolean; vaultPath: string; directories: string[]; readOnly?: boolean; source?: 'cloud'; syncedAt?: string; revision?: number }
export interface NoteLink { target: string; label: string; heading?: string; status: 'resolved' | 'missing' | 'ambiguous' | 'attachment'; path: string | null; candidates: string[] }
export interface Relations { outgoing: NoteLink[]; backlinks: NoteInfo[] }
export interface KnowledgeGraph { vaultId: string; nodes: { path: string; title: string }[]; edges: { source: string; target: string }[]; unresolved: number }
export interface KnowledgeApi {
  status(): Promise<VaultStatus>
  list(): Promise<NoteInfo[]>
  search(query: string): Promise<NoteInfo[]>
  read(path: string): Promise<Note>
  related(path: string): Promise<Relations>
  graph?(): Promise<KnowledgeGraph>
  write(path: string, content: string, version: string | null, vaultId: string): Promise<Note>
  inbox(date: string, content: string, version: string | null, vaultId: string): Promise<Note>
}
export class KnowledgeApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message) }
}
export const isCloudKnowledge = (): boolean => !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
export const cloudTokenKey = 'knowledge-cloud-token'
async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const cloud = isCloudKnowledge()
  const token = cloud ? sessionStorage.getItem(cloudTokenKey) : null
  if (cloud && !token) throw new KnowledgeApiError('请先解锁私人资料库。', 401)
  if (cloud && method !== 'GET') throw new KnowledgeApiError('云端副本只读，请在 Obsidian 修改后同步。', 403)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const base = import.meta.env.BASE_URL || '/'
    const [action, params] = path.split('?')
    const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
    const url = cloud ? `${apiBase}/api/knowledge?action=${action}${params ? '&' + params : ''}` : `${base}api/knowledge/${path}`
    const response = await fetch(url, {
      method, signal: controller.signal, cache: 'no-store',
      headers: cloud ? { Authorization: `Bearer ${token}` } : data === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    let result
    try { result = await response.json() } catch { throw new KnowledgeApiError('知识服务未连接，请运行 npm run knowledge:app。', response.status) }
    if (!response.ok) throw new KnowledgeApiError(result.error || '知识服务请求失败', response.status, result.code)
    if (typeof result !== 'object' || result === null) throw new KnowledgeApiError('知识服务返回格式无效', 502)
    return result as T
  } catch (error) {
    if (error instanceof KnowledgeApiError) throw error
    throw new KnowledgeApiError(controller.signal.aborted ? '知识服务请求超时，请稍后重试。' : cloud ? '无法连接云端资料库，请检查服务状态。' : '无法连接本地知识服务，请检查启动状态。', 503)
  } finally { clearTimeout(timeout) }
}
export const knowledgeApi: KnowledgeApi = {
  status: () => request('status'), list: () => request('notes'),
  search: query => request(`search?q=${encodeURIComponent(query)}`),
  read: path => request(`note?path=${encodeURIComponent(path)}`),
  related: path => request(`related?path=${encodeURIComponent(path)}`),
  graph: () => request('graph'),
  write: (path, content, version, vaultId) => request('note', 'PUT', { path, content, version, vaultId }),
  inbox: (date, content, version, vaultId) => request('inbox', 'POST', { date, content, version, vaultId }),
}
export const errorText = (error: unknown): string => error instanceof Error ? error.message : '操作失败，请重试'
