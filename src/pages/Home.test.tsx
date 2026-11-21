import React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from './Home'
import RecentUpdates from '../components/RecentUpdates'
import { SITE_UPDATES } from '../data/siteUpdates'
import { WORKBENCH_TOOLS } from '../data/siteMap'
import { resetAutoDcf } from '../features/dcf/autoDcf'
import { resetPlanRepositoryForTests } from '../features/investment-plan/repository'
import { createEmptyPlan, PLAN_KEYS } from '../features/investment-plan/types'

afterEach(() => {
  cleanup()
  localStorage.clear()
  resetPlanRepositoryForTests()
  vi.unstubAllGlobals()
})

const stubFetch = (impl: () => Promise<unknown>) =>
  vi.stubGlobal('fetch', vi.fn(() => impl()) as unknown as typeof fetch)

const changelog = (n: number) => ({
  generatedAt: '2026-10-04T00:00:00.000Z',
  versions: [
    {
      tag: 'unreleased',
      date: null,
      commits: Array.from({ length: n }, (_, i) => ({
        hash: `h${i}`, subject: `更新${i}`, author: 'a', date: '2026-10-04',
      })),
    },
  ],
})

describe('Home', () => {
  it('第一屏是工作台：标题、跳转按钮、8 个常用工具', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: '工作台' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /跳转到页面/ })).toBeTruthy()
    const tools = within(screen.getByRole('region', { name: '常用工具' })).getAllByRole('link')
    expect(tools.map(a => a.getAttribute('href'))).toEqual(WORKBENCH_TOOLS.map(t => t.path))
  })

  it('本机没有数据时不显示最近访问和我的记录', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.queryByRole('heading', { name: '最近访问' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '我的记录' })).toBeNull()
  })

  it('有最近访问时显示对应链接', () => {
    localStorage.setItem('businessweb.recent-pages.v1', JSON.stringify(['/monitor', '/dcf']))
    render(<MemoryRouter><Home /></MemoryRouter>)
    const list = screen.getByRole('region', { name: '最近访问' })
    expect(within(list).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/monitor', '/dcf'])
  })

  it('有候选池时显示我的记录卡片', () => {
    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'AAPL', addedAt: '2026-10-01T00:00:00.000Z' }]))
    render(<MemoryRouter><Home /></MemoryRouter>)
    const box = screen.getByRole('region', { name: '我的记录' })
    expect(within(box).getByRole('link', { name: /候选池/ }).getAttribute('href')).toBe('/candidates')
    expect(box.textContent).toContain('1 条')
    expect(box.textContent).toContain('AAPL')
  })

  it('localStorage 抛错时首页照常渲染', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: '工作台' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '我的记录' })).toBeNull()
    spy.mockRestore()
  })

  it('读者区有书名、副标题与「开始阅读」按钮', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 2, name: /正念投资/ })).toBeTruthy()
    expect(screen.getByText(/不盯盘、不预测的普通人投资方法/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '开始阅读' }).getAttribute('href')).toBe('/first-book')
    expect(screen.getByRole('link', { name: '看目录' }).getAttribute('href')).toBe('/first-book/slow-is-fast')
    expect(screen.queryByRole('heading', { name: '最近更新' })).toBeNull()
  })

  it('三个栏目入口', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    for (const h of ['/invest', '/ai', '/life']) {
      expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === h), h).toBe(true)
    }
  })

  it('空候选也显示「看最新评级复盘」静态入口，直达研究方法页复盘小节锚点', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.queryByText('今日待办')).toBeNull()
    const link = screen.getByRole('link', { name: /看最新评级复盘/ })
    expect(link.getAttribute('href')).toBe('/research-notes?tab=method#rating-review')
  })

  it('有候选时今日待办与评级复盘入口同时显示，原栏目目录保留', () => {
    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'PEP', addedAt: '2026-01-01T00:00:00.000Z' }]))
    stubFetch(() => Promise.reject(new Error('offline')))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText('今日待办')).toBeTruthy()
    expect(screen.getByRole('link', { name: /看最新评级复盘/ })).toBeTruthy()
    for (const h of ['/invest', '/ai', '/life']) {
      expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === h), h).toBe(true)
    }
  })

  it('首页不出现起始金额 300，栏目卡片用 *** 与目标 400 万', () => {
    stubFetch(() => new Promise(() => {}))
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>)
    expect(container.textContent).not.toMatch(/300/)
    expect(container.textContent).toContain('从 *** 到目标 400 万')
  })

  it('无计划首访：一行定位 + 明显「从这里开始」；不显示私人计划卡', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText(/用规则做投资的个人研究站/)).toBeTruthy()
    const start = screen.getByRole('link', { name: /^从这里开始/ })
    expect(start.getAttribute('href')).toBe('/invest/start')
    expect(screen.queryByLabelText('我的计划')).toBeNull()
    expect(screen.queryByText(/万元|预算|应急金/)).toBeNull()
  })

  it('有计划：显示下次检查日与待办数，不显示个人金额', () => {
    const doc = createEmptyPlan('2026-11-14T00:00:00.000Z', 'home-plan')
    doc.wizard = { nextStep: 4, completed: true, skippedSteps: [1, 2, 3, 4] }
    doc.review = {
      id: 'r1',
      anchor: '2026-12-15',
      intervalMonths: 6,
      completedDates: [],
      calendarSequence: 0,
      mode: 'calendar-check-band-act',
    }
    doc.funding.budgets = {
      core: { currency: 'CNY', amount: '100000.00' },
      research: { currency: 'CNY', amount: '20000.00' },
      reserve: { currency: 'CNY', amount: '30000.00' },
      confirmedAt: '2026-11-14T00:00:00.000Z',
    }
    localStorage.setItem(PLAN_KEYS.document, JSON.stringify(doc))
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText(/下次检查日 2026-12-15|检查日 2026-12-15/)).toBeTruthy()
    expect(screen.getByText(/待办/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/100000|20000|30000|万元/)
    expect(screen.queryByText(/用规则做投资的个人研究站/)).toBeNull()
  })

  it('常用工具说明用短文案，不靠省略号截断长句', () => {
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    for (const t of WORKBENCH_TOOLS) {
      expect(t.desc.length, t.path).toBeLessThanOrEqual(18)
      expect(t.desc).not.toMatch(/…|\.\.\./)
    }
  })

})

