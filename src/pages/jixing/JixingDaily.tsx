// 今天几星 · 指数日报（/jixing/daily）
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, Page, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import JixingTabs, { JIXING_DISCLAIMER } from '../../features/jixing-tabs/JixingTabs'
import { SampleFootnote, StatusBadge } from '../../features/jixing-tabs/StatusBadge'
import {
  METHOD, asJixingDailyIndex, asJixingDailyReport, fmt, signed,
  type JixingDailyIndex, type JixingDailyReport,
} from '../../features/jixing-daily/model'
import '../../styles/market-mood.css'
import '../../styles/jixing-daily.css'

const BASE = import.meta.env.BASE_URL

export default function JixingDaily(): JSX.Element {
  const [index, setIndex] = useState<JixingDailyIndex | null>(null)
  const [fetchedReport, setFetchedReport] = useState<JixingDailyReport | null>()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const c = new AbortController()
    fetch(`${BASE}data/jixing-daily.json`, { cache: 'no-cache', signal: c.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        if (c.signal.aborted) return
        setIndex(asJixingDailyIndex(body))
      })
      .catch(() => { if (!c.signal.aborted) setIndex(null) })
      .finally(() => { if (!c.signal.aborted) setLoading(false) })
    return () => c.abort()
  }, [])

  const date = selectedDate ?? index?.latest.asOf
  const inlineReport = date === index?.latest.asOf && !index?.latest.truncated ? index?.latest : undefined
  const report = inlineReport ?? fetchedReport

  function selectDate(next: string) {
    if (date === next) return
    setSelectedDate(next)
    setFetchedReport(undefined)
  }

  useEffect(() => {
    if (!date || inlineReport) return
    const c = new AbortController()
    fetch(`${BASE}data/jixing-daily-${date}.json`, { cache: 'no-cache', signal: c.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        if (c.signal.aborted) return
        const next = asJixingDailyReport(body)
        setFetchedReport(next?.asOf === date ? next : null)
      })
      .catch(() => { if (!c.signal.aborted) setFetchedReport(null) })
    return () => c.abort()
  }, [date, inlineReport])

  const dates = index?.dates ?? []
  const pos = date ? dates.indexOf(date) : -1
  const older = pos >= 0 && pos < dates.length - 1 ? dates[pos + 1] : null
  const newer = pos > 0 ? dates[pos - 1] : null

  return (
    <Page className="mm-page jx-daily-page">
      <PageTitle>今天几星 · 指数日报</PageTitle>
      <JixingTabs />
      <p className="mm-disclaimer">{JIXING_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取指数日报…</p> : !index ? (
        <EmptyState title="暂无指数日报">交易日盘后生成；需估值表与星级已发布。</EmptyState>
      ) : (
        <>
          <Card title="日期" as="section" className="mm-card">
            <div className="jx-daily-nav">
              <button type="button" className="btn-ghost" disabled={!older} onClick={() => older && selectDate(older)}>上一天</button>
              <label className="jx-daily-pick">
                <span className="visually-hidden">选择日报日期</span>
                <select value={date ?? ''} onChange={e => selectDate(e.target.value)}>
                  {dates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <button type="button" className="btn-ghost" disabled={!newer} onClick={() => newer && selectDate(newer)}>下一天</button>
            </div>
          </Card>
          {report === undefined ? <p role="status">正在读取 {date} 日报…</p> : !report ? <EmptyState title="该日日报加载失败">可换一天再试。</EmptyState> : (
            <>
              <Card title={`摘要 · ${report.asOf}`} as="section" className="mm-card"
                description={report.missingPrev ? (report.note ?? '缺前一交易日快照') : `较 ${report.prevDate}`}>
                <ul className="jx-daily-summary">
                  <li>{report.starBasis === 'neutral' ? '行业中性星级' : '中证全指口径星级'} <b>{fmt(report.star, 1)}</b>
                    {report.starChange === null ? '（变化 —）' : `（${signed(report.starChange, 1)}）`}
                    {report.star === null && report.starAsOf && report.starAsOf !== report.asOf && `，星级数据日 ${report.starAsOf}`}</li>
                  <li>低估 {report.counts.low} / 正常 {report.counts.normal} / 高估 {report.counts.high}
                    {report.countsDelta ? `（Δ ${signed(report.countsDelta.low, 0)} / ${signed(report.countsDelta.normal, 0)} / ${signed(report.countsDelta.high, 0)}）` : ''}</li>
                  <li>进入低估：{names(report, report.transitions.enterLow) || '无'}</li>
                  <li>退出低估：{names(report, report.transitions.exitLow) || '无'}</li>
                  <li>进入高估：{names(report, report.transitions.enterHigh) || '无'}</li>
                  <li>退出高估：{names(report, report.transitions.exitHigh) || '无'}</li>
                </ul>
                <SampleFootnote>{METHOD.change}</SampleFootnote>
                <SampleFootnote>{METHOD.status}</SampleFootnote>
              </Card>
              <Card title="变化表" as="section" className="mm-card">
                {report.rows.length ? (
                  <TableWrap label="指数日报变化表" stickyFirst>
                    <table className="ui-table">
                      <thead>
                        <tr>
                          {['指数', '涨跌幅%', 'PE', 'ΔPE', 'PE分位', '状态', '昨状态'].map(h => <th key={h} scope="col">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {report.rows.map(r => (
                          <tr key={r.code}>
                            <th scope="row"><Link to={`/jixing/table?code=${r.code}`}>{r.name}</Link></th>
                            <td className="num">{signed(r.changePct, 2)}</td>
                            <td className="num">{fmt(r.pe)}</td>
                            <td className="num">{signed(r.peDelta)}</td>
                            <td className="num">{r.pePct === null ? '—' : `${(r.pePct * 100).toFixed(1)}%`}</td>
                            <td><StatusBadge status={r.status} /></td>
                            <td><StatusBadge status={r.statusPrev} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                ) : <p className="mm-empty">该日无指数行（索引摘要可能已截断，请打开按日文件）。</p>}
              </Card>
            </>
          )}
        </>
      )}
    </Page>
  )
}

function names(report: JixingDailyReport, codes: string[]): string {
  const map = new Map(report.rows.map(r => [r.code, r.name]))
  return codes.map(c => map.get(c) ?? c).join('、')
}
