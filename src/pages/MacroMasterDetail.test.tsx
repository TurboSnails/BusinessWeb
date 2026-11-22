import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MacroMasterDetail from './MacroMasterDetail'
import { masterBySlug } from '../features/macro-masters/masters'
import { useReadings, type ReadingsState } from '../features/macro-masters/readings'
import type { Reading } from '../features/macro-masters/types'

vi.mock('../features/macro-masters/readings', () => ({ useReadings: vi.fn() }))

const mockedUseReadings = vi.mocked(useReadings)
const tenYear: Reading = {
  key: 'tenYear', label: '10 年期美债收益率', value: 5.04, unit: '%', date: '2026-11-19',
  percentile: 82, direction: 'up', source: 'FRED DGS10',
}
const spxBelow200: Reading = {
  key: 'spxVs200dma', label: '标普 500 相对 200 日均线', value: -5.96, unit: '%', date: '2026-11-20', source: '本站行情',
}
const narrowCredit: Reading = {
  key: 'hySpread', label: '高收益债利差', value: 300, unit: 'bp', date: '2026-11-20', source: 'FRED',
}
const highVix: Reading = {
  key: 'vix', label: 'VIX', value: 35, unit: '', date: '2026-11-20', source: 'Cboe',
}

function state(value: ReadingsState): void {
  mockedUseReadings.mockReturnValue(value)
}

