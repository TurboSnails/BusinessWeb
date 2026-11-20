import React, { useState } from 'react'
import type { Point } from './model'
import './relative-performance.css'

/** Structural slice shape shared by the US and China market pages. */
export interface RelativeSlice {
  id: string
  name: string
  history: Point[]
  source?: string
  /** e.g. "标普 500 行业 ETF 代理 · 价格"; an ETF proxy is a fund price, not a pure price index. */
  scope?: string
  priceNote?: string
}

const isEtf = (slice: RelativeSlice) => /ETF/i.test(slice.scope ?? '')

export interface RelativePerformanceProps {
  market: 'us' | 'cn'
  slices: readonly RelativeSlice[]
  /** Today's date in the market's own time zone (New York / Shanghai), YYYY-MM-DD. */
  asOf?: string
}

interface Pair { asset: string; benchmark: string; label: string }

const PAIRS: Record<RelativePerformanceProps['market'], { title: string; note: string; pairs: Pair[] }> = {
  us: {
    title: '等权与市值加权',
    note: '标普 500 等权指数与标普 500（市值加权）的价格表现之差，用来观察涨跌是否集中在大市值成分股。',
    pairs: [{ asset: 'rsp', benchmark: 'spx', label: '等权 − 市值加权' }],
  },
  cn: {
    title: '风格相对沪深300',
    note: '小盘、红利、成长指数与沪深300的价格表现之差，用来观察不同风格之间的分化。',
    pairs: [
      { asset: '000852', benchmark: '000300', label: '小盘 − 沪深300' },
      { asset: '000922', benchmark: '000300', label: '红利 − 沪深300' },
      { asset: '399370', benchmark: '000300', label: '成长 − 沪深300' },
    ],
  },
}

export const HORIZONS = [5, 20] as const
const MAX_COMPARE = 3
const DAY = 86_400_000

export interface LegValue { start: Point; end: Point; ret: number }
export type HorizonResult =
  | { status: 'ok'; sessions: number; asset: LegValue; benchmark: LegValue; relative: number }
  | { status: 'insufficient'; sessions: number; available: number }
  | { status: 'gap'; sessions: number; date: string }
  | { status: 'weekly'; sessions: number }

export interface PairResult {
  /** Latest date both series actually have a close for; undefined when they share none. */
  end?: string
  assetLast?: string
  benchmarkLast?: string
  horizons: HorizonResult[]
}

type Closes = Map<string, number>

/** Sorted, de-duplicated closes with non-finite or non-positive values dropped (nothing is filled in). */
function clean(history: readonly Point[]): Closes {
  const rows: Closes = new Map()
  for (const [date, value] of [...history].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (typeof date === 'string' && Number.isFinite(value) && value > 0) rows.set(date, value)
  }
  return rows
}

/**
 * First date of the trailing daily run. Histories are weekly in the distant past and daily recently,
 * so walking back from the end, gaps of up to 4 days are sessions; a longer gap (holiday, ≤ 12 days)
 * is allowed only right after a short one, which a weekly cadence never has. Fewer than 3 daily
 * closes means the series is not daily.
 */
export function dailySince(dates: readonly string[]): string | undefined {
  const gap = (k: number) => (Date.parse(dates[k]) - Date.parse(dates[k - 1])) / DAY
  let i = dates.length - 1
  while (i > 0 && (gap(i) <= 4 || (gap(i) <= 12 && i > 1 && gap(i - 1) <= 4))) i--
  return dates.length - i >= 3 ? dates[i] : undefined
}

type Window =
  | { status: 'ok'; calendar: string[] }
  | { status: 'insufficient'; available: number }
  | { status: 'gap'; date: string; missing: number[] }
  | { status: 'weekly'; which: number[] }

/**
 * Common session window for several series. It ends on the latest date every series has a close for.
 * The calendar is the union of all their dates inside the span every series covers daily, so a day
 * one series lacks still counts as a session; the start must be a real close in every series.
 */
