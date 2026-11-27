import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import data from '../features/strategy-lab/data/late-cycle.json'
import daily from '../features/strategy-lab/data/daily-execution.json'
import vt from '../features/strategy-lab/data/vol-target.json'
import vol from '../features/strategy-lab/data/etf-volume.json'
import confirm from '../features/strategy-lab/data/vol-confirm.json'
import multi from '../features/strategy-lab/data/multi-asset.json'
import audit from '../features/strategy-lab/data/overfit-audit.json'
import hedge from '../features/strategy-lab/data/option-hedge.json'
import deftrend from '../features/strategy-lab/data/defensive-trend.json'
import trend14 from '../features/strategy-lab/data/trend-14.json'
import heatLiq from '../features/strategy-lab/data/heat-liquidity.json'
import rotHeat from '../features/strategy-lab/data/rotation-heat.json'
import tm from '../features/strategy-lab/data/trend-momentum.json'
import { pct } from '../features/strategy-lab/LateCycleStudy'
import StrategyLab, { LAB_GROUPS, LAB_STUDIES, STRATEGY_LAB_LEAD, groupedStudies } from './StrategyLab'

vi.mock('../features/combined-strategy/load', () => ({
  useCombinedStrategy: vi.fn(() => ({ status: 'ready', data: { current: { instruction: '股票仓位保持在你上限的 85%，本月不用调。' } } })),
}))

function renderPage(path = '/invest/strategy-lab'): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <StrategyLab />
    </MemoryRouter>,
  )
}
const at = (tab: string): string => `/invest/strategy-lab?tab=${tab}`

