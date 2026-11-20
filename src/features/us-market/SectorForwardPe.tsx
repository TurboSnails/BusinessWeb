import React from 'react'
import HistoryChart from './HistoryChart'
import { format } from './cards'
import { withinYears } from './explain'
import type { Point } from './model'
import type { SectorForwardPe as Sector } from './snapshots'

const DAY = 86_400_000
/** Weeks of lag beyond which the Bloomberg-basis series is flagged as behind the market. */
const STALE_DAYS = 14

/** Forward P/E history for one S&P 500 sector (terminal basis), with where it sits against its own history. */
export default function SectorForwardPe({ sector, current, years, asOf }: {
  sector: Sector
  /** Latest same-sector reading from a different provider (FactSet); shown beside the series, never spliced into it. */
  current?: { date: string; value: number; source?: string }
  years: number | null
  asOf: string
}) {
  const lag = Math.floor((Date.parse(asOf) - Date.parse(sector.latest.date)) / DAY)
  const { stats } = sector
  const points: Point[] = withinYears(sector.history, years)
  return <section className="us-market__sector-pe" aria-label={`${sector.name}前瞻市盈率历史`}>
    <h3>{sector.name}前瞻 P/E 历史 <small>{sector.ticker} · 12 个月混合前瞻一致预期</small></h3>
    <HistoryChart points={points} label={`${sector.name}前瞻市盈率`} format={value => format(Math.round(value * 10) / 10, '倍')} />
    <dl className="us-market__sector-pe-stats">
      <div><dt>序列最新（{sector.latest.date}）</dt><dd>{format(sector.latest.value, '倍')}</dd></div>
      <div><dt>{sector.historyStarts.slice(0, 4)} 年至今分位</dt><dd>{stats.percentile === undefined ? '—' : `${stats.percentile}%`}</dd></div>
      <div><dt>历史均值／中位数</dt><dd>{format(stats.mean, '倍')} ／ {format(stats.median, '倍')}</dd></div>
      <div><dt>历史最高</dt><dd>{format(stats.high.value, '倍')}（{stats.high.date.slice(0, 7)}）</dd></div>
      <div><dt>历史最低</dt><dd>{format(stats.low.value, '倍')}（{stats.low.date.slice(0, 7)}）</dd></div>
      {current && <div><dt>FactSet 最新（{current.date}）</dt><dd>{format(current.value, '倍')}</dd></div>}
    </dl>
    <p className="us-market__muted">
      {sector.manual ? `含 Bloomberg 手动导出 ${sector.manual.count} 个点（${sector.manual.from} 至 ${sector.manual.to}）。` : ''}
      {lag > STALE_DAYS ? `序列截至 ${sector.latest.date}，已落后 ${lag} 天；更新的读数请看 FactSet。` : ''}
      历史序列与 FactSet 是不同提供方的口径，数值可差 1–2 倍，只对比各自的相对位置，不要直接相减。
    </p>
  </section>
}

/** Observations needed before a percentile against the project's own history is worth showing. */
export const OWN_MIN_FOR_RANK = 60

/** Forward P/E the project records itself each day (issuer fund holdings, FY1), for sectors with no long terminal series. */
export function OwnForwardPe({ name, history, source, scope, years }: {
  name: string
  history: Point[]
  source?: string
  scope?: string
  years: number | null
}) {
  if (!history.length) return null
  const sorted = [...history].sort(([a], [b]) => a.localeCompare(b))
  const [startDate] = sorted[0]
  const [lastDate, last] = sorted[sorted.length - 1]
  const enough = sorted.length >= OWN_MIN_FOR_RANK
  const rank = Math.round((sorted.filter(([, v]) => v < last).length / sorted.length) * 1000) / 10
  const mean = sorted.reduce((sum, [, v]) => sum + v, 0) / sorted.length
  return <section className="us-market__sector-pe" aria-label={`${name}前瞻市盈率自建历史`}>
    <h3>{name}前瞻 P/E 自建历史 <small>{scope ?? '基金持仓 · FY1 P/E'}</small></h3>
    {sorted.length >= 3 && <HistoryChart points={withinYears(sorted, years)} label={`${name}前瞻市盈率`} format={value => format(Math.round(value * 10) / 10, '倍')} />}
    <dl className="us-market__sector-pe-stats">
      <div><dt>最新（{lastDate}）</dt><dd>{format(last, '倍')}</dd></div>
      <div><dt>已累积</dt><dd>{sorted.length} 个交易日（自 {startDate}）</dd></div>
      <div><dt>自建历史分位</dt><dd>{enough ? `${rank}%` : `满 ${OWN_MIN_FOR_RANK} 个交易日后显示`}</dd></div>
      {enough && <div><dt>自建历史均值</dt><dd>{format(Math.round(mean * 100) / 100, '倍')}</dd></div>}
    </dl>
    <p className="us-market__muted">
      该行业没有免费的长期历史序列，这里是项目每天记录的读数，随时间自动变长。{source && /^https:\/\//.test(source) ? <a href={source} target="_blank" rel="noreferrer">数据来源</a> : null}
    </p>
  </section>
}
