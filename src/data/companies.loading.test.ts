import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Company } from './companies'

// 模拟分包下载失败：懒加载 companyCore 时报错
const resolveMarket = vi.fn((_m?: unknown): Promise<unknown> => Promise.reject(new Error('chunk failed')))
vi.mock('./companyCore', () => ({ resolveMarket: (...args: unknown[]) => resolveMarket(...(args as [])) }))
vi.mock('../features/company-valuation/model', () => ({ loadCompanyValuations: async () => new Map() }))

const co = (code: string, extra: Partial<Company> = {}): Company => ({
  code, name: code, market: 'us', sector: '信息技术', batch: 't', rating: '观察', headline: '', metrics: [], thesis: [], risk: [], next: [], asOf: '', ...extra,
})
const AAPL = co('AAPL', { scenarios: [{ name: '基准', price: '317', assumption: '', change: '', trigger: '' }] })
const WEC = co('WEC', { name: 'WEC能源' })

const fakeCore = () => resolveMarket.mockImplementation(async () => ({
  base: [AAPL],
  merge: (g: Company[]) => [AAPL, ...g.filter(x => x.code !== 'AAPL')],
}))
const okJson = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as unknown as Response
const htmlPage = () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } }) as unknown as Response
const status = (n: number) => ({ ok: false, status: n, json: async () => ({}) }) as unknown as Response

beforeEach(() => { vi.resetModules(); resolveMarket.mockReset(); resolveMarket.mockImplementation(() => Promise.reject(new Error('chunk failed'))) })
afterEach(() => vi.unstubAllGlobals())

describe('公司数据懒加载失败', () => {
  it('失败不留未处理的 Promise，hook 结束加载并标记失败；下次调用会重新加载', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson([])))
    const { loadCompanies, useCompanies } = await import('./companies')
    const { result } = renderHook(() => useCompanies('us'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ failed: true, list: [] })
    await expect(loadCompanies('us')).rejects.toThrow('chunk failed')
    expect(resolveMarket).toHaveBeenCalledTimes(2)
  })
})

describe('程序化补全 JSON 失败：部分数据，不缓存为完整', () => {
  it.each([
    ['HTTP 503', () => status(503)],
    ['HTML 200（应用壳）', htmlPage],
    ['网络失败', () => { throw new TypeError('Failed to fetch') }],
    ['非数组 JSON', () => okJson({ error: 'x' })],
  ])('%s：保留手工 AAPL、标记 partial，恢复后再次调用能拿到 WEC', async (_label, failing) => {
    fakeCore()
    let healthy = false
    const fetchMock = vi.fn(async () => (healthy ? okJson([WEC]) : failing()))
    vi.stubGlobal('fetch', fetchMock)
    const { loadCompanies, loadCompaniesResult } = await import('./companies')
    const first = await loadCompaniesResult('us')
    expect(first.partial).toBe(true)
    expect(first.error).toBeTruthy()
    expect(first.list.map(c => c.code)).toEqual(['AAPL'])
    // 数组契约：仍返回手工公司
    expect((await loadCompanies('us')).map(c => c.code)).toEqual(['AAPL'])
    healthy = true
    const second = await loadCompaniesResult('us')
    expect(second.partial).toBe(false)
    expect(second.list.map(c => c.code)).toEqual(['AAPL', 'WEC'])
    // 完整结果之后走缓存，不再请求
    const calls = fetchMock.mock.calls.length
    await loadCompanies('us')
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('有效空数组是完整结果（真正无补全公司），不是部分数据', async () => {
    fakeCore()
    vi.stubGlobal('fetch', vi.fn(async () => okJson([])))
    const { loadCompaniesResult } = await import('./companies')
    expect(await loadCompaniesResult('us')).toMatchObject({ partial: false })
  })

  it('纳指新增没有补全 JSON，不请求 ndx.json，结果完整', async () => {
    fakeCore()
    const fetchMock = vi.fn(async (_url: string) => htmlPage())
    vi.stubGlobal('fetch', fetchMock)
    const { loadCompaniesResult } = await import('./companies')
    expect(await loadCompaniesResult('ndx')).toMatchObject({ partial: false })
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('ndx.json'))).toBe(false)
  })

  it('useCompanies：partial 时同页 retry 可恢复', async () => {
    fakeCore()
    let healthy = false
    vi.stubGlobal('fetch', vi.fn(async () => (healthy ? okJson([WEC]) : status(503))))
    const { useCompanies } = await import('./companies')
    const { result } = renderHook(() => useCompanies('us'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ partial: true, failed: false })
    expect(result.current.list.map(c => c.code)).toEqual(['AAPL'])
    healthy = true
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.partial).toBe(false))
    expect(result.current.list.map(c => c.code)).toEqual(['AAPL', 'WEC'])
  })
})
