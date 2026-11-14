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
  localStorage.setItem(START_KEY, JSON.stringify({ schemaVersion: 1, questionnaireVersion: 2, rulesVersion: 2, answers: ELIGIBLE, steps: {}, ...extra }))

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
    const saved = JSON.stringify({ schemaVersion: 1, questionnaireVersion: 2, rulesVersion: 2, answers: ELIGIBLE, steps: {} })
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

// ───── 模拟走查（sim-walkthrough.md）与文案审读（copy-review.md）的回归 ─────
const seedAnswers = (answers: Record<string, string>) =>
  localStorage.setItem(START_KEY, JSON.stringify({ schemaVersion: 1, questionnaireVersion: 2, rulesVersion: 2, answers, steps: {} }))
const resultText = () => screen.getByRole('region', { name: '自测结果' }).textContent ?? ''

describe('A · 3 年内要用的钱不进股票类资产（陈阿姨）', () => {
  it('Q3 选项是不重叠的「不到 3 年 / 3 年到不足 5 年 / 5 年及以上」', () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: '6 个月及以上' }))
    fireEvent.click(screen.getByRole('button', { name: '下一题' }))
    fireEvent.click(screen.getByRole('radio', { name: '没有' }))
    fireEvent.click(screen.getByRole('button', { name: '下一题' }))
    const group = screen.getByRole('group', { name: /最早什么时候可能要用/ })
    expect(within(group).getAllByRole('radio').map(r => r.closest('label')!.textContent)).toEqual(['不到 3 年', '3 年到不足 5 年', '5 年及以上'])
  })

  it('3 年内要用：先打底，理由写明不放股票类资产并引用家庭财务底座，没有宽基加债券的路线', () => {
    seedAnswers({ q1: 'c', q2: 'b', q3: 'a', q4: 'c', q5: 'a', q6: 'a', q7: 'a', q8: 'd', q9: 'b' })
    renderPage()
    const text = resultText()
    expect(text).toContain('你的起步路线：先打底')
    expect(text).toContain('不放股票类资产')
    expect(within(screen.getByRole('region', { name: '自测结果' })).getByRole('link', { name: /家庭财务底座 · 按日期分开装/ })).toBeTruthy()
    expect(text).not.toMatch(/宽基指数基金和债券基金上/)
  })

  it('3—5 年：省心、不研究个股，「为什么」第一条是期限', () => {
    seedAnswers({ q1: 'c', q2: 'b', q3: 'b', q4: 'c', q5: 'b', q6: 'c', q7: 'b', q8: 'b', q9: 'b' })
    renderPage()
    expect(resultText()).toContain('你的起步路线：省心')
    const first = within(screen.getByRole('region', { name: '自测结果' })).getAllByRole('listitem')[0]
    expect(first.textContent).toContain('3 到 5 年内可能动用')
  })
})

describe('B · 已有持仓：结果不是清仓指令（老周）', () => {
  const LAO_ZHOU = { q1: 'c', q2: 'b', q3: 'c', q4: 'c', q5: 'b', q6: 'c', q7: 'b', q8: 'a', q9: 'b' }
  it('省心 / 主动额度 0 的结果卡说明不是让你马上卖掉，并给出检查日逐只处理的过渡', () => {
    seedAnswers(LAO_ZHOU)
    renderPage()
    const card = screen.getByRole('region', { name: '自测结果' })
    expect(within(card).getByText('已经持有股票或基金？这个结果不是让你马上卖掉')).toBeTruthy()
    expect(card.textContent).toContain('不是让你卖掉现有持仓')
    expect(card.textContent).toContain('到第一个检查日再逐只核对')
    expect(card.textContent).toContain('先登记，等冷静期过了再决定')
  })
  it('先打底与结合结果同样有这条说明', () => {
    seedAnswers({ ...LAO_ZHOU, q1: 'a' })
    const { unmount } = renderPage()
    expect(resultText()).toContain('这个结果不是让你马上卖掉')
    unmount()
    seedAnswers({ ...LAO_ZHOU, q8: 'b' })
    renderPage()
    expect(resultText()).toContain('你的起步路线：结合')
    expect(resultText()).toContain('这个结果不是让你马上卖掉')
  })
})

