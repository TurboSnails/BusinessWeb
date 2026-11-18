import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KplAbnormal from './KplAbnormal'
import { abnormalFixture } from '../../features/kpl-abnormal/fixtures'
import { asKplAbnormal } from '../../features/kpl-abnormal/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/market-mood/abnormal']}><KplAbnormal /></MemoryRouter>)
const stub = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status === 200, status, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('开盘啦 · 异动监管页', () => {
  it('总览与基准指数；缺失显示「—」', async () => {
    stub(abnormalFixture())
    renderPage()
    const top = await screen.findByRole('region', { name: '异动监管总览' })
    expect(top.textContent).toContain('2 / 3')
    expect(top.textContent).toContain('实际上榜 3 条')
    expect(screen.getByText(/今日基准指数/).textContent).toContain('创业板综合指数 —')
    expect(screen.getByText(/与开盘啦官方无关/)).toBeTruthy()
  })

  it('今日已触发：触发标签、触发窗口偏离与实际龙虎榜对照', async () => {
    stub(abnormalFixture())
    renderPage()
    const t = await screen.findByRole('region', { name: '今日已触发异常波动' })
    const row = within(t).getByText('触发甲').closest('tr')!
    expect(row.textContent).toContain('3 日涨幅偏离')
    expect(row.textContent).toContain('+44.62%2 日')
    expect(row.textContent).toContain('已公布')
    expect(within(t).getByText('10 日内 3 次同向')).toBeTruthy()
    expect(within(t).getByText('未公布')).toBeTruthy()
    expect(within(t).getByText('缺字段丙').closest('tr')!.textContent).toContain('—')
    expect(screen.getByText(/简单相加对不上/)).toBeTruthy()
  })

  it('下一交易日可能触发：涨 / 跌切换，写明是机械计算', async () => {
    stub(abnormalFixture())
    renderPage()
    const up = await screen.findByRole('region', { name: '下一交易日可能触发：涨方向' })
    const rows = within(up).getAllByRole('row').slice(1).map(r => r.querySelector('th')?.textContent)
    expect(rows).toEqual(['接近丁002187', '接近戊000628'])
    expect(within(up).getByText('再触发即严重')).toBeTruthy()
    expect(within(up).getByText('8.14 元')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '触发方向' })).getByRole('button', { name: /跌方向/ }))
    const down = screen.getByRole('region', { name: '下一交易日可能触发：跌方向' })
    expect(within(down).getByText('−2.86%')).toBeTruthy()
    expect(screen.getAllByText(/不是预测/).length).toBeGreaterThan(0)
  })

  it('龙虎榜规则对照：命中 / 未上榜、漏判、回测；筛选未上榜', async () => {
    stub(abnormalFixture())
    renderPage()
    const t = await screen.findByRole('region', { name: '按规则应上榜与实际对照' })
    expect(within(t).getAllByText('✓ 上榜').length).toBe(2)
    expect(within(t).getByText('✗ 未上榜')).toBeTruthy()
    expect(screen.getByText(/漏判癸/)).toBeTruthy()
    expect(screen.getByText(/回测 2026-10-21 至 2026-11-17 共 20 个交易日/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '上榜对照筛选' })).getByRole('button', { name: /未上榜/ }))
    expect(within(screen.getByRole('region', { name: '按规则应上榜与实际对照' })).queryByText('上榜辛')).toBeNull()
  })

  it('停复牌三个分类', async () => {
    stub(abnormalFixture())
    renderPage()
    expect(within(await screen.findByRole('region', { name: '当日停牌' })).getByText('2026-11-20')).toBeTruthy()
    const g = screen.getByRole('group', { name: '停复牌分类' })
    fireEvent.click(within(g).getByRole('button', { name: /盘中停牌/ }))
    expect(within(screen.getByRole('region', { name: '当日盘中停牌' })).getByText('13:16–13:26')).toBeTruthy()
    fireEvent.click(within(g).getByRole('button', { name: /复牌 10 日内/ }))
    const r = screen.getByRole('region', { name: '复牌 10 日内' })
    expect(within(r).getByText('第 2 日')).toBeTruthy()
    expect(within(r).getByText('−5.82%')).toBeTruthy()
  })

  it('盘口异动：类型切换、个股与时间线；无数据时说明', async () => {
    stub(abnormalFixture())
    renderPage()
    const g = await screen.findByRole('group', { name: '异动类型' })
    expect(within(screen.getByRole('region', { name: '封涨停板个股' })).getByText('雷达卯')).toBeTruthy()
    fireEvent.click(within(g).getByRole('button', { name: /大笔买入/ }))
    expect(within(screen.getByRole('region', { name: '大笔买入个股' })).getByText('217 万')).toBeTruthy()
    expect(screen.getByText(/09:35:12/)).toBeTruthy()
    cleanup()
    stub({ ...abnormalFixture(), radar: null })
    renderPage()
    expect(await screen.findByText(/只能在交易日收盘后当天采集，本次还没有数据/)).toBeTruthy()
  })

  it('规则区写明来源链接；不出现买卖建议用语', async () => {
    stub(abnormalFixture())
    renderPage()
    expect((await screen.findByText(/主板风险警示股票涨跌幅限制调整为 10%/)).closest('a')?.getAttribute('href')).toContain('sse.com.cn')
    expect(screen.getByText(/未做：重点监控名单/).textContent).not.toMatch(/问询函 \/ 监管函（/)
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|买点|卖点/)
  })

  it('监管问询：分类计数、今日表现、回复公告标注、未公开全文、来源降级提示与分类筛选', async () => {
    stub(abnormalFixture())
    renderPage()
    const counts = await screen.findByRole('region', { name: '监管问询分类计数' })
    const d20 = within(counts).getByText('近 20 个交易日').closest('tr')!
    expect(d20.textContent).toContain('2026-10-21 起')
    expect(Array.from(d20.querySelectorAll('td')).map(td => td.textContent)).toEqual(['2', '0', '1', '1', '4', '1'])
    expect(screen.getByText(/被问询（问询函 \/ 关注函，含回复公告）的公司 2 家/).textContent).toMatch(/上涨 1.*下跌 1/)
    const list = screen.getByRole('region', { name: '监管问询列表' })
    const reply = within(list).getByText('问询甲').closest('tr')!
    expect(reply.textContent).toContain('回复公告')
    expect(reply.textContent).toContain('非函件原文')
    expect(reply.textContent).toContain('+2.50%')
    expect(within(reply).getByRole('link').getAttribute('href')).toContain('cninfo.com.cn')
    const measure = within(list).getByText('监管乙').closest('tr')!
    expect(measure.textContent).toContain('未公开全文')
    expect(measure.querySelector('a')).toBeNull()
    expect(within(list).getByText('处分丙').closest('tr')!.textContent).toContain('—')
    expect(within(list).getByRole('link', { name: '公司回复' }).getAttribute('href')).toContain('z.pdf')
    expect(screen.getByRole('status').textContent).toContain('深交所网站在境外服务器上经常连接失败')
    // 日期倒序
    expect(within(list).getAllByRole('row').slice(1).map(r => r.querySelector('td')?.textContent)).toEqual(['2026-11-14', '2026-11-12', '2026-11-06', '2026-11-02'])
    fireEvent.click(within(screen.getByRole('group', { name: '监管问询分类' })).getByRole('button', { name: /纪律处分/ }))
    const only = screen.getByRole('region', { name: '监管问询列表' })
    expect(within(only).getAllByRole('row').length).toBe(2)
    expect(within(only).getByText('处分丙')).toBeTruthy()
  })

  it('监管问询：区块缺失时显示 EmptyState 与原因，其余部分照常', async () => {
    stub({ ...abnormalFixture(), regulatory: null, regulatoryNote: '本次三个来源都没有取到' })
    renderPage()
    expect(await screen.findByText('监管问询数据暂缺')).toBeTruthy()
    expect(screen.getByText('本次三个来源都没有取到')).toBeTruthy()
    expect(screen.getByRole('region', { name: '今日已触发异常波动' })).toBeTruthy()
    cleanup()
    stub({ ...abnormalFixture(), regulatory: { from: 'bad' } })
    renderPage()
    expect(await screen.findByText('监管问询数据暂缺')).toBeTruthy()
  })

  it('数据文件不存在 / HTML 回退时显示尚未生成；格式不对时提示', async () => {
    stub(null, 404)
    renderPage()
    expect(await screen.findByText('异动监管数据尚未生成')).toBeTruthy()
    cleanup()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('html') } })))
    renderPage()
    expect(await screen.findByText('异动监管数据尚未生成')).toBeTruthy()
    cleanup()
    stub({ version: 2 })
    renderPage()
    expect(await screen.findByText('数据文件格式不对')).toBeTruthy()
  })
})

