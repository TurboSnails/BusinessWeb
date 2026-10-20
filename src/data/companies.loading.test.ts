import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 模拟分包下载失败：懒加载 companyCore 时报错
const resolveMarket = vi.fn(() => Promise.reject(new Error('chunk failed')))
vi.mock('./companyCore', () => ({ resolveMarket: (...args: unknown[]) => resolveMarket(...(args as [])) }))

afterEach(() => vi.unstubAllGlobals())

describe('公司数据懒加载失败', () => {
  it('失败不留未处理的 Promise，hook 结束加载并标记失败；下次调用会重新加载', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })))
    const { loadCompanies, useCompanies } = await import('./companies')
    const { result } = renderHook(() => useCompanies('us'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ failed: true, list: [] })
    await expect(loadCompanies('us')).rejects.toThrow('chunk failed')
    expect(resolveMarket).toHaveBeenCalledTimes(2)
  })
})
