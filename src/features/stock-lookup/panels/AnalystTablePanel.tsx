import React, { useEffect, useMemo, useState } from 'react'
import { Card, TableWrap } from '../../../components/ui'
import type { AnalystData } from '../types'
import { BlockEmpty, BlockUnsupported } from './BlockState'
import {
  ACTION_LABEL,
  clampPage,
  PAGE_SIZE,
  pageCount,
  slicePage,
  withUpside,
} from './analystTable'
import { changeTone, fmtPct, fmtPrice } from './format'
import { parseLookupSymbol } from './symbolParse'

export function AnalystTablePanel({
  symbol,
  data,
  currentPrice,
}: {
  symbol: string
  data: AnalystData | null
  currentPrice?: number
}): JSX.Element {
  const market = parseLookupSymbol(symbol)?.market
  const [page, setPage] = useState(1)
  const [goto, setGoto] = useState('')

  const rows = useMemo(
    () => (data ? withUpside(data.actions, currentPrice ?? data.target?.current) : []),
    [data, currentPrice],
  )

  useEffect(() => { setPage(1); setGoto('') }, [symbol, data])

  if (market && market !== 'us') {
    return (
      <Card as="section" title="分析师评级表" className="sl-analyst">
        <BlockUnsupported reason="分析师评级表目前仅支持美股。" />
      </Card>
    )
  }

  if (!data) {
    return (
      <Card as="section" title="分析师评级表" className="sl-analyst">
        <BlockEmpty title="暂无分析师评级" />
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card as="section" title="分析师评级表" className="sl-analyst">
        <BlockEmpty title="暂无分析师动作记录" />
      </Card>
    )
  }

  const pages = pageCount(rows.length)
  const current = clampPage(page, rows.length)
  const pageRows = slicePage(rows, current)

  const go = (): void => {
    const n = Number.parseInt(goto, 10)
    if (!Number.isFinite(n)) return
    setPage(clampPage(n, rows.length))
  }

  return (
    <Card as="section" title="分析师评级表" className="sl-analyst" description="按日期倒序；目标价相对现价空间仅供参考。">
      <TableWrap label="分析师评级表" stickyHeader>
        <table className="ui-table">
          <thead>
            <tr>
              <th scope="col">日期</th>
              <th scope="col">机构</th>
              <th scope="col">动作</th>
              <th scope="col">评级</th>
              <th scope="col">目标价</th>
              <th scope="col">相对现价</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={`${r.date}-${r.firm}-${i}`}>
                <td>{r.date}</td>
                <td>{r.firm}</td>
                <td>{ACTION_LABEL[r.action]}</td>
                <td>
                  {r.fromGrade ? `${r.fromGrade} → ${r.toGrade ?? '—'}` : (r.toGrade ?? '—')}
                </td>
                <td>
                  {r.priorTarget != null || r.target != null
                    ? `${r.priorTarget != null ? fmtPrice(r.priorTarget) : '—'} → ${r.target != null ? fmtPrice(r.target) : '—'}`
                    : '—'}
                </td>
                <td>
                  {r.upsidePct == null ? '—' : (
                    <span className={`sl-chg sl-chg--${changeTone(r.upsidePct)}`}>{fmtPct(r.upsidePct)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <div className="sl-pager">
        <span className="sl-muted">第 {current} / {pages} 页 · 每页 {PAGE_SIZE} 条 · 共 {rows.length} 条</span>
        <div className="sl-pager__btns">
          <button type="button" className="tool-btn" disabled={current <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <button type="button" className="tool-btn" disabled={current >= pages} onClick={() => setPage(p => p + 1)}>下一页</button>
          <label className="sl-pager__goto">
            前往第
            <input
              type="number"
              min={1}
              max={pages}
              value={goto}
              onChange={e => setGoto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') go() }}
              aria-label="页码"
            />
            页
            <button type="button" className="tool-btn" onClick={go}>前往</button>
          </label>
        </div>
      </div>
      <p className="sl-muted">数据出处：{data.source}</p>
    </Card>
  )
}
