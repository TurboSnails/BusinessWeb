// 今天几星 · 阀值表（/jixing/threshold）
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, LoadError, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import JixingTabs, { JIXING_DISCLAIMER } from '../../features/jixing-tabs/JixingTabs'
import { SampleFootnote, StatusBadge, StatusLegend } from '../../features/jixing-tabs/StatusBadge'
import {
  GROUPS, METHOD, asJixingThreshold, fmtDist, fmtLine, fmtNum, fmtPct,
  type GroupFilter, type JixingThresholdData, type ThresholdRow,
} from '../../features/jixing-threshold/model'
import '../../styles/market-mood.css'
import '../../styles/jixing-table.css'
import '../../styles/jixing-threshold.css'

export default function JixingThreshold(): JSX.Element {
  const [data, setData] = useState<JixingThresholdData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoading(true); setError(null); setData(null); setAttempt(n => n + 1) }
  const [group, setGroup] = useState<GroupFilter>('all')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}data/jixing-threshold.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: unknown) => {
        if (controller.signal.aborted) return
        const parsed = asJixingThreshold(body)
        if (!parsed) { setError('数据文件格式不对'); setData(null); return }
        setData(parsed)
        setError(null)
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        setData(null)
        setError(e instanceof Error ? e.message : '网络错误')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])

  const rows = sortRows(
    (data?.rows ?? []).filter(r => group === 'all' || r.group === group),
    sortAsc,
  )

  return (
    <Page className="mm-page jt-page jth-page">
      <PageTitle>今天几星 · 阀值表</PageTitle>
      <JixingTabs />
      <p className="mm-disclaimer">{JIXING_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取阀值表…</p> : error ? (
        <LoadError reason="阀值表这份读数现在拿不到。" detail={error} onRetry={retry} />
      ) : !data ? (
        <EmptyState title="暂无阀值数据">完整估值发布后才会生成阀值表。</EmptyState>
      ) : (
        <Card title="螺丝钉指数阀值表（本站版）" as="section" className="mm-card jt-card"
          description={`${data.asOf} · 同源估值表 ${data.sourceAsOf}`}>
          <ul className="jx-links">
            <li><Link to="/jixing/table">估值表</Link></li>
            <li><Link to="/jixing/map">指数地图</Link></li>
          </ul>
          <Segmented label="指数分组" items={[...GROUPS]} value={group} onChange={setGroup} />
          <div className="jth-sort">
            <button type="button" className="btn-ghost" onClick={() => setSortAsc(v => !v)} aria-pressed={sortAsc}>
              按距低估线排序（{sortAsc ? '近→远' : '远→近'}）
            </button>
          </div>
          <StatusLegend>{METHOD.status}</StatusLegend>
          {rows.length ? (
            <TableWrap label="指数阀值，可横向滚动" stickyFirst>
              <table className="ui-table jt-table">
                <thead>
                  <tr>
                    {['指数', '判定依据', '当前值', '低估线', '高估线', '当前百分位', '距低估线', '距高估线', '估值状态', '样本'].map(h => (
                      <th key={h} scope="col">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.code}>
                      <th scope="row">
                        <Link className="jt-index" to={`/jixing/table?code=${r.code}`}>{r.name}</Link>
                        <small className="jth-code">{r.code}</small>
                      </th>
                      <td>{r.basisLabel}</td>
                      <td className="num">{fmtNum(r.current)}</td>
                      <td className="num">{fmtLine(r.lowLine, r.lowLine === null)}</td>
                      <td className="num">{fmtLine(r.highLine, r.highLine === null)}</td>
                      <td className="num">{fmtPct(r.pct)}</td>
                      <td className="num">{r.lowLine === null ? '样本不足' : fmtDist(r.distLowPct, r.alreadyLow, '已低估')}</td>
                      <td className="num">{r.highLine === null ? '样本不足' : fmtDist(r.distHighPct, r.alreadyHigh, '已高估')}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{r.sampleSince ? `${r.sampleSince} / ${r.sampleCount}` : `— / ${r.sampleCount}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : <p className="mm-empty">该分组暂无指数。</p>}
          <SampleFootnote>{METHOD.lines}</SampleFootnote>
          <SampleFootnote>{METHOD.dist}</SampleFootnote>
          <SampleFootnote>{data.method.lines}</SampleFootnote>
        </Card>
      )}
    </Page>
  )
}

function sortRows(rows: ThresholdRow[], asc: boolean): ThresholdRow[] {
  const score = (r: ThresholdRow): number => {
    if (r.alreadyLow) return -Infinity
    if (r.distLowPct === null) return Infinity
    return r.distLowPct
  }
  return [...rows].sort((a, b) => {
    const aThin = a.lowLine === null
    const bThin = b.lowLine === null
    if (aThin !== bThin) return aThin ? 1 : -1 // 样本不足始终放最后
    const d = score(a) - score(b)
    return asc ? d : -d
  })
}
