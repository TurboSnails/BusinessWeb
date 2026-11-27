// 同花顺 · 行业景气（/ths-mood/industry）：对照同花顺「AI 板块景气度」与指数「贡献度」，用公开数据自建行业景气表和成分股贡献排行，盘后更新。
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, LoadError, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import ThsTabs, { THS_DISCLAIMER } from '../../features/ths-tabs/ThsTabs'
import StockTable, { type Col } from '../../features/kpl-daban/StockTable'
import { METHOD, asThsIndustry, fix, pct, signedPct, signedPts, tone, type ContribIndex, type ContribStock, type IndustryRow, type ThsIndustryData } from '../../features/ths-industry/model'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/ths-industry.css'

const BASE = import.meta.env.BASE_URL

const IND_COLS: Array<Col<IndustryRow>> = [
  { key: 'score', label: '景气得分', num: true, render: r => fix(r.score, 1), sort: r => r.score },
  { key: 'l1', label: '一级行业', render: r => r.l1Name, sort: r => r.l1Code },
  { key: 'npYoy', label: '净利润同比', num: true, render: r => signedPct(r.npYoy, 1), sort: r => r.npYoy, cls: r => tone(r.npYoy) },
  { key: 'revYoy', label: '营收同比', num: true, render: r => signedPct(r.revYoy, 1), sort: r => r.revYoy, cls: r => tone(r.revYoy) },
  { key: 'roe', label: 'ROE', num: true, render: r => pct(r.roe, 2), sort: r => r.roe },
  { key: 'ret20', label: '近 20 日', num: true, render: r => signedPct(r.ret20), sort: r => r.ret20, cls: r => tone(r.ret20) },
  { key: 'ret60', label: '近 60 日', num: true, render: r => signedPct(r.ret60), sort: r => r.ret60, cls: r => tone(r.ret60) },
  { key: 'pe', label: 'PE(TTM)', num: true, render: r => fix(r.pe), sort: r => r.pe },
  { key: 'peP5', label: 'PE 5 年分位', num: true, render: r => pct(r.peP5), sort: r => r.peP5 },
  { key: 'peP10', label: 'PE 10 年分位', num: true, render: r => pct(r.peP10), sort: r => r.peP10 },
  { key: 'pb', label: 'PB', num: true, render: r => fix(r.pb), sort: r => r.pb },
  { key: 'pbP5', label: 'PB 5 年分位', num: true, render: r => pct(r.pbP5), sort: r => r.pbP5 },
  { key: 'dy', label: '股息率', num: true, render: r => pct(r.dy, 2), sort: r => r.dy },
  { key: 'cons', label: '公司数', num: true, render: r => (r.cons === null ? '—' : String(r.cons)), sort: r => r.cons },
]

const STOCK_COLS: Array<Col<ContribStock>> = [
  { key: 'points', label: '贡献点数', num: true, render: r => signedPts(r.points), sort: r => r.points, cls: r => tone(r.points) },
  { key: 'pct', label: '涨跌幅', num: true, render: r => signedPct(r.pct), sort: r => r.pct, cls: r => tone(r.pct) },
  { key: 'weight', label: '估算权重', num: true, render: r => `${fix(r.weight, 2)}%${r.est ? '*' : ''}`, sort: r => r.weight },
  { key: 'industry', label: '中证一级行业', render: r => r.industry ?? '—' },
]

function IndustryCard({ data }: { data: ThsIndustryData }): JSX.Element {
  const ind = data.industry
  const [l1, setL1] = useState('all')
  const groups = [...new Map(ind.rows.map(r => [r.l1Code, r.l1Name])).entries()]
  const rows = l1 === 'all' ? ind.rows : ind.rows.filter(r => r.l1Code === l1)
  return <Card title="行业景气表" as="section" className="mm-card" description={`中证行业二级 ${ind.rows.length} 个行业 · 财务 ${ind.periodLabel} · 点表头排序`}>
    <Segmented items={[{ id: 'all', label: '全部' }, ...groups.map(([id, label]) => ({ id, label }))]} value={l1} onChange={setL1} label="一级行业筛选" />
    <StockTable label="行业景气表" rows={rows} cols={IND_COLS} initial={{ key: 'score', dir: 'desc' }} />
    <p className="mm-method ti-formula">{METHOD.score(data.method)}</p>
    <p className="mm-method">{METHOD.valuation}</p>
    <p className="mm-method">{METHOD.percentile(ind.historyFrom, ind.historySamples)}</p>
    <p className="mm-method">{METHOD.finance(ind.periodLabel, ind.priorPeriod, data.method.roeMinAbs, data.method.coverage)}</p>
    <p className="mm-method">{METHOD.returns} 行业强弱曲线与轮动阶段见 <Link to="/sector-rotation">板块轮动</Link>，产业链与龙头见 <Link to="/industry-landscape">产业格局</Link>，宽基指数 PE 分位见 <Link to="/ths-mood/market">市场</Link> 页签。</p>
  </Card>
}

