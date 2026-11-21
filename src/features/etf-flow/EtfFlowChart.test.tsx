import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import { EtfFlowView } from '../../pages/EtfFlowLab'
import { EtfFlowChart } from './EtfFlowChart'
import { asEtfFlow } from './model'

it('recomputes legacy KPIs and leaves missing observations visible when switching scope', () => {
  const data = asEtfFlow({
    series: [
      { date: '2026-11-13', flow_all: 1, flow_broad: -1, index: 3000 },
      { date: '2026-11-16', flow_all: 0, flow_broad: 0, index: null },
      { date: '2026-11-17', flow_all: 2, flow_broad: null, index: 3020 },
    ],
    kpi: { broad: { yesterday: 0, cum60: 999 } },
  })
  const { container } = render(<MemoryRouter><EtfFlowView data={data} /></MemoryRouter>)
  expect(screen.getByText('+2.00', { selector: '.ui-stat__value' })).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: '宽基' }))
  expect(screen.getByText(/有效 2\/60 日/)).toBeTruthy()
  expect(screen.getAllByText('暂无数据')).toHaveLength(2)
  const chart = screen.getByRole('img', { name: '宽基 ETF 净流入与上证指数' })
  expect(chart.querySelectorAll('.etf-flow__bar')).toHaveLength(1)
  expect(container.querySelectorAll('.etf-flow__ov .etf-flow__bar')).toHaveLength(1)
  expect(chart.querySelector('path')?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
})

it('opens on the KPI window and can show the complete series', () => {
  const series = Array.from({ length: 70 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
    flow_all: 1, flow_broad: 0, index: null,
  }))
  const { container } = render(<EtfFlowChart series={series} scope="all" />)
  expect(container.querySelectorAll('.etf-flow__chart .etf-flow__bar')).toHaveLength(60)
  fireEvent.click(screen.getByRole('button', { name: '全部历史' }))
  expect(container.querySelectorAll('.etf-flow__chart .etf-flow__bar')).toHaveLength(70)
})
