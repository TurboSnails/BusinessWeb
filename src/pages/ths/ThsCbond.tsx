// 同花顺 · 可转债（/ths-mood/cbond）：对照同花顺 App 可转债专区（转债全景、选债、套利机会、打新债与抢权配债），用东财公开数据在收盘后重做。
// 数据：public/data/ths-tab-cbond.json（scripts/ths-cbond.mjs 生成）。盘后统计，不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import ThsTabs, { THS_DISCLAIMER } from '../../features/ths-tabs/ThsTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import StockTable, { num, pct, tone, type Col } from '../../features/kpl-daban/StockTable'
import {
  applyFilter, asThsCbond, FILTERS, METHOD, type Bin, type BondRow, type CallRow, type DiscountRow, type DownRow, type FilterId, type HistoryDay,
  type IssueRow, type MaturityRow, type ThsCbond as Data,
} from '../../features/ths-cbond/model'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/ths-cbond.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ok'; data: Data }

function useCbond(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/ths-tab-cbond.json`, { cache: 'no-cache', signal: controller.signal })
      .then(async r => {
        if (r.status === 404) { setLoad({ state: 'missing' }); return }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        // 静态托管在文件缺失时可能回退成 index.html（200 但不是 JSON），同样按「尚未生成」处理
        const body: unknown = await r.json().catch(() => undefined)
        if (body === undefined) { setLoad({ state: 'missing' }); return }
        const data = asThsCbond(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [])
  return load
}

/* ---------- 格式 ---------- */
const yi = (x: number | null | undefined): string => (x == null ? '—' : `${num(x / 1e8, 2)} 亿`)
const dateOr = (x: string | null | undefined): string => x ?? '—'
const days = (hit: number | null, need: number | null, calc: number | null): string => (hit == null ? '—' : `${hit} / ${need ?? '—'}${calc ? `（${calc} 日内）` : ''}`)

/* ---------- 全景 ---------- */
function Overview({ d }: { d: Data }): JSX.Element {
  const s = d.summary
  const cells: Array<[string, React.ReactNode, React.ReactNode, string?]> = [
    ['中证转债指数', num(d.index.close, 2), <span key="i" className={tone(d.index.pct)}>{pct(d.index.pct)}</span>],
    ['转债数量', s.count, `上涨 ${s.up} · 下跌 ${s.down} · 平 ${s.flat}`],
    ['价格中位数', num(s.medianPrice, 2), `平均价格 ${num(s.avgPrice, 2)}`],
    ['平均转股溢价率', pct(s.avgPremium, 2, false), `中位数 ${pct(s.medianPremium, 2, false)}`],
    ['折价转股', d.discount.length, '溢价率 < 0 且在转股期'],
    ['低价（<100）', s.priceBins[0]?.n ?? '—', '收盘价低于面值'],
  ]
  return (
    <section className="kd-summary" aria-label="转债全景">
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

function Histogram({ bins, label, kind }: { bins: Bin[]; label: string; kind: 'neutral' | 'pct' }): JSX.Element {
  const max = Math.max(1, ...bins.map(b => b.n))
  const cls = (b: Bin): string => (kind === 'neutral' ? 'is-neutral' : b.label === '0%' ? 'is-flat' : b.label.includes('−') ? 'is-down' : 'is-up')
  return (
    <ul className={`cb-hist cb-hist--${bins.length}`} aria-label={label}>
      {bins.map(b => {
        const h = Math.max((b.n / max) * 100, b.n ? 2 : 0)
        return (
          <li key={b.label}>
            <span className="cb-hist__n">{b.n}</span>
            <svg className="cb-hist__col" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">
              <rect className={cls(b)} x="0" y={100 - h} width="10" height={h} rx="1.5" />
            </svg>
            <span className="cb-hist__label">{b.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

const DISTS = [{ id: 'price', label: '价格分布' }, { id: 'premium', label: '溢价率分布' }, { id: 'pct', label: '涨跌分布' }] as const
type DistId = (typeof DISTS)[number]['id']
function Distribution({ d }: { d: Data }): JSX.Element {
  const [id, setId] = useState<DistId>('price')
  const s = d.summary
  const body: Record<DistId, React.ReactNode> = {
    price: <Histogram bins={s.priceBins} label="价格分布" kind="neutral" />,
    premium: <Histogram bins={s.premiumBins} label="转股溢价率分布" kind="neutral" />,
    pct: <Histogram bins={s.pctBins} label="涨跌幅分布" kind="pct" />,
  }
  return (
    <Card title="分布" as="section" className="mm-card" description={`${d.asOf} 收盘，${s.count} 只转债。`}>
      <Segmented items={DISTS.map(x => ({ ...x }))} value={id} onChange={setId} label="分布类型" />
      <div className="cb-block">{body[id]}</div>
      <p className="mm-method">{METHOD.universe} {METHOD.overview}</p>
    </Card>
  )
}

type Metric = { id: string; label: string; points: (d: Data) => Array<{ date: string; value: number | null; muted?: boolean }>; format: (v: number) => string; note: string }
const fromHistory = (pick: (h: HistoryDay) => number | null) => (d: Data) => d.history.map(h => ({ date: h.date, value: pick(h), muted: !!h.backfilled }))
const METRICS: Metric[] = [
  { id: 'index', label: '中证转债指数', points: d => d.indexHistory.map(k => ({ date: k.date, value: k.close })), format: v => v.toFixed(0), note: '中证转债指数（000832）日收盘点位。' },
  { id: 'median', label: '价格中位数', points: fromHistory(h => h.medianPrice), format: v => v.toFixed(0), note: '每日全部存续转债收盘价的中位数。浅色虚线段为按东财逐日估值表回补的日子。' },
  { id: 'avgPremium', label: '平均溢价率', points: fromHistory(h => h.avgPremium), format: v => `${v.toFixed(0)}%`, note: '每日全部存续转债转股溢价率的等权平均。' },
  { id: 'medianPremium', label: '中位溢价率', points: fromHistory(h => h.medianPremium), format: v => `${v.toFixed(0)}%`, note: '每日转股溢价率的中位数，受极端值影响比平均数小。' },
  { id: 'count', label: '转债数量', points: fromHistory(h => h.count), format: v => v.toFixed(0), note: '每日存续（已上市、未退市、未到期）的公开发行转债只数。' },
]
function Trend({ d }: { d: Data }): JSX.Element {
  const [id, setId] = useState('index')
  const m = METRICS.find(x => x.id === id) ?? METRICS[0]
  return (
    <Card title="全景走势" as="section" className="mm-card">
      <Segmented items={METRICS.map(x => ({ id: x.id, label: x.label }))} value={id} onChange={setId} label="走势指标" />
      <MoodChart points={m.points(d)} label={`${m.label}走势`} format={m.format} />
      <p className="mm-method">{m.note} {METHOD.history}</p>
    </Card>
  )
}

/* ---------- 选债表 ---------- */
const BOND_COLS: Array<Col<BondRow>> = [
  { key: 'price', label: '现价', num: true, render: r => num(r.price, 3), sort: r => r.price },
  { key: 'pct', label: '涨跌幅', num: true, render: r => pct(r.pct), sort: r => r.pct, cls: r => tone(r.pct) },
  { key: 'stock', label: '正股', render: r => <>{r.stockName || '—'}<small>{r.stockCode}</small></>, sort: r => r.stockName || null },
  { key: 'stockPct', label: '正股涨跌', num: true, render: r => pct(r.stockPct), sort: r => r.stockPct, cls: r => tone(r.stockPct) },
  { key: 'convPrice', label: '转股价', num: true, render: r => num(r.convPrice, 2), sort: r => r.convPrice },
  { key: 'convValue', label: '转股价值', num: true, render: r => num(r.convValue, 2), sort: r => r.convValue },
  { key: 'premium', label: '转股溢价率', num: true, render: r => pct(r.premium, 2, false), sort: r => r.premium },
  { key: 'bondValue', label: '纯债价值', num: true, render: r => num(r.bondValue, 2), sort: r => r.bondValue },
  { key: 'ytm', label: '到期税前收益率', num: true, render: r => pct(r.ytm, 2, false), sort: r => r.ytm },
  { key: 'remain', label: '剩余规模', num: true, render: r => yi(r.remain), sort: r => r.remain },
  { key: 'years', label: '剩余年限', num: true, render: r => (r.years == null ? '—' : `${num(r.years, 2)} 年`), sort: r => r.years },
  { key: 'rating', label: '评级', render: r => r.rating ?? '—', sort: r => r.rating },
  { key: 'dual', label: '双低', num: true, render: r => num(r.dualLow, 2), sort: r => r.dualLow },
  { key: 'trigger', label: '强赎触发价', num: true, render: r => num(r.redeemTrigger, 2), sort: r => r.redeemTrigger },
]
function Screener({ d }: { d: Data }): JSX.Element {
  const [f, setF] = useState<FilterId>('all')
  const rows = useMemo(() => applyFilter(d.rows, f), [d.rows, f])
  return (
    <Card title="选债" as="section" className="mm-card" description={`全部 ${d.rows.length} 只存续转债，点表头排序。`}>
      <Segmented items={FILTERS.map(x => ({ ...x }))} value={f} onChange={setF} label="选债筛选" />
      <div className="kd-list">
        <StockTable key={f} label="选债表" rows={rows} cols={BOND_COLS} initial={f === 'dual' || f === 'all' ? { key: 'dual', dir: 'asc' } : { key: 'premium', dir: 'asc' }} empty="没有符合条件的转债" />
      </div>
      <p className="mm-method">共 {rows.length} 只。{METHOD.dualLow}</p>
      <p className="mm-method">{METHOD.ytm} {METHOD.remain}</p>
    </Card>
  )
}

/* ---------- 套利与条款 ---------- */
const CALL_STATUS: Record<CallRow['status'], string> = { announced: '已公告强赎', counting: '计数中', promised: '承诺不强赎' }
const DOWN_STATUS: Record<DownRow['status'], string> = { proposed: '董事会已提议', counting: '计数中', paused: '暂不下修' }
const tag = (text: string, strong = false): React.ReactNode => <span className={`kd-tag${strong ? ' is-strong' : ''}`}>{text}</span>

const DISCOUNT_COLS: Array<Col<DiscountRow>> = [
  { key: 'price', label: '现价', num: true, render: r => num(r.price, 3), sort: r => r.price },
  { key: 'convValue', label: '转股价值', num: true, render: r => num(r.convValue, 2), sort: r => r.convValue },
  { key: 'premium', label: '转股溢价率', num: true, render: r => pct(r.premium, 2, false), sort: r => r.premium },
  { key: 'gap', label: '每手理论价差', num: true, render: r => (r.gapPerLot == null ? '—' : `${num(r.gapPerLot, 1)} 元`), sort: r => r.gapPerLot },
  { key: 'stockPct', label: '正股涨跌', num: true, render: r => pct(r.stockPct), sort: r => r.stockPct, cls: r => tone(r.stockPct) },
  { key: 'remain', label: '剩余规模', num: true, render: r => yi(r.remain), sort: r => r.remain },
]
const CALL_COLS: Array<Col<CallRow>> = [
  { key: 'status', label: '状态', render: r => tag(CALL_STATUS[r.status], r.status === 'announced'), sort: r => r.status },
  { key: 'hit', label: '已满足天数', num: true, render: r => <>{days(r.hit, r.need, r.calc)}{r.partial ? <small>调整后计</small> : null}</>, sort: r => r.hit },
  { key: 'price', label: '现价', num: true, render: r => num(r.price, 3), sort: r => r.price },
  { key: 'stock', label: '正股价', num: true, render: r => num(r.stockPrice, 2), sort: r => r.stockPrice },
  { key: 'trigger', label: '强赎触发价', num: true, render: r => <>{num(r.trigger, 2)}<small>{r.ratio ? `${r.ratio}%` : ''}</small></>, sort: r => r.trigger },
  { key: 'em', label: '东财条款表', render: r => r.emText ?? '—' },
  { key: 'note', label: '说明', render: r => r.note || '—' },
  { key: 'remain', label: '剩余规模', num: true, render: r => yi(r.remain), sort: r => r.remain },
]
const DOWN_COLS: Array<Col<DownRow>> = [
  { key: 'status', label: '状态', render: r => tag(r.emText?.includes('已触发') && r.status === 'counting' ? '已触发' : DOWN_STATUS[r.status], r.status === 'proposed'), sort: r => r.status },
  { key: 'em', label: '天数（东财）', num: true, render: r => days(r.emHit, r.need, r.calc), sort: r => r.emHit },
  { key: 'hit', label: '本站机械计数', num: true, render: r => days(r.hit, r.need, null), sort: r => r.hit },
  { key: 'price', label: '现价', num: true, render: r => num(r.price, 3), sort: r => r.price },
  { key: 'stock', label: '正股价', num: true, render: r => num(r.stockPrice, 2), sort: r => r.stockPrice },
  { key: 'trigger', label: '下修触发价', num: true, render: r => <>{num(r.trigger, 2)}<small>{r.ratio ? `${r.ratio}%` : ''}</small></>, sort: r => r.trigger },
  { key: 'premium', label: '转股溢价率', num: true, render: r => pct(r.premium, 2, false), sort: r => r.premium },
  { key: 'note', label: '说明', render: r => r.note || r.emText || '—' },
  { key: 'remain', label: '剩余规模', num: true, render: r => yi(r.remain), sort: r => r.remain },
]
const MATURITY_COLS: Array<Col<MaturityRow>> = [
  { key: 'expire', label: '到期日', num: true, render: r => dateOr(r.expireDate), sort: r => r.expireDate },
  { key: 'years', label: '剩余年限', num: true, render: r => (r.years == null ? '—' : `${num(r.years, 2)} 年`), sort: r => r.years },
  { key: 'price', label: '现价', num: true, render: r => num(r.price, 3), sort: r => r.price },
  { key: 'redeem', label: '到期赎回价', num: true, render: r => num(r.expireRedeem, 2), sort: r => r.expireRedeem },
  { key: 'gap', label: '到期价差', num: true, render: r => num(r.redeemGap, 2), sort: r => r.redeemGap, cls: r => tone(r.redeemGap) },
  { key: 'ytm', label: '到期税前收益率', num: true, render: r => pct(r.ytm, 2, false), sort: r => r.ytm },
  { key: 'put', label: '回售', render: r => (r.inPut ? <>回售期内<small>{r.putHit == null ? '' : `连续 ${r.putHit} / ${r.putNeed ?? '—'} 日低于 ${num(r.putTrigger, 2)}`}</small></> : '—'), sort: r => (r.inPut ? r.putHit ?? 0 : null) },
  { key: 'remain', label: '剩余规模', num: true, render: r => yi(r.remain), sort: r => r.remain },
]

const ARBS = [{ id: 'discount', label: '折价转股' }, { id: 'call', label: '强赎进度' }, { id: 'down', label: '下修进度' }, { id: 'maturity', label: '到期与回售' }] as const
type ArbId = (typeof ARBS)[number]['id']
function Arbitrage({ d }: { d: Data }): JSX.Element {
  const [id, setId] = useState<ArbId>('discount')
  const counts: Record<ArbId, number> = { discount: d.discount.length, call: d.call.length, down: d.down.length, maturity: d.maturity.length }
  const chk = d.clauseCheck
  const clauseNote = chk.asOf
    ? `东财条款表已核对到 ${chk.asOf}（强赎天数 ${chk.agree} / ${chk.total} 只与本站自算一致）。`
    : `东财条款表未能核对到 ${d.asOf}（强赎天数 ${chk.agree} / ${chk.total} 只一致），状态与天数可能滞后一天。`
  const body: Record<ArbId, [React.ReactNode, string]> = {
    discount: [<StockTable key="d" label="折价转股" rows={d.discount} cols={DISCOUNT_COLS} initial={{ key: 'premium', dir: 'asc' }} empty="今日没有折价转债" />, METHOD.discount],
    call: [<StockTable key="c" label="强赎进度" rows={d.call} cols={CALL_COLS} empty="今日没有处在强赎计数中的转债" />, `${METHOD.call} ${clauseNote}`],
    down: [<StockTable key="w" label="下修进度" rows={d.down} cols={DOWN_COLS} empty="今日没有处在下修计数中的转债" />, `${METHOD.down} ${clauseNote}`],
    maturity: [<StockTable key="m" label="到期与回售" rows={d.maturity} cols={MATURITY_COLS} initial={{ key: 'years', dir: 'asc' }} empty="一年内没有到期或回售期内的转债" />, METHOD.maturity],
  }
  return (
    <Card title="套利与条款" as="section" className="mm-card" description="收盘后的条款统计，不是交易建议。">
      <Segmented items={ARBS.map(x => ({ id: x.id, label: `${x.label} ${counts[x.id]}` }))} value={id} onChange={setId} label="套利与条款分类" />
      <div className="kd-list">{body[id][0]}</div>
      <p className="mm-method">{body[id][1]}</p>
    </Card>
  )
}

/* ---------- 打新债与抢权配债 ---------- */
const ISSUE_COLS: Array<Col<IssueRow>> = [
  { key: 'apply', label: '申购日', num: true, render: r => <>{dateOr(r.applyDate)}<small>{r.applyCode ?? ''}</small></>, sort: r => r.applyDate },
  { key: 'stock', label: '正股', render: r => <>{r.stockName || '—'}<small>{r.stockCode}</small></> },
  { key: 'scale', label: '发行规模', num: true, render: r => (r.scale == null ? '—' : `${num(r.scale, 2)} 亿`), sort: r => r.scale },
  { key: 'rating', label: '评级', render: r => r.rating ?? '—' },
  { key: 'win', label: '中签率', num: true, render: r => (r.winRate == null ? '—' : `${num(r.winRate, 4)}%`), sort: r => r.winRate },
  { key: 'lot', label: '中签号发布', num: true, render: r => dateOr(r.lotDate), sort: r => r.lotDate },
  { key: 'list', label: '上市日', num: true, render: r => r.listDate ?? '未上市', sort: r => r.listDate },
  { key: 'first', label: '首日开 / 收', num: true, render: r => (r.firstClose == null ? '—' : `${num(r.firstOpen, 2)} / ${num(r.firstClose, 2)}`) },
  { key: 'firstPct', label: '首日涨幅', num: true, render: r => pct(r.firstPct), sort: r => r.firstPct, cls: r => tone(r.firstPct) },
  { key: 'profit', label: '每签收益', num: true, render: r => (r.profitPerLot == null ? '—' : `${num(r.profitPerLot, 1)} 元`), sort: r => r.profitPerLot },
]
const RIGHTS_COLS: Array<Col<IssueRow>> = [
  { key: 'record', label: '股权登记日', num: true, render: r => dateOr(r.recordDate), sort: r => r.recordDate },
  { key: 'apply', label: '申购日', num: true, render: r => dateOr(r.applyDate), sort: r => r.applyDate },
  { key: 'stock', label: '正股', render: r => <>{r.stockName || '—'}<small>{r.stockCode}</small></> },
  { key: 'ref', label: '正股收盘', num: true, render: r => <>{num(r.refPrice, 2)}<small>{r.refDate ?? ''}</small></>, sort: r => r.refPrice },
  { key: 'per', label: '每股配售额', num: true, render: r => (r.perShare == null ? '—' : `${num(r.perShare, 4)} 元`), sort: r => r.perShare },
  { key: 'r100', label: '百元股票含权', num: true, render: r => (r.rightsPer100 == null ? '—' : `${num(r.rightsPer100, 2)} 元`), sort: r => r.rightsPer100 },
  { key: 'min', label: '最低配售所需股数', num: true, render: r => (r.minShares == null ? '—' : `${r.minShares} 股`), sort: r => r.minShares },
  { key: 'scale', label: '发行规模', num: true, render: r => (r.scale == null ? '—' : `${num(r.scale, 2)} 亿`), sort: r => r.scale },
]
function Issues({ d }: { d: Data }): JSX.Element {
  return (
    <Card title="打新债日历" as="section" className="mm-card">
      <StockTable label="打新债" rows={d.issues} cols={ISSUE_COLS} initial={{ key: 'apply', dir: 'desc' }} empty="最近 45 天没有转债申购" />
      <p className="mm-method">{METHOD.issues}</p>
      <h3 className="cb-subtitle">抢权配债</h3>
      <StockTable label="抢权配债" rows={d.rights} cols={RIGHTS_COLS} initial={{ key: 'record', dir: 'asc' }} empty="目前没有股权登记日在今天或之后的已公告发行" />
      <p className="mm-method">{METHOD.rights}</p>
    </Card>
  )
}

export default function ThsCbond(): JSX.Element {
  const load = useCbond()
  return (
    <Page className="mm-page">
      <PageTitle>同花顺 · 可转债</PageTitle>
      <ThsTabs />
      <p className="mm-disclaimer">{THS_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'missing' && <EmptyState title="可转债数据尚未生成">交易日收盘后运行数据脚本，这里就会显示转债全景、选债表、条款进度与打新债日历。</EmptyState>}
      {load.state === 'error' && <EmptyState title="可转债数据暂不可用">{load.message}</EmptyState>}
      {load.state === 'ok' && <CbondBody d={load.data} />}
    </Page>
  )
}

function CbondBody({ d }: { d: Data }): JSX.Element {
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.asOf]} note={d.source === 'snapshot' ? '收盘后更新（当日逐日估值表未出，使用收盘行情快照）' : '收盘后更新'} />
      <Overview d={d} />
      <Distribution d={d} />
      <Trend d={d} />
      <Screener d={d} />
      <Arbitrage d={d} />
      <Issues d={d} />
      <Callout title="口径与来源">
        <p>{d.note}</p>
        <p>{METHOD.clause}</p>
        <p>{METHOD.skipped}</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。</p>
      </Callout>
    </>
  )
}
