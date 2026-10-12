import { useEffect, useMemo, useState } from 'react'
import { Card, EmptyState, TableWrap } from '../../components/ui'
import { fetchHistory } from '../../components/pulse/chinaHistory'
import { backfillBoards, loadBoardCache, type BoardBackfill } from './backfill'
import { buildTrend, candlesToChanges, deltaOf, type IndexChanges, type TrendMetric, type TrendRow, type TrendSymbol } from './trend'
import { valueText } from './Panels'
import type { DailySnapshot } from './types'

const RANGES = [5, 10, 20] as const
const SYMBOLS: TrendSymbol[] = ['sh000001', 'sz399001', 'sz399006']
const tone = (value: number | null) => value === null || value === 0 ? '' : value > 0 ? 'daily-up' : 'daily-down'
const signed = (value: number | null, suffix = '') => value === null ? '—' : `${value > 0 ? '+' : ''}${valueText(value, suffix)}`

/** 回补近期指数日涨跌；失败时静默跳过，只显示已归档快照。 */
function useIndexBackfill(): IndexChanges {
  const [changes, setChanges] = useState<IndexChanges>({})
  useEffect(() => {
    const controller = new AbortController()
    Promise.allSettled(SYMBOLS.map(symbol => fetchHistory(symbol, 'day', controller.signal))).then(results => {
      if (controller.signal.aborted) return
      const next: IndexChanges = {}
      results.forEach((result, i) => {
        if (result.status !== 'fulfilled') return
        for (const [date, change] of Object.entries(candlesToChanges(result.value.rows))) (next[date] ??= {})[SYMBOLS[i]] = change
      })
      setChanges(next)
    })
    return () => controller.abort()
  }, [])
  return changes
}

/** 回补没有快照的交易日的连板数与最高板（财联社，历史不再变化，已请求过的日期读本机缓存）。 */
function useBoardBackfill(dates: string[]): BoardBackfill {
  const [boards, setBoards] = useState<BoardBackfill>(loadBoardCache)
  const key = dates.join(',')
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    backfillBoards(key.split(','), loadBoardCache(), controller.signal, next => { if (!controller.signal.aborted) setBoards(next) })
    return () => controller.abort()
  }, [key])
  return boards
}

