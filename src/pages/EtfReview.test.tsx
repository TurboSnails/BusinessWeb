import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EtfReview from './EtfReview'
import { ETF_REVIEW_KEY } from '../features/etf-review/store'

beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') })) })
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })
const renderPage = () => render(<MemoryRouter><EtfReview /></MemoryRouter>)

describe('ETF 复盘', () => {
  it('空状态提示添加标的', () => {
    renderPage()
    expect(screen.getByText('还没有自选 ETF')).toBeTruthy()
  })
  it('添加标的、写当天笔记，数据落到本机存储', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '添加标的' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('ETF 代码'), { target: { value: '12ab' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: '添加' })))
    expect(within(dialog).getByRole('alert').textContent).toContain('6 位数字')
    fireEvent.change(within(dialog).getByLabelText('ETF 代码'), { target: { value: '510300' } })
    fireEvent.change(within(dialog).getByLabelText(/名称/), { target: { value: '沪深300ETF' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: '添加' })))
    expect(screen.getByText('沪深300ETF')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '写复盘笔记' }))
    const notes = screen.getByRole('dialog')
    fireEvent.click(within(notes).getByRole('button', { name: '看多' }))
    fireEvent.click(within(notes).getByRole('button', { name: '观望' }))
    fireEvent.change(within(notes).getByLabelText('风险点'), { target: { value: '量能不足' } })
    fireEvent.click(within(notes).getByRole('button', { name: '保存这一天' }))
    const saved = JSON.parse(localStorage.getItem(ETF_REVIEW_KEY)!)
    expect(saved.items[0].code).toBe('510300')
    expect(saved.notes[0]).toMatchObject({ conclusion: '看多', action: '观望', risk: '量能不足' })
  })
  it('溢价不是数字时报错而不保存', async () => {
    localStorage.setItem(ETF_REVIEW_KEY, JSON.stringify({ version: 1, groups: [], items: [{ code: '510300', name: 'A', group: '' }], notes: [] }))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '写复盘笔记' }))
    const notes = screen.getByRole('dialog')
    fireEvent.change(within(notes).getByLabelText(/ETF 溢价/), { target: { value: 'abc' } })
    fireEvent.click(within(notes).getByRole('button', { name: '保存这一天' }))
    expect(within(notes).getByRole('alert').textContent).toContain('数字')
    expect(JSON.parse(localStorage.getItem(ETF_REVIEW_KEY)!).notes).toHaveLength(0)
  })
})
