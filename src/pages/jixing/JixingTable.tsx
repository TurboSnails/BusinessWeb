// 今天几星 · A股估值表（/jixing/table）
import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, Dialog, EmptyState, LoadError, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import JixingTabs, { JIXING_DISCLAIMER } from '../../features/jixing-tabs/JixingTabs'
import { SampleFootnote, StatusBadge, StatusLegend, VALUATION_STATUS } from '../../features/jixing-tabs/StatusBadge'
import {
  asJixingTable, asJixingTableHist, GROUPS, histUrl, METHOD,
  type GroupFilter, type JixingTableData, type JixingTableHist, type ValuationRow, type ValuationStatus,
} from '../../features/jixing-table/model'
import { filterByQuery } from '../../features/jixing-tabs/search'
import MoodChart from '../../features/market-mood/MoodChart'
import '../../styles/market-mood.css'
import '../../styles/jixing-table.css'

const fixed = (v: number | null): string => v === null ? '—' : v.toFixed(2)
const percent = (v: number | null): string => v === null ? '—' : `${(v * 100).toFixed(1)}%`
const historyLabel = ({ since, count }: ValuationRow['peHistory']): string => since ? `${since} / ${count}` : '— / 0'

type Column = {
  key: string
  label: string
  value: (row: ValuationRow) => string | number | null
  numeric?: boolean
  render?: (row: ValuationRow) => React.ReactNode
}

const COLUMNS: Column[] = [
  { key: 'name', label: '名称', value: r => r.name },
  { key: 'code', label: '代码', value: r => r.code },
  { key: 'pe', label: '市盈率', value: r => r.pe, numeric: true, render: r => fixed(r.pe) },
  { key: 'pePct', label: 'PE 百分位', value: r => r.pePct, numeric: true, render: r => percent(r.pePct) },
  { key: 'pb', label: 'PB', value: r => r.pb, numeric: true, render: r => (
    <>
      {fixed(r.pb)}
      {r.pbKind === 'industry' && r.pbIndustry ? <small className="jt-pb-tag" title={METHOD.pbIndustry}>行业·{r.pbIndustry.name}</small> : null}
    </>
  ) },
  { key: 'pbPct', label: 'PB 百分位', value: r => r.pbPct, numeric: true,
    render: r => r.pbPct === null && r.pbHistory.count > 0 ? <span title="达到 250 个有效样本后计算">积累中</span> : percent(r.pbPct) },
  { key: 'dp', label: '股息率', value: r => r.dp, numeric: true, render: r => r.dp === null ? '—' : `${fixed(r.dp)}%` },
  { key: 'roe', label: 'ROE（估算）', value: r => r.roe, numeric: true, render: r => percent(r.roe) },
  { key: 'status', label: '估值状态', value: r => r.status === null ? null : VALUATION_STATUS[r.status].order,
    render: r => <StatusBadge status={r.status} /> },
  { key: 'date', label: '数据日', value: r => r.date },
  { key: 'peHistory', label: 'PE 起点 / 样本数', value: r => r.peHistory.count, render: r => historyLabel(r.peHistory) },
  { key: 'pbHistory', label: 'PB 起点 / 样本数', value: r => r.pbHistory.count, render: r => historyLabel(r.pbHistory) },
]

