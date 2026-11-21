import React from 'react'
import { ExternalLink } from 'lucide-react'
import { format, signed, type Item } from './cards'
import { freshness, type Point } from './model'
import './weekly-brief.css'

/** Number of completed sessions the brief compares (start close → end close). */
export const SESSIONS = 5
/** A benchmark move smaller than this (in %) is treated as sideways, so no counter-evidence is asserted. */
export const FLAT_MOVE = 0.5
/** An indicator may trail the benchmark by at most this many calendar days and still be shown (marked as lagged). */
const MAX_LAG_DAYS = 3

export interface BriefSlice { id: string; name: string; symbol?: string; source: string; scope?: string; history: Point[] }
/** A daily indicator and how its direction maps onto the market: +1 = a rise supports stocks, -1 = a rise is a risk signal. */
export interface BriefSignal { item: Item; label: string; polarity: 1 | -1; min: number; mode?: 'diff' | 'pct' }

export interface Window { start: string; end: string; dates: string[] }
export interface Move { from: Point; to: Point; change: number; lagged: boolean }
export interface SliceMove extends Move { slice: BriefSlice; relative: number }
export interface SignalMove extends Move { signal: BriefSignal; unit: string; source: string; scope: string; meaningful: boolean; lean: -1 | 0 | 1 }
export interface Evidence { key: string; label: string; text: string; from: Point; to: Point; unit: string; source: string; scope: string; lagged?: boolean }
export type BriefState = 'complete' | 'partial' | 'stale' | 'missing'
export interface Brief {
  state: BriefState
  reason?: string
  window?: Window
  benchmark?: BriefSlice
  change?: number
  direction: -1 | 0 | 1
  peers: SliceMove[]
  unaligned: string[]
  signals: SignalMove[]
  skipped: { label: string; why: string }[]
  observations: string[]
  counter: Evidence[]
}

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000
const short = (date: string) => date.slice(5)
const pct = (a: number, b: number) => (b / a - 1) * 100
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (date: unknown): date is string => typeof date === 'string' && ISO_DATE.test(date) && Number.isFinite(Date.parse(date))
const validClose = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const diffUnit = (unit: string) => (unit.trim() === '%' ? ' 个百分点' : unit === '倍' ? '' : unit.startsWith(' ') ? unit : ` ${unit}`)

/** The last SESSIONS+1 closes of the benchmark, provided they are daily and contiguous enough to be one trading week. */
export function weekWindow(history: Point[]): Window | undefined {
  const tail = history.slice(-(SESSIONS + 1))
  if (tail.length < SESSIONS + 1) return undefined
  // Every close in the window must be a dated, finite, positive price in ascending order.
  if (!tail.every((point, i) => Array.isArray(point) && validDate(point[0]) && validClose(point[1]) && (i === 0 || point[0] > tail[i - 1][0]))) return undefined
  const start = tail[0][0], end = tail.at(-1)![0]
  // Five sessions span at most ~2 calendar weeks even with holidays; wider gaps mean weekly-only data.
  if (!(days(start, end) > 0 && days(start, end) <= 14)) return undefined
  return { start, end, dates: tail.map(([date]) => date) }
}

/** Change of a price series between exactly the window's start and end dates. */
export function alignedMove(history: Point[], window: Window): Move | undefined {
  const map = new Map(history)
  const a = map.get(window.start), b = map.get(window.end)
  if (!validClose(a) || !validClose(b)) return undefined
  return { from: [window.start, a], to: [window.end, b], change: pct(a, b), lagged: false }
}

/**
 * Indicator change over the same sessions. Uses the exact window dates when published;
 * otherwise, if the series trails by a few days, the SESSIONS benchmark sessions ending on its
 * latest observation (aligned on `calendar`, the benchmark's trading dates), flagged as lagged.
 * Only observations inside the compared range are checked for duplicates or disorder.
 */
