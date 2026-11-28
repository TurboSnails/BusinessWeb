import React, { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadError } from '../../components/ui'
import { parseIpo, usdcUrl, useUsdcQuery } from './api'
import { Loading, RefreshButton } from './DataChrome'
import { formatMarketCap, formatNyTime, nyMonth, stockPath } from './format'
import type { IpoGroup, IpoRow } from './types'

const GROUPS: { id: IpoGroup; label: string; hint: string }[] = [
  { id: 'upcoming', label: '即将上市', hint: '已公布预计上市日期的项目' },
  { id: 'priced', label: '已定价', hint: '已确定发行价格的项目' },
  { id: 'filed', label: '已递交', hint: '已递交上市申请，日期为递交日' },
  { id: 'withdrawn', label: '已撤回', hint: '已撤回申请，日期为撤回日' },
]

function IpoTable({ rows, group }: { rows: IpoRow[]; group: IpoGroup }): JSX.Element {
  if (!rows.length) return <p className="usdc-empty-line">这个月暂无记录。</p>
  return <div className="usdc-table-wrap"><table className="usdc-table usdc-ipo-table">
    <caption className="visually-hidden">{GROUPS.find(item => item.id === group)?.label}</caption>
    <thead><tr><th scope="col">日期</th><th scope="col">代码</th><th scope="col">公司</th><th scope="col">发行价格</th><th scope="col">发行股数</th><th scope="col">预计募集金额</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.symbol ?? row.company}-${row.date ?? index}`}>
      <td data-label="日期">{row.date ?? '日期待定'}{group === 'withdrawn' && row.filedDate && <small>递交于 {row.filedDate}</small>}</td>
      <th scope="row">{row.symbol ? <Link className="usdc-symbol" to={stockPath(row.symbol)}>{row.symbol}</Link> : '—'}</th>
      <td data-label="公司" className="usdc-company">{row.company}{row.exchange && <small>{row.exchange}</small>}</td>
      <td data-label="发行价格">{row.price ? (row.price.startsWith('$') ? row.price : `$${row.price}`) : '—'}</td>
      <td data-label="发行股数">{row.shares === null ? '—' : `${new Intl.NumberFormat('zh-CN').format(row.shares)} 股`}</td>
      <td data-label="预计募集金额">{row.amount === null ? '—' : formatMarketCap(row.amount)}</td>
    </tr>)}</tbody>
  </table></div>
}

/** 原站更新时间是英文整句（如 LAST UPDATED: 11/27/2026* - Source: ...），只取出日期给读者 */
export function sourceUpdatedText(value: string | null): string {
  const match = value ? /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value) : null
  return match ? `原站标注的更新日期：${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}。` : '原站没有提供单独更新时间。'
}

export default function IpoPanel(): JSX.Element {
  const [month, setMonth] = useState(nyMonth)
  const { state, retry } = useUsdcQuery(usdcUrl('usdc-ipo', { month }), parseIpo)
  const original = <a href="https://www.nasdaq.com/market-activity/ipos" target="_blank" rel="noreferrer">Nasdaq 原站<ExternalLink size={13} aria-hidden="true" /></a>
  return <section className="usdc-panel" aria-labelledby="usdc-ipo-title">
    <div className="usdc-panel__head">
      <div><h2 id="usdc-ipo-title">新股上市</h2><p>按月份查看美国上市申请进度；日期以原站日历为准。</p></div>
      <RefreshButton onClick={retry} loading={state.status === 'loading'} />
    </div>
    <div className="usdc-toolbar">
      <label>选择月份<input type="month" value={month} onChange={event => event.target.value && setMonth(event.target.value)} /></label>
      <span className="usdc-source-link">{original}</span>
    </div>
    {state.status === 'loading' && <Loading label="正在读取新股日历…" />}
    {state.status === 'error' && <><LoadError reason="新股日历暂时取不到，请稍后重试，或到原站查看。" detail={state.error} onRetry={retry} /><p className="usdc-fallback-link">在原站核对：{original}</p></>}
    {state.status === 'ready' && <>
      <p className="usdc-meta">日历月份：{state.data.month}<span>本页取数：{formatNyTime(state.data.fetchedAt)}（纽约时间） · 披露进度不是实时行情</span></p>
      <p className="usdc-source">来源：Nasdaq 公开新股日历。{sourceUpdatedText(state.data.sourceUpdated)}</p>
      {Object.values(state.data.groups).every(rows => rows.length === 0) ? <EmptyState title="这个月暂无新股记录"><p>可换一个月查看，或到 {original} 核对。</p></EmptyState> : <div className="usdc-ipo-groups">
        {GROUPS.map(group => <section key={group.id} className="usdc-ipo-group" aria-labelledby={`usdc-ipo-${group.id}`}>
          <div className="usdc-ipo-group__head"><div><h3 id={`usdc-ipo-${group.id}`}>{group.label}<span>{state.data.groups[group.id].length}</span></h3><p>{group.hint}</p></div></div>
          <IpoTable rows={state.data.groups[group.id]} group={group.id} />
        </section>)}
      </div>}
    </>}
  </section>
}
