import React, { useEffect, useRef, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import TradingViewHeatmap from './TradingViewHeatmap'
import ChinaHeatmap from './ChinaHeatmap'

interface HeatmapTab {
  key: string
  label: string
  flag: string
  type: 'tradingview' | 'china'
  dataSource?: string
}

const TABS: HeatmapTab[] = [
  { key: 'spx', label: '标普500', flag: '🇺🇸', type: 'tradingview', dataSource: 'SPX500' },
  { key: 'ndx', label: '纳斯达克100', flag: '🇺🇸', type: 'tradingview', dataSource: 'NASDAQ100' },
  { key: 'hsi', label: '恒生指数', flag: '🇭🇰', type: 'tradingview', dataSource: 'HSI' },
  { key: 'csi300', label: '沪深300', flag: '🇨🇳', type: 'china' },
]

const REFRESH_INTERVAL = 20000 // 20 秒自动刷新

/**
 * 市场热力图板块：
 * - 点击 tab 时才加载（懒加载）
 * - 访问过的 tab 保持挂载（缓存），切换回来不重新加载
 * - 当前激活的 tab 每 20 秒刷新一次数据（页面切到后台时暂停）
 */
export default function HeatmapSection(): JSX.Element {
  // 支持通过 ?hm=csi300 之类参数直达某个热力图 tab
  const getInitialTab = (): string => {
    try {
      const param = new URLSearchParams(window.location.search).get('hm')
      if (param && TABS.some(t => t.key === param)) return param
    } catch { /* ignore */ }
    return 'spx'
  }
  const [activeTab, setActiveTab] = useState(getInitialTab)
  const [visited, setVisited] = useState<Set<string>>(() => new Set([getInitialTab()]))
  const [tick, setTick] = useState(0)
  const [lastRefresh, setLastRefresh] = useState('')
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleTabClick = (key: string) => {
    setActiveTab(key)
    setVisited(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  // 20 秒自动刷新：仅刷新当前激活的 tab
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setTick(t => t + 1)
      setLastRefresh(new Date().toLocaleTimeString('zh-CN'))
      setCountdown(REFRESH_INTERVAL / 1000)
    }, REFRESH_INTERVAL)

    const cd = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setCountdown(c => (c > 1 ? c - 1 : REFRESH_INTERVAL / 1000))
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      clearInterval(cd)
    }
  }, [])

  return (
    <div style={{ marginBottom: '20px', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      {/* 标题 + 刷新状态 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: '0.95rem', margin: 0, color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LayoutGrid size={18} color="#3b82f6" /> 市场热力图
        </h3>
        <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 'auto' }}>
          {lastRefresh ? `上次刷新 ${lastRefresh}` : `每 ${REFRESH_INTERVAL / 1000} 秒自动刷新`}
          <span style={{ marginLeft: '8px', color: '#d1d5db' }}>{countdown}s</span>
        </span>
      </div>

      {/* 指数 Tab */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {TABS.map(tab => {
          const isActive = tab.key === activeTab
          return (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: isActive ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                background: isActive ? '#eff6ff' : '#f9fafb',
                color: isActive ? '#2563eb' : '#6b7280',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
              }}
            >
              <span>{tab.flag}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 内容区：访问过的保持挂载隐藏（缓存），只显示当前 tab */}
      <div style={{ position: 'relative' }}>
        {TABS.map(tab => {
          if (!visited.has(tab.key)) return null
          const isActive = tab.key === activeTab
          return (
            <div key={tab.key} style={{ display: isActive ? 'block' : 'none' }}>
              {tab.type === 'tradingview' ? (
                <TradingViewHeatmap dataSource={tab.dataSource!} tick={tick} active={isActive} />
              ) : (
                <ChinaHeatmap tick={tick} active={isActive} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
