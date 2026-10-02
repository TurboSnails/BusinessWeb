import React, { useEffect, useRef } from 'react'

interface Props {
  dataSource: string // e.g. SPX500 / NASDAQ100 / HSI
  active: boolean // 仅激活（可见）时才加载；widget 自带实时推送，不需要定时重建
}

/**
 * TradingView 官方股票热力图 Widget
 * 通过动态注入 embed 脚本渲染，只在首次变为可见时加载一次（重建会闪白屏，且 widget 自身实时更新）
 */
export default function TradingViewHeatmap({ dataSource, active }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const loadedFor = useRef('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (!active) return // 隐藏中的缓存页不加载
    if (loadedFor.current === dataSource) return
    loadedFor.current = dataSource

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

  }, [dataSource, active])

  // 卸载时清理，并重置「已加载」标记：React StrictMode 会先卸载再重新挂载，
  // 若只清内容不重置标记，重新挂载时会误以为已加载而保持空白
  useEffect(() => () => {
    if (containerRef.current) containerRef.current.innerHTML = ''
    loadedFor.current = ''
  }, [])

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ width: '100%', height: '100%', minHeight: 0 }}
    />
  )
}