function IndexDetail({ row, close }: { row: ValuationRow; close: () => void }): JSX.Element {
  const preferPb = row.basis === 'pb'
  const [mode, setMode] = useState<'pe' | 'pb'>(preferPb ? 'pb' : 'pe')
  const [hist, setHist] = useState<JixingTableHist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    fetch(histUrl(row.code), { cache: 'no-cache', signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then((body: unknown) => {
        if (controller.signal.aborted) return
        const parsed = asJixingTableHist(body, row.code, row.date)
        if (!parsed) { setError(true); setHist(null); setLoading(false); return }
        setHist(parsed)
        setLoading(false)
      })
      .catch(() => { if (!controller.signal.aborted) { setError(true); setHist(null); setLoading(false) } })
    return () => controller.abort()
  }, [row])

  const series = mode === 'pb' ? (hist?.pbSeries ?? []) : (hist?.peSeries ?? [])
  const refs = mode === 'pb' ? (hist?.pbRefs ?? [null, null]) : (hist?.peRefs ?? [null, null])
  const label = mode === 'pb'
    ? `${row.name} 行业 PB 历史走势`
    : `${row.name} 市盈率 历史走势`
  const rank = row.basis === 'pb' ? row.pbPct : row.pePct

  return (
    <Dialog open onClose={close} title={`${row.name} · ${row.code}`} size="lg"
      actions={<button type="button" className="btn-ghost" onClick={close}>关闭</button>}>
      <p className="jt-detail-meta">{row.date} · {row.source === 'csi' ? '中证指数官网' : '国证指数网'}
        {row.pbKind === 'industry' && row.pbIndustry ? ` · 行业 PB（${row.pbIndustry.name}，代码 ${row.pbIndustry.code}）` : ''}
      </p>
      {preferPb ? (
        <Segmented
          label="走势指标"
          items={[{ id: 'pb', label: '行业 PB' }, { id: 'pe', label: '市盈率' }]}
          value={mode}
          onChange={id => setMode(id as 'pe' | 'pb')}
        />
      ) : null}
      {loading ? <p role="status">正在加载历史走势…</p> : error || !series.length ? (
        <p className="mm-empty">暂无该指数历史曲线。</p>
      ) : (
        <MoodChart
          label={label}
          points={series.map(([d, value]) => ({ date: d, value }))}
          format={fixed}
          refs={[
            ...(refs[0] != null ? [{ value: refs[0], label: '30% 分位' }] : []),
            ...(refs[1] != null ? [{ value: refs[1], label: '70% 分位' }] : []),
          ]}
          tick={d => d.slice(0, 7)}
        />
      )}
      <SampleFootnote>
        数据日 {row.date} · PE 样本 {historyLabel(row.peHistory)}
        {row.pbKind === 'industry'
          ? ` · 行业 PB 周采样，n=${row.pbHistory.count}${row.pbHistory.since ? `（自 ${row.pbHistory.since}）` : ''}`
          : ` · PB 样本 ${historyLabel(row.pbHistory)}`}。
      </SampleFootnote>
      <SampleFootnote>估值状态按 {row.basis.toUpperCase()} 百分位判断（{percent(rank)}）。{METHOD.chart}</SampleFootnote>
      {row.pbKind === 'industry' ? <SampleFootnote>{METHOD.pbIndustry}</SampleFootnote> : null}
    </Dialog>
  )
}

