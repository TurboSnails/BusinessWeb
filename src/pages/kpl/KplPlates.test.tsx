import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplPlates from './KplPlates'
import { platesExtras, platesFixture, platesRegionEtf } from '../../features/kpl-plates/fixtures'
import { asKplPlates, heatItems, heatStep, sizeBucket, sortBoards, squarify } from '../../features/kpl-plates/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/plates']}><KplPlates /></MemoryRouter>)
const stub = (body: unknown, { status = 200, type = 'application/json' } = {}) => vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: status < 400, status, headers: { get: () => type }, json: async () => body,
})))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 板块题材页', () => {
  it('今日概览：涨停家数、上涨板块、最强行业与概念', async () => {
    stub(platesFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '今日概览' })
    expect(top.textContent).toContain('37 家')
    expect(top.textContent).toContain('2 / 3')
    expect(top.textContent).toContain('电子化学品Ⅱ')
    expect(top.textContent).toContain('光刻机')
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
    expect(within(screen.getByRole('tablist', { name: '开盘啦页签' })).getByRole('tab', { name: '板块题材' }).getAttribute('aria-selected')).toBe('true')
  })

  it('板块排行：默认按强度，缺失值显示 — 并排最后；可切换概念与排序', async () => {
    stub(platesFixture())
    renderPage()
    const table = await screen.findByRole('table')
    const names = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map(r => r.querySelector('.kp-name')?.textContent)
    expect(names()).toEqual(['电子化学品Ⅱ', '贵金属', '综合Ⅱ'])
    const last = within(table).getAllByRole('row').at(-1)!
    expect(last.textContent).toContain('—')
    expect(last.textContent).not.toContain('0.00%')
    fireEvent.click(within(screen.getByRole('group', { name: '排序指标' })).getByText('涨幅'))
    expect(names()).toEqual(['贵金属', '电子化学品Ⅱ', '综合Ⅱ'])
    fireEvent.click(within(screen.getByRole('group', { name: '板块类型' })).getByText('概念'))
    fireEvent.click(within(screen.getByRole('group', { name: '排序指标' })).getByText('涨停数'))
    expect(names()).toEqual(['央国企改革', '光刻机'])
    expect(screen.getByText(/板块强度（0–100）/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|推荐买/)
  })

  it('题材涨停分布：按连板梯队分行，可切换行业分组', async () => {
    stub(platesFixture())
    renderPage()
    const g = await screen.findByRole('article', { name: '央国企改革 涨停 11 家' })
    expect(within(g).getByText('3 板')).toBeTruthy()
    expect(within(g).getByText('亚泰集团')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '分组方式' })).getByText('行业'))
    const ind = screen.getByRole('article', { name: '电子化学品Ⅱ 涨停 3 家' })
    expect(within(ind).getByText('首板')).toBeTruthy()
    expect(within(ind).getByText('西陇科学').getAttribute('title')).toBe('首次封板 09:35')
  })

  it('板块走势与近几日强势板块；补算说明', async () => {
    stub(platesFixture())
    renderPage()
    expect(await screen.findByRole('img', { name: '电子化学品Ⅱ板块指数走势' })).toBeTruthy()
    expect(screen.getByText('−5.75%')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '走势指标' })).getByText('涨停家数'))
    expect(screen.getByRole('img', { name: '电子化学品Ⅱ涨停家数走势' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '走势板块类型' })).getByText('概念'))
    expect((screen.getByRole('combobox', { name: '选择板块' }) as HTMLSelectElement).value).toBe('BK1001')
    expect(screen.getByText(/所属行业 \/ 概念按现在的分类回填/)).toBeTruthy()
    expect(screen.getByText(/互动精灵/)).toBeTruthy()
  })

  it('数据文件还没生成时显示空状态；格式不对时提示', async () => {
    stub(null, { status: 404 })
    renderPage()
    expect(await screen.findByText('板块题材数据尚未生成')).toBeTruthy()
    cleanup()
    stub('<html>', { type: 'text/html' })
    renderPage()
    expect(await screen.findByText('板块题材数据尚未生成')).toBeTruthy()
    cleanup()
    stub({ version: 2 })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })
})

describe('数据模型', () => {
  it('校验关键字段；缺失值排序在最后', () => {
    expect(asKplPlates(platesFixture())).not.toBeNull()
    expect(asKplPlates({ ...platesFixture(), industry: [] })).toBeNull()
    expect(asKplPlates({ ...platesFixture(), groups: { industry: [] } })).toBeNull()
    expect(asKplPlates({ ...platesFixture(), trend: undefined })!.trend).toEqual([])
    const m = asKplPlates(platesFixture())!
    expect(sortBoards(m.industry, 'mainNet').map(b => b.code)).toEqual(['BK0001', 'BK0002', 'BK0003'])
  })
})