function Spark({ label, rows, keys, unit }: { label: string; rows: TrendRow[]; keys: Array<{ key: TrendMetric; cls: string }>; unit: string }): JSX.Element {
  const ordered = [...rows].reverse()
  if (keys.every(({ key }) => ordered.filter(row => row[key] !== null).length < 2)) return <></>
  const values = ordered.flatMap(row => keys.map(({ key }) => row[key])).filter((v): v is number => v !== null)
  const max = Math.max(...values, 1), w = 240, h = 64, step = ordered.length > 1 ? w / (ordered.length - 1) : 0
  const y = (v: number) => h - 4 - (v / max) * (h - 12)
  const lines = keys.map(({ key, cls }) => {
    const segments: string[] = []
    let open = ''
    ordered.forEach((row, i) => {
      const v = row[key]
      if (v === null) { if (open) segments.push(open); open = ''; return }
      open += `${open ? 'L' : 'M'}${(ordered.length > 1 ? i * step : w / 2).toFixed(1)},${y(v).toFixed(1)}`
    })
    if (open) segments.push(open)
    return { cls, key, path: segments.join(' '), dots: ordered.flatMap((row, i) => row[key] === null ? [] : [{ x: ordered.length > 1 ? i * step : w / 2, y: y(row[key]!), d: row.date }]) }
  })
  return <figure className="daily-spark"><figcaption>{label}<small>{unit}</small></figcaption>
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}趋势`} preserveAspectRatio="none">
      {lines.map(line => <g key={line.key} className={line.cls}><path d={line.path} fill="none" />{line.dots.map(dot => <circle key={dot.d} cx={dot.x} cy={dot.y} r="2.5" />)}</g>)}
    </svg></figure>
}

function Delta({ rows, index, k }: { rows: TrendRow[]; index: number; k: TrendMetric }): JSX.Element | null {
  const d = deltaOf(rows, index, k)
  return d === null || d === 0 ? null : <small className={d > 0 ? 'daily-up' : 'daily-down'}>{d > 0 ? '▲' : '▼'}{valueText(Math.abs(d))}</small>
}

export function TrendSection({ snapshots, selected, onSelect }: { snapshots: DailySnapshot[]; selected: string; onSelect: (date: string) => void }): JSX.Element {
  const [days, setDays] = useState<(typeof RANGES)[number]>(10)
  const backfill = useIndexBackfill()
  const archivedDates = useMemo(() => new Set(snapshots.map(snapshot => snapshot.dataDate)), [snapshots])
  const missing = useMemo(() => buildTrend(snapshots, backfill, days).filter(row => !archivedDates.has(row.date)).map(row => row.date), [snapshots, backfill, days, archivedDates])
  const boards = useBoardBackfill(missing)
  const rows = useMemo(() => buildTrend(snapshots, backfill, days, boards), [snapshots, backfill, days, boards])
  const enough = (key: TrendMetric) => rows.filter(row => row[key] !== null).length >= 2
  const cell = (row: TrendRow, i: number, k: TrendMetric, suffix = '') => <td>{valueText(row[k], suffix)}<Delta rows={rows} index={i} k={k} /></td>
  return <Card as="section" title="多日对比" description="每个交易日一行，▲▼ 为较前一交易日的变化。涨停、封板率、量能等只来自已归档快照；标「回补」的日期只有指数涨跌（腾讯日 K 线）和连板数、最高板（财联社），其余显示 —。">
    <div className="daily-trend__toolbar" role="group" aria-label="对比天数">{RANGES.map(range => <button key={range} type="button" aria-pressed={days === range} onClick={() => setDays(range)}>近 {range} 日</button>)}</div>
    {enough('maxBoard') || enough('ztCount')
      ? <div className="daily-sparks">
        <Spark label="沪深成交额" unit="亿元" rows={rows} keys={[{ key: 'volume', cls: 'daily-line--accent' }]} />
        <Spark label="涨停 / 跌停" unit="只" rows={rows} keys={[{ key: 'ztCount', cls: 'daily-line--up' }, { key: 'dtCount', cls: 'daily-line--down' }]} />
        <Spark label="封板率" unit="%" rows={rows} keys={[{ key: 'ztSealRate', cls: 'daily-line--accent' }]} />
        <Spark label="连板数" unit="只" rows={rows} keys={[{ key: 'lbCount', cls: 'daily-line--accent' }]} />
        <Spark label="最高连板" unit="板" rows={rows} keys={[{ key: 'maxBoard', cls: 'daily-line--up' }]} />
      </div>
      : <EmptyState title={`已归档 ${snapshots.length} 天`}>满 2 个交易日的归档后显示涨停、量能等趋势；每个交易日收盘后会自动新增一天。</EmptyState>}
    <TableWrap label="多日对比"><table className="ui-table daily-table daily-trend"><thead><tr>
      <th scope="col">交易日</th><th scope="col">涨停</th><th scope="col">封板率</th><th scope="col">炸板</th><th scope="col">跌停</th><th scope="col">量能(亿)</th>
      <th scope="col">连板</th><th scope="col">最高板</th><th scope="col">晋级率</th><th scope="col">上证</th><th scope="col">深成</th><th scope="col">创业板</th><th scope="col">流入</th><th scope="col">流出</th>
    </tr></thead><tbody>{rows.map((row, i) => <tr key={row.date} className={selected === row.date ? 'is-selected' : ''}>
      <th scope="row">{row.backfilled ? <>{row.date}<small>回补</small></> : <button type="button" className="daily-trend__date" aria-label={`查看 ${row.date} 复盘`} onClick={() => onSelect(row.date)}>{row.date}</button>}</th>
      {cell(row, i, 'ztCount')}{cell(row, i, 'ztSealRate', '%')}{cell(row, i, 'ztOpen')}{cell(row, i, 'dtCount')}{cell(row, i, 'volume')}
      {cell(row, i, 'lbCount')}{cell(row, i, 'maxBoard')}{cell(row, i, 'lbRate', '%')}
      {(['sh', 'sz', 'cy'] as const).map(k => <td key={k} className={tone(row.index[k])}>{signed(row.index[k], '%')}</td>)}
      <td className="daily-trend__names">{row.inflow.join('、') || '—'}</td><td className="daily-trend__names">{row.outflow.join('、') || '—'}</td>
    </tr>)}</tbody></table></TableWrap>
  </Card>
}