describe('RecentUpdates', () => {
  it('显示最近 5 项已上线需求及使用入口', () => {
    render(<MemoryRouter><RecentUpdates /></MemoryRouter>)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    for (const update of SITE_UPDATES.slice(0, 5)) {
      expect(screen.getByRole('link', { name: update.title }).getAttribute('href')).toBe(update.href)
      expect(screen.getByText(update.description)).toBeTruthy()
    }
  })

  it('不再读取或展示 Git 提交记录', () => {
    stubFetch(async () => ({ ok: true, json: async () => changelog(9) }))
    const { container } = render(<MemoryRouter><RecentUpdates /></MemoryRouter>)
    expect(fetch).not.toHaveBeenCalled()
    expect(container.textContent).not.toMatch(/更新0|chore:|feat\(|regenerate changelog/)
  })
})

describe('今日待办', () => {
  it('没有候选时不显示；有到期的决策记录时显示计数并链接到候选池', async () => {
    stubFetch(() => Promise.reject(new Error('offline')))
    const first = render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.queryByText('今日待办')).toBeNull()
    first.unmount()

    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'PEP', addedAt: '2026-01-01T00:00:00.000Z', decisions: [{ at: '2026-01-01T00:00:00.000Z', action: 'watch', why: 'w', wrong: 'x', nextCheck: '2026-02-01' }] }]))
    render(<MemoryRouter><Home /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /到期复查 1/ })
    expect(link.getAttribute('href')).toBe('/candidates')
  })

  it('无本机到期事项时：自动 DCF 读取中不断言“没有进入买入区”', () => {
    resetAutoDcf()
    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'PEP', addedAt: '2026-01-01T00:00:00.000Z' }]))
    stubFetch(() => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText('候选池 1 家，今天没有到期复查；自动 DCF 读取中，进入买入区稍后核对')).toBeTruthy()
    expect(screen.queryByText(/没有到期复查或进入买入区/)).toBeNull()
    resetAutoDcf()
  })

  it('自动 DCF 读不到：写明买入区只按本机 DCF 核对；本机到期提醒照常计数', async () => {
    resetAutoDcf()
    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'PEP', addedAt: '2026-01-01T00:00:00.000Z' }]))
    stubFetch(() => Promise.reject(new Error('offline')))
    const first = render(<MemoryRouter><Home /></MemoryRouter>)
    expect(await screen.findByText('候选池 1 家，今天没有到期复查；自动 DCF 暂无可用数据，进入买入区只按本机 DCF 核对')).toBeTruthy()
    first.unmount()
    resetAutoDcf()
    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'PEP', addedAt: '2026-01-01T00:00:00.000Z', decisions: [{ at: '2026-01-01T00:00:00.000Z', action: 'watch', why: 'w', wrong: 'x', nextCheck: '2026-02-01' }] }]))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: /到期复查 1.*自动 DCF 暂无可用数据/ })).toBeTruthy()
    resetAutoDcf()
  })
})


