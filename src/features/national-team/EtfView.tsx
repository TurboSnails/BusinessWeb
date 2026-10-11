import React, { useMemo, useState } from 'react'
import { Delta, GroupTag, Stat } from './parts'
import LineChart from './LineChart'
import { formatPct, formatShares, formatYuan } from './format'
import type { EtfData, EtfRow } from './types'

type SortKey = 'mv' | 'ratio' | 'chg'

function EtfDetail({ etf }: { etf: EtfRow }): JSX.Element {
  const periods = etf.hist.map(h => h.d)
  return (
    <div className="nt-detail">
      <div>
        <h4>各报告期国家队持有</h4>
        <table className="nt-table nt-table--tight">
          <thead><tr><th scope="col">报告期</th><th scope="col">持有人</th><th scope="col">持有份额</th><th scope="col">占比</th></tr></thead>
          <tbody>
            {etf.hist.slice().reverse().flatMap(h => (h.nt.length ? h.nt : [null]).map((r, i) => (
              <tr key={`${h.d}-${i}`}>
                <th scope="row">{i === 0 ? h.d : ''}</th>
                {r ? (<><td className="nt-wrap"><GroupTag id={r.g} /> {r.h}</td><td className="num">{formatShares(r.shares)}</td><td className="num">{formatPct(r.ratio)}</td></>)
                  : <td colSpan={3} className="nt-muted">不在十大持有人中</td>}
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div className="nt-detail__chart">
        <h4>国家队合计占比（%）</h4>
        <LineChart periods={periods} format={v => `${v.toFixed(1)}%`} label={`${etf.n}国家队合计占比`}
          series={[{ key: 'ratio', label: '合计占比', color: 'var(--accent)', values: etf.hist.map(h => (h.ratio ? h.ratio : null)) }]} />
      </div>
    </div>
  )
}

export default function EtfView({ data }: { data: EtfData }): JSX.Element {
  const [theme, setTheme] = useState('')
  const [status, setStatus] = useState<'hold' | 'exited'>('hold')
  const [sort, setSort] = useState<SortKey>('mv')
  const [open, setOpen] = useState<string | null>(null)
  const { meta } = data
  const maxTheme = Math.max(...meta.themes.map(t => t.mv), 1)
  const themes = useMemo(() => [...new Set(data.etfs.map(e => e.theme))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [data])

  const rows = useMemo(() => {
    const val = (e: EtfRow): number => sort === 'mv' ? (e.mv ?? -1) : sort === 'ratio' ? e.latest.ratio
      : e.prev?.shares ? (e.latest.shares - e.prev.shares) / e.prev.shares : -Infinity
    return data.etfs.filter(e => e.status === status && (!theme || e.theme === theme)).sort((a, b) => val(b) - val(a))
  }, [data, status, theme, sort])

  const th = (key: SortKey, text: string): JSX.Element => (
    <th scope="col" aria-sort={sort === key ? 'descending' : 'none'}>
      <button type="button" className="nt-sortbtn" onClick={() => setSort(key)}>{text}{sort === key ? ' ↓' : ''}</button>
    </th>
  )

  return (
    <div className="nt-stack">
      <p className="nt-note">
        国家队通过 <b>ETF</b> 间接持股，和前面「个股」里的直接持股<b>口径独立，不能相加</b>。基金只在半年报、年报里披露十大持有人，最新一期是 <b>{meta.latestDate}</b>。
        持有市值是估算值：报告期持有份额 × 最近价格。
      </p>
      <section aria-label="ETF 关键数字" className="nt-stats">
        <Stat label="持有的 ETF" value={`${meta.numHolding} 只`} sub={`另有 ${meta.numExited} 只已退出十大持有人`} />
        <Stat label="估算持有市值" value={formatYuan(meta.totalMv)} sub="份额 × 最近价格" />
        <Stat label="扫描范围" value={`${meta.scanned} 只`} sub={`沪深 ETF 共 ${meta.universeCount} 只`} />
      </section>

      <section aria-labelledby="nt-etf-themes">
        <h2 id="nt-etf-themes" className="nt-h2">按主题 <span className="nt-muted">主题由 ETF 名称归类，点主题筛选下表</span></h2>
        <ul className="nt-bars">
          {meta.themes.map(t => (
            <li key={t.theme}>
              <button type="button" className="nt-bars__name nt-linkish" onClick={() => setTheme(theme === t.theme ? '' : t.theme)} aria-pressed={theme === t.theme}>{t.theme}</button>
              <span className="nt-bars__track"><i style={{ width: `${(t.mv / maxTheme) * 100}%` }} /></span>
              <span className="nt-bars__val">{formatYuan(t.mv)}</span>
              <span className="nt-bars__aux nt-muted">{t.n} 只</span>
              <span />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="nt-etf-list">
        <h2 id="nt-etf-list" className="nt-h2">ETF 明细</h2>
        <div className="nt-filters">
          <label>状态
            <select value={status} onChange={e => setStatus(e.target.value as 'hold' | 'exited')}>
              <option value="hold">仍在十大持有人中</option>
              <option value="exited">已退出</option>
            </select>
          </label>
          <label>主题
            <select value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="">全部</option>
              {themes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <span className="nt-muted nt-filters__count" aria-live="polite">{rows.length} 只</span>
        </div>
        <div className="nt-tablewrap">
          <table className="nt-table nt-table--stocks">
            <thead>
              <tr>
                <th scope="col">ETF</th><th scope="col">主题</th><th scope="col">机构</th>
                {th('mv', '估算持有市值')}{th('ratio', '合计占比')}{th('chg', '持有份额较上期')}
              </tr>
            </thead>
            <tbody>
              {rows.map(e => {
                const expanded = open === e.c
                return (
                  <React.Fragment key={e.c}>
                    <tr className={expanded ? 'is-open' : ''}>
                      <th scope="row">
                        <button type="button" className="nt-linkish" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : e.c)}>
                          <b>{e.n}</b> <small>{e.c}</small>
                        </button>
                      </th>
                      <td>{e.theme}</td>
                      <td>{e.groups.map(g => <GroupTag key={g} id={g} />)}</td>
                      <td className="num">{formatYuan(e.mv)}</td>
                      <td className="num">{formatPct(e.latest.ratio)}</td>
                      <td className="num">{e.prev ? <Delta cur={e.latest.shares} prev={e.prev.shares} label={`${formatShares(e.prev.shares)} → ${formatShares(e.latest.shares)}（${e.prev.d} → ${e.latest.d}）`} /> : '—'}</td>
                    </tr>
                    {expanded && <tr className="nt-detailrow"><td colSpan={6}><EtfDetail etf={e} /></td></tr>}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="nt-muted">没有符合条件的 ETF。</p>}
      </section>
    </div>
  )
}