describe('板块分布、板块叠加、概念成分变动', () => {
  const full = () => ({ ...platesFixture(), ...platesExtras() })

  it('分布表：涨停 / 炸板 / 跌停 / 自然涨停 / 曾跌停；拿不到的列显示 —', async () => {
    const f = full()
    f.dist.source = 'pools'
    ;(f.dist.industry[0] as Record<string, unknown>).natural = null
    stub(f)
    renderPage()
    const t = await screen.findByRole('region', { name: '行业涨停 / 炸板 / 跌停分布' })
    const row = within(t).getByText('电子化学品Ⅱ').closest('tr')!
    expect(row.textContent).toContain('—')
    expect(screen.getByText(/全市场：涨停 37 · 炸板 20 · 跌停 67/)).toBeTruthy()
    expect(screen.getByText(/自然涨停、曾跌停拿不到/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '分布板块类型' })).getByText('概念'))
    expect(within(screen.getByRole('region', { name: '概念涨停 / 炸板 / 跌停分布' })).getByText('央国企改革')).toBeTruthy()
  })

  it('板块叠加：默认选前 2 个行业，最多 3 个，可跨类型混选', async () => {
    stub(full())
    renderPage()
    expect(await screen.findByRole('img', { name: '板块叠加：电子化学品Ⅱ、贵金属' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '叠加板块类型' })).getByText('概念'))
    const chips = screen.getByRole('group', { name: '选择叠加板块' })
    fireEvent.click(within(chips).getByRole('button', { name: /光刻机/ }))
    expect(screen.getByRole('img', { name: '板块叠加：电子化学品Ⅱ、贵金属、光刻机' })).toBeTruthy()
    expect((within(chips).getByRole('button', { name: /央国企改革/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '清空选择' }))
    expect(screen.getByText('请选择板块')).toBeTruthy()
    expect(screen.getByText(/换成涨跌幅后放在同一坐标轴/)).toBeTruthy()
  })

  it('概念成分变动：新增 / 剔除可展开；新上线概念；缺失股票说明', async () => {
    stub(full())
    renderPage()
    const head = await screen.findByRole('button', { name: /光刻机\s*\+2\s*−1/ })
    fireEvent.click(head)
    expect(screen.getByText(/新进甲、新进乙/)).toBeTruthy()
    expect(screen.getByText(/剔除丙/)).toBeTruthy()
    expect(screen.getByText(/新上线概念：新概念（12 只）/)).toBeTruthy()
    expect(screen.getByText(/另有 2 只股票当天所属概念为空/)).toBeTruthy()
  })

  it('首日没有上一交易日快照时说明，不比较', async () => {
    const f = full()
    f.members = { ...f.members, base: null, today: null, recent: [] } as unknown as typeof f.members
    stub(f)
    renderPage()
    expect(await screen.findByText(/上一交易日（2026-11-16）没有成分快照/)).toBeTruthy()
  })

  it('旧数据没有附加模块时不显示对应卡片；样式约束', async () => {
    stub(platesFixture())
    renderPage()
    await screen.findByRole('region', { name: '今日概览' })
    expect(screen.queryByText('板块叠加')).toBeNull()
    expect(screen.queryByText('概念成分变动')).toBeNull()
    const m = asKplPlates({ ...full(), intraday: { date: '2026-11-17', times: ['09:30'], boards: [{ code: 'x', name: 'x', kind: 'industry', values: [1, 2] }] } })!
    expect(m.intraday).toBeNull() // 点数与时间轴对不上的板块丢弃
    for (const f of ['KplPlates.tsx', '../../features/kpl-plates/OverlayChart.tsx', '../../features/kpl-plates/HeatMap.tsx', '../../features/kpl-plates/EtfLinks.tsx']) {
      const src = readFileSync(resolve(__dirname, f), 'utf8')
      expect(src).not.toMatch(/style=\{\{/)
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/)
    }
  })
})

