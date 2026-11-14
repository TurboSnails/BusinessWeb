// 独立代码审查（.dev-team/runs/newcomer-entry/reports/code-review.md）发现的问题的回归测试。
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StartHere from './StartHere'
import { START_KEY } from '../features/invest-start/store'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const renderPage = () => render(<MemoryRouter initialEntries={['/invest/start']}><StartHere /></MemoryRouter>)
const routeRegion = () => screen.getByRole('region', { name: /路线清单|先打底学习路径/ })
const reviewRegion = () => screen.getByRole('region', { name: '检查日' })

const ELIGIBLE = { q1: 'c', q2: 'b', q3: 'c', q4: 'c', q5: 'b', q6: 'c', q7: 'b', q8: 'b', q9: 'b' }
const seed = (extra: Record<string, unknown> = {}) =>
  localStorage.setItem(START_KEY, JSON.stringify({ schemaVersion: 1, questionnaireVersion: 1, rulesVersion: 1, answers: ELIGIBLE, steps: {}, ...extra }))

async function clearAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '清除本页在这台设备上的记录' }))
  await user.click(screen.getByRole('button', { name: '确认清除' }))
}

describe('#1 未答完时不保留研究清单与 5% 额度', () => {
  it('浏览「研究」清单后按另一笔钱重做：回到静态先打底路径，没有研究清单与 5%', async () => {
    seed({ answers: { ...ELIGIBLE, q3: 'a' } })
    const user = userEvent.setup()
    renderPage()
    await user.click(within(routeRegion()).getByRole('button', { name: '研究' }))
    expect(routeRegion().textContent).toContain('研究路线：扩大研究范围')
    await user.click(screen.getByRole('button', { name: '按另一笔钱重做' }))
    const region = routeRegion()
    expect(within(region).getByRole('heading', { level: 2 }).textContent).toBe('先打底学习路径')
    expect(region.textContent).not.toContain('研究路线：扩大研究范围')
    expect(region.textContent).not.toMatch(/5%/)
    expect(within(region).queryByRole('button', { name: '研究' })).toBeNull()
  })

  it('其他标签页把结果改成未答完（storage 事件）：浏览中的路线也回到先打底', async () => {
    seed()
    const user = userEvent.setup()
    renderPage()
    await user.click(within(routeRegion()).getByRole('button', { name: '研究' }))
    const { q4: _drop, ...partial } = ELIGIBLE
    void _drop
    act(() => {
      seed({ answers: partial })
      window.dispatchEvent(new StorageEvent('storage', { key: START_KEY }))
    })
    expect(routeRegion().textContent).not.toContain('研究路线：扩大研究范围')
    expect(within(routeRegion()).getByRole('heading', { level: 2 }).textContent).toBe('先打底学习路径')
  })
})

describe('#3 清除检查日后仍能重新设置', () => {
  it('页面清除后检查日表单立即可用（不需刷新）', async () => {
    seed({ review: { id: 'abc-1', anchor: '2030-01-15', intervalMonths: 6, completedDates: [], calendarSequence: 0 } })
    const user = userEvent.setup()
    renderPage()
    expect(reviewRegion().textContent).toContain('下次检查日 2030-01-15')
    await clearAll(user)
    const date = within(reviewRegion()).getByLabelText(/第一个检查日/) as HTMLInputElement
    expect(date.value).toBe('')
    expect(within(reviewRegion()).getByRole('button', { name: '保存检查日' })).toBeTruthy()
  })

  it('其他标签页删除或替换检查日：已挂载的面板跟着更新', () => {
    seed({ review: { id: 'abc-1', anchor: '2030-01-15', intervalMonths: 6, completedDates: [], calendarSequence: 0 } })
    renderPage()
    act(() => {
      seed({ review: { id: 'abc-1', anchor: '2031-02-10', intervalMonths: 3, completedDates: [], calendarSequence: 1 } })
      window.dispatchEvent(new StorageEvent('storage', { key: START_KEY }))
    })
    expect(reviewRegion().textContent).toContain('下次检查日 2031-02-10')
    act(() => {
      seed()
      window.dispatchEvent(new StorageEvent('storage', { key: START_KEY }))
    })
    expect(within(reviewRegion()).getByRole('button', { name: '保存检查日' })).toBeTruthy()
    fireEvent.click(within(reviewRegion()).getByRole('button', { name: '保存检查日' }))
    expect(within(reviewRegion()).getByRole('alert').textContent).toContain('1—28')
  })

  it('进入「改检查日」时草稿取当前计划（包括其他标签页改过的）', async () => {
    seed({ review: { id: 'abc-1', anchor: '2030-01-15', intervalMonths: 6, completedDates: [], calendarSequence: 0 } })
    const user = userEvent.setup()
    renderPage()
    act(() => {
      seed({ review: { id: 'abc-1', anchor: '2031-02-10', intervalMonths: 3, completedDates: [], calendarSequence: 1 } })
      window.dispatchEvent(new StorageEvent('storage', { key: START_KEY }))
    })
    await user.click(within(reviewRegion()).getByRole('button', { name: '改检查日' }))
    expect((within(reviewRegion()).getByLabelText(/第一个检查日/) as HTMLInputElement).value).toBe('2031-02-10')
    expect((within(reviewRegion()).getByRole('radio', { name: '每季度' }) as HTMLInputElement).checked).toBe(true)
  })
})

