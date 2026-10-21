import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SectorRotation from './SectorRotation'

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.unstubAllGlobals(); window.location.hash = '' })

const plate = (name: string, change: number) => ({ secu_name: name, secu_code: name, change, stock_list: [] })
function stubPayload(): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const m = String(url).match(/date%3D(\d{8})|date=(\d{8})/)
    const d = (m?.[1] ?? m?.[2] ?? '20260930')
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    return new Response(JSON.stringify({ code: 200, data: { plate_stock: [plate('机器人', 0.02), plate('ST板块', 0.09)], date } }), { status: 200 })
  }))
}

describe('板块排行标签', () => {
  it('切到板块排行显示 20 日矩阵说明，并可回到板块轮动', async () => {
    stubPayload()
    await act(async () => { render(<SectorRotation />) })
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: '板块排行' })))
    expect(screen.getByText(/近 20 个交易日的概念板块涨幅矩阵/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: '板块轮动' })))
    expect(screen.getByRole('tab', { name: '板块轮动' }).getAttribute('aria-selected')).toBe('true')
  })
  it('#plate-ranking 直达排行视图', async () => {
    stubPayload()
    window.location.hash = '#plate-ranking'
    await act(async () => { render(<SectorRotation />) })
    expect(screen.getByRole('tab', { name: '板块排行' }).getAttribute('aria-selected')).toBe('true')
  })
})
