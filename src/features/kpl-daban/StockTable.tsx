import React, { useMemo, useState } from 'react'
import { TableWrap } from '../../components/ui'

// 格式：真正的负号；缺失显示「—」，不当 0
export const num = (x: number | null | undefined, d = 0): string => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('-', '−'))
export const pct = (x: number | null | undefined, d = 2, signed = true): string => (x == null || !Number.isFinite(x) ? '—' : `${signed && x > 0 ? '+' : ''}${num(x, d)}%`)
/** A 股习惯：红涨绿跌 */
export const tone = (x: number | null | undefined): string => (x == null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
/** 金额（元）→ 亿 / 万 */
export const money = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : Math.abs(x) >= 1e8 ? `${num(x / 1e8, 2)} 亿` : `${num(x / 1e4, 0)} 万`)
export const streakLabel = (s: { days: number; ct: number } | null | undefined, boards?: number | null): string =>
  s ? (s.days === s.ct ? (s.ct === 1 ? '首板' : `${s.ct}连板`) : `${s.days}天${s.ct}板`) : boards != null ? (boards === 1 ? '首板' : `${boards}连板`) : '—'

export type Col<T> = {
  key: string
  label: string
  num?: boolean
  render: (r: T) => React.ReactNode
  /** 排序取值；不给则该列不可排序。null 永远排在最后 */
  sort?: (r: T) => number | string | null
  cls?: (r: T) => string
}

/**
 * 个股表：首列（名称代码）吸附，窄屏表格内部横向滚动；点表头排序（再点切换升降序）。
 * expand（可选）：返回该行的展开内容；不为 null 时名称旁出现展开按钮，点开在下一行显示。
 */
export default function StockTable<T extends { code: string; name: string }>({ label, rows, cols, initial, empty = '今日暂无', expand, expandLabel = '展开' }: {
  label: string
  rows: T[]
  cols: Array<Col<T>>
  initial?: { key: string; dir: 'asc' | 'desc' }
  empty?: string
  expand?: (r: T) => React.ReactNode | null
  expandLabel?: string
}): JSX.Element {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initial ?? null)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const sorted = useMemo(() => {
    const col = sort && cols.find(c => c.key === sort.key)
    if (!col?.sort || !sort) return rows
    const get = col.sort
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b)
      if (x === null && y === null) return 0
      if (x === null) return 1
      if (y === null) return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sign
    })
  }, [rows, cols, sort])
  if (!rows.length) return <p className="mm-empty">{empty}</p>
  const click = (key: string): void => setSort(s => (s?.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
  return (
    <TableWrap label={label} stickyFirst className="kd-wrap">
      <table className="ui-table kd-table">
        <thead>
          <tr>
            <th scope="col">名称</th>
            {cols.map(c => {
              const active = sort?.key === c.key
              return (
                <th key={c.key} scope="col" className={c.num ? 'num' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sort ? 'none' : undefined}>
                  {c.sort ? <button type="button" className="kd-sortbtn" onClick={() => click(c.key)}>{c.label}{active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button> : c.label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => {
            const extra = expand ? expand(r) : null
            const isOpen = extra !== null && open.has(r.code)
            const toggle = (): void => setOpen(s => { const n = new Set(s); if (n.has(r.code)) n.delete(r.code); else n.add(r.code); return n })
            return (
              <React.Fragment key={r.code}>
                <tr>
                  <th scope="row" className="kd-name">
                    {r.name}<small>{r.code}</small>
                    {extra !== null && <button type="button" className="kd-expbtn" aria-expanded={isOpen} aria-label={`${r.name} ${expandLabel}`} onClick={toggle}>{isOpen ? '收起' : expandLabel}</button>}
                  </th>
                  {cols.map(c => <td key={c.key} className={[c.num ? 'num' : '', c.cls?.(r) ?? ''].join(' ').trim() || undefined}>{c.render(r)}</td>)}
                </tr>
                {isOpen && <tr className="kd-exprow"><td colSpan={cols.length + 1}>{extra}</td></tr>}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </TableWrap>
  )
}