function sessionWindow(series: readonly Closes[], sessions: number): Window & { end?: string } {
  if (series.some(s => !s.size)) return { status: 'insufficient', available: 0 }
  const since = series.map(s => dailySince([...s.keys()]))
  const weekly = since.flatMap((d, i) => d ? [] : [i])
  if (weekly.length) return { status: 'weekly', which: weekly }
  const end = [...series[0].keys()].filter(date => series.every(s => s.has(date))).at(-1)
  if (!end) return { status: 'insufficient', available: 0 }
  const first = (since as string[]).sort().at(-1)!
  const calendar = [...new Set(series.flatMap(s => [...s.keys()]))].filter(date => date >= first && date <= end).sort()
  const endIndex = calendar.length - 1
  if (endIndex < sessions) return { status: 'insufficient', available: Math.max(endIndex, 0), end }
  const window = calendar.slice(endIndex - sessions)
  const missing = series.flatMap((s, i) => s.has(window[0]) ? [] : [i])
  return missing.length ? { status: 'gap', date: window[0], missing, end } : { status: 'ok', calendar: window, end }
}

const pct = (start: number, end: number) => (end / start - 1) * 100

/** Compare two price series over the same start and end dates; see sessionWindow for the rules. */
export function comparePair(asset: readonly Point[], benchmark: readonly Point[], horizons: readonly number[] = HORIZONS): PairResult {
  const a = clean(asset), b = clean(benchmark)
  const assetLast = [...a.keys()].at(-1), benchmarkLast = [...b.keys()].at(-1)
  const end = [...a.keys()].filter(date => b.has(date)).at(-1)
  return {
    end, assetLast, benchmarkLast,
    horizons: horizons.map((sessions): HorizonResult => {
      const w = sessionWindow([a, b], sessions)
      if (w.status === 'weekly') return { status: 'weekly', sessions }
      if (w.status === 'insufficient') return { status: 'insufficient', sessions, available: w.available }
      if (w.status === 'gap') return { status: 'gap', sessions, date: w.date }
      const start = w.calendar[0], last = w.calendar.at(-1)!
      const leg = (s: Closes): LegValue => ({ start: [start, s.get(start)!], end: [last, s.get(last)!], ret: pct(s.get(start)!, s.get(last)!) })
      const assetLeg = leg(a), benchLeg = leg(b)
      return { status: 'ok', sessions, asset: assetLeg, benchmark: benchLeg, relative: assetLeg.ret - benchLeg.ret }
    }),
  }
}

/** Weekdays strictly between two dates (holidays are not known here, so the copy stays factual). */
export function weekdaysBetween(from: string, to: string): number {
  let n = 0
  for (let t = Date.parse(from) + DAY; t < Date.parse(to); t += DAY) if (![0, 6].includes(new Date(t).getUTCDay())) n++
  return n
}

