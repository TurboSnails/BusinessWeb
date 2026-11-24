// @ts-ignore 测试在 Node 中运行
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
// @ts-ignore 纯 JS 模块
import { computeEquityLongShort, gdpTtm, parseCboeDaily, parseCboeRatioCsv, parseFinraMargin, parseOfrTimeseries, ratioToGdp } from '../../../server/macro.mjs'
import Monitor from '../../pages/Monitor'
import { INDICATORS, percentileOf, toneOf, type MacroSnapshot } from './indicators'
import { CN_INDICATORS, type CnKey } from './china'
import type { HkKey } from './hk'
import { freshnessOf } from './MacroViews'
import Sparkline from './Sparkline'

const us = JSON.parse(readFileSync(resolve('public/data/macro-us.json'), 'utf8')) as MacroSnapshot
const cn = JSON.parse(readFileSync(resolve('public/data/macro-cn.json'), 'utf8')) as MacroSnapshot<CnKey>
const hk = JSON.parse(readFileSync(resolve('public/data/macro-hk.json'), 'utf8')) as MacroSnapshot<HkKey>
const byUrl = (url: string) => (String(url).includes('macro-hk') ? hk : String(url).includes('macro-cn') ? cn : us)
beforeAll(() => {
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => byUrl(url) }) as Response))
})
afterEach(() => cleanup())
const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><Monitor /></MemoryRouter>)

describe('杠杆数据整理', () => {
  it('FINRA 早年缺列的行按列号读取，不丢数据', () => {
    const xml = '<row r="2"><c r="A2" t="inlineStr"><is><t>2026-08</t></is></c><c r="B2"><v>1000</v></c><c r="C2"><v>200</v></c><c r="D2"><v>100</v></c></row>'
      + '<row r="3"><c r="A3" t="inlineStr"><is><t>1997-01</t></is></c><c r="B3"><v>500</v></c><c r="C3"><v>300</v></c></row>'
      + '<row r="4"><c r="A4" t="inlineStr"><is><t>Year-Month</t></is></c></row>'
    expect(parseFinraMargin(xml)).toEqual([{ date: '1997-01-01', debit: 500, cash: 300, margin: 0 }, { date: '2026-08-01', debit: 1000, cash: 200, margin: 100 }])
    const shared = '<sst><si><t>Year-Month</t></si><si><t>2026-10</t></si></sst>'
    const sharedXml = '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" s="2" t="s"><v>1</v></c><c r="B2" s="3"><v>1448360</v></c><c r="C2"><v>210290</v></c><c r="D2"><v>212890</v></c></row>'
    expect(parseFinraMargin(sharedXml, shared)).toEqual([{ date: '2026-10-01', debit: 1448360, cash: 210290, margin: 212890 }])
  })

  it('GDP 滚动一年 = 本期累计 + 上年全年 − 上年同期累计', () => {
    const row = (d: string, v: number) => ({ REPORT_DATE: `${d} 00:00:00`, DOMESTICL_PRODUCT_BASE: v })
    const ttm = gdpTtm([row('2025-06-01', 600), row('2025-12-01', 1300), row('2026-06-01', 700)])
    expect(ttm).toEqual([['2025-12-01', 1300], ['2026-06-01', 1400]])
  })

  it('占 GDP 比例：每月取不晚于该月的最新一期 GDP', () => {
    expect(ratioToGdp([['2026-01-01', 10], ['2026-05-01', 30]], [['2025-10-01', 1000], ['2026-04-01', 1500]])).toEqual([['2026-01-01', 1], ['2026-05-01', 2]])
  })

  it('Cboe 历史 CSV 校验日期、总量与 Put÷Call 比率', () => {
    const csv = 'DATE,CALLS,PUTS,TOTAL,P/C Ratio\n1/2/2024,100,65,165,0.65\n1/3/2024,100,65,160,0.65\ninvalid'
    expect(parseCboeRatioCsv(csv)).toEqual([['2024-01-02', 0.65]])
    expect(parseCboeRatioCsv('<html>denied</html>')).toEqual([])
  })

  it('Cboe 日页面交叉核对成交量；非交易日不伪造观测', () => {
    const html = String.raw`{\"ratios\":[{\"name\":\"TOTAL PUT/CALL RATIO\",\"value\":\"0.94\"}],\"SUM OF ALL PRODUCTS\":[{\"name\":\"VOLUME\",\"call\":3913822,\"put\":3684247}],\"selectedDate\":\"2024-01-02\"}`
    expect(parseCboeDaily(html)).toEqual({ date: '2024-01-02', value: 0.94 })
    expect(parseCboeDaily(String.raw`{\"selectedDate\":\"2024-01-06\"}`)).toBeNull()
    expect(() => parseCboeDaily(html.replace('0.94', '1.94'))).toThrow(/不一致/)
  })

  it('OFR 多空敞口按同日对齐计算 L/S，丢弃非法与非正值', () => {
    expect(parseOfrTimeseries([['2026-06-30', 100], ['bad', 1], ['2026-03-31', 0], ['2026-03-31', -1], ['2026-09-30', 50]])).toEqual([['2026-06-30', 100], ['2026-09-30', 50]])
    expect(computeEquityLongShort(
      [['2026-03-31', 300], ['2026-06-30', 6194], ['2026-09-30', 100]],
      [['2026-03-31', 200], ['2026-06-30', 4121]],
    )).toEqual([['2026-03-31', 1.5], ['2026-06-30', 1.503]])
  })
})

