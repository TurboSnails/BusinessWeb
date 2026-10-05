import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import handler from '../../../api/knowledge'
import { cloudDatabase, cloudVault } from '../../../server/knowledge/cloud'
const owner = 'owner'.repeat(10), ai = 'agent'.repeat(10), upload = 'upload'.repeat(10)
const response = () => ({ code: 0, body: null as unknown, headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k] = v }, status(code: number) { this.code = code; return this }, json(body: unknown) { this.body = body; return this } })
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test')
  vi.stubEnv('KNOWLEDGE_READ_TOKEN', owner)
  vi.stubEnv('KNOWLEDGE_MCP_TOKEN', ai)
  vi.stubEnv('KNOWLEDGE_UPLOAD_TOKEN', upload)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
it('认证失败不访问数据库或泄漏笔记信息', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  const res = response(); await handler({ method: 'GET', headers: {}, query: { action: 'status' } }, res)
  expect(res.code).toBe(401); expect(fetcher).not.toHaveBeenCalled()
})
it('AI 只读凭据不能上传资料', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  const res = response(); await handler({ method: 'POST', headers: { authorization: `Bearer ${ai}` }, query: { action: 'batch' }, body: {} }, res)
  expect(res.code).toBe(401); expect(fetcher).not.toHaveBeenCalled()
})
it('读取已提交云端快照状态，不假装本地连接', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify([{ revision: 2, vault_id: 'a'.repeat(64), generation: '11111111-1111-4111-8111-111111111111', graph: { nodes: [{ path: 'AI.md' }] }, synced_at: '2026-10-05T00:00:00Z' }])))
  const res = response(); await handler({ method: 'GET', headers: { authorization: `Bearer ${owner}` }, query: { action: 'status' } }, res)
  expect(res.code).toBe(200); expect(res.body).toMatchObject({ connected: true, readOnly: true, source: 'cloud', revision: 2 })
})
it('缺失服务端配置返回 503', async () => {
  vi.stubEnv('SUPABASE_SECRET_KEY', '')
  const res = response(); await handler({ method: 'GET', headers: {}, query: { action: 'status' } }, res)
  expect(res.code).toBe(503)
})
it('过大的 MCP 请求在访问数据库前拒绝', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  const res = response(); await handler({ method: 'POST', headers: { authorization: `Bearer ${ai}` }, query: { action: 'mcp' }, body: { id: 'x'.repeat(65536) } }, res)
  expect(res.code).toBe(413); expect(fetcher).not.toHaveBeenCalled()
})
it('超过 1000 篇资料也能完整读取目录', async () => {
  vi.stubGlobal('fetch', async (url: string) => {
    const offset = Number(new URL(url).searchParams.get('offset'))
    return new Response(JSON.stringify(Array.from({ length: offset === 1000 ? 227 : 500 }, (_, i) => ({ path: `${offset + i}.md`, title: String(offset + i) }))))
  })
  const vault = cloudVault(cloudDatabase(), { revision: 1, generation: '11111111-1111-4111-8111-111111111111', vault_id: 'a'.repeat(64), graph: {}, synced_at: null })
  expect(await vault.list()).toHaveLength(1227)
})
it('搜索按字面处理百分号、星号，不把用户输入改成数据库通配符', async () => {
  const requests: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { requests.push({ url, body: init.body && JSON.parse(String(init.body)) }); return new Response('[]') })
  const vault = cloudVault(cloudDatabase(), { revision: 1, generation: '11111111-1111-4111-8111-111111111111', vault_id: 'a'.repeat(64), graph: {}, synced_at: null })
  await vault.search('增长 100% *')
  expect(requests[0].body).toMatchObject({ query_text: '增长 100% *' })
})
