import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CompanyValuationCell, CompanyValuationDetail } from './CompanyValuation'
import { exampleValuation } from './testFixture'
import type { Company } from '../../data/companies'
const company: Company = { market: 'us', code: 'TEST', name: '测试公司', sector: '软件', batch: '测试', rating: '观察', headline: '旧研究结论', metrics: [], thesis: [], risk: [], next: [], asOf: '2026-10-21' }

it('列表显示条件区间、现价和空间，不覆盖研究评级，详情展示推导及来源', () => {
  const c = { ...company, valuation: exampleValuation() }
  render(<MemoryRouter><CompanyValuationCell company={c} /><CompanyValuationDetail company={c} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: /估值 TEST/ }).getAttribute('href')).toContain('#company-valuation')
  expect(screen.getAllByText(/90.*120/).length).toBeGreaterThan(0)
  expect(screen.getByText('EPS 5 × PE 18/20/24')).toBeTruthy()
  expect(screen.getByRole('link', { name: '测试来源' }).getAttribute('href')).toBe('https://example.com/test')
  expect(screen.getByText(/研究评级仍沿用原研究/)).toBeTruthy()
})

it('未取得估值时显示等待数据，不回退到旧DCF冒充综合估值', () => {
  render(<MemoryRouter><CompanyValuationCell company={company} /></MemoryRouter>)
  expect(screen.getByText('等待估值数据')).toBeTruthy()
  expect(screen.queryByText(/DCF/)).toBeNull()
})

it.each([
  [80, '低估 20.0%', 'is-under'],
  [120, '高估 20.0%', 'is-over'],
  [100, '接近基准', 'is-fair'],
])('用基准价值作分母，突出价格%s对应的高低估判断', (price, label, tone) => {
  const valuation = exampleValuation()
  valuation.price.value = price
  render(<MemoryRouter><CompanyValuationCell company={{ ...company, valuation }} /></MemoryRouter>)
  const link = screen.getByRole('link', { name: /估值 TEST/ })
  expect(screen.getByText(label, { exact: false })).toBeTruthy()
  expect(link.classList.contains(tone)).toBe(true)
  expect(link.textContent).not.toContain('90–120')
  expect(link.textContent).not.toContain('条件初稿')
})

it('缺少价格时不产生高低估判断', () => {
  const valuation = exampleValuation()
  valuation.price.value = null
  render(<MemoryRouter><CompanyValuationCell company={{ ...company, valuation }} /></MemoryRouter>)
  expect(screen.getByText('缺少现价')).toBeTruthy()
  expect(screen.queryByText(/低估|高估/)).toBeNull()
})

it('undated未定期限：显示“情景偏低/偏高 XX% · 区间”，区间内弱色，区间外强色', () => {
  const valuation = exampleValuation()
  valuation.value = { ...valuation.value!, kind: 'undated', low: 90, base: 100, high: 120, date: null }

  // 区间内 (price=95, -5%): 情景偏低 5.0% · 区间内, is-under is-muted
  const { rerender } = render(<MemoryRouter><CompanyValuationCell company={{ ...company, valuation: { ...valuation, price: { ...valuation.price, value: 95 } } }} /></MemoryRouter>)
  const linkWithin = screen.getByRole('link', { name: /估值 TEST/ })
  expect(linkWithin.textContent).toContain('情景偏低 5.0% · 区间内')
  expect(linkWithin.classList.contains('is-under')).toBe(true)
  expect(linkWithin.classList.contains('is-muted')).toBe(true)
  expect(linkWithin.classList.contains('is-strong')).toBe(false)

  // 低于区间 (price=80, -20%): 情景偏低 20.0% · 低于区间, is-under is-strong
  rerender(<MemoryRouter><CompanyValuationCell company={{ ...company, valuation: { ...valuation, price: { ...valuation.price, value: 80 } } }} /></MemoryRouter>)
  const linkBelow = screen.getByRole('link', { name: /估值 TEST/ })
  expect(linkBelow.textContent).toContain('情景偏低 20.0% · 低于区间')
  expect(linkBelow.classList.contains('is-under')).toBe(true)
  expect(linkBelow.classList.contains('is-strong')).toBe(true)

  // 高于区间 (price=130, +30%): 情景偏高 30.0% · 高于区间, is-over is-strong
  rerender(<MemoryRouter><CompanyValuationCell company={{ ...company, valuation: { ...valuation, price: { ...valuation.price, value: 130 } } }} /></MemoryRouter>)
  const linkAbove = screen.getByRole('link', { name: /估值 TEST/ })
  expect(linkAbove.textContent).toContain('情景偏高 30.0% · 高于区间')
  expect(linkAbove.classList.contains('is-over')).toBe(true)
  expect(linkAbove.classList.contains('is-strong')).toBe(true)
})

it('future未来情景：明确目标日期与相对现价空间，不称今日低估', () => {
  const valuation = exampleValuation()
  valuation.value = { ...valuation.value!, kind: 'future', date: '2027-12-31', base: 100 }
  valuation.price.value = 80
  render(<MemoryRouter><CompanyValuationCell company={{ ...company, valuation }} /></MemoryRouter>)
  const link = screen.getByRole('link', { name: /估值 TEST/ })
  expect(link.textContent).toContain('2027-12-31情景目标 相对现价空间 +25.0%')
  expect(link.textContent).not.toMatch(/今日低估|低估|高估/)
  expect(link.classList.contains('is-fair')).toBe(true)
  expect(link.classList.contains('is-muted')).toBe(true)
})

it('insufficient证据不足：显示简短待核原因，title保留完整缺失证据', () => {
  const valuation = exampleValuation()
  valuation.status = 'insufficient'
  valuation.value = null
  valuation.missing = ['PE主锚未计值：研究倍数缺失', '未取得有效现金流预测']
  render(<MemoryRouter><CompanyValuationCell company={{ ...company, valuation }} /></MemoryRouter>)
  const link = screen.getByRole('link', { name: /估值 TEST/ })
  expect(link.textContent).toContain('等待证据')
  expect(link.textContent).toContain('研究倍数待核')
  expect(link.getAttribute('title')).toContain('PE主锚未计值：研究倍数缺失；未取得有效现金流预测')
  expect(link.classList.contains('is-waiting')).toBe(true)
  expect(link.classList.contains('is-muted')).toBe(true)
})

it('零基准base 0安全处理，显示基准不可比且无NaN/Infinity', () => {
  const valuation = exampleValuation()
  valuation.value = { ...valuation.value!, low: 0, base: 0, high: 0 }
  valuation.price.value = 50
  render(<MemoryRouter><CompanyValuationCell company={{ ...company, valuation }} /></MemoryRouter>)
  const link = screen.getByRole('link', { name: /估值 TEST/ })
  expect(link.textContent).toContain('基准不可比')
  expect(link.textContent).not.toMatch(/NaN|Infinity/)
  expect(link.classList.contains('is-waiting')).toBe(true)
})

it('详情脚注准确说明分母区别、情景含义及待核事项', () => {
  const c = { ...company, valuation: exampleValuation() }
  render(<MemoryRouter><CompanyValuationDetail company={c} /></MemoryRouter>)
  const footnote = screen.getByText(/两者分母不同/)
  expect(footnote.textContent).toContain('基准价')
  expect(footnote.textContent).toContain('现价')
  expect(footnote.textContent).toMatch(/弱色.*强色/)
})