describe('板块资金热力图、地域板块、板块关联 ETF', () => {
  const r4 = () => ({ ...platesFixture(), ...platesRegionEtf() })

  it('热力图：面积按 |主力净额|，颜色按涨跌幅分档；点按显示明细；有图例与表格视图', async () => {
    stub(platesFixture())
    renderPage()
    const grid = await screen.findByRole('group', { name: '行业板块资金热力图（方块网格）' })
    const tiles = within(grid).getAllByRole('button')
    // 综合Ⅱ 主力净额缺失，不画；按 |主力净额| 降序
    expect(tiles.map(t => t.querySelector('b')?.textContent)).toEqual(['电子化学品Ⅱ', '贵金属'])
    expect(tiles[0].className).toContain('kp-heat--u2')
    expect(tiles[1].className).toContain('kp-heat--u2')
    expect(screen.getByText(/另有 1 个板块主力净流入缺失/)).toBeTruthy()
    const tip = document.querySelector('.kp-heat__tip')!
    expect(tip.textContent).toBe('悬停或点按方块查看明细')
    fireEvent.click(tiles[1])
    expect(tip.textContent).toContain('贵金属')
    expect(tip.textContent).toContain('−1.20 亿')
    expect(screen.getByRole('list', { name: '颜色图例：当日涨跌幅' }).textContent).toContain('≥ +3%')
    const svg = screen.getByRole('group', { name: '行业板块资金热力图（矩形树图）' })
    expect(svg.querySelectorAll('rect').length).toBe(2)
    expect(screen.queryAllByRole('table').length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '以表格查看' }))
    expect(within(screen.getByRole('region', { name: '行业板块资金热力图（表格）' })).getByText('贵金属')).toBeTruthy()
    expect(screen.getByText(/方块面积 ∝ 当日主力净流入的绝对值/)).toBeTruthy()
    // 旧数据没有地域：只有行业 / 概念
    expect(within(screen.getByRole('group', { name: '热力图板块类型' })).queryByText('地域')).toBeNull()
  })

  it('地域板块：排行与热力图多出「地域」页签', async () => {
    stub(r4())
    renderPage()
    await screen.findByRole('region', { name: '今日概览' })
    fireEvent.click(within(screen.getByRole('group', { name: '板块类型' })).getByText('地域'))
    const names = within(screen.getByRole('region', { name: '地域板块排行' })).getAllByRole('row').slice(1).map(r => r.querySelector('.kp-name')?.textContent)
    expect(names).toEqual(['广东板块', '江苏板块'])
    expect(screen.getAllByText(/按上市公司注册地划分/).length).toBeGreaterThan(0)
    fireEvent.click(within(screen.getByRole('group', { name: '热力图板块类型' })).getByText('地域'))
    expect(within(screen.getByRole('group', { name: '地域板块资金热力图（方块网格）' })).getByRole('button', { name: /江苏板块：涨跌幅 −1.35%，主力净额 −8.89 亿/ })).toBeTruthy()
  })

  it('板块关联 ETF：列 ETF、跟踪指数与匹配依据；没有对应的显示「暂无对应 ETF」', async () => {
    stub(r4())
    renderPage()
    const b = await screen.findByRole('listitem', { name: '电子化学品Ⅱ 关联 ETF' })
    expect(b.textContent).toContain('半导体ETF甲')
    expect(b.textContent).toContain('跟踪 中证全指半导体产品与设备指数')
    expect(b.textContent).toContain('匹配依据：规则「半导体 / 芯片」')
    expect(b.textContent).toContain('ETF 12 只')
    expect(b.textContent).toContain('+1.43%')
    expect(screen.getByRole('listitem', { name: '贵金属 关联 ETF' }).textContent).toContain('暂无对应 ETF')
    fireEvent.click(within(screen.getByRole('group', { name: 'ETF 板块类型' })).getByText('概念'))
    expect(screen.getByRole('listitem', { name: '央国企改革 关联 ETF' }).textContent).toContain('关键词表未收录该板块')
    expect(screen.getByText(/场内股票型 ETF 1379 只/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|推荐买/)
  })

  it('ETF 模块缺失时显示空状态与原因', async () => {
    stub({ ...platesFixture(), sectionErrors: { etf: 'ETF 行情不是 2026-11-17 收盘后数据' } })
    renderPage()
    expect(await screen.findByText('板块关联 ETF 暂无数据')).toBeTruthy()
    expect(screen.getByText(/今日 ETF 数据未取到：ETF 行情不是/)).toBeTruthy()
  })

  it('模型：热力图取数、分档、大小分档、矩形树图面积成比例；ETF 校验', () => {
    expect(heatStep(null)).toBe('na')
    expect(heatStep(0)).toBe('n')
    expect(heatStep(3)).toBe('u3')
    expect(heatStep(0.5)).toBe('u1')
    expect(heatStep(-0.5)).toBe('d1')
    expect(heatStep(-3)).toBe('d3')
    expect(sizeBucket(10, 10)).toBe('xl')
    expect(sizeBucket(-2, 10)).toBe('l')
    expect(sizeBucket(1, 10)).toBe('m')
    const vals = [6, 6, 4, 3, 2, 2, 1]
    const rects = squarify(vals, 600, 400)
    expect(rects.length).toBe(vals.length)
    rects.forEach((r, i) => expect(r.w * r.h).toBeCloseTo((vals[i] / 24) * 240000, 3))
    for (const r of rects) { expect(r.x + r.w).toBeLessThanOrEqual(600.0001); expect(r.y + r.h).toBeLessThanOrEqual(400.0001) }
    expect(squarify([], 10, 10)).toEqual([])
    const m = asKplPlates({ ...r4(), etf: { ...r4().etf, boards: [{ code: 'x' }] } })!
    expect(m.etf).toBeNull()
    expect(asKplPlates(r4())!.region!.length).toBe(2)
    expect(asKplPlates(platesFixture())!.region).toBeNull()
    expect(heatItems(asKplPlates(platesFixture())!.industry).skipped).toBe(1)
  })
})
