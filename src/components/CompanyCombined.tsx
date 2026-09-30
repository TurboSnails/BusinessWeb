import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Company, LynchInfo } from '../data/companies'

interface Props {
  companies: Company[]
  lynch: Record<string, LynchInfo>
  ratingOf: (company: Company) => string
  loading: boolean
}
const types = ['快速增长型', '稳健型', '缓慢增长型', '周期型', '困境反转型', '资产型', '未分类']
const control: React.CSSProperties = { fontFamily: 'inherit', fontSize: '13px', padding: '8px 12px', border: '1px solid var(--border-primary)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }
const cell: React.CSSProperties = { padding: '12px', textAlign: 'left', verticalAlign: 'top', borderBottom: '1px solid var(--border-primary)' }

export default function CompanyCombined({ companies, lynch, ratingOf, loading }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('全部')
  const [rating, setRating] = useState('全部')
  const [type, setType] = useState('全部')
  const [tier, setTier] = useState('全部')
  const [moat, setMoat] = useState('全部')
  const [limit, setLimit] = useState(60)
  // 公司池为左表，林奇数据补充字段；缺标签不丢公司，跨市场同代码不合并。
  const unique = Array.from(new Map(companies.map(c => [`${c.market}:${c.code}`, c])).values())
  const sectors = Array.from(new Set(unique.map(c => c.sector))).sort()
  const ratings = Array.from(new Set(unique.map(ratingOf)))
  const rows = unique.map(company => ({ company, info: lynch[`${company.market}:${company.code}`] }))
  const shown = rows.filter(({ company: c, info: l }) =>
    (sector === '全部' || c.sector === sector) &&
    (rating === '全部' || ratingOf(c) === rating) &&
    (type === '全部' || (l?.t || '未分类') === type) &&
    (tier === '全部' || l?.r === tier) &&
    (moat === '全部' || (moat === '未提供' ? !l?.m : l?.m?.l.startsWith(moat))) &&
    (!query.trim() || `${c.name} ${c.code}`.toLowerCase().includes(query.trim().toLowerCase())),
  )
  useEffect(() => { setLimit(60) }, [query, sector, rating, type, tier, moat])
  const reset = (): void => { setQuery(''); setSector('全部'); setRating('全部'); setType('全部'); setTier('全部'); setMoat('全部') }
  const select = (label: string, value: string, values: string[], change: (value: string) => void): JSX.Element => (
    <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px' }}>
      {label}<select aria-label={label} value={value} onChange={e => change(e.target.value)} style={control}>
        {['全部', ...values].map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </label>
  )
  const exportRows = (all: boolean): void => {
    const data = (all ? rows : shown).map(({ company: c, info: l }) => ({
      市场: c.market, 代码: c.code, 公司: c.name, 行业: c.sector, 评级: c.rating, 评级归类: ratingOf(c),
      研究结论: c.headline, 研究时点: c.asOf, 林奇类型: l?.t || '未分类', 同类关注度: l?.r || '未提供',
      护城河: l?.m?.l || '未提供', 护城河证据: l?.m ? `${l.m.s}/${l.m.n}` : null,
      林奇判断: l?.v || l?.w.join('；') || '', 林奇指标: l ? { PE: l.pe ?? null, 盈利增速: l.g ?? null, 两年年化: l.c ?? null, PEG: l.peg ?? null, 股息率: l.dy ?? null } : null,
      林奇提示: l?.f || [],
    }))
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url
    anchor.download = `${companies[0]?.market || '公司'}-综合分类-${all ? '全部' : '筛选'}-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const number = (value: number | null | undefined, suffix: string): string => value == null ? '—' : `${value}${suffix}`
  return (
    <section aria-label="综合分类" style={{ padding: '20px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)', marginBottom: '16px' }}>
      <h3 style={{ margin: '0 0 10px', fontSize: '16px' }}>综合分类 · 公司研究与林奇分组</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
        同一家公司同时展示两套分类；研究评级与林奇同类关注度分别保留。缺少林奇标签的公司显示“未分类”，仍在列表中。林奇分类来自历史程序化筛选，同类关注度仅在同类型内比较；最新研究结论以公司复核记录为准。
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
        <input aria-label="搜索综合分类" placeholder="搜索公司名称或代码" value={query} onChange={e => setQuery(e.target.value)} style={{ ...control, flex: '1 1 180px' }} />
        {select('行业', sector, sectors, setSector)}
        {select('研究评级', rating, ratings, setRating)}
        {select('林奇类型', type, types, setType)}
        {select('同类关注度', tier, ['高', '中', '低'], setTier)}
        {select('护城河', moat, ['宽', '窄', '未提供'], setMoat)}
        <button onClick={reset} style={{ ...control, cursor: 'pointer' }}>重置筛选</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
        <span aria-live="polite" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>符合筛选 {shown.length} / 全部 {rows.length} 家{loading ? ' · 公司数据加载中…' : ''}</span>
        <button onClick={() => exportRows(false)} style={{ ...control, cursor: 'pointer' }}>导出当前筛选（{shown.length}）JSON</button>
        <button onClick={() => exportRows(true)} style={{ ...control, cursor: 'pointer' }}>导出该市场全部（{rows.length}）JSON</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead><tr style={{ background: 'var(--bg-secondary)' }}>{['公司', '行业', '研究评级', '研究结论', '林奇类型', '同类关注度', '护城河', '关键指标', '林奇判断'].map(h => <th key={h} scope="col" style={{ ...cell, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>{shown.slice(0, limit).map(({ company: c, info: l }) => (
            <tr key={`${c.market}:${c.code}`}>
              <td style={cell}><Link to={`/research-notes/${c.market}/${encodeURIComponent(c.code)}`} onClick={() => { try { sessionStorage.setItem('rn-scroll', String(window.scrollY)) } catch { /* 隐私模式 */ } }} style={{ color: 'var(--system-blue)', whiteSpace: 'nowrap' }}>{c.name} {c.code}</Link>{c.auto && <small style={{ display: 'block', color: 'var(--text-tertiary)' }}>程序化</small>}</td>
              <td style={cell}>{c.sector}</td>
              <td style={{ ...cell, minWidth: '100px' }}>{c.rating}</td>
              <td style={{ ...cell, minWidth: '240px' }}>{c.headline}</td>
              <td style={cell}>{l?.t || '未分类'}</td>
              <td style={cell}>{l?.r || '未提供'}</td>
              <td style={{ ...cell, minWidth: '140px' }}>{l?.m ? `${l.m.l} ${l.m.s}/${l.m.n}` : '未提供'}</td>
              <td style={{ ...cell, minWidth: '170px' }}>{l ? `PE ${number(l.pe, '×')} · 利润 ${number(l.g, '%')}（两年年化 ${number(l.c, '%')}） · PEG ${number(l.peg, '')}${l.ph ? ` · ${l.ph}` : ''}${l.dy != null ? ` · 股息 ${l.dy}%` : ''}` : '未提供'}</td>
              <td style={{ ...cell, minWidth: '220px' }}>{l?.v || l?.w.join('；') || '未提供'}{l?.f.length ? <small style={{ display: 'block', color: 'var(--text-tertiary)' }}>提示：{l.f.join('；')}</small> : null}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!shown.length && <p style={{ fontSize: '13px', textAlign: 'center' }}>没有符合当前筛选条件的公司。</p>}
      {shown.length > limit && <div style={{ textAlign: 'center', marginTop: '14px' }}><button style={{ ...control, cursor: 'pointer' }} onClick={() => setLimit(n => n + 100)}>显示更多（已显示 {limit} / {shown.length}）</button></div>}
    </section>
  )
}
