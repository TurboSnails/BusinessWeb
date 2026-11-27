// 开盘啦 · 资金：公开行情的盘后统计，不接入开盘啦接口。
import React, { useEffect, useState } from 'react'
import { Card, EmptyState, LoadError, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import { asKplFunds, money, percent, tone, type FlowRow, type KplFundsData } from '../../features/kpl-funds/model'
import '../../styles/market-mood.css'
import '../../styles/kpl-funds.css'

const BASE = import.meta.env.BASE_URL
const ranges = [{ id: '20', label: '20 日' }, { id: '60', label: '60 日' }, { id: 'all', label: '全部' }]
function RankingTable({ rows, title, industry = false }: { rows: FlowRow[]; title: string; industry?: boolean }): JSX.Element {
  return <Card title={title} as="section" className="mm-card">
    <TableWrap label={title} stickyFirst>
      <table className="mm-table kf-table">
        <thead><tr>{[industry ? '行业板块' : '名称代码', '涨幅', '主力净额', '主力净占比', '超大单', '大单', '成交额', ...(!industry ? ['行业'] : [])].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.code}>
          <th scope="row">{r.name}<small>{r.code}</small></th>
          <td className={`num ${tone(r.pct)}`}>{percent(r.pct)}</td>
          <td className={`num ${tone(r.main)}`}>{money(r.main)}</td>
          <td className={`num ${tone(r.mainRatio)}`}>{percent(r.mainRatio)}</td>
          <td className={`num ${tone(r.superLarge)}`}>{money(r.superLarge)}</td>
          <td className={`num ${tone(r.large)}`}>{money(r.large)}</td>
          <td className="num">{r.amount === null ? '—' : `${(r.amount / 1e8).toFixed(2)} 亿`}</td>
          {!industry && <td>{r.industry || '—'}</td>}
        </tr>)}</tbody>
      </table>
    </TableWrap>
  </Card>
}
export default function KplFunds(): JSX.Element {
  const [data, setData] = useState<KplFundsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [range, setRange] = useState('60')
  const retry = () => { setLoading(true); setError(null); setData(null); setAttempt(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-funds.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: unknown) => {
        if (controller.signal.aborted) return
        const parsed = asKplFunds(body)
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
  const latest = data?.history.at(-1)
  const history = data ? range === 'all' ? data.history : data.history.slice(-Number(range)) : []
  return (
    <Page className="mm-page kf-page">
      <PageTitle>开盘啦 · 资金</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      <p className="mm-method">仅展示盘后主力资金。主力资金是数据供应商按成交单规模划分的估算，不代表可识别的机构账户资金；主力净额为大单与超大单净额之和。异动、对倒、压单、托单需要盘中逐笔或委托簿数据，本页暂不提供。</p>
      {loading ? <p role="status">正在读取盘后资金…</p> : error ? (
        <LoadError reason="盘后资金这份读数现在拿不到。" detail={error} onRetry={retry} />
      ) : !data || !latest ? <EmptyState title="暂无盘后资金数据">收盘后完整采集成功再更新；数据文件缺失、不可用或格式异常时不展示排行。</EmptyState> : <>
        <p className="mm-method">数据日期：{data.asOf}（盘后） · 采集时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京）。无日期排行仅在交易日 15:10 后采集，行情可能延迟；此处不是实时资金。</p>
        <Card title="全市场主力资金净流入" as="section" className="mm-card" description="东方财富沪深汇总（上证与深证），不含北交所；金额单位：亿元。">
          <dl className="kf-summary">{([['主力净额', latest.main], ['超大单净额', latest.superLarge], ['大单净额', latest.large], ['中单净额', latest.medium], ['小单净额', latest.small]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={tone(value)}>{money(value)}</dd></div>)}</dl>
          <Segmented items={ranges} value={range} onChange={setRange} label="历史范围" />
          <MoodChart label="沪深主力资金净流入历史走势" points={history.map(d => ({ date: d.date, value: d.main === null ? null : d.main / 1e8 }))} format={v => `${v.toFixed(2)} 亿`} refs={[{ value: 0, label: '零净流入' }]} />
          <p className="mm-method">每天净额，非累计值；缺失日期不补零。正值为净流入，负值为净流出。</p>
        </Card>
        <p className="mm-method">个股榜覆盖沪深京 A 股；行业榜为供应商行业分类。净占比为主力净额占成交额的百分比；超大单、大单列均为净额。两端排行按主力净额排序，不代表全市场加总。</p>
        <RankingTable title="个股主力净流入 Top 30" rows={data.stocks.inflow} />
        <RankingTable title="个股主力净流出 Top 30" rows={data.stocks.outflow} />
        <RankingTable title="行业板块净流入 Top 15" rows={data.industries.inflow} industry />
        <RankingTable title="行业板块净流出 Top 15" rows={data.industries.outflow} industry />
        <p className="mm-method">公开来源：{data.sources.map(s => <React.Fragment key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>{' '}</React.Fragment>)}</p>
      </>}
    </Page>
  )
}
