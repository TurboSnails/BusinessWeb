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

  it('沪深代码：四个美股专项面板显示暂不支持该市场，且不发请求', async () => {
    const insider = vi.fn()
    const options = vi.fn()
    mount('/research-notes?tab=lookup&s=sh600519', createDemoApi({ insider, options }))
    await screen.findByRole('heading', { name: /示例白酒|茅台/ }, { timeout: 3000 })
    for (const label of ['财报预期', '内部人交易', '做空数据', '期权数据']) {
      expect(screen.getByText(new RegExp(`暂不支持该市场：${label}目前只覆盖美股`))).toBeTruthy()
    }
    expect(insider).not.toHaveBeenCalled()
    expect(options).not.toHaveBeenCalled()
  })

  it('美股代码：财报预期、内部人交易、空头持仓、期权概况渲染', async () => {
    mount('/research-notes?tab=lookup&s=MRVL')
    for (const name of ['财报预期', '内部人交易', '做空数据（空头持仓）', '期权概况']) {
      await screen.findByRole('heading', { name }, { timeout: 3000 })
    }
    await waitFor(() => expect(screen.getByText(/近 6 个月公开市场净买卖/)).toBeTruthy())
    expect(screen.getAllByText('示例人物甲').length).toBeGreaterThan(0)
    expect(screen.getByText('2026-12-03')).toBeTruthy()
    expect(screen.getByText(/每天新发生的卖空成交量/)).toBeTruthy()
    expect(screen.getAllByText('当日成交超过持仓').length).toBeGreaterThan(0)
    // 新面板文案不得出现「机构」「主力」「聪明钱」之类说法
    for (const name of ['财报预期', '内部人交易', '做空数据（空头持仓）', '期权概况']) {
      const section = screen.getByRole('heading', { name }).closest('section')!
      expect(section.textContent).not.toMatch(/机构|主力|聪明钱/)
    }
  })

  it('期权：切换到期日重新取数', async () => {
    const base = createDemoApi()
    const options = vi.fn(base.options)
    mount('/research-notes?tab=lookup&s=MRVL', createDemoApi({ options }))
    const select = await screen.findByLabelText('到期日', {}, { timeout: 3000 }) as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))
    expect(select.value).toBe('2026-12-04')
    await act(async () => {
      fireEvent.change(select, { target: { value: '2026-12-18' } })
    })
    await waitFor(() => expect(options).toHaveBeenLastCalledWith('MRVL', '2026-12-18', expect.anything()))
    await waitFor(() => expect(screen.getByText(/到期日 2026-12-18：/)).toBeTruthy())
  })

  it('内部人交易出错可重试，不影响其他面板', async () => {
    let calls = 0
    const base = createDemoApi()
    const api = createDemoApi({
      insider: async (s, sig) => {
        calls += 1
        if (calls === 1) throw new Error('内部人数据挂了')
        return base.insider(s, sig)
      },
    })
    mount('/research-notes?tab=lookup&s=MRVL', api)
    const heading = await screen.findByRole('heading', { name: '内部人交易' }, { timeout: 3000 })
    const card = heading.closest('section')!
    await waitFor(() => expect(within(card).getByText(/内部人数据挂了/)).toBeTruthy())
    expect(screen.getByRole('heading', { name: '期权概况' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: /重试|再试/ }))
    })
    await waitFor(() => expect(within(card).getByText(/近 6 个月公开市场净买卖/)).toBeTruthy())
  })
})