describe('今日待办：研究锚点可靠性', () => {
  const TODAY = new Date().toLocaleDateString('en-CA')
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response
  const rule = (type: 'research-bear' | 'manual' | 'dcf-buy-below' = 'research-bear') => ({
    kind: 'price-below' as const, threshold: 80, currency: 'USD' as const,
    anchor: { type, value: 80, asOf: TODAY }, enabled: true, createdAt: '2026-01-01T00:00:00.000Z',
  })
  const candidate = (code: string, anchor?: 'research-bear' | 'manual' | 'dcf-buy-below') => ({
    market: 'us', code, addedAt: '2026-01-01T00:00:00.000Z', ...(anchor ? { alert: rule(anchor) } : {}),
  })
  const autoBody = (codes: string[]) => ({
    schemaVersion: 1,
    items: Object.fromEntries(codes.map(code => [`us:${code}`, [0, 100, null, 'm', 75, 'USD', TODAY, 0]])),
  })
  const refsOk = (v?: boolean) => ok({ version: 1, items: { 'us:PEP': { n: '百事', ...(typeof v === 'boolean' ? { v } : {}) } } })
  const stubData = (codes: string[], refs: () => Promise<unknown>) => {
    resetAutoDcf()
    const mock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.includes('dcf-auto.json')) return ok(autoBody(codes))
      if (url.includes('company-refs.json')) return refs()
      return ok({})
    })
    vi.stubGlobal('fetch', mock as unknown as typeof fetch)
    return mock
  }

  it.each([false, true])('已知 v=%s 时与候选池门禁一致', async reliable => {
    localStorage.setItem('rn-candidates', JSON.stringify([candidate('PEP', 'research-bear')]))
    stubData(['PEP'], async () => refsOk(reliable))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText(/研究条件价依据读取中/)).toBeTruthy()
    await waitFor(() => expect(screen.queryByText(/研究条件价依据读取中/)).toBeNull())
    if (reliable) expect(screen.getByRole('link', { name: /触及条件价 1/ })).toBeTruthy()
    else expect(screen.queryByRole('link', { name: /触及条件价/ })).toBeNull()
  })

  it('已有记录缺少可选 v 时暂停命中，并提示依据不完整', async () => {
    localStorage.setItem('rn-candidates', JSON.stringify([candidate('PEP', 'research-bear')]))
    stubData(['PEP'], async () => refsOk())
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(await screen.findByText(/研究条件价依据不完整，相关命中暂停，请到候选池核对/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /触及条件价/ })).toBeNull()
  })

  it.each(['pending', 'failed'] as const)('公司参考数据 %s 时暂停研究命中并显示覆盖提示，不断言无待办', async mode => {
    localStorage.setItem('rn-candidates', JSON.stringify([candidate('PEP', 'research-bear')]))
    stubData(['PEP'], () => mode === 'pending' ? new Promise(() => {}) : Promise.reject(new Error('offline')))
    render(<MemoryRouter><Home /></MemoryRouter>)
    if (mode === 'pending') expect(screen.getByText(/研究条件价依据读取中，相关命中暂停，请到候选池核对/)).toBeTruthy()
    else expect(await screen.findByText(/研究条件价依据读取失败，相关命中暂停，请到候选池核对/)).toBeTruthy()
    await waitFor(() => expect(screen.queryByText(/自动 DCF 读取中/)).toBeNull())
    expect(screen.queryByRole('link', { name: /触及条件价/ })).toBeNull()
    expect(screen.queryByText(/没有到期复查或进入买入区/)).toBeNull()
  })

  it('研究参考数据加载中，手动/DCF 锚点和到期复查仍照常提示', async () => {
    localStorage.setItem('rn-candidates', JSON.stringify([
      candidate('PEP', 'research-bear'), candidate('MN', 'manual'), candidate('DCF', 'dcf-buy-below'),
      { ...candidate('REV'), decisions: [{ at: '2026-01-01T00:00:00.000Z', action: 'watch', why: 'w', wrong: 'x', nextCheck: '2026-02-01' }] },
    ]))
    stubData(['PEP', 'MN', 'DCF'], () => new Promise(() => {}))
    render(<MemoryRouter><Home /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /触及条件价 2/ })
    expect(link.textContent).toContain('到期复查 1')
    expect(link.textContent).not.toContain('触及条件价 3')
    expect(screen.getByText(/研究条件价依据读取中，相关命中暂停/)).toBeTruthy()
  })

  it('没有研究锚点时不请求 company-refs', async () => {
    localStorage.setItem('rn-candidates', JSON.stringify([candidate('MN', 'manual')]))
    const mock = stubData(['MN'], async () => refsOk(true))
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: /触及条件价 1/ })).toBeTruthy()
    expect(mock.mock.calls.some(call => String(call[0]).includes('company-refs.json'))).toBe(false)
  })
})