describe('拥挤度打灯：按历史分位', () => {
  const long: [string, number][] = Array.from({ length: 100 }, (_, i) => [`2000-${i}`, i + 1])
  const lev = INDICATORS.find(i => i.key === 'marginGdp')!
  const cash = INDICATORS.find(i => i.key === 'cashDebt')!
  it('杠杆越高越拥挤，现金越低越拥挤；历史不足时不打分', () => {
    expect(percentileOf(long, 50)).toBe(50)
    expect([toneOf(lev, 50, long), toneOf(lev, 85, long), toneOf(lev, 97, long)]).toEqual(['green', 'yellow', 'red'])
    expect([toneOf(cash, 50, long), toneOf(cash, 15, long), toneOf(cash, 3, long)]).toEqual(['green', 'yellow', 'red'])
    expect(toneOf(lev, 97, long.slice(0, 10))).toBe('gray')
  })
})

describe('新旧数据标记', () => {
  const d = us.series.vix
  it('没刷新过是快照；刷新后按 live 区分实时与沿用旧值', () => {
    expect(freshnessOf(us, d).kind).toBe('snap')
    const refreshed = { ...us, fetchedAt: '2026-10-07T08:30:00.000Z' }
    expect(freshnessOf(refreshed, { ...d, live: true })).toMatchObject({ kind: 'live', text: '实时 08:30 UTC' })
    expect(freshnessOf(refreshed, { ...d, live: false }).kind).toBe('old')
    expect(freshnessOf(refreshed, d).kind).toBe('old')
  })

  it('页面：刷新后拉到的项标「实时」，没拉到的标「沿用旧值」，顶部给出计数', async () => {
    const fresh = { ...us, fetchedAt: '2026-10-07T08:30:00.000Z', series: { vix: { ...us.series.vix, live: true }, gdp: { ...us.series.gdp, live: false } } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes('/api/macro') ? { us: fresh, cn: { ...cn, series: {} }, warnings: ['gdp：超时'] } : byUrl(url)) }) as Response))
    renderAt('/monitor?tab=us')
    expect((await screen.findAllByText(/^快照 /)).length).toBe(INDICATORS.length)
    fireEvent.click(screen.getByRole('button', { name: '刷新最新数据' }))
    expect((await screen.findAllByText(/^实时 08:30/)).length).toBe(1)
    expect(screen.getAllByText(/^沿用旧值/).length).toBe(INDICATORS.length - 1)
    expect(screen.getByText(/1 项实时，\d+ 项沿用旧值/)).toBeTruthy()
  })
})

describe('杠杆与资金页面', () => {
  it('美国、中国都有杠杆卡：带历史分位和可切换的长历史图', async () => {
    renderAt('/monitor?tab=us')
    const usPct = await screen.findAllByText(/处于历史 \d+% 分位/)
    expect(usPct.length).toBeGreaterThan(0)
    usPct.forEach(el => expect(el.textContent).toMatch(/处于历史 \d+% 分位/))
    const putCall = screen.getByText('期权 Put/Call（Put ÷ Call）').closest('article')!
    expect(within(putCall).getByText('背景指标，不打分')).toBeTruthy()
    expect(within(putCall).getByText(/2019 年后历史为月末交易日抽样/)).toBeTruthy()
    const hfLs = screen.getByText('对冲基金股票多空比（OFR）').closest('article')!
    expect(within(hfLs).getByText('背景指标，不打分')).toBeTruthy()
    expect(within(hfLs).getByText(/不是高盛\/摩根 Prime 客户账簿/)).toBeTruthy()
    expect(screen.getByRole('table', { name: '保证金债务 ÷ GDP危机参考读数' }).textContent).toContain('3.00%')
    expect(within(screen.getByRole('table', { name: '客户现金 ÷ 保证金债务危机参考读数' })).getByRole('row', { name: /金融危机.*2009-03/ }).textContent).toContain('143.1%')
    const marginCard = screen.getByRole('heading', { name: '保证金债务 ÷ GDP', level: 3 }).closest('article')!
    const tab = within(marginCard).getByRole('button', { name: /全部/ })
    fireEvent.click(tab)
    expect(tab.getAttribute('aria-pressed')).toBe('true')
    expect(within(marginCard).getAllByRole('img', { name: /\d{4}年至今走势/ }).length).toBe(1)
    expect(screen.getAllByRole('group', { name: /时间范围/ }).length).toBeGreaterThan(0)
    cleanup()
    renderAt('/monitor?tab=cn')
    const cnPct = await screen.findAllByText(/处于历史 \d+% 分位/)
    expect(cnPct.length).toBe(CN_INDICATORS.filter(i => i.crowded).length)
    expect(within(screen.getByRole('table', { name: '融资余额 ÷ GDP危机参考读数' })).getByRole('row', { name: /2015 年去杠杆.*2015-06/ }).textContent).toContain('3.01%')
    expect(within(screen.getByRole('table', { name: '融资余额 ÷ 流通市值危机参考读数' })).getByRole('row', { name: /2015 年去杠杆.*2015-06/ }).textContent).toContain('4.33%')
  })
})