describe('研究中页签', () => {
  it('页头说明不影响仓位，导航里「研究中」为当前页', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('研究中')
    expect(screen.getByTestId('lab-lead').textContent).toBe(STRATEGY_LAB_LEAD)
    const trio = screen.getByRole('navigation', { name: '策略相关页面' })
    const lab = within(trio).getByRole('link', { name: '待验证 · 研究中' })
    expect(lab.getAttribute('href')).toBe('/invest/strategy-lab')
    expect(lab.getAttribute('aria-current')).toBe('page')
    expect(within(trio).getByRole('link', { name: '已通过 · 通过检验' }).getAttribute('aria-current')).toBeNull()
    expect(within(trio).queryByRole('link', { name: '结论 · 综合策略' })).toBeNull()
  })

  it('回调事件表逐行对应研究结果，汇总表含扩张后段一行', () => {
    renderPage(at('trend'))
    const events = screen.getByTestId('lab-events')
    expect(within(events).getAllByRole('row')).toHaveLength(data.events.length + 1)
    const e2020 = data.events.find(e => e.peak === '2020-02-19')!
    expect(within(events).getByTitle(`${e2020.peak} → ${e2020.trough}`)).toBeTruthy()
    expect(screen.getByTestId('lab-groups').textContent).toContain('偏热且进攻侧（扩张后段）')
    expect(screen.getByTestId('lab-verdict-a').textContent).toContain(data.verdictA)
  })

  it('四个候选都显示预注册结论', () => {
    renderPage(at('trend'))
    const table = screen.getByTestId('lab-candidates')
    for (const id of ['K1', 'K2', 'K3', 'K4'] as const) {
      expect(within(table).getByTitle(data.verdictB[id]).textContent).toBe('不通过')
    }
    expect(within(table).getAllByText(/未达 \+0\.02/)).toHaveLength(4)
    expect(table.textContent).toContain(pct(data.strategies.base.full.dailyMaxDd))
  })

  it('按日执行研究：三个写法的预注册结论', () => {
    renderPage(at('trend'))
    expect(screen.getByTestId('lab-daily-answer').textContent).toContain(daily.answer)
    const table = screen.getByTestId('lab-daily-table')
    for (const id of ['D1', 'D2', 'D3'] as const) expect(within(table).getByTitle(daily.verdict[id]).textContent).toBe('不通过')
    expect(within(table).getAllByRole('row')).toHaveLength(5)
  })

  it('页签：六个分类带研究数；默认总览列出全部研究卡片和有效策略初版', () => {
    renderPage()
    const tabs = screen.getAllByRole('tab').map(t => t.textContent)
    const count = (tab: string): number => LAB_STUDIES.filter(x => x.tab === tab).length
    expect(tabs).toEqual(['总览', `规则可信度 · ${count('audit')}`, `牛市后期 · ${count('late')}`, `防下跌 · ${count('trend')}`, `降低波动 · ${count('vol')}`, `轮动 · ${count('rotate')}`, `A 股 ETF · ${count('cn')}`])
    expect(screen.getByRole('tab', { name: '总览' }).getAttribute('aria-selected')).toBe('true')
    expect(within(screen.getByTestId('lab-cards')).getAllByRole('button')).toHaveLength(LAB_STUDIES.length)
    expect(screen.getByTestId('lab-v01')).toBeTruthy()
    expect(screen.queryByTestId('lab-late-cycle')).toBeNull()
  })

  it('点总览卡片切到对应页签并显示那项研究', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('lab-card-lab-vol-confirm'))
    expect(screen.getByRole('tab', { name: /^降低波动/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('lab-vol-confirm')).toBeTruthy()
    expect(screen.queryByTestId('lab-cards')).toBeNull()
  })

  it('旧链接 #lab-xxx 直接打开对应页签；?tab= 可分享', () => {
    renderPage('/invest/strategy-lab#lab-late-cycle')
    expect(screen.getByRole('tab', { name: /^防下跌/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('lab-late-cycle')).toBeTruthy()
  })

  it('德鲁肯米勒核查里的链接跳到「防下跌」页签的趋势防下跌研究', () => {
    renderPage(at('late'))
    fireEvent.click(within(screen.getByTestId('lab-druckenmiller')).getByRole('link', { name: '趋势防下跌研究' }))
    expect(screen.getByRole('tab', { name: /^防下跌/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('lab-trend')).toBeTruthy()
  })

  it('同一页签多项研究时有页内跳转；切页签只显示该类研究', () => {
    renderPage(at('vol'))
    const jump = screen.getByRole('navigation', { name: '本页研究' })
    expect(within(jump).getAllByRole('button')).toHaveLength(LAB_STUDIES.filter(x => x.tab === 'vol').length)
    expect(screen.queryByTestId('lab-daily-execution')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /^A 股 ETF/ }))
    expect(screen.getByTestId('lab-etf-volume')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: '本页研究' })).toBeNull()
    expect(screen.queryByTestId('lab-vol-confirm')).toBeNull()
  })

  it('子分组：每项研究都属于本页签的某个分组，且没有空分组', () => {
    for (const s of LAB_STUDIES) {
      expect(LAB_GROUPS[s.tab].map(g => g.id), s.id).toContain(s.group)
    }
    for (const [tab, groups] of Object.entries(LAB_GROUPS)) {
      for (const g of groups) expect(LAB_STUDIES.some(s => s.tab === tab && s.group === g.id), `${tab}/${g.id}`).toBe(true)
      expect(groupedStudies(tab as keyof typeof LAB_GROUPS).flatMap(g => g.studies)).toHaveLength(LAB_STUDIES.filter(s => s.tab === tab).length)
    }
  })

  it('防下跌页签按子分组显示，BTC 研究单独放在「其他资产」并注明与美股规则无关', () => {
    renderPage(at('trend'))
    const titles = screen.getAllByRole('heading', { level: 2 }).filter(h => h.classList.contains('lab-group__title')).map(h => h.firstChild?.textContent)
    expect(titles).toEqual(LAB_GROUPS.trend.map(g => g.label))
    const other = screen.getByTestId('lab-group-trend-other')
    expect(other.querySelector('#lab-crypto-l039')).not.toBeNull()
    expect(other.textContent).toContain('与美股仓位规则无关')
    expect(screen.getByTestId('lab-group-trend-ma').querySelector('#lab-crypto-l039')).toBeNull()
    const jump = screen.getByRole('navigation', { name: '本页研究' })
    for (const g of LAB_GROUPS.trend) expect(jump.textContent).toContain(g.label)
  })

  it('只有一项研究的页签也显示子分组标题；总览卡片标出页签与子分组', () => {
    renderPage(at('cn'))
    expect(screen.getByTestId('lab-group-cn-timing').textContent).toContain('择时信号')
    cleanup()
    renderPage()
    expect(screen.getByTestId('lab-card-lab-crypto-l039').textContent).toContain('防下跌 · 其他资产')
  })

  it('有效策略初版：美股读数来自综合策略，A 股读数加载失败时有提示', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderPage()
    expect(screen.getByTestId('lab-v01-us-now').textContent).toBe('股票仓位保持在你上限的 85%，本月不用调。')
    expect(await screen.findByText('读数暂时加载不了')).toBeTruthy()
    expect(within(screen.getByTestId('lab-v01')).getByRole('link', { name: 'ETF 择时观察（逐只信号）' }).getAttribute('href')).toBe('/lab/etf-timing')
    vi.unstubAllGlobals()
  })

  it('波动率目标：三个写法的结论、同等仓位对照与当前读数', () => {
    renderPage(at('vol'))
    const table = screen.getByTestId('lab-vt-table')
    for (const id of ['VT1', 'VT2', 'VT3'] as const) expect(within(table).getByTitle(vt.verdict[id]).textContent).toBe('不通过')
    expect(within(screen.getByTestId('lab-vt-events')).getAllByRole('row')).toHaveLength(9)
    expect(screen.getByTestId('lab-vt-now').textContent).toContain(vt.sigmaNow.k.toFixed(2))
  })

  it('A 股成交量检验：三个条件的判定', () => {
    renderPage(at('cn'))
    const table = screen.getByTestId('lab-etf-volume-table')
    for (const id of ['V1', 'V2', 'V3'] as const) expect(table.textContent).toContain(vol.decision[id].text)
    expect(within(table).getAllByRole('row')).toHaveLength(5)
  })

  it('降波动确认检验：10 个市场逐行、上限表 3 行', () => {
    renderPage(at('vol'))
    expect(within(screen.getByTestId('lab-vol-confirm-table')).getAllByRole('row')).toHaveLength(1 + 1 + confirm.overseas.length)
    expect(within(screen.getByTestId('lab-cap-table')).getAllByRole('row')).toHaveLength(4)
    expect(screen.getByTestId('lab-vol-confirm-answer').textContent).toContain('部分成立')
  })

  it('多资产检验：6 行比较、5 个条件、结论不通过', () => {
    renderPage(at('vol'))
    expect(within(screen.getByTestId('lab-multi-table')).getAllByRole('row')).toHaveLength(7)
    expect(within(screen.getByTestId('lab-multi-checks')).getAllByRole('row')).toHaveLength(6)
    expect(multi.verdict.passed).toEqual([])
    expect(screen.getByTestId('lab-multi-answer').textContent).toContain('美股上限 80%')
  })

  it('回调事件表可按类型筛选，扩张后段只剩对应几次', () => {
    renderPage(at('trend'))
    const events = screen.getByTestId('lab-events')
    const group = screen.getByRole('group', { name: '按回调类型筛选' })
    const late = data.groups.find(g => g.label.includes('扩张后段'))!
    fireEvent.click(within(group).getByRole('button', { name: /扩张后段/ }))
    expect(within(group).getByRole('button', { name: /扩张后段/ }).getAttribute('aria-pressed')).toBe('true')
    expect(within(events).getAllByRole('row')).toHaveLength(late.n + 1)
    const rec = data.groups.find(g => g.label === '伴随衰退')!
    fireEvent.click(within(group).getByRole('button', { name: /^伴随衰退/ }))
    expect(within(events).getAllByRole('row')).toHaveLength(rec.n + 1)
  })

  it('过拟合审计：DSR 表按 N 逐行、置信集 6 个写法，判定来自研究结果', () => {
    renderPage(at('audit'))
    expect(within(screen.getByTestId('lab-audit-dsr')).getAllByRole('row')).toHaveLength(audit.T1.byN.length + 1)
    expect(within(screen.getByTestId('lab-audit-mcs')).getAllByRole('row')).toHaveLength(7)
    expect(screen.getByTestId('lab-audit-answer').textContent).toContain(audit.T1.verdict)
    expect(screen.getByTestId('lab-audit-answer').textContent).toContain(audit.T1.byN.find(r => r.N === 86)!.dsr.toFixed(2))
  })

  it('期权保护：17 次急跌逐行、两个候选的判定与研究结果一致', () => {
    renderPage(at('trend'))
    expect(within(screen.getByTestId('lab-hedge-events')).getAllByRole('row')).toHaveLength(hedge.events.length + 1)
    const main = screen.getByTestId('lab-hedge-main')
    expect(main.textContent).toContain(hedge.confirm.PPUT.verdict)
    expect(main.textContent).toContain(hedge.confirm.CLLZ.verdict)
    expect(within(screen.getByTestId('lab-hedge-explore')).getAllByRole('row')).toHaveLength(Object.keys(hedge.explore).length + 1)
  })

  it('防守部分趋势债券：14 国逐行，判定与研究结果一致', () => {
    renderPage(at('vol'))
    expect(within(screen.getByTestId('lab-deftrend-countries')).getAllByRole('row')).toHaveLength(deftrend.perCountry.length + 1)
    const main = screen.getByTestId('lab-deftrend-main')
    expect(main.textContent).toContain(deftrend.C1.verdict)
    expect(main.textContent).toContain(deftrend.C2.verdict)
  })

  it('十个月均线 14 国：各国逐行，判定与研究结果一致', () => {
    renderPage(at('trend'))
    expect(within(screen.getByTestId('lab-trend14-countries')).getAllByRole('row')).toHaveLength(trend14.perCountry.length + 1)
    expect(screen.getByTestId('lab-trend14-main').textContent).toContain(trend14.C1.verdict)
  })

  it('纳指与半导体超配、流动性两项：表格逐行，判定来自研究结果', () => {
    renderPage(at('late'))
    expect(within(screen.getByTestId('lab-heat-table')).getAllByRole('row')).toHaveLength(5)
    expect(screen.getByTestId('lab-heat-table').textContent).toContain(heatLiq.heat.N1.verdict)
    expect(within(screen.getByTestId('lab-liquidity-table')).getAllByRole('row')).toHaveLength(3)
    expect(screen.getByTestId('lab-liquidity-table').textContent).toContain(heatLiq.liquidity.Q1.verdict)
  })

  it('跨国动量轮动：两个候选与对只持有美国的比较，判定来自研究结果', () => {
    renderPage(at('rotate'))
    const table = screen.getByTestId('lab-momentum-table')
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(table.textContent).toContain(rotHeat.momentum.C1.verdict)
    expect(table.textContent).toContain(rotHeat.momentum.C2.verdict)
    expect(within(screen.getByTestId('lab-momentum-vsus')).getAllByRole('row')).toHaveLength(5)
  })

  it('多资产趋势 + 动量：两个写法与大熊市逐行，判定来自研究结果', () => {
    renderPage(at('rotate'))
    const table = screen.getByTestId('lab-tm-table')
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(table.textContent).toContain(tm.main.T1.verdict)
    expect(within(screen.getByTestId('lab-tm-bears')).getAllByRole('row')).toHaveLength(tm.bears.length + 1)
  })

  it('更多过热读数：五个指标逐行，49 行业面板判定来自研究结果', () => {
    renderPage(at('late'))
    const table = screen.getByTestId('lab-heat-more-table')
    expect(within(table).getAllByRole('row')).toHaveLength(6)
    expect(table.textContent).toContain(rotHeat.heat.A1.verdict)
    expect(screen.getByTestId('lab-heat-more-p49').textContent).toContain(rotHeat.p49.verdict)
  })

  it('百分比用「−」号', () => {
    expect(pct(-0.338)).toBe('−33.8%')
    expect(pct(0.05, 1, true)).toBe('+5.0%')
    expect(pct(null)).toBe('—')
  })
})
