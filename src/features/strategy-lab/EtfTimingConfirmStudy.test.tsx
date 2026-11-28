import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import data from './data/etf-timing-confirm.json'
import results from '../../../docs/research/etf-timing-confirm-2005-2026-11-28/results.json'
import EtfTimingConfirmStudy from './EtfTimingConfirmStudy'

describe('研究中 · L-056 朋友 ETF 择时 2005–2010 确认检验', () => {
  it('第一句按预注册口径，等级与计数来自研究结果', () => {
    render(<MemoryRouter initialEntries={['/invest/strategy-lab']}><EtfTimingConfirmStudy /></MemoryRouter>)
    const article = screen.getByTestId('lab-etf-timing-confirm')
    expect(article.id).toBe('lab-etf-timing-confirm')

    expect(data.grade).toBe(results.final.grade)
    expect(data.counts.X).toBe(results.main.counts.X)
    expect(data.counts.P).toBe(results.main.counts.P)
    expect(data.counts.D).toBe(results.main.counts.D)
    expect(data.counts.volLowerThanM).toBe(results.main.counts.volLowerThanM)

    const answer = screen.getByTestId('lab-etf-timing-confirm-answer').textContent ?? ''
    // 第一句先讲回填
    expect(answer.indexOf('回填')).toBeLessThan(50)
    expect(answer).toContain('15 个指数里 5 个收益与回撤都通过、15 个回撤通过')
    expect(answer).toContain('14 个指数的 2008 年下跌段回撤更浅、13 个指数收益和回撤都不差')
    expect(answer).toContain('p = 0.0008')
    expect(answer).toContain('年化波动有 0 个指数比静态持有低')
    expect(answer).toContain('同仓位下回撤改善成立，收益代价未确认')
    expect(answer).toContain('约 1.3（精确值 1.2553）')
    expect(answer).toContain('2 次优于随机')

    expect(within(screen.getByTestId('lab-etf-timing-confirm-gates')).getAllByRole('row')).toHaveLength(7)
    expect(within(screen.getByTestId('lab-etf-timing-confirm-crashes')).getAllByRole('row')).toHaveLength(5)
    expect(within(screen.getByTestId('lab-etf-timing-confirm-table')).getAllByRole('row')).toHaveLength(16)

    const limits = screen.getByTestId('lab-etf-timing-confirm-limits').textContent ?? ''
    for (const t of ['回填数据', '低仓位', '波动不低于同仓位静态组合', '证据量', '四次大跌只有两次优于随机']) expect(limits).toContain(t)
    expect(limits).toContain('17.1%–22.9%')
    expect(limits).toContain('11.7%–15.0%')

    expect(article.textContent).toContain('不改仓位规则')
    expect(article.textContent).toContain('以同样平均仓位的静态组合为对照')
    expect(article.textContent).toContain('不构成买卖建议')
  })
})