function renderAt(slug: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/invest/macro-masters/${slug}`]}>
      <Routes><Route path="/invest/macro-masters/:slug" element={<MacroMasterDetail />} /></Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  mockedUseReadings.mockClear()
})

describe('MacroMasterDetail', () => {
  it('渲染已知大师、指标读数、完整研究和六项固定日期对照', () => {
    state({ state: 'ok', readings: { tenYear }, asOf: '2026-11-21' })
    renderAt('druckenmiller')
    expect(screen.getByRole('heading', { level: 1, name: '斯坦利·德鲁肯米勒' })).toBeTruthy()
    expect(screen.getByText('Stanley Druckenmiller')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '核心思路' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '他看的指标 · 本站当前读数' })).toBeTruthy()
    expect(screen.getAllByText('10 年期美债收益率').length).toBeGreaterThan(0)
    expect(screen.getAllByText('5.04').length).toBeGreaterThan(0)
    expect(screen.getByText('数据快照：2026-11-21')).toBeTruthy()

    expect(screen.getByRole('heading', { name: '他 2026 年 1 月与 2026 年 11 月的说法对照' })).toBeTruthy()
    expect(screen.getAllByText(/疑似转译，日期标注前后不一致/).length).toBeGreaterThan(0)
    const comparison = screen.getByRole('region', { name: '德鲁肯米勒 2026 年 1 月与 2026 年 11 月说法对照' })
    expect(within(comparison).getAllByRole('row')).toHaveLength(7)
    expect(within(comparison).getByText('政策利率对名义增速')).toBeTruthy()
    expect(within(comparison).getByText('AI 资本开支')).toBeTruthy()
    expect(within(comparison).getAllByText('本站当前读数（不是他的判断）')).toHaveLength(6)

    expect(screen.getByRole('heading', { name: '完整研究文档' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /经典周期判断案例/ })).toBeTruthy()
    const maintenance = screen.getByText('与本站数据的对应（维护参考）').closest('details')
    expect(maintenance).not.toBeNull()
    expect(maintenance?.hasAttribute('open')).toBe(false)
    expect(screen.queryByText(/七、可映射到本站数据的指标清单/)).toBeNull()
    const sourceLink = screen.getByRole('link', { name: 'https://gist.github.com/timhwang21/e6a2b24e064182dd9099ad00e4f4f9a6' })
    expect(sourceLink.getAttribute('target')).toBe('_blank')
    expect(sourceLink.getAttribute('rel')).toContain('noopener')
    expect(screen.getByText(/整理自公开访谈、演讲与书信/)).toBeTruthy()
  })

  it('未知 slug 不挂载读数逻辑，并显示标准未找到提示', () => {
    renderAt('not-a-master')
    expect(mockedUseReadings).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: '这一页不存在' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回宏观大师总览' }).getAttribute('href')).toBe('/invest/macro-masters')
    expect(screen.queryByRole('heading', { name: '核心思路' })).toBeNull()
  })

  it('只有近似读数时直接显示近似组，不额外渲染同口径空组', () => {
    const advDecLine: Reading = {
      key: 'advDecLine', label: '标普 500 累计涨跌线', value: 123, unit: '', date: '2026-11-20', source: '本站宽度',
    }
    state({ state: 'ok', readings: { advDecLine }, asOf: '2026-11-20' })
    renderAt('zweig')
    const row = screen.getByRole('rowheader', { name: /兹威格宽度推力/ }).closest('tr')!
    expect(within(row).queryByText('同口径读数')).toBeNull()
    expect(within(row).queryByText('本站暂无')).toBeNull()
    expect(within(row).getByText('本站近似（口径不同）')).toBeTruthy()
    expect(within(row).getByText('标普 500 累计涨跌线')).toBeTruthy()
    expect(within(row).getByText(/既不能直接计算该 EMA/)).toBeTruthy()
    expect(within(row).getByText('未证实')).toBeTruthy()
  })

  it('部分来源失败时在指标表上方提示，仍显示其他读数', () => {
    state({ state: 'ok', readings: { tenYear }, asOf: '2026-11-21', failedSources: ['美国宏观'] } as ReadingsState)
    renderAt('druckenmiller')
    expect(screen.getByRole('alert').textContent).toContain('部分数据来源暂时不可用')
    expect(screen.getAllByText('5.04').length).toBeGreaterThan(0)
  })

  it('历史趋势规则保留出处，本站测量说明只在指标节说明出现一次', () => {
    state({ state: 'ok', readings: {}, asOf: '' })
    renderAt('tudor-jones')
    const section = screen.getByRole('region', { name: '他看的指标 · 本站当前读数' })
    const row = within(section).getByRole('rowheader', { name: /200 日收盘均线/ }).closest('tr')!
    expect(within(row).getByText(/2014 年 Tony Robbins/)).toBeTruthy()
    expect(within(section).getAllByText(/这是本站测量，不是他的当前信号/)).toHaveLength(1)
    expect(within(row).queryByText('这是本站测量，不是他的当前信号。')).toBeNull()
  })

  it('指标表为三列，证据归入指标列，并覆盖四种读数布局', () => {
    state({ state: 'ok', readings: { tenYear }, asOf: '2026-11-19' })
    renderAt('druckenmiller')
    const table = screen.getByRole('region', { name: '斯坦利·德鲁肯米勒关注的指标与本站读数' })
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['指标', '他怎么读', '本站当前读数'])
    expect(within(table).queryByRole('columnheader', { name: '证据等级' })).toBeNull()

    const exact = within(table).getByRole('rowheader', { name: /10 年期美债与债市/ })
    expect(within(exact).getByText('原话')).toBeTruthy()
    const exactRow = exact.closest('tr')!
    expect(within(exactRow).queryByText('同口径读数')).toBeNull()
    expect(within(exactRow).queryByText('本站近似（口径不同）')).toBeNull()
    expect(within(exactRow).getByText('10 年期美债收益率')).toBeTruthy()

    const proxyRow = within(table).getByRole('rowheader', { name: /市场宽度与涨跌家数线/ }).closest('tr')!
    expect(within(proxyRow).getByText('本站近似（口径不同）')).toBeTruthy()
    expect(within(proxyRow).getAllByText('本站暂无')).toHaveLength(1)

    const bothRow = within(table).getByRole('rowheader', { name: /铜与大宗商品趋势/ }).closest('tr')!
    expect(bothRow.querySelectorAll('.mm-detail__reading-group')).toHaveLength(2)
    expect(within(bothRow).queryByText('同口径读数')).toBeNull()
    expect(within(bothRow).getByText('本站近似（口径不同）')).toBeTruthy()
    expect(within(bothRow).getByText(/铜金比是铜相对黄金的价格/)).toBeTruthy()

    const emptyRow = within(table).getByRole('rowheader', { name: /AI 资本开支/ }).closest('tr')!
    expect(within(emptyRow).getByText('本站暂无')).toBeTruthy()
    expect(within(emptyRow).getByText(/SEC EDGAR：超大型科技公司的资本开支披露/)).toBeTruthy()
    expect(emptyRow.querySelector('.mm-detail__reading-groups')).toBeNull()
  })

  it('筛选按钮显示四种静态分类数量，并过滤对应指标', () => {
    state({ state: 'ok', readings: {}, asOf: '' })
    const indicators = masterBySlug('dalio')!.indicators
    const exact = indicators.filter(item => item.readings?.length)
    const proxy = indicators.filter(item => !item.readings?.length && item.proxyReadings?.length)
    const empty = indicators.filter(item => !item.readings?.length && !item.proxyReadings?.length)
    renderAt('dalio')
    const group = screen.getByRole('group', { name: '按读数类型筛选' })
    expect(within(group).getByRole('button', { name: `全部 ${indicators.length}` })).toBeTruthy()
    expect(within(group).getByRole('button', { name: `有同口径读数 ${exact.length}` })).toBeTruthy()
    expect(within(group).getByRole('button', { name: `只有近似 ${proxy.length}` })).toBeTruthy()
    expect(within(group).getByRole('button', { name: `本站暂无 ${empty.length}` })).toBeTruthy()

    const table = () => screen.getByRole('region', { name: '瑞·达利欧关注的指标与本站读数' })
    const expectRows = (items: typeof indicators) => {
      const rows = within(table()).getAllByRole('row').slice(1)
      expect(rows).toHaveLength(items.length)
      rows.forEach((row, index) => expect(row.textContent).toContain(items[index].name))
    }
    fireEvent.click(within(group).getByRole('button', { name: `只有近似 ${proxy.length}` }))
    expectRows(proxy)
    fireEvent.click(within(group).getByRole('button', { name: `有同口径读数 ${exact.length}` }))
    expectRows(exact)
    fireEvent.click(within(group).getByRole('button', { name: `本站暂无 ${empty.length}` }))
    expectRows(empty)
    fireEvent.click(within(group).getByRole('button', { name: `全部 ${indicators.length}` }))
    expectRows(indicators)
  })

  it('观察项可跳到第一个对应指标行，恢复全部筛选并短暂高亮', () => {
    state({ state: 'ok', readings: { spxVs200dma: spxBelow200 }, asOf: '2026-11-20' })
    renderAt('tudor-jones')
    const current = screen.getByRole('region', { name: '按他的方法，现在怎么看' })
    const takeRow = within(current).getByRole('rowheader', { name: '200 日均线' }).closest('tr')!
    const link = within(takeRow).getByRole('link', { name: '看这项读数' })
    expect(link.getAttribute('href')).toBe('#mm-indicator-tudor-jones-0')
    fireEvent.click(screen.getByRole('button', { name: /^只有近似 / }))
    fireEvent.click(link)
    const target = document.getElementById('mm-indicator-tudor-jones-0')!
    expect(target.classList.contains('mm-detail__indicator--highlighted')).toBe(true)
    expect(screen.getByRole('button', { name: /^全部 / }).getAttribute('aria-pressed')).toBe('true')
    expect(window.location.hash).toBe('#mm-indicator-tudor-jones-0')
  })

  it('观察项没有引用读数时不显示跳转链接，有对应行时才显示', () => {
    state({ state: 'ok', readings: {}, asOf: '' })
    renderAt('zweig')
    const current = screen.getByRole('region', { name: '按他的方法，现在怎么看' })
    const noReadingRow = within(current).getByRole('rowheader', { name: '宽度推力与 10 日涨跌比' }).closest('tr')!
    expect(within(noReadingRow).queryByRole('link', { name: '看这项读数' })).toBeNull()
    const primeRow = within(current).getByRole('rowheader', { name: '优惠利率规则' }).closest('tr')!
    expect(within(primeRow).getByRole('link', { name: '看这项读数' }).getAttribute('href')).toBe('#mm-indicator-zweig-0')
  })

  it('读数加载中时每个指标显示加载状态，正文仍可阅读', () => {
    state({ state: 'loading' })
    renderAt('marks')
    expect(screen.getAllByText('读数加载中').length).toBeGreaterThan(5)
    expect(screen.getByRole('heading', { name: '完整研究文档' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('读数失败时显示错误提示和本站暂无，不隐藏研究正文，不提示其余来源保留', () => {
    state({ state: 'error', message: '测试加载失败' })
    renderAt('dalio')
    expect(screen.getByRole('alert').textContent).toContain('读数暂时无法加载')
    expect(screen.getByRole('alert').textContent).toContain('测试加载失败')
    expect(screen.queryByText(/其余来源的读数仍保留显示/)).toBeNull()
    expect(screen.getAllByText('本站暂无').length).toBeGreaterThan(5)
    expect(screen.getByRole('heading', { name: '完整研究文档' })).toBeTruthy()
  })

  it('页内目录连接五节，都铎·琼斯页显示真实规则档位、headline 与四项可靠性', () => {
    state({ state: 'ok', readings: { spxVs200dma: spxBelow200 }, asOf: '2026-11-20' })
    renderAt('tudor-jones')

    const toc = screen.getByRole('navigation', { name: '页内目录' })
    expect(within(toc).getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])).toEqual([
      ['现在怎么看', '#mm-now'],
      ['核心思路', '#mm-core-ideas'],
      ['他看的指标', '#mm-master-readings'],
      ['靠不靠谱与局限', '#mm-limits'],
      ['完整研究文档', '#mm-research-title'],
    ])

    const current = screen.getByRole('region', { name: '按他的方法，现在怎么看' })
    expect(within(current).getByText('有明确规则')).toBeTruthy()
    expect(within(current).getByText('按他的规则：偏防守')).toBeTruthy()
    const headline = '标普 500 低于 200 日均线 5.96%（11-20），按他的规则应当离场或不持有。'
    expect(within(current).getAllByText(headline).some(element => element.classList.contains('mm-take__headline'))).toBe(true)
    expect(within(current).getAllByText('他本人的说法').length).toBeGreaterThan(0)
    expect(within(current).getByText('本站自定')).toBeTruthy()
    expect(within(current).getByText(/^口径一栏的「他本人的说法」/)).toBeTruthy()
    expect(within(current).getByRole('link', { name: '看本站对当前位置的整体归纳' }).getAttribute('href')).toBe('/invest/macro-masters')

    const reliability = screen.getByRole('region', { name: '靠不靠谱与局限' })
    for (const label of ['能不能检验', '适合回答', '不适合回答', '公开失误']) {
      expect(within(reliability).getByText(label)).toBeTruthy()
    }
    expect(within(reliability).getByRole('heading', { name: '主要局限' })).toBeTruthy()
    for (const value of Object.values(masterBySlug('tudor-jones')!.track)) {
      expect(within(reliability).getByText(value)).toBeTruthy()
    }
  })

  it('马克斯页的含义列使用过冷与过热措辞', () => {
    state({ state: 'ok', readings: { hySpread: narrowCredit, vix: highVix }, asOf: '2026-11-20' })
    renderAt('marks')
    const current = screen.getByRole('region', { name: '按他的方法，现在怎么看' })
    expect(within(current).getByText(/^过热一侧 1 项、过冷一侧 1 项.*他只在极端时调整攻守。$/)).toBeTruthy()
    expect(within(current).getAllByText('过热一侧').length).toBeGreaterThan(0)
    expect(within(current).getAllByText('过冷一侧').length).toBeGreaterThan(0)
    expect(within(current).queryByText(/^口径一栏的「他本人的说法」/)).toBeNull()
  })

  it('索罗斯 reference 页只列线索，不显示含义列，并说明还缺什么', () => {
    state({ state: 'ok', readings: {}, asOf: '' })
    renderAt('soros')
    const current = screen.getByRole('region', { name: '按他的方法，现在怎么看' })
    expect(within(current).getByText('只列线索')).toBeTruthy()
    expect(within(current).getByRole('columnheader', { name: '观察项' })).toBeTruthy()
    expect(within(current).queryByRole('columnheader', { name: '含义' })).toBeNull()
    expect(within(current).getByText(/市场能否通过检验事先不可知/)).toBeTruthy()
  })

  it('当前对照加载中不出结论，可靠性和研究正文照常显示', () => {
    state({ state: 'loading' })
    renderAt('tudor-jones')
    const current = screen.getByRole('region', { name: '按他的方法，现在怎么看' })
    expect(within(current).getByRole('status').textContent).toBe('读数加载中')
    expect(within(current).queryByRole('table')).toBeNull()
    expect(screen.getByRole('region', { name: '靠不靠谱与局限' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '完整研究文档' })).toBeTruthy()
  })

  it('当前对照全部失败时明确无法对照，其余静态内容照常显示', () => {
    state({ state: 'error', message: '测试加载失败' })
    renderAt('marks')
    const current = screen.getByRole('region', { name: '按他的方法，现在怎么看' })
    expect(within(current).getByText('读数暂时无法加载，无法对照')).toBeTruthy()
    expect(within(current).queryByRole('table')).toBeNull()
    expect(within(current).queryByText(/过热一侧 \d+ 项/)).toBeNull()
    expect(screen.getByRole('region', { name: '靠不靠谱与局限' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '完整研究文档' })).toBeTruthy()
  })

  it('读数为空时正常显示本站暂无', () => {
    state({ state: 'ok', readings: {}, asOf: '' })
    renderAt('templeton')
    expect(screen.getAllByText('本站暂无').length).toBeGreaterThan(5)
    expect(screen.queryByText(/数据快照/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})


describe('方法说明指标', () => {
  it('使用共享覆盖计数，方法说明显示独立文案且可单独筛选', () => {
    state({ state: 'ok', readings: {}, asOf: '' })
    renderAt('kostolany')
    const group = screen.getByRole('group', { name: '按读数类型筛选' })
    expect(within(group).getByRole('button', { name: '全部 9' })).toBeTruthy()
    expect(within(group).getByRole('button', { name: '有同口径读数 0' })).toBeTruthy()
    expect(within(group).getByRole('button', { name: '只有近似 7' })).toBeTruthy()
    expect(within(group).getByRole('button', { name: '本站暂无 0' })).toBeTruthy()
    expect(within(group).getByRole('button', { name: '方法说明 2' })).toBeTruthy()

    for (const name of ['本人比喻：主人是经济', '培训机构解读：长期还看企业盈利']) {
      const row = screen.getByRole('rowheader', { name: new RegExp(name) }).closest('tr')!
      expect(within(row).getByText('方法说明，不对应数据')).toBeTruthy()
      expect(within(row).queryByText('本站暂无')).toBeNull()
    }

    fireEvent.click(within(group).getByRole('button', { name: '方法说明 2' }))
    const table = screen.getByRole('region', { name: '安德烈·科斯托拉尼关注的指标与本站读数' })
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(2)
    expect(within(table).getAllByText('方法说明，不对应数据')).toHaveLength(2)
  })

  it('没有方法说明的大师不显示该筛选', () => {
    state({ state: 'ok', readings: {}, asOf: '' })
    renderAt('dalio')
    const group = screen.getByRole('group', { name: '按读数类型筛选' })
    expect(within(group).queryByRole('button', { name: /^方法说明/ })).toBeNull()
  })
})
