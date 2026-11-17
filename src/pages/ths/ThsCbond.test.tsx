import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThsCbond from './ThsCbond'
import { cbondFixture } from '../../features/ths-cbond/fixtures'
import { applyFilter, asThsCbond, type BondRow } from '../../features/ths-cbond/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/ths-mood/cbond']}><ThsCbond /></MemoryRouter>)
const stub = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status === 200, status, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const seg = (group: string, name: RegExp) => within(screen.getByRole('group', { name: group })).getByRole('button', { name })
const firstNames = (region: HTMLElement) => within(region).getAllByRole('row').slice(1).map(r => r.querySelector('th')?.textContent)

describe('同花顺 · 可转债页', () => {
  it('全景：指数、数量、价格中位数、平均溢价率；免责声明', async () => {
    stub(cbondFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '转债全景' })
    expect(top.textContent).toContain('432.82')
    expect(top.textContent).toContain('−0.10%')
    expect(top.textContent).toContain('123.88')
    expect(top.textContent).toContain('72.55%')
    expect(top.textContent).toContain('上涨 2 · 下跌 1')
    expect(screen.getByText(/与同花顺官方无关/)).toBeTruthy()
  })

  it('分布切换：价格 / 溢价率 / 涨跌', async () => {
    stub(cbondFixture())
    renderPage()
    expect((await screen.findByRole('list', { name: '价格分布' })).textContent).toContain('120–130')
    fireEvent.click(seg('分布类型', /溢价率分布/))
    expect(screen.getByRole('list', { name: '转股溢价率分布' }).textContent).toContain('119')
    fireEvent.click(seg('分布类型', /涨跌分布/))
    expect(screen.getByRole('list', { name: '涨跌幅分布' }).textContent).toContain('≥3%')
  })

  it('选债表：默认按双低升序，缺失显示「—」；预设筛选', async () => {
    stub(cbondFixture())
    renderPage()
    const table = await screen.findByRole('region', { name: '选债表' })
    expect(firstNames(table)).toEqual(['双低甲110001', '高价乙110002', '缺字段丙110003'])
    expect(within(table).getByText('缺字段丙').closest('tr')!.textContent).toContain('—')
    expect(within(table).getAllByText('5.00 亿').length).toBeGreaterThan(0)
    fireEvent.click(seg('选债筛选', /低价/))
    expect(firstNames(screen.getByRole('region', { name: '选债表' }))).toEqual(['双低甲110001'])
    fireEvent.click(seg('选债筛选', /低溢价/))
    expect(firstNames(screen.getByRole('region', { name: '选债表' }))).toEqual(['高价乙110002', '双低甲110001'])
    expect(screen.getByText(/双低 = 价格 \+ 转股溢价率/)).toBeTruthy()
  })

  it('套利与条款：折价转股说明 T+1 与成本；强赎、下修、到期回售', async () => {
    stub(cbondFixture())
    renderPage()
    const d = await screen.findByRole('region', { name: '折价转股' })
    expect(within(d).getByText('36.8 元')).toBeTruthy()
    expect(screen.getByText(/T\+1/)).toBeTruthy()
    fireEvent.click(seg('套利与条款分类', /强赎进度/))
    const c = screen.getByRole('region', { name: '强赎进度' })
    expect(within(c).getByText('14 / 15（30 日内）')).toBeTruthy()
    expect(within(c).getByText('承诺不强赎')).toBeTruthy()
    expect(screen.getByText(/已核对到 2026-11-17（强赎天数 8 \/ 8/)).toBeTruthy()
    fireEvent.click(seg('套利与条款分类', /下修进度/))
    const w = screen.getByRole('region', { name: '下修进度' })
    expect(within(w).getByText('董事会已提议')).toBeTruthy()
    expect(within(w).getByText('10 / 15（30 日内）')).toBeTruthy()
    expect(within(w).getByText('30 / 15')).toBeTruthy()
    fireEvent.click(seg('套利与条款分类', /到期与回售/))
    expect(within(screen.getByRole('region', { name: '到期与回售' })).getByText('回售期内')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|买点|卖点/)
  })

  it('打新债与抢权配债：中签率、首日、每签收益、百元股票含权', async () => {
    stub(cbondFixture())
    renderPage()
    const issues = await screen.findByRole('region', { name: '打新债' })
    expect(within(issues).getByText('0.0039%')).toBeTruthy()
    expect(within(issues).getByText('+32.00%')).toBeTruthy()
    expect(within(issues).getByText('317.9 元')).toBeTruthy()
    expect(within(issues).getByText('未上市')).toBeTruthy()
    const rights = screen.getByRole('region', { name: '抢权配债' })
    expect(within(rights).getByText('8.69 元')).toBeTruthy()
    expect(within(rights).getByText('600 股')).toBeTruthy()
    expect(screen.getByText(/百元股票含权 = 每股配售额 ÷ 正股收盘价 × 100/)).toBeTruthy()
  })

  it('数据文件不存在或回退成 HTML 时显示尚未生成；格式不对时提示', async () => {
    stub(null, 404)
    renderPage()
    expect(await screen.findByText('可转债数据尚未生成')).toBeTruthy()
    cleanup()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json') } })))
    renderPage()
    expect(await screen.findByText('可转债数据尚未生成')).toBeTruthy()
    cleanup()
    stub({ version: 2 })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })
})

describe('数据模型', () => {
  it('次要列表缺失按空列表；关键字段缺失返回 null', () => {
    const f = cbondFixture() as Record<string, unknown>
    delete f.call
    delete f.clauseCheck
    delete f.history
    const m = asThsCbond(f)!
    expect(m.call).toEqual([])
    expect(m.history).toEqual([])
    expect(m.clauseCheck.asOf).toBeNull()
    expect(asThsCbond({ ...cbondFixture(), summary: null })).toBeNull()
    expect(asThsCbond({ ...cbondFixture(), rows: [{ code: 1 }] })).toBeNull()
  })

  it('双低前 30 按双低升序、跳过缺失', () => {
    const rows = cbondFixture().rows as unknown as BondRow[]
    expect(applyFilter(rows, 'dual').map(r => r.code)).toEqual(['110001', '110002'])
    expect(applyFilter(rows, 'ytm').map(r => r.code)).toEqual(['110001'])
  })

  it('样式约束：页面里没有内联样式和硬编码颜色', () => {
    const src = readFileSync(resolve(__dirname, 'ThsCbond.tsx'), 'utf8')
    expect(src).not.toMatch(/style=\{\{/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/)
  })
})
