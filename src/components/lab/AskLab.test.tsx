import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function mountLoggedIn() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
  sessionStorage.setItem('askLab.accessToken', 'token')
  vi.resetModules()
  const { default: AskLab } = await import('./AskLab')
  render(<AskLab />)
}

beforeEach(() => sessionStorage.clear())
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('试问 AI', () => {
  it('问题标签在输入框上方，并显示字数；不足 2 个字不能提交', async () => {
    await mountLoggedIn()
    const input = screen.getByLabelText('你的问题')
    expect(screen.getByText('0 / 500')).toBeTruthy()
    expect((screen.getByRole('button', { name: '提问' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: '怎么估值' } })
    expect(screen.getByText('4 / 500')).toBeTruthy()
    expect((screen.getByRole('button', { name: '提问' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: '退出登录' })).toBeTruthy()
  })

  it('Ctrl/⌘ + Enter 提交，等待时显示占位，返回后显示回答与免责声明', async () => {
    let resolve!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => { resolve = r })))
    await mountLoggedIn()
    const input = screen.getByLabelText('你的问题')
    fireEvent.change(input, { target: { value: '怎么估值' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    expect(await screen.findByText('正在思考…')).toBeTruthy()
    resolve(new Response(JSON.stringify({ answer: '先拆驱动因素。' })))
    expect(await screen.findByText('先拆驱动因素。')).toBeTruthy()
    expect(screen.getByText('仅供参考，不构成投资建议。')).toBeTruthy()
  })

  it('请求失败时用提示框显示错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '今天的提问次数已用完' }), { status: 429 })))
    await mountLoggedIn()
    fireEvent.change(screen.getByLabelText('你的问题'), { target: { value: '怎么估值' } })
    fireEvent.click(screen.getByRole('button', { name: '提问' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('今天的提问次数已用完')
    expect(alert.className).toContain('ui-callout--warn')
  })
})
