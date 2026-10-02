import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import TradingViewHeatmap from './TradingViewHeatmap'

afterEach(cleanup)
const scripts = (c: HTMLElement) => c.querySelectorAll('script[src*="embed-widget-stock-heatmap"]')

describe('TradingView 热力图加载', () => {
  it('可见时注入 widget 脚本，配置了数据源且高度 100%', () => {
    const { container } = render(<TradingViewHeatmap dataSource="SPX500" active />)
    const script = scripts(container)[0] as HTMLScriptElement
    expect(script).toBeTruthy()
    expect(JSON.parse(script.innerHTML)).toMatchObject({ dataSource: 'SPX500', height: '100%', width: '100%' })
  })

  it('StrictMode 下先卸载再挂载后仍然有 widget（回归：数据曾全部消失）', () => {
    const { container } = render(<React.StrictMode><TradingViewHeatmap dataSource="NASDAQ100" active /></React.StrictMode>)
    expect(scripts(container)).toHaveLength(1)
  })

  it('隐藏时不加载，变为可见时才加载一次，重复渲染不重建', () => {
    const { container, rerender } = render(<TradingViewHeatmap dataSource="HSCEI" active={false} />)
    expect(scripts(container)).toHaveLength(0)
    rerender(<TradingViewHeatmap dataSource="HSCEI" active />)
    const first = scripts(container)[0]
    expect(first).toBeTruthy()
    rerender(<TradingViewHeatmap dataSource="HSCEI" active />)
    expect(scripts(container)[0]).toBe(first)
  })
})
