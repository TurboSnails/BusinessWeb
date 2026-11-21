import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CompanyDetailHeader from './CompanyDetailHeader'
import type { CompanyValuation } from '../../features/company-valuation/model'

afterEach(cleanup)

const base = {
  market: 'us' as const,
  name: '苹果',
  code: 'AAPL',
  sector: '信息技术',
  batch: '测试',
  rating: '条件关注',
  ratingTone: 'blue',
  isCandidate: false,
  onToggleCandidate: vi.fn(),
  valuationHref: '/valuation',
  dcfHref: '/dcf',
  notesHref: '/notes',
  back: <a href="/research-notes">返回</a>,
}

const valuation = {
  key: 'us:AAPL',
  market: 'us',
  code: 'AAPL',
  name: '苹果',
  currency: 'USD',
  asOf: '2026-09-21',
  status: 'conditional',
  price: { value: 342.56, date: '2026-11-20', currency: 'USD', source: 's1' },
  value: { low: 280, base: 348.9, high: 420, kind: 'undated', date: null, primaryMethod: 'PE' },
  methods: [
    {
      name: 'PE', applicable: true, reason: 'x', formula: '',
      inputs: { epsForward: 10.57273, epsTrailingTwelveMonths: 8.98 },
      values: [280, 348.9, 420], sourceIds: [],
    },
  ],
  quality: 'q',
  pricing: 'p',
  expectations: 'e',
  risk: 'r',
  assumptions: [],
  missing: [],
  sources: [],
  review: { mode: 'programmatic', by: 'x', note: 'n' },
} as unknown as CompanyValuation

