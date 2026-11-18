// 今天几星 · A股估值表（/jixing/table）
import React, { useEffect, useState } from 'react'
import { Badge, Card, Dialog, EmptyState, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import JixingTabs, { JIXING_DISCLAIMER } from '../../features/jixing-tabs/JixingTabs'
import { asJixingTable, GROUPS, METHOD, type GroupFilter, type JixingTableData, type ValuationRow, type ValuationStatus } from '../../features/jixing-table/model'
import MoodChart from '../../features/market-mood/MoodChart'
import '../../styles/market-mood.css'
import '../../styles/jixing-table.css'

const STATUS = {
  low: { label: '低估', tone: 'down', order: 0 },
  normal: { label: '正常', tone: 'warm', order: 1 },
  high: { label: '高估', tone: 'up', order: 2 },
} as const

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
  { key: 'pe', label: 'PE(TTM)', value: r => r.pe, numeric: true, render: r => fixed(r.pe) },
  { key: 'pePct', label: 'PE 百分位', value: r => r.pePct, numeric: true, render: r => percent(r.pePct) },
  { key: 'pb', label: 'PB', value: r => r.pb, numeric: true, render: r => fixed(r.pb) },
  { key: 'pbPct', label: 'PB 百分位', value: r => r.pbPct, numeric: true,
    render: r => r.pbPct === null && r.pbHistory.count > 0 ? <span title="达到 250 个有效样本后计算">积累中</span> : percent(r.pbPct) },
  { key: 'dp', label: '股息率', value: r => r.dp, numeric: true, render: r => r.dp === null ? '—' : `${fixed(r.dp)}%` },
  { key: 'roe', label: 'ROE（估算）', value: r => r.roe, numeric: true, render: r => percent(r.roe) },
  { key: 'status', label: '估值状态', value: r => r.status === null ? null : STATUS[r.status].order,
    render: r => r.status ? <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge> : '—' },
  { key: 'date', label: '数据日', value: r => r.date },
  { key: 'peHistory', label: 'PE 起点 / 样本数', value: r => r.peHistory.count, render: r => historyLabel(r.peHistory) },
  { key: 'pbHistory', label: 'PB 起点 / 样本数', value: r => r.pbHistory.count, render: r => historyLabel(r.pbHistory) },
]

function IndexDetail({ row, close }: { row: ValuationRow; close: () => void }): JSX.Element {
  const basis = row.basis.toUpperCase()
  const rank = row.basis === 'pb' ? row.pbPct : row.pePct
  return (
    <Dialog open onClose={close} title={`${row.name} · ${row.code}`} size="lg"
      actions={<button type="button" className="btn-ghost" onClick={close}>关闭</button>}>
      <p className="jt-detail-meta">{row.date} · {row.source === 'csi' ? '中证指数官网' : '国证指数网'}</p>
      <MoodChart
        label={`${row.name} PE(TTM) 历史走势`}
        points={row.peSeries.map(([date, value]) => ({ date, value }))}
        format={fixed}
        refs={[{ value: row.peRefs[0], label: '30% 分位' }, { value: row.peRefs[1], label: '70% 分位' }]}
        tick={date => date.slice(0, 7)}
      />
      <p className="mm-method">PE 样本 {historyLabel(row.peHistory)} · PB 样本 {historyLabel(row.pbHistory)}。</p>
      <p className="mm-method">估值状态按 {basis} 百分位判断（{percent(rank)}）。{METHOD.chart}</p>
    </Dialog>
  )
}

function ValuationTable({ data }: { data: JixingTableData }): JSX.Element {
  const [group, setGroup] = useState<GroupFilter>('all')
  const [sort, setSort] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null)
  const [detail, setDetail] = useState<ValuationRow | null>(null)
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
    <Card title="A股估值表" as="section" className="mm-card jt-card" description={`${data.asOf} 盘后 · 点击指数名称查看 PE 历史走势。`}>
      <Segmented label="指数分组" items={[...GROUPS]} value={group} onChange={setGroup} />
      <div className="jt-summary" aria-label="当前分组估值状态">
        {(Object.keys(STATUS) as ValuationStatus[]).map(key => (
          <Badge key={key} tone={STATUS[key].tone}>{STATUS[key].label} {counts[key]} 只</Badge>
        ))}
        {unrated > 0 && <Badge tone="muted">暂无分位 {unrated} 只</Badge>}
      </div>
      <p className="mm-method jt-legend">{METHOD.status}</p>
      {rows.length ? (
        <TableWrap label="A股指数估值，可横向滚动" stickyFirst>
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
                  <button type="button" className="jt-index" aria-haspopup="dialog" onClick={() => setDetail(row)}>{row.name}</button>
                </th>
                {COLUMNS.slice(1).map(c => (
                  <td className={c.numeric ? 'num' : undefined} key={c.key}>{c.render ? c.render(row) : c.value(row)}</td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">该分组暂无指数估值。</p>}
      <p className="mm-method">{METHOD.percentile}</p>
      <p className="mm-method">{METHOD.source}</p>
      <ul className="jt-sources mm-method">
        {data.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}
      </ul>
      {detail && <IndexDetail row={detail} close={() => setDetail(null)} />}
    </Card>
  )
}

export default function JixingTable(): JSX.Element {
  const [data, setData] = useState<JixingTableData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}data/jixing-table.json`, { cache: 'no-cache', signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then((body: unknown) => { if (!controller.signal.aborted) setData(asJixingTable(body)) })
      .catch(() => { if (!controller.signal.aborted) setData(null) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  return (
    <Page className="mm-page jt-page">
      <PageTitle>今天几星 · A股估值表</PageTitle>
      <JixingTabs />
      <p className="mm-disclaimer">{JIXING_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取指数估值…</p> : data ? <ValuationTable data={data} /> : (
        <EmptyState title="暂无A股估值数据">完整估值数据将在交易日盘后更新。</EmptyState>
      )}
    </Page>
  )
}
