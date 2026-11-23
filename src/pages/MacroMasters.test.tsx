import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCycleView } from '../features/macro-masters/cycleView'
import { HORIZON_LABELS, MODE_HINTS, MODE_LABELS, TEMPERATURE_LABELS } from '../features/macro-masters/chips'
import { MASTERS } from '../features/macro-masters/masters'
import { READING_LABELS } from '../features/macro-masters/readings'
import type { Reading, ReadingKey } from '../features/macro-masters/types'
import MacroMasters, { MACRO_MASTERS_FOOTER, MACRO_MASTERS_LEAD } from './MacroMasters'

vi.mock('../features/macro-posture/composite/SummaryCard', () => ({
  default: () => <section aria-label="本站宏观攻守结论"><h2>本站宏观攻守结论</h2></section>,
}))

vi.mock('../features/macro-masters/readings', async () => {
  const actual = await vi.importActual<typeof import('../features/macro-masters/readings')>('../features/macro-masters/readings')
  return {
    ...actual,
    useReadings: vi.fn(),
  }
})

import { useReadings } from '../features/macro-masters/readings'

const mockedUse = vi.mocked(useReadings)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function reading(key: ReadingKey, value: number, extras: Partial<Reading> = {}): Reading {
  return {
    key,
    label: key,
    value,
    unit: '%',
    date: '2026-11-20',
    source: 'https://fred.stlouisfed.org/series/TEST',
    ...extras,
  }
}

const fixtureReadings: Partial<Record<ReadingKey, Reading | null>> = {
  spxVs200dma: reading('spxVs200dma', -5.96),
  spxDrawdown: reading('spxDrawdown', -11.62),
  spxAbove200: reading('spxAbove200', 48.7),
  netNewHighs: reading('netNewHighs', -5.21),
  hySpread: reading('hySpread', 352, {
    unit: 'bp',
    prior: { value: 340, date: '2026-10-20' },
    direction: 'up',
    percentile: 49,
    percentileYears: 10,
  }),
  baaAaa: reading('baaAaa', 80, { unit: 'bp' }),
  policyRate: reading('policyRate', 3.9, {
    unit: '%',
    lastMove: { date: '2026-09-17', from: 3.65, to: 3.9 },
    moveRun: { direction: 'up', count: 1, total: 0.25, startLevel: 3.65, since: '2026-09-17' },
  }),
  realYield10: reading('realYield10', 1.8),
  tenYear: reading('tenYear', 4.2),
  nfci: reading('nfci', -0.478, { unit: '点', frequency: 'weekly', date: '2026-11-13' }),
  netLiquidity: reading('netLiquidity', 5824.5, {
    unit: '十亿美元',
    frequency: 'weekly',
    date: '2026-11-18',
    direction: 'flat',
  }),
  epsRevision: reading('epsRevision', 3.3),
  sahm: reading('sahm', 0, { unit: '个百分点', frequency: 'monthly', date: '2026-10-01' }),
  unrate: reading('unrate', 4.1, { frequency: 'monthly', date: '2026-10-01' }),
  cape: reading('cape', 36.44, {
    unit: '倍',
    frequency: 'monthly',
    date: '2026-11-01',
    longPercentile: 95.7,
    longPercentileSince: 1900,
    percentile: 88,
    percentileYears: 10,
  }),
  forwardPe: reading('forwardPe', 22),
  buffett: reading('buffett', 180),
  fearGreed: reading('fearGreed', 9.67, { unit: '点' }),
  vix: reading('vix', 35.89, { unit: '点' }),
  putCall: reading('putCall', 1.1),
  retailBullBear: reading('retailBullBear', -20),
  fedAssets: reading('fedAssets', 6741, {
    unit: '十亿美元',
    direction: 'up',
    percentile: 70,
  }),
  debtService: reading('debtService', 11, {
    frequency: 'quarterly',
    date: '2026-06-30',
    direction: 'up',
    percentile: 60,
    percentileYears: 10,
  }),
  copper: reading('copper', 4.5, { unit: '美元/磅', direction: 'down' }),
  copperGold: reading('copperGold', 0.12),
  managerCash: reading('managerCash', 4.2, { stale: true, date: '2025-01-01' }),
  mcclellan: reading('mcclellan', 0.1, { unit: '点' }),
}

function renderPage(path = '/invest/macro-masters') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MacroMasters />
    </MemoryRouter>,
  )
}

