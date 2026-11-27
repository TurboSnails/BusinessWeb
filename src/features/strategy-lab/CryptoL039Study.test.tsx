import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CryptoL039Study from './CryptoL039Study'
import data from './data/crypto-l039.json'

afterEach(() => vi.unstubAllGlobals())

function mockArchive(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

describe('BTC 单币择时研究（L-039）', () => {
  it('显示附绝对风险的结论和固定免责句，历史杠杆只在默认折叠的附表内', async () => {
    mockArchive(new Response(null, { status: 404 }))
    render(<CryptoL039Study />)

    const verdict = screen.getByText(/旧史不通过/).closest('p')
    expect(verdict?.textContent).toContain(`绝对年化波动 ${(data.verdictRisk.sigma * 100).toFixed(2)}%`)
    expect(verdict?.textContent).toContain(`最大回撤 ${(data.verdictRisk.mdd * 100).toFixed(2)}%`)
    expect(screen.getByText('即使通过，波动仍远高于美股；本研究不评估把 BTC 加入组合的影响，不构成配置或杠杆建议。')).toBeTruthy()

    const appendix = screen.getByText(/只作报告，不参与判定/).closest('details')
    expect(appendix?.hasAttribute('open')).toBe(false)
    expect(screen.getByText('永续合约逐仓杠杆').closest('details')).toBe(appendix)
    expect(screen.getByText('趋势触线次数').closest('details')).toBe(appendix)
    expect(screen.getByText('抄底触线次数').closest('details')).toBe(appendix)
    expect(await screen.findByText('2026-12-01 起每日留档')).toBeTruthy()
  })

  it('空留档同样显示开始日期', async () => {
    mockArchive(new Response(' \n'))
    render(<CryptoL039Study />)

    expect(await screen.findByText('2026-12-01 起每日留档')).toBeTruthy()
  })

  it('静态站点找不到留档而返回页面时显示开始日期', async () => {
    mockArchive(new Response('<!DOCTYPE html>', { headers: { 'Content-Type': 'text/html' } }))
    render(<CryptoL039Study />)

    expect(await screen.findByText('2026-12-01 起每日留档')).toBeTruthy()
  })

  it('有留档时展示覆盖天数和最新信号，忽略前推绩效字段', async () => {
    const latest = {
      date: '2026-12-04', marketDate: '2026-12-03', k1Signal: 'btc',
      close: 80000, ma200: 71000, mvrv: 1.2, mvrvDate: '2026-12-02',
      return: 0.423, mdd: 0.246,
    }
    const rows = [{ date: '2026-12-02' }, latest]
    mockArchive(new Response(rows.map(row => JSON.stringify(row)).join('\n')))
    render(<CryptoL039Study />)

    const section = within(screen.getByRole('region', { name: '三年前推' }))
    expect(await section.findByText('已留档 2 天 · 最近一天 2026-12-04 · 断档 2 天')).toBeTruthy()
    expect(section.getByText('趋势开')).toBeTruthy()
    expect(section.getByText(/收盘 \$80,000\.00 · 200 日均线 \$71,000\.00/)).toBeTruthy()
    expect(section.getByText(/MVRV 1\.200.*2026-12-02/)).toBeTruthy()
    expect(section.getByText('满三年（2029-12-01）后一次揭盲。')).toBeTruthy()
    expect(section.queryByText(/收益|回撤|42\.3|24\.6/)).toBeNull()
  })
})
