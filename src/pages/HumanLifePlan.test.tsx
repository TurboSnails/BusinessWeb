import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HumanLifePlan from './HumanLifePlan'

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
  sessionStorage.setItem('askLab.accessToken', 'test-token')
  localStorage.clear()
})
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
function mount() { render(<MemoryRouter><HumanLifePlan /></MemoryRouter>) }
it('首个问题免费显示，不向模型发请求，也不默认保存私人回答', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ remaining: 2 }))
  mount()
  expect(screen.getByText(/假设三年后/)).toBeTruthy()
  expect(screen.getByRole('button', { name: '生成90天规划' }).hasAttribute('disabled')).toBe(true)
  expect((screen.getByLabelText('在此浏览器保存访谈') as HTMLInputElement).checked).toBe(false)
  fireEvent.change(screen.getByLabelText('你的回答'), { target: { value: '我想写作与跑步' } })
  expect(localStorage.length).toBe(0)
  await screen.findByText(/今日剩余 2/)
})
it('成功追问携带已有回答，额度耗尽后仍展示记录', async () => {
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') return Response.json({ remaining: 1 })
    bodies.push(JSON.parse(String(init.body)))
    return new Response('{"type":"delta","text":"你上周实际写作了多久？"}\n{"type":"done","remaining":0}\n', { headers: { 'content-type': 'application/x-ndjson' } })
  })
  mount()
  await screen.findByText(/今日剩余 1/)
  fireEvent.change(screen.getByLabelText('你的回答'), { target: { value: '我想上午写作，下午跑步。' } })
  fireEvent.click(screen.getByRole('button', { name: '提交回答，继续访谈' }))
  await screen.findByText('你上周实际写作了多久？')
  expect(bodies[0]).toMatchObject({ mode: 'human3', action: 'interview', messages: [expect.anything(), { role: 'user', content: '我想上午写作，下午跑步。' }] })
  expect(screen.getByRole('button', { name: '今天额度已用完' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: '导出访谈与规划' }).hasAttribute('disabled')).toBe(false)
})
it('断流不提交半截回答，保留草稿供重试', async () => {
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? new Response('{"type":"delta","text":"半截追问"}\n', { headers: { 'content-type': 'application/x-ndjson' } })
    : Response.json({ remaining: 2 }))
  mount()
  await screen.findByText(/今日剩余 2/)
  fireEvent.change(screen.getByLabelText('你的回答'), { target: { value: '我的回答需要保留' } })
  fireEvent.click(screen.getByRole('button', { name: '提交回答，继续访谈' }))
  await screen.findByRole('alert')
  await waitFor(() => expect((screen.getByLabelText('你的回答') as HTMLTextAreaElement).value).toBe('我的回答需要保留'))
  expect(screen.queryByText('半截追问')).toBeNull()
})

it('跨日后可在原页面刷新额度，保留未提交的草稿', async () => {
  let reads = 0
  vi.stubGlobal('fetch', async () => Response.json({ remaining: reads++ === 0 ? 0 : 2 }))
  mount()
  await screen.findByText(/今日剩余 0/)
  fireEvent.change(screen.getByLabelText('你的回答'), { target: { value: '明天继续这份草稿' } })
  fireEvent.click(screen.getByRole('button', { name: '刷新今日额度' }))
  await screen.findByText(/今日剩余 2/)
  expect((screen.getByLabelText('你的回答') as HTMLTextAreaElement).value).toBe('明天继续这份草稿')
  expect(screen.getByRole('button', { name: '提交回答，继续访谈' }).hasAttribute('disabled')).toBe(false)
})

it('本机存储失败时阻止登录跳转，避免丢失私人草稿', async () => {
  sessionStorage.removeItem('askLab.accessToken')
  const original = Storage.prototype.setItem
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (key === 'human3.private-draft.v1') throw new Error('storage full')
    return original.call(this, key, value)
  })
  try {
    mount()
    fireEvent.change(screen.getByLabelText('你的回答'), { target: { value: '不能丢失的私人草稿' } })
    fireEvent.click(screen.getByLabelText('在此浏览器保存访谈'))
    fireEvent.click(screen.getByRole('button', { name: '使用 Google 登录' }))
    await screen.findByText('无法安全保存当前访谈，已阻止登录跳转。请先导出记录，清除后再登录。')
    expect((screen.getByLabelText('你的回答') as HTMLTextAreaElement).value).toBe('不能丢失的私人草稿')
    expect(sessionStorage.getItem('askLab.returnTo')).toBeNull()
  } finally { spy.mockRestore() }
})

it('完成五轮后用已有完整回答生成并显示规划', async () => {
  const messages = [{ role: 'assistant', content: '你想要怎样的生活？' }]
  for (let index = 0; index < 5; index++) {
    messages.push({ role: 'user', content: `第${index + 1}个具体经历` }, { role: 'assistant', content: `第${index + 2}个问题？` })
  }
  localStorage.setItem('human3.private-draft.v1', JSON.stringify({ messages, answer: '', report: '', saved: true }))
  let sent: Record<string, any> = {}
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') return Response.json({ remaining: 2 })
    sent = JSON.parse(String(init.body))
    return new Response(JSON.stringify({ type: 'delta', text: '## 四象限评估\n\n证据不足的部分待判断。\n\n## 下周行动\n\n每周复盘一次。' }) + '\n' + JSON.stringify({ type: 'done', remaining: 1 }) + '\n', { headers: { 'content-type': 'application/x-ndjson' } })
  })
  mount()
  await screen.findByText(/今日剩余 2/)
  fireEvent.click(screen.getByRole('button', { name: '生成90天规划' }))
  await screen.findByRole('heading', { name: '你的90天人生规划' })
  expect(sent.action).toBe('report')
  expect(sent.messages.filter((message: { role: string }) => message.role === 'user')).toHaveLength(5)
  expect(sent.messages.at(-1)).toEqual({ role: 'user', content: '第5个具体经历' })
  expect(screen.getByText('证据不足的部分待判断。')).toBeTruthy()
})
