import React, { useEffect, useRef, useState } from 'react'
import { LayoutGrid, Maximize2, Minimize2, Columns2, Rows3, RefreshCw } from 'lucide-react'
import IndexHeatmap from './IndexHeatmap'
import type { IndexMarket } from './IndexHeatmap'
import { Card } from '../ui'
import '../../styles/pulse.css'

interface HeatmapTab {
  key: string
  label: string
  flag: string
  note: string
  index: IndexMarket
}

// 全部用自绘树图（TradingView Scanner 实时成分 + 行业/市值，腾讯行情实时报价，按行业分块）。
// 注：TradingView 嵌入式热力图 widget 会显示过期的快照（盘中仍是上一交易日涨跌），已弃用。
const TABS: HeatmapTab[] = [
  { key: 'spx', label: '标普500', flag: '🇺🇸', note: '绿涨红跌', index: 'spx' },
  { key: 'ndx', label: '纳斯达克100', flag: '🇺🇸', note: '绿涨红跌', index: 'ndx' },
  { key: 'hsi', label: '恒生指数', flag: '🇭🇰', note: '红涨绿跌', index: 'hsi' },
  { key: 'hstech', label: '恒生科技指数', flag: '🇭🇰', note: '红涨绿跌', index: 'hstech' },
  { key: 'csi500', label: '中证500', flag: '🇨🇳', note: '红涨绿跌', index: 'csi500' },
]

const REFRESH_INTERVAL = 20000 // 每 20 秒请求一次最新报价
type Layout = 'grid' | 'tabs'
const LAYOUT_KEY = 'pulse_heatmap_layout'

function initialLayout(): Layout {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved === 'grid' || saved === 'tabs') return saved
  } catch { /* 隐私模式等情况下忽略 */ }
  return window.innerWidth >= 1000 ? 'grid' : 'tabs'
}

/**
 * 市场热力图板块：
 * - 并排（默认，宽屏）：2×2 同时展示 4 张热力图，窄屏自动单列；
 * - 标签页：一次只看一张大图（访问过的保持挂载，切回不重新加载）；
 * - 每张图可全屏；布局选择记在本机。
 */
