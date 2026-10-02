import React, { useEffect, useRef } from 'react'

interface Props {
  dataSource: string // e.g. SPX500 / NASDAQ100 / HSI
  tick: number // 每次 +1 触发重新加载 widget
  active: boolean // 仅激活时响应刷新（隐藏的缓存页不刷新，widget 自带实时推送）
}

/**
 * TradingView 官方股票热力图 Widget
 * 通过动态注入 embed 脚本渲染，tick 变化时整体重建（用于定时刷新）
 */
export default function TradingViewHeatmap({ dataSource, tick, active }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const loadedFor = useRef(-1)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (!active) return // 隐藏中的缓存页不重建
    if (loadedFor.current === tick) return
    loadedFor.current = tick

    // 清空并重建
    container.innerHTML = ''

    const widgetDiv = document.createElement('div')
    widgetDiv.className = 'tradingview-widget-container__widget'
    widgetDiv.style.height = '100%'
    container.appendChild(widgetDiv)

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.async = true
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js'
    script.innerHTML = JSON.stringify({
      dataSource,
      grouping: 'sector',
      blockSize: 'market_cap_basic',
      blockColor: 'change',
      locale: 'zh_CN',
      colorTheme: 'light',
      hasTopBar: false,
      isDataSetEnabled: false,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      width: '100%',
      height: '100%',
    })
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [dataSource, tick, active])

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ width: '100%', height: '100%', minHeight: '560px' }}
    />
  )
}
