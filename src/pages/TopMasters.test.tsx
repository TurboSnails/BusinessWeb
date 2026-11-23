import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCycleView } from '../features/macro-masters/cycleView'
import { masterBySlug } from '../features/macro-masters/masters'
import { TOP_CRITERIA } from '../features/macro-masters/top'
import { TOP_MASTERS_FIXTURE } from '../features/macro-masters/top/fixture'
import { consensusSummary, sortTopMasters } from '../features/macro-masters/top/consensus'
import type { Reading, ReadingKey } from '../features/macro-masters/types'
import { TOP_MASTERS_DISCLAIMER } from '../features/macro-masters/top/TopFooter'
import { TOP_MASTERS_SORT_NOTE } from '../features/macro-masters/top/TopHeader'

const topMastersMutable = vi.hoisted(
  () => [] as import('../features/macro-masters/top').TopMaster[],
)

vi.mock('../features/macro-posture/composite/SummaryCard', () => ({
  default: () => <section aria-label="本站宏观攻守结论"><h2>本站宏观攻守结论</h2></section>,
}))

vi.mock('../features/macro-masters/readings', async () => {
  const actual = await vi.importActual<typeof import('../features/macro-masters/readings')>(
    '../features/macro-masters/readings',
  )
  return { ...actual, useReadings: vi.fn() }
})

vi.mock('../features/macro-masters/top', async () => {
  const actual = await vi.importActual<typeof import('../features/macro-masters/top')>(
    '../features/macro-masters/top',
  )
  return {
    ...actual,
    TOP_MASTERS: topMastersMutable,
  }
})

import { useReadings } from '../features/macro-masters/readings'
import TopMasters from './TopMasters'

const mockedUse = vi.mocked(useReadings)

function resetTopMasters(list: readonly import('../features/macro-masters/top').TopMaster[]) {
  topMastersMutable.splice(0, topMastersMutable.length, ...list)
}

beforeEach(() => {
  resetTopMasters(TOP_MASTERS_FIXTURE)
})

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
  }),
  baaAaa: reading('baaAaa', 80, { unit: 'bp', longPercentile: 40, longPercentileSince: 1919 }),
  policyRate: reading('policyRate', 3.9, {
    lastMove: { date: '2026-09-17', from: 3.65, to: 3.9 },
    moveRun: { direction: 'up', count: 1, total: 0.25, startLevel: 3.65, since: '2026-09-17' },
  }),
  realYield10: reading('realYield10', 1.8),
  tenYear: reading('tenYear', 4.2),
  nfci: reading('nfci', -0.478, { unit: '点' }),
  netLiquidity: reading('netLiquidity', 5824.5, { unit: '十亿美元', direction: 'flat' }),
  epsRevision: reading('epsRevision', 3.3),
  sahm: reading('sahm', 0, { unit: '个百分点' }),
  unrate: reading('unrate', 4.1),
  cape: reading('cape', 36.44, { unit: '倍', longPercentile: 95.7, longPercentileSince: 1900 }),
  fearGreed: reading('fearGreed', 9.67, { unit: '点' }),
  vix: reading('vix', 35.89, { unit: '点' }),
  putCall: reading('putCall', 1.1),
  retailBullBear: reading('retailBullBear', -20),
  copper: reading('copper', 4.5, { direction: 'down' }),
  advDecLine: reading('advDecLine', 10, { direction: 'down' }),
  cyclicalDefensive: reading('cyclicalDefensive', -2),
  smallCapRel: reading('smallCapRel', -3),
  fedFunds: reading('fedFunds', 3.9),
  nominalGdpYoy: reading('nominalGdpYoy', 5),
  curve10y2y: reading('curve10y2y', 0.2),
  marginDebtYoy: reading('marginDebtYoy', 5),
  debtService: reading('debtService', 11, { percentile: 60 }),
  equalWeightRel: reading('equalWeightRel', -1),
  growthValueRel: reading('growthValueRel', -2),
}

function renderPage(path = '/invest/top-masters') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invest/top-masters" element={<TopMasters />} />
      </Routes>
    </MemoryRouter>,
  )
}

function mockOk(extra: Partial<typeof fixtureReadings> = {}) {
  mockedUse.mockReturnValue({
    state: 'ok',
    asOf: '2026-11-20',
    readings: { ...fixtureReadings, ...extra },
  })
}

