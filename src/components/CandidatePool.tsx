import React, { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Company } from '../data/companies'
import { researchForCode, researchPath } from '../data/futureTrendsResearch'
import type { SyncState } from '../features/candidates/useCandidates'
import { MAX_NOTE } from '../features/candidates/validation'
import type { CandidateItem } from '../features/candidates/validation'
import { dcfOf, MARKET_LABEL, dcfLink, gridLink, toolProgress, valuationLink, type ToolProgress, type ToolSources } from '../features/candidates/links'
import { matchDcfFilter, type DcfFilterId } from '../features/dcf/filter'
import { DcfFilterChips } from './DcfCell'
import { Card, TableWrap } from './ui'
import '../styles/research.css'

interface Props {
  items: CandidateItem[]
  companies: Company[]
  /** 本机已保存的 DCF、估值报告与网格记录，用来显示每家公司做到哪一步 */
  tools?: ToolSources
  state: SyncState
  message: string
  onMove: (from: number, to: number) => void
  onRemove: (item: CandidateItem) => void
  onNote: (item: CandidateItem, note: string) => void
  onClear: () => void
  onConnect: (token: string) => boolean
  onRetry: () => void
}

const NO_TOOLS: ToolSources = { dcf: [], valuation: [], grid: [] }

function NoteEditor({ code, value, onSave }: { code: string; value: string; onSave: (text: string) => void }): JSX.Element {
  const [draft, setDraft] = useState(value)
  const discard = useRef(false)
  const commit = (): void => { if (discard.current) { discard.current = false; return }; if (draft.trim() !== value) onSave(draft) }
  return (
    <textarea aria-label={`备注 ${code}`} value={draft} rows={2} maxLength={MAX_NOTE} placeholder="写下你的判断：等什么、什么情况放弃…"
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() } else if (e.key === 'Escape') { discard.current = true; setDraft(value); e.currentTarget.blur() } }}
      className="rn-note" />
  )
}

const money = (n: number, currency: string): string => `${currency} ${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`.trim()
const day = (iso: string): string => iso.slice(0, 10)

/** 工具进度：做过的显示结论，没做过的明确说「未估值」 */
function Progress({ p }: { p: ToolProgress }): JSX.Element {
  if (!p.dcf && !p.valuation && !p.grid) return <span className="cand-progress cand-progress--empty">尚未估值</span>
  return (
    <ul className="cand-progress">
      {p.valuation && <li><span>估值</span>基准 {money(p.valuation.low, p.valuation.currency)}{p.valuation.high !== p.valuation.low && ` – ${p.valuation.high.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`}<small>{day(p.valuation.createdAt)}</small></li>}
      {p.dcf && <li><span>DCF</span>{p.dcf.price === null ? '未算出' : money(p.dcf.price, p.dcf.currency)}{p.dcf.mos !== null && <em className={p.dcf.mos >= 0 ? 'is-good' : 'is-bad'}> 安全边际 {(p.dcf.mos * 100).toFixed(0)}%</em>}<small>{day(p.dcf.savedAt)}</small></li>}
      {p.grid && <li><span>网格</span><Link to={`/grid-trading/records/${encodeURIComponent(p.grid.id)}`} className="rn-link">盈亏 {money(p.grid.pnl, '¥')}</Link><small>{day(p.grid.savedAt)}</small></li>}
    </ul>
  )
}

