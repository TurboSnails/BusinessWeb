import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThsMarket from './ThsMarket'
import { marketFixture, overseasFixture } from '../../features/ths-market/fixtures'
import { asOverseas, asThsMarket } from '../../features/ths-market/model'

const renderPage = () => render(<MemoryRouter initialEntries={['/ths-mood/market']}><ThsMarket /></MemoryRouter>)
const stub = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('同花顺 · 市场页', () => {
  it('估值分区、资金供需、利率、风格与口径', async () => {
    stub(marketFixture()); renderPage()
    const [val] = await screen.findAllByRole('table')
    expect(within(val).getAllByRole('row')).toHaveLength(4)
    expect(screen.getByText(/数据日期：2026-11-17/)).toBeTruthy()
    expect(screen.getByText('危险').className).toContain('is-hot')
    expect(screen.getByText('机会（按 5 年）').className).toContain('is-cold')
    expect(screen.getByText(/≥ 80% 记为「危险区」/)).toBeTruthy()
    expect(screen.getByText(/与同花顺官方无关/)).toBeTruthy()
    expect(screen.getByRole('tab', { name: '市场' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('img', { name: '沪深300 PE(TTM) 近 10 年周线' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '估值曲线指数' })).getByText('创业板'))
    expect(screen.getByRole('img', { name: '创业板（整体） PE(TTM) 近 10 年周线' })).toBeTruthy()
    expect(screen.getByText(/合计 399.00 亿/)).toBeTruthy()
    expect(screen.getByText('−20.00 亿').className).toContain('mm-down')
    expect(screen.getByText('+20.00 亿').className).toContain('mm-up')
    expect(screen.getByRole('img', { name: '10 年期国债收益率' })).toBeTruthy()
    expect(screen.getByText('1.6055')).toBeTruthy()
    expect(screen.getByText('+6.37%').className).toContain('mm-up')
    expect(screen.getByText('−9.70%').className).toContain('mm-down')
    expect(screen.getByText(/新增投资者开户数/)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: '宏观温度' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|胜率/)
  })
  it('外盘联动：美股指数、异动表、关联板块、同向计数与本站整理说明', async () => {
    stub(marketFixture()); renderPage()
    expect(await screen.findByText('外盘异动与 A 股关联板块当日表现')).toBeTruthy()
    expect(screen.getByText('美股隔夜（2026-11-16 美东收盘）')).toBeTruthy()
    expect(screen.getByText('−1.64%').className).toContain('mm-down')
    expect(screen.getByText(/本期外盘异动 2 只；关联板块有效观测 3 个，其中当日同向 2 个/)).toBeTruthy()
    expect(screen.getByText(/2026-11-17 15:12（北京）快照/)).toBeTruthy()
    const anomaly = screen.getAllByRole('table').find(t => within(t).queryByText('关联 A 股板块（当日涨跌 / 主力净流入）'))!
    const rows = within(anomaly).getAllByRole('row')
    expect(rows).toHaveLength(3) // 表头 + 台积电 + 小鹏
    expect(within(rows[1]).getByText('台积电')).toBeTruthy() // 按 σ 倍数排序
    expect(within(rows[1]).getByText('1 / 2')).toBeTruthy()
    expect(within(rows[1]).getByText('主力 −12.50 亿').className).toContain('mm-down')
    expect(within(rows[1]).getByText('主力 —')).toBeTruthy() // 缺失不写 0
    expect(screen.getAllByText(/本站整理/).length).toBeGreaterThan(0)
    expect(screen.getByText(/2 倍该标的此前 60 个交易日/)).toBeTruthy()
    const all = screen.getAllByRole('table').find(t => within(t).queryByText('关联理由'))!
    expect(within(all).getByText('国际石油巨头')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '外盘市场' })).getByText('港股'))
    const hk = screen.getAllByRole('table').find(t => within(t).queryByText('关联理由'))!
    expect(within(hk).getByText('小鹏集团-W')).toBeTruthy()
    expect(within(hk).queryByText('台积电')).toBeNull()
    expect(screen.getByText(/累计观测（自 2026-11-17 起 1 个交易日）/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/建议买入|建议卖出|胜率/)
  })
  it('外盘联动缺失或格式异常时只本节显示 EmptyState，其余模块照常', async () => {
    const x = marketFixture(); x.overseas = null; x.overseasError = '美股指数未更新到 2026-11-16（0/5）'
    stub(x); renderPage()
    expect(await screen.findByText('暂无外盘联动数据')).toBeTruthy()
    expect(screen.getByText(/本次未更新：美股指数未更新/)).toBeTruthy()
    expect(screen.getByText('危险')).toBeTruthy()
    cleanup()
    const y = marketFixture() as any; y.overseas.items[0].date = '2026-11-17'; delete y.overseasError
    stub(y); renderPage()
    expect(await screen.findByText('暂无外盘联动数据')).toBeTruthy()
    expect(screen.getByText(/格式异常/)).toBeTruthy()
    cleanup()
    const z = marketFixture() as any; delete z.overseas; delete z.overseasError // 旧文件没有这两个字段
    stub(z); renderPage()
    expect(await screen.findByText('暂无外盘联动数据')).toBeTruthy()
  })
  it('港股未收盘、板块快照不可用时给出说明', async () => {
    const x = marketFixture()
    x.overseas = { ...x.overseas!, hkDate: null, hkNote: '港股 16:10 收市，北京 16:15 前不取当天港股收盘', boardsTime: null, boardsNote: 'A 股板块快照只在交易日北京 15:10 后采集当天数据', items: x.overseas!.items.filter(i => i.market === 'US'), summary: { anomalies: 1, obs: 0, same: 0 } }
    stub(x); renderPage()
    expect(await screen.findByText(/港股列暂为空/)).toBeTruthy()
    expect(screen.getByText(/A 股板块列暂为空/)).toBeTruthy()
  })
  it.each([null, '<!doctype html><html></html>', { version: 1 }])('空文件或 200 HTML 回退显示 EmptyState (%j)', async body => {
    stub(body); renderPage()
    expect(await screen.findByText('暂无市场数据')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('404、JSON 解析异常和网络错误显示 EmptyState', async () => {
    for (const fetcher of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML') } }), async () => { throw new Error('offline') }]) {
      vi.stubGlobal('fetch', vi.fn(fetcher)); renderPage()
      expect(await screen.findByText('暂无市场数据')).toBeTruthy()
      cleanup()
    }
  })
  it('卸载时中止请求', () => {
    const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise(() => {}))
    vi.stubGlobal('fetch', fetcher)
    const page = renderPage(); page.unmount()
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true)
  })
})

