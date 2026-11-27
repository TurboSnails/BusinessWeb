// 开盘啦 · 竞价尾盘（/market-mood/auction）：功能对照开盘啦 App「早盘竞价 / 板块竞价 / 尾盘抢筹」。
// 只用收盘后的公开分钟线：09:30 首根 = 开盘集合竞价撮合，15:00 末根 = 收盘集合竞价撮合；L2 大单、竞价委托等拿不到的字段不做。
// 数据：public/data/kpl-auction.json（scripts/kpl-auction.mjs 收盘后生成）。盘后统计，不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, LoadError, Page, PageDataFreshness, Segmented } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import { asKplAuction, BUCKETS, METHOD, type Group, type HistoryDay, type IndexRow, type KplAuction as Data, type StockRow } from '../../features/kpl-auction/model'
import StockTable, { money, num, pct, tone, type Col } from '../../features/kpl-daban/StockTable'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/kpl-auction.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ok'; data: Data }

function useAuction(): Load & { retry: () => void } {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoad({ state: 'loading' }); setAttempt(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-auction.json`, { cache: 'no-cache', signal: controller.signal })
      .then(async r => {
        if (r.status === 404) { setLoad({ state: 'missing' }); return }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        // 静态托管在文件缺失时可能回退成 index.html（200 但不是 JSON），同样按「尚未生成」处理
        const body: unknown = await r.json().catch(() => undefined)
        if (body === undefined) { setLoad({ state: 'missing' }); return }
        const data = asKplAuction(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [attempt])
  return { ...load, retry }
}

const yiOf = (x: number | null | undefined): string => (x == null ? '—' : `${num(x / 1e8, 1)} 亿`)
const vsPrev = (today: number | null, prev: number | null): string => (today == null || prev == null || !prev ? '' : pct((today / prev - 1) * 100, 1))

/* ---------- 列 ---------- */
type Row = StockRow | IndexRow
const col = {
  auctionPct: <T extends Row>(): Col<T> => ({ key: 'apct', label: '竞价涨幅', num: true, render: r => pct(r.auctionPct), sort: r => r.auctionPct, cls: r => tone(r.auctionPct) }),
  auctionAmount: <T extends Row>(): Col<T> => ({ key: 'aamt', label: '竞价金额', num: true, render: r => money(r.auctionAmount), sort: r => r.auctionAmount }),
  ratio: <T extends Row>(): Col<T> => ({ key: 'ratio', label: '竞价量比', num: true, render: r => (r.auctionRatio == null ? '—' : `${num(r.auctionRatio, 2)} 倍`), sort: r => r.auctionRatio }),
  share: <T extends Row>(): Col<T> => ({ key: 'share', label: '竞价占比', num: true, render: r => pct(r.auctionShare, 2, false), sort: r => r.auctionShare }),
  closePct: <T extends Row>(): Col<T> => ({ key: 'cpct', label: '收盘涨幅', num: true, render: r => pct(r.closePct), sort: r => r.closePct, cls: r => tone(r.closePct) }),
  after: <T extends Row>(): Col<T> => ({ key: 'after', label: '收盘较竞价', num: true, render: r => pct(r.afterAuctionPct), sort: r => r.afterAuctionPct, cls: r => tone(r.afterAuctionPct) }),
  dayAmount: <T extends Row>(): Col<T> => ({ key: 'day', label: '全天成交额', num: true, render: r => money(r.dayAmount), sort: r => r.dayAmount }),
  tailPct: <T extends Row>(): Col<T> => ({ key: 'tpct', label: '尾盘竞价涨幅', num: true, render: r => pct(r.closeAuctionPct), sort: r => r.closeAuctionPct, cls: r => tone(r.closeAuctionPct) }),
  tailAmount: <T extends Row>(): Col<T> => ({ key: 'tamt', label: '尾盘竞价金额', num: true, render: r => money(r.closeAuctionAmount), sort: r => r.closeAuctionAmount }),
  tailShare: <T extends Row>(): Col<T> => ({ key: 'tshare', label: '尾盘占比', num: true, render: r => pct(r.closeAuctionShare, 2, false), sort: r => r.closeAuctionShare }),
}
const TAG_LABEL: Record<string, string> = { yzt: '昨涨停', zt: '今涨停' }
const tagCell = (r: StockRow): React.ReactNode => {
  const tags = r.tags.filter(t => TAG_LABEL[t])
  if (!tags.length) return ''
  return tags.map(t => <span key={t} className={`kd-tag${t === 'zt' ? ' is-strong' : ''}`}>{t === 'yzt' && r.yBoards && r.yBoards > 1 ? `昨${r.yBoards}连板` : TAG_LABEL[t]}</span>)
}
const industry: Col<StockRow> = { key: 'ind', label: '行业', render: r => r.industry || '—', sort: r => r.industry || null }
const tagsCol: Col<StockRow> = { key: 'tags', label: '标记', render: tagCell }

const AUCTION_COLS: Array<Col<StockRow>> = [col.auctionPct(), col.auctionAmount(), col.ratio(), col.share(), col.after(), col.closePct(), industry, tagsCol]
const TAIL_COLS: Array<Col<StockRow>> = [col.tailPct(), col.tailAmount(), col.tailShare(), col.closePct(), col.dayAmount(), industry, tagsCol]
const INDEX_COLS: Array<Col<IndexRow>> = [col.auctionPct(), col.auctionAmount(), col.ratio(), col.share(), col.after(), col.closePct(), col.tailPct(), col.tailAmount()]
const BOARD_COLS: Array<Col<IndexRow>> = [col.auctionPct(), col.auctionAmount(), col.ratio(), col.share(), col.after(), col.closePct(), col.tailPct(), col.tailAmount()]

/* ---------- 顶部总览 ---------- */
function Summary({ d }: { d: Data }): JSX.Element {
  const m = d.market, top = d.groups.top, yzt = d.groups.yzt
  const cells: Array<[string, React.ReactNode, React.ReactNode, string?]> = [
    ['两市竞价金额', yiOf(m.auctionAmount), `昨 ${yiOf(m.prevAuctionAmount)} ${vsPrev(m.auctionAmount, m.prevAuctionAmount)}`],
    ['竞价占全天', pct(m.auctionShare, 2, false), `全天 ${yiOf(m.dayAmount)}`],
    ['尾盘竞价金额', yiOf(m.closeAuctionAmount), `昨 ${yiOf(m.prevCloseAuctionAmount)} ${vsPrev(m.closeAuctionAmount, m.prevCloseAuctionAmount)}`],
    ['前列股高开率', pct(top.highOpenRate, 1, false), `高开 ${top.highOpen} · 低开 ${top.lowOpen} · 平 ${top.flat}`],
    ['平均竞价涨幅', <span key="a" className={tone(top.avgAuctionPct)}>{pct(top.avgAuctionPct)}</span>, <>收盘较竞价 <span className={tone(top.avgAfterAuction)}>{pct(top.avgAfterAuction)}</span></>],
    ['昨日涨停竞价', <span key="y" className={tone(yzt.avgAuctionPct)}>{pct(yzt.avgAuctionPct)}</span>, yzt.n ? `${yzt.n} 只 · 高开 ${yzt.highOpen}` : '无记录'],
  ]
  return (
    <section className="kd-summary" aria-label="竞价总览">
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

/* ---------- 竞价高开 / 低开分布 ---------- */
const GROUPS = [
  { id: 'top', label: '成交额前列' }, { id: 'yzt', label: '昨日涨停' }, { id: 'zt', label: '今日涨停' }, { id: 'all', label: '全部候选' },
] as const
type GroupId = (typeof GROUPS)[number]['id']
function Distribution({ d }: { d: Data }): JSX.Element {
  const [id, setId] = useState<GroupId>('top')
  const g: Group = d.groups[id]
  const max = Math.max(1, ...BUCKETS.map(b => g.buckets[b.key] ?? 0))
  return (
    <Card title="竞价高开 / 低开分布" as="section" className="mm-card" description={`共 ${g.n} 只有竞价成交；高开率 ${pct(g.highOpenRate, 1, false)}，平均竞价涨幅 ${pct(g.avgAuctionPct)}，收盘较竞价平均 ${pct(g.avgAfterAuction)}。`}>
      <Segmented items={GROUPS.map(x => ({ id: x.id, label: x.label }))} value={id} onChange={setId} label="分布范围" />
      <ul className="mm-buckets ka-buckets" aria-label="竞价涨幅分布">
        {BUCKETS.map(b => {
          const n = g.buckets[b.key] ?? 0
          const h = Math.max((n / max) * 100, n ? 2 : 0)
          return (
            <li key={b.key}>
              <span className="mm-buckets__n">{n}</span>
              <svg className="mm-buckets__col" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">
                <rect className={b.up === null ? 'is-flat' : b.up ? 'is-up' : 'is-down'} x="0" y={100 - h} width="10" height={h} rx="1.5" />
              </svg>
              <span className="mm-buckets__label">{b.label}</span>
            </li>
          )
        })}
      </ul>
      <p className="mm-method">{METHOD.universe}</p>
    </Card>
  )
}

/* ---------- 早盘竞价个股 ---------- */
const LIST_LIMIT = 100
const VIEWS = [
  { id: 'amount', label: '竞价金额榜' }, { id: 'up', label: '竞价涨幅榜' }, { id: 'ratio', label: '竞价爆量' }, { id: 'yzt', label: '昨日涨停' }, { id: 'zt', label: '今日涨停' },
] as const
type View = (typeof VIEWS)[number]['id']
const by = <T,>(rows: T[], get: (r: T) => number | null, n = LIST_LIMIT): T[] => rows.filter(r => get(r) != null).sort((a, b) => (get(b) as number) - (get(a) as number)).slice(0, n)

function Morning({ d }: { d: Data }): JSX.Element {
  const [view, setView] = useState<View>('amount')
  const lists = useMemo<Record<View, { rows: StockRow[]; sort: string }>>(() => ({
    amount: { rows: by(d.stocks, r => r.auctionAmount), sort: 'aamt' },
    up: { rows: by(d.stocks, r => r.auctionPct), sort: 'apct' },
    ratio: { rows: by(d.stocks.filter(r => (r.auctionAmount ?? 0) >= 1e7), r => r.auctionRatio), sort: 'ratio' },
    yzt: { rows: d.stocks.filter(r => r.tags.includes('yzt')), sort: 'apct' },
    zt: { rows: d.stocks.filter(r => r.tags.includes('zt')), sort: 'apct' },
  }), [d.stocks])
  const cur = lists[view]
  const label = VIEWS.find(v => v.id === view)?.label ?? ''
  return (
    <Card title="早盘竞价复盘" as="section" className="mm-card">
      <Segmented items={VIEWS.map(v => ({ id: v.id, label: v.label }))} value={view} onChange={setView} label="竞价榜单" />
      <div className="kd-list"><StockTable key={view} label={label} rows={cur.rows} cols={AUCTION_COLS} initial={{ key: cur.sort, dir: 'desc' }} empty="今日暂无" /></div>
      <p className="mm-method">{METHOD.auction} 榜单各取前 {LIST_LIMIT}；「竞价爆量」只看竞价金额 ≥ 1000 万的股票。{METHOD.ratio}</p>
    </Card>
  )
}

/* ---------- 指数与板块竞价 ---------- */
function Indexes({ d }: { d: Data }): JSX.Element {
  return (
    <Card title="指数竞价" as="section" className="mm-card" description={`上证 ${yiOf(d.market.shAuction)} · 深证 ${yiOf(d.market.szAuction)}（开盘竞价）；上证 ${yiOf(d.market.shCloseAuction)} · 深证 ${yiOf(d.market.szCloseAuction)}（尾盘竞价）`}>
      <StockTable label="指数竞价" rows={d.indexes} cols={INDEX_COLS} empty="暂无指数数据" />
      <p className="mm-method">{METHOD.market}</p>
    </Card>
  )
}

const KINDS = [{ id: 'industry', label: '行业' }, { id: 'concept', label: '概念' }] as const
const MINS = [{ id: '0', label: '全部' }, { id: '1', label: '竞价 ≥ 1 亿' }, { id: '3', label: '≥ 3 亿' }, { id: '8', label: '≥ 8 亿' }] as const
function Boards({ d }: { d: Data }): JSX.Element {
  const [kind, setKind] = useState<'industry' | 'concept'>('industry')
  const [min, setMin] = useState<(typeof MINS)[number]['id']>('0')
  const rows = d.boards.filter(b => b.kind === kind && (b.auctionAmount ?? 0) >= Number(min) * 1e8)
  if (!d.boards.length) {
    return <Card title="板块竞价" as="section" className="mm-card"><p className="mm-empty">本次没有拿到完整的板块分时，暂不显示。</p></Card>
  }
  return (
    <Card title="板块竞价" as="section" className="mm-card">
      <div className="ka-controls">
        <Segmented items={KINDS.map(k => ({ id: k.id, label: k.label }))} value={kind} onChange={setKind} label="板块类型" />
        <Segmented items={MINS.map(k => ({ id: k.id, label: k.label }))} value={min} onChange={setMin} label="竞价金额门槛" />
      </div>
      <div className="kd-list"><StockTable key={kind} label={`${kind === 'industry' ? '行业' : '概念'}竞价`} rows={rows} cols={BOARD_COLS} initial={{ key: 'apct', dir: 'desc' }} empty="没有符合门槛的板块" /></div>
      <p className="mm-method">{METHOD.boards} 竞价量比 = 板块今日竞价金额 ÷ 上一交易日竞价金额。点表头可排序。</p>
    </Card>
  )
}

/* ---------- 尾盘竞价 ---------- */
const TAILS = [{ id: 'up', label: '尾盘拉升' }, { id: 'down', label: '尾盘砸盘' }, { id: 'amount', label: '尾盘竞价金额' }, { id: 'share', label: '尾盘占比' }] as const
type Tail = (typeof TAILS)[number]['id']
function Closing({ d }: { d: Data }): JSX.Element {
  const [view, setView] = useState<Tail>('up')
  const lists = useMemo<Record<Tail, { rows: StockRow[]; sort: string; dir: 'asc' | 'desc' }>>(() => ({
    up: { rows: by(d.stocks.filter(r => (r.closeAuctionPct ?? 0) > 0), r => r.closeAuctionPct, 50), sort: 'tpct', dir: 'desc' },
    down: { rows: by(d.stocks.filter(r => (r.closeAuctionPct ?? 0) < 0), r => (r.closeAuctionPct == null ? null : -r.closeAuctionPct), 50), sort: 'tpct', dir: 'asc' },
    amount: { rows: by(d.stocks, r => r.closeAuctionAmount, 50), sort: 'tamt', dir: 'desc' },
    share: { rows: by(d.stocks, r => r.closeAuctionShare, 50), sort: 'tshare', dir: 'desc' },
  }), [d.stocks])
  const cur = lists[view]
  const label = TAILS.find(v => v.id === view)?.label ?? ''
  return (
    <Card title="尾盘集合竞价" as="section" className="mm-card" description={`两市尾盘竞价 ${yiOf(d.market.closeAuctionAmount)}，占全天 ${pct(d.market.closeAuctionShare, 2, false)}。`}>
      <Segmented items={TAILS.map(v => ({ id: v.id, label: v.label }))} value={view} onChange={setView} label="尾盘榜单" />
      <div className="kd-list"><StockTable key={view} label={label} rows={cur.rows} cols={TAIL_COLS} initial={{ key: cur.sort, dir: cur.dir }} empty="今日暂无" /></div>
      <p className="mm-method">{METHOD.close} 各榜取前 50。</p>
    </Card>
  )
}

/* ---------- 历史走势 ---------- */
const METRICS: Array<{ id: string; label: string; pick: (h: HistoryDay) => number | null; format: (v: number) => string; kind?: 'bar'; zero?: boolean; colorBy?: 'sign'; method: string }> = [
  { id: 'amount', label: '竞价金额', pick: h => h.auctionAmount, format: v => `${v.toFixed(0)} 亿`, kind: 'bar', method: '两市开盘竞价金额（亿元），柱色按较前一日增减（红增绿减）。' },
  { id: 'share', label: '竞价占比', pick: h => h.auctionShare, format: v => `${v.toFixed(2)}%`, method: '两市竞价金额 ÷ 两市全天成交额。' },
  { id: 'tail', label: '尾盘竞价金额', pick: h => h.closeAuctionAmount, format: v => `${v.toFixed(0)} 亿`, kind: 'bar', method: '两市收盘集合竞价金额（亿元）。' },
  { id: 'high', label: '高开率', pick: h => h.highOpenRate, format: v => `${v.toFixed(1)}%`, zero: true, method: '成交额前 400 股票中竞价高开（竞价涨幅 > 0）的比例。' },
  { id: 'avg', label: '平均竞价涨幅', pick: h => h.avgAuctionPct, format: v => `${v.toFixed(2)}%`, kind: 'bar', colorBy: 'sign', method: '成交额前 400 股票竞价涨幅的平均值。' },
  { id: 'yzt', label: '昨日涨停竞价', pick: h => h.yztAvgAuction, format: v => `${v.toFixed(2)}%`, kind: 'bar', colorBy: 'sign', method: '昨日涨停股今日竞价涨幅的平均值（东财昨日涨停池）。' },
]
function Trend({ d }: { d: Data }): JSX.Element {
  const [id, setId] = useState('amount')
  const m = METRICS.find(x => x.id === id) ?? METRICS[0]
  return (
    <Card title="每日走势" as="section" className="mm-card">
      <Segmented items={METRICS.map(x => ({ id: x.id, label: x.label }))} value={id} onChange={setId} label="走势指标" />
      <MoodChart points={d.history.map(h => ({ date: h.date, value: m.pick(h), muted: !!h.backfilled }))} label={`${m.label}走势`} format={m.format} kind={m.kind} zeroBase={m.zero} colorBy={m.colorBy} />
      <p className="mm-method">{m.method} {METHOD.history}</p>
    </Card>
  )
}

export default function KplAuction(): JSX.Element {
  const load = useAuction()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 竞价尾盘</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'missing' && <EmptyState title="竞价尾盘数据尚未生成">交易日收盘后（北京 15:10 之后）运行数据脚本，这里就会显示当日早盘竞价、板块竞价和尾盘集合竞价。</EmptyState>}
      {load.state === 'error' && (
        <LoadError reason="竞价尾盘这份读数现在拿不到。" detail={load.message} onRetry={load.retry} />
      )}
      {load.state === 'ok' && <AuctionBody d={load.data} />}
    </Page>
  )
}

function AuctionBody({ d }: { d: Data }): JSX.Element {
  const u = d.universe
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.asOf]} note="收盘后更新" />
      <Summary d={d} />
      <Morning d={d} />
      <Distribution d={d} />
      <Indexes d={d} />
      <Boards d={d} />
      <Closing d={d} />
      <Trend d={d} />
      <Callout title="口径与来源">
        <p>{d.note}</p>
        <p>{METHOD.source}</p>
        <p>本次个股样本 {u.used} 只（候选 {u.candidates}，成交额前 {u.topN}{u.pools ? `、当日涨停 ${u.zt}、昨日涨停 ${u.yzt}` : '；涨停池未取到'}）{u.failed || u.stale ? `，${u.failed + u.stale} 只因分时缺失或停牌未计入` : ''}。</p>
        <p>{METHOD.skipped}</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。另见 <Link to="/market-mood/daban">打板</Link>、<Link to="/market-mood/plates">板块题材</Link>。</p>
      </Callout>
    </>
  )
}
