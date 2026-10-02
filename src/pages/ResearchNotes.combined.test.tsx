// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import ResearchNotes from './ResearchNotes'

beforeAll(() => {
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', async (url: string) => {
    const u = String(url)
    const name = u.includes('us.json') ? 'us.json' : u.includes('hk.json') ? 'hk.json' : u.includes('adr.json') ? 'adr.json' : u.includes('lynch.json') ? 'lynch.json' : 'cn.json'
    return { ok: true, json: async () => JSON.parse(readFileSync(resolve('public/data', name), 'utf8')) } as Response
  })
})
afterEach(() => cleanup())

describe('综合分类筛选（真实页面集成）', () => {
  it('切换行业/评级/林奇类型后表格行数确实变化', async () => {
    localStorage.clear()
    render(<MemoryRouter initialEntries={['/research-notes?tab=category&m=us&v=combined']}><Routes><Route path="/research-notes" element={<ResearchNotes />} /></Routes></MemoryRouter>)
    const section = await screen.findByRole('region', { name: '综合分类' })
    await waitFor(() => expect(within(section).getAllByRole('row').length).toBeGreaterThan(20))
    const rows = (): number => within(section).getAllByRole('row').length - 1
    const total = rows()
    const sector = within(section).getByRole('combobox', { name: '行业' }) as HTMLSelectElement
    const pick = sector.options[2].value
    fireEvent.change(sector, { target: { value: pick } })
    const afterSector = rows()
    expect(afterSector).toBeLessThan(total)
    fireEvent.change(within(section).getByRole('combobox', { name: '林奇类型' }), { target: { value: '稳健型' } })
    expect(rows()).toBeLessThanOrEqual(afterSector)
    fireEvent.click(within(section).getByRole('button', { name: '重置筛选' }))
    expect(rows()).toBe(total)
  })
})
