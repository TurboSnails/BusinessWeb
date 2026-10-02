import React, { useEffect, useRef, useState } from 'react'
import { CSI300_CONSTITUENTS } from '../../data/csi300'

// ============ 数据类型 ============
interface HeatmapStock {
  ticker: string
  code: string
  name: string
  close: number | null
  change: number | null // 百分比
  marketCap: number | null
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// ============ 平方化树图布局算法（Squarified Treemap）============
function squarify(stocks: HeatmapStock[], x: number, y: number, w: number, h: number): Array<{ stock: HeatmapStock; rect: Rect }> {
  const result: Array<{ stock: HeatmapStock; rect: Rect }> = []
  const total = stocks.reduce((sum, s) => sum + (s.marketCap || 0), 0)
  if (total <= 0) return result

  let values = stocks.map(s => Math.max(s.marketCap || 0, total * 0.0005))
  let remaining: Rect = { x, y, w, h }
  let idx = 0

  const worst = (vals: number[], side: number) => {
    const sum = vals.reduce((a, b) => a + b, 0)
    const max = Math.max(...vals)
    const min = Math.min(...vals)
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
  }

  const layoutRow = (row: HeatmapStock[], rowValues: number[], rect: Rect, horizontal: boolean, remainingTotal: number) => {
    const sum = rowValues.reduce((a, b) => a + b, 0)
    const totalVal = remainingTotal
    if (horizontal) {
      const rowH = rect.h * (sum / totalVal)
      let cx = rect.x
      row.forEach((s, i) => {
        const cw = rect.w * (rowValues[i] / sum)
        result.push({ stock: s, rect: { x: cx, y: rect.y, w: cw, h: rowH } })
        cx += cw
      })
      return { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH }
    } else {
      const rowW = rect.w * (sum / totalVal)
      let cy = rect.y
      row.forEach((s, i) => {
        const ch = rect.h * (rowValues[i] / sum)
        result.push({ stock: s, rect: { x: rect.x, y: cy, w: rowW, h: ch } })
        cy += ch
      })
      return { x: rect.x + rowW, y: rect.y, w: rect.w - rowW, h: rect.h }
    }
  }

  while (idx < stocks.length && remaining.w > 0.5 && remaining.h > 0.5) {
    const horizontal = remaining.w >= remaining.h
    const side = horizontal ? remaining.h : remaining.w
    const restTotal = values.slice(idx).reduce((a, b) => a + b, 0)

    let row: HeatmapStock[] = []
    let rowValues: number[] = []
    let i = idx
    while (i < stocks.length) {
      const testVals = [...rowValues, values[i]]
      const testScale = side / restTotal
      const rowWorst = worst(testVals.map(v => v * testScale), side)
      const prevWorst = rowValues.length > 0 ? worst(rowValues.map(v => v * testScale), side) : Infinity
      if (rowValues.length > 0 && rowWorst > prevWorst) break
      row.push(stocks[i])
      rowValues.push(values[i])
      i++
    }
    if (row.length === 0) { row = [stocks[idx]]; rowValues = [values[idx]]; i = idx + 1 }

    remaining = layoutRow(row, rowValues, remaining, horizontal, restTotal)
    idx = i
  }
  return result
}

// ============ 颜色：A股红涨绿跌 ============
function blockColor(change: number | null): string {
  if (change === null || !isFinite(change)) return '#e5e7eb'
  const c = Math.max(-7, Math.min(7, change)) / 7
  if (c >= 0) {
    // 0% -> #fef2f2, +7% -> #dc2626
    const t = c
    const r = Math.round(254 + (220 - 254) * t)
    const g = Math.round(242 + (38 - 242) * t)
    const b = Math.round(242 + (38 - 242) * t)
    return `rgb(${r},${g},${b})`
  }
  const t = -c
  const r = Math.round(254 + (22 - 254) * t)
  const g = Math.round(242 + (163 - 242) * t)
  const b = Math.round(242 + (74 - 242) * t)
  return `rgb(${r},${g},${b})`
}

// ============ 数据获取（TradingView Scanner，免密钥 + CORS 友好）============
async function fetchCSI300Quotes(): Promise<HeatmapStock[]> {
  const nameMap = new Map(CSI300_CONSTITUENTS.map(c => [c.ticker, c.name]))
  const response = await fetch(
    'https://scanner.tradingview.com/china/scan?label-product=markets-screener',
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // 避免 CORS 预检
      body: JSON.stringify({
        columns: ['name', 'close', 'change', 'market_cap_basic'],
        symbols: { tickers: CSI300_CONSTITUENTS.map(c => c.ticker), query: { types: [] } },
      }),
    }
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json = await response.json()
  const rows: Array<{ s: string; d: Array<number | string | null> }> = json.data || []
  return rows.map(row => {
    const [code, , close, change, marketCap] = row.d
    return {
      ticker: row.s,
      code: String(code || row.s.split(':')[1]),
      name: nameMap.get(row.s) || String(code || ''),
      close: typeof close === 'number' ? close : null,
      change: typeof change === 'number' ? change : null,
      marketCap: typeof marketCap === 'number' ? marketCap : null,
    }
  })
}

// ============ 组件 ============
interface Props {
  tick: number // 每次 +1 触发重新拉取数据
  active: boolean
}

export default function ChinaHeatmap({ tick, active }: Props): JSX.Element {
  const [stocks, setStocks] = useState<HeatmapStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [hover, setHover] = useState<{ stock: HeatmapStock; px: number; py: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastLoadRef = useRef(0)
  const [size, setSize] = useState({ w: 800, h: 560 })

  const load = async () => {
    try {
      const data = await fetchCSI300Quotes()
      setStocks(data)
      setError('')
      setUpdatedAt(new Date().toLocaleTimeString('zh-CN'))
      lastLoadRef.current = Date.now()
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取失败')
    } finally {
      setLoading(false)
    }
  }

  // tick 变化时：仅激活状态才刷新（隐藏的缓存页保持数据不动）
  useEffect(() => {
    if (active) load()
  }, [tick])

  // 从隐藏切回激活时，若数据超过 60 秒则补一次刷新
  useEffect(() => {
    if (active && !loading && Date.now() - lastLoadRef.current > 60000) load()
  }, [active])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: Math.max(420, Math.min(720, window.innerHeight * 0.62)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const valid = stocks.filter(s => s.marketCap)
  const layout = squarify(valid, 0, 0, size.w, size.h)
  const ups = valid.filter(s => (s.change || 0) > 0).length
  const downs = valid.filter(s => (s.change || 0) < 0).length

  return (
    <div>
      {/* 统计条 */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '8px 4px', fontSize: '0.8rem', color: '#6b7280', flexWrap: 'wrap' }}>
        <span>成分股 {valid.length} 只</span>
        <span style={{ color: '#dc2626' }}>↑ 上涨 {ups}</span>
        <span style={{ color: '#16a34a' }}>↓ 下跌 {downs}</span>
        <span style={{ marginLeft: 'auto' }}>{updatedAt ? `更新于 ${updatedAt}` : ''}</span>
      </div>

      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: size.h, background: '#f9fafb', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
        {loading && stocks.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            ⏳ 正在加载沪深300行情...
          </div>
        )}
        {error && stocks.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', flexDirection: 'column', gap: '8px' }}>
            <span>⚠️ {error}</span>
            <button onClick={load} style={{ padding: '6px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>重试</button>
          </div>
        )}
        {layout.map(({ stock, rect }) => {
          const pct = stock.change
          const textColor = Math.abs(pct || 0) > 3.2 ? '#fff' : (pct || 0) > 0 ? '#b91c1c' : (pct || 0) < 0 ? '#15803d' : '#6b7280'
          const showLabel = rect.w > 52 && rect.h > 26
          const showPct = rect.w > 52 && rect.h > 40
          return (
            <div
              key={stock.ticker}
              onMouseMove={(e) => {
                const box = containerRef.current?.getBoundingClientRect()
                if (box) setHover({ stock, px: e.clientX - box.left, py: e.clientY - box.top })
              }}
              onMouseLeave={() => setHover(null)}
              style={{
                position: 'absolute',
                left: rect.x + 1,
                top: rect.y + 1,
                width: Math.max(0, rect.w - 2),
                height: Math.max(0, rect.h - 2),
                background: blockColor(pct),
                borderRadius: '2px',
                overflow: 'hidden',
                cursor: 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transition: active ? 'background 0.6s' : undefined,
              }}
            >
              {showLabel && (
                <span style={{ fontSize: rect.w > 90 ? '11px' : '10px', fontWeight: 600, color: textColor, whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                  {stock.name}
                </span>
              )}
              {showPct && (
                <span style={{ fontSize: '10px', color: textColor, lineHeight: 1.3 }}>
                  {pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : '--'}
                </span>
              )}
            </div>
          )
        })}

        {/* 悬浮提示 */}
        {hover && (
          <div style={{
            position: 'absolute',
            left: Math.min(hover.px + 12, size.w - 190),
            top: Math.max(hover.py - 10, 8),
            background: 'rgba(17,24,39,0.92)',
            color: 'white',
            padding: '8px 10px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            pointerEvents: 'none',
            zIndex: 10,
            lineHeight: 1.7,
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 700 }}>{hover.stock.name} <span style={{ opacity: 0.7 }}>{hover.stock.code}</span></div>
            <div>价格：{hover.stock.close !== null ? hover.stock.close.toFixed(2) : '--'}</div>
            <div>涨跌：<span style={{ color: (hover.stock.change || 0) >= 0 ? '#fca5a5' : '#86efac' }}>{hover.stock.change !== null ? `${hover.stock.change > 0 ? '+' : ''}${hover.stock.change.toFixed(2)}%` : '--'}</span></div>
            <div>市值：{hover.stock.marketCap ? `${(hover.stock.marketCap / 1e8).toFixed(0)}亿` : '--'}</div>
          </div>
        )}
      </div>
      <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '6px' }}>
        数据来源 TradingView · 成分股快照 2025-09（中证每半年调样，略有滞后） · 红涨绿跌
      </div>
    </div>
  )
}
