import { afterEach, describe, expect, it, vi } from 'vitest'
import { knowledgeApi, KnowledgeApiError } from './api'
afterEach(() => vi.unstubAllGlobals())
describe('知识 API', () => {
  it('编码路径并将版本传入 JSON，不在前端存放服务凭据', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ path: '投资/META.md', content: 'x', version: 'v' }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await knowledgeApi.read('投资/META.md')
    expect(fetcher.mock.calls[0][0]).toContain(encodeURIComponent('投资/META.md'))
    await knowledgeApi.write('a.md', '# a', null, 'd'.repeat(64))
    const init = fetcher.mock.calls[1][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ path: 'a.md', content: '# a', version: null, vaultId: 'd'.repeat(64) })
    expect(init.headers).not.toHaveProperty('Authorization')
  })
  it('保留服务错误码，HTML 回退不能假装成功', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: '笔记已被修改', code: 'CONFLICT' }), { status: 409 }))
    await expect(knowledgeApi.write('a.md', '# a', null, 'd'.repeat(64))).rejects.toMatchObject({ status: 409, code: 'CONFLICT' })
    vi.stubGlobal('fetch', async () => new Response('<html>app</html>', { status: 200 }))
    await expect(knowledgeApi.status()).rejects.toBeInstanceOf(KnowledgeApiError)
  })
  it('远程网页可以读取认证后的云端资料，而不是被本地主机检查阻断', async () => {
    vi.stubGlobal('window', { location: { hostname: 'business-web-black.vercel.app' } })
    sessionStorage.setItem('knowledge-cloud-token', 'owner-token-'.repeat(4))
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ connected: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(knowledgeApi.status()).resolves.toEqual({ connected: true })
    expect(fetcher.mock.calls[0]).toBeDefined()
    sessionStorage.removeItem('knowledge-cloud-token')
  })
})