function ValuationTable({ data }: { data: JixingTableData }): JSX.Element {
  const [params, setParams] = useSearchParams()
  const codeParam = params.get('code')
  const [group, setGroup] = useState<GroupFilter>('all')
  const [sort, setSort] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null)
  const [detail, setDetail] = useState<ValuationRow | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ValuationRow[]>([])
  const [searchHint, setSearchHint] = useState<string | null>(null)

  useEffect(() => {
    if (!codeParam) return
    const row = data.rows.find(r => r.code === codeParam)
    if (row) setDetail(row)
  }, [codeParam, data.rows])

  const openRow = (row: ValuationRow) => {
    setDetail(row)
    setHits([])
    setSearchHint(null)
    setParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('code', row.code)
      return next
    }, { replace: true })
  }
  const closeDetail = () => {
    setDetail(null)
    setParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('code')
      return next
    }, { replace: true })
  }

  const runSearch = (raw = query) => {
    const q = raw.trim()
    if (!q) { setHits([]); setSearchHint(null); return }
    const found = filterByQuery(data.rows, q)
    setHits(found)
    if (!found.length) setSearchHint(`没有匹配「${q}」的指数`)
    else if (found.length === 1) { openRow(found[0]); setHits([]) }
    else setSearchHint(`找到 ${found.length} 条，点选打开详情`)
  }

  const rows = data.rows.filter(row => group === 'all' || group === row.group)
  const column = COLUMNS.find(c => c.key === sort?.key)
  if (column && sort) {
    rows.sort((a, b) => {
      const left = column.value(a), right = column.value(b)
      if (left === null) return right === null ? 0 : 1
      if (right === null) return -1
      const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'zh-CN')
      return sort.direction === 'ascending' ? comparison : -comparison
    })
  }

  const counts = { low: 0, normal: 0, high: 0 }
  let unrated = 0
  for (const row of rows) {
    if (row.status) counts[row.status]++
    else unrated++
  }

  return (
    <Card title="估值表" as="section" className="mm-card jt-card" description={`${data.asOf} 盘后 · 点击指数名称查看历史走势。`}>
      <ul className="jx-links">
        <li><Link to="/jixing">今日星级（中证全指 / 沪深市场 PB）</Link></li>
        <li><Link to="/jixing/signals">牛熊信号板</Link></li>
        <li><Link to="/jixing/threshold">阀值表</Link></li>
      </ul>
      <form className="jt-search" role="search" onSubmit={e => { e.preventDefault(); runSearch() }}>
        <label>
          <span className="jt-search__label">今日查估值</span>
          <input
            type="search"
            value={query}
            placeholder="名称 / 代码 / 拼音首字母"
            aria-label="按名称或代码搜索指数"
            onChange={e => { setQuery(e.target.value); setHits([]); setSearchHint(null) }}
          />
        </label>
        <button type="submit" className="btn-ghost">搜索</button>
      </form>
      {searchHint ? <p className="jt-search__hint" role="status">{searchHint}</p> : null}
      {hits.length > 1 ? (
        <ul className="jt-search__hits">
          {hits.map(r => (
            <li key={r.code}>
              <button type="button" className="jt-index" onClick={() => openRow(r)}>{r.name}（{r.code}）</button>
            </li>
          ))}
        </ul>
      ) : null}
      <Segmented label="指数分组" items={[...GROUPS]} value={group} onChange={setGroup} />
      <div className="jt-summary" aria-label="当前分组估值状态">
        {(Object.keys(VALUATION_STATUS) as ValuationStatus[]).map(key => (
          <StatusBadge key={key} status={key} count={counts[key]} />
        ))}
        {unrated > 0 && <StatusBadge status={null} empty={`暂无分位 ${unrated} 只`} />}
      </div>
      <StatusLegend>{METHOD.status}</StatusLegend>
      {rows.length ? (
        <TableWrap label="A股指数估值，可横向滚动" stickyFirst stickyHeader>
          <table className="ui-table jt-table">
            <thead><tr>{COLUMNS.map(c => {
              const direction = sort?.key === c.key ? sort.direction : undefined
              return (
                <th scope="col" key={c.key} aria-sort={direction} className={c.numeric ? 'num' : undefined}>
                  <button type="button" className="jt-sort" onClick={() => setSort({
                    key: c.key, direction: direction === 'ascending' ? 'descending' : 'ascending',
                  })}>
                    {c.label}<span aria-hidden="true">{direction === 'ascending' ? ' ↑' : direction === 'descending' ? ' ↓' : ' ↕'}</span>
                  </button>
                </th>
              )
            })}</tr></thead>
            <tbody>{rows.map(row => (
              <tr key={row.code}>
                <th scope="row">
                  <button type="button" className="jt-index" aria-haspopup="dialog" onClick={() => openRow(row)}>{row.name}</button>
                </th>
                {COLUMNS.slice(1).map(c => (
                  <td className={c.numeric ? 'num' : undefined} key={c.key}>{c.render ? c.render(row) : c.value(row)}</td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">该分组暂无指数估值。</p>}
      <SampleFootnote>{METHOD.percentile}</SampleFootnote>
      <SampleFootnote>{METHOD.source}</SampleFootnote>
      <SampleFootnote>{METHOD.pbIndustry}</SampleFootnote>
      <ul className="jt-sources mm-method">
        {data.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}
      </ul>
      {detail && <IndexDetail row={detail} close={closeDetail} />}
    </Card>
  )
}

export default function JixingTable(): JSX.Element {
  const [data, setData] = useState<JixingTableData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoading(true); setPageError(null); setData(null); setAttempt(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}data/jixing-table.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: unknown) => {
        if (controller.signal.aborted) return
        const parsed = asJixingTable(body)
        if (!parsed) { setPageError('数据文件格式不对'); setData(null); return }
        setData(parsed)
        setPageError(null)
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        setData(null)
        setPageError(e instanceof Error ? e.message : '网络错误')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])
  return (
    <Page className="mm-page jt-page">
      <PageTitle>今天几星 · 估值表</PageTitle>
      <JixingTabs />
      <p className="mm-disclaimer">{JIXING_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取指数估值…</p> : pageError ? (
        <LoadError reason="估值表这份读数现在拿不到。" detail={pageError} onRetry={retry} />
      ) : data ? <ValuationTable data={data} /> : (
        <EmptyState title="暂无估值数据">完整估值数据将在交易日盘后更新。</EmptyState>
      )}
    </Page>
  )
}
