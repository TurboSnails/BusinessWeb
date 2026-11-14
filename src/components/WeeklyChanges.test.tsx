// 候选池「本周变化」：只读静态 JSON + 本机候选池；有变化时折叠标题显示项数，无变化时显示空文案。
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WeeklyChanges from './WeeklyChanges'
import type { Company } from '../data/companies'

const NOW = new Date('2026-11-18T04:00:00Z') // 北京周三 → 上一完整周 2026-W46
const shadow = { trendState: '防守', riskGate: '防守复核', valuationZone: '中间区域' }
const files = (ledger: unknown): Record<string, unknown> => ({
  'signal-ledger-2026.json': ledger,
  'market-cycle-report.json': { schemaVersion: 1, records: [
    { weekEnding: '2026-11-14', decisionAt: '2026-11-14T10:00:00Z', ruleVersion: 'cycle-shadow-v2', markets: { csi300: { legacyState: '趋势防守', shadow } } },
    { weekEnding: '2026-11-07', decisionAt: '2026-11-13T10:00:00Z', ruleVersion: 'cycle-shadow-v2', markets: { csi300: { legacyState: '趋势防守', shadow } } },
  ] },
  'macro-us.json': { series: {} },
})
const stubFetch = (map: Record<string, unknown>) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const name = String(url).split('/').pop()!
  return name in map ? { ok: true, json: async () => map[name] } : { ok: false, json: async () => ({}) }
}))
const summaryText = (re: RegExp) => screen.getByText((_, el) => el?.tagName === 'SUMMARY' && re.test(el.textContent ?? ''))
const companies = [{ market: 'cn', code: '600519', name: '贵州茅台' }] as Company[]

afterEach(() => { vi.unstubAllGlobals() })

describe('WeeklyChanges', () => {
  it('有变化：标题「本周变化 · N 项」，展开后每条带日期与来源', async () => {
    stubFetch(files({ schemaVersion: 1, snapshots: { '2026-11-07': { 'cn:600519': [1, 1] }, '2026-11-13': { 'cn:600519': [1, 2] } } }))
    render(<MemoryRouter><WeeklyChanges items={[{ market: 'cn', code: '600519', addedAt: '2026-10-01T00:00:00Z' }]} companies={companies} observations={new Map()} now={NOW} /></MemoryRouter>)
    await waitFor(() => expect(summaryText(/本周变化 · 2 项/)).toBeTruthy())
    expect(screen.getByText(/上周 11-09 至 11-15（2026-W46）/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '贵州茅台（600519 · A股）：研究评级「条件关注」→「观察」' }).getAttribute('href')).toBe('/research-notes/cn/600519')
    expect(screen.getAllByText('日期 2026-11-13 · 来源：信号台账 2026-11-07 → 2026-11-13')).toHaveLength(2)
    expect(screen.getByText(/不是买卖指令/)).toBeTruthy()
  })

  it('无变化：显示「本周没有需要复核的变化」；文件读取失败时写明', async () => {
    stubFetch({ ...files({ schemaVersion: 1, snapshots: { '2026-11-07': {}, '2026-11-13': {} } }), 'macro-us.json': undefined })
    render(<MemoryRouter><WeeklyChanges items={[]} companies={companies} observations={new Map()} now={NOW} /></MemoryRouter>)
    await waitFor(() => expect(summaryText(/本周变化 · 无/)).toBeTruthy())
    expect(screen.getByText('本周没有需要复核的变化')).toBeTruthy()
    expect(screen.getByText('宏观快照未能读取，相关部分未比较。')).toBeTruthy()
  })
})
