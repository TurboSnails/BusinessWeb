// 今天几星 · 港股全球（/jixing/global）：港股估值表、全球估值表与本站自定的黄金估值，公开数据，各行按自己的数据日期更新。
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import JixingTabs, { JIXING_DISCLAIMER } from '../../features/jixing-tabs/JixingTabs'
import { SampleFootnote, StatusBadge, VALUATION_STATUS } from '../../features/jixing-tabs/StatusBadge'
import MoodChart from '../../features/market-mood/MoodChart'
import { METHOD, PE_CHART_CAP, asJixingGlobal, basisLabel, chartValue, fix, pct, type Gold, type JixingGlobalData, type ValRow, type ValState } from '../../features/jixing-global/model'
import '../../styles/market-mood.css'
import '../../styles/jixing-global.css'

const BASE = import.meta.env.BASE_URL
const ym = (d: string): string => `${d.slice(2, 4)}/${Number(d.slice(5, 7))}`
type Section = 'hk' | 'global' | 'gold'

function StateBadge({ state, distorted }: { state: ValState | null; distorted?: boolean }): JSX.Element {
  if (state) return <StatusBadge status={state} />
  return <StatusBadge status={null} empty={distorted ? '不判定' : '—'} />
}

function Summary({ rows }: { rows: ValRow[] }): JSX.Element {
  const count = (s: ValState | null): number => rows.filter(r => r.state === s && (s !== null || r.pe !== null || r.dy !== null)).length
  return <div className="jg-chips" aria-label="估值状态计数">
    {(['低估', '正常', '高估'] as const).map(s => <StatusBadge key={s} status={s} count={count(s)} />)}
    <StatusBadge status={null} empty={`未判定 ${count(null)} 只`} />
    <StatusBadge status={null} empty={`无数据 ${rows.filter(r => r.pe === null && r.dy === null).length} 只`} />
  </div>
}

/** 一行的补充说明：窗口、依据与特殊情况。 */
function rowNotes(r: ValRow): string[] {
  const out: string[] = []
  const w = r.window
  if (w) out.push(`百分位窗口：近 ${w.years} 年${w.freq}度样本，${w.start ?? '—'} 至 ${w.end}，共 ${w.n} 个${w.enough ? '' : '（样本不足，不给分位）'}；估值状态依据 ${basisLabel(r)} 百分位。`)
  if (w?.spliced) out.push(`序列拼接（${w.spliceDate} 前后口径可能不同），只列分位不判定。`)
  if (w?.distorted) out.push(`窗口内有 ${w.loss} 个亏损样本（PE 为负），超过 10%，PE 前后不可比，不判定估值状态。`)
  if (r.basis === 'pe' && r.history.some(p => p[1] !== null && (p[1] < 0 || p[1] > PE_CHART_CAP))) out.push(`图中 PE 为负（亏损）或超过 ${PE_CHART_CAP} 倍的月份留空，只影响作图。`)
  if (r.spliceDate) out.push(`${r.spliceDate} 之后为 History of Market 自算的 Forward PE（终端序列止于该日；两段只在该日重合一个点，未做缩放）。`)
  if (r.estimated) out.push('最新值为 multpl 标注的估算值（盈利尚未完整公布）。')
  if (r.carried) out.push('本次未取到该行数据，沿用上一次成功采集的结果（日期见表）。')
  return out
}

function ValTable({ rows, label, years, onPick, picked }: { rows: ValRow[]; label: string; years: number; onPick(key: string): void; picked: string }): JSX.Element {
  return <><TableWrap label={label} stickyFirst>
    <table className="mm-table jg-table">
      <thead><tr>{['指数', '日期', 'PE', 'PE 百分位', '股息率', '股息率百分位', '依据', '估值状态'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.key} className={r.key === picked ? 'is-picked' : undefined} onClick={() => onPick(r.key)}>
        <th scope="row"><button type="button" className="jg-pick" aria-pressed={r.key === picked} onClick={e => { e.stopPropagation(); onPick(r.key) }}>{r.name}</button><small>{r.peKind}</small></th>
        <td>{r.date ?? '—'}<small>{r.freq}{r.carried ? ' · 沿用' : ''}</small></td>
        <td className="num">{fix(r.pe)}</td>
        <td className="num">{pct(r.pePct)}</td>
        <td className="num">{r.dy === null ? '—' : `${fix(r.dy)}%`}</td>
        <td className="num">{pct(r.dyPct)}</td>
        <td>{basisLabel(r)}</td>
        <td><StateBadge state={r.state} distorted={!!(r.window?.distorted || r.window?.spliced)} /></td>
      </tr>)}</tbody>
    </table>
  </TableWrap>
  <SampleFootnote>点表中指数名查看历史走势；百分位窗口为近 {years} 年。PB 与 PB 百分位：恒生指数公司不公布指数 PB，中证官网行情、multpl 与 History of Market 也没有可用的 PB 历史，本页不列。</SampleFootnote>
  <SampleFootnote>阈值：{VALUATION_STATUS.low.label} &lt; 30%，{VALUATION_STATUS.high.label} &gt; 70%，其余{VALUATION_STATUS.normal.label}。</SampleFootnote></>
}

