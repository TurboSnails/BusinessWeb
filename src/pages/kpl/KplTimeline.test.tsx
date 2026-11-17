import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplTimeline from './KplTimeline'
import { timelineFixture } from '../../features/kpl-timeline/fixtures'
import { asKplTimeline } from '../../features/kpl-timeline/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/timeline']}><KplTimeline /></MemoryRouter>)
const stub = (body: unknown, status = 200, bad = false) => vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: status === 200, status, json: async () => { if (bad) throw new SyntaxError('html'); return body },
})))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 时间线页', () => {
  it('写明收盘后还原；总览含指数、涨停、板块异动，缺失显示「—」', async () => {
    stub(timelineFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '时间线总览' })
    expect(top.textContent).toContain('−0.50%')
    expect(top.textContent).toContain('最早封板 09:25:00')
    expect(top.textContent).toContain('概念甲')
    expect(top.textContent).toContain('收盘后当天采集，本次没有')
    expect(screen.getByText('收盘后还原，不是盘中直播')).toBeTruthy()
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
  })

  it('指数关键点：高低点带时间，缺失的整点为「—」', async () => {
    stub(timelineFixture())
    renderPage()
    const t = await screen.findByRole('region', { name: '指数关键点' })
    const row = within(t).getByText('创业板指').closest('tr')!
    expect(row.textContent).toContain('+0.80%10:00')
    expect(row.textContent).toContain('—')
  })

  it('半小时小结：涨停新增、最活跃行业', async () => {
    stub(timelineFixture())
    renderPage()
    const t = await screen.findByRole('region', { name: '每 30 分钟小结表' })
    const row = within(t).getByText('09:30–10:00').closest('tr')!
    expect(row.textContent).toContain('行业乙（2）')
    expect(row.textContent).toContain('+1.10')
  })

  it('时间线：按类型筛选，概念提示，缺失部分写明', async () => {
    stub(timelineFixture())
    renderPage()
    const list = await screen.findByRole('list', { name: '盘面时间线' })
    expect(within(list).getByText('股票甲 首次封涨停')).toBeTruthy()
    expect(within(list).getAllByText(/概念提示：概念甲（2 只）/).length).toBe(2)
    expect(screen.getByText(/只能在交易日收盘后当天采集，本次没有/)).toBeTruthy()
    const group = screen.getByRole('group', { name: '事件类型' })
    expect((within(group).getByRole('button', { name: /封板 \/ 开板/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(group).getByRole('button', { name: /首次封涨停/ }))
    expect(within(screen.getByRole('list', { name: '盘面时间线' })).queryByText('股票甲 首次封涨停')).toBeNull()
    expect(screen.getAllByText(/不代表上涨原因/).length).toBeGreaterThan(0)
  })

  it('板块异动：偏多占比、首只涨停；类型筛选', async () => {
    stub(timelineFixture())
    renderPage()
    const t = await screen.findByRole('region', { name: '板块异动表' })
    const row = within(t).getByText('概念甲').closest('tr')!
    expect(row.textContent).toContain('49.4%')
    expect(row.textContent).toContain('09:25:02股票甲')
    expect(row.textContent).toContain('快速反弹 383')
    expect(within(t).getByText('地域乙').closest('tr')!.textContent).toContain('—')
    fireEvent.click(within(screen.getByRole('group', { name: '板块类型' })).getByRole('button', { name: '地域' }))
    const t2 = screen.getByRole('region', { name: '板块异动表' })
    expect(within(t2).queryByText('概念甲')).toBeNull()
    expect(within(t2).getByText('地域乙')).toBeTruthy()
  })

  it('板块异动缺失时显示说明而不是报错', async () => {
    stub({ ...timelineFixture(), boards: null })
    renderPage()
    expect(await screen.findByText(/本次没有取到当日板块异动数据/)).toBeTruthy()
  })

  it('文件缺失、HTML 回退、格式不对', async () => {
    stub(null, 404)
    renderPage()
    expect(await screen.findByText('时间线数据尚未生成')).toBeTruthy()
    cleanup()
    stub(null, 200, true)
    renderPage()
    expect(await screen.findByText('时间线数据尚未生成')).toBeTruthy()
    cleanup()
    stub({ version: 2 })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })
})

describe('数据模型', () => {
  it('次要部分缺失按空处理；关键字段缺失返回 null', () => {
    const f = timelineFixture() as Record<string, unknown>
    delete f.history
    delete f.slots
    delete f.boards
    const m = asKplTimeline(f)!
    expect(m.history).toEqual([])
    expect(m.slots).toEqual([])
    expect(m.boards).toBeNull()
    expect(asKplTimeline({ ...timelineFixture(), indices: [] })).toBeNull()
    expect(asKplTimeline({ ...timelineFixture(), events: null })).toBeNull()
    expect(asKplTimeline({ ...timelineFixture(), events: [{ t: '09:30:00', kind: 'x', title: 'y' }] })!.events).toEqual([])
  })

  it('样式约束：页面里没有内联样式和硬编码颜色', () => {
    const src = readFileSync(resolve(__dirname, 'KplTimeline.tsx'), 'utf8')
    expect(src).not.toMatch(/style=\{\{/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/)
  })
})
