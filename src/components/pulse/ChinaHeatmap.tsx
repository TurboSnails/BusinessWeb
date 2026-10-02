import React, { useEffect, useRef, useState } from 'react'
import { CSI300_CONSTITUENTS } from '../../data/csi300'

// ============ 数据类型 ============
interface HeatmapStock {
  ticker: string
  code: string
  name: string
  sector: string
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

// TradingView 行业分类 → 中文
const SECTOR_CN: Record<string, string> = {
  'Finance': '金融', 'Technology Services': '技术服务', 'Electronic Technology': '电子科技', 'Consumer Non-Durables': '非耐用消费',
  'Consumer Durables': '耐用消费', 'Producer Manufacturing': '生产制造', 'Health Technology': '医疗科技', 'Process Industries': '加工工业',
  'Energy Minerals': '能源矿产', 'Non-Energy Minerals': '金属矿产', 'Utilities': '公用事业', 'Transportation': '交通运输', 'Retail Trade': '零售',
  'Commercial Services': '商业服务', 'Consumer Services': '消费服务', 'Industrial Services': '工业服务', 'Communications': '通信',
  'Distribution Services': '分销服务', 'Health Services': '医疗服务', 'Miscellaneous': '其他',
}

// ============ 平方化树图布局算法（Squarified Treemap），通用版 ============
function squarify<T>(items: T[], valueOf: (item: T) => number, x: number, y: number, w: number, h: number): Array<{ item: T; rect: Rect }> {
  const result: Array<{ item: T; rect: Rect }> = []
  const total = items.reduce((sum, s) => sum + valueOf(s), 0)
  if (total <= 0 || w <= 0 || h <= 0) return result

  const values = items.map(s => Math.max(valueOf(s), total * 0.0005))
  let remaining: Rect = { x, y, w, h }
  let idx = 0

  const worst = (vals: number[], side: number) => {
    const sum = vals.reduce((a, b) => a + b, 0)
    const max = Math.max(...vals)
    const min = Math.min(...vals)
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
  }

  const layoutRow = (row: T[], rowValues: number[], rect: Rect, horizontal: boolean, remainingTotal: number) => {
    const sum = rowValues.reduce((a, b) => a + b, 0)
    if (horizontal) {
      const rowH = rect.h * (sum / remainingTotal)
      let cx = rect.x
      row.forEach((s, i) => {
        const cw = rect.w * (rowValues[i] / sum)
        result.push({ item: s, rect: { x: cx, y: rect.y, w: cw, h: rowH } })
        cx += cw
      })
      return { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH }
    }
    const rowW = rect.w * (sum / remainingTotal)
    let cy = rect.y
    row.forEach((s, i) => {
      const ch = rect.h * (rowValues[i] / sum)
      result.push({ item: s, rect: { x: rect.x, y: cy, w: rowW, h: ch } })
      cy += ch
    })
    return { x: rect.x + rowW, y: rect.y, w: rect.w - rowW, h: rect.h }
  }

  while (idx < items.length && remaining.w > 0.5 && remaining.h > 0.5) {
    const horizontal = remaining.w >= remaining.h
    const side = horizontal ? remaining.h : remaining.w
    const restTotal = values.slice(idx).reduce((a, b) => a + b, 0)

    let row: T[] = []
    let rowValues: number[] = []
    let i = idx
    while (i < items.length) {
      const testVals = [...rowValues, values[i]]
      const testScale = side / restTotal
      const rowWorst = worst(testVals.map(v => v * testScale), side)
      const prevWorst = rowValues.length > 0 ? worst(rowValues.map(v => v * testScale), side) : Infinity
      if (rowValues.length > 0 && rowWorst > prevWorst) break
      row.push(items[i])
      rowValues.push(values[i])
      i++
    }
    if (row.length === 0) { row = [items[idx]]; rowValues = [values[idx]]; i = idx + 1 }

    remaining = layoutRow(row, rowValues, remaining, horizontal, restTotal)
    idx = i
  }
  return result
}

// 两级树图：先按行业分块，再在行业块内排个股
interface SectorBlock { name: string; rect: Rect; header: number; change: number; stocks: Array<{ stock: HeatmapStock; rect: Rect }> }
function layoutBySector(stocks: HeatmapStock[], w: number, h: number): SectorBlock[] {
  const groups = new Map<string, HeatmapStock[]>()
  stocks.forEach(s => { const k = s.sector || '其他'; groups.set(k, [...(groups.get(k) || []), s]) })
  const sectors = [...groups.entries()]
    .map(([name, list]) => ({ name, list: list.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)), cap: list.reduce((sum, s) => sum + (s.marketCap || 0), 0) }))
    .sort((a, b) => b.cap - a.cap)
  return squarify(sectors, s => s.cap, 0, 0, w, h).map(({ item, rect }) => {
    const header = rect.w > 70 && rect.h > 46 ? 18 : 0
    const gap = 2
    const inner = { x: rect.x + gap, y: rect.y + gap + header, w: Math.max(0, rect.w - gap * 2), h: Math.max(0, rect.h - gap * 2 - header) }
    const capSum = item.cap || 1
    const change = item.list.reduce((sum, s) => sum + (s.change || 0) * (s.marketCap || 0), 0) / capSum
    return {
      name: SECTOR_CN[item.name] || item.name, rect, header, change,
      stocks: squarify(item.list, s => s.marketCap || 0, inner.x, inner.y, inner.w, inner.h).map(r => ({ stock: r.item, rect: r.rect })),
    }
  })
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
        columns: ['name', 'close', 'change', 'market_cap_basic', 'sector'],
        symbols: { tickers: CSI300_CONSTITUENTS.map(c => c.ticker), query: { types: [] } },
      }),
    }
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json = await response.json()
  const rows: Array<{ s: string; d: Array<number | string | null> }> = json.data || []
  return rows.map(row => {
    const [code, close, change, marketCap, sector] = row.d
    return {
      ticker: row.s,
      code: String(code || row.s.split(':')[1]),
      name: nameMap.get(row.s) || String(code || ''),
      sector: typeof sector === 'string' ? sector : '',
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

// 图例渐变：-7% … 0 … +7%（红涨绿跌）
const LEGEND = [-7, -3.5, 0, 3.5, 7]

export default function ChinaHeatmap({ tick, active }: Props): JSX.Element {
  const [stocks, setStocks] = useState<HeatmapStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [hover, setHover] = useState<{ stock: HeatmapStock; px: number; py: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastLoadRef = useRef(0)
  const [size, setSize] = useState({ w: 800, h: 460 })

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

  // 画布尺寸跟随父容器（由 HeatmapSection 决定高度，支持全屏）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const valid = stocks.filter(s => s.marketCap)
  const blocks = layoutBySector(valid, size.w, size.h)
  const ups = valid.filter(s => (s.change || 0) > 0).length
  const downs = valid.filter(s => (s.change || 0) < 0).length
  const flat = valid.length - ups - downs

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 统计条 + 图例 */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '2px 2px 8px', fontSize: '0.78rem', color: '#6b7280', flexWrap: 'wrap' }}>
        <span>沪深300 · {valid.length} 只</span>
        <span style={{ color: '#dc2626', fontWeight: 600 }}>↑ {ups}</span>
        <span style={{ color: '#16a34a', fontWeight: 600 }}>↓ {downs}</span>
        {flat > 0 && <span>— {flat}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {LEGEND.map(v => (
            <span key={v} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span style={{ width: 22, height: 8, background: blockColor(v), borderRadius: 2 }} />
              <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>{v > 0 ? `+${v}` : v}%</span>
            </span>
          ))}
          {updatedAt && <span style={{ marginLeft: 8, color: '#9ca3af' }}>{updatedAt}</span>}
        </span>
      </div>

      <div ref={containerRef} style={{ position: 'relative', width: '100%', flex: 1, minHeight: 0, background: '#e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
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
        {blocks.map(block => (
          <React.Fragment key={block.name}>
            {/* 行业外框 + 标题 */}
            <div style={{ position: 'absolute', left: block.rect.x, top: block.rect.y, width: Math.max(0, block.rect.w), height: Math.max(0, block.rect.h), background: '#374151', boxSizing: 'border-box', border: '1px solid #f3f4f6' }} />
            {block.header > 0 && (
              <div style={{
                position: 'absolute', left: block.rect.x + 2, top: block.rect.y + 2, width: Math.max(0, block.rect.w - 4), height: block.header,
                display: 'flex', alignItems: 'center', gap: '6px', padding: '0 4px', boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'nowrap',
                fontSize: '11px', fontWeight: 700, color: '#f9fafb', pointerEvents: 'none',
              }}>
                <span>{block.name}</span>
                <span style={{ fontWeight: 500, color: block.change > 0 ? '#fca5a5' : block.change < 0 ? '#86efac' : '#d1d5db' }}>
                  {block.change > 0 ? '+' : ''}{block.change.toFixed(2)}%
                </span>
              </div>
            )}
            {block.stocks.map(({ stock, rect }) => {
              const pct = stock.change
              const textColor = Math.abs(pct || 0) > 3.2 ? '#fff' : (pct || 0) > 0 ? '#991b1b' : (pct || 0) < 0 ? '#166534' : '#4b5563'
              const minSide = Math.min(rect.w, rect.h)
              const showLabel = rect.w > 40 && rect.h > 22
              const showPct = rect.w > 40 && rect.h > 36
              const fontSize = Math.max(10, Math.min(16, minSide / 4.2))
              return (
                <div
                  key={stock.ticker}
                  onMouseMove={(e) => {
                    const box = containerRef.current?.getBoundingClientRect()
                    if (box) setHover({ stock, px: e.clientX - box.left, py: e.clientY - box.top })
                  }}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    position: 'absolute', left: rect.x + 0.5, top: rect.y + 0.5, width: Math.max(0, rect.w - 1), height: Math.max(0, rect.h - 1),
                    background: blockColor(pct), overflow: 'hidden', cursor: 'default',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    transition: active ? 'background 0.6s' : undefined,
                  }}
                >
                  {showLabel && (
                    <span style={{ fontSize: `${fontSize}px`, fontWeight: 600, color: textColor, whiteSpace: 'nowrap', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'clip' }}>
                      {stock.name}
                    </span>
                  )}
                  {showPct && (
                    <span style={{ fontSize: `${Math.max(9, fontSize - 2)}px`, color: textColor, lineHeight: 1.3 }}>
                      {pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : '--'}
                    </span>
                  )}
                </div>
              )
            })}
          </React.Fragment>
        ))}

        {/* 悬浮提示 */}
        {hover && (
          <div style={{
            position: 'absolute',
            left: Math.max(4, Math.min(hover.px + 12, size.w - 190)),
            top: Math.max(Math.min(hover.py - 10, size.h - 110), 8),
            background: 'rgba(17,24,39,0.92)', color: 'white', padding: '8px 10px', borderRadius: '6px', fontSize: '0.75rem',
            pointerEvents: 'none', zIndex: 10, lineHeight: 1.7, whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 700 }}>{hover.stock.name} <span style={{ opacity: 0.7 }}>{hover.stock.code}</span></div>
            <div style={{ opacity: 0.8 }}>{SECTOR_CN[hover.stock.sector] || hover.stock.sector || '—'}</div>
            <div>价格：{hover.stock.close !== null ? hover.stock.close.toFixed(2) : '--'}</div>
            <div>涨跌：<span style={{ color: (hover.stock.change || 0) >= 0 ? '#fca5a5' : '#86efac' }}>{hover.stock.change !== null ? `${hover.stock.change > 0 ? '+' : ''}${hover.stock.change.toFixed(2)}%` : '--'}</span></div>
            <div>市值：{hover.stock.marketCap ? `${(hover.stock.marketCap / 1e8).toFixed(0)}亿` : '--'}</div>
          </div>
        )}
      </div>
      <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '6px' }}>
        数据 TradingView · 成分股快照 2025-09（中证每半年调样，略有滞后）· 红涨绿跌 · 方块面积 = 市值
      </div>
    </div>
  )
}