export default function CandidatePool({ items, companies, tools = NO_TOOLS, state, message, onMove, onRemove, onNote, onClear, onConnect, onRetry }: Props): JSX.Element {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [token, setToken] = useState('')
  const [tokenError, setTokenError] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [dcfF, setDcfF] = useState<DcfFilterId>('all')
  const byKey = new Map(companies.map(c => [`${c.market}:${c.code}`, c]))

  // 公司库优先；不在公司库的（从研究筛出加入的）用主题研究的结论
  const describe = (i: CandidateItem): { name: string; href: string | null; rating: string; headline: string } => {
    const c = byKey.get(`${i.market}:${i.code}`)
    if (c) return { name: c.name, href: `/research-notes/${i.market}/${encodeURIComponent(i.code)}`, rating: c.rating, headline: c.headline }
    const r = researchForCode(i.market === 'hk' ? `${Number(i.code).toString().padStart(4, '0')}.HK` : i.code)
    if (r) return { name: r.name, href: researchPath(r.key), rating: r.rating, headline: r.headline }
    return { name: '', href: null, rating: '—', headline: '公司数据加载中或已不在列表' }
  }

  const exportJson = (): void => {
    const rows = items.map((i, n) => { const d = describe(i); return { 序号: n + 1, 市场: MARKET_LABEL[i.market], 代码: i.code, 公司: d.name, 备注: i.note ?? '', 评级: d.rating, 结论: d.headline, 加入时间: i.addedAt } })
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `候选池-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const drop = (to: number): void => { if (dragFrom !== null) onMove(dragFrom, to); setDragFrom(null); setOver(null) }

  const status = state === 'synced' ? '☁ 已同步到云端' : state === 'syncing' ? '☁ 同步中…' : state === 'error' ? '⚠ 云端同步失败，数据暂存本机' : '未验证身份：数据仅保存在本机'
  return (
    <Card as="section" label="我的候选池" title={`我的候选池 · ${items.length} 家`} className="rn-card">
      <div className="ui-cluster rn-filters">
        <span aria-live="polite" className={state === 'error' ? 'rn-pool-status is-error' : 'rn-pool-status'}>{status}</span>
        {message && <span className="rn-pool-msg">{message}</span>}
        {state === 'error' && <button type="button" className="tool-btn" onClick={onRetry}>重试</button>}
        <DcfFilterChips value={dcfF} onChange={setDcfF} className="ui-cluster" />
        <span className="rn-spacer" />
        <button type="button" className="tool-btn" disabled={!items.length} onClick={exportJson}>⬇ 导出 JSON</button>
        {confirmClear ? (
          <span className="cand-confirm" role="group" aria-label="确认清空">
            <span>清空全部 {items.length} 家？会同步到云端。</span>
            <button type="button" className="tool-btn tool-btn--danger" onClick={() => { setConfirmClear(false); onClear() }}>确认清空</button>
            <button type="button" className="tool-btn" onClick={() => setConfirmClear(false)}>取消</button>
          </span>
        ) : (
          <button type="button" className="tool-btn" disabled={!items.length} onClick={() => setConfirmClear(true)}>清空</button>
        )}
      </div>
      {state === 'no-token' && (
        <form onSubmit={e => { e.preventDefault(); setTokenError(!onConnect(token)); setToken('') }} className="ui-cluster rn-pool-form">
          <input type="password" aria-label="同步 Token" autoComplete="new-password" value={token} onChange={e => setToken(e.target.value)} placeholder="输入同步 Token（同每日复盘的 PULSE_SYNC_TOKEN），仅需一次"
            className="rn-input" />
          <button type="submit" className="tool-btn tool-btn--primary">验证并同步</button>
          {tokenError && <span className="rn-error-text">Token 至少 32 位</span>}
        </form>
      )}
      {!items.length ? (
        <div className="cand-empty">
          <p>候选池还是空的。</p>
          <p>在 <Link to="/research-notes" className="rn-link">公司研究</Link> 的公司库里点「加入候选」，或在「研究筛出」里点「加入我的池」。</p>
        </div>
      ) : (
        <TableWrap label="候选池列表">
          <table className="ui-table rn-table--top cand-table">
            <thead><tr>{['#', '公司', '我的备注', '研究结论', '估值进度', '去估值', '排序'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{items.map((i, n) => {
              if (!matchDcfFilter(dcfF, dcfOf(i.market, i.code, tools))) return null
              const d = describe(i)
              const grid = gridLink(i.market, i.code, d.name)
              return (
                <tr key={`${i.market}:${i.code}`} onDragOver={e => { e.preventDefault(); setOver(n) }} onDrop={() => drop(n)}
                  className={dragFrom === n ? 'rn-row-dragging' : over === n && dragFrom !== null ? 'rn-row-over' : undefined}>
                  <td className="rn-drag" draggable={dcfF === 'all'} title={dcfF === 'all' ? '拖动调整顺序' : '筛选时不能调整顺序'} onDragStart={() => dcfF === 'all' && setDragFrom(n)} onDragEnd={() => { setDragFrom(null); setOver(null) }}>⠿ {n + 1}</td>
                  <td className="cand-company">
                    {d.href ? <Link to={d.href} className="rn-link">{d.name || i.code} {i.code}</Link> : <span>{i.code}</span>}
                    <small>{MARKET_LABEL[i.market]} · <Link to={`/research-notes/company/${i.market}/${encodeURIComponent(i.code)}/notes`} className="rn-link">研究笔记</Link></small>
                  </td>
                  <td className="rn-wide"><NoteEditor key={`${i.note ?? ''}`} code={i.code} value={i.note ?? ''} onSave={text => onNote(i, text)} /></td>
                  <td className="cand-verdict"><strong>{d.rating}</strong><span>{d.headline}</span></td>
                  <td className="cand-progress-cell"><Progress p={toolProgress(i.market, i.code, tools)} /></td>
                  <td>
                    <div className="cand-tools">
                      <Link className="tool-btn" to={valuationLink(i.market, i.code)} aria-label={`估值工作台 ${i.code}`}>估值</Link>
                      <Link className="tool-btn" to={dcfLink(i.market, i.code, d.name)} aria-label={`DCF ${i.code}`}>DCF</Link>
                      {grid && <Link className="tool-btn" to={grid} aria-label={`网格 ${i.code}`}>网格</Link>}
                    </div>
                  </td>
                  <td>
                    <div className="rn-row-actions">
                      <button type="button" className="tool-btn" aria-label={`上移 ${i.code}`} disabled={dcfF !== 'all' || n === 0} onClick={() => onMove(n, n - 1)}>↑</button>
                      <button type="button" className="tool-btn" aria-label={`下移 ${i.code}`} disabled={dcfF !== 'all' || n === items.length - 1} onClick={() => onMove(n, n + 1)}>↓</button>
                      <button type="button" className="tool-btn" aria-label={`置顶 ${i.code}`} disabled={dcfF !== 'all' || n === 0} onClick={() => onMove(n, 0)}>置顶</button>
                      <button type="button" className="tool-btn" aria-label={`移除 ${i.code}`} onClick={() => onRemove(i)}>移除</button>
                    </div>
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        </TableWrap>
      )}
      <p className="cand-foot">拖动 ⠿ 序号或用 ↑ ↓ / 置顶调整优先级；备注 Enter 或点别处保存，Shift+Enter 换行，Esc 放弃。仅为个人研究清单，不构成投资建议。</p>
    </Card>
  )
}