export function signalMove(signal: BriefSignal, window: Window, calendar: string[] = window.dates): SignalMove | { why: string } {
  const reading = signal.item.reading
  const history = (reading?.history ?? []).filter(point => Array.isArray(point) && validDate(point[0]) && typeof point[1] === 'number' && Number.isFinite(point[1]))
  if (!reading || history.length < 2) return { why: '暂无数据' }
  if (!/日/.test(reading.frequency)) return { why: `${reading.frequency}数据，不做 5 日比较` }
  // Check only the observations used for this comparison, preserving their order.
  const range = (start: string, end: string) => {
    const points = history.filter(([date]) => date >= start && date <= end)
    return points.every((point, i) => i === 0 || point[0] > points[i - 1][0]) ? points : undefined
  }
  let from: Point | undefined, to: Point | undefined, lagged = false
  const exact = range(window.start, window.end)
  if (!exact) return { why: '窗口内日期重复或乱序，无法核对' }
  const map = new Map(exact)
  if (map.has(window.start) && map.has(window.end)) {
    from = [window.start, map.get(window.start)!]
    to = [window.end, map.get(window.end)!]
  } else {
    const latest = history.reduce((max, point) => (point[0] > max ? point[0] : max), history[0][0])
    const lag = days(latest, window.end)
    if (lag < 0 || lag > MAX_LAG_DAYS) return { why: lag < 0 ? '日期待核对' : `最新 ${latest}，较行情滞后超过 ${MAX_LAG_DAYS} 天` }
    // Same end date but no start observation is a gap, not a lag.
    if (lag === 0) return { why: `缺少 ${window.start} 观测，无法核对 5 个交易日` }
    const sessions = [...new Set(calendar)].filter(validDate).sort()
    const end = sessions.indexOf(latest)
    if (end < SESSIONS) return { why: `最新 ${latest} 无法对齐到前 5 个交易日` }
    const expected = sessions.slice(end - SESSIONS, end + 1)
    if (days(expected[0], latest) > 14) return { why: '基准交易日记录不足，无法核对周度窗口' }
    const points = range(expected[0], latest)
    // The lagged window must hold exactly those six sessions: no missing day, no non-trading day, no repeat.
    if (!points || points.length !== expected.length || points.some(([date], i) => date !== expected[i])) return { why: '近 5 个交易日观测不全或日期不符' }
    from = points[0]
    to = points.at(-1)!
    lagged = true
  }
  const unit = reading.unit
  const change = signal.mode === 'pct' ? (from[1] ? pct(from[1], to[1]) : NaN) : to[1] - from[1]
  if (!Number.isFinite(change)) return { why: '数值异常' }
  const meaningful = Math.abs(change) >= signal.min
  const lean = meaningful ? (Math.sign(change) * signal.polarity) as -1 | 1 : 0
  return { signal, from, to, change, lagged, unit, source: reading.source, scope: reading.scope, meaningful, lean }
}

const changeText = (move: SignalMove) => move.signal.mode === 'pct'
  ? signed(move.change, '%')
  : signed(move.change, diffUnit(move.unit))
const valueText = (value: number, unit: string) => format(Math.round(value * 100) / 100, unit === '倍' ? ' 倍' : unit)

