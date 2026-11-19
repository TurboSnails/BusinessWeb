import React, { useEffect, useState } from 'react'
import { CircleHelp, RefreshCw } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Segmented } from '../../components/ui/PageTabs'
import { INDICATORS, stageFromSnapshot } from '../macro/indicators'
import { checkQuality } from '../macro/quality'
import Sparkline from '../macro/Sparkline'
import { automaticRows } from '../market-cycle/automation'
import { evaluate, type Evidence } from '../market-cycle/engine'
import { breadthChange, compareReturns, decideMarket, freshness, macroReading, nyDate, periodReturn, qualifiedBreadth, recentDirection, relativeVolume, type Breadth, type MarketGroup, type MarketSlice, type Point, type Reading } from './model'
import { FEED_FIELDS, FILES, mergeSnapshots, type Feed, type Snapshots } from './snapshots'
import './us-market.css'

const GROUPS: { id: MarketGroup; label: string }[] = [
  { id: 'broad', label: '大盘' }, { id: 'size', label: '规模' }, { id: 'style', label: '风格' },
  { id: 'sector', label: '行业' }, { id: 'participants', label: '参与者' },
]
type Item = { name: string; reading?: Reading }

const format = (value: number, unit: string) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: unit === 'bp' ? 0 : 3 }).format(value) + unit
const signed = (value: number | undefined, unit: string) => value === undefined ? '—' : (value > 0 ? '+' : '') + format(Math.round(value * 100) / 100, unit)
const route = (tab: string) => `/monitor?tab=${tab}`
const val = (name: string, unit: string, source: string, scope: string, frequency: string, history: Point[], note?: string): Reading => ({
  name, unit, source, scope, frequency, history, note,
})