describe('CompanyDetailHeader', () => {
  it('无估值时用原研究情景：折溢价与刻度同一基准', () => {
    render(
      <MemoryRouter>
        <CompanyDetailHeader
          {...base}
          price={342.56}
          currency="USD"
          scenarios={[
            { name: '悲观', price: '$215' },
            { name: '基准', price: '$317' },
            { name: '乐观', price: '$400' },
          ]}
          metaDates={{ researchAsOf: '2026-09-18', priceDate: '2026-11-20', priceAgeDays: 1 }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/情景价位 · 原研究情景（原研究日期 2026-09-18）/)).toBeTruthy()
    expect(screen.getByText(/模型假设，不是目标价/)).toBeTruthy()
    // 342.56/317 − 1 ≈ +8.1%
    expect(screen.getByText(/现价高于基准情景价/)).toBeTruthy()
    const bar = screen.getByRole('img', { name: /情景|现价/ })
    expect(bar.getAttribute('data-source')).toBe('research')
    expect(bar.getAttribute('data-base')).toBe('317')
    const prem = screen.getByText(/现价高于基准情景价/).closest('.cd-premium')!
    expect(prem.getAttribute('data-source')).toBe('research')
    expect(prem.getAttribute('data-base')).toBe('317')
    expect(screen.getByText('$317')).toBeTruthy()
    expect(screen.queryByText('$348.9')).toBeNull()
    expect(bar.querySelector('svg')).toBeNull()
    expect(bar.querySelectorAll('.cd-scenarios__amt').length).toBe(3)
  })

  it('有综合估值时折溢价与刻度都用估值基准，不混用研究情景', () => {
    render(
      <MemoryRouter>
        <CompanyDetailHeader
          {...base}
          price={342.56}
          currency="USD"
          valuation={valuation}
          marketRefresh={{
            price: 342.56,
            priceDate: '2026-11-20',
            currency: 'USD',
            checkedAt: '2026-11-21T00:00:00Z',
            source: 'test',
            originalAsOf: '2026-09-18',
            tradability: 'no-known-restriction',
          }}
          scenarios={[
            { name: '悲观', price: '$215' },
            { name: '基准', price: '$317' },
            { name: '乐观', price: '$400' },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/情景价位 · 综合估值（条件初稿，方法 PE，2026-09-21）/)).toBeTruthy()
    // 342.56/348.9 − 1 ≈ −1.8%
    expect(screen.getByText('现价低于基准情景价 1.8%')).toBeTruthy()
    const bar = screen.getByRole('img', { name: /现价/ })
    expect(bar.getAttribute('data-source')).toBe('valuation')
    expect(bar.getAttribute('data-base')).toBe('348.9')
    const prem = screen.getByText('现价低于基准情景价 1.8%').closest('.cd-premium')!
    expect(prem.getAttribute('data-source')).toBe('valuation')
    expect(prem.getAttribute('data-base')).toBe('348.9')
    // 刻度展示估值三档，不展示研究 317
    expect(screen.getByText('$348.9')).toBeTruthy()
    expect(screen.getByText('$280')).toBeTruthy()
    expect(screen.getByText('$420')).toBeTruthy()
    expect(screen.queryByText('$317')).toBeNull()
    expect(screen.queryByText('$215')).toBeNull()
  })

  it('折溢价用正文色，不用涨跌 data-sign', () => {
    render(
      <MemoryRouter>
        <CompanyDetailHeader
          {...base}
          price={400}
          scenarios={[
            { name: '悲观', price: '200' },
            { name: '基准', price: '300' },
            { name: '乐观', price: '500' },
          ]}
        />
      </MemoryRouter>,
    )
    const prem = screen.getByText(/现价高于基准情景价/).closest('.cd-premium')!
    expect(prem.getAttribute('data-sign')).toBeNull()
    expect(prem.getAttribute('data-market')).toBeNull()
  })

  it('现价在区间外时标注高于乐观价，HTML 轨道无 SVG', () => {
    render(
      <MemoryRouter>
        <CompanyDetailHeader
          {...base}
          price={500}
          scenarios={[
            { name: '悲观', price: '200' },
            { name: '基准', price: '300' },
            { name: '乐观', price: '400' },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getAllByText(/高于乐观价/).length).toBeGreaterThan(0)
    const bar = screen.getByRole('img', { name: /高于乐观价/ })
    expect(bar.querySelector('svg')).toBeNull()
    expect(bar.querySelector('.cd-scenarios__price-dot')).toBeTruthy()
  })

  it('现价靠近/超出轨道两端时标签 data-align 避免居中裁切', () => {
    const { rerender } = render(
      <MemoryRouter>
        <CompanyDetailHeader
          {...base}
          price={100}
          scenarios={[
            { name: '悲观', price: '200' },
            { name: '基准', price: '300' },
            { name: '乐观', price: '400' },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('现价 100').closest('.cd-scenarios__price')?.getAttribute('data-align')).toBe('start')

    rerender(
      <MemoryRouter>
        <CompanyDetailHeader
          {...base}
          price={500}
          scenarios={[
            { name: '悲观', price: '200' },
            { name: '基准', price: '300' },
            { name: '乐观', price: '400' },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('现价 500').closest('.cd-scenarios__price')?.getAttribute('data-align')).toBe('end')

    rerender(
      <MemoryRouter>
        <CompanyDetailHeader
          {...base}
          price={300}
          scenarios={[
            { name: '悲观', price: '200' },
            { name: '基准', price: '300' },
            { name: '乐观', price: '400' },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('现价 300').closest('.cd-scenarios__price')?.getAttribute('data-align')).toBe('center')
  })

  it('缺情景时显示未取得且不画轨道', () => {
    render(
      <MemoryRouter>
        <CompanyDetailHeader {...base} price={100} currency="CNY" scenarios={[]} />
      </MemoryRouter>,
    )
    expect(screen.getAllByText('未取得').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(/无可绘制数值/)).toBeTruthy()
    expect(screen.queryByRole('img')?.querySelector('.cd-scenarios__rail')).toBeNull()
  })

  it('综合估值不可信：无折溢价文字、无刻度条，卡片写综合估值待核', () => {
    const unreliable = {
      ...valuation,
      code: 'NVDA',
      name: '英伟达',
      price: { value: 125.53, date: '2026-11-20', currency: 'USD', source: 's1' },
      value: { low: 332.11, base: 464.95, high: 531.37, kind: 'undated', date: null, primaryMethod: 'PE' },
      methods: [
        {
          name: 'PE', applicable: true, reason: 'x', formula: '',
          inputs: { epsForward: 16.60528, epsTrailingTwelveMonths: 9.31 },
          values: [332.11, 464.95, 531.37], sourceIds: [],
        },
      ],
    } as unknown as CompanyValuation
    render(
      <MemoryRouter>
        <CompanyDetailHeader
          {...base}
          name="英伟达"
          code="NVDA"
          price={125.53}
          currency="USD"
          valuation={unreliable}
          scenarios={[
            { name: '悲观', price: '$50' },
            { name: '基准', price: '$80' },
            { name: '乐观', price: '$120' },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/情景价位 · 综合估值待核/)).toBeTruthy()
    expect(screen.queryByText(/现价高于基准情景价|现价低于基准情景价|现价接近基准情景价/)).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(document.querySelector('.cd-scenarios__rail')).toBeNull()
    expect(screen.getByText(/现价与基准相差过大/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '查看推导' }).getAttribute('href')).toBe('#company-valuation')
    expect(screen.queryByText('$80')).toBeNull()
    expect(screen.getByText(/\$464\.95/)).toBeTruthy()
  })
})
