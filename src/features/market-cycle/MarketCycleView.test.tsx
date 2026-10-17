import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MarketCycleView from './MarketCycleView'
const renderView = () => render(<MemoryRouter><MarketCycleView /></MemoryRouter>)

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })
describe('牛熊周期复盘', () => {
  it('取数失败明确显示缺失，仍可切换市场、补录证据与重试', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderView()
    expect(await screen.findByText(/3个数据文件未能加载/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: '等待证据' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '港股 · 恒生科技' }))
    expect(screen.getByLabelText(/该指数TTM PE历史分位/)).toBeTruthy()
    expect(screen.queryByLabelText(/融资买入占成交额/)).toBeNull()
    expect(screen.getByRole('button', { name: '重新读取数据' })).toBeTruthy()
  })
  it('补录持久化、跨市场隔离，复盘需全部检查完成才能保存', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const view = renderView()
    await screen.findByText(/3个数据文件未能加载/)
    fireEvent.change(screen.getByLabelText(/ERP z-score/), { target: { value: '2.1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存补录' }))
    expect(screen.getByRole('status').textContent).toMatch(/补录已保存在本机/)
    fireEvent.click(screen.getByRole('button', { name: '港股 · 恒生指数' }))
    expect((screen.getByLabelText(/该指数TTM PE历史分位/) as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'A股 · 沪深300' }))
    expect((screen.getByLabelText(/ERP z-score/) as HTMLInputElement).value).toBe('2.1')
    const save = screen.getByRole('button', { name: '保存本次复盘' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect(screen.getByText(/复盘已保存/)).toBeTruthy()
    view.unmount()
    renderView()
    expect(await screen.findByText(/等待证据 · A股/)).toBeTruthy()
  })
})
