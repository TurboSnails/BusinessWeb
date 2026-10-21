import React, { useEffect, useMemo, useState } from 'react'
import { Callout, Card, EmptyState, TableWrap } from '../../components/ui'
import { isClosedDate, loadLimitUp, shanghaiDate } from '../../services/limitUp'
import { getLimitUpCache, saveLimitUpCache } from '../../services/limitUpCache'
import { buildPlateRanking, HOT_THRESHOLD_PCT, plateDaysOf, type PlateCell, type PlateDay } from './rankMatrix'

const DAYS = 20
const PAGE_SIZE = 40

/** 最近 DAYS 个交易日（含今天，新到旧），跳过周末与已核实的节假日 */
function recentTradingDates(): string[] {
  const dates: string[] = []
  let date = shanghaiDate()
  for (let guard = 0; dates.length < DAYS && guard < 60; guard++) {
    if (!isClosedDate(date)) dates.push(date)
    const prev = new Date(`${date}T00:00:00Z`)
    prev.setUTCDate(prev.getUTCDate() - 1)
    date = prev.toISOString().slice(0, 10)
  }
  return dates
}

const pctText = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`

function Cell({ cell }: { cell: PlateCell | null }): JSX.Element {
  if (!cell) return <td className="plate-rank-cell is-empty">--</td>
  const hot = cell.change > HOT_THRESHOLD_PCT
  return (
    <td className={`plate-rank-cell${hot ? ' is-hot' : ''}${cell.change < 0 ? ' is-down' : ''}`}>
      <strong className={cell.change > 0 ? 'limitup-up' : cell.change < 0 ? 'limitup-down' : ''}>{pctText(cell.change)}</strong>
      {cell.count > 0 && <span className="plate-rank-sub">涨停板 <b>{cell.count}</b></span>}
      {cell.rate !== null && <span className="plate-rank-sub">连板率 <b>{(cell.rate * 100).toFixed(1)}%</b></span>}
    </td>
  )
}

export default function PlateRanking(): JSX.Element {
  const [byDate, setByDate] = useState<Record<string, Map<string, PlateDay>>>({})
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [failed, setFailed] = useState(0)
  const [shown, setShown] = useState(PAGE_SIZE)

  useEffect(() => {
    const controller = new AbortController()
    const dates = recentTradingDates()
    setProgress({ done: 0, total: dates.length })
    let cursor = 0, done = 0, bad = 0
    const worker = async () => {
      while (cursor < dates.length && !controller.signal.aborted) {
        const date = dates[cursor++]
        try {
          const cached = getLimitUpCache(date, true)
          let result = cached?.fresh ? cached.result : null
          if (!result) {
            result = await loadLimitUp(date, true, controller.signal)
            if (!controller.signal.aborted) saveLimitUpCache(date, true, result)
          }
          // 数据源对休市日会回退到最近交易日；只接受日期一致的数据，避免同一天重复出现
          if (!controller.signal.aborted && result.dataDate === date && result.concepts.length) {
            const plates = plateDaysOf(result.concepts)
            setByDate(prev => ({ ...prev, [date]: plates }))
          }
        } catch { if (!controller.signal.aborted) bad += 1 }
        done += 1
        if (!controller.signal.aborted) { setProgress({ done, total: dates.length }); setFailed(bad) }
      }
    }
    void Promise.all(Array.from({ length: 4 }, worker))
    return () => controller.abort()
  }, [])

  const ranking = useMemo(() => buildPlateRanking(byDate, DAYS), [byDate])
  const loading = progress.done < progress.total
  const visible = ranking.rows.slice(0, shown)

  return (
    <>
      <Callout tone="muted" className="sector-gap">
        近 {DAYS} 个交易日出现涨停的概念板块，日期从新到旧。排序从最近一天起：当天涨幅超过 {HOT_THRESHOLD_PCT}% 的板块在前，再看更早一天。「涨停板」是该板块当天涨停股数，「连板率」是前一交易日涨停的股票今天继续涨停的比例。只列有涨停股的板块，没有出现的日期显示 --；已排除 ST 与「其他」。不构成投资建议。
      </Callout>
      {loading && <p className="limitup-note" role="status">正在加载 {progress.done}/{progress.total} 个交易日…</p>}
      {failed > 0 && <Callout tone="warn" className="sector-gap">有 {failed} 个日期请求失败，已用可用日期计算；请求失败不代表休市。</Callout>}
      {!ranking.rows.length ? (
        loading ? null : <EmptyState title="暂未取得板块数据" />
      ) : (
        <Card flush className="sector-gap">
          <TableWrap label="板块排行" stickyFirst>
            <table className="ui-table plate-rank-table">
              <thead>
                <tr>
                  <th scope="col">板块名称</th>
                  {ranking.dates.map(d => <th key={d} scope="col" className="plate-rank-date">{d.slice(5)}</th>)}
                </tr>
              </thead>
              <tbody>
                {visible.map(row => (
                  <tr key={row.name}>
                    <th scope="row" className="plate-rank-name">{row.name}</th>
                    {row.cells.map((cell, i) => <Cell key={ranking.dates[i]} cell={cell} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {shown < ranking.rows.length && (
            <div className="plate-rank-more"><button type="button" className="tool-btn" onClick={() => setShown(n => n + PAGE_SIZE)}>再显示 {Math.min(PAGE_SIZE, ranking.rows.length - shown)} 个（共 {ranking.rows.length}）</button></div>
          )}
        </Card>
      )}
    </>
  )
}
