import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StartHere from './StartHere'
import { START_KEY } from '../features/invest-start/store'

const fetchSpy = vi.fn()

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const renderPage = () => render(<MemoryRouter initialEntries={['/invest/start']}><StartHere /></MemoryRouter>)

type Persona = Record<string, string>
// 选项文字与 content.QUESTIONS 一致
const NEWCOMER: Persona = { q1: '不到 3 个月', q2: '没有', q3: '1—5 年', q4: '不到 1 万元', q5: '受不了，会卖掉', q6: '每周不到 1 小时', q7: '都不能', q8: '还没开始投资，或投资不足一年', q9: '没有' }
const COMMUTER: Persona = { q1: '6 个月及以上', q2: '没有', q3: '5 年以上', q4: '1 万到不足 10 万元', q5: '难受，但不动', q6: '每周 1 小时到不足 2 小时', q7: '一点点', q8: '偶尔', q9: '没有' }
const PICKER: Persona = { q1: '6 个月及以上', q2: '没有', q3: '5 年以上', q4: '10 万到不足 100 万元', q5: '难受，但不动', q6: '每周 2 小时到不足 5 小时', q7: '一点点', q8: '偶尔', q9: '没有' }
const RESEARCHER: Persona = { ...PICKER, q6: '每周 5 小时及以上', q7: '能，而且有熟悉的行业', q8: '几乎没有（已经投资一年以上）' }

/** 用鼠标答完 9 题 */
async function answerAll(user: ReturnType<typeof userEvent.setup>, p: Persona) {
  const order = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9']
  for (const [i, q] of order.entries()) {
    await user.click(screen.getByRole('radio', { name: p[q] }))
    await user.click(screen.getByRole('button', { name: i === order.length - 1 ? '查看结果' : '下一题' }))
  }
}

/** Tab 直到焦点满足条件 */
async function tabTo(user: ReturnType<typeof userEvent.setup>, pred: (el: Element) => boolean) {
  for (let i = 0; i < 40; i++) {
    await user.tab()
    if (document.activeElement && pred(document.activeElement)) return document.activeElement as HTMLElement
  }
  throw new Error('焦点没有到达目标')
}

const resultRegion = () => screen.getByRole('region', { name: '自测结果' })
const routeRegion = () => screen.getByRole('region', { name: /路线清单|先打底学习路径/ })
const TRADE_ORDER = /立即买入|马上买|赶紧买|买入\s*\d|卖出\s*\d|加仓|满仓|抄底|清仓|目标价|推荐买/

