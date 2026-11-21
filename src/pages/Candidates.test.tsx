import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Candidates from './Candidates'
import CompanyDetail from './CompanyDetail'
import { loadBaseCompanies } from '../data/companies'

vi.mock('../features/candidates/links', async importOriginal => {
  const actual = await importOriginal<typeof import('../features/candidates/links')>()
  return {
    ...actual,
    readToolSources: () => ({
      dcf: [{ market: 'cn', code: '600519', savedAt: '2026-10-05T00:00:00Z', input: { currency: 'CNY' }, result: { price: 1600, mos: 0.12 } }],
      valuation: [],
      grid: [],
    }),
  }
})

const seed = (items: unknown[]): void => localStorage.setItem('rn-candidates', JSON.stringify(items))
const renderAt = (path = '/candidates') => render(<MemoryRouter initialEntries={[path]}><Candidates /></MemoryRouter>)

// 页面挂载会懒加载 companyCore 及深度研究模块。先等待这些模块就绪，
// 避免同步断言结束后，CI 仍在导入模块时就销毁测试环境。
beforeAll(async () => {
  await Promise.all((['us', 'cn', 'hk', 'adr', 'ndx'] as const).map(loadBaseCompanies))
})

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('scrollTo', () => {})
  // 公司库补全数据：测试里只用内置的手工研究公司
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => [] }) as unknown as Response)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('候选池页', () => {
  it('空池：先显示两个加入入口和使用流程，隐藏个人统计与候选工具', () => {
    renderAt()
    expect(screen.getByRole('heading', { level: 1, name: '候选池' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /我的候选 · 0/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('list', { name: '使用流程' })).toBeTruthy()
    expect(screen.getByText('候选池还是空的。')).toBeTruthy()
    expect(screen.getByRole('link', { name: '去公司研究挑公司' }).getAttribute('href')).toBe('/research-notes')
    expect(screen.getByRole('button', { name: /^看研究筛出的公司（\d+ 家）$/ })).toBeTruthy()
    expect(screen.queryByText('已做估值')).toBeNull()
    expect(screen.queryByRole('button', { name: 'DCF：全部' })).toBeNull()
    expect(screen.queryByRole('button', { name: /导出 JSON/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '清空' })).toBeNull()
    expect(screen.getByText('跨设备同步').closest('details')?.hasAttribute('open')).toBe(false)
    expect(screen.queryByRole('heading', { name: '我的候选池 · 0 家' })).toBeNull()
    expect(screen.getByText('未开启同步：数据仅保存在本机')).toBeTruthy()
    expect(document.body.textContent).not.toContain('未验证身份')
    expect(document.body.textContent).not.toContain('PULSE_SYNC_TOKEN')
    expect(document.body.textContent).not.toContain('Token')
    fireEvent.click(screen.getByRole('button', { name: /^看研究筛出的公司/ }))
    expect(screen.getByRole('heading', { name: /^研究筛出/ })).toBeTruthy()
  })

  it('每家公司带好参数进入估值、DCF；只有 A 股显示网格；已做的 DCF 回显在估值进度里', () => {
    seed([
      { market: 'cn', code: '600519', addedAt: '2026-10-01T00:00:00.000Z', note: '等 1400 以下' },
      { market: 'us', code: 'AAPL', addedAt: '2026-10-02T00:00:00.000Z' },
    ])
    renderAt()
    expect(screen.getByRole('link', { name: '估值工作台 600519' }).getAttribute('href')).toBe('/valuation?market=cn&code=600519')
    expect(screen.getByRole('link', { name: 'DCF AAPL' }).getAttribute('href')).toMatch(/^\/dcf\?.*code=AAPL.*market=us.*currency=USD/)
    expect(screen.getByRole('link', { name: '网格 600519' }).getAttribute('href')).toMatch(/^\/grid-trading\?code=600519/)
    expect(screen.queryByRole('link', { name: '网格 AAPL' })).toBeNull()

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].textContent).toContain('CNY 1,600')
    expect(rows[0].textContent).toContain('安全边际 12%')
    expect(rows[1].textContent).toContain('尚未估值')
    expect(screen.getByText('已做估值').nextElementSibling?.textContent).toBe('1 / 2')
  })

  it('清空需要在页面里二次确认，取消不删除', () => {
    seed([{ market: 'us', code: 'AAPL', addedAt: '2026-10-02T00:00:00.000Z' }])
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: '清空' }))
    const confirm = screen.getByRole('group', { name: '确认清空' })
    fireEvent.click(within(confirm).getByRole('button', { name: '取消' }))
    expect(screen.getAllByRole('row')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '清空' }))
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }))
    expect(screen.getByText('候选池还是空的。')).toBeTruthy()
  })

  it('研究筛出：一键加入我的池，再点一次移出', async () => {
    renderAt('/candidates?tab=research')
    expect(screen.getByRole('heading', { name: /^研究筛出/ })).toBeTruthy()
    const add = screen.getAllByRole('button', { name: /^加入我的池/ })[0]
    const label = add.getAttribute('aria-label')!
    fireEvent.click(add)
    const added = screen.getByRole('button', { name: label.replace('加入我的池', '移出我的池') })
    expect(added.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('tab', { name: /我的候选 · 1/ })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('rn-candidates')!)).toHaveLength(1)

    fireEvent.click(screen.getByRole('tab', { name: /我的候选/ }))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
    fireEvent.click(screen.getByRole('tab', { name: '研究筛出' }))
    fireEvent.click(screen.getByRole('button', { name: label.replace('加入我的池', '移出我的池') }))
    expect(screen.getByRole('tab', { name: /我的候选 · 0/ })).toBeTruthy()
  })

  it('研究筛出加入候选本机失败时在当前页签显示一个 alert，可重试；切换页签不重复', async () => {
    renderAt('/candidates?tab=research')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    fireEvent.click(screen.getAllByRole('button', { name: /^加入我的池/ })[0])
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toContain('未保存到本机')
    fireEvent.click(screen.getByRole('tab', { name: /我的候选 · 1/ }))
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1))
    fireEvent.click(screen.getByRole('tab', { name: '研究筛出' }))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    setItem.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: '重试本机保存' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('rn-candidates') ?? '[]')).toHaveLength(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('带筛选条件的链接可恢复 DCF 视图，空结果可一键返回全部公司', () => {
    renderAt('/candidates?tab=research&view=4&market=海外&dcf=mine&q=__missing__')
    expect(screen.getByRole('button', { name: '我算过的' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '查看全部观察公司' }))
    expect(screen.getByRole('button', { name: 'DCF：全部' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(20)
  })

  it('研究筛出：每行有 DCF 入口，可按 DCF 筛选', () => {
    renderAt('/candidates?tab=research&view=4')
    expect(screen.getAllByRole('link', { name: /^算 DCF/ }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '不适用/未覆盖' }))
    expect(screen.getAllByRole('link', { name: /^算 DCF/ }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '有 DCF 估值' }))
    expect(screen.queryAllByRole('link', { name: /^算 DCF/ })).toHaveLength(0)
  })
})


describe('公司详情加入候选的本机保存', () => {
  const renderCompany = () => render(
    <MemoryRouter initialEntries={['/research-notes/us/AAPL']}>
      <Routes><Route path="/research-notes/:market/:code" element={<CompanyDetail />} /></Routes>
    </MemoryRouter>,
  )

  it('QuotaExceededError 时显示就近错误；恢复后重试并重新挂载仍可读取', async () => {
    const view = renderCompany()
    expect(await screen.findByRole('heading', { level: 1, name: '苹果' })).toBeTruthy()
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    fireEvent.click(screen.getByRole('button', { name: '＋ 加入候选' }))
    expect((await screen.findByRole('alert')).textContent).toContain('未保存到本机')
    expect(screen.queryByRole('button', { name: '✓ 已候选' })).toBeNull()
    expect(localStorage.getItem('rn-candidates')).toBeNull()
    setItem.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: '重试本机保存' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('rn-candidates') ?? '[]')).toHaveLength(1))
    view.unmount()
    renderCompany()
    expect(await screen.findByRole('heading', { level: 1, name: '苹果' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '✓ 已候选' })).toBeTruthy()
  })
})