function RowChart({ row }: { row: ValRow }): JSX.Element {
  const isDy = row.basis === 'dy'
  const unit = isDy ? '%' : ''
  const refs = row.refs ? [
    ...(row.refs.low === null ? [] : [{ value: row.refs.low, label: `估值分位 30%（${fix(row.refs.low)}${unit}）` }]),
    ...(row.refs.high === null ? [] : [{ value: row.refs.high, label: `估值分位 70%（${fix(row.refs.high)}${unit}）` }]),
  ] : []
  const w = row.window
  const what = isDy ? '股息率' : row.peKind
  return <div className="jg-detail">
    <h3 className="jg-sub">{row.name} · {what}</h3>
    {row.history.length ? <MoodChart
      label={`${row.name} ${what} 近 ${w?.years ?? ''} 年${row.freq === '日' ? '月' : row.freq}度`}
      points={row.history.map(([date, v]) => ({ date, value: isDy ? v : chartValue(row, v) }))}
      format={v => `${v.toFixed(isDy ? 1 : 0)}${unit}`}
      tipFormat={v => `${v.toFixed(2)}${unit}`}
      refs={refs}
      tick={ym}
    /> : <p className="mm-empty">该行暂无历史数据</p>}
    {rowNotes(row).map(t => <SampleFootnote key={t}>{t}</SampleFootnote>)}
    <SampleFootnote>来源：{row.source}。参考线为窗口内估值分位 30% / 70% 对应的{isDy ? '股息率（股息率越高越便宜，所以 30% 线在上方）' : ' PE（按盈利收益率取分位后换回 PE）'}。</SampleFootnote>
  </div>
}

function ValSection({ rows, title, label, years, method, extra }: { rows: ValRow[]; title: string; label: string; years: number; method: string[]; extra?: React.ReactNode }): JSX.Element {
  const [picked, setPicked] = useState(rows[0]?.key ?? '')
  const row = rows.find(r => r.key === picked) ?? rows[0]
  return <Card title={title} as="section" className="mm-card">
    {rows.length ? <>
      <Summary rows={rows} />
      <ValTable rows={rows} label={label} years={years} onPick={setPicked} picked={row.key} />
      <RowChart row={row} />
    </> : <EmptyState title="本节暂无数据">来源本次未取到，其他分区不受影响。</EmptyState>}
    {method.map(t => <SampleFootnote key={t}>{t}</SampleFootnote>)}
    {extra}
  </Card>
}

