import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPaletteProvider, useCommandPalette } from './CommandPalette'
import { RECENT_PAGES_KEY } from '../features/recent-pages/store'
import { searchCompanies, type CompanyIndexEntry } from '../data/siteMap'

const INDEX: CompanyIndexEntry[] = [
  { c: 'MSFT', n: '微软', m: 'us', s: '信息技术' },
  { c: 'AAPL', n: '苹果', m: 'us', s: '信息技术' },
  { c: 'AAP', n: 'Advance Auto Parts', m: 'us', s: '可选消费' },
  { c: '00700', n: '腾讯控股', m: 'hk', s: '软件服务' },
  { c: '09988', n: '阿里巴巴-W', m: 'hk' },
  { c: '600519', n: '贵州茅台', m: 'cn', s: '主要消费' },
  { c: '600700', n: '某某股份', m: 'cn' },
  { c: 'BABA', n: '阿里巴巴', m: 'adr' },
]

const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ version: 1, count: INDEX.length, items: INDEX }), { status: 200 }))
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { fetchMock = okFetch(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.unstubAllGlobals() })

afterEach(() => { cleanup(); localStorage.clear(); document.body.style.overflow = '' })

function Where(): JSX.Element { return <p data-testid="where">{useLocation().pathname}</p> }
function Opener(): JSX.Element { const { open } = useCommandPalette(); return <button onClick={open}>打开</button> }
function Elsewhere(): JSX.Element { const nav = useNavigate(); return <button onClick={() => nav('/about')}>去关于</button> }

const setup = (path = '/') => render(
  <MemoryRouter initialEntries={[path]}>
    <CommandPaletteProvider>
      <Opener /><Elsewhere /><input aria-label="别的输入框" />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </CommandPaletteProvider>
  </MemoryRouter>
)
const dialog = () => screen.queryByRole('dialog', { name: '跳转到页面' })

