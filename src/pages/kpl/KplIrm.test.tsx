import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplIrm from './KplIrm'
import { irmDayFixture, irmFixture } from '../../features/kpl-irm/fixtures'
import { asIrmDay, asKplIrm } from '../../features/kpl-irm/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/irm']}><KplIrm /></MemoryRouter>)
type Resp = { status?: number; bad?: boolean; body?: unknown }
const stub = (files: Record<string, Resp>) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const name = String(url).split('/').pop() ?? ''
  const r = files[name] ?? { status: 404 }
  const status = r.status ?? 200
  return { ok: status === 200, status, json: async () => { if (r.bad) throw new SyntaxError('html'); return r.body } }
}))
const ok = () => stub({ 'kpl-irm.json': { body: irmFixture() }, 'kpl-irm-tue.json': { body: irmDayFixture() } })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 互动问答页', () => {
  it('概览：条数、平台、分类分布；日期可切换', async () => {
    ok()
    renderPage()
    const top = await screen.findByLabelText('当日问答概览')
    expect(top.textContent).toContain('已回复问答3条')
    const bars = screen.getByRole('list', { name: '回复分类' })
    expect(within(bars).getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByRole('img', { name: '每日已回复问答条数' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '回复日期' })).getByRole('button', { name: /11\/16/ }))
    expect(screen.getByLabelText('当日问答概览').textContent).toContain('已回复问答1条')
    expect(await screen.findByText(/2026-11-16 的问答明细暂不可用/)).toBeTruthy()
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
  })

  it('热门公司：回复数、当日涨跌（缺失显示 —）、行业', async () => {
    ok()
    renderPage()
    const table = await screen.findByRole('region', { name: '热门公司列表' })
    const row = within(table).getByText('迈瑞医疗').closest('tr')!
    expect(row.textContent).toContain('+2.11%')
    expect(row.textContent).toContain('—')
    expect(within(table).getByText('−3.50%')).toBeTruthy()
  })

  it('问答检索：关键词、平台、分类筛选；点关键词热度填入检索', async () => {
    ok()
    renderPage()
    const list = await screen.findByRole('list', { name: '问答列表' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('检索问答'), { target: { value: '不涉及' } })
    expect(within(screen.getByRole('list', { name: '问答列表' })).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('检索问答'), { target: { value: '' } })
    fireEvent.click(within(screen.getByRole('group', { name: '平台' })).getByRole('button', { name: 'e 互动' }))
    const sh = within(screen.getByRole('list', { name: '问答列表' })).getAllByRole('listitem')
    expect(sh).toHaveLength(1)
    expect(within(sh[0]).getByRole('link', { name: '公司主页' }).getAttribute('href')).toContain('sns.sseinfo.com')
    fireEvent.click(within(screen.getByRole('group', { name: '平台' })).getByRole('button', { name: '全部平台' }))
    fireEvent.click(within(screen.getByRole('group', { name: '分类' })).getByRole('button', { name: '澄清否认' }))
    expect(within(screen.getByRole('list', { name: '问答列表' })).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(within(screen.getByRole('group', { name: '分类' })).getByRole('button', { name: '全部分类' }))
    fireEvent.click(within(screen.getByRole('list', { name: '关键词热度' })).getByRole('button', { name: /算力/ }))
    expect((screen.getByLabelText('检索问答') as HTMLInputElement).value).toBe('算力')
    expect(within(screen.getByRole('list', { name: '问答列表' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('问询函 / 监管函：按类型筛选，含原文与回复链接；分类规则写在页面上', async () => {
    ok()
    renderPage()
    const seg = await screen.findByRole('group', { name: '函件类型' })
    fireEvent.click(within(seg).getByRole('button', { name: /^问询函/ }))
    const table = screen.getByRole('region', { name: '函件列表' })
    expect(within(table).getByRole('link', { name: '中文在线 问询函' })).toBeTruthy()
    expect(within(table).getByRole('link', { name: '公司回复' })).toBeTruthy()
    fireEvent.click(within(seg).getByRole('button', { name: /^关注函/ }))
    expect(screen.getByText('这段时间没有该类函件。')).toBeTruthy()
    const rules = screen.getByRole('region', { name: '分类规则表' })
    expect(within(rules).getByText('去掉客套话后前 80 字')).toBeTruthy()
    expect(screen.getAllByText(/机械的关键词匹配，不是判断/).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|买点|卖点|胜率/)
  })

  it('索引不存在 / 回退成 HTML 时显示尚未生成；格式不对时提示', async () => {
    stub({})
    renderPage()
    expect(await screen.findByText('互动问答数据尚未生成')).toBeTruthy()
    cleanup()
    stub({ 'kpl-irm.json': { bad: true } })
    renderPage()
    expect(await screen.findByText('互动问答数据尚未生成')).toBeTruthy()
    cleanup()
    stub({ 'kpl-irm.json': { body: { version: 2 } } })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })
})

describe('数据模型', () => {
  it('次要部分缺失按空处理；关键字段缺失返回 null；明细日期必须一致', () => {
    const f = irmFixture()
    delete f.history
    delete f.letters
    const m = asKplIrm(f)!
    expect(m.history).toEqual([])
    expect(m.letters).toBeNull()
    expect(asKplIrm({ ...irmFixture(), days: [] })).toBeNull()
    expect(asKplIrm({ ...irmFixture(), days: [{ date: '2026-11-17', total: 1, file: '../x.json', hot: [], cats: {} }] })).toBeNull()
    expect(asIrmDay(irmDayFixture(), '2026-11-17')?.items).toHaveLength(3)
    expect(asIrmDay(irmDayFixture('2026-11-10'), '2026-11-17')).toBeNull() // 上周同一星期的旧文件
  })

  it('样式约束：页面里没有内联样式和硬编码颜色', () => {
    const src = readFileSync(resolve(__dirname, 'KplIrm.tsx'), 'utf8')
    expect(src).not.toMatch(/style=\{\{/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/)
  })
})
