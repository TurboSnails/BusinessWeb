// 候选池「今日待处理」空状态：只有在公司资料与自动 DCF 都读到时才说“暂无待处理事项”，否则写明哪部分还没核对。
import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CandidateAlerts from './CandidateAlerts'

const view = (props: Partial<React.ComponentProps<typeof CandidateAlerts>>) => render(<MemoryRouter><CandidateAlerts alerts={[]} companies={[]} {...props} /></MemoryRouter>)

describe('CandidateAlerts 空状态', () => {
  it('来源齐全：今日候选记录中暂无待处理事项', () => {
    view({})
    expect(screen.getByText('今日候选记录中暂无待处理事项。')).toBeTruthy()
  })

  it('公司资料读取中或失败、自动 DCF 未就绪：只说已核对部分，并写明缺口', () => {
    view({ coverage: '正在读取A股公司资料。港股公司资料未能读取。正在读取自动 DCF。' })
    const p = screen.getByText(/今日已核对的记录中暂无待处理事项。/)
    expect(p.textContent).toContain('港股公司资料未能读取。')
    expect(p.textContent).toContain('正在读取自动 DCF。')
    expect(screen.queryByText('今日候选记录中暂无待处理事项。')).toBeNull()
  })

  it('有价位提醒暂停判断：也不说全部无事项', () => {
    view({ paused: 2 })
    expect(screen.getByText('今日已核对的记录中暂无待处理事项。')).toBeTruthy()
    expect(screen.getByText(/另有 2 条价位提醒暂停判断/)).toBeTruthy()
  })

  it('有事项时仍列出，并附上未核对来源的说明', () => {
    view({ alerts: [{ kind: 'review', market: 'cn', code: '600519', text: '复查日已到' }] as React.ComponentProps<typeof CandidateAlerts>['alerts'], coverage: '暂无可用的自动 DCF 数据。' })
    expect(screen.getByText(/今日待处理 · 1/)).toBeTruthy()
    expect(screen.getByText('暂无可用的自动 DCF 数据。')).toBeTruthy()
  })
})
