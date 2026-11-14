import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PriceLevels from './PriceLevels'
import { buildPriceLevels, parseLevelPrice, type PriceLevelsInput } from './levelsModel'

const scen = (bear: string, base: string, bull: string) => [{ name: '悲观', price: bear }, { name: '基准', price: base }, { name: '乐观', price: bull }]
const renderLevels = (input: PriceLevelsInput) => render(<MemoryRouter><PriceLevels input={input} scenariosHref="#company-scenarios" /></MemoryRouter>)

describe('parseLevelPrice', () => {
  it('读出单一价格、币种和口径备注', () => {
    expect(parseLevelPrice('$142')).toEqual({ value: 142, currency: 'USD', note: undefined })
    expect(parseLevelPrice('73.04 元（估值初稿）')).toEqual({ value: 73.04, currency: 'CNY', note: '估值初稿' })
    expect(parseLevelPrice('HK$50.07（敏感性草案）')).toEqual({ value: 50.07, currency: 'HKD', note: '敏感性草案' })
    expect(parseLevelPrice('1,850')).toEqual({ value: 1850, currency: null, note: undefined })
  })
  it('缺失与多币种不读', () => {
    expect(parseLevelPrice('[MISSING]（未认证）')).toBeNull()
    expect(parseLevelPrice('A 111.99 元 / H HK$60.9')).toBe('ambiguous')
  })
})

describe('PriceLevels 状态', () => {
  it('有情景价：画刻度并显示距现价（美股绿涨红跌）', () => {
    renderLevels({ market: 'us', anchor: { price: 200, date: '2026-11-13', days: 1, stale: false, currency: 'USD' }, scenarios: scen('$150', '$230', '$300') })
    const fig = screen.getByRole('figure')
    expect(fig?.textContent).toContain('价格锚点 200（2026-11-13）')
    const base = within(fig).getByText('基准情景').closest('div')!
    expect(base?.textContent).toContain('230 USD')
    const up = within(base).getByText('距现价 +15.0%')
    expect(up.classList.contains('cc-tone-green')).toBe(true)
    expect(within(within(fig).getByText('悲观情景').closest('div')!).getByText('距现价 −25.0%').classList.contains('cc-tone-red')).toBe(true)
    expect(screen.getByRole('link', { name: '核对三情景假设 →' }).getAttribute('href')).toBe('#company-scenarios')
    expect(fig).toMatchSnapshot()
  })

  it('沪深红涨绿跌', () => {
    renderLevels({ market: 'cn', anchor: { price: 10, currency: 'CNY' }, scenarios: scen('8 元', '12 元', '15 元') })
    expect(screen.getByText('距现价 +20.0%').classList.contains('cc-tone-red')).toBe(true)
    expect(screen.getByText('距现价 −20.0%').classList.contains('cc-tone-green')).toBe(true)
  })

  it('没有情景价：空状态，不画默认值', () => {
    const { container } = renderLevels({ market: 'hk', anchor: { price: 400, currency: 'HKD', date: '2026-11-13' }, scenarios: scen('[MISSING]（撤回旧情景价格）', '[MISSING]', '[MISSING]') })
    expect(screen.getByText(/本公司还没有三情景价或 DCF 价位/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '研究标准' }).getAttribute('href')).toBe('/research-notes?tab=method')
    expect(container.querySelector('.cc-scale')).toBeNull()
    expect(container.firstChild).toMatchSnapshot()
  })

  it('价格锚点过期：百分比变灰并写明按旧价算', () => {
    const { container } = renderLevels({ market: 'us', anchor: { price: 100, date: '2026-10-01', days: 44, stale: true, currency: 'USD' }, scenarios: scen('$80', '$120', '$150') })
    expect(screen.getByText('价格锚点 44 天前，百分比按旧价算')).toBeTruthy()
    expect(screen.getByText('距现价 +20.0%').classList.contains('is-stale')).toBe(true)
    expect(screen.getByText('距现价 +20.0%').classList.contains('cc-tone-green')).toBe(false)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('币种不一致：不比较、不上刻度', () => {
    const { container } = renderLevels({
      market: 'hk', anchor: { price: 50, currency: 'HKD' },
      scenarios: scen('40 元', 'HK$60', 'HK$70'),
      dcf: { price: 9, mos: null, source: 'auto', buyBelow: 7, status: 'ok', currency: 'USD' },
    })
    const bear = screen.getByText('悲观情景').closest('div')!
    expect(bear?.textContent).toContain('币种不同（人民币 vs 价格锚点港元），不比较')
    expect(bear.textContent).not.toContain('距现价')
    expect(screen.getByText('自动 DCF买入参考价').closest('div')?.textContent).toContain('币种不同（美元 vs 价格锚点港元）')
    expect(container.querySelector('.cc-scale__mark--bear')).toBeNull()
    expect(container.querySelector('.cc-scale__mark--base')).not.toBeNull()
    expect(container.firstChild).toMatchSnapshot()
  })
})

describe('buildPriceLevels', () => {
  it('相差 10 倍以上视为口径不同', () => {
    const m = buildPriceLevels({ market: 'cn', anchor: { price: 10 }, scenarios: scen('500 元', '12 元', '15 元') })
    expect(m.levels.find(l => l.key === 'bear')).toMatchObject({ comparable: false, reason: expect.stringContaining('10 倍') })
  })
  it('只有 DCF：只画 DCF 刻度，不补情景价', () => {
    const m = buildPriceLevels({ market: 'us', anchor: { price: 100, currency: 'USD' }, dcf: { price: 130, mos: 0.3, source: 'auto', buyBelow: 95, status: 'ok', credibility: 'medium', currency: 'USD' } })
    expect(m.levels.map(l => l.key)).toEqual(['dcf-buy', 'dcf-fair'])
    expect(m.levels[0]).toMatchObject({ note: '可信度中', change: expect.closeTo(-0.05, 5) })
  })
  it('自动 DCF 未跑通时不取价', () => {
    const m = buildPriceLevels({ market: 'us', anchor: { price: 100 }, dcf: { price: 130, mos: null, source: 'auto', buyBelow: 90, status: 'financial', currency: 'USD' } })
    expect(m.state).toBe('empty')
  })
  it('缺价格锚点：保留价位，不算距现价', () => {
    const m = buildPriceLevels({ market: 'us', anchor: {}, scenarios: scen('$1', '$2', '$3') })
    expect(m.anchor).toBeNull()
    expect(m.levels.every(l => l.change === undefined)).toBe(true)
    expect(m.scale).toEqual({ min: 1, max: 3 })
  })
  it('多币种情景价列入 skipped', () => {
    const m = buildPriceLevels({ market: 'cn', anchor: { price: 100 }, scenarios: scen('A 111.99 元 / H HK$60.9', '120 元', '130 元') })
    expect(m.skipped).toEqual(['悲观情景：A 111.99 元 / H HK$60.9'])
  })
})
