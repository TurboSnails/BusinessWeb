import React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SectionChrome from '../components/SectionChrome'
import { LEGACY_KEYS } from '../features/invest-start/legacyPlan'
import { START_KEY } from '../features/invest-start/store'
import { QUESTIONNAIRE_VERSION, RULES_VERSION } from '../features/invest-start/types'
import { resetPlanRepositoryForTests } from '../features/investment-plan/repository'
import { createEmptyPlan, PLAN_KEYS } from '../features/investment-plan/types'
import MyPlan from './MyPlan'

const START_REVIEW = {
  id: 'abc-1',
  anchor: '2026-06-15',
  intervalMonths: 6 as const,
  completedDates: ['2026-06-15', '2026-12-15'],
  calendarSequence: 2,
}

function seedStartWithReview(over: Record<string, unknown> = {}): void {
  localStorage.setItem(
    START_KEY,
    JSON.stringify({
      schemaVersion: 1,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      rulesVersion: RULES_VERSION,
      answers: { q1: 'c', q2: 'b', q3: 'c', q4: 'b', q5: 'b', q6: 'b', q7: 'b', q8: 'b', q9: 'b' },
      steps: {},
      assessedAt: '2026-11-01T00:00:00.000Z',
      review: START_REVIEW,
      ...over,
    }),
  )
}

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

