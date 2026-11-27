import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Callout, Card, EmptyState, LoadError, Page, PageDataFreshness, PageTitle, Segmented, TableWrap } from '../../components/ui'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import { asStockDetail, asStockIndex, METHOD, type Band, type StockDetail, type StockIndex, type StockRow } from '../../features/kpl-stock/model'
import { money, num, pct, tone } from '../../features/kpl-daban/StockTable'
import '../../styles/market-mood.css'
import '../../styles/kpl-stock.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load<T> = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ok'; data: T }
async function json(name: string, signal: AbortSignal): Promise<unknown> {
  const r = await fetch(`${BASE}data/${name}`, { cache: 'no-cache', signal })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json().catch(() => null)
}

function Chips({ detail: d }: { detail: StockDetail }): JSX.Element {
  const c = d.chips
  if (!c) return <EmptyState title="筹码模型暂不可用">换手、价格或成交字段不全时不估算。</EmptyState>
  const max = Math.max(...c.buckets.map(b => b.weight), 0.001)
  const lo = Math.min(c.buckets[0].price, d.close), hi = Math.max(c.buckets.at(-1)!.price, d.close)
  const y = (p: number): number => 310 - (p - lo) / (hi - lo || 1) * 280
  const ranges = [['90%', c.range90], ['70%', c.range70]] as const
  return <>
    <dl className="ks-stats">
      <div><dt>获利比例</dt><dd className="mm-up">{pct(c.profit, 2, false)}</dd></div>
      <div><dt>平均成本（前复权）</dt><dd>{num(c.average, 2)} 元</dd></div>
      {ranges.map(([label, r]) => <div key={label}><dt>{label} 筹码区间 · 集中度</dt><dd>{num(r.low, 2)}–{num(r.high, 2)} 元<small>{pct(r.concentration === null ? null : r.concentration * 100, 2, false)}</small></dd></div>)}
    </dl>
    <figure className="ks-chips">
      <svg viewBox="0 0 600 350" role="img" aria-label="筹码分布模型估计">
        <title>筹码分布模型估计</title>
        {c.buckets.map((b, i) => <rect key={i} className={b.price < d.close ? 'ks-chips__profit' : 'ks-chips__loss'} x={78} y={y(b.price) - 2} width={b.weight / max * 420} height={4}><title>{num(b.price, 2)} 元：{pct(b.weight * 100, 2, false)}</title></rect>)}
        {[lo, (lo + hi) / 2, hi].map((p, i) => <text key={i} className="ks-chips__text" x={68} y={y(p) + 4} textAnchor="end">{num(p, 2)}</text>)}
        <line className="ks-chips__close" x1={76} x2={590} y1={y(d.close)} y2={y(d.close)} />
        <text className="ks-chips__text" x={588} y={y(d.close) - 6} textAnchor="end">收盘 {num(d.close, 2)}</text>
        <text className="ks-chips__text" x={78} y={326}>0%</text>
        <text className="ks-chips__text" x={498} y={326} textAnchor="end">{pct(max * 100, 2, false)}</text>
        <text className="ks-chips__text" x={78} y={346}>红：获利　绿：套牢 / 平价　横轴：筹码权重</text>
      </svg>
      <figcaption className="mm-method">{c.from} 至 {c.to}，{c.days} 条日 K；首日初始化剩余权重 {pct(c.seedWeight * 100, 2, false)}，均价限定 {c.clampedDays} 天。</figcaption>
    </figure>
  </>
}
const LEVEL_NAMES = ['最小值', '25% 档', '中位数', '75% 档', '最大值']
function Valuation({ band: b, label }: { band: Band; label: string }): JSX.Element {
  const unavailable = b.status === 'loss' ? '亏损，PE 不适用' : `${label} 最新值缺失`
  return <section className="ks-valuation" aria-label={`${label} 估值带`}>
    <h3>{label}</h3>
    <p>{b.status === 'ok' ? <>当前 {num(b.current, 2)} 倍 · 历史分位 {pct(b.percentile, 2, false)}</> : unavailable}</p>
    <p className="mm-method">{b.from ?? '—'} 至 {b.date ?? '—'} · {b.samples} 个有效日频样本；截至 {b.date ?? '—'}。</p>
    {b.status !== 'loss' && <MoodChart points={b.points} label={`${label} 历史估值`} format={v => `${num(v, 2)}倍`} refs={b.levels.flatMap((value, i) => value === null ? [] : [{ value, label: `${LEVEL_NAMES[i]} ${num(value, 2)}` }])} />}
  </section>
}
function Detail({ d }: { d: StockDetail }): JSX.Element {
  return <>
    <Card title={`${d.name} ${d.code}`} as="section" className="mm-card" description={`日 K 截至 ${d.asOf} · ${d.industry || '行业资料暂缺'}`}>
      <p className="ks-quote">前复权收盘 <strong>{num(d.close, 2)} 元</strong><span className={tone(d.pct)}>{pct(d.pct)}</span></p>
      {d.concepts.length > 0 && <p className="mm-method">所属概念：{d.concepts.join('、')}</p>}
    </Card>
    <Card title="区间统计" as="section" className="mm-card">
      <TableWrap label="区间统计表"><table className="ks-table"><thead><tr><th>区间</th><th>涨幅</th><th>最大回撤</th><th>振幅</th><th>平均换手</th><th>成交额合计</th></tr></thead>
        <tbody>{d.intervals.map(r => <tr key={r.days}><th scope="row" title={`${r.from ?? '基期不足'} 至 ${r.to ?? '—'}`}>{r.days} 日</th><td className={tone(r.change)}>{pct(r.change)}</td><td>{pct(r.drawdown, 2, false)}</td><td>{pct(r.amplitude, 2, false)}</td><td>{pct(r.avgTurnover, 2, false)}</td><td>{money(r.amount)}</td></tr>)}</tbody></table></TableWrap>
      <p className="mm-method">{METHOD.interval}</p>
    </Card>
    <Card title="月度收益率" as="section" className="mm-card">
      <MoodChart points={d.months} label="月度收益率" kind="bar" colorBy="sign" format={v => pct(v)} tick={date => date.slice(2, 7)} />
      {d.months.some(m => m.partial) && <p className="mm-method">当前月未结束，月内收益截至 {d.asOf}。</p>}
      <p className="mm-method">{METHOD.months}</p>
    </Card>
    <Card title="筹码分布（CYQ）" as="section" className="mm-card"><Chips detail={d} /><p className="mm-method">{METHOD.chips}</p><p className="mm-method">{METHOD.chipsStats}</p></Card>
    <Card title="历史估值带" as="section" className="mm-card">
      {d.valuation ? <><Valuation band={d.valuation.pe} label="PE(TTM)" /><Valuation band={d.valuation.pb} label="PB" /></> : <EmptyState title="估值历史暂不可用">{d.valuationReason ?? '公开估值报告暂缺。'}</EmptyState>}
      {d.valuation && d.valuationReason && <p className="mm-method">{d.valuationReason}</p>}
      <p className="mm-method">{METHOD.valuation}</p>
    </Card>
  </>
}
const LISTS = [{ id: 'all', label: '全部' }, { id: 'zt', label: '今日涨停' }, { id: 'zb', label: '今日炸板' }, { id: 'lhb', label: '龙虎榜' }, { id: 'amount', label: '成交额前列' }] as const
type List = typeof LISTS[number]['id']
function StockBody({ data }: { data: StockIndex }): JSX.Element {
  const [params, setParams] = useSearchParams()
  const code = params.get('code') ?? ''
  const [query, setQuery] = useState(''), [list, setList] = useState<List>('all')
  const row = data.stocks.find(r => r.code === code)
  const [load, setLoad] = useState<(Load<StockDetail> & { code: string }) | null>(null)
  const [detailAttempt, setDetailAttempt] = useState(0)
  useEffect(() => {
    if (!row) return
    const controller = new AbortController()
    setLoad({ state: 'loading', code: row.code })
    json(`kpl-stock-${row.code.slice(0, 3)}.json`, controller.signal).then(body => {
      if (controller.signal.aborted) return
      const item = body && typeof body === 'object' ? (body as Record<string, unknown>)[row.code] : null
      const detail = asStockDetail(item, row, data.asOf)
      setLoad(detail ? { state: 'ok', code: row.code, data: detail } : { state: 'missing', code: row.code })
    }).catch((e: unknown) => {
      if (controller.signal.aborted) return
      setLoad({ state: 'error', code: row.code, message: e instanceof Error ? e.message : '网络错误' })
    })
    return () => controller.abort()
  }, [row, data.asOf, detailAttempt])
  const q = query.trim().toLowerCase()
  const matches = data.stocks.filter(r => q ? r.code.includes(q) || r.name.toLowerCase().includes(q) : list === 'all' || r.lists.includes(list))
  if (!q && list === 'amount') matches.sort((a, b) => (a.rank ?? 101) - (b.rank ?? 101))
  const select = (r: StockRow): void => { const next = new URLSearchParams(params); next.set('code', r.code); setParams(next) }
  return <>
    <PageDataFreshness checkedAt={data.generatedAt} dataDates={[data.asOf]} note="候选池齐备后收盘更新" />
    <Card title="股票检索" as="section" className="mm-card">
      <label className="ks-search">代码 / 名称<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索候选池中的股票" /></label>
      <Segmented items={[...LISTS]} value={list} onChange={setList} label="股票快捷名单" />
      <p className="mm-method">{data.asOf} 候选池共 {data.stocks.length} 只 · 当前列表 {matches.length} 只。输入关键词时检索全部保留股票。</p>
      {matches.length ? <ul className="ks-results">{matches.map(r => <li key={r.code}><button type="button" className={code === r.code ? 'is-selected' : ''} onClick={() => select(r)} aria-pressed={code === r.code}><span>{r.name} <small>{r.code}{r.date < data.asOf ? ` · 行情 ${r.date}` : ''}</small></span><span className={tone(r.pct)}>{pct(r.pct)}</span></button></li>)}</ul> : <EmptyState title="股票不在本页候选池">可切换快捷名单或清空搜索；完整市场检索暂未提供。</EmptyState>}
      <p className="mm-method">{METHOD.universe}</p>
    </Card>
    {code && !row && <EmptyState title="股票不在本页候选池">{code} 未被最近的候选池收录，或已因 600 只上限移出。</EmptyState>}
    {row && (load?.code !== row.code || load.state === 'loading') && <p className="mm-empty">正在加载个股详情…</p>}
    {row && load?.code === row.code && load.state === 'missing' && <EmptyState title="个股详情暂不可用">详情文件缺失、格式错误或日期不匹配，请稍后重试。</EmptyState>}
    {row && load?.code === row.code && load.state === 'error' && (
      <LoadError reason="个股详情这份读数现在拿不到。" detail={load.message} onRetry={() => setDetailAttempt(n => n + 1)} />
    )}
    {row && load?.code === row.code && load.state === 'ok' && <Detail d={load.data} />}
    {!code && <EmptyState title="选择一只股票查看详情">从快捷名单选择，或输入代码、名称搜索。</EmptyState>}
  </>
}
export default function KplStock(): JSX.Element {
  const [load, setLoad] = useState<Load<StockIndex>>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoad({ state: 'loading' }); setAttempt(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    json('kpl-stock.json', controller.signal).then(body => {
      if (controller.signal.aborted) return
      const data = asStockIndex(body)
      setLoad(data ? { state: 'ok', data } : { state: 'missing' })
    }).catch((e: unknown) => {
      if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' })
    })
    return () => controller.abort()
  }, [attempt])
  return <Page className="mm-page ks-page"><PageTitle>开盘啦 · 个股</PageTitle><KplTabs /><p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
    {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
    {load.state === 'missing' && <EmptyState title="个股数据尚未生成或暂不可用">交易日收盘后，涨停、炸板、龙虎榜与成交额榜齐备才发布；数据未就绪时保留上一份。</EmptyState>}
    {load.state === 'error' && (
      <LoadError reason="个股候选池这份读数现在拿不到。" detail={load.message} onRetry={retry} />
    )}
    {load.state === 'ok' && <StockBody data={load.data} />}
    <Callout title="口径与来源"><p>{METHOD.skipped}</p><p>来源：<a href="https://quote.eastmoney.com/ztb/" target="_blank" rel="noreferrer">东方财富公开股池与日 K</a>、<a href="https://data.eastmoney.com/stock/lhb.html" target="_blank" rel="noreferrer">东财龙虎榜</a>、<a href="https://data.eastmoney.com/gzfx/" target="_blank" rel="noreferrer">东财估值分析</a>、<a href="https://finance.sina.com.cn/" target="_blank" rel="noreferrer">新浪成交额榜</a>。历史统计与模型估计均不构成投资建议。</p></Callout>
  </Page>
}
