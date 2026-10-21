import React, { useEffect, useMemo, useState } from 'react'
import { Callout, Card, EmptyState, TableWrap } from '../../components/ui'
import { loadSectorPayload } from '../../services/sectorCache'
import { isClosedDate, shanghaiDate } from '../../services/limitUp'
import { parseSectorPayload, type SectorData } from './classify'
import { buildPlateRanking, HOT_THRESHOLD_PCT } from './rankMatrix'

const DAYS = 20
const PAGE_SIZE = 30

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

export default function PlateRanking(): JSX.Element {
  const [byDate, setByDate] = useState<Record<string, SectorData[]>>({})
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
          const parsed = parseSectorPayload(await loadSectorPayload(date, false, controller.signal), date, 'concept', Number.MAX_SAFE_INTEGER)
          if (parsed?.sectors.length && !controller.signal.aborted) setByDate(prev => ({ ...prev, [date]: parsed.sectors }))
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
        近 {DAYS} 个交易日的概念板块涨幅矩阵，按「单日涨幅超过 {HOT_THRESHOLD_PCT}% 的天数」从多到少排序，天数相同按区间涨幅累计排序。出现次数多只说明最近经常走强，不等于值得买入；已排除 ST 与「其他」。不构成投资建议。
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
                  <th scope="col">板块</th>
                  <th scope="col" className="num" title={`涨幅 > ${HOT_THRESHOLD_PCT}% 的天数`}>&gt;{HOT_THRESHOLD_PCT}% 天数</th>
                  <th scope="col" className="num">累计</th>
                  {ranking.dates.map(d => <th key={d} scope="col" className="num plate-rank-date">{d.slice(5)}</th>)}
                </tr>
              </thead>
              <tbody>
                {visible.map(row => (
                  <tr key={row.code || row.name}>
                    <td className="plate-rank-name">{row.name}</td>
                    <td className="num limitup-strong">{row.hotDays}</td>
                    <td className={`num ${row.sumChange >= 0 ? 'limitup-up' : 'limitup-down'}`}>{row.sumChange >= 0 ? '+' : ''}{row.sumChange.toFixed(1)}%</td>
                    {row.changes.map((c, i) => (
                      <td key={ranking.dates[i]} className={`num plate-rank-cell${c != null && c > HOT_THRESHOLD_PCT ? ' is-hot' : ''}${c != null && c < 0 ? ' is-down' : ''}`}>
                        {c == null ? '—' : c.toFixed(2)}
                      </td>
                    ))}
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
