import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import About from './About'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mockFetchOnce = (impl: (url: string) => Promise<Response>): void => {
  vi.stubGlobal('fetch', ((url: string) => impl(url)) as typeof fetch)
}

describe('About 页面', () => {
  it('加载中显示 3 行骨架', () => {
    mockFetchOnce(() => new Promise(() => {})) // never resolves
    render(<MemoryRouter><About /></MemoryRouter>)
    const skeletons = document.querySelectorAll('.skeleton-line')
    expect(skeletons.length).toBe(3)
  })

  it('加载成功后显示 changelog 数据', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      json: async () => ({
        generatedAt: '2026-10-02T00:00:00.000Z',
        versions: [
          {
            tag: 'v1.0.0',
            date: '2026-09-30',
            commits: [
              { hash: 'abc1234', subject: 'feat: 首页段永平卡片', author: 'Hassan', date: '2026-09-30' },
            ],
          },
        ],
      }),
    } as Response))
    render(<MemoryRouter><About /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('v1.0.0')).toBeTruthy()
      expect(screen.getByText('feat: 首页段永平卡片')).toBeTruthy()
    })
  })

  it('加载失败显示重试按钮', async () => {
    mockFetchOnce(async () => {
      throw new Error('network down')
    })
    render(<MemoryRouter><About /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText(/日志加载失败/)).toBeTruthy()
      expect(screen.getByRole('button', { name: /重试/ })).toBeTruthy()
    })
  })
})
