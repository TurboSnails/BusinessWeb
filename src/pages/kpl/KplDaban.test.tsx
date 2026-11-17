import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplDaban from './KplDaban'
import { dabanFixture } from '../../features/kpl-daban/fixtures'
import { asHistoryExport, asKplDaban, searchHistory } from '../../features/kpl-daban/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/daban']}><KplDaban /></MemoryRouter>)
const stub = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status === 200, status, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const segBtn = (name: RegExp) => within(screen.getByRole('group', { name: '打板分类' })).getByRole('button', { name })

describe('开盘啦 · 打板页', () => {
  it('总览：涨停 / 炸板 / 跌停 / 自然涨停 / 曾跌停 / 竞价平均', async () => {
    stub(dabanFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '打板总览' })
    expect(top.textContent).toContain('一字 1')
    expect(top.textContent).toContain('封板率 75.0%')
    expect(top.textContent).toContain('+1.25%')
    expect(top.textContent).toContain('高开 1 · 低开 1')
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
  })

  it('涨停表默认显示；缺失字段显示「—」不崩溃；板型与连板标签', async () => {
    stub(dabanFixture())
    renderPage()
    const table = await screen.findByRole('region', { name: '涨停个股' })
    expect(within(table).getByText('高标甲')).toBeTruthy()
    expect(within(table).getByText('3连板')).toBeTruthy()
    expect(within(table).getByText('一字')).toBeTruthy()
    expect(within(table).getByText('2.71 亿')).toBeTruthy()
    const row = within(table).getByText('缺字段丙').closest('tr')!
    expect(row.textContent).toContain('—')
  })

  it('切换各分类：竞价、炸板、跌停、新股、自然涨停、曾跌停', async () => {
    stub(dabanFixture())
    renderPage()
    await screen.findByRole('region', { name: '涨停个股' })
    fireEvent.click(segBtn(/^竞价/))
    const auction = screen.getByRole('region', { name: '竞价：昨日涨停股今日开盘' })
    const rows = within(auction).getAllByRole('row').slice(1).map(r => r.querySelector('th')?.textContent)
    expect(rows).toEqual(['高标甲000001', '低开庚000041', '停牌辛000042']) // 竞价涨幅降序，缺失排最后
    expect(within(auction).getByText('再封')).toBeTruthy()
    expect(screen.getByText(/拿不到盘中竞价成交量/)).toBeTruthy()
    fireEvent.click(segBtn(/^炸板/))
    expect(within(screen.getByRole('region', { name: '炸板个股' })).getByText('13')).toBeTruthy()
    fireEvent.click(segBtn(/^跌停/))
    expect(within(screen.getByRole('region', { name: '跌停个股' })).getByText('3 天')).toBeTruthy()
    fireEvent.click(segBtn(/^新股/))
    expect(within(screen.getByRole('region', { name: '新股' })).getByText('不设限')).toBeTruthy()
    fireEvent.click(segBtn(/^自然涨停/))
    const nat = screen.getByRole('region', { name: '自然涨停个股' })
    expect(within(nat).queryByText('高标甲')).toBeNull()
    expect(within(nat).getByText('换手乙')).toBeTruthy()
    fireEvent.click(segBtn(/^曾跌停/))
    const t = screen.getByRole('region', { name: '曾跌停个股' })
    expect(within(t).getByText('地天板')).toBeTruthy()
    expect(within(t).getByText('−9.98%')).toBeTruthy()
    expect(screen.getByText(/「即将涨停」需要盘中实时行情/)).toBeTruthy()
  })

  it('点表头排序，再点切换升降序', async () => {
    stub(dabanFixture())
    renderPage()
    const table = await screen.findByRole('region', { name: '涨停个股' })
    const btn = within(table).getByRole('button', { name: /封板资金/ })
    fireEvent.click(btn)
    const first = () => within(table).getAllByRole('row')[1].querySelector('th')?.textContent
    expect(first()).toBe('高标甲000001')
    fireEvent.click(btn)
    expect(first()).toBe('换手乙000002') // 升序；缺失仍排最后
    expect(btn.closest('th')?.getAttribute('aria-sort')).toBe('ascending')
  })

  it('溢价基因：写明样本窗口与补算说明，比率与次数', async () => {
    stub(dabanFixture())
    renderPage()
    expect(await screen.findByText(/样本窗口 2026-09-14 至 2026-11-17，共 40 个交易日有记录/)).toBeTruthy()
    expect(screen.getByText(/只计入涨停次数与连板率/)).toBeTruthy()
    const gene = screen.getByRole('region', { name: '溢价基因' })
    expect(within(gene).getByText('2 / 4')).toBeTruthy()
    expect(within(gene).getByText('75.0%')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|买点|卖点/)
  })

  it('数据文件不存在时显示尚未生成；格式不对时提示', async () => {
    stub(null, 404)
    renderPage()
    expect(await screen.findByText('打板数据尚未生成')).toBeTruthy()
    cleanup()
    stub({ version: 2 })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })
})

