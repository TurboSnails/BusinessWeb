import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EtfReview from './EtfReview'
import { ETF_REVIEW_KEY } from '../features/etf-review/store'
import { clearEtfTechnicalCache } from '../data/etfTechnical'

beforeEach(() => { localStorage.clear(); clearEtfTechnicalCache(); vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') })) })
afterEach(() => { cleanup(); localStorage.clear(); clearEtfTechnicalCache(); vi.unstubAllGlobals() })
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
  it('列表链接仅预填，确认后才新增；取消不会写本机', async () => {
    render(<MemoryRouter initialEntries={['/etf-review?code=159915&name=创业板ETF']}><EtfReview /></MemoryRouter>)
    const dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText('ETF 代码') as HTMLInputElement).value).toBe('159915')
    expect(localStorage.getItem(ETF_REVIEW_KEY)).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(localStorage.getItem(ETF_REVIEW_KEY)).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '添加标的' }))
  })
  it('已有代码入口不覆盖原名称、分组或笔记', async () => {
    const original = { version: 1, groups: ['核心'], items: [{ code: '510300', name: '原名称', group: '核心' }], notes: [] }
    localStorage.setItem(ETF_REVIEW_KEY, JSON.stringify(original))
    render(<MemoryRouter initialEntries={['/etf-review?code=510300&name=新名称']}><EtfReview /></MemoryRouter>)
    expect(await screen.findByText(/已在复盘列表/)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(JSON.parse(localStorage.getItem(ETF_REVIEW_KEY)!)).toEqual(original)
  })
  it('导入先预览；取消保留原数据', async () => {
    renderPage()
    const file = new File([JSON.stringify({ version: 1, groups: [], items: [{ code: '510300', name: '导入ETF', group: '' }], notes: [] })], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify({ version: 1, groups: [], items: [{ code: '510300', name: '导入ETF', group: '' }], notes: [] }) })
    await act(async () => fireEvent.change(screen.getByLabelText('导入备份文件'), { target: { files: [file] } }))
    expect(screen.getByRole('dialog').textContent).toContain('备份含 1 个标的')
    expect(localStorage.getItem(ETF_REVIEW_KEY)).toBeNull()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }))
    expect(localStorage.getItem(ETF_REVIEW_KEY)).toBeNull()
  })
  it('技术数据失败可重试，不会写入或清空复盘存储', async () => {
    const original = JSON.stringify({ version: 2, groups: [], items: [{ code: '510300', name: 'ETF', group: '' }], notes: [] })
    localStorage.setItem(ETF_REVIEW_KEY, original)
    renderPage()
    const retry = await screen.findByRole('button', { name: '重试技术快照' })
    const p = { asOf: '2026-11-13', complete: true, count: 60, ma: '震荡', macd: '偏多', dif: .1, dea: 0, histogram: .2, previousHistogram: -.1, rsi: 50, rsiState: '中性' }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ asOf: '2026-11-13', records: [{ code: '510300', name: 'ETF', kind: '宽基', asOf: '2026-11-13', priceSeries: 'qfqday', close: 4, previousClose: 3.9, changePct: 2, return20SessionsPct: 5, day: p, week: p, month: p }] }) })))
    fireEvent.click(retry)
    expect(await screen.findByText(/已取得 1\/1 只自选标的的技术快照/)).toBeTruthy()
    expect(localStorage.getItem(ETF_REVIEW_KEY)).toBe(original)
  })
})


describe('ETF 复盘复核回归', () => {
  it('当前分组改名后筛选跟随，删除后回到全部', () => {
    localStorage.setItem(ETF_REVIEW_KEY, JSON.stringify({ version: 2, groups: ['A'], items: [{ code: '510300', name: 'ETF', group: 'A', groups: ['A'] }], notes: [] }))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^A/ }))
    fireEvent.click(screen.getByRole('button', { name: '管理分组' }))
    fireEvent.click(screen.getByRole('button', { name: '改名' }))
    fireEvent.change(screen.getByLabelText('新分组名'), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.getByRole('button', { name: /^C/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('ETF')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '管理分组' }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.getByRole('button', { name: /^全部/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('ETF')).toBeTruthy()
  })

  it('月线全部未完成时给出具体原因，并标明自选快照覆盖数', async () => {
    localStorage.setItem(ETF_REVIEW_KEY, JSON.stringify({ version: 2, groups: [], items: [{ code: '510300', name: 'ETF', group: '' }], notes: [] }))
    const p = { asOf: '2026-11-13', complete: true, count: 60, ma: '震荡', macd: '偏多', dif: .1, dea: 0, histogram: .2, previousHistogram: -.1, rsi: 50, rsiState: '中性' }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).includes('etf-technical-latest.json')) throw new Error('offline')
      return { ok: true, json: async () => ({ asOf: '2026-11-13', records: [{ code: '510300', name: 'ETF', kind: '宽基', asOf: '2026-11-13', priceSeries: 'qfqday', close: 4, previousClose: 3.9, changePct: 2, return20SessionsPct: 5, day: p, week: p, month: { ...p, complete: false } }] }) }
    }))
    renderPage()
    expect(await screen.findByText(/已取得 1\/1 只自选标的的技术快照/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('技术周期'), { target: { value: 'month' } })
    fireEvent.change(screen.getByLabelText('MACD 条件'), { target: { value: 'bull' } })
    expect(screen.getByText(/月线均为未完成周期/)).toBeTruthy()
  })
})
