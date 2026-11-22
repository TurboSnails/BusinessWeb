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
  it('渲染 4 张参考组合卡', () => {
    render(<ReferencePortfolios index={fixtureIndex()} applied={null} onLoad={vi.fn()} />)
    expect(screen.getByText('研究参考组合')).toBeTruthy()
    expect(screen.getByText(/事后挑选的参考组合/)).toBeTruthy()
    expect(screen.getByText('首选')).toBeTruthy()
    expect(screen.getByText('Meta 换苹果')).toBeTruthy()
    expect(screen.getByText('省心')).toBeTruthy()
    expect(screen.getByText('六只分散')).toBeTruthy()
    expect(screen.getByText('回撤最小')).toBeTruthy()
    expect(screen.getByText('拼多多替换 SoFi')).toBeTruthy()
    expect(screen.getByText('对照')).toBeTruthy()
    expect(screen.getByText('现组合')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '载入并计算' })).toHaveLength(4)
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
