import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import tilt from './data/spx-qqq-tilt.json'
import dcb from './data/dead-cat-bounce.json'
import theme from './data/theme-pe-cn.json'
import tiltResults from '../../../docs/research/spx-qqq-tilt-2026-11-28/results.json'
import dcbResults from '../../../docs/research/dead-cat-bounce-2026-11-28/results.json'
import themeResults from '../../../docs/research/theme-pe-cn-2026-11-28/results.json'
import { fmtNum, fmtPct } from './LabTable'
import SpxQqqTiltStudy from './SpxQqqTiltStudy'
import DeadCatBounceStudy from './DeadCatBounceStudy'
import ThemePeCnStudy from './ThemePeCnStudy'

function renderOne(node: React.ReactElement): void {
  render(<MemoryRouter initialEntries={['/invest/strategy-lab']}>{node}</MemoryRouter>)
}

const DISCLAIMER = '不构成买卖建议'

describe('研究中 · 2026-11-28 新增三项', () => {
  it('L-049 成长倾斜与回调加杠杆：先讲绝对波动与回撤，两个都不通过', () => {
    renderOne(<SpxQqqTiltStudy />)
    const article = screen.getByTestId('lab-spx-qqq-tilt')
    expect(article.id).toBe('lab-spx-qqq-tilt')
    expect(tilt.verdict).toEqual({ K1: tiltResults.verdict.K1, K2: tiltResults.verdict.K2 })
    const answer = screen.getByTestId('lab-spx-qqq-tilt-answer').textContent ?? ''
    expect(answer).toContain('年化波动 17.95%（大盘 17.96%）')
    expect(answer).toContain('最大回撤 −83.65%（大盘 −84.12%）')
    expect(answer).toContain('−84.62%')
    expect(answer).toContain('两个都不通过')
    // 第一句先讲绝对波动与回撤，不先讲夏普
    expect(answer.indexOf('年化波动')).toBeLessThan(40)
    expect(answer.indexOf('夏普')).toBe(-1)

    const k1 = screen.getByTestId('lab-spx-qqq-tilt-k1')
    expect(within(k1).getAllByRole('row')).toHaveLength(5)
    expect(k1.textContent).toContain('+0.0069')
    expect(k1.textContent).toContain(fmtNum(tilt.K1.L))
    const k2 = screen.getByTestId('lab-spx-qqq-tilt-k2')
    expect(within(k2).getAllByRole('row')).toHaveLength(7)
    expect(k2.textContent).toContain('−0.75%')
    expect(k2.textContent).toContain('1929–1945 一段占 76%')
    expect(screen.getByTestId('lab-spx-qqq-tilt-limits').textContent).toContain('1931-09-30')
    expect(article.textContent).toContain('不改仓位规则')
    expect(article.textContent).toContain(DISCLAIMER)
  })

  it('L-051 死猫跳回避：先讲同等仓位下的波动与回撤，都不晋级，威科夫 7 次结案，77% 不存在', () => {
    renderOne(<DeadCatBounceStudy />)
    const article = screen.getByTestId('lab-dead-cat-bounce')
    const answer = screen.getByTestId('lab-dead-cat-bounce-answer').textContent ?? ''
    expect(answer).toContain('同等仓位下')
    expect(answer).toContain(`${fmtPct(dcbResults.headline.pool_vol_full, 2)} 降到 ${fmtPct(dcbResults.headline.pool_vol_avoid, 2)}`)
    expect(answer).toContain('−48.4% 加深到 −50.6%')
    expect(answer).toContain('两个写法都不晋级')
    expect(answer).toContain('不等于对 ETF 或综合策略持仓的结论')

    const table = screen.getByTestId('lab-dead-cat-bounce-table')
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect(table.textContent).toContain('5,376')
    expect(table.textContent).toContain('−3.20%')
    expect(within(table).getAllByText('部分成立')).toHaveLength(1)
    expect(dcb.layers.validate.C2grade).toBe(dcbResults.verdict.C2.validate)

    const h3 = screen.getByTestId('lab-dead-cat-bounce-h3')
    expect(within(h3).getAllByRole('row')).toHaveLength(7)
    expect(article.textContent).toContain('只出现 7 次，结案')
    expect(screen.getByTestId('lab-dead-cat-bounce-bulkowski').textContent).toContain('没有「第一次反弹顶部做空胜率 77%」')
    expect(article.textContent).toContain('不改仓位规则')
    expect(article.textContent).toContain(DISCLAIMER)
  })

  it('L-052 主线行业 + 估值过滤：先讲检验的是行业不是题材，两个都不通过', () => {
    renderOne(<ThemePeCnStudy />)
    const article = screen.getByTestId('lab-theme-pe-cn')
    const answer = screen.getByTestId('lab-theme-pe-cn-answer').textContent ?? ''
    expect(answer.startsWith('一句话这里检验的是申万一级行业')).toBe(true)
    expect(answer).toContain('不是题材或概念本身')
    expect(answer).toContain('年化波动 26.0%（行业等权 22.8%）')
    expect(answer).toContain('两个都不通过')
    expect(theme.verdict).toEqual({ C1a: themeResults.verdict.C1a, C1b: themeResults.verdict.C1b })

    const gates = screen.getByTestId('lab-theme-pe-cn-gates')
    expect(within(gates).getAllByRole('row')).toHaveLength(7)
    expect(within(gates).getAllByText('不通过')).toHaveLength(2)
    expect(gates.textContent).toContain('p 0.65（Holm 1.00）')
    expect(gates.textContent).toContain('p 0.87（Holm 1.00）')
    const table = screen.getByTestId('lab-theme-pe-cn-table')
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect(table.textContent).toContain(fmtNum(theme.rows.C1b.sharpe))
    expect(screen.getByTestId('lab-theme-pe-cn-limits').textContent).toContain('在门槛边缘')
    expect(article.textContent).toContain('不改仓位规则')
    expect(article.textContent).toContain(DISCLAIMER)
  })
})
