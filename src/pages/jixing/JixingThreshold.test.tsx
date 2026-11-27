import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { thresholdFixture } from '../../features/jixing-threshold/fixtures'
import { asJixingThreshold } from '../../features/jixing-threshold/model'
import JixingThreshold from './JixingThreshold'

function renderPage(body: unknown = thresholdFixture, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })))
  return render(<MemoryRouter initialEntries={['/jixing/threshold']}><JixingThreshold /></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('阀值表', () => {
  it('渲染行、已低估与跳转', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('沪深300')).toBeTruthy()
    expect(within(table).getByText('已低估')).toBeTruthy()
    expect(within(table).getByRole('link', { name: '沪深300' }).getAttribute('href')).toBe('/jixing/table?code=000300')
  })

  it('分组筛选', async () => {
    renderPage()
    await screen.findByRole('table')
    fireEvent.click(within(screen.getByRole('group', { name: '指数分组' })).getByRole('button', { name: '专题·养老' }))
    expect(screen.getByText('养老产业')).toBeTruthy()
    expect(screen.queryByText('沪深300')).toBeNull()
  })

  it('空态显示 LoadError 与重试', async () => {
    renderPage(null, false)
    expect((await screen.findByRole('alert')).textContent).toContain('数据暂时取不到')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('校验器', () => {
    expect(asJixingThreshold(thresholdFixture)?.rows.length).toBe(3)
    expect(asJixingThreshold({ ...thresholdFixture, rows: [] })).toBeNull()
  })
})
