import { describe, expect, it, vi } from 'vitest'
import { resolveLookupApi } from './StockLookup'
import type { StockLookupApi } from './types'
import { stockLookupApi } from './api'
import { createDemoApi } from './panels/demoApi'

const stub = createDemoApi()

describe('demo 门禁', () => {
  it('生产模式下 demo=1 仍走真实 api', () => {
    const { api, usingDemo } = resolveLookupApi(undefined, {
      demoParam: true,
      isDev: false,
      demoApi: stub,
    })
    expect(usingDemo).toBe(false)
    expect(api).toBe(stockLookupApi)
  })

  it('开发模式 + demo=1 + 已加载 demoApi → 用演示', () => {
    const { api, usingDemo } = resolveLookupApi(undefined, {
      demoParam: true,
      isDev: true,
      demoApi: stub,
    })
    expect(usingDemo).toBe(true)
    expect(api).toBe(stub)
  })

  it('测试注入 api 优先，且不算演示横幅', () => {
    const injected = { ...stub, quote: vi.fn() } as StockLookupApi
    const { api, usingDemo } = resolveLookupApi(injected, {
      demoParam: true,
      isDev: true,
      demoApi: stub,
    })
    expect(api).toBe(injected)
    expect(usingDemo).toBe(false)
  })

  it('演示样本不含真实机构 / 媒体名', async () => {
    const page = await stub.news('MRVL')
    const pubs = page.items.map(i => i.publisher).join(' ')
    expect(pubs).not.toMatch(/Reuters|Bloomberg|WSJ|CNBC/i)
    expect(pubs).toMatch(/示例媒体/)
    const analysts = await stub.analysts('MRVL')
    const firms = analysts.actions.map(a => a.firm).join(' ')
    expect(firms).not.toMatch(/Goldman|Morgan Stanley|JPM|Barclays|BofA|Citi/i)
    expect(firms).toMatch(/示例证券/)
  })
})