function ContribView({ c }: { c: ContribIndex }): JSX.Element {
  return <>
    <dl className="ti-summary">
      <div><dt>{c.name}</dt><dd className={tone(c.change)}>{fix(c.close)}</dd><small className={tone(c.change)}>{signedPts(c.change)} 点 · {signedPct(c.changePct)}</small></div>
      <div><dt>估算合计</dt><dd className={tone(c.estSum)}>{signedPts(c.estSum)}</dd><small>与实际相差 {signedPts(c.residual)} 点</small></div>
      <div><dt>上涨 / 下跌成分</dt><dd>{c.upCount} / {c.downCount}</dd><small>共 {c.constituents} 只{c.missing ? `，${c.missing} 只无当日涨跌` : ''}</small></div>
    </dl>
    <h3 className="ti-sub">拉动前 {c.up.length}</h3>
    <StockTable label={`${c.name} 拉动指数前 ${c.up.length}`} rows={c.up} cols={STOCK_COLS} empty="当日没有正贡献成分" />
    <h3 className="ti-sub">拖累前 {c.down.length}</h3>
    <StockTable label={`${c.name} 拖累指数前 ${c.down.length}`} rows={c.down} cols={STOCK_COLS} empty="当日没有负贡献成分" />
    <h3 className="ti-sub">按中证一级行业汇总</h3>
    <TableWrap label={`${c.name} 行业贡献汇总`}>
      <table className="mm-table ti-table">
        <thead><tr>{['行业', '贡献点数', '估算权重', '成分数'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{c.industries.map(i => <tr key={i.name}><th scope="row">{i.name}</th><td className={`num ${tone(i.points)}`}>{signedPts(i.points)}</td><td className="num">{fix(i.weight, 2)}%</td><td className="num">{i.count}</td></tr>)}</tbody>
      </table>
    </TableWrap>
    <p className="mm-method">权重：{c.weightNote}。{c.weightSource === 'cni' ? '标 * 的权重为按流通市值分配的估算值。' : ''}{c.check ? ` 中证官网公布了该指数当日前 ${c.check.listed} 名贡献，其中 ${c.check.matched} 只与本站估算对上，最大偏差 ${fix(c.check.maxDiff)} 点。` : ''}</p>
  </>
}

function ContribCard({ data }: { data: ThsIndustryData }): JSX.Element {
  const [code, setCode] = useState(data.contribution[0].code)
  const c = data.contribution.find(x => x.code === code) ?? data.contribution[0]
  return <Card title="指数贡献度" as="section" className="mm-card" description={`${data.asOf} 收盘，成分股对指数涨跌点数的贡献（估算）`}>
    <Segmented items={data.contribution.map(x => ({ id: x.code, label: x.name }))} value={c.code} onChange={setCode} label="贡献度指数" />
    <ContribView c={c} />
    <p className="mm-method">{METHOD.contribution}</p>
    <p className="mm-method">{METHOD.weights}</p>
  </Card>
}

export default function ThsIndustry(): JSX.Element {
  const [data, setData] = useState<ThsIndustryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoading(true); setError(null); setData(null); setAttempt(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/ths-tab-industry.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: unknown) => {
        if (controller.signal.aborted) return
        const parsed = asThsIndustry(body)
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
  return (
    <Page className="mm-page ti-page">
      <PageTitle>同花顺 · 行业景气</PageTitle>
      <ThsTabs />
      <p className="mm-disclaimer">{THS_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取行业景气数据…</p> : error ? (
        <LoadError reason="行业景气这份读数现在拿不到。" detail={error} onRetry={retry} />
      ) : !data ? <EmptyState title="暂无行业景气数据">收盘后完整采集成功再更新；数据文件缺失、不可用或格式异常时不展示。</EmptyState> : <>
        <p className="mm-method">数据日期：{data.asOf}（盘后） · 采集时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京）。得分、分位与贡献均为历史统计描述，不构成投资建议。</p>
        <IndustryCard data={data} />
        <ContribCard data={data} />
        <Card title="口径与未纳入项" as="section" className="mm-card">
          <ul className="ti-list">{METHOD.skipped.map(s => <li key={s}>{s}</li>)}</ul>
          <p className="mm-method">站内相关：<Link to="/sector-rotation">板块轮动</Link> · <Link to="/industry-landscape">产业格局</Link> · <Link to="/industry-etf">ETF 清单</Link> · <Link to="/ths-mood/market">同花顺 · 市场</Link>。</p>
          <p className="mm-method">公开来源：{data.sources.map((s, i) => <React.Fragment key={s.url}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。</p>
        </Card>
      </>}
    </Page>
  )
}
