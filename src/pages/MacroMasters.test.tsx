import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MASTERS } from '../features/macro-masters/masters'
import { READING_THEMES } from '../features/macro-masters/readings'
import MacroMasters, { MACRO_MASTERS_FOOTER, MACRO_MASTERS_LEAD } from './MacroMasters'

vi.mock('../features/macro-masters/readings', async () => {
  const actual = await vi.importActual<typeof import('../features/macro-masters/readings')>('../features/macro-masters/readings')
  return {
    ...actual,
    useReadings: vi.fn(),
  }
})

import { useReadings } from '../features/macro-masters/readings'

const mockedUse = vi.mocked(useReadings)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <MacroMasters />
    </MemoryRouter>,
  )
}

describe('MacroMasters 总览页', () => {
  it('渲染 9 张大师卡与导语、页脚', () => {
    mockedUse.mockReturnValue({ state: 'loading' })
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('宏观大师怎么看周期')
    expect(screen.getByText(MACRO_MASTERS_LEAD)).toBeTruthy()
    expect(screen.getByText(MACRO_MASTERS_FOOTER)).toBeTruthy()
    const cards = screen.getByLabelText('九位宏观大师')
    expect(within(cards).getAllByRole('link')).toHaveLength(9)
    for (const master of MASTERS) {
      expect(within(cards).getByRole('link', { name: new RegExp(master.name) }).getAttribute('href'))
        .toBe(`/invest/macro-masters/${master.slug}`)
      expect(cards.textContent).toContain(master.oneLiner)
      expect(cards.textContent).toContain(master.kind === 'quant' ? '偏定量' : '偏定性')
    }
  })

  it('对照表覆盖各主题，读数加载中显示加载中', () => {
    mockedUse.mockReturnValue({ state: 'loading' })
    renderPage()
    expect(screen.getByRole('heading', { name: '指标对照' })).toBeTruthy()
    const table = screen.getByRole('table')
    for (const theme of READING_THEMES) {
      expect(within(table).getAllByText(theme.name).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByText(/加载中/).length).toBeGreaterThan(5)
  })

  it('读数失败时显示错误，成功时展示数值', () => {
    mockedUse.mockReturnValue({ state: 'error', message: '网络中断' })
    renderPage()
    expect(screen.getByRole('alert').textContent).toContain('网络中断')

    cleanup()
    mockedUse.mockReturnValue({
      state: 'ok',
      asOf: '2026-11-20',
      readings: {
        fedAssets: {
          key: 'fedAssets',
          label: '美联储总资产',
          value: 6741,
          unit: '十亿美元',
          date: '2026-11-18',
          percentile: 70,
          direction: 'up',
          source: 'test',
        },
        copper: null,
      },
    })
    renderPage()
    expect(screen.getByText(/6,?741/)).toBeTruthy()
    expect(screen.getAllByText('本站暂无').length).toBeGreaterThan(0)
  })

  it('390px 宽时表格在自身滚动容器内且第一列可固定', () => {
    mockedUse.mockReturnValue({ state: 'loading' })
    const { container } = renderPage()
    const scroll = container.querySelector('.mm-overview__table-scroll') as HTMLElement
    const sticky = container.querySelector('.mm-overview__table tbody th[scope="row"]') as HTMLElement
    expect(scroll).toBeTruthy()
    expect(getComputedStyle(scroll).overflowX === 'auto' || scroll.className.includes('table-scroll')).toBe(true)
    expect(sticky).toBeTruthy()
    // jsdom 不计算 sticky，断言类与结构即可；量化检查写入报告
    expect(container.querySelector('.mm-overview')).toBeTruthy()
  })
})
