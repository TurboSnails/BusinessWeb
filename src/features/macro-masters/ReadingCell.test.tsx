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
  source: 'FRED DGS10',
}

afterEach(cleanup)

describe('ReadingCell', () => {
  it('显示数值、单位、日期、分位、方向、过期提示与来源', () => {
    const { container } = render(<ReadingCell reading={reading} />)
    expect(screen.getByText('10 年期美债收益率')).toBeTruthy()
    expect(container.querySelector('.mm-reading__value')?.textContent).toBe('5.04%')
    expect(screen.getByText('%').textContent).toBe('%')
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-19')
    expect(screen.getByText('近 10 年分位 82.35%')).toBeTruthy()
    expect(screen.getByText('近一月上升')).toBeTruthy()
    expect(screen.getByText('数据可能过期')).toBeTruthy()
    expect(screen.getByText('来源：FRED DGS10')).toBeTruthy()
  })

  it('用 percentileYears 显示近 N 年分位，缺省为 10', () => {
    const { rerender } = render(<ReadingCell reading={{ ...reading, percentileYears: 6.5 }} />)
    expect(screen.getByText('近 6.5 年分位 82.35%')).toBeTruthy()
    rerender(<ReadingCell reading={{ ...reading, percentileYears: undefined }} />)
    expect(screen.getByText('近 10 年分位 82.35%')).toBeTruthy()
  })

  it('显示 refreshFailed 与 note', () => {
    render(<ReadingCell reading={{
      ...reading,
      refreshFailed: true,
      note: '公开数据约滞后三个月',
      stale: false,
    }} />)
    expect(screen.getByText('最近一次更新失败，显示上次读数')).toBeTruthy()
    expect(screen.getByText('公开数据约滞后三个月')).toBeTruthy()
  })

  it('支持下降和持平方问，并省略未提供的字段', () => {
    const { rerender } = render(<ReadingCell reading={{ ...reading, direction: 'down', percentile: undefined, stale: false }} />)
    expect(screen.getByText('近一月下降')).toBeTruthy()
    expect(screen.queryByText(/年分位/)).toBeNull()
    expect(screen.queryByText('数据可能过期')).toBeNull()
    rerender(<ReadingCell reading={{ ...reading, direction: 'flat' }} />)
    expect(screen.getByText('近一月持平')).toBeTruthy()
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

  it('小数值保留足够精度，大数值使用千分位', () => {
    const { rerender } = render(<ReadingCell reading={{ ...reading, value: 0.123456 }} />)
    expect(screen.getByText('0.1235')).toBeTruthy()
    rerender(<ReadingCell reading={{ ...reading, value: 1234.567 }} />)
    expect(screen.getByText('1,234.57')).toBeTruthy()
  })
})
