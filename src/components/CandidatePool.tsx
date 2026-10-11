import React, { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Company } from '../data/companies'
import type { SyncState } from '../features/candidates/useCandidates'
import { MAX_NOTE } from '../features/candidates/validation'
import type { CandidateItem } from '../features/candidates/validation'
import { Card, TableWrap } from './ui'
import '../styles/research.css'

const MARKET_LABEL: Record<string, string> = { us: '标普500', cn: '沪深500', hk: '港股', adr: '美股非标普', ndx: '纳指100' }

interface Props {
  items: CandidateItem[]
  companies: Company[]
  state: SyncState
  message: string
  onMove: (from: number, to: number) => void
  onRemove: (item: CandidateItem) => void
  onNote: (item: CandidateItem, note: string) => void
  onClear: () => void
  onConnect: (token: string) => boolean
  onRetry: () => void
}

function NoteEditor({ code, value, onSave }: { code: string; value: string; onSave: (text: string) => void }): JSX.Element {
  const [draft, setDraft] = useState(value)
  const discard = useRef(false)
  const commit = (): void => { if (discard.current) { discard.current = false; return }; if (draft.trim() !== value) onSave(draft) }
  return (
    <textarea aria-label={`备注 ${code}`} value={draft} rows={2} maxLength={MAX_NOTE} placeholder="写下你对这家公司的看法…"
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() } else if (e.key === 'Escape') { discard.current = true; setDraft(value); e.currentTarget.blur() } }}
      className="rn-note" />
  )
}

export default function CandidatePool({ items, companies, state, message, onMove, onRemove, onNote, onClear, onConnect, onRetry }: Props): JSX.Element {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [token, setToken] = useState('')
  const [tokenError, setTokenError] = useState(false)
  const byKey = new Map(companies.map(c => [`${c.market}:${c.code}`, c]))

  const exportJson = (): void => {
    const rows = items.map((i, n) => { const c = byKey.get(`${i.market}:${i.code}`); return { 序号: n + 1, 市场: MARKET_LABEL[i.market], 代码: i.code, 公司: c?.name ?? '', 备注: i.note ?? '', 评级: c?.rating ?? '', 结论: c?.headline ?? '', 加入时间: i.addedAt } })
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `候选池-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const drop = (to: number): void => { if (dragFrom !== null) onMove(dragFrom, to); setDragFrom(null); setOver(null) }

  const status = state === 'synced' ? '☁ 已同步到云端' : state === 'syncing' ? '☁ 同步中…' : state === 'error' ? '⚠ 云端同步失败，数据暂存本机' : '未验证身份：数据仅保存在本机'
  return (
    <Card as="section" label="候选池" title={`候选池 · ${items.length} 家`} className="rn-card">
      <p className="rn-text">
        在分类数据的公司列表里点「加入候选」即可收录。可拖动 ⠿ 序号或用 ↑ ↓ / 置顶调整优先级，顺序即你的排序；备注框可直接编辑，Enter 或点击别处保存（Shift+Enter 换行，Esc 放弃修改）。仅为个人研究清单，不构成投资建议。
      </p>
      <div className="ui-cluster rn-filters">
        <span aria-live="polite" className={state === 'error' ? 'rn-pool-status is-error' : 'rn-pool-status'}>{status}</span>
        {message && <span className="rn-pool-msg">{message}</span>}
        {state === 'error' && <button type="button" className="tool-btn" onClick={onRetry}>重试</button>}
        <span className="rn-spacer" />
        <button type="button" className="tool-btn" disabled={!items.length} onClick={exportJson}>⬇ 导出 JSON</button>
        <button type="button" className="tool-btn" disabled={!items.length} onClick={() => { if (window.confirm(`清空全部 ${items.length} 家候选？此操作会同步到云端。`)) onClear() }}>清空</button>
      </div>
      {state === 'no-token' && (
        <form onSubmit={e => { e.preventDefault(); setTokenError(!onConnect(token)); setToken('') }} className="ui-cluster rn-pool-form">
          <input type="password" aria-label="同步 Token" autoComplete="new-password" value={token} onChange={e => setToken(e.target.value)} placeholder="输入同步 Token（同每日复盘的 PULSE_SYNC_TOKEN），仅需一次"
            className="rn-input" />
          <button type="submit" className="tool-btn tool-btn--primary">验证并同步</button>
          {tokenError && <span className="rn-error-text">Token 至少 32 位</span>}
        </form>
      )}
      {!items.length ? <p className="rn-empty">候选池还是空的。</p> : (
        <TableWrap label="候选池列表">
          <table className="ui-table rn-table--top">
            <thead><tr>{['#', '公司', '研究笔记', '我的备注', '市场', '评级', '一句话结论', '排序 / 操作'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{items.map((i, n) => {
              const c = byKey.get(`${i.market}:${i.code}`)
              return (
                <tr key={`${i.market}:${i.code}`} onDragOver={e => { e.preventDefault(); setOver(n) }} onDrop={() => drop(n)}
                  className={dragFrom === n ? 'rn-row-dragging' : over === n && dragFrom !== null ? 'rn-row-over' : undefined}>
                  <td className="rn-drag" draggable title="拖动调整顺序" onDragStart={() => setDragFrom(n)} onDragEnd={() => { setDragFrom(null); setOver(null) }}>⠿ {n + 1}</td>
                  <td className="rn-nowrap">{c ? <Link to={`/research-notes/${i.market}/${encodeURIComponent(i.code)}`} className="rn-link">{c.name} {c.code}</Link> : i.code}</td>
                  <td className="rn-nowrap"><Link to={`/research-notes/company/${i.market}/${encodeURIComponent(i.code)}/notes`} className="rn-link">研究笔记</Link></td>
                  <td className="rn-wide"><NoteEditor key={`${i.note ?? ''}`} code={i.code} value={i.note ?? ''} onSave={text => onNote(i, text)} /></td>
                  <td className="rn-nowrap">{MARKET_LABEL[i.market]}</td>
                  <td className="rn-mid">{c?.rating ?? '—'}</td>
                  <td className="rn-wide">{c?.headline ?? '公司数据加载中或已不在列表'}</td>
                  <td>
                    <div className="rn-row-actions">
                      <button type="button" className="tool-btn" aria-label={`上移 ${i.code}`} disabled={n === 0} onClick={() => onMove(n, n - 1)}>↑</button>
                      <button type="button" className="tool-btn" aria-label={`下移 ${i.code}`} disabled={n === items.length - 1} onClick={() => onMove(n, n + 1)}>↓</button>
                      <button type="button" className="tool-btn" aria-label={`置顶 ${i.code}`} disabled={n === 0} onClick={() => onMove(n, 0)}>置顶</button>
                      <button type="button" className="tool-btn" aria-label={`移除 ${i.code}`} onClick={() => onRemove(i)}>移除</button>
                    </div>
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  )
}