describe('总览摘要：点开弹框看历史曲线', () => {
  it('杠杆行弹出长历史图，普通指标弹出近两年走势，Esc 与关闭按钮都能关', async () => {
    renderAt('/monitor')
    fireEvent.click(await screen.findByRole('button', { name: /保证金债务 ÷ GDP，点击查看历史曲线/ }))
    const dialog = screen.getByRole('dialog', { name: /保证金债务 ÷ GDP历史曲线/ })
    expect(dialog.textContent).toMatch(/处于历史 \d+% 分位/)
    expect(within(dialog).getAllByRole('img', { name: /走势/ }).length).toBe(1)
    expect(within(dialog).getByRole('table', { name: '保证金债务 ÷ GDP危机参考读数' })).toBeTruthy()
    expect(within(dialog).getByRole('row', { name: /黑色星期一.*1987-09/ }).textContent).toContain('0.90%')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /VIX 波动率，点击查看/ }))
    const vixDialog = screen.getByRole('dialog')
    expect(within(vixDialog).getByRole('group', { name: /VIX 波动率时间范围/ })).toBeTruthy()
    expect(within(vixDialog).getByRole('button', { name: '10 年' })).toBeTruthy()
    expect(within(vixDialog).getAllByRole('img', { name: /VIX 波动率.*走势/ }).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // 无 long 的夹具仍走 Sparkline（近两年走势）
    cleanup()
    const shortHist: [string, number][] = Array.from({ length: 24 }, (_, i) => {
      const y = 2024 + Math.floor(i / 12), m = String((i % 12) + 1).padStart(2, '0')
      return [`${y}-${m}-01`, 10 + i]
    })
    render(<Sparkline points={shortHist} label="VIX 波动率" />)
    expect(screen.getByRole('img', { name: /VIX 波动率近两年走势/ })).toBeTruthy()
  })

  it('中国杠杆行同样能弹出', async () => {
    renderAt('/monitor')
    fireEvent.click(await screen.findByRole('button', { name: /融资余额 ÷ GDP，点击查看历史曲线/ }))
    expect(within(screen.getByRole('dialog')).getAllByRole('img', { name: /走势/ }).length).toBe(1)
  })
})

describe('顶部参照价格', () => {
  it('总览最上方有美元、黄金、白银、原油，点开弹框，且不计入阶段打分', async () => {
    renderAt('/monitor')
    for (const name of ['美元指数', '黄金', '白银', 'WTI 原油']) expect(await screen.findByRole('button', { name: new RegExp(`^${name}，点击查看历史曲线`) })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^黄金，点击查看/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(/处于历史 \d+% 分位/)
    expect(within(dialog).getAllByRole('img', { name: /走势/ }).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(/风险预算阶段/)).toBeTruthy()
  })
})

describe('港股与周期页面', () => {
  it('港股宏观页按模块列出各项并带新旧标记', async () => {
    renderAt('/monitor?tab=hk')
    expect(await screen.findByText('恒生指数距十年高点回撤')).toBeTruthy()
    expect(screen.getByText('港元兑美元汇率')).toBeTruthy()
    expect(screen.getAllByText(/^快照 /).length).toBe(5)
  })

  it('周期页有四张卡，康波判断带范围、理由和反证；总览有摘要卡', async () => {
    renderAt('/monitor?tab=cycles')
    expect(await screen.findByText('康波周期（约 50–60 年）')).toBeTruthy()
    expect(screen.getAllByText(/判断理由/).length).toBe(3)
    expect(screen.getAllByText(/反证与局限/).length).toBe(3)
    expect(screen.getByText(/库存周期（基钦周期/)).toBeTruthy()
    cleanup()
    renderAt('/monitor')
    expect(await screen.findByText('周期位置（大致范围）')).toBeTruthy()
  })
})