/** 复现 App：SectionChrome 在 Page/main 之外 */
const renderWithChrome = (path = '/invest/my-plan') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SectionChrome />
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

  it('SectionChrome+MyPlan：仅一个面包屑与一个 h1；规则组链接正确', () => {
    renderWithChrome()
    const crumbs = screen.getAllByRole('navigation', { name: '面包屑' })
    expect(crumbs).toHaveLength(1)
    expect(crumbs[0].textContent).toContain('我的计划与持仓')
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1, name: '我的计划与持仓' })).toHaveLength(1)
    const tabs = screen.getByRole('navigation', { name: '同组页面' })
    expect(within(tabs).getAllByRole('link').map(a => [a.getAttribute('href'), a.textContent])).toEqual([
      ['/first-book', '我的书'],
      ['/invest/my-plan', '我的计划与持仓'],
      ['/investment-plan-2026', '2026 投资计划（作者示例）'],
    ])
    expect(within(tabs).getByRole('link', { name: '我的计划与持仓' }).getAttribute('aria-current')).toBe('page')
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

  it('自测有检查日：空状态主路径是「用自测结果建立计划」；默认勾选自测与检查日', async () => {
    seedStartWithReview()
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByRole('button', { name: '用自测结果建立计划' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/UID|答案版本/)
    await user.click(screen.getByRole('button', { name: '用自测结果建立计划' }))
    await user.click(screen.getByRole('button', { name: '开始预览' }))
    await user.click(screen.getByRole('button', { name: '显示本机记录并核对' }))
    const assess = screen.getByLabelText(/导入自测答案/) as HTMLInputElement
    const review = screen.getByLabelText(/导入检查日/) as HTMLInputElement
    expect(assess.checked).toBe(true)
    expect(review.checked).toBe(true)
    expect(screen.getAllByText(/2026-06-15/).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/UID|答案版本/)
  })

  it('自测有检查日：默认导入保留日历身份与完成状态', async () => {
    seedStartWithReview()
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '用自测结果建立计划' }))
    await user.click(screen.getByRole('button', { name: '开始预览' }))
    await user.click(screen.getByRole('button', { name: '显示本机记录并核对' }))
    await user.click(screen.getByLabelText(/这是我的记录/))
    await user.click(screen.getByRole('button', { name: '确认导入到本页计划' }))
    await waitFor(() => expect(localStorage.getItem(PLAN_KEYS.document)).not.toBeNull())
    const doc = JSON.parse(localStorage.getItem(PLAN_KEYS.document)!)
    expect(doc.review).toEqual({
      id: 'abc-1',
      anchor: '2026-06-15',
      intervalMonths: 6,
      completedDates: ['2026-06-15', '2026-12-15'],
      calendarSequence: 2,
      mode: 'calendar-check-band-act',
    })
  })

  it('自测无检查日：不出现「用自测结果建立计划」主按钮', () => {
    localStorage.setItem(
      START_KEY,
      JSON.stringify({
        schemaVersion: 1,
        questionnaireVersion: QUESTIONNAIRE_VERSION,
        rulesVersion: RULES_VERSION,
        answers: { q1: 'c' },
        steps: {},
      }),
    )
    renderPage()
    expect(screen.queryByRole('button', { name: '用自测结果建立计划' })).toBeNull()
    expect(screen.getByRole('button', { name: '新建空计划' })).toBeTruthy()
  })

  it('新建空计划不带入时明确提示已有检查日；带入须走预览不直写', async () => {
    seedStartWithReview()
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '新建空计划' }))
    expect(screen.getByText(/自测页已有检查日 2026-06-15/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /去自测预览并带入检查日/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /不带入，仅空计划/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /去自测预览并带入检查日/ }))
    expect(localStorage.getItem(PLAN_KEYS.document)).toBeNull()
    expect(screen.getByRole('heading', { name: '用自测结果建立计划' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '开始预览' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '新建空计划' }))
    await user.click(screen.getByRole('button', { name: /不带入，仅空计划/ }))
    await waitFor(() => expect(localStorage.getItem(PLAN_KEYS.document)).not.toBeNull())
    expect(JSON.parse(localStorage.getItem(PLAN_KEYS.document)!).review).toBeNull()
    expect(screen.getByText(/自测页的检查日 2026-06-15 未带入/)).toBeTruthy()
  })

  it('已有计划缺日期：备份+确认后带入；写 migration/收据；指纹变化拒绝；已有 review 不覆盖', async () => {
    seedStartWithReview()
    const empty = createEmptyPlan('2026-11-14T00:00:00.000Z', 'plan-no-review')
    empty.migration = {
      confirmedAt: '2026-11-14T00:00:00.000Z',
      legacy: { fingerprint: 'legacy-fp', imported: true },
      start: null,
    }
    localStorage.setItem(PLAN_KEYS.document, JSON.stringify(empty))
    localStorage.setItem(
      PLAN_KEYS.imports,
      JSON.stringify({ schemaVersion: 1, legacyConsumed: true, startConsumed: false }),
    )

    const created: Blob[] = []
    const urlApi = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void }
    urlApi.createObjectURL = vi.fn((b: Blob) => {
      created.push(b)
      return 'blob:x'
    })
    urlApi.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const user = userEvent.setup()
    renderPage()
    expect(screen.getByText(/还没设检查日/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '带入自测检查日' }))
    expect(screen.getByRole('heading', { name: '带入自测检查日' })).toBeTruthy()
    expect(screen.getByText(/检查日 2026-06-15/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/万元|预算总额/)

    await user.click(screen.getByRole('button', { name: '确认带入检查日' }))
    expect(screen.getByRole('alert').textContent).toMatch(/先下载现有计划备份/)
    expect(JSON.parse(localStorage.getItem(PLAN_KEYS.document)!).review).toBeNull()

    await user.click(screen.getByRole('button', { name: '下载现有计划备份' }))
    expect(created.length).toBe(1)
    await user.click(screen.getByLabelText(/这是我的自测检查日/))

    // 指纹变化：改 start 后确认应拒绝
    const startRaw = localStorage.getItem(START_KEY)!
    const startObj = JSON.parse(startRaw)
    startObj.review = { ...startObj.review, calendarSequence: 99 }
    localStorage.setItem(START_KEY, JSON.stringify(startObj))
    await user.click(screen.getByRole('button', { name: '确认带入检查日' }))
    expect(screen.getByRole('alert').textContent).toMatch(/已变化|重新/)
    expect(JSON.parse(localStorage.getItem(PLAN_KEYS.document)!).review).toBeNull()
    expect(localStorage.getItem(START_KEY)).toBe(JSON.stringify(startObj))

    // 恢复指纹，成功带入
    localStorage.setItem(START_KEY, startRaw)
    cleanup()
    resetPlanRepositoryForTests()
    localStorage.setItem(PLAN_KEYS.document, JSON.stringify(empty))
    localStorage.setItem(
      PLAN_KEYS.imports,
      JSON.stringify({ schemaVersion: 1, legacyConsumed: true, startConsumed: false }),
    )
    seedStartWithReview()
    const user2 = userEvent.setup()
    renderPage()
    await user2.click(screen.getByRole('button', { name: '带入自测检查日' }))
    await user2.click(screen.getByRole('button', { name: '下载现有计划备份' }))
    await user2.click(screen.getByLabelText(/这是我的自测检查日/))
    await user2.click(screen.getByRole('button', { name: '确认带入检查日' }))
    await waitFor(() => {
      const doc = JSON.parse(localStorage.getItem(PLAN_KEYS.document)!)
      expect(doc.review?.id).toBe('abc-1')
      expect(doc.review?.calendarSequence).toBe(2)
      expect(doc.migration?.legacy).toEqual({ fingerprint: 'legacy-fp', imported: true })
      expect(doc.migration?.start?.imported).toBe(true)
      expect(doc.migration?.start?.fingerprint).toBeTruthy()
    })
    const receipt = JSON.parse(localStorage.getItem(PLAN_KEYS.imports)!)
    expect(receipt).toEqual({ schemaVersion: 1, legacyConsumed: true, startConsumed: true })
    expect(localStorage.getItem(START_KEY)).toBe(startRaw)

    cleanup()
    resetPlanRepositoryForTests()
    const withReview = createEmptyPlan('2026-11-14T00:00:00.000Z', 'plan-has-review')
    withReview.review = {
      id: 'keep-me',
      anchor: '2027-01-10',
      intervalMonths: 3,
      completedDates: [],
      calendarSequence: 0,
      mode: 'calendar-check-band-act',
    }
    localStorage.setItem(PLAN_KEYS.document, JSON.stringify(withReview))
    seedStartWithReview()
    renderPage()
    expect(screen.queryByRole('button', { name: '带入自测检查日' })).toBeNull()
    expect(JSON.parse(localStorage.getItem(PLAN_KEYS.document)!).review.id).toBe('keep-me')
  })
})
