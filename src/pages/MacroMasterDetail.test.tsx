import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MacroMasterDetail from './MacroMasterDetail'
import { useReadings, type ReadingsState } from '../features/macro-masters/readings'
import type { Reading } from '../features/macro-masters/types'

vi.mock('../features/macro-masters/readings', () => ({ useReadings: vi.fn() }))

const mockedUseReadings = vi.mocked(useReadings)
const tenYear: Reading = {
  key: 'tenYear', label: '10 年期美债收益率', value: 5.04, unit: '%', date: '2026-11-19',
  percentile: 82, direction: 'up', source: 'FRED DGS10',
}

function state(value: ReadingsState): void {
  mockedUseReadings.mockReturnValue(value)
}

function renderAt(slug: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/invest/macro-masters/${slug}`]}>
      <Routes><Route path="/invest/macro-masters/:slug" element={<MacroMasterDetail />} /></Routes>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('MacroMasterDetail', () => {
  it('渲染已知大师、指标读数、完整研究和六项前后对照', () => {
    state({ state: 'ok', readings: { tenYear }, asOf: '2026-11-21' })
    renderAt('druckenmiller')
    expect(screen.getByRole('heading', { level: 1, name: '斯坦利·德鲁肯米勒' })).toBeTruthy()
    expect(screen.getByText('Stanley Druckenmiller')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '核心思路' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '他看的指标 · 本站当前读数' })).toBeTruthy()
    expect(screen.getAllByText('10 年期美债收益率').length).toBeGreaterThan(0)
    expect(screen.getAllByText('5.04').length).toBeGreaterThan(0)
    expect(screen.getByText('数据快照：2026-11-21')).toBeTruthy()

    const comparison = screen.getByRole('region', { name: '德鲁肯米勒 2026 年 1 月看多理由与 11 月观点对照' })
    expect(within(comparison).getAllByRole('row')).toHaveLength(7)
    expect(within(comparison).getByText('政策利率对名义增速')).toBeTruthy()
    expect(within(comparison).getByText('AI 资本开支')).toBeTruthy()

    expect(screen.getByRole('heading', { name: '完整研究文档' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /经典周期判断案例/ })).toBeTruthy()
    const maintenance = screen.getByText('与本站数据的对应（维护参考）').closest('details')
    expect(maintenance).not.toBeNull()
    expect(maintenance?.hasAttribute('open')).toBe(false)
    expect(screen.queryByText(/七、可映射到本站数据的指标清单/)).toBeNull()
    const sourceLink = screen.getByRole('link', { name: 'https://gist.github.com/timhwang21/e6a2b24e064182dd9099ad00e4f4f9a6' })
    expect(sourceLink.getAttribute('target')).toBe('_blank')
    expect(sourceLink.getAttribute('rel')).toContain('noopener')
    expect(screen.getByText(/整理自公开访谈、演讲与书信/)).toBeTruthy()
  })

  it('未知 slug 显示标准未找到提示并链接回总览', () => {
    state({ state: 'ok', readings: {}, asOf: '' })
    renderAt('not-a-master')
    expect(screen.getByRole('heading', { level: 1, name: '这一页不存在' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回宏观大师总览' }).getAttribute('href')).toBe('/invest/macro-masters')
    expect(screen.queryByRole('heading', { name: '核心思路' })).toBeNull()
  })

  it('读数加载中时每个指标显示加载状态，正文仍可阅读', () => {
    state({ state: 'loading' })
    renderAt('marks')
    expect(screen.getAllByText('读数加载中').length).toBeGreaterThan(5)
    expect(screen.getByRole('heading', { name: '完整研究文档' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('读数失败时显示错误提示和本站暂无，不隐藏研究正文', () => {
    state({ state: 'error', message: '测试加载失败' })
    renderAt('dalio')
    expect(screen.getByRole('alert').textContent).toContain('读数暂时无法加载')
    expect(screen.getByRole('alert').textContent).toContain('测试加载失败')
    expect(screen.getAllByText('本站暂无').length).toBeGreaterThan(5)
    expect(screen.getByRole('heading', { name: '完整研究文档' })).toBeTruthy()
  })

  it('读数为空时正常显示本站暂无', () => {
    state({ state: 'ok', readings: {}, asOf: '' })
    renderAt('templeton')
    expect(screen.getAllByText('本站暂无').length).toBeGreaterThan(5)
    expect(screen.queryByText(/数据快照/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
