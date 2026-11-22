import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ReadingCell from './ReadingCell'
import type { Reading } from './types'

const reading: Reading = {
  key: 'tenYear',
  label: '10 年期美债收益率',
  value: 5.04,
  unit: '%',
  date: '2026-11-19',
  percentile: 82.35,
  percentileYears: 10,
  direction: 'up',
  stale: true,
  source: 'https://fred.stlouisfed.org/series/DGS10',
}

afterEach(cleanup)

describe('ReadingCell', () => {
  it('第一行指标名；第二行数值单位、日期、历史位置、方向用间隔号连接', () => {
    const { container } = render(<ReadingCell reading={reading} />)
    expect(screen.getByText('10 年期美债收益率')).toBeTruthy()
    expect(container.querySelector('.mm-reading__value')?.textContent?.replace(/\s/g, '')).toBe('5.04%')
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-19')
    expect(screen.getByText('近 10 年第 82.35 百分位')).toBeTruthy()
    expect(screen.getByText('上升')).toBeTruthy()
    expect(container.querySelectorAll('.mm-reading__sep').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('div.mm-reading')).toBeTruthy()
    expect(container.querySelector('div.mm-reading > details')).toBeTruthy()
  })

  it('用 percentileYears 显示近 N 年；长历史分位与近十年可并存', () => {
    const { rerender } = render(<ReadingCell reading={{ ...reading, percentileYears: 6.5, stale: false }} />)
    expect(screen.getByText('近 6.5 年第 82.35 百分位')).toBeTruthy()
    rerender(<ReadingCell reading={{
      ...reading,
      stale: false,
      longPercentile: 96,
      longPercentileSince: 1900,
      percentile: 49,
      percentileYears: 10,
    }} />)
    expect(screen.getByText('1900 年以来第 96 百分位')).toBeTruthy()
    expect(screen.getByText('近 10 年第 49 百分位')).toBeTruthy()
  })

  it('stale / refreshFailed 用标签；口径与来源收进折叠；单位中文化', () => {
    const { container } = render(<ReadingCell reading={{
      ...reading,
      key: 'hySpread',
      label: '高收益债利差',
      value: 352,
      unit: 'bp',
      refreshFailed: true,
      note: '公开数据约滞后三个月',
    }} />)
    expect(screen.getByText('已过期')).toBeTruthy()
    expect(screen.getByText('上次更新失败')).toBeTruthy()
    expect(screen.getByText('口径与来源')).toBeTruthy()
    expect(screen.getByText('公开数据约滞后三个月')).toBeTruthy()
    expect(container.querySelector('.mm-reading__value')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('352 个基点')
    expect(screen.getByText('圣路易斯联储 FRED')).toBeTruthy()
  })

  it('十亿美元大额改万亿；铜金比单位进折叠', () => {
    const { rerender, container } = render(<ReadingCell reading={{
      ...reading,
      key: 'netLiquidity',
      label: '净流动性',
      value: 5824.5,
      unit: '十亿美元',
      stale: false,
      percentile: undefined,
      direction: undefined,
    }} />)
    expect(container.querySelector('.mm-reading__value')?.textContent).toContain('5.82')
    expect(container.querySelector('.mm-reading__value')?.textContent).toContain('万亿美元')
    rerender(<ReadingCell reading={{
      ...reading,
      key: 'copperGold',
      label: '铜金比',
      value: 0.12,
      unit: '铜（美元/磅）÷ 金（美元/盎司）',
      stale: false,
      percentile: undefined,
      direction: undefined,
    }} />)
    expect(container.querySelector('.mm-reading__value')?.textContent).toBe('0.12')
    expect(screen.getByText('单位：铜（美元/磅）÷ 金（美元/盎司）')).toBeTruthy()
  })

  it('支持下降和持平，并省略未提供的字段', () => {
    const { rerender } = render(
      <ReadingCell reading={{ ...reading, direction: 'down', percentile: undefined, stale: false }} />,
    )
    expect(screen.getByText('下降')).toBeTruthy()
    expect(screen.queryByText(/年 /)).toBeNull()
    expect(screen.queryByText('已过期')).toBeNull()
    rerender(<ReadingCell reading={{ ...reading, direction: 'flat', stale: false }} />)
    expect(screen.getByText('持平')).toBeTruthy()
  })

  it('季频方向写较上季；月频日期到月', () => {
    render(<ReadingCell reading={{
      ...reading,
      stale: false,
      frequency: 'quarterly',
      date: '2026-06-30',
      direction: 'up',
      percentile: undefined,
    }} />)
    expect(screen.getByText('2026 年二季度')).toBeTruthy()
    expect(screen.getByText('较上季上升')).toBeTruthy()
  })

  it('null 和 undefined 都显示本站暂无', () => {
    const { rerender } = render(<ReadingCell reading={null} />)
    expect(screen.getByText('本站暂无')).toBeTruthy()
    rerender(<ReadingCell reading={undefined} />)
    expect(screen.getByText('本站暂无')).toBeTruthy()
  })

  it('加载中优先于已有读数', () => {
    render(<ReadingCell reading={reading} loading />)
    expect(screen.getByRole('status').textContent).toBe('读数加载中')
    expect(screen.queryByText('10 年期美债收益率')).toBeNull()
  })

  it('小数值最多三位，大数值两位且负号用 −', () => {
    const { rerender, container } = render(
      <ReadingCell reading={{ ...reading, value: 0.123456, stale: false }} />,
    )
    expect(container.querySelector('.mm-reading__value')?.textContent).toContain('0.123')
    rerender(<ReadingCell reading={{ ...reading, value: -5.96, stale: false }} />)
    expect(container.querySelector('.mm-reading__value')?.textContent).toContain('−5.96')
  })
})