describe('市场页运行时模型', () => {
  it('完整数据通过；日期、分位范围、序列顺序、来源校验', () => {
    expect(asThsMarket(marketFixture())).not.toBeNull()
    for (const mutate of [
      (x: any) => { x.asOf = '2026-02-30' },
      (x: any) => { x.valuation[0].peP10 = 120 },
      (x: any) => { x.valuation[0].pe = '13' },
      (x: any) => { x.valuation[0].zone = '低估' },
      (x: any) => { x.valuation[1].code = x.valuation[0].code },
      (x: any) => { x.valuation[0].history.reverse() },
      (x: any) => { x.valuation[0].history.push(['2026-11-18', 1]) },
      (x: any) => { x.supply.lift.weeks[0].start = '2026-11-17' },
      (x: any) => { x.supply.holder[0].net = Infinity },
      (x: any) => { x.supply.funds[0].month = '2026-13' },
      (x: any) => { x.rates.treasury = [] },
      (x: any) => { x.style = [] },
      (x: any) => { x.sources[0].url = 'javascript:alert(1)' },
    ]) { const x = marketFixture(); mutate(x); expect(asThsMarket(x)).toBeNull() }
  })
  it('外盘联动校验：日期自洽、个股日期对上市场、缺值规则，不合格只置空本节', () => {
    expect(asOverseas(overseasFixture(), '2026-11-17')).not.toBeNull()
    // 中证估值晚发布时外盘联动先行更新：本节可以比整页新，但不能更旧
    expect(asOverseas(overseasFixture(), '2026-11-16')?.asOf).toBe('2026-11-17')
    for (const mutate of [
      (o: any) => { o.asOf = '2026-11-16' },
      (o: any) => { o.usSession = '2026-11-17' }, // 美股日必须早于数据日
      (o: any) => { o.hkDate = '2026-11-16' },
      (o: any) => { o.items[0].date = '2026-11-17' }, // 美股个股日期必须是 usSession
      (o: any) => { o.items[3].date = '2026-11-16' }, // 港股必须是 hkDate
      (o: any) => { o.items[2].pct = 1 }, // 没有日期却有涨跌幅
      (o: any) => { o.items[0].pct = '-3.68' },
      (o: any) => { o.items[0].boards[0].code = 'X1' },
      (o: any) => { o.items[1].symbol = 'TSM' },
      (o: any) => { o.summary.same = 9 },
      (o: any) => { o.boardsTime = '15点' },
      (o: any) => { o.history.rows[0].same = 5 },
    ]) { const o = overseasFixture(); mutate(o); expect(asOverseas(o, '2026-11-17')).toBeNull() }
    const x = marketFixture() as any; x.overseas.items[0].pct = 'bad'
    const r = asThsMarket(x)
    expect(r).not.toBeNull(); expect(r!.overseas).toBeNull(); expect(r!.overseasError).toMatch(/格式异常/)
  })
})
