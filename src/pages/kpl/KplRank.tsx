// 开盘啦 · 人气排行（/market-mood/rank）：功能对照开盘啦 App 的人气榜（东财股吧人气口径）、个股区间排行榜（区间涨跌幅、区间主力净额、净流入天数）、
// 板块多日统计与领涨次数（行业 / 概念 / 地区）、机构榜多日统计（3 / 5 / 10 / 20 日机构专用席位净买、出榜次数）。
// 数据：public/data/kpl-rank.json（scripts/kpl-rank.mjs 盘后生成，四个部分各自带日期）。盘后统计，不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, LoadError, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { useUrlTab } from '../../hooks/useUrlTab'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import {
  asKplRank, BOARD_WINDOW_DAYS, INST_WINDOW_DAYS, METHOD, NET_WINDOW_DAYS, STOCK_WINDOW_DAYS,
  type BoardRow, type KplRank as Data, type PopRow, type PopTopRow, type RangeRow,
} from '../../features/kpl-rank/model'
import '../../styles/market-mood.css'
import '../../styles/kpl-rank.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ok'; data: Data }

function useKplRank(): Load & { retry: () => void } {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoad({ state: 'loading' }); setAttempt(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-rank.json`, { cache: 'no-cache', signal: controller.signal })
      .then(async r => {
        if (r.status === 404) { setLoad({ state: 'missing' }); return }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        let body: unknown
        try { body = await r.json() } catch { return setLoad({ state: 'missing' }) } // 静态托管把缺失文件回退成 HTML 时也当作「还没有数据」
        const data = asKplRank(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [attempt])
  return { ...load, retry }
}

// 格式：金额（元）→ 亿 / 万；真正的负号；红涨绿跌
const fin = (x: number | null | undefined): x is number => x != null && Number.isFinite(x)
const money = (x: number | null | undefined, signed = false): string => {
  if (!fin(x)) return '—'
  const a = Math.abs(x)
  const body = a >= 1e8 ? `${(a / 1e8).toFixed(2)} 亿` : `${Math.round(a / 1e4)} 万`
  return `${x < 0 ? '−' : signed && x > 0 ? '+' : ''}${body}`
}
const pct = (x: number | null | undefined): string => (fin(x) ? `${x > 0 ? '+' : ''}${x.toFixed(2).replace('-', '−')}%` : '—')
const signed = (x: number | null | undefined): string => (fin(x) ? `${x > 0 ? '+' : ''}${String(x).replace('-', '−')}` : '—')
const tone = (x: number | null | undefined): string => (!fin(x) || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
const md = (d: string): string => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const PAGE = 30

function More({ shown, total, onMore }: { shown: number; total: number; onMore(): void }): JSX.Element | null {
  return shown < total ? <button type="button" className="kr-more" onClick={onMore}>显示全部 {total} 条</button> : null
}
const Name = ({ name, code }: { name: string | null; code: string }): JSX.Element => <>{name ?? '—'}<small>{code}</small></>

/* ---------- 1. 人气榜 ---------- */
function PopularityCard({ d }: { d: Data }): JSX.Element {
  const p = d.popularity
  const [view, setView] = useUrlTab('view', ['top', 'surge'] as const, 'top')
  const [all, setAll] = useState(false)
  if (!p) {
    return (
      <Card title="人气榜（东方财富股吧人气）" as="section" className="mm-card">
        <EmptyState title="人气榜暂无数据">人气榜是盘后快照，下一个交易日约 15:40 之后更新。</EmptyState>
        <p className="mm-method">{METHOD.popularity}</p>
      </Card>
    )
  }
  const rows: Array<PopRow | PopTopRow> = view === 'top' ? p.top : p.surge
  const shown = all ? rows : rows.slice(0, PAGE)
  return (
    <Card title={`人气榜 · ${p.date}`} as="section" className="mm-card"
      description={<>东方财富股吧人气口径，不是开盘啦人气值 · 快照 {p.takenAt} · 对比 {p.prevDate || '上一交易日'}</>}
      actions={<Segmented items={[{ id: 'top', label: '人气前 100' }, { id: 'surge', label: '飙升榜' }]} value={view} onChange={v => { setView(v); setAll(false) }} label="人气榜视图" />}>
      {rows.length ? (
        <TableWrap label={view === 'top' ? '人气前 100' : '人气飙升榜'}>
          <table className="mm-table kr-table">
            <thead>
              <tr>
                <th className="num">排名</th><th>股票</th><th className="num">涨跌幅</th><th className="num">上一交易日</th><th className="num">排名变化</th>
                {view === 'top' && <><th className="num">连续前 10</th><th className="num">连续前 100</th><th>标签</th></>}
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.code}>
                  <td className="num">{r.rank}</td>
                  <td><Name name={r.name} code={r.code} /></td>
                  <td className={`num ${tone(r.pct)}`}>{pct(r.pct)}</td>
                  <td className="num">{r.prevRank ?? '—'}</td>
                  <td className={`num ${tone(r.change)}`}>{signed(r.change)}</td>
                  {'tags' in r && (
                    <>
                      <td className="num">{r.streak10 ? `${r.streak10} 天` : '—'}</td>
                      <td className="num">{r.streak100 != null ? `${r.streak100} 天` : '—'}</td>
                      <td>{r.tags.map(t => <span key={t} className={`kr-tag${t === '人气激增' ? ' is-hot' : ''}`}>{t}</span>)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">暂无</p>}
      <More shown={shown.length} total={rows.length} onMore={() => setAll(true)} />
      <p className="mm-method">{METHOD.popularity} {METHOD.change} {view === 'top' ? METHOD.tags : METHOD.surge}</p>
    </Card>
  )
}

/* ---------- 2. 个股区间排行 ---------- */
const modeItems = [{ id: 'gain', label: '涨幅榜' }, { id: 'loss', label: '跌幅榜' }, { id: 'inflow', label: '主力净流入' }, { id: 'outflow', label: '主力净流出' }] as const
type Mode = (typeof modeItems)[number]['id']

function StockRangeCard({ d }: { d: Data }): JSX.Element {
  const s = d.stockRange
  const [mode, setMode] = useState<Mode>('gain')
  const [days, setDays] = useState('5')
  const [all, setAll] = useState(false)
  const isNet = mode === 'inflow' || mode === 'outflow'
  const windowDays: readonly number[] = isNet ? NET_WINDOW_DAYS : STOCK_WINDOW_DAYS
  const dayValue = windowDays.includes(Number(days)) ? days : '5'
  const rows: RangeRow[] = useMemo(() => {
    if (!s) return []
    const n = Number(dayValue)
    if (isNet) { const w = s.nets.find(x => x.days === n); return w ? (mode === 'inflow' ? w.inflow : w.outflow) : [] }
    const w = s.windows.find(x => x.days === n)
    return w ? (mode === 'gain' ? w.gain : w.loss) : []
  }, [s, dayValue, mode, isNet])
  if (!s) {
    return (
      <Card title="个股区间排行" as="section" className="mm-card">
        <EmptyState title="个股区间排行暂无数据">区间排行来自盘后行情快照，下一个交易日 15:10 之后更新。</EmptyState>
        <p className="mm-method">{METHOD.stockRange}</p>
      </Card>
    )
  }
  const shown = all ? rows : rows.slice(0, PAGE)
  return (
    <Card title={`个股区间排行 · ${s.date}`} as="section" className="mm-card">
      <div className="kr-controls">
        <Segmented items={[...modeItems]} value={mode} onChange={v => { setMode(v); setAll(false) }} label="区间榜类型" />
        <Segmented items={windowDays.map(n => ({ id: String(n), label: `${n} 日` }))} value={dayValue} onChange={v => { setDays(v); setAll(false) }} label="区间天数" />
      </div>
      {rows.length ? (
        <TableWrap label={`${dayValue} 日${modeItems.find(m => m.id === mode)?.label ?? ''}`}>
          <table className="mm-table kr-table">
            <thead>
              <tr>
                <th className="num">#</th><th>股票</th>
                <th className="num">{isNet ? `${dayValue} 日主力净额` : `${dayValue} 日涨跌幅`}</th>
                {isNet && <th className="num">净流入天数</th>}
                <th className="num">当日涨跌</th><th className="num">收盘价</th><th className="num">成交额</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.code}>
                  <td className="num">{i + 1}</td>
                  <td><Name name={r.name} code={r.code} /></td>
                  <td className={`num ${tone(r.value)}`}>{isNet ? money(r.value, true) : pct(r.value)}</td>
                  {isNet && <td className="num">{fin(r.inflowDays) ? `${r.inflowDays}/${dayValue}` : '—'}</td>}
                  <td className={`num ${tone(r.pct)}`}>{pct(r.pct)}</td>
                  <td className="num">{fin(r.price) ? r.price.toFixed(2) : '—'}</td>
                  <td className="num">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">暂无</p>}
      <More shown={shown.length} total={rows.length} onMore={() => setAll(true)} />
      <p className="mm-method">{isNet ? METHOD.stockNet : METHOD.stockRange}</p>
    </Card>
  )
}

/* ---------- 3. 板块区间排行 ---------- */
const kindItems = [{ id: 'industry', label: '行业' }, { id: 'concept', label: '概念' }, { id: 'region', label: '地区' }] as const
type Kind = (typeof kindItems)[number]['id']
const sortItems = [{ id: 'range', label: '区间涨幅' }, { id: 'net', label: '区间主力净额' }, { id: 'lead', label: '领涨次数' }, { id: 'today', label: '当日涨幅' }] as const
type SortKey = (typeof sortItems)[number]['id']
type N = (typeof BOARD_WINDOW_DAYS)[number]
const field = (r: BoardRow, key: SortKey, n: N): number | null =>
  key === 'range' ? r[`r${n}`] : key === 'net' ? r[`net${n}`] : key === 'lead' ? r[`lead${n}`] : r.pct

function BoardsCard({ d }: { d: Data }): JSX.Element {
  const b = d.boards
  const [kind, setKind] = useState<Kind>('industry')
  const [days, setDays] = useState<string>('5')
  const [sort, setSort] = useState<SortKey>('range')
  const [asc, setAsc] = useState(false)
  const [all, setAll] = useState(false)
  const n = Number(days) as N
  const rows = useMemo(() => {
    if (!b) return []
    return [...b[kind].rows].sort((x, y) => {
      const a = field(x, sort, n), c = field(y, sort, n)
      if (a === null && c === null) return 0
      if (a === null) return 1
      if (c === null) return -1
      return asc ? a - c : c - a
    })
  }, [b, kind, sort, n, asc])
  if (!b) {
    return (
      <Card title="板块区间排行" as="section" className="mm-card">
        <EmptyState title="板块区间排行暂无数据">盘后更新。</EmptyState>
      </Card>
    )
  }
  const shown = all ? rows : rows.slice(0, PAGE)
  const leaders = b[kind].leaders ?? []
  return (
    <Card title={`板块区间排行 · ${b.date}`} as="section" className="mm-card">
      <div className="kr-controls">
        <Segmented items={[...kindItems]} value={kind} onChange={v => { setKind(v); setAll(false) }} label="板块类型" />
        <Segmented items={BOARD_WINDOW_DAYS.map(x => ({ id: String(x), label: `${x} 日` }))} value={days} onChange={setDays} label="板块区间天数" />
        <Segmented items={[...sortItems]} value={sort} onChange={v => { setSort(v); setAsc(false) }} label="板块排序" />
        <button type="button" className="kr-more kr-dir" aria-pressed={asc} onClick={() => setAsc(a => !a)}>{asc ? '从低到高' : '从高到低'}</button>
      </div>
      <TableWrap label={`${kindItems.find(k => k.id === kind)?.label ?? ''}板块区间排行`}>
        <table className="mm-table kr-table">
          <thead>
            <tr>
              <th className="num">#</th><th>板块</th><th className="num">当日</th><th className="num">{n} 日涨幅</th>
              <th className="num">{n} 日主力净额</th><th className="num">净流入天数</th><th className="num">{n} 日领涨次数</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.code}>
                <td className="num">{i + 1}</td>
                <td>{r.name}<small>{r.code}</small></td>
                <td className={`num ${tone(r.pct)}`}>{pct(r.pct)}</td>
                <td className={`num ${tone(r[`r${n}`])}`}>{pct(r[`r${n}`])}</td>
                <td className={`num ${tone(r[`net${n}`])}`}>{money(r[`net${n}`], true)}</td>
                <td className="num">{fin(r[`in${n}`]) ? `${r[`in${n}`]}/${n}` : '—'}</td>
                <td className="num">{r[`lead${n}`] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <More shown={shown.length} total={rows.length} onMore={() => setAll(true)} />
      {b[kind].missing > 0 && <p className="mm-method">另有 {b[kind].missing} 个板块 {b.date} 没有日线（新设或停用），未列入。{kind !== 'region' && '缺日线的板块可能正是某天的涨幅第一，这次不统计领涨次数与每日领涨。'}</p>}
      {leaders.length > 0 && (
        <section className="kr-leaders" aria-label={`${kindItems.find(k => k.id === kind)?.label ?? ''}每日领涨板块`}>
          <p className="kr-leaders__title">近 {Math.min(10, leaders.length)} 个交易日每日涨幅第一</p>
          <ol className="kr-leaders__list">
            {leaders.slice(-10).reverse().map(l => (
              <li key={l.date}><span className="kr-leaders__date">{md(l.date)}</span><span>{l.name ?? '—'}</span><b className={tone(l.pct)}>{pct(l.pct)}</b></li>
            ))}
          </ol>
        </section>
      )}
      <p className="mm-method">{METHOD.boards} {METHOD.lead}</p>
    </Card>
  )
}

/* ---------- 4. 机构多日榜 ---------- */
function InstCard({ d }: { d: Data }): JSX.Element {
  const inst = d.inst
  const [days, setDays] = useState('5')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [all, setAll] = useState(false)
  if (!inst) {
    return (
      <Card title="机构多日榜" as="section" className="mm-card">
        <EmptyState title="机构多日榜暂无数据">龙虎榜约北京 17:00–18:30 公布，之后更新。</EmptyState>
      </Card>
    )
  }
  const w = inst.windows.find(x => String(x.days) === days) ?? inst.windows[0]
  const rows = side === 'buy' ? w.buy : w.sell
  const shown = all ? rows : rows.slice(0, PAGE)
  return (
    <Card title={`机构多日榜 · 截至 ${inst.date}`} as="section" className="mm-card"
      description={w.complete
        ? <>近 {w.days} 个交易日（{md(w.from)}–{md(w.to)}）{w.totals.stocks ?? '—'} 只个股出现机构专用席位，合计净买 <b className={tone(w.totals.net)}>{money(w.totals.net, true)}</b></>
        : <>近 {w.days} 个交易日（{md(w.from)}–{md(w.to)}）的龙虎榜明细不全，不统计。</>}>
      <div className="kr-controls">
        <Segmented items={INST_WINDOW_DAYS.filter(x => inst.windows.some(y => y.days === x)).map(x => ({ id: String(x), label: `${x} 日` }))} value={String(w.days)} onChange={v => { setDays(v); setAll(false) }} label="机构统计天数" />
        <Segmented items={[{ id: 'buy', label: '净买入' }, { id: 'sell', label: '净卖出' }]} value={side} onChange={v => { setSide(v); setAll(false) }} label="机构方向" />
      </div>
      {!w.complete && <p className="mm-method">缺少 {w.missing.map(md).join('、')} 的龙虎榜明细，按更短区间合计会被误读成 {w.days} 日，所以这个窗口不发布合计与排行。</p>}
      {!w.complete ? null : rows.length ? (
        <TableWrap label={`近 ${w.days} 日机构${side === 'buy' ? '净买入' : '净卖出'}排行`}>
          <table className="mm-table kr-table">
            <thead>
              <tr>
                <th className="num">#</th><th>股票</th><th className="num">机构净买</th><th className="num">机构买入</th><th className="num">机构卖出</th>
                <th className="num">出榜次数</th><th className="num">机构席位数</th><th className="num">最近出榜</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.code}>
                  <td className="num">{i + 1}</td>
                  <td><Name name={r.name} code={r.code} /></td>
                  <td className={`num ${tone(r.net)}`}>{money(r.net, true)}</td>
                  <td className="num">{money(r.buy)}</td>
                  <td className="num">{money(r.sell)}</td>
                  <td className="num">{r.times}</td>
                  <td className="num">{r.seats}</td>
                  <td className="num">{md(r.last)} <span className={tone(r.lastPct)}>{pct(r.lastPct)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">近 {w.days} 日没有机构{side === 'buy' ? '净买入' : '净卖出'}的上榜个股</p>}
      <More shown={shown.length} total={rows.length} onMore={() => setAll(true)} />
      <p className="mm-method">{METHOD.inst} 另见 <Link to="/market-mood/lhb">龙虎榜</Link>。</p>
    </Card>
  )
}

export default function KplRank(): JSX.Element {
  const load = useKplRank()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 人气排行</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'missing' && <EmptyState title="人气排行暂无数据">数据在交易日盘后生成，生成后在这里显示。</EmptyState>}
      {load.state === 'error' && (
        <LoadError reason="人气排行这份读数现在拿不到。" detail={load.message} onRetry={load.retry} />
      )}
      {load.state === 'ok' && <RankBody d={load.data} />}
    </Page>
  )
}

function RankBody({ d }: { d: Data }): JSX.Element {
  const dates = [...new Set([d.popularity?.date, d.stockRange?.date, d.boards?.date, d.inst?.date].filter((x): x is string => !!x))].sort()
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={dates} note="四个部分各自更新：人气榜与个股区间约 15:40，板块随收盘，机构榜随龙虎榜（约 17:00–18:30）" />
      <PopularityCard d={d} />
      <StockRangeCard d={d} />
      <BoardsCard d={d} />
      <InstCard d={d} />
      <Callout title="口径与来源">
        <p>{d.note} {METHOD.skip}</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。另见 <Link to="/market-mood/funds">资金</Link>、<Link to="/market-mood/plates">板块题材</Link>。</p>
      </Callout>
    </>
  )
}
