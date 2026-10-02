import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSectorPayload, readSectorView, saveSectorView } from './sectorCache'
const body = { code: 200, data: { plate_stock: [{ secu_name: '机器人', stock_list: [{ time: '2026-09-30 10:00:00' }] }] } }
beforeEach(() => { sessionStorage.clear() })
afterEach(() => vi.unstubAllGlobals())
describe('板块本地缓存', () => {
  it('读取相同日期只请求一次，强制刷新只更新该日期', async () => {
    const fetcher = vi.fn(async () => Response.json(body)); vi.stubGlobal('fetch', fetcher)
    await loadSectorPayload('2026-09-30')
    await loadSectorPayload('2026-09-30')
    expect(fetcher).toHaveBeenCalledTimes(1)
    await loadSectorPayload('2026-09-30', true)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('并发相同日期合并请求', async () => {
    const fetcher = vi.fn(async () => Response.json(body)); vi.stubGlobal('fetch', fetcher)
    await Promise.all([loadSectorPayload('2026-09-30'), loadSectorPayload('2026-09-30')])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('失败不覆盖已成功缓存的内容', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(body)).mockRejectedValueOnce(new Error('offline')); vi.stubGlobal('fetch', fetcher)
    await loadSectorPayload('2026-09-30')
    await expect(loadSectorPayload('2026-09-30', true)).rejects.toThrow('offline')
    expect(await loadSectorPayload('2026-09-30')).toEqual(body)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('拒绝错日期及损坏的视图缓存', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)))
    await expect(loadSectorPayload('2026-09-29')).rejects.toThrow('日期')
    sessionStorage.setItem('sector-rotation:view:v1', '{"sectorDataByDate":{"x":[{}]}}')
    expect(readSectorView()).toBeNull()
  })
  it('视图恢复筛选条件和数据，但不将昨日视图当成今日视图', () => {
    const value = { day: '2026-10-02', selectedDates: ['2026-09-30'], sectorDataByDate: { '2026-09-30': [{ name: '机器人', code: '1', changePercent: 1, rank: 1, date: '2026-09-30' }] }, plateRawDataByDate: { '2026-09-30': body.data.plate_stock }, filterType: 'concept' as const, topN: 20, sortBy: 'rank' as const }
    saveSectorView(value)
    expect(readSectorView('2026-10-02')).toEqual(value)
    expect(readSectorView('2026-10-03')).toBeNull()
  })
})
it('存储配额用满后仍用内存缓存，返回页面不会重复请求', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
  const fetcher = vi.fn(async () => Response.json(body)); vi.stubGlobal('fetch', fetcher)
  try {
    await loadSectorPayload('2026-09-30')
    await loadSectorPayload('2026-09-30')
    expect(fetcher).toHaveBeenCalledTimes(1)
  } finally { storage.mockRestore() }
})