describe('StartHere', () => {
  it('首屏：标题、页顶免责声明（在结果卡之前）、下一步（aria-live）、第一题', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '从这里开始' })).toBeTruthy()
    const disclaimer = screen.getByText('不构成投资建议，不承诺收益')
    expect(document.body.textContent).toContain('不推荐具体基金或股票')
    expect(disclaimer.compareDocumentPosition(resultRegion()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const next = screen.getByRole('region', { name: '你的下一步' })
    expect(within(next).getByText(/先做 5 分钟自测/).closest('[aria-live]')).toBeTruthy()
    expect(screen.getByRole('group', { name: /现金能撑几个月/ })).toBeTruthy()
    expect(screen.getByText(/第 1 \/ 9 题/).getAttribute('aria-live')).toBe('polite')
    // 打开页面不写本机存储
    expect(localStorage.getItem(START_KEY)).toBeNull()
  })

  it('未答完：不给路线与入市比例，只给先打底学习路径', () => {
    renderPage()
    expect(resultRegion().textContent).toContain('还没完成自测')
    expect(resultRegion().textContent).not.toMatch(/\d+%/)
    expect(screen.getByRole('heading', { name: '先打底学习路径' })).toBeTruthy()
  })

  it('只用键盘完成自测，结果出现后焦点移到结果标题', async () => {
    const user = userEvent.setup()
    renderPage()
    for (let i = 0; i < 9; i++) {
      const radio = await tabTo(user, el => el instanceof HTMLInputElement && el.type === 'radio')
      // 空格选中当前单选项（Tab 进入组时落在第一项）
      await user.keyboard(' ')
      expect((radio as HTMLInputElement).checked).toBe(true)
      const label = i === 8 ? '查看结果' : '下一题'
      await tabTo(user, el => el.tagName === 'BUTTON' && el.textContent === label)
      await user.keyboard('{Enter}')
    }
    const heading = screen.getByRole('heading', { level: 2, name: /你的起步路线/ })
    expect(document.activeElement).toBe(heading)
    // 每题都选第一项：Q1=不到 3 个月 → 先打底
    expect(heading.textContent).toContain('先打底')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('完全新手 → 先打底；结果与清单不含交易指令；只写 start:v1', async () => {
    localStorage.setItem('plan2026:fund-total', '"100"')
    const user = userEvent.setup()
    renderPage()
    await answerAll(user, NEWCOMER)
    expect(resultRegion().textContent).toContain('你的起步路线：先打底')
    expect(resultRegion().textContent).not.toMatch(/待你本人确认|主动额度/)
    expect(resultRegion().textContent).not.toMatch(TRADE_ORDER)
    expect(routeRegion().textContent).not.toMatch(TRADE_ORDER)
    const saved = JSON.parse(localStorage.getItem(START_KEY)!)
    expect(saved.answers.q1).toBe('a')
    expect(saved).not.toHaveProperty('route')
    expect(localStorage.getItem('plan2026:fund-total')).toBe('"100"')
    expect(Object.keys(localStorage).filter(k => k.startsWith('plan2026:'))).toEqual(['plan2026:fund-total'])
    expect(screen.getByRole('region', { name: '你的下一步' }).textContent).toContain('先攒应急金')
  })

  it('定投上班族 → 省心，主动额度 0，比例待本人确认、不预选档位', async () => {
    const user = userEvent.setup()
    renderPage()
    await answerAll(user, COMMUTER)
    const text = resultRegion().textContent!
    expect(text).toContain('你的起步路线：省心')
    expect(text).toContain('主动额度为 0')
    expect(text).toContain('待你本人确认')
    expect(text).not.toMatch(/你适合(保守|均衡|积极)|已选.*档/)
    expect(text).not.toMatch(TRADE_ORDER)
    expect(routeRegion().textContent).toContain('先定每月（或每季）能扣的定投上限')
  })

  it('每周 2 小时的选股者 → 结合，建议起点 5%，显示观察 M 家 ≠ 持仓，不出现最多 N 只', async () => {
    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'AAPL', addedAt: '2026-10-01T00:00:00.000Z' }]))
    const user = userEvent.setup()
    renderPage()
    await answerAll(user, PICKER)
    const text = resultRegion().textContent!
    expect(text).toContain('你的起步路线：结合')
    expect(text).toContain('建议起点上限 5%')
    expect(text).toContain('观察 1 家 ≠ 持仓')
    expect(text).not.toMatch(/最多\s*\d+\s*只|10%/)
    expect(text).not.toMatch(TRADE_ORDER)
    expect(screen.queryByText(/我的研究额度上限/)).toBeNull()
  })

  it('研究路线：本人额度默认未设置；提高到 5% 以上需勾选两项；只存 bps 整数，不写 plan2026', async () => {
    const user = userEvent.setup()
    renderPage()
    await answerAll(user, RESEARCHER)
    expect(resultRegion().textContent).toContain('你的起步路线：研究')
    expect(screen.getByText(/未设置（建议起点 5%）/)).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(START_KEY)!).userResearchCapBps).toBeUndefined()
    await user.click(screen.getByText(/我的研究额度上限/))
    const cap = screen.getByText(/我的研究额度上限/).closest('details')! as HTMLElement
    const input = screen.getByLabelText(/本人上限/)
    await user.clear(input)
    await user.type(input, '12')
    await user.click(screen.getByRole('button', { name: '保存我的上限' }))
    expect(screen.getByRole('alert').textContent).toContain('先勾选')
    await user.click(within(cap).getByRole('checkbox', { name: /决策记录/ }))
    await user.click(within(cap).getByRole('checkbox', { name: /三条判据/ }))
    await user.click(screen.getByRole('button', { name: '保存我的上限' }))
    expect(JSON.parse(localStorage.getItem(START_KEY)!).userResearchCapBps).toBe(1200)
    await user.clear(input)
    await user.type(input, '25')
    await user.click(screen.getByRole('button', { name: '保存我的上限' }))
    expect(JSON.parse(localStorage.getItem(START_KEY)!).userResearchCapBps).toBe(1200)
    expect(Object.keys(localStorage).some(k => k.startsWith('plan2026:'))).toBe(false)
  })

  it('仅因 Q3 先打底：文案改为「这笔钱不进市场」，可按另一笔钱重做（回到 Q3）', async () => {
    const user = userEvent.setup()
    renderPage()
    await answerAll(user, { ...PICKER, q3: '1 年内' })
    expect(resultRegion().textContent).toContain('1 年内要用的钱不进市场')
    await user.click(screen.getByRole('button', { name: '按另一笔钱重做' }))
    expect(screen.getByRole('group', { name: /最早什么时候可能要用/ })).toBeTruthy()
    expect(resultRegion().textContent).toContain('还没完成自测')
  })

  it('Q9=有：红线立即以 role=alert 出现，不等答完', async () => {
    localStorage.setItem(START_KEY, JSON.stringify({ schemaVersion: 1, questionnaireVersion: 1, rulesVersion: 1, answers: { q9: 'a' }, steps: {} }))
    renderPage()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('先停下')
    expect(within(alert).getByRole('link', { name: /7\.8/ })).toBeTruthy()
  })

  it('localStorage 抛错（隐私模式）时页面照常可用，并常驻「当前未保存」', async () => {
    const boom = () => { throw new DOMException('denied', 'SecurityError') }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 })
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByText('当前未保存')).toBeTruthy()
    await answerAll(user, COMMUTER)
    expect(resultRegion().textContent).toContain('你的起步路线：省心')
    await user.click(screen.getAllByRole('checkbox')[0])
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true)
  })

  it('无法识别的 start:v1 不被覆盖，直到本人清除', async () => {
    localStorage.setItem(START_KEY, '{"schemaVersion":42}')
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByText('本机保存的记录无法识别')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: '不到 3 个月' }))
    expect(localStorage.getItem(START_KEY)).toBe('{"schemaVersion":42}')
    await user.click(screen.getByRole('button', { name: '清除本页在这台设备上的记录' }))
    await user.click(screen.getByRole('button', { name: '确认清除' }))
    expect(localStorage.getItem(START_KEY)).toBeNull()
  })

  it('规则版本升级：提示重做，清单勾选保留', () => {
    const answers = { q1: 'c', q2: 'b', q3: 'c', q4: 'b', q5: 'b', q6: 'b', q7: 'b', q8: 'b', q9: 'b' }
    localStorage.setItem(START_KEY, JSON.stringify({
      schemaVersion: 1, questionnaireVersion: 1, rulesVersion: 2, answers,
      steps: { 'read-four-steps': { checked: true, at: '2026-11-01T00:00:00.000Z' }, 'removed-step': { checked: true, at: 'x' } },
    }))
    renderPage()
    expect(screen.getByText(/推荐规则已经更新/)).toBeTruthy()
    const box = within(routeRegion()).getByRole('checkbox', { name: /开篇「如果只能做一件事」/ }) as HTMLInputElement
    expect(box.checked).toBe(true)
  })

  it('清除只删除 start:v1，旧计划与候选池不动', async () => {
    localStorage.setItem('plan2026:fund-total', '"30"')
    localStorage.setItem('rn-candidates', '[]')
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('radio', { name: '不到 3 个月' }))
    expect(localStorage.getItem(START_KEY)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: '清除本页在这台设备上的记录' }))
    await user.click(screen.getByRole('button', { name: '确认清除' }))
    expect(localStorage.getItem(START_KEY)).toBeNull()
    expect(localStorage.getItem('plan2026:fund-total')).toBe('"30"')
    expect(localStorage.getItem('rn-candidates')).toBe('[]')
  })

  it('旧计划卡：默认值视为未填写；本人数据在确认前不显示金额', async () => {
    localStorage.setItem('plan2026:fund-total', '"100"')
    localStorage.setItem('plan2026:fund-split', JSON.stringify({ base: '75', active: '20', reserve: '5' }))
    localStorage.setItem('plan2026:fund-cap', '"5"')
    const { unmount } = renderPage()
    expect(document.body.textContent).toContain('还没有填写（投资计划页打开时会自动存一份示例值')
    unmount()

    localStorage.setItem('plan2026:fund-total', '"38"')
    const user = userEvent.setup()
    renderPage()
    const card = screen.getByText(/投资计划页里的旧记录/).closest('details')!
    expect(card.textContent).not.toContain('38 万元')
    expect(card.textContent).toContain('已填写（确认后显示）')
    expect(card.textContent).toContain('不是书')
    await user.click(screen.getByRole('button', { name: '这些是我自己填的，显示金额' }))
    expect(card.textContent).toContain('38 万元')
    expect(card.textContent).not.toMatch(/区间内|安全/)
  })

  it('检查日：日号限 1—28；保存后可下载 .ics（无网络请求），并显示提醒说明', async () => {
    const created: Blob[] = []
    const urlApi = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void }
    urlApi.createObjectURL = vi.fn((b: Blob) => { created.push(b); return 'blob:x' })
    urlApi.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPage()
    const region = screen.getByRole('region', { name: '检查日' })
    const date = within(region).getByLabelText(/第一个检查日/)
    fireEvent.change(date, { target: { value: '2030-03-30' } })
    await user.click(within(region).getByRole('button', { name: '保存检查日' }))
    expect(within(region).getByRole('alert').textContent).toContain('1—28')
    fireEvent.change(date, { target: { value: '2030-03-15' } })
    await user.click(within(region).getByRole('button', { name: '保存检查日' }))
    expect(region.textContent).toContain('下次检查日 2030-03-15')
    await act(async () => { await user.click(within(region).getByRole('button', { name: /下载日历文件/ })) })
    expect(click).toHaveBeenCalled()
    expect(created[0].type).toBe('text/calendar;charset=utf-8')
    const text = await created[0].text()
    expect(text).toContain('DTSTART;VALUE=DATE:20300315')
    expect(text).toContain('TRIGGER;RELATED=START:PT9H')
    expect(region.textContent).toContain('部分日历（如 Google 日历导入时）可能忽略')
    expect(fetchSpy).not.toHaveBeenCalled()
    const saved = JSON.parse(localStorage.getItem(START_KEY)!)
    expect(saved.review.anchor).toBe('2030-03-15')
  })
})
