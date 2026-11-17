import React, { useMemo, useState } from 'react'
import type { IndexData } from '../macro/valuation'
import { compareIndices } from './catalog'
import './index-catalog.css'
import registry from './registry.json'
import IndexEtfLinks from './IndexEtfLinks'

export default function IndexExplorer({ indexes }: { indexes: Record<string, IndexData> }): JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [range, setRange] = useState('5')
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const raw: unknown = JSON.parse(localStorage.getItem('businessweb.index-favorites.v1') ?? '[]'); return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [] } catch { return [] }
  })
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [notice, setNotice] = useState('')
  const [pendingOpen, setPendingOpen] = useState<string | null>(null)
  const pending = Object.entries(registry).filter(([key, value]) => 'name' in value && !indexes[key])
  const comparison = useMemo(() => compareIndices(indexes, selected, range === 'all' ? null : Number(range)), [indexes, selected, range])
  const entries = Object.entries(indexes).filter(([key, ix]) => (!favoriteOnly || favorites.includes(key)) && `${ix.name} ${ix.symbol}`.toLowerCase().includes(query.trim().toLowerCase()))
  const toggle = (key: string) => setSelected(keys => keys.includes(key) ? keys.filter(k => k !== key) : keys.length < 4 ? [...keys, key] : keys)
  const favorite = (key: string) => {
    const next = favorites.includes(key) ? favorites.filter(k => k !== key) : [...favorites, key]
    setFavorites(next)
    try { localStorage.setItem('businessweb.index-favorites.v1', JSON.stringify(next)); setNotice('') } catch { setNotice('收藏只在本次打开期间保留，浏览器未能保存。') }
  }
  const allValues = comparison.series.flatMap(s => s.points.map(p => p[1]))
  const lo = Math.min(100, ...allValues), hi = Math.max(101, ...allValues)
  const ordinal = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7))
  const x = (i: number) => 52 + (ordinal(comparison.months[i]) - ordinal(comparison.months[0])) / Math.max(1, ordinal(comparison.months.at(-1)!) - ordinal(comparison.months[0])) * 680
  const y = (v: number) => 216 - (v - lo) / (hi - lo) * 180
  return <section className="macro-card index-explorer" aria-labelledby="index-compare-title">
    <h3 id="index-compare-title">指数比较</h3>
    <p className="macro-muted">选择 2–4 只指数，比较共同月份的价格变化，起点归一为 100。按月份对齐；部分 Yahoo 序列以月初作标签，腾讯通常为末交易日标签，均不代表该标签当天成交价。当月数据可能尚未完成；月收盘不含分红，跨市场也未换算汇率。</p>
    <div className="index-controls"><label>搜索指数<input value={query} onChange={e => setQuery(e.target.value)} placeholder="名称或代码" /></label><label>比较区间<select value={range} onChange={e => setRange(e.target.value)}><option value="1">近1年</option><option value="3">近3年</option><option value="5">近5年</option><option value="10">近10年</option><option value="all">全部</option></select></label><label><input type="checkbox" checked={favoriteOnly} onChange={e => setFavoriteOnly(e.target.checked)} />仅看收藏</label></div>
    <div className="index-options">{entries.map(([key, ix]) => <div className="index-option" key={key}><label><input type="checkbox" checked={selected.includes(key)} disabled={!selected.includes(key) && selected.length >= 4} onChange={() => toggle(key)} />{ix.name}<small>{ix.group}</small></label><button type="button" aria-label={`${favorites.includes(key) ? '取消收藏' : '收藏'}${ix.name}`} aria-pressed={favorites.includes(key)} onClick={() => favorite(key)}>{favorites.includes(key) ? '★' : '☆'}</button></div>)}</div>
    {!entries.length && <p>没有匹配的指数。</p>}
    {pending.length > 0 && <section aria-label="待采集行业指数"><h4>已登记的行业指数</h4><p className="macro-muted">以下真实指数尚未取得有效月线，暂不能加入价格比较。可以先查看已核验的 ETF 关系；刷新成功后自动加入上方列表。</p>{pending.map(([key, value]) => <div key={key}><button type="button" className="tool-btn" aria-expanded={pendingOpen === key} aria-controls={`pending-${key}`} onClick={() => setPendingOpen(pendingOpen === key ? null : key)}>{'name' in value ? value.name : key}（{value.code}）· 待采集</button>{pendingOpen === key && <div id={`pending-${key}`}><IndexEtfLinks indexKey={key} /></div>}</div>)}</section>}
    {notice && <p role="status">{notice}</p>}
    {selected.length < 2 ? <p className="macro-muted">已选 {selected.length} 只；至少选择两只开始比较。</p> : !comparison.series.length ? <p role="status">所选指数没有至少两个共同月份的有效价格，暂不能比较。</p> : <>
      <svg viewBox="0 0 780 250" className="index-comparison-chart" role="img" aria-label="所选指数归一化价格比较图，详细数值见下表"><line x1="52" x2="732" y1={y(100)} y2={y(100)} stroke="currentColor" opacity=".2" />{[lo, hi].map(v => <text key={v} x="2" y={y(v)} fill="currentColor" fontSize="12">{v.toFixed(0)}</text>)}{comparison.series.map((s, n) => <path key={s.key} fill="none" className={`index-line index-series-${n}`} strokeWidth="2" strokeDasharray={n % 2 ? '7 3' : undefined} d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[1])}`).join(' ')} />)}<text x="52" y="243" fill="currentColor" fontSize="12">{comparison.months[0]}</text><text x="732" y="243" textAnchor="end" fill="currentColor" fontSize="12">{comparison.months.at(-1)}</text></svg>
      <div className="macro-table-wrap"><table className="macro-table"><caption>{comparison.months[0]} 至 {comparison.months.at(-1)} · {comparison.months.length} 个共同月份</caption><thead><tr><th>指数</th><th>月线起止标签</th><th>最新行情截至</th><th>起点</th><th>期末归一值</th><th>区间价格变化</th></tr></thead><tbody>{comparison.series.map((s, n) => <tr key={s.key}><th scope="row"><span className={`index-series-${n}`}>{n + 1} · </span>{s.name}</th><td>{s.firstDate} 至 {s.lastDate}</td><td>{indexes[s.key].latest.date}</td><td>100</td><td>{s.points.at(-1)![1].toFixed(2)}</td><td>{(s.points.at(-1)![1] - 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
    </>}
  </section>
}