describe('CommandPalette', () => {
  it('⌘K 打开并聚焦输入框，Esc 关闭并把焦点还回去', () => {
    setup()
    const opener = screen.getByRole('button', { name: '打开' })
    opener.focus()
    fireEvent.keyDown(opener, { key: 'k', metaKey: true })
    expect(dialog()).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
  })

  it('Ctrl+K 也能打开；在别的输入框里按 / 不打开', () => {
    setup()
    const other = screen.getByLabelText('别的输入框')
    other.focus()
    fireEvent.keyDown(other, { key: '/' })
    expect(dialog()).toBeNull()
    fireEvent.keyDown(other, { key: 'k', ctrlKey: true })
    expect(dialog()).toBeTruthy()
  })

  it('不在输入框时按 / 打开', () => {
    setup()
    fireEvent.keyDown(document.body, { key: '/' })
    expect(dialog()).toBeTruthy()
  })

  it('输入后回车跳到第一项，面板关闭', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dcf' } })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe('/dcf')
    expect(dialog()).toBeNull()
  })

  it('↓ 移动高亮后回车跳到第二项', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: '网格' } })
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true')
    const target = options[1].getAttribute('data-path')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe(target)
  })

  it('↑ 在第一项时回到最后一项', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: '网格' } })
    fireEvent.keyDown(box, { key: 'ArrowUp' })
    const options = screen.getAllByRole('option')
    expect(options[options.length - 1].getAttribute('aria-selected')).toBe('true')
  })

  it('无匹配时提示，回车不跳转', () => {
    setup('/about')
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzz不存在' } })
    expect(screen.getByText('没有匹配的页面')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe('/about')
    expect(dialog()).toBeTruthy()
  })

  it('查询为空时先列最近访问', () => {
    localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(['/monitor']))
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    expect(screen.getByText('最近访问')).toBeTruthy()
    expect(screen.getAllByRole('option')[0].getAttribute('data-path')).toBe('/monitor')
    expect(screen.getAllByRole('option').filter(o => o.getAttribute('data-path') === '/monitor')).toHaveLength(1)
  })

  it('路由变化时自动关闭并解除滚动锁', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    act(() => { fireEvent.click(screen.getByRole('button', { name: '去关于' })) })
    expect(dialog()).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('中文输入法选词时的回车和方向键不触发跳转或移动高亮', () => {
    setup('/about')
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: '网格' } })
    fireEvent.keyDown(box, { key: 'ArrowDown', isComposing: true })
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 })
    expect(screen.getByTestId('where').textContent).toBe('/about')
    expect(dialog()).toBeTruthy()
  })

  it('点遮罩关闭', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    fireEvent.mouseDown(document.querySelector('.cmdk-overlay') as Element)
    expect(dialog()).toBeNull()
  })

  it('首次打开才取公司索引，再次打开不重取', async () => {
    setup()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/data\/company-index\.json$/)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    await screen.findByRole('combobox')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('「公司」分组排在页面前，回车进入研究页', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: '700' } })
    expect(await screen.findByRole('group', { name: '公司' })).toBeTruthy()
    const first = screen.getAllByRole('option')[0]
    expect(first.getAttribute('data-path')).toBe('/research-notes/hk/00700')
    expect(first.textContent).toContain('港股')
    expect(screen.queryByText('正在载入公司索引…')).toBeNull()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe('/research-notes/hk/00700')
  })

  it('公司和页面一起出现时，↓ 能从公司移到页面', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: '茅台' } })
    await screen.findByRole('group', { name: '公司' })
    expect(screen.getAllByRole('option')[0].getAttribute('data-path')).toBe('/research-notes/cn/600519')
    fireEvent.change(box, { target: { value: 'dcf' } })
    expect(screen.queryByRole('group', { name: '公司' })).toBeNull()
    expect(screen.getAllByRole('option')[0].getAttribute('data-path')).toBe('/dcf')
  })

  it('索引载入失败时提示，页面搜索照常', async () => {
    fetchMock = vi.fn(async () => { throw new Error('offline') })
    vi.stubGlobal('fetch', fetchMock)
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: 'dcf' } })
    expect(await screen.findByText('公司索引载入失败，暂时只能搜页面')).toBeTruthy()
    expect(screen.queryByRole('group', { name: '公司' })).toBeNull()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe('/dcf')
  })

  it('索引返回非 200 也按失败处理，下次打开重试', async () => {
    fetchMock = vi.fn(async () => new Response('nope', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    setup()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '腾讯' } })
    expect(await screen.findByRole('status')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('公司索引载入失败，暂时只能搜页面'))
    expect(screen.getByText('没有匹配的页面')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})

describe('searchCompanies', () => {
  const codes = (q: string) => searchCompanies(q, INDEX).map(e => `${e.m}:${e.c}`)

  it('港股代码带不带前导零都命中', () => {
    expect(codes('700')[0]).toBe('hk:00700')
    expect(codes('00700')[0]).toBe('hk:00700')
    expect(codes('0700')[0]).toBe('hk:00700')
    expect(codes('9988')).toEqual(['hk:09988'])
  })

  it('A 股 6 位代码精确与前缀', () => {
    expect(codes('600519')).toEqual(['cn:600519'])
    expect(codes('6005')).toEqual(['cn:600519'])
    // 700 不会误中 600700（只比前缀，不比包含）
    expect(codes('700')).not.toContain('cn:600700')
  })

  it('美股代码不分大小写，精确代码排在前缀前', () => {
    expect(codes('aapl')).toEqual(['us:AAPL'])
    expect(codes('aap')).toEqual(['us:AAP', 'us:AAPL'])
    expect(codes('msft')).toEqual(['us:MSFT'])
  })

  it('名称前缀先于包含，英文名不分大小写', () => {
    expect(codes('阿里巴巴')).toEqual(['hk:09988', 'adr:BABA'])
    expect(codes('控股')).toEqual(['hk:00700'])
    expect(codes('auto parts')).toEqual(['us:AAP'])
  })

  it('空查询返回空，结果数有上限', () => {
    expect(codes('  ')).toEqual([])
    const many = Array.from({ length: 20 }, (_, i): CompanyIndexEntry => ({ c: `X${i}`, n: `测试${i}`, m: 'us' }))
    expect(searchCompanies('测试', many)).toHaveLength(8)
    expect(searchCompanies('测试', many, 3)).toHaveLength(3)
  })
})
