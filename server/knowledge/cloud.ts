import { timingSafeEqual } from 'node:crypto'
export class CloudError extends Error { constructor(public status: number, message: string) { super(message) } }
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export function authenticated(received: unknown, token: string | undefined): boolean {
  if (!token || token.length < 32 || typeof received !== 'string') return false
  const a = Buffer.from(received), b = Buffer.from(`Bearer ${token}`)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function cloudDatabase() {
  const key = process.env.SUPABASE_SECRET_KEY
  let origin: string
  try { const u = new URL(process.env.SUPABASE_URL || ''); if (u.protocol !== 'https:' || !u.hostname.endsWith('.supabase.co') || u.pathname !== '/' || u.search || u.hash || u.username || u.password || u.port) throw new Error(); origin = u.origin }
  catch { throw new CloudError(503, '资料库云端尚未配置') }
  if (!key) throw new CloudError(503, '资料库云端尚未配置')
  return async (route: string, method = 'GET', body?: unknown): Promise<unknown> => {
    const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' }
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000)
    try {
      const response = await fetch(`${origin}/rest/v1/${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, redirect: 'error' })
      if (!response.ok) throw new CloudError(502, '私人数据库请求失败，请检查迁移与服务配置')
      if (response.status === 204 || response.headers.get('content-length') === '0') return null
      const text = await response.text(); return text ? JSON.parse(text) : null
    } catch (e) { if (e instanceof CloudError) throw e; throw new CloudError(502, '私人数据库暂不可用') }
    finally { clearTimeout(timer) }
  }
}
export type Database = ReturnType<typeof cloudDatabase>
export type Head = { revision: number; generation: string | null; vault_id: string | null; graph: Record<string, unknown>; synced_at: string | null }
export async function readHead(db: Database): Promise<Head> {
  const result = await db('businessweb_knowledge_head?id=eq.1&select=revision,generation,vault_id,graph,synced_at')
  if (!Array.isArray(result) || result.length !== 1 || !object(result[0]) || !Number.isSafeInteger(result[0].revision)) throw new CloudError(502, '资料库迁移尚未完成')
  return result[0] as Head
}
export function validPath(path: unknown): path is string { return typeof path === 'string' && path.length <= 500 && path.endsWith('.md') && !path.includes('\\') && path.split('/').every(p => !!p && !p.startsWith('.') && !p.includes(':')) }
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
export function cloudVault(db: Database, head: Head) {
  if (!head.generation || !head.vault_id) throw new CloudError(503, '云端尚未同步笔记，请先从本机同步资料库')
  const generation = `generation=eq.${encodeURIComponent(head.generation)}`
  const metadata = 'path,title,excerpt,version,updatedAt:updated_at'
  const status = async () => ({ vaultId: head.vault_id!, vaultPath: 'cloud:personal-brain', directories: [], connected: true, readOnly: true, source: 'cloud', revision: head.revision, syncedAt: head.synced_at })
  const list = async () => {
    const notes: Record<string, unknown>[] = []
    for (let offset = 0; ; offset += 500) {
      const rows = await db(`businessweb_knowledge_notes?${generation}&select=${metadata}&order=path&limit=500&offset=${offset}`)
      if (!Array.isArray(rows)) throw new CloudError(502, '资料列表无效')
      notes.push(...rows)
      if (rows.length < 500) break
      if (notes.length > 10000) throw new CloudError(413, '资料库过大，需要分页升级')
    }
    return notes
  }
  const search = async (query: string, investment = false) => {
    if (query.length > 500) throw new CloudError(400, '搜索词过长')
    const result = await db('rpc/businessweb_search_knowledge', 'POST', { next_generation: head.generation, query_text: query, investment_only: investment })
    if (!Array.isArray(result)) throw new CloudError(502, '搜索结果无效')
    return result as Record<string, unknown>[]
  }
  const stored = async (path: string) => {
    if (!validPath(path)) throw new CloudError(400, '笔记路径无效')
    const result = await db(`businessweb_knowledge_notes?${generation}&path=eq.${encodeURIComponent(path)}&select=payload`)
    if (!Array.isArray(result) || !result.length) throw new CloudError(404, '笔记不存在')
    if (!object(result[0]) || !object(result[0].payload)) throw new CloudError(502, '笔记结构无效')
    return result[0].payload
  }
  return { status, list: () => list(), search: (q: string) => search(q), searchInvestment: (q: string) => search(q, true), read: async (path: string) => (await stored(path)).note, related: async (path: string) => (await stored(path)).relations, graph: async () => head.graph }
}
