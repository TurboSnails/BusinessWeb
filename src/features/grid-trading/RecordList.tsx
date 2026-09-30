import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownUp, Trash2 } from 'lucide-react'
import type { SavedRecord } from './types'

type SortKey = 'updated' | 'last-buy' | 'last-trade' | 'capital' | 'pnl'
type Props = { records: SavedRecord[]; onDelete: (ids: string[]) => void }

const money = (value: number): string => `${value < 0 ? '-' : ''}¥${Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
const latestTradeDate = (record: SavedRecord): string => record.result.lastTradeDate || record.row.date

export default function RecordList({ records, onDelete }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('updated')
  const [selected, setSelected] = useState<string[]>([])
  const filtered = useMemo(() => records
    .filter(record => `${record.row.code} ${record.row.name}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'last-buy') return (b.result.trades.filter(t => t.side === '买入').slice(-1)[0]?.date ?? b.row.date).localeCompare(a.result.trades.filter(t => t.side === '买入').slice(-1)[0]?.date ?? a.row.date)
      if (sortBy === 'last-trade') return latestTradeDate(b).localeCompare(latestTradeDate(a))
      if (sortBy === 'capital') return b.result.maxCapital - a.result.maxCapital
      if (sortBy === 'pnl') return b.result.pnl - a.result.pnl
      return (b.updatedAt ?? b.savedAt).localeCompare(a.updatedAt ?? a.savedAt)
    }), [records, query, sortBy])

  const toggleAll = (checked: boolean) => setSelected(checked ? filtered.map(record => record.id) : [])
  const toggleOne = (id: string, checked: boolean) => setSelected(current => checked ? [...new Set([...current, id])] : current.filter(item => item !== id))
  const deleteSelected = () => {
    if (!selected.length) return
    onDelete(selected)
    setSelected([])
  }

  return <section className="grid-card" aria-labelledby="grid-record-list-title">
    <div className="grid-list-toolbar">
      <div><h2 id="grid-record-list-title">已保存记录</h2><p>{records.length} 条本地记录</p></div>
      <div className="grid-list-actions">
        <input aria-label="搜索标的" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索代码或名称" />
        <label className="grid-sort-label"><ArrowDownUp size={15} /> 排序
          <select aria-label="记录排序" value={sortBy} onChange={event => setSortBy(event.target.value as SortKey)}>
            <option value="updated">最近更新</option><option value="last-buy">最后买入</option><option value="last-trade">最后成交</option><option value="capital">最大占用资金</option><option value="pnl">盈亏</option>
          </select>
        </label>
        <button type="button" className="grid-icon-button" onClick={deleteSelected} disabled={!selected.length} aria-label="删除所选记录"><Trash2 size={16} /> 删除所选</button>
      </div>
    </div>
    {filtered.length === 0 ? <div className="grid-empty-state">{records.length ? '没有符合搜索条件的记录。' : '还没有保存的网格记录。'}</div> :
      <div className="grid-table-scroll"><table className="grid-record-table">
        <thead><tr>
          <th><input type="checkbox" aria-label="选择全部记录" checked={filtered.length > 0 && filtered.every(item => selected.includes(item.id))} onChange={event => toggleAll(event.target.checked)} /></th>
          <th>标的</th><th>建仓价</th><th>最新价</th><th>占用峰值</th><th>总盈亏</th><th>最后成交</th><th>网格状态</th><th>操作</th>
        </tr></thead>
        <tbody>{filtered.map(record => <tr key={record.id}>
          <td><input type="checkbox" aria-label={`选择 ${record.row.code}`} checked={selected.includes(record.id)} onChange={event => toggleOne(record.id, event.target.checked)} /></td>
          <td><Link to={`/grid-trading/records/${encodeURIComponent(record.id)}`} className="grid-record-link"><strong>{record.row.name}</strong><small>{record.row.code}</small></Link></td>
          <td>¥{record.row.initialPrice.toFixed(3)}</td><td>¥{record.result.current.toFixed(3)}</td>
          <td>{money(record.result.maxCapital)}</td><td className={record.result.pnl >= 0 ? 'grid-positive' : 'grid-negative'}>{money(record.result.pnl)}</td>
          <td>{latestTradeDate(record)}</td><td>{record.result.current <= record.result.nextBuy ? "已达买价" : record.result.current >= record.result.nextSell ? "已达卖价" : "等待触发"}<small>买 {record.result.nextBuy.toFixed(3)} / 卖 {record.result.nextSell.toFixed(3)}</small></td>
          <td><Link to={`/grid-trading/records/${encodeURIComponent(record.id)}`}>调整参数</Link> <button type="button" className="grid-text-button" onClick={() => onDelete([record.id])}>删除</button></td>
        </tr>)}</tbody>
      </table></div>}
  </section>
}
