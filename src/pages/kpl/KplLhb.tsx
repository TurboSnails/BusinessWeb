// 开盘啦 · 龙虎榜（/market-mood/lhb）：功能对照开盘啦 App 的龙虎榜——当日上榜个股（按个股或按上榜原因）、点开看买入/卖出前五席位、
// 机构专用席位净买排行、当日活跃营业部、近 20 日营业部排行与明细、近 20 日上榜次数最多的个股、上榜家数与机构净买走势。
// 数据：public/data/kpl-lhb.json（scripts/kpl-lhb.mjs 盘后生成，来源东方财富数据中心）。盘后统计，不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import { asKplLhb, METHOD, SEAT_TAG, type DeptRow, type KplLhb as Data, type LhbStock, type Reason, type Seat } from '../../features/kpl-lhb/model'
import '../../styles/market-mood.css'
import '../../styles/kpl-lhb.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: Data }

function useKplLhb(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-lhb.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => {
        const data = asKplLhb(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [])
  return load
}

// 格式：金额（元）→ 亿 / 万；真正的负号；红涨绿跌
const fin = (x: number | null | undefined): x is number => x != null && Number.isFinite(x)
const minus = (s: string): string => s.replace('-', '−')
const money = (x: number | null | undefined, signed = false): string => {
  if (!fin(x)) return '—'
  const a = Math.abs(x)
  const body = a >= 1e8 ? `${(a / 1e8).toFixed(2)} 亿` : `${Math.round(a / 1e4)} 万`
  return `${x < 0 ? '−' : signed && x > 0 ? '+' : ''}${body}`
}
const pct = (x: number | null | undefined, signed = true): string => (fin(x) ? `${signed && x > 0 ? '+' : ''}${minus(x.toFixed(2))}%` : '—')
const tone = (x: number | null | undefined): string => (!fin(x) || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
const md = (d: string): string => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const WinTag = ({ w }: { w: number }): JSX.Element | null => (w > 1 ? <span className="lhb-tag">{w}日</span> : null)

/* ---------- 顶部总览 ---------- */
function TopPanel({ d }: { d: Data }): JSX.Element {
  const l = d.latest
  return (
    <section className="lhb-top" aria-label="龙虎榜总览">
      <div className="lhb-top__cell">
        <span className="lhb-top__label">上榜个股</span>
        <strong className="lhb-top__value">{l.stockCount}</strong>
        <span className="lhb-top__sub">上榜记录 {l.entryCount} 条 · <b className="mm-up">涨 {l.up}</b> / <b className="mm-down">跌 {l.down}</b></span>
      </div>
      <div className="lhb-top__cell">
        <span className="lhb-top__label">龙虎榜净买额</span>
        <strong className={`lhb-top__value ${tone(l.totals.net)}`}>{money(l.totals.net, true)}</strong>
        <span className="lhb-top__sub">净买入 {l.netBuyCount} 只 · 净卖出 {l.netSellCount} 只</span>
      </div>
      <div className="lhb-top__cell">
        <span className="lhb-top__label">机构专用净买</span>
        <strong className={`lhb-top__value ${tone(l.inst.net)}`}>{money(l.inst.net, true)}</strong>
        <span className="lhb-top__sub">涉及 {l.inst.stocks} 只 · 买 {money(l.inst.buy)} / 卖 {money(l.inst.sell)}</span>
      </div>
      <div className="lhb-top__cell">
        <span className="lhb-top__label">北向（沪深股通专用）净买</span>
        <strong className={`lhb-top__value ${tone(l.hk.net)}`}>{money(l.hk.net, true)}</strong>
        <span className="lhb-top__sub">涉及 {l.hk.stocks} 只</span>
      </div>
    </section>
  )
}

/* ---------- 席位明细 ---------- */
function SeatTable({ title, seats }: { title: string; seats: Seat[] }): JSX.Element {
  return (
    <div className="lhb-seats__side">
      <p className="lhb-seats__title">{title}</p>
      {seats.length ? (
        <TableWrap label={`${title}席位`}>
          <table className="mm-table lhb-seat-table">
            <thead><tr><th>席位</th><th className="num">买入</th><th className="num">卖出</th><th className="num">净额</th></tr></thead>
            <tbody>
              {seats.map((s, i) => (
                <tr key={`${s.dept}-${s.name}-${i}`}>
                  <td>{s.name}{SEAT_TAG[s.kind] && <span className={`lhb-tag is-${s.kind}`}>{SEAT_TAG[s.kind]}</span>}</td>
                  <td className="num">{money(s.buy)}</td>
                  <td className="num">{money(s.sell)}</td>
                  <td className={`num ${tone(s.net)}`}>{money(s.net, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">无披露</p>}
    </div>
  )
}

function SeatDetail({ stock, initial }: { stock: LhbStock; initial?: string }): JSX.Element {
  const [id, setId] = useState(initial ?? stock.reasons[0]?.id ?? '')
  const r: Reason | undefined = stock.reasons.find(x => x.id === id) ?? stock.reasons[0]
  if (!r) return <p className="mm-empty">暂无席位明细</p>
  return (
    <div className="lhb-detail">
      {stock.reasons.length > 1 && (
        <Segmented items={stock.reasons.map((x, i) => ({ id: x.id, label: `原因 ${i + 1}${x.window > 1 ? `（${x.window}日）` : ''}` }))} value={r.id} onChange={setId} label={`${stock.name}上榜原因`} />
      )}
      <p className="lhb-detail__reason">{r.reason}<WinTag w={r.window} /></p>
      {r.byType && <p className="mm-method">按投资者类别披露（不是前五席位），各类别互相包含。</p>}
      <p className="lhb-detail__sum">买入 {money(r.buy)} · 卖出 {money(r.sell)} · 净额 <b className={tone(r.net)}>{money(r.net, true)}</b> · 成交占比 {pct(r.dealRatio, false)}</p>
      <div className="lhb-seats">
        <SeatTable title="买入前五" seats={r.buySeats} />
        <SeatTable title="卖出前五" seats={r.sellSeats} />
      </div>
    </div>
  )
}

/* ---------- 当日龙虎榜 ---------- */
const sortItems = [{ id: 'net', label: '净买额' }, { id: 'pct', label: '涨跌幅' }, { id: 'ratio', label: '成交占比' }, { id: 'inst', label: '机构净买' }] as const
type SortKey = (typeof sortItems)[number]['id']
const marketItems = [{ id: 'all', label: '全部' }, { id: 'sh', label: '沪' }, { id: 'sz', label: '深' }, { id: 'bj', label: '北' }] as const
type MarketKey = (typeof marketItems)[number]['id']
const pick: Record<SortKey, (s: LhbStock) => number | null> = { net: s => s.net, pct: s => s.pct, ratio: s => s.dealRatio, inst: s => s.instNet }
const PAGE = 30

function StockRows({ s, open, onToggle, initial, row }: {
  s: LhbStock; open: boolean; onToggle(): void; initial?: string
  row: { buy: number | null; sell: number | null; net: number | null; dealRatio: number | null; window: number; byType?: boolean }
}): JSX.Element {
  return (
    <>
      <tr className={open ? 'is-open' : undefined}>
        <td>
          <button type="button" className="lhb-name" aria-expanded={open} onClick={onToggle}>
            <span className="lhb-name__caret" aria-hidden="true">{open ? '▾' : '▸'}</span>{s.name}
          </button>
          <small>{s.code}</small><WinTag w={row.window} />{row.byType && <span className="lhb-tag">类别披露</span>}{s.reasons.length > 1 && <span className="lhb-tag">{s.reasons.length}条</span>}
        </td>
        <td className={`num ${tone(s.pct)}`}>{pct(s.pct)}</td>
        <td className={`num ${tone(row.net)}`}>{money(row.net, true)}</td>
        <td className="num">{money(row.buy)}</td>
        <td className="num">{money(row.sell)}</td>
        <td className="num">{pct(row.dealRatio, false)}</td>
        <td className={`num ${tone(s.instNet)}`}>{s.instBuyCount + s.instSellCount ? money(s.instNet, true) : '—'}</td>
      </tr>
      {open && <tr className="lhb-detail-row"><td colSpan={7}><SeatDetail stock={s} initial={initial} /></td></tr>}
    </>
  )
}

const Head = (): JSX.Element => (
  <thead><tr><th>股票</th><th className="num">涨跌幅</th><th className="num">净买额</th><th className="num">买入</th><th className="num">卖出</th><th className="num">成交占比</th><th className="num">机构净买</th></tr></thead>
)

function Billboard({ d }: { d: Data }): JSX.Element {
  const l = d.latest
  const [view, setView] = useState<'stock' | 'reason'>('stock')
  const [sort, setSort] = useState<SortKey>('net')
  const [market, setMarket] = useState<MarketKey>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const byCode = useMemo(() => new Map(l.stocks.map(s => [s.code, s])), [l.stocks])
  const list = useMemo(() => l.stocks.filter(s => market === 'all' || s.market === market)
    .sort((a, b) => (pick[sort](b) ?? -Infinity) - (pick[sort](a) ?? -Infinity)), [l.stocks, sort, market])
  const toggle = (key: string): void => setOpen(o => (o === key ? null : key))
  return (
    <Card title={`当日龙虎榜 · ${l.date}`} as="section" className="mm-card"
      actions={<Segmented items={[{ id: 'stock', label: '按个股' }, { id: 'reason', label: '按上榜原因' }]} value={view} onChange={setView} label="龙虎榜视图" />}>
      {view === 'stock' ? (
        <>
          <div className="lhb-filters">
            <Segmented items={sortItems.map(x => ({ ...x }))} value={sort} onChange={setSort} label="排序" />
            <Segmented items={marketItems.map(x => ({ ...x }))} value={market} onChange={setMarket} label="市场" />
          </div>
          {list.length ? (
            <TableWrap label="当日龙虎榜个股">
              <table className="mm-table lhb-table">
                <Head />
                <tbody>
                  {(all ? list : list.slice(0, PAGE)).map(s => <StockRows key={s.code} s={s} open={open === s.code} onToggle={() => toggle(s.code)} row={s} />)}
                </tbody>
              </table>
            </TableWrap>
          ) : <p className="mm-empty">该市场今日没有上榜个股</p>}
          {list.length > PAGE && <button type="button" className="lhb-more" onClick={() => setAll(x => !x)}>{all ? '收起' : `显示全部 ${list.length} 只`}</button>}
        </>
      ) : (
        <div className="lhb-groups">
          {l.reasons.map(g => (
            <section key={g.reason} className="lhb-group" aria-label={g.reason}>
              <p className="lhb-group__head"><b>{g.reason}</b><WinTag w={g.window} /> <small>{g.codes.length} 只</small></p>
              <TableWrap label={`${g.reason}个股`}>
                <table className="mm-table lhb-table">
                  <Head />
                  <tbody>
                    {g.codes.map(code => {
                      const s = byCode.get(code)
                      const r = s?.reasons.find(x => x.reason === g.reason)
                      if (!s || !r) return null
                      const key = `${g.reason}|${code}`
                      return <StockRows key={key} s={s} open={open === key} onToggle={() => toggle(key)} initial={r.id} row={r.byType ? { ...r, buy: null, sell: null, net: null, dealRatio: null } : r} />
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </section>
          ))}
        </div>
      )}
      <p className="mm-method">{METHOD.list} 点股票名称展开买入、卖出前五席位。{l.byTypeCount ? ` ${METHOD.byType}` : ''}</p>
    </Card>
  )
}

/* ---------- 机构专用净买排行 ---------- */
function InstCard({ d }: { d: Data }): JSX.Element {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const rows = d.latest.instRank.filter(r => fin(r.net) && (side === 'buy' ? r.net > 0 : r.net < 0))
    .sort((a, b) => (side === 'buy' ? (b.net ?? 0) - (a.net ?? 0) : (a.net ?? 0) - (b.net ?? 0))).slice(0, 20)
  return (
    <Card title="机构专用席位" as="section" className="mm-card" description={<>今日 {d.latest.inst.stocks} 只个股有机构席位，合计净买 <b className={tone(d.latest.inst.net)}>{money(d.latest.inst.net, true)}</b></>}
      actions={<Segmented items={[{ id: 'buy', label: '净买入' }, { id: 'sell', label: '净卖出' }]} value={side} onChange={setSide} label="机构方向" />}>
      {rows.length ? (
        <TableWrap label="机构专用净买排行">
          <table className="mm-table">
            <thead><tr><th>股票</th><th className="num">涨跌幅</th><th className="num">机构买入</th><th className="num">机构卖出</th><th className="num">净额</th><th className="num">买/卖席位</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.code}>
                  <td>{r.name}<small>{r.code}</small><WinTag w={r.window} /></td>
                  <td className={`num ${tone(r.pct)}`}>{pct(r.pct)}</td>
                  <td className="num">{money(r.buy)}</td>
                  <td className="num">{money(r.sell)}</td>
                  <td className={`num ${tone(r.net)}`}>{money(r.net, true)}</td>
                  <td className="num">{r.buyCount} / {r.sellCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">今日没有机构{side === 'buy' ? '净买入' : '净卖出'}的上榜个股</p>}
      <p className="mm-method">{METHOD.inst} {METHOD.hk}</p>
    </Card>
  )
}

/* ---------- 营业部 ---------- */
function DeptTable({ rows, label, withDays, detail }: { rows: DeptRow[]; label: string; withDays?: boolean; detail?: Data['window']['deptTrades'] }): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const cols = withDays ? 7 : 6
  return (
    <TableWrap label={label}>
      <table className="mm-table lhb-table">
        <thead><tr><th>营业部</th><th className="num">上榜次数</th>{withDays && <th className="num">天数</th>}<th className="num">买入</th><th className="num">卖出</th><th className="num">净额</th><th>{withDays ? '最近' : '个股'}</th></tr></thead>
        <tbody>
          {rows.map(r => {
            const key = r.dept || r.name
            const trades = detail?.[key]
            const isOpen = open === key
            return (
              <React.Fragment key={key}>
                <tr className={isOpen ? 'is-open' : undefined}>
                  <td>{trades ? (
                    <button type="button" className="lhb-name" aria-expanded={isOpen} onClick={() => setOpen(o => (o === key ? null : key))}>
                      <span className="lhb-name__caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>{r.name}
                    </button>
                  ) : r.name}</td>
                  <td className="num">{r.count}</td>
                  {withDays && <td className="num">{r.days}</td>}
                  <td className="num">{money(r.buy)}</td>
                  <td className="num">{money(r.sell)}</td>
                  <td className={`num ${tone(r.net)}`}>{money(r.net, true)}</td>
                  <td className="lhb-stocks">{withDays ? md(r.last) : r.stocks.join('、')}</td>
                </tr>
                {isOpen && trades && (
                  <tr className="lhb-detail-row">
                    <td colSpan={cols}>
                      <table className="mm-table lhb-seat-table" aria-label={`${r.name}近期上榜明细`}>
                        <thead><tr><th>日期</th><th>股票</th><th className="num">涨跌幅</th><th className="num">买入</th><th className="num">卖出</th><th className="num">净额</th></tr></thead>
                        <tbody>
                          {trades.map((t, i) => (
                            <tr key={`${t.date}-${t.code}-${i}`}>
                              <td>{md(t.date)}</td><td>{t.name}<WinTag w={t.window} /></td>
                              <td className={`num ${tone(t.pct)}`}>{pct(t.pct)}</td>
                              <td className="num">{money(t.buy)}</td><td className="num">{money(t.sell)}</td>
                              <td className={`num ${tone(t.net)}`}>{money(t.net, true)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </TableWrap>
  )
}

function DeptCard({ d }: { d: Data }): JSX.Element {
  const [range, setRange] = useState<'today' | 'window'>('today')
  const w = d.window
  const rows = range === 'today' ? d.latest.deptRank.slice(0, 20) : w.deptRank.slice(0, 30)
  return (
    <Card title="活跃营业部" as="section" className="mm-card"
      description={range === 'window' && w.from ? `${w.from} 至 ${w.to}，共 ${w.days} 个交易日；点营业部名称看近期上榜明细` : '当日买入额最大的营业部'}
      actions={<Segmented items={[{ id: 'today', label: '当日' }, { id: 'window', label: `近 ${w.days || 20} 日` }]} value={range} onChange={setRange} label="营业部统计区间" />}>
      {rows.length ? <DeptTable rows={rows} label={range === 'today' ? '当日活跃营业部' : '近期营业部排行'} withDays={range === 'window'} detail={range === 'window' ? w.deptTrades : undefined} /> : <p className="mm-empty">暂无营业部数据</p>}
      <p className="mm-method">{range === 'today' ? METHOD.dept : METHOD.window}</p>
    </Card>
  )
}

/* ---------- 近期上榜次数 ---------- */
function StockRankCard({ d }: { d: Data }): JSX.Element {
  const rows = d.window.stockRank.slice(0, 20)
  return (
    <Card title={`近 ${d.window.days || 20} 日上榜次数`} as="section" className="mm-card">
      {rows.length ? (
        <ul className="lhb-rank">
          {rows.map(r => (
            <li key={r.code}><span>{r.name}<small>{r.code}</small></span><b>{r.count} 次</b><span className={tone(r.net)}>{money(r.net, true)}</span></li>
          ))}
        </ul>
      ) : <p className="mm-empty">暂无数据</p>}
      <p className="mm-method">每只股票每天最多计一次；右侧为这些交易日龙虎榜净买额合计（三日口径的记录可能与相邻日重叠）。</p>
    </Card>
  )
}

/* ---------- 走势 ---------- */
function HistoryCard({ d }: { d: Data }): JSX.Element {
  const [view, setView] = useState<'count' | 'inst' | 'net'>('count')
  const points = d.history.map(h => ({ date: h.date, value: view === 'count' ? h.stockCount : view === 'inst' ? (fin(h.instNet) ? h.instNet / 1e8 : null) : (fin(h.net) ? h.net / 1e8 : null) }))
  return (
    <Card title="龙虎榜走势" as="section" className="mm-card">
      <Segmented items={[{ id: 'count', label: '上榜个股数' }, { id: 'inst', label: '机构净买' }, { id: 'net', label: '龙虎榜净买' }]} value={view} onChange={setView} label="走势指标" />
      <MoodChart points={points} label={view === 'count' ? '每日上榜个股数' : view === 'inst' ? '每日机构专用席位净买额（亿元）' : '每日龙虎榜净买额（亿元）'}
        format={v => (view === 'count' ? `${Math.round(v)}只` : `${minus(v.toFixed(1))}亿`)} refs={view === 'count' ? [] : [{ value: 0, label: '0' }]} />
      <p className="mm-method">从 {d.history[0]?.date ?? '—'} 起逐日累计。每只股票当天只计一条上榜记录。</p>
    </Card>
  )
}

export default function KplLhb(): JSX.Element {
  const load = useKplLhb()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 龙虎榜</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'error' && <EmptyState title="龙虎榜数据暂不可用">{load.message}</EmptyState>}
      {load.state === 'ok' && <LhbBody d={load.data} />}
    </Page>
  )
}

function LhbBody({ d }: { d: Data }): JSX.Element {
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.latest.date]} note="交易所约 17:00–18:30 公布，盘后更新" />
      <TopPanel d={d} />
      <Billboard d={d} />
      <InstCard d={d} />
      <DeptCard d={d} />
      <StockRankCard d={d} />
      <HistoryCard d={d} />
      <Callout title="口径与来源">
        <p>{d.note} {METHOD.skip}</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。另见 <Link to="/market-mood">市场情绪</Link>。</p>
      </Callout>
    </>
  )
}