describe('TopMasters 精选页', () => {
  it('页头：标题、入选标准、排序说明、REMOVED 折叠、九位完整版链接', () => {
    mockedUse.mockReturnValue({ state: 'loading' })
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('六位顶级投资人怎么看周期')
    expect(screen.getByText(new RegExp(TOP_CRITERIA))).toBeTruthy()
    expect(screen.getByText(new RegExp(TOP_MASTERS_SORT_NOTE))).toBeTruthy()
    expect(screen.getByRole('link', { name: '查看九位完整版' }).getAttribute('href'))
      .toBe('/invest/macro-masters')

    const details = screen.getByText('为什么去掉三位').closest('details')!
    expect(details.open).toBe(false)
    fireEvent.click(within(details).getByText('为什么去掉三位'))
    expect(within(details).getByText(/马丁·茨威格/)).toBeTruthy()
    expect(within(details).getByText(/杰里米·格兰瑟姆/)).toBeTruthy()
    expect(within(details).getByText(/安德烈·科斯托拉尼/)).toBeTruthy()
  })

  it('加载中：综合结论卡在、一览有加载提示', () => {
    mockedUse.mockReturnValue({ state: 'loading' })
    renderPage()
    expect(screen.getByRole('heading', { name: '本站宏观攻守结论' })).toBeTruthy()
    expect(screen.getByText(/大师读数加载中/)).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '页内导航' })).toBeTruthy()
  })

  it('读数失败：降级提示，仍有综合结论与各人静态内容', () => {
    mockedUse.mockReturnValue({ state: 'error', message: '网络中断' })
    renderPage()
    expect(screen.getByRole('alert').textContent).toContain('大师读数加载失败（网络中断）')
    expect(screen.getByRole('heading', { name: '本站宏观攻守结论' })).toBeTruthy()
    expect(screen.queryByTestId('tm-consensus')).toBeNull()
    expect(screen.getByText(TOP_MASTERS_FIXTURE[0].record.summary)).toBeTruthy()
    expect(screen.getByText(TOP_MASTERS_FIXTURE[0].cycleView)).toBeTruthy()
  })

  it('六位按 rank 排序，共识汇总与详情链接正确', () => {
    mockOk()
    renderPage()
    const ordered = sortTopMasters(TOP_MASTERS_FIXTURE)
    const view = buildCycleView(fixtureReadings)
    const takes = ordered.flatMap(m => {
      const take = view.masters.find(t => t.slug === m.slug)
      return take ? [take] : []
    })
    expect(screen.getByTestId('tm-consensus').textContent).toBe(consensusSummary(takes))

    const glance = screen.getByRole('list', { name: '六位一览' })
    const rows = within(glance).getAllByRole('listitem')
    expect(rows).toHaveLength(6)
    ordered.forEach((master, index) => {
      const name = masterBySlug(master.slug)!.name
      expect(within(rows[index]).getByText(name)).toBeTruthy()
      expect(within(rows[index]).getByText(master.role)).toBeTruthy()
      expect(within(rows[index]).getByLabelText(`第 ${master.rank} 名`).textContent).toBe(String(master.rank))
    })

    // rule：都铎给档位；checklist：德鲁肯给计数条
    expect(within(rows[3]).getByText(/档位：/)).toBeTruthy()
    expect(within(rows[0]).getByLabelText('读数计数').textContent).toMatch(/谨慎 \d+ · 中性 \d+ · 积极 \d+/)

    for (const master of ordered) {
      const name = masterBySlug(master.slug)!.name
      const link = screen.getByRole('link', { name: `查看 ${name} 的完整方法` })
      expect(link.getAttribute('href')).toBe(`/invest/macro-masters/${master.slug}`)
    }

    expect(screen.getByRole('link', { name: '宏观攻守的候选指标检验' }).getAttribute('href'))
      .toBe('/invest/macro-posture#mp-candidates')
    expect(screen.getByText(TOP_MASTERS_DISCLAIMER)).toBeTruthy()
    const roles = screen.getByRole('heading', { name: '六位的分工小结' }).closest('section')!
    expect(roles.textContent).toContain('流动性：看斯坦利·德鲁肯米勒、瑞·达利欧')
    expect(roles.textContent).toContain('选股：看约翰·邓普顿爵士')
  })

  it('空 TOP_MASTERS：降级提示，无锚点导航与个人节', () => {
    resetTopMasters([])
    mockOk()
    renderPage()
    expect(screen.getByText(/精选六位名单整理中/)).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: '页内导航' })).toBeNull()
    expect(screen.queryByRole('list', { name: '六位一览' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '斯坦利·德鲁肯米勒' })).toBeNull()
    expect(screen.getByRole('link', { name: '查看九位完整版' })).toBeTruthy()
    expect(screen.getByText(TOP_MASTERS_DISCLAIMER)).toBeTruthy()
  })
})
