// 同花顺 · ETF资金（/ths-mood/etf）：交易所每日 ETF 份额推算的申购净流入、全市场 ETF 资金排行、中证指数定期调整名单。
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, LoadError, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import ThsTabs, { THS_DISCLAIMER } from '../../features/ths-tabs/ThsTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import { CATEGORIES, METHOD, SZSE_FALLBACK, WINDOWS, asThsEtf, tone, yi, yiShares, type EtfRow, type Rebalance, type ThsEtfData, type Window } from '../../features/ths-etf/model'
import '../../styles/market-mood.css'
import '../../styles/ths-etf.css'

const BASE = import.meta.env.BASE_URL
const RANGES = [{ id: '20', label: '20 日' }, { id: '60', label: '60 日' }]
const streakText = (x: number | null): string => x === null ? '—' : `${x} 天`

function RankTable({ title, rows, win }: { title: string; rows: EtfRow[]; win: Window }): JSX.Element {
  return <Card title={title} as="section" className="mm-card">
    {rows.length === 0 ? <p className="mm-method">该类别在这个区间没有{title.includes('流出') ? '净流出' : '净流入'}的 ETF（或数据不足）。</p> : <TableWrap label={title} stickyFirst>
      <table className="mm-table te-table">
        <thead><tr>{['名称代码', '当日', '近 5 日', '近 20 日', '连续流入', '规模'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.code}>
          <th scope="row">{r.name}<small>{r.code}</small></th>
          {(['flow1', 'flow5', 'flow20'] as const).map(k => <td key={k} className={`num ${tone(r[k])}${WINDOWS.find(w => w.id === win)?.key === k ? ' te-key' : ''}`}>{yi(r[k])}</td>)}
          <td className="num">{streakText(r.streak)}</td>
          <td className="num">{yi(r.scale, false)}</td>
        </tr>)}</tbody>
      </table>
    </TableWrap>}
  </Card>
}

function RebalanceCard({ r, asOf }: { r: Rebalance; asOf: string }): JSX.Element {
  const state = r.effectiveDate === null ? '生效日未解析' : r.effectiveDate >= asOf ? '待生效' : '已生效'
  return <Card title={r.title} as="section" className="mm-card" description={`公告 ${r.publishDate} · 生效：${r.effectiveDate ?? '—'} 收市后（${state}）`}>
    <p className="mm-method"><a href={r.url} target="_blank" rel="noreferrer">中证指数公告原文</a>{r.attachmentUrl && <>{' · '}<a href={r.attachmentUrl} target="_blank" rel="noreferrer">附件 PDF</a></>}</p>
    {r.status === 'pending' ? <p className="mm-method">名单待解析：附件未能自动解析，或解析结果与公告写明的更换数量不一致，请看公告原文。</p>
      : r.indexes.map(ix => <details key={ix.index} className="te-details">
        <summary>{ix.index}：调入 {ix.in.length} 只 / 调出 {ix.out.length} 只</summary>
        <TableWrap label={`${ix.index} 调整名单`}>
          <table className="mm-table te-adjust">
            <thead><tr><th scope="col">调入</th><th scope="col">调出</th></tr></thead>
            <tbody>{Array.from({ length: Math.max(ix.in.length, ix.out.length) }, (_, i) => <tr key={i}>
              <td className="mm-up">{ix.in[i] ? <>{ix.in[i].name}<small>{ix.in[i].code}</small></> : '—'}</td>
              <td className="mm-down">{ix.out[i] ? <>{ix.out[i].name}<small>{ix.out[i].code}</small></> : '—'}</td>
            </tr>)}</tbody>
          </table>
        </TableWrap>
      </details>)}
  </Card>
}

