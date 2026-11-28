import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StockLookup from './StockLookup'
import { createDemoApi } from './panels/demoApi'
import type { StockLookupApi } from './types'

vi.mock('./chart/ChartWorkbench', () => ({
  default: () => <div data-testid="chart-workbench">图表占位</div>,
}))

afterEach(() => { cleanup() })

function UrlProbe(): JSX.Element {
  const [params] = useSearchParams()
  return <div data-testid="url">{params.toString()}</div>
}

function mount(path: string, api?: StockLookupApi) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research-notes" element={<><UrlProbe /><StockLookup api={api ?? createDemoApi()} /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('StockLookup 组装', () => {
  it('页签网址同步：示例代码写入 s=', async () => {
    mount('/research-notes?tab=lookup')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'MRVL' }))
    })
    await waitFor(() => expect(screen.getByTestId('url').textContent).toContain('s=MRVL'))
    await screen.findByRole('heading', { name: /示例科技|MRVL/i }, { timeout: 3000 })
    expect(screen.getByTestId('chart-workbench')).toBeTruthy()
  })

  it('各块失败互不影响', async () => {
    const api = createDemoApi({
      news: async () => { throw { error: '新闻挂了', reason: 'upstream' as const } },
      offExchange: async () => { throw { error: '场外挂了', reason: 'upstream' as const } },
    })
    mount('/research-notes?tab=lookup&s=MRVL', api)
    await screen.findByRole('heading', { name: /示例科技|MRVL/i }, { timeout: 3000 })
    await waitFor(() => {
      expect(screen.getAllByText('数据暂时取不到').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getByRole('heading', { name: '评级分布' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '分析师评级表' })).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/第 1 \/ \d+ 页/)).toBeTruthy())
  })

  it('分析师分页', async () => {
    mount('/research-notes?tab=lookup&s=MRVL')
    await screen.findByRole('heading', { name: '分析师评级表' }, { timeout: 3000 })
    await waitFor(() => expect(screen.getByText(/第 1 \/ 3 页/)).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    })
    await waitFor(() => expect(screen.getByText(/第 2 \/ 3 页/)).toBeTruthy())
    const goto = screen.getByLabelText('页码')
    await act(async () => {
      fireEvent.change(goto, { target: { value: '3' } })
      fireEvent.click(screen.getByRole('button', { name: '前往' }))
    })
    await waitFor(() => expect(screen.getByText(/第 3 \/ 3 页/)).toBeTruthy())
  })

  it('新闻筛选计数与组合', async () => {
    mount('/research-notes?tab=lookup&s=MRVL')
    const heading = await screen.findByRole('heading', { name: '新闻中心' }, { timeout: 3000 })
    const news = heading.closest('section')!
    await waitFor(() => expect(within(news).getByRole('button', { name: /业绩财报/ })).toBeTruthy())
    await act(async () => {
      fireEvent.click(within(news).getByRole('button', { name: /业绩财报/ }))
    })
    await waitFor(() => {
      expect(within(news).getAllByRole('link').length).toBe(1)
    })
  })

  it('沪深代码：场外与评级显示暂不支持，行情仍可用', async () => {
    mount('/research-notes?tab=lookup&s=sh600519')
    await screen.findByRole('heading', { name: /示例白酒|茅台/ }, { timeout: 3000 })
    expect(screen.getAllByText('暂不支持').length).toBeGreaterThanOrEqual(1)
  })
})
