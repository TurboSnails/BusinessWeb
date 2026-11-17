// 开盘啦 · 打板（/market-mood/daban）：功能对照开盘啦 App「打板」区的竞价 / 涨停 / 炸板 / 跌停 / 新股 / 自然涨停 / 曾跌停
// 个股列表，以及涨停股的「溢价基因」。「即将涨停」需要盘中实时数据，不做。
// 数据：public/data/kpl-daban.json（scripts/kpl-daban.mjs 收盘后生成）。盘后统计，不是买卖建议。
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import { asKplDaban, METHOD, type AuctionRow, type DtRow, type HistoryDay, type KplDaban as Data, type NewRow, type TouchedRow, type ZbRow, type ZtRow } from '../../features/kpl-daban/model'
import StockTable, { money, num, pct, streakLabel, tone, type Col } from '../../features/kpl-daban/StockTable'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ok'; data: Data }

function useDaban(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-daban.json`, { cache: 'no-cache', signal: controller.signal })
      .then(async r => {
        if (r.status === 404) { setLoad({ state: 'missing' }); return }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        // 静态托管在文件缺失时可能回退成 index.html（200 但不是 JSON），同样按「尚未生成」处理
        const body: unknown = await r.json().catch(() => undefined)
        if (body === undefined) { setLoad({ state: 'missing' }); return }
        const data = asKplDaban(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [])
  return load
}

/* ---------- 各列表的列 ---------- */
const c = {
  pct: <T extends { pct: number | null }>(label = '涨幅'): Col<T> => ({ key: 'pct', label, num: true, render: r => pct(r.pct), sort: r => r.pct, cls: r => tone(r.pct) }),
  amount: <T extends { amount: number | null }>(): Col<T> => ({ key: 'amount', label: '成交额', num: true, render: r => money(r.amount), sort: r => r.amount }),
  turnover: <T extends { turnover: number | null }>(): Col<T> => ({ key: 'turnover', label: '换手', num: true, render: r => pct(r.turnover, 2, false), sort: r => r.turnover }),
  cap: <T extends { floatCap: number | null }>(): Col<T> => ({ key: 'cap', label: '流通市值', num: true, render: r => money(r.floatCap), sort: r => r.floatCap }),
  sector: <T extends { sector: string }>(): Col<T> => ({ key: 'sector', label: '行业', render: r => r.sector || '—', sort: r => r.sector || null }),
}

const shapeTag = (s: ZtRow['shape']): React.ReactNode => (s ? <span className={`kd-tag${s === '一字' ? ' is-strong' : ''}`}>{s}</span> : '—')
const ZT_COLS: Array<Col<ZtRow>> = [
  c.pct(),
  { key: 'boards', label: '连板', render: r => streakLabel(r.streak, r.boards), sort: r => r.boards },
  { key: 'shape', label: '板型', render: r => shapeTag(r.shape) },
  { key: 'first', label: '首次封板', num: true, render: r => r.firstSeal ?? '—', sort: r => r.firstSeal },
  { key: 'last', label: '最后封板', num: true, render: r => r.lastSeal ?? '—', sort: r => r.lastSeal },
  { key: 'opens', label: '开板次数', num: true, render: r => num(r.opens), sort: r => r.opens },
  { key: 'fund', label: '封板资金', num: true, render: r => money(r.fund), sort: r => r.fund },
  c.amount(), c.turnover(), c.cap(), c.sector(),
]
const ZB_COLS: Array<Col<ZbRow>> = [
  c.pct(),
  { key: 'limit', label: '涨停价', num: true, render: r => num(r.limitPrice, 2) },
  { key: 'first', label: '首次封板', num: true, render: r => r.firstSeal ?? '—', sort: r => r.firstSeal },
  { key: 'opens', label: '炸板次数', num: true, render: r => num(r.opens), sort: r => r.opens },
  { key: 'amp', label: '振幅', num: true, render: r => pct(r.amplitude, 2, false), sort: r => r.amplitude },
  { key: 'streak', label: '近期涨停', render: r => streakLabel(r.streak) },
  c.amount(), c.turnover(), c.sector(),
]
const DT_COLS: Array<Col<DtRow>> = [
  c.pct(),
  { key: 'days', label: '连续跌停', num: true, render: r => (r.days == null ? '—' : `${r.days} 天`), sort: r => r.days },
  { key: 'last', label: '最后封板', num: true, render: r => r.lastSeal ?? '—', sort: r => r.lastSeal },
  { key: 'opens', label: '开板次数', num: true, render: r => num(r.opens), sort: r => r.opens },
  { key: 'fund', label: '封单资金', num: true, render: r => money(r.fund), sort: r => r.fund },
  { key: 'fba', label: '板上成交额', num: true, render: r => money(r.boardAmount), sort: r => r.boardAmount },
  c.amount(), c.turnover(), c.sector(),
]
const TOUCHED_COLS: Array<Col<TouchedRow>> = [
  c.pct('收盘涨幅'),
  { key: 'low', label: '最低涨幅', num: true, render: r => pct(r.lowPct), sort: r => r.lowPct, cls: () => 'mm-down' },
  { key: 'dt', label: '跌停价', num: true, render: r => num(r.limitDown, 2) },
  { key: 'rebound', label: '较最低反弹', num: true, render: r => (r.rebound == null ? '—' : `${num(r.rebound, 2)} 个百分点`), sort: r => r.rebound },
  c.amount(), c.sector(),
  { key: 'tag', label: '备注', render: r => (r.limitUpToo ? <span className="kd-tag is-strong">地天板</span> : '') },
]
const AUCTION_COLS: Array<Col<AuctionRow>> = [
  { key: 'open', label: '竞价涨幅', num: true, render: r => pct(r.openPct), sort: r => r.openPct, cls: r => tone(r.openPct) },
  c.pct('收盘涨幅'),
  { key: 'cvo', label: '收盘较开盘', num: true, render: r => pct(r.closeVsOpen), sort: r => r.closeVsOpen, cls: r => tone(r.closeVsOpen) },
  { key: 'yb', label: '昨日连板', render: r => (r.yBoards == null ? '—' : r.yBoards === 1 ? '首板' : `${r.yBoards}连板`), sort: r => r.yBoards },
  { key: 'yfs', label: '昨日首封', num: true, render: r => r.yFirstSeal ?? '—', sort: r => r.yFirstSeal },
  { key: 'sealed', label: '今日涨停', render: r => (r.sealed ? <span className="kd-tag is-strong">再封</span> : '—'), sort: r => (r.sealed ? 1 : 0) },
  c.amount(), c.sector(),
]
const NEW_COLS: Array<Col<NewRow>> = [
  c.pct(),
  { key: 'list', label: '上市日期', num: true, render: r => r.listDate ?? '—', sort: r => r.listDate },
  { key: 'days', label: '上市天数', num: true, render: r => num(r.days), sort: r => r.days },
  c.turnover(), c.amount(), c.cap(), c.sector(),
  { key: 'tag', label: '备注', render: r => [r.noLimit ? '不设限' : '', r.newHigh ? '新高' : ''].filter(Boolean).join('、') },
]
const ratio = (part: number, total: number): string => (total ? `${part} / ${total}` : '—')
const GENE_COLS: Array<Col<ZtRow>> = [
  { key: 'boards', label: '今日', render: r => streakLabel(r.streak, r.boards), sort: r => r.boards },
  { key: 'zt', label: '涨停次数', num: true, render: r => num(r.gene?.zt), sort: r => r.gene?.zt ?? null },
  { key: 'p5', label: '溢价5%次数', num: true, render: r => (r.gene ? ratio(r.gene.p5, r.gene.nextN) : '—'), sort: r => r.gene?.p5 ?? null },
  { key: 'red', label: '次日红盘率', num: true, render: r => pct(r.gene?.redRate, 1, false), sort: r => r.gene?.redRate ?? null },
  { key: 'fs', label: '首板封板率', num: true, render: r => (r.gene ? <>{pct(r.gene.firstSealRate, 1, false)}<small>{r.gene.firstTry ? `${r.gene.firstTry} 次` : ''}</small></> : '—'), sort: r => r.gene?.firstSealRate ?? null },
  { key: 'fb', label: '首板破板率', num: true, render: r => pct(r.gene?.firstBreakRate, 1, false), sort: r => r.gene?.firstBreakRate ?? null },
  { key: 'lb', label: '连板率', num: true, render: r => (r.gene ? <>{pct(r.gene.lbRate, 1, false)}<small>{r.gene.lbBase ? ratio(r.gene.lb, r.gene.lbBase) : ''}</small></> : '—'), sort: r => r.gene?.lbRate ?? null },
]

/* ---------- 顶部汇总 ---------- */
function Summary({ d }: { d: Data }): JSX.Element {
  const s = d.summary
  const cells: Array<[string, React.ReactNode, React.ReactNode, string?]> = [
    ['涨停', s.zt, `一字 ${s.oneWord}`, 'mm-up'],
    ['炸板', s.zb, `封板率 ${pct(s.sealRate, 1, false)}`],
    ['跌停', s.dt, '收盘封在跌停', 'mm-down'],
    ['自然涨停', s.natural, '非一字、非新股'],
    ['曾跌停', s.touched, '触及跌停后打开'],
    ['昨日涨停竞价', <span key="a" className={tone(s.auction.avgOpen)}>{pct(s.auction.avgOpen)}</span>, `高开 ${s.auction.highOpen} · 低开 ${s.auction.lowOpen}`],
  ]
  return (
    <section className="kd-summary" aria-label="打板总览">
      {cells.map(([k, v, sub, cls]) => (
        <div key={k} className="kd-summary__cell">
          <span className="kd-summary__label">{k}</span>
          <strong className={`kd-summary__value ${cls ?? ''}`}>{v}</strong>
          <span className="kd-summary__sub">{sub}</span>
        </div>
      ))}
    </section>
  )
}

/* ---------- 打板列表（Segmented 切换） ---------- */
const VIEWS = [
  { id: 'auction', label: '竞价' }, { id: 'zt', label: '涨停' }, { id: 'zb', label: '炸板' }, { id: 'dt', label: '跌停' },
  { id: 'new', label: '新股' }, { id: 'natural', label: '自然涨停' }, { id: 'touched', label: '曾跌停' },
] as const
type View = (typeof VIEWS)[number]['id']

function Lists({ d }: { d: Data }): JSX.Element {
  const [view, setView] = useState<View>('zt')
  const counts: Record<View, number> = { auction: d.auction.length, zt: d.zt.length, zb: d.zb.length, dt: d.dt.length, new: d.newStocks.length, natural: d.zt.filter(r => r.natural).length, touched: d.touched.length }
  const body: Record<View, [React.ReactNode, string]> = {
    auction: [<StockTable key="a" label="竞价：昨日涨停股今日开盘" rows={d.auction} cols={AUCTION_COLS} initial={{ key: 'open', dir: 'desc' }} empty="昨日没有涨停股记录" />, METHOD.auction],
    zt: [<StockTable key="z" label="涨停个股" rows={d.zt} cols={ZT_COLS} initial={{ key: 'boards', dir: 'desc' }} />, METHOD.zt],
    zb: [<StockTable key="b" label="炸板个股" rows={d.zb} cols={ZB_COLS} initial={{ key: 'first', dir: 'asc' }} />, METHOD.zb],
    dt: [<StockTable key="d" label="跌停个股" rows={d.dt} cols={DT_COLS} initial={{ key: 'days', dir: 'desc' }} />, METHOD.dt],
    new: [<StockTable key="n" label="新股" rows={d.newStocks} cols={NEW_COLS} initial={{ key: 'list', dir: 'desc' }} />, METHOD.newStocks],
    natural: [<StockTable key="r" label="自然涨停个股" rows={d.zt.filter(r => r.natural)} cols={ZT_COLS} initial={{ key: 'first', dir: 'asc' }} />, METHOD.natural],
    touched: [<StockTable key="t" label="曾跌停个股" rows={d.touched} cols={TOUCHED_COLS} initial={{ key: 'rebound', dir: 'desc' }} />, METHOD.touched],
  }
  return (
    <Card title="打板" as="section" className="mm-card">
      <Segmented items={VIEWS.map(v => ({ id: v.id, label: `${v.label} ${counts[v.id]}` }))} value={view} onChange={setView} label="打板分类" />
      <div className="kd-list">{body[view][0]}</div>
      <p className="mm-method">{body[view][1]} 点表头可排序。</p>
      <p className="mm-method">{METHOD.skipped} <Link to="/market-mood">去市场情绪页</Link></p>
    </Card>
  )
}

/* ---------- 溢价基因 ---------- */
function Genes({ d }: { d: Data }): JSX.Element {
  const w = d.gene
  const window = w.from && w.to ? `样本窗口 ${w.from} 至 ${w.to}，共 ${w.days} 个交易日有记录` : '暂无样本'
  const full = w.fullFrom
    ? `其中 ${w.fullFrom} 起的 ${w.fullDays} 天有炸板名单和次日表现；此前的日子只有每日复盘归档里的涨停名单，只计入涨停次数与连板率。`
    : '暂无带炸板名单和次日表现的记录。'
  return (
    <Card title="个股溢价基因" as="section" className="mm-card" description={`今日涨停股在历史上的涨停次数与次日表现。${window}。`}>
      <StockTable label="溢价基因" rows={d.zt} cols={GENE_COLS} initial={{ key: 'zt', dir: 'desc' }} />
      <p className="mm-method">{full}样本少时比率波动很大，括号外是比率，小字是次数或分子 / 分母。</p>
      <p className="mm-method">{METHOD.gene}</p>
    </Card>
  )
}

/* ---------- 每日计数走势 ---------- */
const METRICS: Array<{ id: string; label: string; pick: (h: HistoryDay) => number | null; format: (v: number) => string; method: string }> = [
  { id: 'zt', label: '涨停', pick: h => h.zt, format: v => v.toFixed(0), method: '每日涨停家数（含 ST）。浅色虚线段为每日复盘归档补出的日子。' },
  { id: 'zb', label: '炸板', pick: h => h.zb, format: v => v.toFixed(0), method: '每日炸板家数，从本页开始采集之日起累计。' },
  { id: 'seal', label: '封板率', pick: h => h.sealRate, format: v => `${v.toFixed(0)}%`, method: '封板率 = 涨停 ÷（涨停 + 炸板）。' },
  { id: 'dt', label: '跌停', pick: h => h.dt, format: v => v.toFixed(0), method: '每日跌停家数，从本页开始采集之日起累计。' },
  { id: 'natural', label: '自然涨停', pick: h => h.natural, format: v => v.toFixed(0), method: METHOD.natural },
  { id: 'touched', label: '曾跌停', pick: h => h.touched, format: v => v.toFixed(0), method: METHOD.touched },
  { id: 'auction', label: '竞价平均', pick: h => h.auctionAvg, format: v => `${v.toFixed(1)}%`, method: '昨日涨停股今日开盘涨幅的平均值。' },
]
function Trend({ d }: { d: Data }): JSX.Element {
  const [id, setId] = useState('zt')
  const m = METRICS.find(x => x.id === id) ?? METRICS[0]
  return (
    <Card title="每日走势" as="section" className="mm-card">
      <Segmented items={METRICS.map(x => ({ id: x.id, label: x.label }))} value={id} onChange={setId} label="走势指标" />
      <MoodChart points={d.history.map(h => ({ date: h.date, value: m.pick(h), muted: !!h.seeded }))} label={`${m.label}走势`} format={m.format} zeroBase />
      <p className="mm-method">{m.method}</p>
    </Card>
  )
}

export default function KplDaban(): JSX.Element {
  const load = useDaban()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 打板</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'missing' && <EmptyState title="打板数据尚未生成">交易日收盘后（北京 15:10 之后）首次运行数据脚本，这里就会显示当日涨停、炸板、跌停等列表。</EmptyState>}
      {load.state === 'error' && <EmptyState title="打板数据暂不可用">{load.message}</EmptyState>}
      {load.state === 'ok' && <DabanBody d={load.data} />}
    </Page>
  )
}

function DabanBody({ d }: { d: Data }): JSX.Element {
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.asOf]} note="收盘后更新" />
      <Summary d={d} />
      <Lists d={d} />
      <Genes d={d} />
      <Trend d={d} />
      <Callout title="口径与来源">
        <p>{d.note}</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。另见 <Link to="/market-mood">市场情绪</Link>、<Link to="/limit-up-analysis">涨停板块</Link>。</p>
      </Callout>
    </>
  )
}