describe('数据模型', () => {
  it('次要列表缺失按空列表处理；关键字段缺失返回 null', () => {
    const f = dabanFixture() as Record<string, unknown>
    delete f.touched
    delete f.history
    const m = asKplDaban(f)!
    expect(m.touched).toEqual([])
    expect(m.history).toEqual([])
    expect(asKplDaban({ ...dabanFixture(), summary: null })).toBeNull()
    expect(asKplDaban({ ...dabanFixture(), zt: [{ code: 1 }] })).toBeNull()
  })

  it('样式约束：页面与组件里没有内联样式和硬编码颜色', () => {
    for (const f of ['KplDaban.tsx', '../../features/kpl-daban/StockTable.tsx', '../../features/kpl-daban/HistorySearch.tsx']) {
      const src = readFileSync(resolve(__dirname, f), 'utf8')
      expect(src).not.toMatch(/style=\{\{/)
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/)
    }
  })
})

const historyExport = () => ({
  version: 1, from: '2026-11-13', to: '2026-11-17', fullFrom: '2026-11-17',
  stocks: { '000001': ['高标甲', '工程机械'], '000002': ['换手乙', '算力'], '600003': ['银行丙', null] },
  days: [
    ['2026-11-13', 1, [['000001', 1], ['600003', 1]]],
    ['2026-11-16', 1, [['000001', 2]]],
    ['2026-11-17', 0, [['000001', 3], ['000002', 1]]],
  ],
})
const stubByUrl = (map: Record<string, unknown>) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const key = Object.keys(map).find(k => String(url).includes(k))
  return key ? { ok: true, status: 200, json: async () => map[key] } : { ok: false, status: 404, json: async () => null }
}))

describe('题材要点与涨停历史检索', () => {
  it('涨停表可展开 F10 题材要点，写明是公司资料、不是当日涨停原因', async () => {
    const f = dabanFixture()
    ;(f.zt[1] as Record<string, unknown>).topics = { at: '2026-11-18', points: [{ c: '主营业务', k: '算力租赁', t: '公司提供算力租赁服务。' }] }
    stubByUrl({ 'kpl-daban.json': f })
    renderPage()
    const table = await screen.findByRole('region', { name: '涨停个股' })
    expect(within(table).queryByRole('button', { name: '高标甲 题材' })).toBeNull() // 没有要点的不显示按钮
    const btn = within(table).getByRole('button', { name: '换手乙 题材' })
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(within(table).getByText('算力租赁')).toBeTruthy()
    expect(within(table).getByText(/非当日涨停原因；2026-11-18 抓取/)).toBeTruthy()
    fireEvent.click(btn)
    expect(within(table).queryByText('算力租赁')).toBeNull()
  })

  it('按名称 / 代码 / 行业 / 日期检索历次涨停与连板数', async () => {
    stubByUrl({ 'kpl-daban.json': dabanFixture(), 'kpl-daban-history.json': historyExport() })
    renderPage()
    const box = await screen.findByRole('searchbox', { name: /搜索涨停历史/ })
    expect(screen.getByText(/输入名称、代码或行业/)).toBeTruthy()
    fireEvent.change(box, { target: { value: '工程' } })
    const hit = screen.getByRole('listitem', { name: '高标甲 涨停 3 次' })
    expect(hit.textContent).toContain('11-17 3连板')
    expect(hit.textContent).toContain('11-13 首板')
    fireEvent.change(box, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('按涨停日期筛选'), { target: { value: '2026-11-17' } })
    expect(screen.getByText(/找到 2 只股票/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('按涨停日期筛选'), { target: { value: '2026-11-15' } })
    expect(screen.getByText(/2026-11-15 没有记录/)).toBeTruthy()
  })

  it('涨停历史文件缺失时提示尚未生成', async () => {
    stubByUrl({ 'kpl-daban.json': dabanFixture() })
    renderPage()
    expect(await screen.findByText('涨停历史尚未生成。')).toBeTruthy()
  })

  it('检索函数：行业缺失不报错，排序按涨停次数', () => {
    const h = asHistoryExport(historyExport())!
    expect(searchHistory(h, '')).toEqual([])
    expect(searchHistory(h, '6000').map(s => s.code)).toEqual(['600003'])
    expect(searchHistory(h, '', '2026-11-17').map(s => s.code)).toEqual(['000001', '000002'])
    expect(searchHistory(h, '证券')).toEqual([])
    expect(searchHistory(h, '算力').map(s => s.code)).toEqual(['000002'])
    expect(asHistoryExport({ version: 2 })).toBeNull()
    expect(asKplDaban(dabanFixture())!.zt[0].topics).toBeNull()
  })
})
