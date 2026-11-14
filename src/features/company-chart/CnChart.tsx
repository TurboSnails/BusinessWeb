// 沪深个股自绘日/周线（design.md 任务卡 D8）。绘图方式沿用 src/components/pulse/ChinaMarketCharts.tsx（SVG、红涨绿跌），
// 数据走现有腾讯前复权日线代理 /api/grid-market?kind=candles（server/market.mjs，只接受 sh/sz 六位代码）。
// 北交所不在接口范围内，由上层直接显示空状态。图中价格只供看图，不回写任何研究数据。
import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { aggregateCandles, parseHistory, type HistoryCandle } from '../../components/pulse/chinaHistory'
import { PageDataFreshness } from '../../components/ui/PageDataFreshness'
import { useInView } from './useInView'
import '../../styles/china-market.css'
import './company-chart.css'

type CnPeriod = 'day' | 'week'
type Loaded = { rows: HistoryCandle[]; fetchedAt: string }

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
const VISIBLE = 120
const number = (n: number): string => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const isoDay = (d: Date): string => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })

export function candlesUrl(tencentSymbol: string, today = new Date()): string {
  const begin = new Date(today)
  begin.setFullYear(begin.getFullYear() - 3)
  return `${API_BASE}/api/grid-market?${new URLSearchParams({ kind: 'candles', symbol: tencentSymbol, begin: isoDay(begin), end: isoDay(today) })}`
}

export async function fetchCnCandles(tencentSymbol: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Loaded> {
  const response = await fetchImpl(candlesUrl(tencentSymbol), { signal })
  if (!response.ok) throw new Error('行情服务暂时不可用')
  const json = await response.json() as { data?: Record<string, { qfqday?: unknown; day?: unknown }> }
  const node = json.data?.[tencentSymbol]
  const raw = node?.qfqday ?? node?.day
  if (!Array.isArray(raw) || raw.length === 0) return { rows: [], fetchedAt: new Date().toISOString() }
  return { rows: parseHistory(raw), fetchedAt: new Date().toISOString() }
}

function CandlePlot({ rows, title }: { rows: HistoryCandle[]; title: string }): JSX.Element {
  const [index, setIndex] = useState(rows.length - 1)
  const selected = Math.min(index, rows.length - 1)
  const row = rows[selected]
  const id = useId()
  const width = 720, height = 300, left = 56, right = 10, top = 10, priceBottom = 210, volTop = 226, bottom = 22
  const plotWidth = width - left - right
  const low = Math.min(...rows.map(r => r.low)), high = Math.max(...rows.map(r => r.high))
  const pad = Math.max((high - low) * 0.06, high * 0.002)
  const min = low - pad, max = high + pad
  const y = (v: number): number => top + (max - v) / (max - min) * (priceBottom - top)
  const vmax = Math.max(...rows.map(r => r.volume), 1)
  const vy = (v: number): number => height - bottom - v / vmax * (height - bottom - volTop)
  const step = plotWidth / rows.length, x = (i: number): number => left + (i + 0.5) * step
  const body = Math.max(0.8, Math.min(10, step * 0.65))
  const prev = selected > 0 ? rows[selected - 1].close : undefined
  const change = prev ? (row.close - prev) / prev * 100 : null
  const tone = (r: HistoryCandle): string => (r.close >= r.open ? 'china-chart__up' : 'china-chart__down')
  return <>
    <div className="china-chart__readout" aria-live="polite" aria-atomic="true">
      <span>{row.date}</span>
      <span className="china-chart__ohlc">开 {number(row.open)}　高 {number(row.high)}　低 {number(row.low)}　收 <b className={tone(row)}>{number(row.close)}</b>
        {change !== null && <>　<span className={change > 0 ? 'china-chart__up' : change < 0 ? 'china-chart__down' : undefined}>涨跌幅 {change > 0 ? '+' : change < 0 ? '−' : ''}{number(Math.abs(change))}%</span></>}
      </span>
    </div>
    <svg className="china-chart__plot cc-cn-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}K线图，单位元，前复权；红涨绿跌`}
      onPointerMove={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        if (rect.width) setIndex(Math.max(0, Math.min(rows.length - 1, Math.floor(((e.clientX - rect.left) / rect.width * width - left) / step))))
      }}>
      {[0, 1, 2, 3, 4].map(i => {
        const v = min + (max - min) * i / 4
        return <g key={i}><line className="china-chart__gridline" x1={left} x2={width - right} y1={y(v)} y2={y(v)} /><text x={left - 6} y={y(v) + 4} textAnchor="end">{v.toLocaleString('zh-CN', { maximumFractionDigits: v >= 100 ? 0 : 2 })}</text></g>
      })}
      {rows.map((r, i) => <g key={r.date} className={tone(r)}>
        <line x1={x(i)} x2={x(i)} y1={y(r.high)} y2={y(r.low)} stroke="currentColor" />
        <rect x={x(i) - body / 2} y={y(Math.max(r.open, r.close))} width={body} height={Math.max(1, Math.abs(y(r.open) - y(r.close)))} fill="currentColor" />
        <rect x={x(i) - body / 2} y={vy(r.volume)} width={body} height={Math.max(0.5, vy(0) - vy(r.volume))} fill="currentColor" opacity={0.55} />
      </g>)}
      <line className="china-chart__crosshair" x1={x(selected)} x2={x(selected)} y1={top} y2={height - bottom} />
      {[0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}>{rows[i].date}</text>)}
    </svg>
    <div className="china-chart__scrub"><label htmlFor={id}>查看日期</label><input id={id} type="range" min={0} max={rows.length - 1} value={selected} onChange={e => setIndex(Number(e.target.value))} aria-valuetext={row.date} /><span>{row.date}</span></div>
  </>
}