describe('D · 文案不像批准、推荐或下单指令', () => {
  const PICKER = { q1: 'c', q2: 'b', q3: 'c', q4: 'c', q5: 'b', q6: 'c', q7: 'b', q8: 'b', q9: 'b' }

  it('未答完的卡片不暗示答完后会给入市比例', () => {
    renderPage()
    expect(resultText()).not.toContain('入市比例')
    expect(resultText()).toContain('答完以后也不替你定股票和债券的比例')
  })

  it('结果卡重复一句短声明；省心摘要不再以「宽基加债券搭底仓」开头，并写明不是让你现在就去买', () => {
    seedAnswers({ ...PICKER, q4: 'b' })
    renderPage()
    const text = resultText()
    expect(text).toContain('这是按书中规则整理的准备顺序，不是投资建议，也不是资格审核。')
    expect(text).not.toContain('宽基加债券搭底仓')
    expect(text).toContain('这不是让你现在就去买')
  })

  it('结合结果不说「过了起步门槛」，不用「建议起点」，并声明不是资格审核', () => {
    seedAnswers(PICKER)
    renderPage()
    const text = resultText()
    expect(text).not.toMatch(/过了起步门槛|建议起点/)
    expect(text).toContain('这不是资格审核')
    expect(text).toContain('书中给的起点上限是')
  })

  it('链到现有页面时如实说明：ETF 清单、候选池、投资计划模板、公司研究评级', () => {
    seedAnswers(PICKER)
    renderPage()
    const route = screen.getByRole('region', { name: /路线清单/ })
    expect(within(route).getByRole('link', { name: '宽基 ETF 清单（站长观察记录，不是推荐）' }).getAttribute('href')).toBe('/industry-etf#broad-etf')
    expect(route.textContent).not.toContain('宽基与债基清单')
    expect(route.textContent).toContain('也没有列债基')
    expect(within(route).getByRole('link', { name: /候选池（「研究筛出」「可买卖」是站长的研究状态，不是建议）/ })).toBeTruthy()
    expect(within(route).getByRole('link', { name: /默认的均衡档和金额是作者示例，不是给你的比例/ })).toBeTruthy()
    expect(route.textContent).toContain('评级和结论卡是观察状态与研究记录，不是买卖指令')
  })

  it('清单里没有像指令的「下单前，按…」「再下注」「持有、卖出、复盘」', () => {
    seedAnswers({ ...PICKER, q6: 'd', q7: 'c', q8: 'c' })
    renderPage()
    const route = screen.getByRole('region', { name: /路线清单/ }).textContent ?? ''
    expect(route).not.toMatch(/下单前，按|再下注|持有、卖出、复盘|林奇的两条主线/)
    expect(route).toContain('如果决定开始投，下单前')
    expect(route).toContain('本站从林奇六类中选的两条主线')
  })

  it('「自测规则」而不是「推荐规则」', () => {
    localStorage.setItem(START_KEY, JSON.stringify({ schemaVersion: 1, questionnaireVersion: 2, rulesVersion: 9, answers: PICKER, steps: {} }))
    renderPage()
    expect(screen.getByText(/自测规则已经更新/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('推荐规则')
  })

  it('下一步只说和答案相关的事：没答高息欠款就不提「还高息欠款」', () => {
    seedAnswers({ ...PICKER, q1: 'a' })
    renderPage()
    const next = screen.getByRole('region', { name: '你的下一步' }).textContent ?? ''
    expect(next).toContain('先攒应急金')
    expect(next).not.toContain('高息欠款')
  })
})

describe('P3 · 小修', () => {
  it('应急金算式填了现有现金后显示还差多少', () => {
    renderPage()
    const calc = screen.getByRole('region', { name: '应急金临时算式' })
    fireEvent.change(within(calc).getByLabelText(/每月必要支出/), { target: { value: '4000' } })
    fireEvent.change(within(calc).getByLabelText(/现在能随时动用的现金/), { target: { value: '8000' } })
    expect(calc.textContent).toContain('还差约 16,000 元')
    expect(calc.textContent).not.toContain('合格投资者')
  })

  it('检查日年份不对时直接说年份', () => {
    renderPage()
    const region = screen.getByRole('region', { name: '检查日' })
    fireEvent.change(within(region).getByLabelText(/第一个检查日/), { target: { value: '202612-01-17' } })
    fireEvent.click(within(region).getByRole('button', { name: '保存检查日' }))
    expect(within(region).getByRole('alert').textContent).toContain('年份看起来不对')
  })

  it('没有旧计划记录时不显示旧记录卡；本机记录说明不露出技术键名', () => {
    renderPage()
    expect(screen.queryByText(/投资计划页里的旧记录/)).toBeNull()
    expect(document.body.textContent).not.toContain('start:v1')
  })

  it('术语就地解释：点「什么是主动额度」显示白话说明', () => {
    seedAnswers({ q1: 'c', q2: 'b', q3: 'c', q4: 'c', q5: 'b', q6: 'c', q7: 'b', q8: 'b', q9: 'b' })
    renderPage()
    const btn = screen.getAllByRole('button', { name: '什么是主动额度' })[0]
    const note = document.getElementById(btn.getAttribute('aria-controls')!)!
    expect(note.hidden).toBe(true)
    fireEvent.click(btn)
    expect(note.hidden).toBe(false)
    expect(note.textContent).toContain('可以为 0')
  })
})
