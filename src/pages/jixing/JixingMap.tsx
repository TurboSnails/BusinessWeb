// 今天几星 · 指数地图（/jixing/map）
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, LoadError, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import JixingTabs, { JIXING_DISCLAIMER } from '../../features/jixing-tabs/JixingTabs'
import { SampleFootnote, StatusBadge, StatusLegend, VALUATION_STATUS } from '../../features/jixing-tabs/StatusBadge'
import { asJixingTable } from '../../features/jixing-table/model'
import { asJixingGlobal } from '../../features/jixing-global/model'
import {
  MAP_GROUPS, METHOD, fmtPct, fromGlobalRow, fromTableRow, statusClass,
  type MapCell, type MapGroupFilter,
} from '../../features/jixing-map/model'
import '../../styles/market-mood.css'
import '../../styles/jixing-map.css'

const BASE = import.meta.env.BASE_URL

function CellLink({ c }: { c: MapCell }): JSX.Element {
  const metric = c.basis === 'pb' ? 'PB' : 'PE'
  const detail = `${metric} ${fmtPct(c.pct)} · ${c.status ? VALUATION_STATUS[c.status].label : '—'}`
  const label = `${c.name} ${detail}`
  return (
    <Link to={c.href} className={`jx-map-cell ${statusClass(c.status)}`} title={label} aria-label={label}>
      <strong>{c.name}</strong>
      <span>{detail}</span>
    </Link>
  )
}

function BroadQuadrant({ cells }: { cells: MapCell[] }): JSX.Element {
  return (
    <svg className="jx-map-quad-svg" viewBox="0 0 100 84" role="group" aria-label="宽基四象限：横轴小盘到大盘，纵轴价值到成长">
      <line className="jx-map-axis" x1="50" y1="4" x2="50" y2="80" />
      <line className="jx-map-axis" x1="4" y1="42" x2="96" y2="42" />
      <text className="jx-map-axis-label" x="4" y="80">小盘</text>
      <text className="jx-map-axis-label" x="90" y="82.5">大盘</text>
      <text className="jx-map-axis-label" x="4" y="8">成长</text>
      <text className="jx-map-axis-label" x="4" y="50">价值</text>
      {cells.map(c => {
        if (!c.position) return null
        const { x, y } = c.position
        // 汉字按一字宽预留空间，字母和数字较窄。
        const width = Array.from(c.name).reduce((sum, ch) => sum + (/^[a-zA-Z0-9]$/.test(ch) ? 2 : 3.2), 4)
        const tone = c.status ?? 'empty'
        const metric = c.basis === 'pb' ? 'PB' : 'PE'
        const label = `${c.name} ${metric} ${fmtPct(c.pct)} ${c.status ? VALUATION_STATUS[c.status].label : '无分位'}`
        return (
          <Link key={c.code} to={c.href} role="link" aria-label={label} className={`jx-map-svg-hit jx-map-svg-hit--${tone}`}>
            <title>{label}</title>
            <rect x={x - width / 2} y={y - 3.5} width={width} height="7" rx="1" />
            <text x={x} y={y + 1} textAnchor="middle">{c.name}</text>
          </Link>
        )
      })}
    </svg>
  )
}