describe('#4 删除失败要如实报告', () => {
  /** 读写正常、只有 removeItem 抛错 */
  function removeOnlyFails(init: Record<string, string>) {
    const data = { ...init }
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => { data[k] = String(v) },
      removeItem: () => { throw new DOMException('denied', 'SecurityError') },
      clear: () => {},
      key: () => null,
      get length() { return Object.keys(data).length },
    })
    return data
  }

  it('无法识别的记录：删除失败时保留保护，显示失败，之后作答也不覆盖原文', async () => {
    const data = removeOnlyFails({ [START_KEY]: '{"schemaVersion":42}' })
    const user = userEvent.setup()
    renderPage()
    await clearAll(user)
    expect(screen.getByText(/清除失败/)).toBeTruthy()
    expect(screen.getByText('本机保存的记录无法识别')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: '不到 3 个月' }))
    expect(data[START_KEY]).toBe('{"schemaVersion":42}')
  })

  it('正常记录：删除失败时不假装已清空（答案仍在，并提示失败）', async () => {
    const saved = JSON.stringify({ schemaVersion: 1, questionnaireVersion: 1, rulesVersion: 1, answers: ELIGIBLE, steps: {} })
    const data = removeOnlyFails({ [START_KEY]: saved })
    const user = userEvent.setup()
    renderPage()
    await clearAll(user)
    expect(screen.getByText(/清除失败/)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: /你的起步路线：结合/ })).toBeTruthy()
    expect(data[START_KEY]).toBe(saved)
  })

  it('删除成功后清掉之前的「当前未保存」状态', async () => {
    let failSet = true
    const data: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => { if (failSet) throw new DOMException('quota', 'QuotaExceededError'); data[k] = v },
      removeItem: (k: string) => { delete data[k] },
      clear: () => {}, key: () => null, length: 0,
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('radio', { name: '不到 3 个月' }))
    expect(screen.getByText('当前未保存')).toBeTruthy()
    failSet = false
    await clearAll(user)
    expect(screen.queryByText('当前未保存')).toBeNull()
    expect(screen.queryByText(/清除失败/)).toBeNull()
  })
})

describe('#7 父组件触发的重做要把键盘焦点交给题目', () => {
  it('键盘按「按另一笔钱重做」后焦点在 Q3 的题目上', async () => {
    seed({ answers: { ...ELIGIBLE, q3: 'a' } })
    const user = userEvent.setup()
    renderPage()
    screen.getByRole('button', { name: '按另一笔钱重做' }).focus()
    await user.keyboard('{Enter}')
    const fieldset = screen.getByRole('group', { name: /最早什么时候可能要用/ })
    expect(document.activeElement).toBe(fieldset)
  })

  it('「全部重做」与清除后焦点在第 1 题', async () => {
    seed()
    const user = userEvent.setup()
    renderPage()
    screen.getByRole('button', { name: '全部重做' }).focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('group', { name: /现金能撑几个月/ }))

    await user.click(screen.getByRole('radio', { name: '不到 3 个月' }))
    screen.getByRole('button', { name: '清除本页在这台设备上的记录' }).focus()
    await user.keyboard('{Enter}')
    screen.getByRole('button', { name: '确认清除' }).focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('group', { name: /现金能撑几个月/ }))
  })
})