const num = (value: number, digits = 2) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
const signedText = (value: number, unit: string) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${num(Math.abs(value))}${unit}`

function Cell({ h }: { h: HorizonResult }) {
  const label = `近 ${h.sessions} 个交易日`
  if (h.status === 'weekly') return <td className="rel-perf__na" data-label={label}>— <small>仅有周频数据，不按交易日计算</small></td>
  if (h.status === 'insufficient') return <td className="rel-perf__na" data-label={label}>— <small>历史不足（{h.available} 个交易日）</small></td>
  if (h.status === 'gap') return <td className="rel-perf__na" data-label={label}>— <small>起点 {h.date} 缺少收盘值，未补值</small></td>
  return (
    <td data-label={label}>
      <strong>{signedText(h.relative, ' 个百分点')}</strong>
      <small>{signedText(h.asset.ret, '%')} 对 {signedText(h.benchmark.ret, '%')}</small>
    </td>
  )
}

const sourceLink = (slice: RelativeSlice) => slice.source && /^https?:\/\//.test(slice.source)
  ? <a href={slice.source} target="_blank" rel="noreferrer">{slice.name}</a> : slice.name

function Verify({ asset, benchmark, result }: { asset: RelativeSlice; benchmark: RelativeSlice; result: PairResult }) {
  const rows = result.horizons.filter((h): h is Extract<HorizonResult, { status: 'ok' }> => h.status === 'ok')
  if (!rows.length) return null
  return (
    <details className="rel-perf__verify">
      <summary>核对收盘值</summary>
      <table>
        <caption className="rel-perf__sr">{asset.name}与{benchmark.name}的起止收盘值</caption>
        <thead><tr><th scope="col">区间</th><th scope="col">指数</th><th scope="col">起点</th><th scope="col">终点</th><th scope="col">涨跌</th></tr></thead>
        <tbody>{rows.flatMap(h => ([[asset, h.asset], [benchmark, h.benchmark]] as const).map(([s, l], i) => (
          <tr key={`${h.sessions}-${s.id}`}>
            {i === 0 && <th scope="row" rowSpan={2}>{h.sessions} 日</th>}
            <td>{sourceLink(s)}</td>
            <td><time dateTime={l.start[0]}>{l.start[0]}</time> {num(l.start[1])}</td>
            <td><time dateTime={l.end[0]}>{l.end[0]}</time> {num(l.end[1])}</td>
            <td>{signedText(l.ret, '%')}</td>
          </tr>
        )))}</tbody>
      </table>
    </details>
  )
}

/** Every series rebased to 100 on the same start date; dates a series lacks stay empty. */
export function rebase(series: readonly Point[][], sessions: number): Window & { end?: string; values?: (number | undefined)[][] } {
  const closes = series.map(clean)
  const w = sessionWindow(closes, sessions)
  if (w.status !== 'ok') return w
  return { ...w, values: closes.map(s => w.calendar.map(date => s.has(date) ? s.get(date)! / s.get(w.calendar[0])! * 100 : undefined)) }
}

const W = 320, H = 132, TOP = 8, BOTTOM = 18, LEFT = 4, RIGHT = 30

function Overlay({ slices, defaults }: { slices: readonly RelativeSlice[]; defaults: { benchmark: string; compare: string[] } }) {
  // User choices are kept as-is; what is shown is derived each render, so slices that arrive after
  // the first mount (or disappear) never leave the selection blank or pointing at a missing index.
  const [picked, setPicked] = useState<{ benchmark?: string; compare?: string[] }>({})
  const [sessions, setSessions] = useState<number>(20)
  const [hover, setHover] = useState<number | null>(null)
  const usable = slices.filter(s => dailySince([...clean(s.history).keys()]))
  const has = (id: string) => usable.some(s => s.id.toLowerCase() === id)
  const benchmark = [picked.benchmark, defaults.benchmark, usable[0]?.id.toLowerCase()].find((id): id is string => !!id && has(id)) ?? ''
  const compare = Array.from({ length: MAX_COMPARE }, (_, i) => {
    const id = (picked.compare ?? defaults.compare)[i] ?? ''
    return id && has(id) && id !== benchmark ? id : ''
  })
  if (usable.length < 2) return null
  const setBenchmark = (id: string) => { setPicked(p => ({ ...p, benchmark: id })); setHover(null) }
  const setCompare = (i: number, id: string) => { setPicked(p => ({ ...p, compare: compare.map((v, j) => j === i ? id : v) })); setHover(null) }

  const byId = new Map(usable.map(s => [s.id.toLowerCase(), s]))
  const chosen = [benchmark, ...compare.filter((id, i) => id && id !== benchmark && compare.indexOf(id) === i)]
    .flatMap(id => byId.get(id) ? [byId.get(id)!] : [])
  const result = chosen.length >= 2 ? rebase(chosen.map(s => s.history), sessions) : undefined
  const weeklyCount = slices.length - usable.length
  const options = (keep: string, blank?: boolean) => <>
    {blank && <option value="">不选</option>}
    {usable.map(s => <option key={s.id} value={s.id.toLowerCase()} disabled={s.id.toLowerCase() !== keep && (s.id.toLowerCase() === benchmark || compare.includes(s.id.toLowerCase()))}>{s.name}{isEtf(s) ? '（ETF）' : ''}</option>)}
  </>

  let body: React.ReactNode
  if (!result) body = <p className="rel-perf__na">至少选择一个对比指数。</p>
  else if (result.status === 'weekly') body = <p className="rel-perf__na">{result.which.map(i => chosen[i].name).join('、')}仅有周频数据，不按交易日叠加。</p>
  else if (result.status === 'insufficient') body = <p className="rel-perf__na">共同的日线历史只有 {result.available} 个交易日，不足 {sessions} 个。</p>
  else if (result.status === 'gap') body = <p className="rel-perf__na">起点 {result.date} {result.missing.map(i => chosen[i].name).join('、')}没有收盘值；为避免补值，暂不叠加，可换一个区间或指数。</p>
  else {
    const { calendar, values } = result as { calendar: string[]; values: (number | undefined)[][] }
    const flat = values.flat().filter((v): v is number => v !== undefined)
    const lo = Math.min(100, ...flat), hi = Math.max(100, ...flat), pad = (hi - lo) * 0.08 || 1
    const last = calendar.length - 1
    const x = (i: number) => LEFT + (i / last) * (W - LEFT - RIGHT)
    const y = (v: number) => TOP + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H - TOP - BOTTOM)
    const path = (row: (number | undefined)[]) => row.map((v, i) => v === undefined ? '' : `${i && row[i - 1] !== undefined ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
    const shown = Math.min(hover ?? last, last)
    const ticks = [...new Set([hi, 100, lo])]
    const missing = chosen.flatMap((s, k) => {
      const dates = calendar.filter((_, i) => values[k][i] === undefined)
      return dates.length ? [`${s.name}缺 ${dates.join('、')}`] : []
    })
    const move = (event: React.PointerEvent<SVGSVGElement>) => {
      const box = event.currentTarget.getBoundingClientRect()
      const rel = ((event.clientX - box.left) / box.width) * W
      setHover(Math.max(0, Math.min(last, Math.round(((rel - LEFT) / (W - LEFT - RIGHT)) * last))))
    }
    const key = (event: React.KeyboardEvent<SVGSVGElement>) => {
      const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setHover(event.key === 'Home' ? 0 : last) }
      else if (step) { event.preventDefault(); setHover(Math.max(0, Math.min(last, shown + step))) }
    }
    const fmt = (v: number | undefined) => v === undefined ? '无数据' : num(v)
    body = <>
      <figure className="rel-perf__chart">
        <svg viewBox={`0 0 ${W} ${H}`} tabIndex={0} role="img" onPointerMove={move} onPointerLeave={() => setHover(null)} onKeyDown={key} onBlur={() => setHover(null)}
          aria-label={`${calendar[0]} 起均设为 100 的价格走势，至 ${calendar[last]}：${chosen.map((s, k) => `${s.name} ${fmt(values[k][last])}`).join('，')}。左右方向键可逐日查看。`}>
          {ticks.map(t => <g key={t}>
            <line className={t === 100 ? 'rel-perf__base' : 'us-chart__grid'} x1={LEFT} x2={W - RIGHT} y1={y(t)} y2={y(t)} />
            <text className="us-chart__tick" x={W - 2} y={y(t) + 3} textAnchor="end">{num(t, 1)}</text>
          </g>)}
          {hover !== null && <line className="us-chart__cursor" x1={x(shown)} x2={x(shown)} y1={TOP} y2={H - BOTTOM} />}
          {values.map((row, k) => <g key={chosen[k].id} className="rel-perf__series" data-k={k}>
            <path d={path(row)} />
            {row[shown] !== undefined && <circle cx={x(shown)} cy={y(row[shown]!)} r={2.6} />}
          </g>)}
          <text className="us-chart__axis" x={LEFT} y={H - 4}>{calendar[0]}</text>
          <text className="us-chart__axis" x={W - RIGHT} y={H - 4} textAnchor="end">{calendar[last]}</text>
        </svg>
        <figcaption>
          <time dateTime={calendar[shown]}>{calendar[shown]}</time>
          <ul className="rel-perf__legend">{chosen.map((s, k) => <li key={s.id} data-k={k}>{s.name}{k === 0 ? '（基准）' : ''} <b>{fmt(values[k][shown])}</b></li>)}</ul>
        </figcaption>
      </figure>
      {missing.length > 0 && <p className="rel-perf__warn">区间内未补值、线段断开：{missing.join('；')}。</p>}
      <details className="rel-perf__verify">
        <summary>查看逐日数据</summary>
        <table>
          <caption className="rel-perf__sr">起点为 100 的逐日数值</caption>
          <thead><tr><th scope="col">日期</th>{chosen.map(s => <th scope="col" key={s.id}>{s.name}</th>)}</tr></thead>
          <tbody>{calendar.map((date, i) => <tr key={date}><th scope="row">{date}</th>{values.map((row, k) => <td key={k}>{fmt(row[i])}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </>
  }

  return (
    <details className="rel-perf__overlay">
      <summary>叠加走势：自选指数，起点同为 100</summary>
      <div className="rel-perf__controls">
        <label>基准 <select value={benchmark} onChange={e => setBenchmark(e.target.value)}>{options(benchmark)}</select></label>
        {compare.map((id, i) => <label key={i}>对比 {i + 1} <select value={id} onChange={e => setCompare(i, e.target.value)}>{options(id, true)}</select></label>)}
        <fieldset>
          <legend className="rel-perf__sr">区间</legend>
          {HORIZONS.map(n => <label key={n} className="rel-perf__radio"><input type="radio" name={`rel-perf-span-${defaults.benchmark}`} checked={sessions === n} onChange={() => { setSessions(n); setHover(null) }} /> 近 {n} 个交易日</label>)}
        </fieldset>
      </div>
      <p className="rel-perf__hint">只比较收盘价格，不含分红；只用各指数实际有收盘值的日期。{weeklyCount > 0 ? `${weeklyCount} 个仅有周频数据的指数未列入。` : ''}</p>
      {chosen.some(isEtf) && <p className="rel-perf__hint">{chosen.filter(isEtf).map(s => s.name).join('、')}为 ETF 代理：用基金收盘价，含费用影响，与纯价格指数口径不同。</p>}
      {body}
    </details>
  )
}

type Sort = { sessions: number; dir: 'desc' | 'asc' } | null

/** Compact 5/20-session relative performance for the US or China market page. */
export default function RelativePerformance({ market, slices, asOf }: RelativePerformanceProps) {
  const [sort, setSort] = useState<Sort>(null)
  const config = PAIRS[market]
  const byId = new Map(slices.map(slice => [slice.id.toLowerCase(), slice]))
  const rows = config.pairs.map(pair => {
    const asset = byId.get(pair.asset), benchmark = byId.get(pair.benchmark)
    return { pair, asset, benchmark, result: asset && benchmark ? comparePair(asset.history, benchmark.history) : undefined }
  })
  // The market's latest session in this data set: the newest close among every slice the page has.
  const newest = slices.map(s => clean(s.history)).map(s => [...s.keys()].at(-1)).filter((d): d is string => !!d).sort().at(-1)
  const relativeOf = (r: typeof rows[number], n: number) => {
    const h = r.result?.horizons.find(item => item.sessions === n)
    return h?.status === 'ok' ? h.relative : undefined
  }
  const sorted = sort ? [...rows].sort((a, b) => {
    const va = relativeOf(a, sort.sessions), vb = relativeOf(b, sort.sessions)
    if (va === undefined || vb === undefined) return va === undefined ? (vb === undefined ? 0 : 1) : -1
    return sort.dir === 'desc' ? vb - va : va - vb
  }) : rows
  const sortable = rows.length > 1
  const headingId = `rel-perf-${market}`

  return (
    <section className="rel-perf" aria-labelledby={headingId}>
      <header>
        <h2 id={headingId}>相对表现 · {config.title}</h2>
        <p>{config.note}按两者都有收盘值的同一起止日期计算，单位为百分点；缺失日期不补值，价格指数不含分红。</p>
      </header>
      {sortable && <label className="rel-perf__sorter">排序
        <select value={sort ? `${sort.sessions}-${sort.dir}` : ''} onChange={e => {
          const [n, dir] = e.target.value.split('-')
          setSort(n ? { sessions: Number(n), dir: dir as 'desc' | 'asc' } : null)
        }}>
          <option value="">默认顺序</option>
          {HORIZONS.flatMap(n => [<option key={`${n}d`} value={`${n}-desc`}>近 {n} 日相对：高到低</option>, <option key={`${n}a`} value={`${n}-asc`}>近 {n} 日相对：低到高</option>])}
        </select>
        <span className="rel-perf__hint">缺值排在最后</span>
      </label>}
      <table className="rel-perf__table">
        <caption className="rel-perf__sr">{config.title}：近 5 个和近 20 个交易日的相对涨跌</caption>
        <thead>
          <tr><th scope="col">对比</th>{HORIZONS.map(n => {
            const active = sort?.sessions === n ? sort.dir : undefined
            return <th scope="col" key={n} aria-sort={sortable ? (active === 'desc' ? 'descending' : active === 'asc' ? 'ascending' : 'none') : undefined}>
              近 {n} 个交易日{active && <span aria-hidden="true">{active === 'desc' ? ' ↓' : ' ↑'}</span>}
            </th>
          })}<th scope="col">截至</th></tr>
        </thead>
        <tbody>{sorted.map(({ pair, asset, benchmark, result }) => {
          const name = asset && benchmark ? `${asset.name} 对 ${benchmark.name}` : pair.label
          if (!asset || !benchmark || !result) {
            const missing = [!asset && pair.asset, !benchmark && pair.benchmark].filter(Boolean).join('、')
            return <tr key={pair.asset}><th scope="row">{name}</th><td colSpan={HORIZONS.length + 1} className="rel-perf__na">暂无数据（缺少 {missing}）</td></tr>
          }
          const notes: string[] = []
          if (result.assetLast !== result.benchmarkLast) notes.push(`${asset.name}最新至 ${result.assetLast ?? '—'}，${benchmark.name}最新至 ${result.benchmarkLast ?? '—'}，按共同日期计算`)
          else if (result.end && newest && result.end < newest) notes.push(`两者均停在 ${result.end}，本市场最新交易日为 ${newest}`)
          else if (result.end && asOf && weekdaysBetween(result.end, asOf) > 0) notes.push(`两者均停在 ${result.end}，当地日期 ${asOf}，其间有 ${weekdaysBetween(result.end, asOf)} 个工作日无收盘值`)
          return (
            <tr key={pair.asset} data-stale={notes.length ? 'true' : undefined}>
              <th scope="row">
                <span>{name}</span>
                <Verify asset={asset} benchmark={benchmark} result={result} />
              </th>
              {result.horizons.map(h => <Cell key={h.sessions} h={h} />)}
              <td data-label="截至">
                {result.end ? <time dateTime={result.end}>{result.end}</time> : '—'}
                {notes.map(note => <small key={note} className="rel-perf__warn">{note}</small>)}
              </td>
            </tr>
          )
        })}</tbody>
      </table>
      <Overlay slices={slices} defaults={{ benchmark: config.pairs[0].benchmark, compare: config.pairs.map(p => p.asset) }} />
    </section>
  )
}
