import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REFERENCE_PRESETS,
  REFERENCE_RULE,
  ReferencePortfolios,
  matchesReferencePreset,
} from './ReferencePortfolios'
import type { PriceIndex, RunInput } from '../types'
import { createDefaultInput } from '../urlState'
import indexFixture from '../__fixtures__/index.json'

afterEach(() => cleanup())

function fixtureIndex(extra?: Partial<PriceIndex['items'][number]>[]): PriceIndex {
  const index = JSON.parse(JSON.stringify(indexFixture)) as PriceIndex
  if (extra) index.items.push(...extra.map(item => ({
    symbol: 'X',
    name: 'X',
    group: 'growth' as const,
    first: '2010-01-04',
    last: '2026-11-20',
    asOf: '2026-11-20',
    status: 'ok' as const,
    dividendStatus: 'ok' as const,
    ...item,
  })))
  return index
}

describe('ReferencePortfolios', () => {
  it('渲染 4 张去推荐化参考组合卡', () => {
    const { container } = render(<ReferencePortfolios index={fixtureIndex()} applied={null} onLoad={vi.fn()} />)
    expect(screen.getByText('研究参考组合')).toBeTruthy()
    expect(screen.getByText('事后挑选的历史测试组合，用来对照，不是推荐或买卖建议。')).toBeTruthy()
    expect(screen.getByText('各项较均衡')).toBeTruthy()
    expect(screen.getByText('Meta 换苹果')).toBeTruthy()
    expect(screen.getByText('更分散')).toBeTruthy()
    expect(screen.getByText('六只分散')).toBeTruthy()
    expect(screen.getByText('回撤最浅')).toBeTruthy()
    expect(screen.getByText('拼多多替换 SoFi')).toBeTruthy()
    expect(screen.getByText('对照')).toBeTruthy()
    expect(screen.getByText('现组合')).toBeTruthy()
    expect(screen.getAllByText(/研究时（截至 2026-11-20）每年调一次年化/)).toHaveLength(4)
    expect(screen.getByText(/拼多多有中概股政策与退市风险/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/首选|省心|回撤最小|没有明显短板/)
    expect(screen.getAllByRole('button', { name: '载入并计算' })).toHaveLength(4)
  })

  it('研究观察默认收起，展开后显示 6 条限定样本的观察', () => {
    const { container } = render(<ReferencePortfolios index={fixtureIndex()} applied={null} onLoad={vi.fn()} />)
    const research = container.querySelector('.pr-research') as HTMLDetailsElement
    expect(research.open).toBe(false)
    expect(screen.getByText('本页研究观察（特定历史样本，不是通用结论）')).toBeTruthy()
    fireEvent.click(research.querySelector('summary')!)
    expect(research.open).toBe(true)
    expect(research.querySelectorAll('ol > li')).toHaveLength(6)
    expect(screen.getByText(/13,432 个组合样本内 100% 年化更高，中位差 \+4.5 个百分点/)).toBeTruthy()
    expect(screen.getByText(/14,558 个组合为 97.1%，中位差 \+3.1 个百分点/)).toBeTruthy()
    expect(screen.getByText(/7,290 个组合为 59.1%，中位差 \+0.5 个百分点/)).toBeTruthy()
    expect(screen.getByText(/6,188 个大师股五只等权组合/)).toBeTruthy()
  })

  it('点击后 onLoad 收到正确 symbols/weights/rule', () => {
    const onLoad = vi.fn()
    render(<ReferencePortfolios index={fixtureIndex()} applied={null} onLoad={onLoad} />)
    fireEvent.click(screen.getAllByRole('button', { name: '载入并计算' })[0])
    expect(onLoad).toHaveBeenCalledTimes(1)
    const preset = onLoad.mock.calls[0][0]
    expect(preset.symbols).toEqual(['AVGO', 'AAPL', 'CB', 'SOFI', 'RKLB'])
    expect(preset.weights).toEqual([0.25, 0.25, 0.25, 0.125, 0.125])
    expect(REFERENCE_RULE).toEqual({ kind: 'calendar', every: 'year' })
    expect(REFERENCE_PRESETS[0].id).toBe(preset.id)
  })

  it('缺代码时禁用并写明数据暂缺', () => {
    const index = fixtureIndex()
    index.items = index.items.filter(item => item.symbol !== 'AAPL')
    render(<ReferencePortfolios index={index} applied={null} onLoad={vi.fn()} />)
    const preferred = screen.getByText('Meta 换苹果').closest('article')
    expect(preferred?.textContent).toContain('数据暂缺')
    const button = preferred?.querySelector('button')
    expect(button).toBeTruthy()
    expect(button).toHaveProperty('disabled', true)
    const baseline = screen.getByText('现组合').closest('article')
    expect(baseline?.querySelector('button')).toHaveProperty('disabled', false)
  })

  it('已应用组合与卡完全相同时显示已载入并禁用', () => {
    const applied: RunInput = {
      ...createDefaultInput(),
      symbols: REFERENCE_PRESETS[0].symbols,
      weights: REFERENCE_PRESETS[0].weights,
      rule: REFERENCE_RULE,
      switch: undefined,
    }
    expect(matchesReferencePreset(applied, REFERENCE_PRESETS[0])).toBe(true)
    render(<ReferencePortfolios index={fixtureIndex()} applied={applied} onLoad={vi.fn()} />)
    const preferred = screen.getByText('Meta 换苹果').closest('article')
    const button = preferred?.querySelector('button')
    expect(button?.textContent).toBe('已载入')
    expect(button).toHaveProperty('disabled', true)
  })
})