export default function HeatmapSection(): JSX.Element {
  const getInitialTab = (): string => {
    try {
      const param = new URLSearchParams(window.location.search).get('hm')
      if (param && TABS.some(t => t.key === param)) return param
    } catch { /* ignore */ }
    return 'spx'
  }
  const [layout, setLayout] = useState<Layout>(initialLayout)
  const [activeTab, setActiveTab] = useState(getInitialTab)
  const [visited, setVisited] = useState<Set<string>>(() => new Set([getInitialTab()]))
  const [tick, setTick] = useState(0)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const [fullscreenKey, setFullscreenKey] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const refreshQuotes = () => {
    setTick(t => t + 1)
    setCountdown(REFRESH_INTERVAL / 1000)
  }

  const changeLayout = (next: Layout) => {
    setLayout(next)
    try { localStorage.setItem(LAYOUT_KEY, next) } catch { /* ignore */ }
  }

  const handleTabClick = (key: string) => {
    setActiveTab(key)
    setVisited(prev => (prev.has(key) ? prev : new Set(prev).add(key)))
  }

  // 自绘指数图每 20 秒刷新；页面在后台时暂停
  useEffect(() => {
    const refresh = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      refreshQuotes()
    }, REFRESH_INTERVAL)
    const cd = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setCountdown(c => (c > 1 ? c - 1 : REFRESH_INTERVAL / 1000))
    }, 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshQuotes()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(refresh); clearInterval(cd); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  // 跟踪浏览器全屏状态（用户按 Esc 退出时同步）
  useEffect(() => {
    const onChange = () => {
      const el = document.fullscreenElement
      const entry = Object.entries(cardRefs.current).find(([, node]) => node === el)
      setFullscreenKey(entry ? entry[0] : null)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = (key: string) => {
    const node = cardRefs.current[key]
    if (!node) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void node.requestFullscreen?.().catch(() => undefined)
  }

  const pill = (isActive: boolean): string => (isActive ? 'ui-chip is-active' : 'ui-chip')

  const renderMap = (tab: HeatmapTab, active: boolean): JSX.Element => <IndexHeatmap market={tab.index} tick={tick} active={active} />

  const renderCard = (tab: HeatmapTab, bodyHeight: string, active: boolean, showTitle: boolean): JSX.Element => {
    const isFs = fullscreenKey === tab.key
    return (
      <div
        key={tab.key}
        ref={node => { cardRefs.current[tab.key] = node }}
        className={isFs ? 'heatmap-card is-fullscreen' : 'heatmap-card'}
        style={{ display: active ? undefined : 'none', gridColumn: layout === 'grid' && tab.index === 'csi500' ? '1 / -1' : undefined }}
      >
        <div className="heatmap-card__head">
          {showTitle && (
            <>
              <span aria-hidden="true">{tab.flag}</span>
              <span className="heatmap-card__title">{tab.label}</span>
              <span className="ui-badge ui-badge--neutral">{tab.note}</span>
            </>
          )}
          <button
            type="button"
            className="tool-btn heatmap-card__fs"
            onClick={() => toggleFullscreen(tab.key)}
            title={isFs ? '退出全屏' : '全屏查看'}
            aria-label={isFs ? `退出全屏 ${tab.label}` : `全屏查看 ${tab.label}`}
          >
            {isFs ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />} {isFs ? '退出' : '全屏'}
          </button>
        </div>
        <div className="heatmap-card__body" style={isFs ? undefined : { height: bodyHeight }}>
          {renderMap(tab, active)}
        </div>
      </div>
    )
  }

  const gridMode = layout === 'grid'

  return (
    <Card
      className="heatmap-section"
      title="市场热力图"
      icon={<LayoutGrid size={18} />}
      actions={<>
        <div role="group" aria-label="热力图布局" className="ui-cluster">
          <button type="button" onClick={() => changeLayout('grid')} aria-pressed={gridMode} className={pill(gridMode)}><Columns2 size={14} aria-hidden="true" /> 并排</button>
          <button type="button" onClick={() => changeLayout('tabs')} aria-pressed={!gridMode} className={pill(!gridMode)}><Rows3 size={14} aria-hidden="true" /> 标签页</button>
        </div>
        <button type="button" onClick={refreshQuotes} className="tool-btn"><RefreshCw size={14} aria-hidden="true" /> 刷新行情</button>
      </>}
      description={<>报价取自腾讯行情实时数据，各图标注行情时间；休市时显示最后交易日行情。每 {REFRESH_INTERVAL / 1000} 秒请求一次，<span className="heatmap-countdown">{countdown}s</span> 后刷新。</>}
    >
      {gridMode ? (
        // 并排：宽屏 2 列，窄屏 1 列；全部挂载，各自加载
        <div className="heatmap-grid">
          {TABS.map(tab => renderCard(tab, tab.index === 'csi500' ? '600px' : '480px', true, true))}
        </div>
      ) : (
        <>
          <div className="ui-cluster ui-cluster--scroll heatmap-tabs" role="group" aria-label="选择指数">
            {TABS.map(tab => (
              <button type="button" key={tab.key} onClick={() => handleTabClick(tab.key)} aria-pressed={tab.key === activeTab} className={pill(tab.key === activeTab)}>
                <span aria-hidden="true">{tab.flag}</span>{tab.label}
              </button>
            ))}
          </div>
          {/* 访问过的保持挂载（缓存），只显示当前 tab */}
          {TABS.map(tab => (visited.has(tab.key) ? renderCard(tab, 'clamp(460px, 68vh, 760px)', tab.key === activeTab, false) : null))}
        </>
      )}
    </Card>
  )
}