export default function JixingMap(): JSX.Element {
  const [cells, setCells] = useState<MapCell[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoading(true); setError(null); setCells(null); setAttempt(n => n + 1) }
  const [group, setGroup] = useState<MapGroupFilter>('all')
  const [view, setView] = useState<'map' | 'table'>('map')

  useEffect(() => {
    const c = new AbortController()
    const loadJson = async (name: string): Promise<unknown> => {
      const r = await fetch(`${BASE}data/${name}`, { cache: 'no-cache', signal: c.signal })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }
    Promise.all([
      loadJson('jixing-table.json'),
      loadJson('jixing-global.json').catch(() => null), // 全球可选；主表失败才整页报错
    ]).then(([tableBody, globalBody]) => {
      if (c.signal.aborted) return
      const table = asJixingTable(tableBody)
      const global = asJixingGlobal(globalBody)
      if (!table) { setError('数据文件格式不对'); setCells(null); return }
      const list: MapCell[] = table.rows.map(fromTableRow)
      if (global) {
        for (const r of global.hk.rows) {
          const cell = fromGlobalRow(r, 'hk')
          if (cell) list.push(cell)
        }
        for (const r of global.global.rows) {
          const cell = fromGlobalRow(r, 'overseas')
          if (cell) list.push(cell)
        }
      }
      setCells(list)
      setError(null)
    }).catch((e: unknown) => {
      if (!c.signal.aborted) {
        setCells(null)
        setError(e instanceof Error ? e.message : '网络错误')
      }
    })
      .finally(() => { if (!c.signal.aborted) setLoading(false) })
    return () => c.abort()
  }, [attempt])

  const filtered = (cells ?? []).filter(c => group === 'all' || c.group === group)
  const broad = filtered.filter(c => c.group === 'broad' && c.position)
  const restGroups = MAP_GROUPS.filter(g => g.id !== 'all' && g.id !== 'broad')

  return (
    <Page className="mm-page jx-map-page">
      <PageTitle>今天几星 · 指数地图</PageTitle>
      <JixingTabs />
      <p className="mm-disclaimer">{JIXING_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取指数地图…</p> : error ? (
        <LoadError reason="指数地图这份读数现在拿不到。" detail={error} onRetry={retry} />
      ) : !cells ? (
        <EmptyState title="暂无地图数据">估值表发布后可查看指数地图。</EmptyState>
      ) : (
        <Card title="指数地图" as="section" className="mm-card" description="点击格子跳到估值表或港股全球。">
          <Segmented label="分组" items={[...MAP_GROUPS]} value={group} onChange={setGroup} />
          <Segmented label="视图" items={[{ id: 'map', label: '地图' }, { id: 'table', label: '表格' }]} value={view} onChange={setView} />
          <ul className="jx-map-legend" aria-label="估值状态图例">
            {(['low', 'normal', 'high'] as const).map(k => (
              <li key={k}><span className={`jx-map-swatch jx-map-swatch--${k}`} aria-hidden />{VALUATION_STATUS[k].label}</li>
            ))}
            <li><span className="jx-map-swatch jx-map-swatch--empty" aria-hidden />无分位</li>
          </ul>
          <StatusLegend>{METHOD.status}</StatusLegend>

          {view === 'table' ? (
            <TableWrap label="指数地图表格视图" stickyFirst>
              <table className="ui-table">
                <thead><tr><th scope="col">指数</th><th scope="col">分组</th><th scope="col">百分位</th><th scope="col">状态</th></tr></thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={`${c.group}-${c.code}`}>
                      <th scope="row"><Link to={c.href}>{c.name}</Link></th>
                      <td>{MAP_GROUPS.find(g => g.id === c.group)?.label ?? c.group}</td>
                      <td className="num">{fmtPct(c.pct)}</td>
                      <td><StatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <>
              {(group === 'all' || group === 'broad') && broad.length ? (
                <>
                  <h3 className="jx-map-section-title">宽基 · 规模 × 风格</h3>
                  <div className="jx-map-quad-wrap">
                    <BroadQuadrant cells={broad} />
                  </div>
                  <div className="jx-map-grid jx-map-grid--compact" aria-label="宽基紧凑网格">
                    {broad.map(c => <CellLink key={`g-${c.code}`} c={c} />)}
                  </div>
                </>
              ) : null}
              {restGroups.filter(g => group === 'all' || group === g.id).map(g => {
                const list = filtered.filter(c => c.group === g.id)
                if (!list.length) return null
                return (
                  <div key={g.id}>
                    <h3 className="jx-map-section-title">{g.label}</h3>
                    <div className="jx-map-grid">
                      {list.map(c => <CellLink key={`${c.group}-${c.code}`} c={c} />)}
                    </div>
                  </div>
                )
              })}
            </>
          )}
          <SampleFootnote>{METHOD.layout}</SampleFootnote>
        </Card>
      )}
    </Page>
  )
}
