import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TimelineChart, { DAILY_FALLBACK_NOTICE } from '../TimelineChart'
import { DAILY_URL, isDailyFile, resetDailyCache } from '../daily'
import { makeDailyFixture } from '../daily.fixture'
import { makeTimeline } from './testUtils'

const daily = makeDailyFixture({ start: '2015-01-01', end: '2026-11-20' })
const monthly = makeTimeline()

let observers: { callback: IntersectionObserverCallback; disconnected: boolean }[] = []

class FakeIntersectionObserver {
  private entry: { callback: IntersectionObserverCallback; disconnected: boolean }
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, disconnected: false }
    observers.push(this.entry)
  }
  observe(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
  disconnect(): void { this.entry.disconnected = true }
}

function intersect(isIntersecting = true): void {
  act(() => {
    observers.filter(item => !item.disconnected).forEach(item => {
      item.callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)
    })
  })
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

beforeEach(() => {
  observers = []
  resetDailyCache()
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetDailyCache()
})

describe('每日数据懒加载', () => {
  it('进入视口前不请求，进入后请求并显示每日时间线（默认近 3 年）', async () => {
    const fetcher = vi.fn(async (_url: string) => okResponse(daily))
    render(<TimelineChart timeline={monthly} fetcher={fetcher as unknown as typeof fetch} />)
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.getByText('正在读取每日档位，先显示月度。')).toBeTruthy()
    expect(screen.getByTestId('mp-timeline-chart').closest('figure')?.getAttribute('data-granularity')).toBe('month')
    intersect(false)
    expect(fetcher).not.toHaveBeenCalled()

    intersect(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toBe(DAILY_URL)
    await screen.findByText('样例数据，仅用于开发与测试。')
    const chart = screen.getByTestId('mp-timeline-chart')
    expect(chart.closest('figure')?.getAttribute('data-granularity')).toBe('day')
    expect(chart.getAttribute('data-visible-start')).toBe('2023-11-20')
    expect(screen.queryByText('正在读取每日档位，先显示月度。')).toBeNull()
    expect(screen.getByTestId('mp-timeline-latest').textContent).toBe('最新 · 11 月 20 日')
    expect(screen.getByText('样例数据，仅用于开发与测试。')).toBeTruthy()
    expect(screen.queryByText(DAILY_FALLBACK_NOTICE)).toBeNull()
  })

  it('请求失败时退回月度时间线并提示', async () => {
    const fetcher = vi.fn(async () => { throw new Error('网络错误') })
    render(<TimelineChart timeline={monthly} fetcher={fetcher as unknown as typeof fetch} />)
    intersect(true)
    expect(await screen.findByText(DAILY_FALLBACK_NOTICE)).toBeTruthy()
    const chart = screen.getByTestId('mp-timeline-chart')
    expect(chart.closest('figure')?.getAttribute('data-granularity')).toBe('month')
    expect(chart.getAttribute('data-visible-months')).toBe(String(monthly.length))
    expect(screen.getByLabelText('按月份查看档位')).toBeTruthy()
  })

  it('HTTP 错误或结构异常同样退回月度', async () => {
    const notFound = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response)
    render(<TimelineChart timeline={monthly} fetcher={notFound as unknown as typeof fetch} />)
    intersect(true)
    expect(await screen.findByText(DAILY_FALLBACK_NOTICE)).toBeTruthy()
    cleanup()

    // 线上缺文件时会回落成 index.html（200），解析得到的也不是每日结构。
    const wrongShape = vi.fn(async () => okResponse({ rows: 'nope' }))
    render(<TimelineChart timeline={monthly} fetcher={wrongShape as unknown as typeof fetch} />)
    intersect(true)
    expect(await screen.findByText(DAILY_FALLBACK_NOTICE)).toBeTruthy()
  })

  it('同一页面会话内只请求一次（默认请求走模块缓存）', async () => {
    const fetchMock = vi.fn(async () => okResponse(daily))
    vi.stubGlobal('fetch', fetchMock)
    const first = render(<TimelineChart timeline={monthly} />)
    intersect(true)
    await screen.findByText('样例数据，仅用于开发与测试。')
    first.unmount()
    render(<TimelineChart timeline={monthly} />)
    intersect(true)
    await screen.findByText('样例数据，仅用于开发与测试。')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('不支持视口观察的环境直接请求', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const fetcher = vi.fn(async () => okResponse(daily))
    render(<TimelineChart timeline={monthly} fetcher={fetcher as unknown as typeof fetch} />)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('样例数据，仅用于开发与测试。')).toBeTruthy()
  })
})

describe('每日数据结构校验', () => {
  it('接受样例，拒绝缺字段或倒序', () => {
    expect(isDailyFile(daily)).toBe(true)
    expect(isDailyFile({ ...daily, rows: [] })).toBe(false)
    expect(isDailyFile({ ...daily, changes: undefined })).toBe(false)
    expect(isDailyFile({ ...daily, rows: [...daily.rows].reverse() })).toBe(false)
    expect(isDailyFile('<!doctype html>')).toBe(false)
  })
})