function mockOk(extra: Partial<typeof fixtureReadings> = {}, failedSources: string[] = []) {
  mockedUse.mockReturnValue({
    state: 'ok',
    asOf: '2026-11-20',
    readings: { ...fixtureReadings, ...extra },
    failedSources,
  })
}

describe('MacroMasters 总览页', () => {
  it('加载中：合并大师节、指标表加载态；不出当前位置结论', () => {
    mockedUse.mockReturnValue({ state: 'loading' })
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('宏观大师怎么看周期')
    expect(screen.getByText(MACRO_MASTERS_LEAD)).toBeTruthy()
    expect(screen.getByText(MACRO_MASTERS_FOOTER)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '现在的位置' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '分维度的证据' })).toBeNull()
    const mastersSection = screen.getByRole('heading', { name: '九位大师：现在怎么看，靠不靠谱' }).closest('section')!
    expect(screen.queryByRole('heading', { name: '这九位靠不靠谱' })).toBeNull()
    for (const master of MASTERS) {
      expect(within(mastersSection).getByText(master.name)).toBeTruthy()
      expect(within(mastersSection).getByText(new RegExp(`适合回答：${master.track.bestFor}`))).toBeTruthy()
    }
    expect(screen.getAllByText(/加载中/).length).toBeGreaterThan(0)
  })

  it('全部失败：错误提示、不出结论，大师节仍可展开靠不靠谱', () => {
    mockedUse.mockReturnValue({ state: 'error', message: '网络中断' })
    renderPage()
    expect(screen.getByRole('alert').textContent).toBe(
      '读数加载失败（网络中断）。本站暂不出当前位置结论，下方仍可看各位的方法与可靠性。',
    )
    expect(screen.queryByRole('heading', { name: '现在的位置' })).toBeNull()
    const mastersSection = screen.getByRole('heading', { name: '九位大师：现在怎么看，靠不靠谱' }).closest('section')!
    const row = within(mastersSection).getByText(MASTERS[0].name).closest('li')!
    fireEvent.click(within(row).getByRole('button'))
    expect(within(row).getByText(MASTERS[0].track.testability)).toBeTruthy()
    expect(within(row).getAllByRole('link', { name: /看他的完整方法/ })[0].getAttribute('href'))
      .toBe(`/invest/macro-masters/${MASTERS[0].slug}`)
  })

  it('成功：档位、维度展开、合并大师节、指标筛选与历史位置', () => {
    mockOk()
    const expected = buildCycleView(fixtureReadings)
    renderPage()

    const now = screen.getByRole('heading', { name: '现在的位置' })
    const summary = screen.getByRole('heading', { name: '本站宏观攻守结论' })
    expect(summary.compareDocumentPosition(now) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('link', { name: '查看本站综合攻守结论与回测' }).getAttribute('href')).toBe('/invest/macro-posture')
    expect(screen.getByText(`大师规则映射：${expected.posture.label}`)).toBeTruthy()
    expect(screen.queryByText('短线攻守：按大师规则映射，非本站综合结论。')).toBeNull()
    expect(screen.getByText(expected.phase.name)).toBeTruthy()
    expect(screen.getByText(expected.posture.meaning)).toBeTruthy()
    expect(screen.getByText(expected.phase.summary)).toBeTruthy()
    expect(screen.getByText('置信度低')).toBeTruthy()
    expect(screen.getByText(/数据快照 2026-11-20/)).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '页内导航' })).toBeTruthy()

    const dimRoot = screen.getByRole('heading', { name: '分维度的证据' }).closest('section')!
    const dimTable = within(dimRoot).getByRole('region', { name: '分维度证据表' })
    for (const dim of expected.dimensions) {
      expect(within(dimTable).getByText(dim.name)).toBeTruthy()
      expect(within(dimTable).getByText(dim.summary)).toBeTruthy()
    }
    for (const horizon of ['short', 'medium', 'long', 'contrarian'] as const) {
      expect(within(dimTable).getByText(HORIZON_LABELS[horizon])).toBeTruthy()
    }
    expect(dimTable.querySelectorAll('tbody')).toHaveLength(4)

    const trendRow = within(dimTable).getByText('趋势').closest('tr')!
    fireEvent.click(trendRow)
    expect(trendRow.getAttribute('aria-expanded')).toBe('true')
    const trendPanel = document.getElementById('mm-dim-panel-trend')!
    expect(trendPanel.textContent).toContain('判定口径')
    expect(within(trendPanel).getAllByRole('button', { name: '在指标表里看' }).length).toBeGreaterThan(0)
    fireEvent.keyDown(trendRow, { key: 'Enter' })
    expect(trendRow.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trendRow)
    fireEvent.click(within(dimRoot).getByRole('button', { name: '全部收起' }))
    expect(trendRow.getAttribute('aria-expanded')).toBe('false')

    const mastersSection = screen.getByRole('heading', { name: '九位大师：现在怎么看，靠不靠谱' }).closest('section')!
    expect(within(mastersSection).getByText(/不打分、不排名/)).toBeTruthy()
    expect(within(mastersSection).getAllByText(MODE_LABELS.rule).length).toBeGreaterThan(0)
    expect(within(mastersSection).getByText(MODE_HINTS.checklist)).toBeTruthy()
    expect(within(mastersSection).getAllByText(/线索：/).length).toBe(3)
    const marksMaster = MASTERS.find(m => m.slug === 'marks')!
    const marksRow = within(mastersSection).getByText(marksMaster.name).closest('li')!
    fireEvent.click(within(marksRow).getByRole('button'))
    expect(within(marksRow).getAllByText(TEMPERATURE_LABELS.caution).length).toBeGreaterThan(0)
    expect(within(marksRow).getByText(marksMaster.track.bestFor)).toBeTruthy()
    // 部分展开时按钮仍是「全部展开」
    fireEvent.click(within(mastersSection).getByRole('button', { name: '全部展开' }))
    expect(within(mastersSection).getAllByText('对照明细').length).toBe(9)
    fireEvent.click(within(mastersSection).getByRole('button', { name: '全部收起' }))

    const table = screen.getByRole('region', { name: '指标对照表' })
    expect(within(table).getByText(/第 95\.7 百分位/)).toBeTruthy()
    expect(within(table).getByRole('img', { name: /1900 年以来第 95\.7 百分位/ })).toBeTruthy()
    expect(within(table).getByText(/近 10 年第 88/)).toBeTruthy()
    const mcclellanRow = within(table).getByText('McClellan 振荡（比例调整）').closest('tr')!
    expect(within(mcclellanRow).getByText('历史不足')).toBeTruthy()
    expect(within(table).getByText('已过期')).toBeTruthy()

    const copperRow = within(table).getByText('COMEX 铜价').closest('tr')!
    expect(within(copperRow).getByText(/同口径 1/)).toBeTruthy()
    fireEvent.click(copperRow)
    const copperPanel = document.getElementById('mm-compare-panel-copper')!
    expect(within(copperPanel).getByRole('link', { name: /德鲁肯米勒/ })).toBeTruthy()

    const debtRow = within(table).getByText('家庭偿债比').closest('tr')!
    expect(within(debtRow).getByText(/↑ 较上季上升/)).toBeTruthy()

    const policyRow = within(table).getByText('准备金余额利率').closest('tr')!
    fireEvent.click(policyRow)
    expect(document.getElementById('mm-compare-panel-policyRate')!.textContent)
      .toMatch(/最近一次调整：2026-09-17，由 3\.65% 上调到 3\.9%/)

    fireEvent.click(screen.getByRole('button', { name: /用于判定/ }))
    expect(within(table).queryByText(READING_LABELS.copper)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /全部\s*\d+/ }))

    fireEvent.change(screen.getByLabelText('谁在看'), { target: { value: 'druckenmiller' } })
    expect(within(screen.getByRole('region', { name: '指标对照表' })).getByText('COMEX 铜价')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '指标对照表' })).queryByText('席勒 CAPE')).toBeNull()

    fireEvent.change(screen.getByLabelText('谁在看'), { target: { value: 'templeton' } })
    fireEvent.click(screen.getByRole('button', { name: /商品\s*\d+/ }))
    expect(screen.getByText(/没有符合当前筛选的读数/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(within(screen.getByRole('region', { name: '指标对照表' })).getByText('席勒 CAPE')).toBeTruthy()
  })

  it('网址参数 theme/who 可恢复筛选；跳转后目标行展开', () => {
    mockOk()
    renderPage('/invest/macro-masters?theme=commodities&who=druckenmiller')
    const table = screen.getByRole('region', { name: '指标对照表' })
    expect(within(table).getByText('COMEX 铜价')).toBeTruthy()
    expect(within(table).queryByText('席勒 CAPE')).toBeNull()
    expect(screen.getByRole('button', { name: /商品\s*\d+/ }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /全部\s*\d+/ }))
    fireEvent.change(screen.getByLabelText('谁在看'), { target: { value: 'all' } })
    const supportBtn = screen.getAllByRole('button').find(el => el.className.includes('mm-now__evidence-link') && el.textContent?.includes('趋势：'))
    expect(supportBtn).toBeTruthy()
    fireEvent.click(supportBtn!)
    expect(document.getElementById('mm-dim-row-trend')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('网址里认不出的 theme / who 按「全部」处理，不显示空结果', () => {
    mockOk()
    renderPage('/invest/macro-masters?theme=no-such-theme&who=nobody')
    const table = screen.getByRole('region', { name: '指标对照表' })
    expect(within(table).getByText('COMEX 铜价')).toBeTruthy()
    expect(within(table).getByText('席勒 CAPE')).toBeTruthy()
    expect(screen.getByRole('button', { name: /全部\s*\d+/ }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByLabelText('谁在看') as HTMLSelectElement).value).toBe('all')
    expect(screen.queryByRole('button', { name: '清除筛选' })).toBeNull()
  })

  it('部分来源失败时在「现在的位置」下与指标表都提示', () => {
    mockOk({ copper: null }, ['美股切片'])
    renderPage()
    const tips = screen.getAllByText(/部分数据来源暂时不可用（美股切片）/)
    expect(tips.length).toBeGreaterThanOrEqual(2)
    expect(document.body.textContent).toMatch(/6\.74\s*万亿美元/)
  })

  it('这是怎么判的展开为三栏面板', () => {
    mockOk()
    renderPage()
    fireEvent.click(screen.getByText('这是怎么判的'))
    const method = screen.getByText('这是怎么判的').closest('details')!
    expect(within(method).getByText('攻守档怎么定')).toBeTruthy()
    expect(within(method).getByText('阶段怎么分')).toBeTruthy()
    expect(within(method).getByText('回测说明了什么')).toBeTruthy()
  })
})