describe('数据模型', () => {
  it('次要部分缺失按空处理；关键字段缺失返回 null', () => {
    const f = abnormalFixture() as Record<string, unknown>
    delete f.severeWatch
    delete f.suspend
    f.radar = { date: 'x' }
    const m = asKplAbnormal(f)!
    expect(m.severeWatch).toEqual([])
    expect(m.suspend).toBeNull()
    expect(m.radar).toBeNull()
    expect(asKplAbnormal({ ...abnormalFixture(), summary: null })).toBeNull()
    expect(asKplAbnormal({ ...abnormalFixture(), nearUp: [{ code: 1 }] })).toBeNull()
  })

  it('监管问询区块校验：坏条目丢弃，缺失字段为 null，计数结构不对时为 null', () => {
    const f = abnormalFixture()
    const reg = { ...f.regulatory, counts: { d5: { from: 'x' } }, items: [...f.regulatory.items, { code: '1', date: '2026-11-01', kind: 'other' }, { code: '000001', date: '2026-11-01', kind: 'inquiry', url: '', pct: '-' }] }
    const m = asKplAbnormal({ ...f, regulatory: reg })!
    expect(m.regulatory!.items.length).toBe(5)
    const last = m.regulatory!.items[4]
    expect(last.url).toBeNull()
    expect(last.pct).toBeNull()
    expect(last.dev3).toBeNull()
    expect(m.regulatory!.counts).toBeNull()
    const old = { ...f } as Record<string, unknown>
    delete old.regulatory
    delete old.regulatoryNote
    expect(asKplAbnormal(old)!.regulatory).toBeNull()
    expect(asKplAbnormal(old)!.regulatoryNote).toBeNull()
  })

  it('样式约束：页面里没有内联样式和硬编码颜色', () => {
    const src = readFileSync(resolve(__dirname, 'KplAbnormal.tsx'), 'utf8')
    expect(src).not.toMatch(/style=\{\{/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/)
  })
})
