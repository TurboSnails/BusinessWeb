import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_KEYS } from '../features/invest-start/legacyPlan'
import { resetPlanRepositoryForTests } from '../features/investment-plan/repository'
import { PLAN_KEYS } from '../features/investment-plan/types'
import MyPlan from './MyPlan'

const fetchSpy = vi.fn()

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
  window.localStorage.clear()
  resetPlanRepositoryForTests()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  resetPlanRepositoryForTests()
})

const renderPage = (path = '/invest/my-plan') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MyPlan />
    </MemoryRouter>,
  )

describe('MyPlan', () => {
  it('空状态：新建 / 预览；免责声明；零网络', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '我的计划与持仓' })).toBeTruthy()
    expect(screen.getByText('不构成投资建议，不承诺收益')).toBeTruthy()
    expect(screen.getByRole('button', { name: '新建空计划' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '预览本机已有记录' })).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('R-4: 用户保存用编辑所见 revision；过期则冲突不覆盖', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '新建空计划' }))
    await user.type(screen.getByLabelText(/月必要支出/), '8000')
    await user.click(screen.getByRole('button', { name: '保存资金用途' }))
    await waitFor(() => {
      const raw = localStorage.getItem(PLAN_KEYS.document)
      expect(raw && JSON.parse(raw).funding.monthlyNecessaryExpense?.amount).toBe('8000.00')
    })
    // 模拟另一窗口：直接抬高 revision 并改支出
    const raw = localStorage.getItem(PLAN_KEYS.document)!
    const other = JSON.parse(raw)
    other.localRevision = other.localRevision + 1
    other.funding.monthlyNecessaryExpense = { currency: 'CNY', amount: '9000.00' }
    localStorage.setItem(PLAN_KEYS.document, JSON.stringify(other))
    // 本页仍握旧草稿：改近期支出并保存 → 应冲突，不能把 9000 盖回 8000
    await user.type(screen.getByLabelText(/近期确定支出/), '0')
    await user.click(screen.getByRole('button', { name: '保存资金用途' }))
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert').map(a => a.textContent ?? '')
      expect(alerts.some(t => /另一个窗口/.test(t))).toBe(true)
    })
    const after = JSON.parse(localStorage.getItem(PLAN_KEYS.document)!)
    expect(after.funding.monthlyNecessaryExpense.amount).toBe('9000.00')
  })

  it('P1-2: 向导保存并继续连续两次 patch 不丢资金用途', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '新建空计划' }))
    await user.type(screen.getByLabelText(/月必要支出/), '8000')
    await user.type(screen.getByLabelText(/应急月数/), '6')
    await user.click(screen.getByRole('button', { name: '保存并继续' }))
    expect(await screen.findByRole('heading', { name: /第 2 步：三笔投资预算/ })).toBeTruthy()
    const raw = localStorage.getItem(PLAN_KEYS.document)
    expect(raw).toBeTruthy()
    const doc = JSON.parse(raw!)
    expect(doc.funding.monthlyNecessaryExpense.amount).toBe('8000.00')
    expect(doc.funding.emergencyMonths).toBe(6)
    expect(doc.wizard.nextStep).toBe(2)
  })

  it('全跳过向导 → 草稿非安全；无买入指令', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '新建空计划' }))
    // 四步均可跳过
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: '跳过这一步' }))
    }
    await user.click(screen.getByRole('button', { name: '跳过并保存草稿' }))
    expect(screen.queryByText(/今天没有例行检查待办/)).toBeNull()
    expect(screen.getAllByText(/三笔投资预算未确认|应急需求或备用金/).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/立即买入|马上买|需买入|需卖出/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('迁移预览：默认值不自动导入金额；确认文案；取消无写入；旧键不变', async () => {
    localStorage.setItem(LEGACY_KEYS.total, JSON.stringify('50'))
    localStorage.setItem(LEGACY_KEYS.split, JSON.stringify({ base: '70', active: '20', reserve: '10' }))
    const before = localStorage.getItem(LEGACY_KEYS.total)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '预览本机已有记录' }))
    await user.click(screen.getByRole('button', { name: '开始预览' }))
    expect(screen.getByText(/这是我的记录；我确认这些字段的来源与单位/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(localStorage.getItem(PLAN_KEYS.document)).toBeNull()
    expect(localStorage.getItem(LEGACY_KEYS.total)).toBe(before)
  })

  it('导入确认后旧键逐字保留；#owner-sync 挂载点存在', async () => {
    localStorage.setItem(LEGACY_KEYS.total, JSON.stringify('50'))
    localStorage.setItem(LEGACY_KEYS.split, JSON.stringify({ base: '70', active: '20', reserve: '10' }))
    const before = { ...Object.fromEntries(Object.values(LEGACY_KEYS).map(k => [k, localStorage.getItem(k)])) }
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '预览本机已有记录' }))
    await user.click(screen.getByRole('button', { name: '开始预览' }))
    await user.click(screen.getByRole('button', { name: '显示本机记录并核对' }))
    await user.click(screen.getByLabelText(/这是我的记录/))
    await user.click(screen.getByRole('button', { name: '确认导入到本页计划' }))
    for (const [k, v] of Object.entries(before)) expect(localStorage.getItem(k)).toBe(v)
    expect(localStorage.getItem(PLAN_KEYS.document)).not.toBeNull()

    cleanup()
    resetPlanRepositoryForTests()
    renderPage('/invest/my-plan#owner-sync')
    expect(await screen.findByRole('heading', { name: '站长专用同步' })).toBeTruthy()
  })

  it('300px 布局类存在；备份区可进入', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '新建空计划' }))
    expect(document.querySelector('.investment-plan')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /备份/ })).toBeTruthy()
  })
})