function ReadingRow({ item, asOf }: { item: Item; asOf: string }) {
  const r = item.reading
  const last = r?.history?.at(-1)
  const previous = r?.history?.at(-2)
  const usable = last && Number.isFinite(last[1])
  if (!r || !last || !usable) return <li className="us-market__row"><span>{item.name}</span><span className="us-market__muted">暂无同口径数据</span></li>
  const state = freshness(last[0], r.frequency, asOf)
  return (
    <li className="us-market__metric">
      <div className="us-market__row">
        <span>{item.name}</span><strong className={state === '沿用上期' ? 'us-market__muted' : undefined}>{format(last[1], r.unit)}</strong>
      </div>
      <div className="us-market__meta"><time dateTime={last[0]}>{last[0]}</time><span>{r.scope} · {r.frequency} · {state}{r.refreshError ? ' · 本次未能复核' : ''}</span></div>
      {(r.benchmark5y !== undefined || r.benchmark10y !== undefined) && <div className="us-market__meta">
        {r.benchmark5y !== undefined && <span>5 年均值 {format(r.benchmark5y, r.unit)}</span>}
        {r.benchmark10y !== undefined && <span>10 年均值 {format(r.benchmark10y, r.unit)}</span>}
      </div>}
      <details>
        <summary>口径与历史</summary>
        {previous && <p>较上次 {previous[0]} {signed(last[1] - previous[1], r.unit === '%' ? ' 个百分点' : r.unit)}</p>}
        {r.releasedAt && <p>发布于 {r.releasedAt.slice(0, 10)}</p>}
        {r.refreshError && <p>本次更新未取得新数据（{r.refreshError}），显示最近一次核实的观测。</p>}
        {r.note && <p>{r.note}</p>}
        {r.history.length > 1 && <Sparkline points={r.history.slice(-48)} label={item.name} unit={r.unit} digits={2} />}
        {/^https:\/\//.test(r.source) && <a href={r.source} target="_blank" rel="noreferrer">数据来源</a>}
      </details>
    </li>
  )
}

function MarketCard({ title, items, asOf, link }: { title: string; items: Item[]; asOf: string; link?: { tab: string; label: string } }) {
  return <section className="us-market__card" aria-label={title}>
    <h3>{title}</h3>
    <ul>{items.slice(0, 3).map(item => <ReadingRow key={item.name} item={item} asOf={asOf} />)}</ul>
    {items.length > 3 && <details className="us-market__more"><summary>其余 {items.length - 3} 项</summary>
      <ul>{items.slice(3).map(item => <ReadingRow key={item.name} item={item} asOf={asOf} />)}</ul>
    </details>}
    {link && <Link className="us-market__link" to={route(link.tab)}>{link.label}</Link>}
  </section>
}

const availableSeries = (s: Snapshots, asOf: string) => {
  const p = (key: string, name: string, note?: string): Item => {
    const data = s.public?.series?.[key]
    return { name, reading: data && { ...data, note: note ?? data.note } }
  }
  const m = (key: Parameters<typeof macroReading>[1], name: string, scope?: string, source?: string): Item => {
    const indicator = INDICATORS.find(i => i.key === key)
    const read = macroReading(s.macro, key, name, indicator?.freq ?? '每日', scope)
    return { name, reading: read && { ...read, unit: key === 'hfEquityLs' || key === 'putCall' ? '倍' : read.unit, source: source ?? read.source, note: indicator?.limit ?? read.note } }
  }
  const hy = s.public?.series?.hyDaily
  const coreHy = m('hy', '美国高收益债利差')
  const hyDate = coreHy.reading?.history.at(-1)?.[0] ?? ''
  const publicHy = hy?.history.at(-1)?.[0] ?? ''
  const credit = publicHy >= hyDate ? recentDirection(hy?.history ?? [], asOf) : undefined
  // Prefer the daily public series whenever it is at least as recent as the macro snapshot.
  const daily = (key: string, fallback: Item): Item => {
    const row = s.public?.series?.[key]
    return row && (row.history.at(-1)?.[0] ?? '') >= (fallback.reading?.history.at(-1)?.[0] ?? '') ? { name: fallback.name, reading: row } : fallback
  }
  return { p, m, credit, hy: daily('hyDaily', coreHy), vix: daily('vixDaily', m('vix', 'VIX 波动率')) }
}

const selectBreadth = (s: Snapshots, slice?: MarketSlice): Breadth | undefined => {
  if (!slice) return undefined
  return s.breadth?.breadth?.[slice.id] ?? s.breadth?.breadth?.[`sector-${slice.symbol.toLowerCase()}`]
}
const sliceVolume = (s: Snapshots, slice?: MarketSlice): number | undefined =>
  slice && relativeVolume(slice.volume ?? [], slice.history, s.slices?.shortSessions)

function MarketMatrix({ slices, active, benchmark, s, choose }: {
  slices: MarketSlice[]; active?: MarketSlice; benchmark: Point[]; s: Snapshots; choose(slice: MarketSlice): void
}) {
  if (!slices.length) return null
  return <section className="us-market__matrix" aria-label="同类市场比较" tabIndex={0}>
    <table>
      <caption>同类市场比较</caption>
      <thead><tr><th scope="col">市场</th><th scope="col">5 日</th><th scope="col">20 日</th><th scope="col">20 日相对标普</th><th scope="col">高于 200 日线</th><th scope="col">前瞻 P/E</th><th scope="col">成交量比</th><th scope="col">行情日期</th></tr></thead>
      <tbody>{slices.map(slice => {
        const breadth = selectBreadth(s, slice)
        const date = slice.history.at(-1)?.[0]
        const publicRatio = s.public?.series?.volumeRatio?.history.at(-1)
        const ratio = slice.id === 'spx' && publicRatio?.[0] === date ? publicRatio?.[1] : sliceVolume(s, slice)
        return <tr key={slice.id} className={active?.id === slice.id ? 'is-active' : ''}>
          <th scope="row"><button type="button" aria-pressed={active?.id === slice.id} onClick={() => choose(slice)}>{slice.name}<small>{slice.symbol}</small></button></th>
          <td>{signed(periodReturn(slice.history, 5), '%')}</td>
          <td>{signed(periodReturn(slice.history, 20), '%')}</td>
          <td>{signed(compareReturns(slice.history, benchmark, 20), ' 个百分点')}</td>
          <td>{qualifiedBreadth(breadth) && breadth.date === date ? format(breadth.above200, '%') : '—'}</td>
          <td>{slice.valuation ? <span title={`${slice.valuation.date} · ${slice.valuation.scope ?? slice.scope}`}>{format(slice.valuation.value, '倍')}</span> : '—'}</td>
          <td>{ratio === undefined ? '—' : ratio.toFixed(2) + ' 倍'}</td>
          <td>{date ?? '—'}</td>
        </tr>
      })}</tbody>
    </table>
  </section>
}

function evaluateStance(s: Snapshots, asOf: string, slice: MarketSlice | undefined, set: ReturnType<typeof availableSeries>) {
  const breadth = selectBreadth(s, slice)
  const date = slice?.history.at(-1)?.[0]
  const change = Math.abs(Date.parse(breadth?.date ?? '') - Date.parse(date ?? '')) <= 3 * 86_400_000 ? breadthChange(breadth, asOf) : undefined
  const daily = periodReturn(slice?.history ?? [], 1)
  const publicVolume = s.public?.series?.volumeRatio?.history.at(-1)
  const ownVolume = sliceVolume(s, slice)
  const usesMarketVolume = slice?.id === 'spx' && publicVolume?.[0] === date
  const ratio = usesMarketVolume ? publicVolume?.[1] : ownVolume
  const volumeConfirmed = date && freshness(date, '每日', asOf) === '近期观测' && daily !== undefined && ratio !== undefined
    ? daily > 0 && ratio >= 1 : undefined
  return {
    breadth, volumeConfirmed, change, usesMarketVolume,
    result: decideMarket({ breadth: change?.direction, volumeConfirmed, credit: set.credit }),
  }
}

function CycleReference({ s, id, asOf }: { s: Snapshots; id: string | undefined; asOf: string }) {
  const market = id === 'spx' || id === 'ndx' ? id : undefined
  const cycle = market && s.cycle?.markets?.[market]
  const result = market && cycle ? evaluate(market, cycle, {}, null, s.macro ?? null, asOf, automaticRows(market, s.auto ?? null, null, asOf)) : null
  const stage = s.macro && stageFromSnapshot(s.macro)
  const stale = s.macro && checkQuality(s.macro, null, new Date(asOf)).stageAffected
  const expl = (r: Evidence) => r.available ? r.detail : r.pendingReason ?? r.detail
  return <details className="us-market__reference">
    <summary>宏观阶段与牛熊周期参考</summary>
    <p>美国宏观阶段 <strong>{stage && stage.entered > 0 ? stage.stage.name : '暂无读数'}</strong>{stale && stale.length > 0 ? ' · 部分阶段输入缺失或过期' : ''} · <Link to={route('us')}>美国宏观</Link></p>
    {result && <><p>牛熊周期自动读数 <strong>{result.summary.state}</strong> · 有效证据 {result.summary.valid}/6 · <Link to={route(`market-cycle&market=${market}`)}>牛熊周期与回测</Link></p>
      <ul>{result.rows.map(r => <li key={r.id}><strong>{r.name}</strong> {expl(r)}</li>)}</ul></>}
    <p>用于观察风险与修复。20 周线回测应同时看回报和回撤。</p>
  </details>
}

export default function UsMarketView() {
  const [params, setParams] = useSearchParams()
  const [snap, setSnap] = useState<Snapshots>({})
  const [failed, setFailed] = useState<Feed[]>([])
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const abort = new AbortController()
    const feeds = Object.entries(FILES) as [Feed, string][]
    Promise.allSettled(feeds.map(async ([key, file]) => {
      const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache', signal: abort.signal })
      if (!res.ok) throw new Error(file)
      const data = await res.json()
      const field = data?.[FEED_FIELDS[key]]
      if (key === 'slices' || key === 'auto' ? !Array.isArray(field) || field.length === 0 : !field || Array.isArray(field) || typeof field !== 'object' || Object.keys(field).length === 0) throw new Error(file)
      return [key, data] as const
    })).then(results => {
      if (abort.signal.aborted) return
      setSnap(previous => mergeSnapshots(previous, Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []))))
      setFailed(feeds.filter((_, i) => results[i].status === 'rejected').map(([key]) => key))
      setLoading(false)
    })
    return () => abort.abort()
  }, [attempt])

  const group = GROUPS.find(g => g.id === params.get('view'))?.id ?? 'broad'
  const all = snap.slices?.slices ?? []
  const spx = all.find(s => s.id === 'spx')
  const slices = all.filter(s => s.group === group || (group === 'size' && s.id === 'spx'))
  const slice = slices.find(s => s.id === params.get('index')) ?? slices[0]
  const go = (view: MarketGroup, index?: string) => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (view === 'broad') next.delete('view')
    else next.set('view', view)
    if (index) next.set('index', index)
    else next.delete('index')
    return next
  }, { replace: true })
  const asOf = nyDate()
  const sets = availableSeries(snap, asOf)
  const { p, m } = sets
  const factSet = snap.public?.series?.spxFactSetFpe
  const dailyYield = snap.public?.series?.tenYearDaily
  const dailyRates = new Map(dailyYield?.history ?? [])
  const yieldSpread = factSet?.history.flatMap(([date, pe]): Point[] => {
    const yieldAtDate = dailyRates.get(date)
    return pe > 0 && yieldAtDate !== undefined ? [[date, 100 / pe - yieldAtDate]] : []
  })
  const spreadItem: Item = {
    name: '标普预期盈利收益率减国债',
    reading: yieldSpread?.length && factSet ? val('股债息差', ' 个百分点', factSet.source, 'FactSet 标普 500／FRED 10 年期美债', '每周', yieldSpread, '同日 100 ÷ 未来 12 个月市盈率 − 10 年期美债收益率。') : undefined,
  }
  const sectorValuation = slice?.group === 'sector' ? p(`${slice.symbol.toLowerCase()}FactSetFpe`, 'FactSet 行业预期市盈率') : undefined
  const stance = evaluateStance(snap, asOf, slice, sets)
  const marketDate = slice?.history.at(-1)?.[0]
  const facts = (snap.auto?.facts ?? []).filter(f => f.market === slice?.id)
  const fact = (key: string, name: string): Item => {
    const data = facts.filter(f => f.metricId === key && f.kind === 'observed').sort((a, b) => a.observationDate.localeCompare(b.observationDate))
    const last = data.at(-1)
    return { name, reading: last && { ...val(name, last.unit, last.source, slice?.name ?? '指数', '每周', data.map(f => [f.observationDate, f.value]), last.description), releasedAt: last.availableAt ?? undefined } }
  }
  const aggregate = slice && snap.indexes?.indexes?.[slice.id]?.agg
  const aggregateItem: Item = { name: '成分股汇总预期市盈率', reading: aggregate && val('成分股汇总预期市盈率', '倍', '', slice.name, '每日', [[aggregate.date, aggregate.fwd]], `估值覆盖 ${aggregate.fwdCount}/${aggregate.total}，详见估值位置。`) }
  const fundMetric = (metric: MarketSlice['valuation'] | undefined, name: string, unit: string): Item => ({
    name, reading: metric?.source && slice ? val(name, unit, metric.source, metric.scope ?? slice.scope, '每日', metric.history?.length ? metric.history : [[metric.date, metric.value]]) : undefined,
  })
  const fundValuations = slice?.valuation?.source ? [
    fundMetric(slice.valuation, 'ETF 发行商预期市盈率', '倍'),
    fundMetric(slice.earnings, '未来 3–5 年预计盈利增长', '%'),
    { name: '盈利预期上调／下调' },
  ] : aggregate ? [aggregateItem, fact('fwd_pe', '预期市盈率'), fact('fwd_pe_5y_percentile', '预期市盈率近 5 年分位')] : [{ name: '预期市盈率' }, { name: '盈利预期上调／下调' }]
  const breadthPct: Item = {
    name: '高于 200 日线的成分股',
    reading: qualifiedBreadth(stance.breadth) ? val('高于 200 日线的成分股', '%', stance.breadth.source, stance.breadth.scope, '每日',
      stance.breadth.history?.length ? stance.breadth.history : [[stance.breadth.date, stance.breadth.above200]], `覆盖 ${stance.breadth.covered}/${stance.breadth.total}。${stance.change ? ` 相对 ${stance.change.date} ${signed(stance.change.delta, ' 个百分点')}（${stance.change.scope}）。` : ''}`) : undefined,
  }
  const retailCash = p('retailCash', '散户现金')
  const retailStocks = p('retailStocks', '散户股票仓位')
  const retailBull = p('retailBull', 'AAII 散户看多')
  const retailBear = p('retailBear', 'AAII 散户看空')
  const managerCash = p('managerCash', 'BofA 全球基金经理现金')
  const liquidAssets = p('fundLiquidity', '股票共同基金流动资产比率')
  const fundFlows = p('domesticFlows', '美国股票基金与 ETF 周净流量')
  const managerUs = p('managerUsOverweight', 'BofA 受访经理美股净超配')
  const moneyFunds = [p('mmfTotal', '美国货币基金总资产'), p('mmfRetail', '零售货币基金资产'), p('mmfInstitutional', '机构货币基金资产')]
  const hedge = [
    m('hfEquityLs', 'OFR 对冲基金股票多空比', '合格对冲基金 · 美国与境外股票', 'https://www.financialresearch.gov/hedge-fund-monitor/datasets/fpf/'),
    p('primeEquityLs', '高盛美国多空基金样本'), p('primeTechLs', '高盛美国科技多空样本'),
    p('primeGross', '高盛美国样本总敞口／净值'), p('primeNet', '高盛美国样本净多敞口／净值'),
    ...(snap.public?.series?.ofrEquityGross ? [p('ofrEquityGross', 'OFR 股票总名义敞口'), p('ofrCashEquityLs', 'OFR 股票现货多空比')] : []),
  ]
  const broker = [
    p('finraDebt', 'FINRA 券商融资余额'),
    p('finraDebtYoy', 'FINRA 融资余额同比'), m('marginGdp', '保证金债务／GDP', 'FINRA 会员券商客户'),
    snap.public?.series?.finraCashDebt ? p('finraCashDebt', '券商客户现金／融资') : m('cashDebt', '券商客户现金／融资', 'FINRA 会员券商客户'),
  ]
  const futures = [
    p('cftcSpxLev', '标普期货 · 杠杆基金'), p('cftcNdxLev', '纳指期货 · 杠杆基金'),
    p('cftcSpxAsset', '标普期货 · 资产管理机构'), p('cftcNdxAsset', '纳指期货 · 资产管理机构'),
  ]
  const cash = [retailCash, managerCash, liquidAssets, retailStocks, ...moneyFunds, fundFlows, managerUs]
  const positions = [hedge[0], broker[0], ...hedge.slice(1), ...broker.slice(1), ...futures]
  const title = group === 'participants' ? '投资者仓位与资金' : slice?.name || '美股市场'
  const relative = compareReturns(slice?.history ?? [], spx?.history ?? [], 20)
  const volumeDate = slice?.volume?.at(-1)?.[0]
  const volumeRatio = sliceVolume(snap, slice)
  const ownRatio: Item = { name: '所选标的 20 日量比', reading: slice && volumeDate && volumeRatio !== undefined ? val('量比', '倍', slice.source, slice.scope, '每日', [[volumeDate, volumeRatio]], '当日成交量 ÷ 前 20 个交易日均量。') : undefined }
  const freshnessText = marketDate ? `收盘 ${marketDate} · ${freshness(marketDate, '每日', asOf)}` : '收盘日期待确认'
  const matrix = <MarketMatrix slices={slices} active={slice} benchmark={spx?.history ?? []} s={snap} choose={item => go(group, item.id)} />
  return <section className="us-market" aria-label="美股市场仪表盘">
    <div className="us-market__top">
      <Segmented label="美股细分" items={GROUPS} value={group} onChange={next => go(next)} />
      <button type="button" className="tool-btn" disabled={loading} onClick={() => { setLoading(true); setAttempt(n => n + 1) }}><RefreshCw size={15} aria-hidden="true" />刷新快照</button>
    </div>
    <p className="us-market__notice" role="status">{loading ? '正在核对数据快照…' : failed.length ? `部分数据暂时不可用（${failed.length} 个快照），保留可用读数。` : ''}</p>
    {group === 'broad' && slice && <Segmented label="美股指数" items={slices.map(item => ({ id: item.id, label: item.name }))} value={slice.id} onChange={id => go(group, id)} />}
    {group !== 'broad' && slice && <label className="us-market__select">比较标的
      <select value={slice.id} onChange={event => go(group, event.target.value)}>{slices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </label>}
    <header className="us-market__hero">
      <div>
        <p className="us-market__muted">{group === 'participants' ? '美国市场及相关全球样本' : `${slice?.scope ?? '美国股票市场'} · ${freshnessText}`}</p>
        <h2>{title}</h2>
        {group !== 'participants' && <p className="us-market__return" title={slice?.priceNote}>{signed(periodReturn(slice?.history ?? [], 5), '%')} <span>近 5 日</span>{slice?.id !== 'spx' && <span>近 20 日相对标普 {signed(relative, ' 个百分点')}</span>}</p>}
      </div>
      {group !== 'participants' && <div className="us-market__stance" data-state={stance.result.label}>
        <strong>{stance.result.label}</strong><p>{stance.result.detail}</p>
        <dl>
          <div><dt>成分股宽度</dt><dd title={stance.change?.scope}>{stance.change ? signed(stance.change.delta, ' 个百分点') : '待确认'}</dd></div>
          <div><dt>{stance.usesMarketVolume ? '全美量能／所选指数涨跌' : '上涨日量能'}</dt><dd>{stance.volumeConfirmed === undefined ? '待确认' : stance.volumeConfirmed ? '放量上涨' : '未见放量上涨'}</dd></div>
          <div><dt>美国信用利差</dt><dd>{sets.credit === 'worsening' ? '走阔' : sets.credit === 'improving' ? '收窄' : sets.credit === 'steady' ? '持平' : '待确认'}</dd></div>
        </dl>
      </div>}
    </header>
    <div className="us-market__grid">
      {group !== 'participants' && <>
        <MarketCard title="估值与盈利" items={[
          ...(slice?.id === 'spx' ? [
            p('spxFactSetFpe', 'FactSet 标普预期市盈率'), p('spxCape', '标普周期调整市盈率 CAPE'), p('spxEarningsNow', '标普最新季度盈利增长'),
            spreadItem, p('spxTrailingFpe', '标普过去 12 个月市盈率'), p('spxForwardEpsChange', '标普未来 12 个月 EPS 预期变化'),
            p('spxEarningsNextQuarter', '标普下季度盈利增速预测'), p('spxEarningsThisYear', '标普本年度盈利增速预测'), p('spxEarningsNextYear', '标普下一年度盈利增速预测'),
          ] : []),
          ...(sectorValuation?.reading ? [sectorValuation] : []),
          ...fundValuations,
        ]} asOf={asOf} link={{ tab: 'valuation', label: '查看估值位置' }} />
        <MarketCard title="宽度与成交" items={[
          breadthPct,
          { name: '高于 50 日线的成分股', reading: qualifiedBreadth(stance.breadth) && stance.breadth.above50 !== undefined ? val('成分宽度', '%', stance.breadth.source, stance.breadth.scope, '每日', [[stance.breadth.date, stance.breadth.above50]]) : undefined },
          ...(slice?.id === 'spx' ? [p('volumeRatio', '全美股票 20 日量比'), p('volume', '全美股票日成交量')] : [ownRatio, p('volumeRatio', '全美股票 20 日量比'), p('volume', '全美股票日成交量')]),
        ]} asOf={asOf} />
        <MarketCard title="市场情绪" items={[sets.vix, retailBull, retailBear, m('putCall', 'Cboe 期权 Put/Call', 'Cboe 全产品')]} asOf={asOf} />
        <MarketCard title="仓位与杠杆" items={positions} asOf={asOf} />
        <MarketCard title="现金与流向" items={cash} asOf={asOf} />
        <MarketCard title="信用与利率" items={[sets.hy, dailyYield ? p('tenYearDaily', '美国 10 年期国债') : m('tenYear', '美国 10 年期国债'), m('nfci', '芝加哥联储金融条件指数')]} asOf={asOf} link={{ tab: 'spread&mkt=us', label: '查看美股股债息差' }} />
      </>}
      {group === 'participants' && <>
        <MarketCard title="美国散户" items={[retailCash, retailStocks, retailBull, retailBear]} asOf={asOf} />
        <MarketCard title="基金经理与申赎" items={[managerCash, liquidAssets, fundFlows, managerUs]} asOf={asOf} />
        <MarketCard title="对冲基金仓位" items={hedge} asOf={asOf} />
        <MarketCard title="券商融资" items={broker} asOf={asOf} />
        <MarketCard title="股指期货仓位" items={futures} asOf={asOf} />
        <MarketCard title="货币基金资产" items={moneyFunds} asOf={asOf} />
      </>}
    </div>
    {matrix}
    <CycleReference s={snap} id={slice?.id} asOf={asOf} />
    <details className="us-market__reference"><summary><CircleHelp size={16} aria-hidden="true" />如何读图</summary>
      <p>价格与成交以完成的交易日为准。ETF 在表内注明代理范围。宽度按成分股计算，覆盖低于 95% 时暂停使用。相对收益比较同日数据。</p>
      <p>信用利差和宽度方向使用约一周前的观测。月度与季度资金数据按公布频率展示，失去时效或缺少数据时仍可查阅历史。</p>
    </details>
  </section>
}
