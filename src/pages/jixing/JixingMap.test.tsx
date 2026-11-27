import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tableFixture } from '../../features/jixing-table/fixtures'
import { globalFixture } from '../../features/jixing-global/fixtures'
import JixingMap from './JixingMap'

function renderPage(table: unknown = tableFixture, global: unknown = globalFixture(), ok = true, path = '/jixing/map') {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
    const url = String(input)
    const status = ok ? 200 : 404
    if (url.includes('jixing-global')) return { ok, status, json: async () => global }
    return { ok, status, json: async () => table }
  }))
  return render(<MemoryRouter initialEntries={[path]}><JixingMap /></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('指数地图', () => {
  it('渲染图例与宽基格子，表格视图可跳转', async () => {
    renderPage()
    expect(await screen.findByLabelText('估值状态图例')).toBeTruthy()
    expect(screen.getByText('沪深300', { selector: 'strong' })).toBeTruthy()
    const quadrant = screen.getByRole('group', { name: /^宽基四象限/ })
    expect(within(quadrant).getByRole('link', { name: '沪深300 PE 25% 低估' }).getAttribute('href')).toBe('/jixing/table?code=000300')
    fireEvent.click(within(screen.getByRole('group', { name: '视图' })).getByRole('button', { name: '表格' }))
    const link = await screen.findByRole('link', { name: '沪深300' })
    expect(link.getAttribute('href')).toBe('/jixing/table?code=000300')
  })

  it('分组筛选', async () => {
    renderPage()
    await screen.findByText('沪深300', { selector: 'strong' })
    fireEvent.click(within(screen.getByRole('group', { name: '分组' })).getByRole('button', { name: '专题' }))
    expect(screen.getByText('养老产业', { selector: 'strong' })).toBeTruthy()
    expect(screen.queryByText('沪深300', { selector: 'strong' })).toBeNull()
  })

  it('空态显示 LoadError 与重试', async () => {
    renderPage(null, null, false)
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('视图写入 URL：?view=table 刷新后仍是表格', async () => {
    renderPage(tableFixture, globalFixture(), true, '/jixing/map?view=table')
    const link = await screen.findByRole('link', { name: '沪深300' })
    expect(link.getAttribute('href')).toBe('/jixing/table?code=000300')
    expect(within(screen.getByRole('group', { name: '视图' })).getByRole('button', { name: '表格' }).getAttribute('aria-pressed')).toBe('true')
  })
})