describe('指标对照的大师覆盖与缺口', () => {
  it('未选大师时保持原样；选择后显示覆盖摘要、详情链接与外部来源', () => {
    mockOk()
    renderPage()
    const compare = screen.getByRole('heading', { name: '指标对照' }).closest('section')!
    expect(within(compare).queryByText(/项可量化指标/)).toBeNull()
    expect(within(compare).queryByRole('region', { name: '本站暂无的指标' })).toBeNull()

    fireEvent.change(screen.getByLabelText('谁在看'), { target: { value: 'druckenmiller' } })
    expect(within(compare).getByText(/德鲁肯米勒关注 10 项可量化指标：同口径 7 · 本站近似 2 · 本站暂无 1/)).toBeTruthy()
    expect(within(compare).getByRole('link', { name: '查看他的全部指标 →' }).getAttribute('href'))
      .toBe('/invest/macro-masters/druckenmiller#mm-master-readings')
    const gaps = within(compare).getByRole('region', { name: '本站暂无的指标' })
    expect(within(gaps).getByText('AI 资本开支')).toBeTruthy()
    expect(within(gaps).getByText('SEC EDGAR：超大型科技公司的资本开支披露。')).toBeTruthy()
  })

  it('方法说明不进入缺口列表，主题无读数时摘要与缺口仍保留', () => {
    mockOk()
    renderPage('/invest/macro-masters?who=grantham')
    const compare = screen.getByRole('heading', { name: '指标对照' }).closest('section')!
    expect(within(compare).getByText(/格兰瑟姆关注 8 项可量化指标：同口径 1 · 本站近似 4 · 本站暂无 3/)).toBeTruthy()
    const gaps = within(compare).getByRole('region', { name: '本站暂无的指标' })
    expect(within(gaps).queryByText('GMO 7 年预测：二手方法说明')).toBeNull()
    expect(within(gaps).queryByText(/The Economist/)).toBeNull()
    expect(within(gaps).getByText('GMO 7 年预测：图表读数')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /商品\s*\d+/ }))
    expect(screen.getByText(/没有符合当前筛选的读数/)).toBeTruthy()
    expect(within(compare).getByText(/格兰瑟姆关注 8 项可量化指标/)).toBeTruthy()
    expect(within(compare).getByRole('region', { name: '本站暂无的指标' })).toBeTruthy()
  })
})