/** Pure computation behind the brief, exported for tests. */
export function buildBrief({ benchmark, peers, signals, asOf, market }: { benchmark?: BriefSlice; peers: BriefSlice[]; signals: BriefSignal[]; asOf: string; market: 'us' | 'cn' }): Brief {
  const empty: Brief = { state: 'missing', direction: 0, peers: [], unaligned: [], signals: [], skipped: [], observations: [], counter: [] }
  if (!benchmark) return { ...empty, reason: market === 'us' ? '标普 500 行情快照暂不可用。' : '沪深300 行情快照暂不可用。' }
  const latest = benchmark.history.at(-1)?.[0]
  if (validDate(latest) && validDate(asOf) && latest > asOf) return { ...empty, benchmark, reason: `${benchmark.name}最新收盘日期 ${latest} 晚于查询日 ${asOf}，日期待核对，暂不计算周度变化。` }
  const window = weekWindow(benchmark.history)
  const own = window && alignedMove(benchmark.history, window)
  if (!window || !own) return { ...empty, benchmark, reason: `${benchmark.name}缺少最近 ${SESSIONS + 1} 个连续交易日收盘价，或收盘价无效，无法计算周度变化。` }
  const change = own.change
  const direction: -1 | 0 | 1 = Math.abs(change) < FLAT_MOVE ? 0 : change > 0 ? 1 : -1

  const moves: SliceMove[] = []
  const unaligned: string[] = []
  for (const slice of peers) {
    if (slice.id === benchmark.id) continue
    const move = alignedMove(slice.history, window)
    if (move) moves.push({ ...move, slice, relative: move.change - change })
    else unaligned.push(slice.name)
  }
  moves.sort((a, b) => b.change - a.change)

  const calendar = benchmark.history.filter(point => Array.isArray(point) && validDate(point[0]) && validClose(point[1])).map(([date]) => date)
  const sig: SignalMove[] = []
  const skipped: Brief['skipped'] = []
  for (const signal of signals) {
    const move = signalMove(signal, window, calendar)
    if ('why' in move) skipped.push({ label: signal.label, why: move.why })
    else sig.push(move)
  }

  const observations: string[] = []
  const up = moves.filter(m => m.change > 0).length
  const beat = moves.filter(m => m.relative > 0).length
  observations.push(`${benchmark.name} ${short(window.start)} → ${short(window.end)}（${SESSIONS} 个交易日）${signed(change, '%')}，收于 ${valueText(own.to[1], '')}`
    + (moves.length ? `；同期 ${moves.length} 个可比指数中 ${up} 个上涨、${beat} 个跑赢${benchmark.name}。` : '。'))
  if (moves.length >= 2) {
    const best = moves[0], worst = moves.at(-1)!
    observations.push(`分化：${best.slice.name} ${signed(best.change, '%')} 最强，${worst.slice.name} ${signed(worst.change, '%')} 最弱，强弱相差 ${format(Math.round((best.change - worst.change) * 100) / 100, ' 个百分点')}。`)
  }
  // Strongest indicator move, scaled by its own meaningful threshold.
  // Only indicators measured over the benchmark's exact window are compared with its direction.
  const ranked = sig.filter(m => m.meaningful && !m.lagged).sort((a, b) => Math.abs(b.change) / b.signal.min - Math.abs(a.change) / a.signal.min)
  const confirming = ranked.find(m => direction !== 0 && m.lean === direction) ?? ranked[0]
  if (confirming) {
    observations.push(`${confirming.signal.label} ${short(confirming.from[0])} → ${short(confirming.to[0])} 从 ${valueText(confirming.from[1], confirming.unit)} 到 ${valueText(confirming.to[1], confirming.unit)}（${changeText(confirming)}）`
      + `${direction !== 0 && confirming.lean === direction ? '，与指数方向一致' : direction !== 0 ? '，与指数方向相反' : ''}。`)
  }

  const counter: Evidence[] = []
  if (direction !== 0) {
    for (const move of sig) {
      if (move.lagged || move.lean !== -direction) continue
      counter.push({
        key: `signal-${move.signal.item.id ?? move.signal.label}`, label: move.signal.label,
        text: `${changeText(move)}，${move.lean > 0 ? '偏向支撑股市' : '偏向风险上升'}`,
        from: move.from, to: move.to, unit: move.unit, source: move.source, scope: move.scope, lagged: move.lagged,
      })
    }
    // Peers moving clearly against the benchmark are objective opposing evidence too.
    const against = moves.filter(m => direction > 0 ? m.change <= -FLAT_MOVE : m.change >= FLAT_MOVE)
    const ordered = direction > 0 ? [...against].reverse() : against
    for (const move of ordered.slice(0, 3)) {
      counter.push({
        key: `slice-${move.slice.id}`, label: move.slice.name,
        text: `同期 ${signed(move.change, '%')}，与${benchmark.name}方向相反`,
        from: move.from, to: move.to, unit: '', source: move.slice.source, scope: move.slice.scope ?? move.slice.symbol ?? '',
      })
    }
    if (against.length > 3) counter.push({
      key: 'slice-more', label: `另有 ${against.length - 3} 个指数`, text: '同样反向变动，见下方同类比较表',
      from: [window.start, NaN], to: [window.end, NaN], unit: '', source: '', scope: '',
    })
  }

  const stale = freshness(window.end, '每日', asOf) === '沿用上期'
  const partial = unaligned.length > 0 || skipped.length > 0 || sig.some(m => m.lagged)
  return {
    state: stale ? 'stale' : partial ? 'partial' : 'complete',
    reason: stale ? `行情最新收盘为 ${window.end}，已超过正常更新周期。` : undefined,
    window, benchmark, change, direction, peers: moves, unaligned, signals: sig, skipped, observations: observations.slice(0, 3), counter,
  }
}

const STATE_LABEL: Record<BriefState, string> = { complete: '数据完整', partial: '部分数据', stale: '数据过期', missing: '暂无数据' }

