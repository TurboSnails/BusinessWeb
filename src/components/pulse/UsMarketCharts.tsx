import React, { useEffect, useId, useMemo, useState } from 'react'
import { Card } from '../ui'
import { aggregateCandles, periodKey } from './chinaHistory'
import type { HistoryCandle } from './chinaHistory'
import { aggregateMarketVolume, aggregateVolume, fetchUsIndex, isOngoing, loadMarketVolume, toYi, usIndexes, usPeriods } from './usHistory'
import type { UsIndexResult, UsIndexSymbol, UsPeriod, UsVolumeMetric, VolumePoint } from './usHistory'
import '../../styles/china-market.css'
import '../../styles/us-market.css'

const TITLE = '美股指数 K 线与成交'
const number = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const periodLabel = (date: string, period: UsPeriod) => period === 'day' ? date : `${periodKey(date, period)}${period === 'week' ? ' 当周' : ''}`
const localTime = (iso: string) => new Date(iso).toLocaleString('zh-CN', { hour12: false })

const W = 720, H = 265, LEFT = 68, RIGHT = 12, TOP = 12, BOTTOM = 30

/** 共用画布：网格线、首中末日期、十字线、拖动条；与 A 股 K 线保持同一套样式。 */
function usePlot(length: number) {
  const [index, setIndex] = useState(length - 1)
  const selected = Math.min(index, length - 1)
  const step = (W - LEFT - RIGHT) / length
  const x = (i: number) => LEFT + (i + .5) * step
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width) setIndex(Math.max(0, Math.min(length - 1, Math.floor(((e.clientX - rect.left) / rect.width * W - LEFT) / step))))
  }
  return { selected, setIndex, step, x, onPointerMove, body: Math.max(.8, Math.min(12, step * .65)) }
}

function Axes({ min, max, digits, dates, x, selected }: { min: number; max: number; digits: number; dates: string[]; x: (i: number) => number; selected: number }) {
  const y = (v: number) => TOP + (max - v) / (max - min) * (H - TOP - BOTTOM)
  const last = dates.length - 1
  return <>
    {[0, 1, 2, 3, 4].map(i => {
      const value = min + (max - min) * i / 4
      return <g key={i}><line className="china-chart__gridline" x1={LEFT} x2={W - RIGHT} y1={y(value)} y2={y(value)} /><text x={LEFT - 8} y={y(value) + 4} textAnchor="end">{value.toLocaleString('zh-CN', { maximumFractionDigits: digits })}</text></g>
    })}
    <line className="china-chart__crosshair" x1={x(selected)} x2={x(selected)} y1={TOP} y2={H - BOTTOM} />
    {[0, Math.floor(last / 2), last].filter((v, i, a) => a.indexOf(v) === i).map(i => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>{dates[i]}</text>)}
  </>
}

function Scrub({ value, max, date, label, onChange }: { value: number; max: number; date: string; label: string; onChange: (n: number) => void }) {
  const id = useId()
  return <div className="china-chart__scrub"><label htmlFor={id}>{label}</label><input id={id} type="range" min={0} max={max} value={value} onChange={e => onChange(Number(e.target.value))} aria-valuetext={date} /><span>{date}</span></div>
}