function GoldSection({ gold, error, years }: { gold: Gold | null; error: string | null; years: number }): JSX.Element {
  const [view, setView] = useState<'real' | 'nominal' | 'yield'>('real')
  if (!gold) return <Card title="黄金" as="section" className="mm-card">
    <EmptyState title="暂无黄金数据">{error ? `本次未取到：${error}` : '数据缺失，其他分区不受影响。'}</EmptyState>
    <SampleFootnote>{METHOD.gold(years)}</SampleFootnote>
  </Card>
  const refs = [
    ...(gold.refs.low === null ? [] : [{ value: gold.refs.low, label: `估值分位 30%（${fix(gold.refs.low, 0)}）` }]),
    ...(gold.refs.high === null ? [] : [{ value: gold.refs.high, label: `估值分位 70%（${fix(gold.refs.high, 0)}）` }]),
  ]
  const ry = gold.realYield
  return <Card title="黄金" as="section" className="mm-card" description={`本站自定的黄金估值：通胀调整后的实际金价在近 ${years} 年中的位置。`}>
    <dl className="jg-summary">
      <div><dt>COMEX 黄金</dt><dd>{fix(gold.price, 1)}</dd><small>美元/盎司 · {gold.date}{gold.carried ? ' · 沿用' : ''}</small></div>
      <div><dt>实际金价</dt><dd>{fix(gold.realPrice, 1)}</dd><small>按 {gold.cpiBase?.month ?? '—'} 美元计</small></div>
      <div><dt>黄金估值分位</dt><dd>{pct(gold.pct)}</dd><small><StateBadge state={gold.state} /></small></div>
      <div><dt>10 年期实际利率</dt><dd>{ry ? `${fix(ry.value)}%` : '—'}</dd><small>{ry ? `${ry.date} · 近 ${years} 年分位 ${pct(ry.pct)}` : '未取到'}</small></div>
    </dl>
    <Segmented items={[{ id: 'real', label: '实际金价' }, { id: 'nominal', label: '名义金价' }, { id: 'yield', label: '10 年实际利率' }]} value={view} onChange={setView} label="黄金走势" />
    {view === 'real' ? <MoodChart label={`实际金价（${gold.cpiBase?.month ?? ''} 美元）近 ${years} 年月末`} points={gold.history.map(([date, v]) => ({ date, value: v }))} format={v => v.toFixed(0)} refs={refs} tick={ym} />
      : view === 'nominal' ? <MoodChart label={`COMEX 黄金名义价格近 ${years} 年月末`} points={gold.history.map(([date, , v]) => ({ date, value: v }))} format={v => v.toFixed(0)} tick={ym} />
        : <MoodChart label={`10 年期美债实际收益率近 ${years} 年月末`} points={gold.yieldHistory.map(([date, v]) => ({ date, value: v }))} format={v => `${v.toFixed(1)}%`} tipFormat={v => `${v.toFixed(2)}%`} tick={ym} />}
    <SampleFootnote>窗口：{gold.window.start ?? '—'} 至 {gold.window.end}，{gold.window.n} 个月度样本{gold.window.enough ? '' : '（样本不足，不给分位）'}。{gold.cpiCarried.length ? `以下月份没有 CPI 发布值，沿用此前最近一个月：${gold.cpiCarried.join('、')}。` : ''}</SampleFootnote>
    <SampleFootnote>{METHOD.gold(years)}</SampleFootnote>
  </Card>
}

export default function JixingGlobal(): JSX.Element {
  const [data, setData] = useState<JixingGlobalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<Section>('hk')
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/jixing-global.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((body: unknown) => { if (!controller.signal.aborted) setData(asJixingGlobal(body)) })
      .catch(() => { if (!controller.signal.aborted) setData(null) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  return (
    <Page className="mm-page jg-page">
      <PageTitle>今天几星 · 港股全球</PageTitle>
      <JixingTabs />
      <p className="mm-disclaimer">{JIXING_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取港股全球估值…</p> : !data ? <EmptyState title="暂无港股全球数据">数据文件缺失、不可用或格式异常时不展示。</EmptyState> : <>
        <ul className="jx-links">
          <li><Link to="/jixing">今日星级</Link></li>
          <li><Link to="/jixing/table">估值表</Link></li>
          <li><Link to="/jixing/signals">牛熊信号板</Link></li>
        </ul>
        <SampleFootnote>采集时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京）。各来源更新时间不同（日度、周度、月度都有），每行的数据日期单独列出，不混为一天。</SampleFootnote>
        <Segmented items={[{ id: 'hk', label: '港股' }, { id: 'global', label: '全球' }, { id: 'gold', label: '黄金' }]} value={section} onChange={setSection} label="港股全球分区" />
        {section === 'hk' ? <ValSection rows={data.hk.rows} title="港股估值表" label="港股指数估值" years={data.windows.hk}
          method={[METHOD.state(data.thresholds), METHOD.pe, METHOD.hk(data.windows.hk), `月报存档最新月份 ${data.hk.roundupLatest}${data.hk.roundupMissing.length ? `；缺失月份 ${data.hk.roundupMissing.join('、')}（月报不在存档或版式无法解析），不插值` : ''}。`]} />
          : section === 'global' ? <ValSection rows={data.global.rows} title="全球估值表" label="全球指数估值" years={data.windows.global}
            method={[METHOD.state(data.thresholds), METHOD.pe, METHOD.global(data.windows.global)]}
            extra={<><h3 className="jg-sub">暂未纳入</h3><ul className="jg-list">{METHOD.skipped.map(s => <li key={s}>{s}</li>)}</ul></>} />
            : <GoldSection gold={data.gold} error={data.goldError} years={data.windows.gold} />}
        <p className="mm-method">公开来源：{data.sources.map((s, i) => <React.Fragment key={s.url}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。</p>
      </>}
    </Page>
  )
}
