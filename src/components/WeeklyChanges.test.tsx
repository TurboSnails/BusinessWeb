// 候选池「本周变化」：只读静态 JSON + 本机候选池；有变化时折叠标题显示项数，无变化时显示空文案。
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WeeklyChanges from './WeeklyChanges'
import type { Company } from '../data/companies'
import { resetEarningsCalendarCache } from '../features/earnings/loadCalendar'

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
const ITEM = { market: 'cn' as const, code: '600519', addedAt: '2026-10-01T00:00:00Z' }
// 两期都有同一家公司的评级、且没有变化
const UNCHANGED_LEDGER = { schemaVersion: 1, snapshots: { '2026-11-07': { 'cn:600519': [1, 1] }, '2026-11-13': { 'cn:600519': [1, 1] } } }
// 两个周末都有 VIX 读数、阶段不变
const MACRO_STABLE = { series: { vix: { latest: { date: '2026-11-13', value: 15 }, history: [['2026-11-06', 15], ['2026-11-13', 15]] } } }

afterEach(() => { vi.unstubAllGlobals(); resetEarningsCalendarCache() })

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

  it('确实无变化：三个来源两期都可比较且没有变化时，才显示「本周没有需要复核的变化」', async () => {
    stubFetch({ ...files(UNCHANGED_LEDGER), 'macro-us.json': MACRO_STABLE })
    render(<MemoryRouter><WeeklyChanges items={[ITEM]} companies={companies} observations={new Map()} now={NOW} /></MemoryRouter>)
    await waitFor(() => expect(summaryText(/本周变化 · 无上周/)).toBeTruthy())
    expect(screen.getByText('本周没有需要复核的变化')).toBeTruthy()
    expect(screen.queryByText(/无法确认|相关部分未比较|评级变化未比较|周状态未比较|宏观阶段未比较/)).toBeNull()
    // 财报前瞻只是背景：读不到时单独说明，不影响「无变化」判断
    expect(screen.getByText('财报前瞻未能读取，下周财报未列出。')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重新读取周度数据' })).toBeNull()
  })

  it('部分来源读取失败：不写「本周没有需要复核的变化」，写明失败来源并可重新读取', async () => {
    stubFetch({ ...files(UNCHANGED_LEDGER), 'macro-us.json': undefined })
    render(<MemoryRouter><WeeklyChanges items={[ITEM]} companies={companies} observations={new Map()} now={NOW} /></MemoryRouter>)
    await waitFor(() => expect(summaryText(/本周变化 · 无法确认（部分来源读取失败）/)).toBeTruthy())
    expect(screen.queryByText('本周没有需要复核的变化')).toBeNull()
    expect(screen.getByText(/无法确认本周是否有变化；已比较的部分没有列出变化/)).toBeTruthy()
    expect(screen.getByText('宏观快照未能读取，相关部分未比较。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新读取周度数据' })).toBeTruthy()
  })

  it('比较来源全部读取失败：明确写全部失败，不显示“无变化”', async () => {
    stubFetch({})
    render(<MemoryRouter><WeeklyChanges items={[ITEM]} companies={companies} observations={new Map()} now={NOW} /></MemoryRouter>)
    await waitFor(() => expect(summaryText(/本周变化 · 无法确认（比较来源全部读取失败）/)).toBeTruthy())
    expect(screen.getByText('比较来源全部读取失败，无法确认本周是否有变化。')).toBeTruthy()
    expect(screen.getByText('牛熊周期自动周报、宏观快照、信号台账未能读取，相关部分未比较。')).toBeTruthy()
    expect(screen.queryByText('本周没有需要复核的变化')).toBeNull()
  })

  it('有变化但部分来源失败：项数照常显示，并标出部分来源失败', async () => {
    stubFetch({ ...files({ schemaVersion: 1, snapshots: { '2026-11-07': { 'cn:600519': [1, 1] }, '2026-11-13': { 'cn:600519': [1, 2] } } }), 'market-cycle-report.json': undefined, 'macro-us.json': MACRO_STABLE })
    render(<MemoryRouter><WeeklyChanges items={[ITEM]} companies={companies} observations={new Map()} now={NOW} /></MemoryRouter>)
    await waitFor(() => expect(summaryText(/本周变化 · 2 项（部分来源读取失败）/)).toBeTruthy())
    expect(screen.getByText('牛熊周期自动周报未能读取，相关部分未比较。')).toBeTruthy()
  })

  it('重新读取：读取中保留上次结果；再次失败时沿用上次数据并写明，不清空已有内容', async () => {
    const map: Record<string, unknown> = { ...files(UNCHANGED_LEDGER), 'macro-us.json': undefined }
    stubFetch(map)
    render(<MemoryRouter><WeeklyChanges items={[ITEM]} companies={companies} observations={new Map()} now={NOW} /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('button', { name: '重新读取周度数据' })).toBeTruthy())
    // 第二次：周报读不到、宏观仍读不到
    delete map['market-cycle-report.json']
    fireEvent.click(screen.getByRole('button', { name: '重新读取周度数据' }))
    expect(screen.getByRole('status').textContent).toMatch(/正在重新读取周度数据，下面暂为上次读取的结果/)
    await waitFor(() => expect(screen.getByText('牛熊周期自动周报本次重新读取失败，沿用上次读取的数据（日期见各条来源）。')).toBeTruthy())
    expect(screen.getByText('宏观快照未能读取，相关部分未比较。')).toBeTruthy()
    expect(summaryText(/无法确认（部分来源读取失败）/)).toBeTruthy()
  })

  it('周期周报一条记录都没有（records 为空）：另两个来源正常稳定时也不显示「无变化」', async () => {
    stubFetch({ ...files(UNCHANGED_LEDGER), 'market-cycle-report.json': { schemaVersion: 1, records: [] }, 'macro-us.json': MACRO_STABLE })
    render(<MemoryRouter><WeeklyChanges items={[ITEM]} companies={companies} observations={new Map()} now={NOW} /></MemoryRouter>)
    await waitFor(() => expect(summaryText(/本周变化 · 无法确认（部分数据无法比较）/)).toBeTruthy())
    expect(screen.getByText('牛熊周期自动周报没有任何周记录，周状态未比较。')).toBeTruthy()
    expect(screen.queryByText('本周没有需要复核的变化')).toBeNull()
  })

  it('台账上一期不在上一周：标出实际比较日期，不写两周无变化', async () => {
    stubFetch({ ...files({ schemaVersion: 1, snapshots: { '2026-10-24': { 'cn:600519': [1, 1] }, '2026-11-13': { 'cn:600519': [1, 1] } } }), 'macro-us.json': MACRO_STABLE })
    render(<MemoryRouter><WeeklyChanges items={[ITEM]} companies={companies} observations={new Map()} now={NOW} /></MemoryRouter>)
    await waitFor(() => expect(summaryText(/本周变化 · 无法确认（部分数据无法比较）/)).toBeTruthy())
    expect(screen.getByText('信号台账缺少上一周（2026-11-02 至 2026-11-08）的一期，评级按 2026-10-24 → 2026-11-13 比较，跨度不止一周。')).toBeTruthy()
    expect(screen.queryByText('本周没有需要复核的变化')).toBeNull()
  })

  it('跨年周只缺上一年台账：不算读取失败；当年台账两期可比较时正常判断', async () => {
    const newYear = new Date('2027-01-06T04:00:00Z') // 上一完整周 2027-W53 前后跨 2026/2027
    stubFetch({
      'signal-ledger-2027.json': { schemaVersion: 1, snapshots: { '2026-12-25': { 'cn:600519': [1, 1] }, '2027-01-02': { 'cn:600519': [1, 1] } } },
      'market-cycle-report.json': { schemaVersion: 1, records: [
        { weekEnding: '2027-01-02', decisionAt: '2027-01-02T10:00:00Z', ruleVersion: 'cycle-shadow-v2', markets: { csi300: { legacyState: '趋势防守', shadow } } },
        { weekEnding: '2026-12-26', decisionAt: '2026-12-26T10:00:00Z', ruleVersion: 'cycle-shadow-v2', markets: { csi300: { legacyState: '趋势防守', shadow } } },
      ] },
      'macro-us.json': { series: { vix: { latest: { date: '2027-01-02', value: 15 }, history: [['2026-12-25', 15], ['2027-01-02', 15]] } } },
    })
    render(<MemoryRouter><WeeklyChanges items={[ITEM]} companies={companies} observations={new Map()} now={newYear} /></MemoryRouter>)
    await waitFor(() => expect(summaryText(/本周变化 · 无上周/)).toBeTruthy())
    expect(screen.queryByText(/信号台账未能读取/)).toBeNull()
  })

  it('下周财报是背景信息：只有财报时仍是「无」，但列出下周财报', async () => {
    stubFetch({ ...files(UNCHANGED_LEDGER), 'macro-us.json': MACRO_STABLE, 'earnings-calendar.json': {
      schemaVersion: 1, generatedAt: '2026-11-17T23:30:00Z', today: '2026-11-18', sources: { cnAppoint: { label: '东方财富·定期报告预约披露' } },
      items: [{ market: 'cn', code: '600519', name: '贵州茅台', date: '2026-11-20', time: 'unknown', confirmed: true, period: null, dateSource: 'cnAppoint', research: null }],
    } })
    render(<MemoryRouter><WeeklyChanges items={[{ market: 'cn', code: '600519', addedAt: '2026-10-01T00:00:00Z' }]} companies={companies} observations={new Map()} now={NOW} /></MemoryRouter>)
    await waitFor(() => expect(summaryText(/本周变化 · 无/)).toBeTruthy())
    expect(screen.getByText('本周没有需要复核的变化')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '下周财报 · 1 家' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '贵州茅台（600519 · A股）：11-20公布（日期已确认；候选池）' })).toBeTruthy()
  })
})