export default function ThsEtf(): JSX.Element {
  const [data, setData] = useState<ThsEtfData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoading(true); setError(null); setData(null); setAttempt(n => n + 1) }
  const [range, setRange] = useState('60')
  const [cat, setCat] = useState<string>('宽基')
  const [win, setWin] = useState<Window>('d1')
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/ths-tab-etf.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: unknown) => {
        if (controller.signal.aborted) return
        const parsed = asThsEtf(body)
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
  const history = data ? data.broad.history.slice(-Number(range)) : []
  const category = data?.market.categories.find(c => c.cat === cat)
  const winLabel = WINDOWS.find(w => w.id === win)?.label ?? ''
  const szse = data?.exchanges?.szse
  const szseMissing = szse?.status === 'unavailable'
  const partial = szseMissing ? data?.broad.partial : undefined
  return (
    <Page className="mm-page te-page">
      <PageTitle>同花顺 · ETF资金</PageTitle>
      <ThsTabs />
      <p className="mm-disclaimer">{THS_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取 ETF 资金数据…</p> : error ? (
        <LoadError reason="ETF资金这份读数现在拿不到。" detail={error} onRetry={retry} />
      ) : !data ? <EmptyState title="暂无 ETF 资金数据">交易所公布当日 ETF 份额后（收盘后）采集；数据文件缺失或格式异常时不展示。</EmptyState> : <>
        <p className="mm-method">数据日期：{data.asOf}（交易所公布的当日份额） · 采集时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京）。
          {data.backfill && ` ${data.backfill.from} ~ ${data.backfill.to} 的历史为一次性回补（同样取交易所带日期的每日份额与日 K 收盘价），之后每日收盘后追加。`}
          深交所 T 日晚间公布的份额为参考值，次日早间修订，脚本每次会重抓最近 6 个交易日覆盖。</p>
        {szseMissing && <p className="mm-method te-callout" role="note"><strong>深交所 {data.asOf} 的 ETF 份额暂缺。</strong>采集时深交所站点不可达，本期只发布沪市当日数据：含深市 ETF 的宽基合计、按指数汇总与当日历史记为缺失（—），全市场排行只含沪市 ETF；深交所份额最新到 {szse?.date ?? '—'}。能连上深交所后重跑会自动补齐并替换。</p>}
        {!!szse?.inferredDates?.length && <p className="mm-method">深交所 {szse.inferredDates.join('、')} 的份额取自腾讯行情（不是交易所原始文件）。{SZSE_FALLBACK}</p>}
        <p className="mm-method">{METHOD.flow}</p>

        <Card title="宽基 ETF 申购净流入（国家队 ETF 口径）" as="section" className="mm-card" description="33 只主流宽基 ETF 合计；按份额变化推算，不代表一定是国家队资金。金额单位：亿元。">
          <dl className="te-summary">{([['当日', data.broad.total.flow1], ['近 5 日', data.broad.total.flow5], ['近 20 日', data.broad.total.flow20]] as const).map(([label, v]) => <div key={label}><dt>{label}</dt><dd className={tone(v)}>{yi(v)}</dd></div>)}
            <div><dt>名单合计规模</dt><dd>{yi(data.broad.total.scale, false)}</dd></div></dl>
          {partial && <dl className="te-summary" aria-label={`仅沪市 ${partial.n} 只合计`}>{([['当日（仅沪市）', partial.flow1], ['近 5 日（仅沪市）', partial.flow5], ['近 20 日（仅沪市）', partial.flow20]] as const).map(([label, v]) => <div key={label}><dt>{label}</dt><dd className={tone(v)}>{yi(v)}</dd></div>)}
            <div><dt>沪市 {partial.n} 只规模</dt><dd>{yi(partial.scale, false)}</dd></div></dl>}
          {partial && <p className="mm-method">深交所份额暂缺，上面一行只加总名单里的沪市 {partial.n} 只，与 33 只合计不是同一口径。</p>}
          <Segmented items={RANGES} value={range} onChange={setRange} label="历史范围" />
          <MoodChart label="宽基 ETF 每日申购净流入" kind="bar" colorBy="sign" points={history.map(h => ({ date: h.date, value: h.flow === null ? null : h.flow / 1e8 }))} format={v => `${v.toFixed(1)} 亿`} refs={[{ value: 0, label: '零' }]} />
          <p className="mm-method">每天的净额，不是累计值；红柱为净申购、绿柱为净赎回；缺失日期不补零。{METHOD.broad}</p>
        </Card>

        <Card title="按指数汇总" as="section" className="mm-card">
          <TableWrap label="宽基按指数汇总" stickyFirst>
            <table className="mm-table te-table">
              <thead><tr>{['指数', '只数', '当日', '近 5 日', '近 20 日', '规模'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{data.broad.byIndex.map(r => <tr key={r.index}>
                <th scope="row">{r.index}</th><td className="num">{r.n}</td>
                <td className={`num ${tone(r.flow1)}`}>{yi(r.flow1)}</td><td className={`num ${tone(r.flow5)}`}>{yi(r.flow5)}</td><td className={`num ${tone(r.flow20)}`}>{yi(r.flow20)}</td>
                <td className="num">{yi(r.scale, false)}</td>
              </tr>)}</tbody>
            </table>
          </TableWrap>
        </Card>

        <Card title="宽基 ETF 逐只" as="section" className="mm-card">
          <TableWrap label="宽基 ETF 逐只" stickyFirst>
            <table className="mm-table te-table">
              <thead><tr>{['名称代码', '指数', '份额', '份额变化', '收盘', '当日', '近 5 日', '近 20 日', '连续流入'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{data.broad.list.map(r => <tr key={r.code}>
                <th scope="row">{r.name}<small>{r.code}</small></th><td>{r.index}</td>
                <td className="num">{yiShares(r.shares)}</td><td className={`num ${tone(r.sharesChg)}`}>{yiShares(r.sharesChg, true)}</td>
                <td className="num">{r.close === null ? '—' : r.close.toFixed(3)}</td>
                <td className={`num ${tone(r.flow1)}`}>{yi(r.flow1)}</td><td className={`num ${tone(r.flow5)}`}>{yi(r.flow5)}</td><td className={`num ${tone(r.flow20)}`}>{yi(r.flow20)}</td>
                <td className="num">{streakText(r.streak)}</td>
              </tr>)}</tbody>
            </table>
          </TableWrap>
          <p className="mm-method">{METHOD.window}</p>
        </Card>

        <h2 className="te-h2">全市场 ETF 资金排行</h2>
        <Card title="按类别汇总" as="section" className="mm-card" description={`${szseMissing ? '仅沪市（深交所份额暂缺）' : '沪深两市'} ${data.market.n} 只非货币 ETF；类别合计只加总有数据的产品，「有数据」列给出覆盖只数。`}>
          <TableWrap label="ETF 按类别汇总" stickyFirst>
            <table className="mm-table te-table">
              <thead><tr>{['类别', '只数', '当日', '近 5 日', '近 20 日', '有数据（当日/5日/20日）'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{data.market.categories.map(c => <tr key={c.cat}>
                <th scope="row">{c.cat}</th><td className="num">{c.n}</td>
                <td className={`num ${tone(c.flow1)}`}>{yi(c.flow1)}</td><td className={`num ${tone(c.flow5)}`}>{yi(c.flow5)}</td><td className={`num ${tone(c.flow20)}`}>{yi(c.flow20)}</td>
                <td className="num">{c.covered.d1} / {c.covered.d5} / {c.covered.d20}</td>
              </tr>)}</tbody>
            </table>
          </TableWrap>
          <p className="mm-method">{METHOD.category}</p>
        </Card>
        <div className="te-controls">
          <Segmented items={CATEGORIES.map(c => ({ id: c, label: c }))} value={cat} onChange={setCat} label="ETF 类别" />
          <Segmented items={WINDOWS.map(w => ({ id: w.id, label: w.label }))} value={win} onChange={setWin} label="统计区间" />
        </div>
        {category && <>
          <RankTable title={`${cat} · ${winLabel}净流入前 20`} rows={category.rank[win].inflow} win={win} />
          <RankTable title={`${cat} · ${winLabel}净流出前 20`} rows={category.rank[win].outflow} win={win} />
        </>}

        <h2 className="te-h2">指数调仓</h2>
        <p className="mm-method">{METHOD.rebalance}{METHOD.noEstimate}</p>
        {data.rebalance.length === 0 ? <EmptyState title="暂无调仓公告">中证指数公告列表暂不可用。</EmptyState> : data.rebalance.map(r => <RebalanceCard key={r.id} r={r} asOf={data.asOf} />)}

        <div className="mm-method te-callout">
          <p><strong>口径与边界。</strong>{METHOD.skipped}</p>
          <p>相关页面：国家队季报持仓看 <Link to="/invest/national-team">国家队持仓</Link>（本页是日度份额，两者口径不同）；ETF 选品看 <Link to="/invest/etf">ETF 流派地图</Link> 与 <Link to="/industry-etf">ETF 清单</Link>。</p>
        </div>
        <p className="mm-method">公开来源：{data.sources.map(s => <React.Fragment key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>{' '}</React.Fragment>)}</p>
      </>}
    </Page>
  )
}