function CandlePlot({ rows, title, period, previousClose }: { rows: HistoryCandle[]; title: string; period: UsPeriod; previousClose?: number }) {
  const { selected, setIndex, x, onPointerMove, body } = usePlot(rows.length)
  const row = rows[selected]
  const changeAt = (i: number) => {
    const previous = i > 0 ? rows[i - 1].close : previousClose
    return previous && previous > 0 ? (rows[i].close - previous) / previous * 100 : null
  }
  const changeText = (c: number | null) => c === null ? '—' : `${c > 0 ? '+' : c < 0 ? '-' : ''}${number(Math.abs(c))}%`
  const change = changeAt(selected)
  const tone = change === null || change === 0 ? undefined : change > 0 ? 'china-chart__up' : 'china-chart__down'
  const low = Math.min(...rows.map(r => r.low)), high = Math.max(...rows.map(r => r.high))
  const padding = Math.max((high - low) * .08, high * .001)
  const min = low - padding, max = high + padding
  const y = (v: number) => TOP + (max - v) / (max - min) * (H - TOP - BOTTOM)
  return <>
    <div className="china-chart__readout" aria-live="polite" aria-atomic="true">
      <span>{periodLabel(row.date, period)}<small> 截至 {row.date}{isOngoing(row.date, period) ? ' · 进行中' : ''}</small></span>
      <span className="china-chart__ohlc">开 {number(row.open)}　高 {number(row.high)}　低 {number(row.low)}　收 <b className={tone}>{number(row.close)}</b>　<span title="本期收盘价相对上一期收盘价的变化；缺少上一期数据时显示 —" className={tone}>涨跌幅 {changeText(change)}</span></span>
    </div>
    <svg className="china-chart__plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}K线图，单位点；红涨绿跌`} onPointerMove={onPointerMove}>
      <Axes min={min} max={max} digits={0} dates={rows.map(r => r.date)} x={x} selected={selected} />
      {rows.map((r, i) => <g key={r.date} className={r.close >= r.open ? 'china-chart__up' : 'china-chart__down'}>
        <title>{r.date} 开 {r.open} 高 {r.high} 低 {r.low} 收 {r.close} 涨跌幅 {changeText(changeAt(i))}</title>
        <line x1={x(i)} x2={x(i)} y1={y(r.high)} y2={y(r.low)} stroke="currentColor" />
        <rect x={x(i) - body / 2} y={y(Math.max(r.open, r.close))} width={body} height={Math.max(1, Math.abs(y(r.open) - y(r.close)))} fill="currentColor" />
      </g>)}
    </svg>
    <Scrub label="查看日期" value={selected} max={rows.length - 1} date={row.date} onChange={setIndex} />
  </>
}

function VolumePlot({ rows, title, period }: { rows: VolumePoint[]; title: string; period: UsPeriod }) {
  const { selected, setIndex, x, onPointerMove, body } = usePlot(rows.length)
  const row = rows[selected]
  const high = Math.max(...rows.map(r => r.volume))
  const max = high + Math.max(high * .08, .01)
  const y = (v: number) => TOP + (max - v) / max * (H - TOP - BOTTOM)
  return <>
    <div className="china-chart__readout" aria-live="polite" aria-atomic="true">
      <span>{periodLabel(row.date, period)}<small> 截至 {row.date}{isOngoing(row.date, period) ? ' · 进行中' : ''}</small></span>
      <strong>{number(row.volume)} 亿股</strong>
    </div>
    <svg className="china-chart__plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}柱状图，单位亿股`} onPointerMove={onPointerMove}>
      <Axes min={0} max={max} digits={high >= 100 ? 0 : 1} dates={rows.map(r => r.date)} x={x} selected={selected} />
      {rows.map((r, i) => <g key={r.date} className="china-chart__volume">
        <title>{r.date} {number(r.volume)} 亿股</title>
        <rect x={x(i) - body / 2} y={y(r.volume)} width={body} height={Math.max(.6, y(0) - y(r.volume))} fill="currentColor" />
      </g>)}
    </svg>
    <Scrub label="查看日期" value={selected} max={rows.length - 1} date={row.date} onChange={setIndex} />
  </>
}

