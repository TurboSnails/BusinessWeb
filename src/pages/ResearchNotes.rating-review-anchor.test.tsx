import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import ResearchNotes from './ResearchNotes'
import Home from './Home'

// 评级复盘锚点直达：站内导航、冷启动/刷新、日期可见与加载后定位
const data = {
  schemaVersion: 1, asOf: '2026-11-20', firstSnapshot: '2026-10-23', snapshots: 5, minSample: 30, minPeriods: 8,
  buckets: ['优先关注', '条件关注', '观察', '回避'],
  benchmarks: { cn: '沪深300', hk: '恒生指数', us: '标普500' },
  coverage: { us: { 优先关注: 5 } },
  method: ['统计口径说明'], caveats: ['评级是研究观察状态，不是买卖信号'],
  horizons: [{ weeks: 1, reached: true, pairs: 3, observations: 900, markets: { all: { cells: {}, spreads: [] } } }],
}

const scrollIntoView = vi.fn()

beforeAll(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })))
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(() => { cleanup(); scrollIntoView.mockClear() })

const renderMethod = (entry: string): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes><Route path="/research-notes" element={<ResearchNotes />} /></Routes>
    </MemoryRouter>,
  )

describe('研究方法页「评级复盘」锚点直达', () => {
  it('页首标题附近有「直达评级复盘」，与页内目录共用同一锚点 id', async () => {
    renderMethod('/research-notes?tab=method')
    const quick = screen.getByRole('link', { name: '直达评级复盘' })
    expect(quick.getAttribute('href')).toBe('#rating-review')
    const chip = screen.getByRole('link', { name: '评级复盘' })
    expect(chip.getAttribute('href')).toBe('#rating-review')
    // 直达链接在页首（目录锚点还在长表与说明之下）
    expect(quick.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 小节本身带同名锚点 id，加载后仍在
    expect(document.getElementById('rating-review')).toBeTruthy()
    expect(await screen.findByText(/截至 2026-11-20/)).toBeTruthy()
  })

  it('冷启动/刷新带 #rating-review 直达：加载完成后日期可见并定位到小节', async () => {
    renderMethod('/research-notes?tab=method#rating-review')
    const anchor = document.getElementById('rating-review')
    expect(anchor).toBeTruthy()
    // 数据加载完成后日期出现在锚点小节内（加载后定位不漂移）
    expect(await screen.findByText(/截至 2026-11-20/)).toBeTruthy()
    expect(anchor?.textContent).toContain('截至 2026-11-20')
    // 父级 scrollTo(0) 之后仍滚动到锚点
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
  })

  it('其余 hash 保持原生行为：非法锚点 #% 不抛 URIError，页内目录锚点不触发脚本定位', async () => {
    const first = renderMethod('/research-notes?tab=method#%')
    expect(await screen.findByText(/截至 2026-11-20/)).toBeTruthy()
    expect(scrollIntoView).not.toHaveBeenCalled()
    first.unmount()

    renderMethod('/research-notes?tab=method#m-classify')
    expect(await screen.findByText(/截至 2026-11-20/)).toBeTruthy()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('首页入口站内导航：点击「看最新评级复盘」进入方法页复盘小节', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/research-notes" element={<ResearchNotes />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('link', { name: /看最新评级复盘/ }))
    // 落到研究方法页（方法页签）且评级复盘数据加载、日期可见
    expect(await screen.findByText(/截至 2026-11-20/)).toBeTruthy()
    expect(screen.getByText('研究方法 · 林奇两主线 + 巴菲特边界')).toBeTruthy()
    expect(document.getElementById('rating-review')?.textContent).toContain('截至 2026-11-20')
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
  })
})