export default function CnChart({ tencentSymbol, name, externalUrl, fetchImpl }: { tencentSymbol: string; name: string; externalUrl?: string; fetchImpl?: typeof fetch }): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const inView = useInView(box, tencentSymbol)
  const [requested, setRequested] = useState(false)
  const [period, setPeriod] = useState<CnPeriod>('day')
  const [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const active = inView || requested
  const skipId = `cc-after-chart-${tencentSymbol}`

  useEffect(() => { setRequested(false); setData(null); setError('') }, [tencentSymbol])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let alive = true
    const timer = setTimeout(() => controller.abort(), 12_000)
    setLoading(true); setError(''); setData(null)
    fetchCnCandles(tencentSymbol, controller.signal, fetchImpl)
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) setError(controller.signal.aborted ? '行情请求超时' : e instanceof Error ? e.message : '行情暂时无法获取') })
      .finally(() => { clearTimeout(timer); if (alive) setLoading(false) })
    return () => { alive = false; clearTimeout(timer); controller.abort() }
  }, [active, tencentSymbol, attempt, fetchImpl])

  const rows = useMemo(() => (data ? aggregateCandles(data.rows, period).slice(-VISIBLE) : []), [data, period])
  const last = rows[rows.length - 1]
  const summary = rows.length
    ? `近 ${rows.length} ${period === 'day' ? '个交易日' : '周'}区间 ${number(Math.min(...rows.map(r => r.low)))}–${number(Math.max(...rows.map(r => r.high)))} 元，最新收盘 ${number(last.close)} 元（${last.date}）`
    : ''

  return (
    <figure className="cc-chart cc-chart--cn china-chart" aria-label={`${name} 走势图`}>
      <a className="cc-skip" href={`#${skipId}`}>跳过走势图</a>
      <div className="china-chart__toolbar">
        <div className="china-chart__periods" role="group" aria-label="走势图周期">
          {(['day', 'week'] as const).map(p => <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{p === 'day' ? '日线' : '周线'}</button>)}
        </div>
        <span className="china-chart__unit">元 · 前复权 · 红涨绿跌</span>
      </div>
      <div ref={box} className="cc-chart__frame cc-chart__frame--auto">
        {!active ? (
          <div className="cc-chart__placeholder">
            <button type="button" className="tool-btn" onClick={() => setRequested(true)}>加载走势图</button>
            <span>滚动到这里时自动加载</span>
          </div>
        ) : loading ? <div className="cc-chart__placeholder" role="status">正在加载走势图…</div>
          : error ? (
            <div className="cc-chart__placeholder" role="alert">
              <p>走势图暂时无法获取：{error}。页面其他内容不受影响。</p>
              <button type="button" className="tool-btn" onClick={() => setAttempt(n => n + 1)}>重试</button>
            </div>
          ) : rows.length === 0 ? (
            <div className="cc-chart__placeholder" role="note">行情源没有返回这只股票的日线数据（可能停牌、退市或代码有误）。</div>
          ) : <CandlePlot key={`${tencentSymbol}:${period}`} rows={rows} title={`${name}${period === 'day' ? '日线' : '周线'}`} />}
      </div>
      <figcaption className="cc-chart__caption">
        {summary && <span>{summary}。</span>}
        {data && last && <PageDataFreshness checkedAt={data.fetchedAt} dataLabel="行情日期" dataDates={[last.date]} note="来源：腾讯前复权日线（收盘后数据，EOD）" />}
        {externalUrl && <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="rn-link">在 TradingView 查看 ↗</a>}
      </figcaption>
      <span id={skipId} tabIndex={-1} />
    </figure>
  )
}
