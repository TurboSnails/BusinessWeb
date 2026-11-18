import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tableFixture, tableHistFixture } from '../../features/jixing-table/fixtures'
import { asJixingTable } from '../../features/jixing-table/model'
import JixingTable from './JixingTable'

function renderPage(body: unknown = tableFixture, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
    const url = String(input)
    if (url.includes('jixing-table-hist-')) {
      return { ok: true, json: async () => tableHistFixture }
    }
    return { ok, json: async () => body }
  }))
  return render(<MemoryRouter initialEntries={['/jixing/table']}><JixingTable /></MemoryRouter>)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('A股估值表', () => {
  it('显示数据日、状态和样本，点击名称懒加载 PE 曲线及参考线', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByText('2026-11-17', { selector: 'td', exact: true }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('低估 2 只')).toBeTruthy()
    expect(within(table).getByText('积累中')).toBeTruthy()
    expect(within(table).getByText(/行业·银行/)).toBeTruthy()
    fireEvent.click(within(table).getByRole('button', { name: '沪深300' }))
    expect(await screen.findByRole('img', { name: '沪深300 PE(TTM) 历史走势' })).toBeTruthy()
    expect(screen.getByText('30% 分位')).toBeTruthy()
    expect(screen.getByText('70% 分位')).toBeTruthy()
  })

  it('按当前分组更新表格和计数', async () => {
    renderPage()
    await screen.findByRole('button', { name: '沪深300' })
    fireEvent.click(within(screen.getByRole('group', { name: '指数分组' })).getByRole('button', { name: '专题·养老' }))
    expect(screen.queryByRole('button', { name: '沪深300' })).toBeNull()
    expect(screen.getByRole('button', { name: '养老产业' })).toBeTruthy()
    expect(screen.getByText('低估 0 只')).toBeTruthy()
  })

  it('按 PE 排序并可反向排序', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    const sort = within(table).getByRole('button', { name: 'PE(TTM)' })
    fireEvent.click(sort)
    expect(within(table).getAllByRole('rowheader').map(cell => cell.textContent)).toEqual(['中证银行', '沪深300', '养老产业'])
    fireEvent.click(sort)
    expect(within(table).getAllByRole('rowheader').map(cell => cell.textContent)).toEqual(['养老产业', '沪深300', '中证银行'])
  })

  it('数据文件缺失时显示 EmptyState', async () => {
    renderPage(null, false)
    expect(await screen.findByText('暂无A股估值数据')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('互链到今日星级与牛熊信号板', async () => {
    renderPage()
    await screen.findByRole('table')
    expect(screen.getByRole('link', { name: /今日星级/ }).getAttribute('href')).toBe('/jixing')
    expect(screen.getByRole('link', { name: /牛熊信号板/ }).getAttribute('href')).toBe('/jixing/signals')
  })

  it('运行时校验拒绝过期行、非法历史以及重复代码', () => {
    const [first] = tableFixture.rows
    expect(asJixingTable(tableFixture)).toEqual(tableFixture)
    for (const rows of [
      [{ ...first, date: '2026-11-16' }],
      [{ ...first, peSeries: [['2026-11-31', 15]] }],
      [{ ...first, pbPct: 0.4 }],
      [first, first],
    ]) expect(asJixingTable({ ...tableFixture, rows })).toBeNull()
  })
})
