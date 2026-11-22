import { describe, expect, it, vi } from 'vitest'
import { loadPriceBook, loadPriceIndex } from './data'
import indexFixture from './__fixtures__/index.json'

const response = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body }) as Response

describe('组合回测数据加载', () => {
  it('读取代码清单并校验格式', async () => {
    const fetcher = vi.fn(async () => response(indexFixture))
    await expect(loadPriceIndex(fetcher)).resolves.toEqual(indexFixture)
    expect(fetcher).toHaveBeenCalledWith('/data/portfolio-prices/index.json', expect.objectContaining({ cache: 'no-cache' }))
  })

  it('按需读取代码并返回 PriceBook', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const symbol = String(url).split('/').pop()?.replace('.json', '')
      return response({ symbol, dates: ['2026-01-02', '2026-01-05'], adjClose: [10, 11] })
    })
    await expect(loadPriceBook(['AVGO', 'QQQ'], fetcher)).resolves.toEqual({
      AVGO: { dates: ['2026-01-02', '2026-01-05'], adjClose: [10, 11] },
      QQQ: { dates: ['2026-01-02', '2026-01-05'], adjClose: [10, 11] },
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('文件缺失或序列异常时给出中文错误', async () => {
    await expect(loadPriceIndex(vi.fn(async () => response({}, false)))).rejects.toThrow('价格清单加载失败')
    await expect(loadPriceBook(['AVGO'], vi.fn(async () => response({ symbol: 'AVGO', dates: ['2026-01-02'], adjClose: [] })))).rejects.toThrow('AVGO')
  })

  it('接受可选 holders；格式不对整份判不合法', async () => {
    const withHolders = {
      ...indexFixture,
      items: indexFixture.items.map((item, index) => index === 0
        ? { ...item, holders: [{ who: '巴菲特（伯克希尔）', weight: 0.25, asOf: '2026-09-30' }] }
        : item),
    }
    await expect(loadPriceIndex(vi.fn(async () => response(withHolders)))).resolves.toEqual(withHolders)

    const badWeight = {
      ...indexFixture,
      items: [{ ...indexFixture.items[0], holders: [{ who: '巴菲特（伯克希尔）', weight: 1.5, asOf: '2026-09-30' }] }],
    }
    await expect(loadPriceIndex(vi.fn(async () => response(badWeight)))).rejects.toThrow('价格清单格式不正确')

    const emptyWho = {
      ...indexFixture,
      items: [{ ...indexFixture.items[0], holders: [{ who: '  ', weight: 0.1, asOf: '2026-09-30' }] }],
    }
    await expect(loadPriceIndex(vi.fn(async () => response(emptyWho)))).rejects.toThrow('价格清单格式不正确')
  })

  it('带连字符代码经 encodeURIComponent 路径可加载', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toContain(`/data/portfolio-prices/${encodeURIComponent('BRK-B')}.json`)
      return response({ symbol: 'BRK-B', dates: ['2026-01-02', '2026-01-05'], adjClose: [10, 11] })
    })
    await expect(loadPriceBook(['BRK-B'], fetcher)).resolves.toEqual({
      'BRK-B': { dates: ['2026-01-02', '2026-01-05'], adjClose: [10, 11] },
    })
  })
})
