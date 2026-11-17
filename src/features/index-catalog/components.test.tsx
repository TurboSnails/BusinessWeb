import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import IndexExplorer from './IndexExplorer'
import IndexEtfLinks, { clearIndexEtfCatalogCache } from './IndexEtfLinks'
import type { IndexData } from '../macro/valuation'
import type { EtfCatalog } from './catalog'
const ix = (name: string, values: [string, number][], date: string): IndexData => ({ name, monthly: values, symbol: name, group: 'A 股', note: '', fpe: [], latest: { date, value: values.at(-1)![1] } })
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); clearIndexEtfCatalogCache() })
const catalog: EtfCatalog = { schemaVersion: 1, scope: '代表产品', relations: [{ indexKey: 'csi300', indexCode: '000300', indexProvider: 'CSI', indexName: '沪深300', code: '510300', exchange: 'SH', name: '沪深300ETF', relationship: 'tracks', benchmarkCode: '000300', benchmarkName: '沪深300', verifiedAt: '2026-11-16', disclosureDate: '2026-11-13', evidenceUrl: 'https://www.sse.com.cn/example', evidenceLabel: '上交所材料' }] }
describe('指数比较交互', () => {
  it('选择两只后展示共同月价格变化与各自最新行情日，收藏不会改变选择', () => {
    render(<IndexExplorer indexes={{ a: ix('甲指数', [['2020-01-01', 10], ['2020-02-01', 20]], '2020-02-20'), b: ix('乙指数', [['2020-01-10', 40], ['2020-02-15', 20]], '2020-02-15') }} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /甲指数/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /乙指数/ }))
    expect(screen.getByRole('img', { name: /归一化/ })).toBeTruthy()
    expect(screen.getByText('100.00%')).toBeTruthy()
    expect(screen.getByText('-50.00%')).toBeTruthy()
    expect(screen.getByText('2020-02-20')).toBeTruthy()
    expect(screen.getByText('2020-02-15')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '收藏甲指数' }))
    expect((screen.getByRole('checkbox', { name: /甲指数/ }) as HTMLInputElement).checked).toBe(true)
    expect(JSON.parse(localStorage.getItem('businessweb.index-favorites.v1')!)).toEqual(['a'])
  })
  it('已登记缺行情行业清楚标待采集，搜索无匹配有空态', () => {
    render(<IndexExplorer indexes={{ a: ix('甲指数', [['2020-01-01', 10]], '2020-01-01') }} />)
    expect(screen.getByRole('button', { name: /全指医药卫生.*待采集/ })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索指数' }), { target: { value: '不存在' } })
    expect(screen.getByText('没有匹配的指数。')).toBeTruthy()
    expect(screen.queryByRole('img', { name: /归一化/ })).toBeNull()
  })
})
describe('官方ETF目录', () => {
  it('合法目录展示证据和上下文链接，查看不写记录', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => catalog }))
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    render(<MemoryRouter><IndexEtfLinks indexKey="csi300" /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: '加入复盘' })
    expect(link.getAttribute('href')).toContain('etf-review?code=510300&name=')
    expect(screen.getByRole('link', { name: '上交所材料' }).getAttribute('rel')).toContain('noopener')
    expect(screen.getByText(/资料日期 2026-11-13/)).toBeTruthy()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it('伪造指数身份或空行的目录显示错误并可重试', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ...catalog, relations: [null] }) }).mockResolvedValueOnce({ ok: true, json: async () => catalog })
    vi.stubGlobal('fetch', fetcher)
    render(<MemoryRouter><IndexEtfLinks indexKey="csi300" /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '重试目录' }))
    expect(await screen.findByRole('link', { name: '加入复盘' })).toBeTruthy()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