export default function UsMarketCharts() {
  const [symbol, setSymbol] = useState<UsIndexSymbol>('us^GSPC')
  const [period, setPeriod] = useState<UsPeriod>('day')
  const [limit, setLimit] = useState(60)
  const [metric, setMetric] = useState<UsVolumeMetric>('index')
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<UsIndexResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [market, setMarket] = useState<VolumePoint[] | null>(null)
  const index = usIndexes.find(i => i.id === symbol)!

  useEffect(() => {
    let active = true
    void loadMarketVolume().then(rows => { if (active) setMarket(rows) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timer = setTimeout(() => controller.abort(), 12_000)
    setLoading(true); setError(''); setResult(null)
    fetchUsIndex(symbol, controller.signal, refresh > 0)
      .then(data => { if (active) setResult(data) })
      .catch(e => { if (active) setError(controller.signal.aborted ? '行情请求超时，请重试' : e instanceof Error ? e.message : '行情暂时无法获取') })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false) })
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [symbol, refresh])

  const candles = useMemo(() => result ? aggregateCandles(result.rows, period) : [], [result, period])
  const visible = useMemo(() => limit === 0 ? candles : candles.slice(-limit), [candles, limit])
  const marketMetric = metric === 'market' && market !== null
  const volumeRows = useMemo(() => {
    if (marketMetric) return aggregateMarketVolume(market!, period)
    return result ? aggregateVolume(result.rows.map(r => ({ date: r.date, volume: toYi(r.volume) })), period) : []
  }, [marketMetric, market, result, period])
  const volumeVisible = limit === 0 ? volumeRows : volumeRows.slice(-limit)
  const volumeTitle = marketMetric ? '全美股票成交量' : `${index.label}成交量`
  const indexHasVolume = volumeRows.some(r => r.volume > 0)
  const status = (what: string) => loading ? <div className="china-chart__status" role="status">正在加载{what}…</div>
    : error ? <div className="china-chart__status" role="alert"><p>{error}</p><button className="tool-btn" onClick={() => setRefresh(n => n + 1)}>重试</button></div> : null
  const plotKey = `${symbol}:${period}:${limit}:${refresh}`

  return <div className="us-market"><Card as="section" title={TITLE} label={TITLE} className="china-chart"
    actions={<button className="tool-btn" onClick={() => setRefresh(n => n + 1)} disabled={loading}>刷新</button>}>
    <div className="china-chart__toolbar">
      <div className="china-chart__periods" role="group" aria-label="美股指数">
        {usIndexes.map(i => <button key={i.id} type="button" aria-pressed={symbol === i.id} onClick={() => setSymbol(i.id)}>{i.label}</button>)}
      </div>
      <div className="china-chart__periods" role="group" aria-label={`${TITLE}周期`}>
        {usPeriods.map(p => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}线</button>)}
      </div>
      <label className="china-chart__range">显示 <select aria-label={`${TITLE}显示范围`} value={limit} onChange={e => setLimit(Number(e.target.value))}>
        <option value={60}>最近60期</option><option value={120}>最近120期</option><option value={0}>可用历史</option>
      </select></label>
    </div>
    <div className="us-market__panels">
      <div className="us-market__panel" role="group" aria-label={`${index.label} K 线`}>
        <div className="china-chart__toolbar"><span className="us-market__panel-label">{index.label} · 点 · 红涨绿跌</span></div>
        {status(`${index.label}行情`) ?? (visible.length > 0 && <CandlePlot key={plotKey} rows={visible} title={index.label} period={period}
          previousClose={candles[candles.length - visible.length - 1]?.close} />)}
      </div>
      <div className="us-market__panel" role="group" aria-label="成交量">
        <div className="china-chart__toolbar">
          <div className="china-chart__periods" role="group" aria-label="成交量口径">
            <button type="button" aria-pressed={!marketMetric} onClick={() => setMetric('index')}>指数成交量</button>
            {market !== null && <button type="button" aria-pressed={marketMetric} onClick={() => setMetric('market')}>全美成交量</button>}
          </div>
          <span className="china-chart__unit">亿股 · 期间累计</span>
        </div>
        {marketMetric
          ? volumeVisible.length > 0 && <VolumePlot key={`market:${plotKey}`} rows={volumeVisible} title={volumeTitle} period={period} />
          : status(`${index.label}成交量`) ?? (!indexHasVolume
            ? <div className="china-chart__status" role="status">行情源暂未提供{index.label}的成交量</div>
            : <VolumePlot key={`index:${plotKey}`} rows={volumeVisible} title={volumeTitle} period={period} />)}
      </div>
    </div>
    <div className="china-chart__foot">
      <span>Yahoo Finance · {index.label}（{index.code}）指数日线，日期为纽约交易日</span>
      {result && <span>K 线数据截至 {result.rows[result.rows.length - 1].date} · 获取于 {localTime(result.fetchedAt)}（本机时间）</span>}
      {marketMetric
        ? <span>全美成交量来自 Cboe：各交易所与场外成交报告设施合计的美国股票成交股数，截至 {market![market!.length - 1].date}；仅有最近约一年的逐日记录{period !== 'day' ? '，不足整期的首期已略去' : ''}。</span>
        : <span>指数成交量是该指数成分股的合计成交量（Yahoo 口径），不代表全美市场成交{market !== null ? '；全市场请切到「全美成交量」' : ''}。</span>}
      {period !== 'day' && <span>当前周期随交易更新；历史首期可能不足完整周期。</span>}
      {result && <span>可用历史：{result.rows[0].date} 至 {result.rows[result.rows.length - 1].date}（{candles.length}期）</span>}
    </div>
  </Card></div>
}
