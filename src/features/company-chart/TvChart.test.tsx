import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TvChart, { resetTvLoaderForTest, TV_ELEMENT, TV_SCRIPT_SRC } from './TvChart'

type IOCallback = (entries: { isIntersecting: boolean }[]) => void
let observers: { cb: IOCallback; el?: Element }[] = []
class MockIO {
  cb: IOCallback
  constructor(cb: IOCallback) { this.cb = cb; observers.push(this as unknown as { cb: IOCallback }) }
  observe(el: Element): void { (this as unknown as { el: Element }).el = el }
  disconnect(): void { observers = observers.filter(o => o !== (this as unknown)) }
}
const scripts = (): HTMLScriptElement[] => [...document.head.querySelectorAll<HTMLScriptElement>('script[data-tv-advanced-chart]')]
const props = { tvSymbol: 'NASDAQ:AAPL', externalUrl: 'https://www.tradingview.com/symbols/NASDAQ-AAPL/', market: 'us' as const, name: '苹果', exchangeKnown: true }

beforeEach(() => {
  observers = []
  vi.stubGlobal('IntersectionObserver', MockIO)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  scripts().forEach(s => s.remove())
  resetTvLoaderForTest()
})

describe('TvChart', () => {
  it('进入视口前不加载脚本，显示占位与手动加载按钮', () => {
    render(<TvChart {...props} />)
    expect(scripts()).toHaveLength(0)
    expect(screen.getByRole('button', { name: '加载走势图' })).toBeTruthy()
    expect(screen.getByText(/TradingView 延迟行情，图中价格不进入本站研究计算/)).toBeTruthy()
  })

  it('进入视口后只注入一次官方脚本；脚本加载失败时退回外链，不抛错', async () => {
    render(<TvChart {...props} />)
    await act(async () => { observers.forEach(o => o.cb([{ isIntersecting: true }])) })
    expect(scripts()).toHaveLength(1)
    expect(scripts()[0].src).toBe(TV_SCRIPT_SRC)
    expect(scripts()[0].type).toBe('module')
    expect(screen.getByRole('status').textContent).toContain('正在加载走势图')
    await act(async () => { scripts()[0].dispatchEvent(new Event('error')) })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('走势图没有加载出来')
    expect(screen.getByRole('link', { name: /在 TradingView 打开 NASDAQ:AAPL/ }).getAttribute('href')).toBe(props.externalUrl)
    expect(scripts()).toHaveLength(0)
    // 重试会重新注入
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试' })) })
    expect(scripts()).toHaveLength(1)
  })

  it('超时（脚本被静默拦截）也退回外链', async () => {
    vi.useFakeTimers()
    render(<TvChart {...props} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加载走势图' })) })
    expect(scripts()).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(13_000) })
    expect(screen.getByRole('alert').textContent).toContain('走势图没有加载出来')
  })

  it('自定义元素定义后渲染 tv-advanced-chart：日线、浅色主题、MA 指标、美股绿涨红跌', async () => {
    if (!customElements.get(TV_ELEMENT)) customElements.define(TV_ELEMENT, class extends HTMLElement {})
    const { container } = render(<TvChart {...props} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加载走势图' })) })
    const el = container.querySelector(TV_ELEMENT)!
    expect(el).not.toBeNull()
    expect(el.getAttribute('symbol')).toBe('NASDAQ:AAPL')
    expect(el.getAttribute('interval')).toBe('1D')
    expect(el.getAttribute('theme')).toBe('light')
    expect(el.getAttribute('allow-symbol-change')).toBeNull()
    expect(JSON.parse(el.getAttribute('studies')!)).toHaveLength(2)
    const frame = el.parentElement as HTMLElement
    expect(frame.style.getPropertyValue('--tv-widget-positive-color')).toBe('var(--down)')
    expect(frame.style.getPropertyValue('--tv-widget-negative-color')).toBe('var(--up)')
  })

  it('交易所未知时提示由 TradingView 自动解析', () => {
    render(<TvChart {...props} tvSymbol="CBOE" exchangeKnown={false} />)
    expect(screen.getByText(/符号由 TradingView 自动解析/)).toBeTruthy()
  })
})