function EvidenceRow({ item }: { item: Evidence }) {
  const hasValues = Number.isFinite(item.from[1]) && Number.isFinite(item.to[1])
  return <li className="weekly-brief__evidence">
    <details>
      <summary><strong>{item.label}</strong> {item.text}{item.lagged && <span className="weekly-brief__tag">滞后</span>}</summary>
      {hasValues && <dl>
        <div><dt>起点</dt><dd><time dateTime={item.from[0]}>{item.from[0]}</time> {valueText(item.from[1], item.unit)}</dd></div>
        <div><dt>终点</dt><dd><time dateTime={item.to[0]}>{item.to[0]}</time> {valueText(item.to[1], item.unit)}</dd></div>
        {item.scope && <div><dt>口径</dt><dd>{item.scope}</dd></div>}
      </dl>}
      {/^https?:\/\//.test(item.source) && <a href={item.source} target="_blank" rel="noopener noreferrer">查看数据来源<ExternalLink size={13} aria-hidden="true" /></a>}
    </details>
  </li>
}

export default function WeeklyMarketBrief({ market, asOf, benchmark, peers, signals, loading = false }: {
  market: 'us' | 'cn'; asOf: string; benchmark?: BriefSlice; peers: BriefSlice[]; signals: BriefSignal[]; loading?: boolean
}): JSX.Element {
  const title = market === 'us' ? '本周美股变化' : '本周 A 股变化'
  const brief = buildBrief({ benchmark, peers, signals, asOf, market })
  const state: BriefState | 'loading' = loading && brief.state === 'missing' ? 'loading' : brief.state
  const headingId = `weekly-brief-${market}`
  const lagged = brief.signals.filter(move => move.lagged)
  return <section className="weekly-brief" aria-labelledby={headingId} data-state={state} data-market={market}>
    <header className="weekly-brief__head">
      <h2 id={headingId}>{title}</h2>
      <span className="weekly-brief__state" data-state={state}>{state === 'loading' ? '正在核对' : STATE_LABEL[state]}</span>
      {brief.window && <p className="weekly-brief__dates">
        比较 <time dateTime={brief.window.start}>{brief.window.start}</time> 收盘 → <time dateTime={brief.window.end}>{brief.window.end}</time> 收盘，共 {SESSIONS} 个交易日 · 查询日 {asOf}
      </p>}
    </header>
    {state === 'loading' && <p className="weekly-brief__muted">正在读取行情快照…</p>}
    {brief.reason && <p className="weekly-brief__alert" role={brief.state === 'stale' ? 'note' : undefined}>{brief.reason}</p>}
    {brief.observations.length > 0 && <ol className="weekly-brief__obs" aria-label="本周主要观察">
      {brief.observations.map((text, i) => <li key={i} data-lead={i === 0 ? '' : undefined}>
        {i === 0 && brief.change !== undefined ? <><span className="weekly-brief__big" data-sign={brief.change > 0 ? 'up' : brief.change < 0 ? 'down' : 'flat'}>{signed(brief.change, '%')}</span>{text}</> : text}
      </li>)}
    </ol>}
    {brief.window && <div className="weekly-brief__counter">
      <h3>反向证据</h3>
      {brief.direction === 0
        ? <p className="weekly-brief__muted">本周涨跌幅小于 {FLAT_MOVE}%，主方向不明显，暂不判定反向证据。</p>
        : brief.counter.length
          ? <><p className="weekly-brief__muted">以下客观读数与本周{brief.direction > 0 ? '上涨' : '下跌'}方向相反，点开查看起止数值与来源。</p>
            <ul>{brief.counter.map(item => <EvidenceRow key={item.key} item={item} />)}</ul></>
          : <p className="weekly-brief__muted">已检查 {brief.signals.length - lagged.length} 项同窗口指标和 {brief.peers.length} 个可比指数，本周未见与{brief.direction > 0 ? '上涨' : '下跌'}方向相反的明显读数。</p>}
    </div>}
    {(brief.unaligned.length > 0 || brief.skipped.length > 0 || lagged.length > 0) && <details className="weekly-brief__gaps">
      <summary>未纳入本周比较的数据（{brief.unaligned.length + brief.skipped.length + lagged.length} 项）</summary>
      <ul>
        {lagged.map(move => <li key={move.signal.label}><strong>{move.signal.label}</strong>：日期与行情窗口不同，仅作背景——<time dateTime={move.from[0]}>{move.from[0]}</time> {valueText(move.from[1], move.unit)} → <time dateTime={move.to[0]}>{move.to[0]}</time> {valueText(move.to[1], move.unit)}（{changeText(move)}），不计入反向证据</li>)}
        {brief.skipped.map(item => <li key={item.label}><strong>{item.label}</strong>：{item.why}</li>)}
        {brief.unaligned.length > 0 && <li><strong>{brief.unaligned.join('、')}</strong>：缺少 {brief.window?.start} 或 {brief.window?.end} 的同日收盘价</li>}
      </ul>
    </details>}
  </section>
}
