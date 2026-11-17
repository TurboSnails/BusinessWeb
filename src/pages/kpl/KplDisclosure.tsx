// 开盘啦 · 财报避雷（/market-mood/disclosure）：功能对照开盘啦 App 的业绩披露、避雷、股东人数、大宗交易、机构调研——
// 全 A 股近期披露的业绩预告 / 快报 / 定期报告与公告后表现、预约披露日历、ST 名单增减、按退市规则可机械判断的风险项与「已连续 X 日」名单、
// 股东户数连降 / 大增、大宗交易明细与近 20 日汇总、机构调研榜。
// 数据：public/data/kpl-disclosure.json（scripts/kpl-disclosure.mjs 盘后生成，来源东方财富数据中心）。盘后统计，不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import StockTable, { type Col } from '../../features/kpl-daban/StockTable'
import {
  asKplDisclosure, BOARD_LABEL, CONS_LABEL, KIND_LABEL, METHOD, RULE_SOURCE,
  type BlockStock, type DisclosureItem, type FinBlock, type FinRow, type HolderRow, type KplDisclosure as Data, type StreakRow, type SurveyRank,
} from '../../features/kpl-disclosure/model'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/kpl-disclosure.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: Data }

function useData(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-disclosure.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => {
        const data = asKplDisclosure(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件还没有生成或格式不对' })
      })
      // 静态托管把缺失的 JSON 回退成 HTML（200）时 r.json() 会抛错，也按「暂无数据」处理
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof SyntaxError ? '数据文件还没有生成' : e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [])
  return load
}

// 格式：真正的负号；缺失显示「—」；红涨绿跌
const fin = (x: number | null | undefined): x is number => x != null && Number.isFinite(x)
const fix = (x: number, d: number): string => x.toFixed(d).replace('-', '−')
const money = (x: number | null | undefined): string => (!fin(x) ? '—' : Math.abs(x) >= 1e8 ? `${fix(x / 1e8, 2)} 亿` : `${fix(x / 1e4, 0)} 万`)
const pct = (x: number | null | undefined, d = 2): string => (fin(x) ? `${x > 0 ? '+' : ''}${fix(x, d)}%` : '—')
const tone = (x: number | null | undefined): string => (!fin(x) || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
const md = (d: string | null | undefined): string => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '—')
const periodShort = (p: string): string => `${p.slice(2, 4)}${{ '03-31': 'Q1', '06-30': 'H1', '09-30': 'Q3', '12-31': '年报' }[p.slice(5)] ?? p.slice(5)}`
const Tag = ({ children, kind }: { children: React.ReactNode; kind?: 'up' | 'down' | 'warn' }): JSX.Element => <span className={kind ? `dc-tag is-${kind}` : 'dc-tag'}>{children}</span>
const Rule = ({ children }: { children: React.ReactNode }): JSX.Element => <p className="dc-rule">{children}</p>
const RuleSource = (): JSX.Element => <>出处：<a href={RULE_SOURCE.url} target="_blank" rel="noreferrer">{RULE_SOURCE.label}</a>。{RULE_SOURCE.note}</>

/** 不按代码去重的简单表（同一股票可能有多行：大宗交易、同日预告 + 快报） */
function RowsTable<T>({ label, rows, head, row, rowKey, empty = '暂无' }: {
  label: string; rows: T[]; head: Array<{ label: string; num?: boolean }>; row: (r: T) => React.ReactNode; rowKey: (r: T, i: number) => string; empty?: string
}): JSX.Element {
  if (!rows.length) return <p className="mm-empty">{empty}</p>
  return (
    <TableWrap label={label} stickyFirst className="kd-wrap">
      <table className="ui-table dc-table">
        <thead><tr>{head.map(h => <th key={h.label} scope="col" className={h.num ? 'num' : undefined}>{h.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={rowKey(r, i)}>{row(r)}</tr>)}</tbody>
      </table>
    </TableWrap>
  )
}
const NameCell = ({ name, code, children }: { name: string | null; code: string; children?: React.ReactNode }): JSX.Element => <th scope="row">{name || '—'}<small>{code}</small>{children}</th>

/* ---------- 顶部总览 ---------- */
function TopPanel({ d }: { d: Data }): JSX.Element {
  const ds = d.disclosure, r = d.risk, b = d.block, s = d.survey
  return (
    <section className="dc-top" aria-label="财报避雷总览">
      <div className="dc-top__cell">
        <span className="dc-top__label">近 {ds?.windowDays ?? 30} 日业绩公告</span>
        <strong className="dc-top__value">{ds ? ds.counts.forecast + ds.counts.express + ds.counts.report : '—'}</strong>
        <span className="dc-top__sub">{ds ? `预告 ${ds.counts.forecast} · 快报 ${ds.counts.express} · 定期 ${ds.counts.report}` : '暂缺'}</span>
      </div>
      <div className="dc-top__cell">
        <span className="dc-top__label">ST / *ST</span>
        <strong className="dc-top__value">{r ? r.st.count : '—'}</strong>
        <span className="dc-top__sub">{r ? `其中 *ST ${r.st.star}${r.st.added ? ` · 新增 ${r.st.added.length} / 移除 ${r.st.removed?.length ?? 0}` : ''}` : '暂缺'}</span>
      </div>
      <div className="dc-top__cell">
        <span className="dc-top__label">收盘价低于 1 元</span>
        <strong className="dc-top__value">{r ? r.face.length : '—'}</strong>
        <span className="dc-top__sub">{r ? `连续 ≥ 20 日 ${r.face.filter(x => x.days >= 20).length} 只` : '暂缺'}</span>
      </div>
      <div className="dc-top__cell">
        <span className="dc-top__label">大宗交易{b ? `（${md(b.date)}）` : ''}</span>
        <strong className="dc-top__value">{b ? b.count : '—'}</strong>
        <span className="dc-top__sub">{b ? `${money(b.amount)} · 机构专用买入 ${b.instBuy.count} 笔` : '暂缺'}</span>
      </div>
      <div className="dc-top__cell">
        <span className="dc-top__label">近 {s?.long.days ?? 20} 日机构调研</span>
        <strong className="dc-top__value">{s ? s.long.events : '—'}</strong>
        <span className="dc-top__sub">{s ? `涉及 ${s.long.stocks} 家公司` : '暂缺'}</span>
      </div>
    </section>
  )
}

/* ---------- 业绩披露 ---------- */
const kindItems = [{ id: 'all', label: '全部' }, { id: 'forecast', label: '预告' }, { id: 'express', label: '快报' }, { id: 'report', label: '定期报告' }] as const
type KindKey = (typeof kindItems)[number]['id']
const PAGE = 40

function ConsTag({ x }: { x: DisclosureItem }): JSX.Element {
  const c = x.consensus
  if (!c) return <>—</>
  return <span title={`实际 / 隐含 EPS ${c.actual}，一致预期 ${c.eps}（${c.orgs} 家）`}><Tag kind={c.label === 'beat' ? 'up' : c.label === 'miss' ? 'down' : undefined}>{CONS_LABEL[c.label]}</Tag> {pct(c.diff, 1)}</span>
}
const profitText = (x: DisclosureItem): string => (x.kind === 'forecast' && fin(x.profitLow) && fin(x.profitHigh) && x.profitLow !== x.profitHigh ? `${money(x.profitLow)}~${money(x.profitHigh)}` : money(x.profit))
const yoyText = (x: DisclosureItem): string => (x.kind === 'forecast' && fin(x.yoyLow) && fin(x.yoyHigh) && x.yoyLow !== x.yoyHigh ? `${pct(x.yoyLow, 0)}~${pct(x.yoyHigh, 0)}` : pct(x.yoy, 1))

function DisclosureCard({ d }: { d: Data }): JSX.Element {
  const ds = d.disclosure
  const [view, setView] = useState<'latest' | 'calendar'>('latest')
  const [kind, setKind] = useState<KindKey>('all')
  const [limit, setLimit] = useState(PAGE)
  const rows = useMemo(() => (ds ? ds.items.filter(x => kind === 'all' || x.kind === kind) : []), [ds, kind])
  return (
    <Card title="业绩披露" as="section" className="mm-card"
      description={ds ? `${ds.from} 至 ${ds.to} 公告（含当晚已发布、日期为下一交易日的公告）` : undefined}
      actions={<Segmented items={[{ id: 'latest', label: '最新披露' }, { id: 'calendar', label: '披露日历' }]} value={view} onChange={setView} label="业绩披露视图" />}>
      {!ds ? <p className="mm-empty">业绩披露数据暂缺</p> : view === 'latest' ? (
        <>
          <div className="dc-bar">
            <Segmented items={[...kindItems]} value={kind} onChange={k => { setKind(k); setLimit(PAGE) }} label="公告类型" />
          </div>
          <RowsTable label="最新业绩披露" rows={rows.slice(0, limit)} rowKey={x => `${x.kind}-${x.code}-${x.period}-${x.notice}`} empty="近期没有这类公告"
            head={[{ label: '名称' }, { label: '类型' }, { label: '报告期' }, { label: '公告日' }, { label: '净利润', num: true }, { label: '同比', num: true }, { label: '与一致预期' }, { label: '后1日', num: true }, { label: '后3日', num: true }, { label: '后5日', num: true }]}
            row={x => (
              <>
                <NameCell name={x.name} code={x.code} />
                <td>{KIND_LABEL[x.kind]}{x.type && <Tag kind={/增|盈|扭亏/.test(x.type) ? 'up' : /减|亏|降/.test(x.type) ? 'down' : undefined}>{x.type}</Tag>}{x.kind === 'forecast' && !/净利润/.test(x.metric) && <small>{x.metric}</small>}</td>
                <td>{periodShort(x.period)}</td>
                <td>{md(x.notice)}</td>
                <td className="num">{profitText(x)}</td>
                <td className={`num ${tone(x.yoy)}`}>{yoyText(x)}</td>
                <td><ConsTag x={x} /></td>
                <td className={`num ${tone(x.perf?.d1)}`}>{pct(x.perf?.d1)}</td>
                <td className={`num ${tone(x.perf?.d3)}`}>{pct(x.perf?.d3)}</td>
                <td className={`num ${tone(x.perf?.d5)}`}>{pct(x.perf?.d5)}</td>
              </>
            )} />
          {rows.length > limit && <button type="button" className="dc-more" onClick={() => setLimit(l => l + PAGE)}>再显示 {Math.min(PAGE, rows.length - limit)} 条（共 {rows.length}）</button>}
          {ds.truncated && <p className="mm-method">公告较多，每类只保留最近 200 条（共保留 {ds.items.length} 条；上方计数为全部）。</p>}
          <p className="mm-method">{METHOD.disclosure}</p>
          <p className="mm-method">{METHOD.perf}</p>
          <p className="mm-method">{METHOD.consensus}</p>
        </>
      ) : (
        <>
          {ds.progress && <p className="dc-lead">{ds.progress.label}披露进度：已披露 <b>{ds.progress.published}</b> / 预约 {ds.progress.total} 家（{fix((ds.progress.published / Math.max(1, ds.progress.total)) * 100, 1)}%）。</p>}
          <p className="dc-lead">未来 10 个交易日（{ds.calendar.from} 至 {ds.calendar.to}）预约披露 <b>{ds.calendar.total}</b> 家{ds.calendar.next ? `；此后最近一家预约在 ${ds.calendar.next.date}（${ds.calendar.next.label}）` : ''}。</p>
          {ds.calendar.total ? (
            <ul className="dc-cal" aria-label="预约披露日历">
              {ds.calendar.days.map(day => (
                <li key={day.date}>
                  <b>{md(day.date)}</b> · {day.count} 家
                  {day.count > 0 && <p>{day.stocks.slice(0, 8).map(s => `${s.name}${s.change ? `（${s.change}）` : ''}`).join('、')}{day.count > 8 ? ' 等' : ''}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="mm-empty">未来 10 个交易日暂无预约披露（定期报告空窗期）</p>}
          <p className="mm-method">{METHOD.calendar} 已研究公司的财报日期见 <Link to="/earnings">财报前瞻</Link>。</p>
        </>
      )}
    </Card>
  )
}

/* ---------- 避雷 ---------- */
const riskItems = [{ id: 'st', label: 'ST 名单' }, { id: 'face', label: '面值' }, { id: 'cap', label: '市值' }, { id: 'annual', label: '年报财务' }, { id: 'observe', label: '季报观察' }] as const
type RiskKey = (typeof riskItems)[number]['id']
const flags = (r: { st: boolean; delisting?: boolean }): React.ReactNode => <>{r.st && <Tag kind="warn">ST</Tag>}{r.delisting && <Tag>退市整理</Tag>}</>
const daysText = (r: StreakRow): string => `${r.capped ? '≥' : ''}${r.days} 日`
const streakCols = (kind: 'face' | 'cap'): Array<Col<StreakRow>> => [
  { key: 'flag', label: '标记', render: r => <>{BOARD_LABEL[r.board]}{flags(r)}</> },
  { key: 'days', label: '已连续', num: true, render: r => <span className={r.days >= 20 ? 'mm-down' : undefined}>{daysText(r)}</span>, sort: r => r.days },
  kind === 'face'
    ? { key: 'close', label: '收盘价', num: true, render: r => (fin(r.close) ? fix(r.close, 2) : '—'), sort: r => r.close }
    : { key: 'cap', label: '总市值', num: true, render: r => money(r.cap), sort: r => r.cap },
  kind === 'face'
    ? { key: 'cap', label: '总市值', num: true, render: r => money(r.cap), sort: r => r.cap }
    : { key: 'limit', label: '板块阈值', num: true, render: r => money(r.limit ?? null) },
]
const finCols = (withRev: boolean): Array<Col<FinRow>> => [
  { key: 'flag', label: '标记', render: r => <>{BOARD_LABEL[r.board]}{flags(r)}</> },
  ...(withRev ? [{ key: 'rev', label: '营业收入', num: true, render: (r: FinRow) => money(r.revenue), sort: (r: FinRow) => r.revenue }] : []),
  { key: 'profit', label: '归母净利润', num: true, render: r => <span className={tone(r.profit)}>{money(r.profit)}</span>, sort: r => r.profit },
  { key: 'deps', label: '扣非每股收益', num: true, render: r => (fin(r.deductEps) ? fix(r.deductEps, 3) : '—'), sort: r => r.deductEps },
  { key: 'bps', label: '每股净资产', num: true, render: r => (fin(r.bps) ? fix(r.bps, 2) : '—'), sort: r => r.bps },
]

function FinView({ block, kind }: { block: FinBlock; kind: 'annual' | 'observe' }): JSX.Element {
  const [hideSt, setHideSt] = useState(false)
  const f = (xs: FinRow[]): FinRow[] => (hideSt ? xs.filter(x => !x.st) : xs)
  return (
    <>
      <div className="dc-bar">
        <Segmented items={[{ id: 'all', label: '全部' }, { id: 'nost', label: '只看非 ST' }]} value={hideSt ? 'nost' : 'all'} onChange={v => setHideSt(v === 'nost')} label={`${kind === 'annual' ? '年报' : '季报'}名单范围`} />
      </div>
      <h3 className="dc-sub">{block.label}：亏损且营业收入低于阈值（{block.lossLowRev.length} 只）</h3>
      <StockTable label={`${block.label}亏损且营收低于阈值`} rows={f(block.lossLowRev)} cols={finCols(true)} initial={{ key: 'rev', dir: 'asc' }} empty="无" />
      <h3 className="dc-sub">{block.label}：净资产为负（{block.negEquity.length} 只）</h3>
      <StockTable label={`${block.label}净资产为负`} rows={f(block.negEquity)} cols={finCols(false)} initial={{ key: 'bps', dir: 'asc' }} empty="无" />
      <Rule>{kind === 'annual' ? METHOD.annual : METHOD.observe} <RuleSource /></Rule>
    </>
  )
}

function RiskCard({ d }: { d: Data }): JSX.Element {
  const r = d.risk
  const [view, setView] = useState<RiskKey>('st')
  const [showAll, setShowAll] = useState(false)
  return (
    <Card title="避雷" as="section" className="mm-card" description={r ? `${r.date} 收盘；只做按公开规则的机械筛选，不做主观判断` : undefined}
      actions={<Segmented items={[...riskItems]} value={view} onChange={setView} label="避雷视图" />}>
      {!r ? <p className="mm-empty">避雷数据暂缺</p> : view === 'st' ? (
        <>
          <p className="dc-lead">当日 ST / *ST 共 <b>{r.st.count}</b> 只（*ST {r.st.star} 只）。{r.st.prevDate ? `与 ${r.st.prevDate} 相比：` : '上一交易日存档缺失，无法比较新增 / 移除。'}</p>
          {r.st.added && (
            <>
              <h3 className="dc-sub">新增（{r.st.added.length}）</h3>
              {r.st.added.length ? <ul className="dc-chips">{r.st.added.map(s => <li key={s.code}>{s.name}<small>{s.code}{s.prevName ? ` · 原 ${s.prevName}` : ''}</small></li>)}</ul> : <p className="mm-empty">无</p>}
              <h3 className="dc-sub">移除（{r.st.removed?.length ?? 0}）</h3>
              {r.st.removed?.length ? <ul className="dc-chips">{r.st.removed.map(s => <li key={s.code}>{s.name ?? '（已不在行情列表，可能已退市）'}<small>{s.code}{s.prevName ? ` · 原 ${s.prevName}` : ''}</small></li>)}</ul> : <p className="mm-empty">无</p>}
            </>
          )}
          <h3 className="dc-sub">全部名单</h3>
          <ul className="dc-chips" aria-label="ST 名单">{(showAll ? r.st.list : r.st.list.slice(0, 40)).map(s => <li key={s.code}>{s.name}<small>{s.code}</small></li>)}</ul>
          {r.st.list.length > 40 && <button type="button" className="dc-more" onClick={() => setShowAll(v => !v)}>{showAll ? '收起' : `展开全部 ${r.st.list.length} 只`}</button>}
          <Rule>{METHOD.st}</Rule>
        </>
      ) : view === 'face' ? (
        <>
          <p className="dc-lead">收盘价低于 1 元 <b>{r.face.length}</b> 只，其中已连续 20 个交易日及以上 <b>{r.face.filter(x => x.days >= 20).length}</b> 只（存档 {r.span} 个交易日）。</p>
          <StockTable label="收盘价低于 1 元的个股" rows={r.face} cols={streakCols('face')} initial={{ key: 'days', dir: 'desc' }} empty="当日没有收盘价低于 1 元的沪深 A 股" />
          <Rule>{METHOD.face} <RuleSource /></Rule>
        </>
      ) : view === 'cap' ? (
        <>
          <p className="dc-lead">总市值低于本板块阈值 <b>{r.cap.length}</b> 只，其中已连续 20 个交易日及以上 <b>{r.cap.filter(x => x.days >= 20).length}</b> 只。</p>
          <StockTable label="总市值低于阈值的个股" rows={r.cap} cols={streakCols('cap')} initial={{ key: 'days', dir: 'desc' }} empty="当日没有总市值低于阈值的沪深 A 股" />
          <Rule>{METHOD.cap} <RuleSource /></Rule>
        </>
      ) : <FinView key={view} block={view === 'annual' ? r.annual : r.observe} kind={view} />}
    </Card>
  )
}

/* ---------- 股东户数 ---------- */
const holderItems = [{ id: 'falling', label: '连降 ≥3 期' }, { id: 'drop', label: '最新降幅' }, { id: 'rise', label: '最新增幅' }, { id: 'recent', label: '近 10 日披露' }] as const
type HolderKey = (typeof holderItems)[number]['id']
const holderCols: Array<Col<HolderRow>> = [
  { key: 'end', label: '截止日', render: r => r.end, sort: r => r.end },
  { key: 'holders', label: '户数', num: true, render: r => (fin(r.holders) ? r.holders.toLocaleString('zh-CN') : '—'), sort: r => r.holders },
  { key: 'change', label: '较上期', num: true, render: r => <span className={tone(r.change)}>{pct(r.change)}</span>, sort: r => r.change },
  { key: 'streak', label: '连降', num: true, render: r => (r.streak ? `${r.capped ? '≥' : ''}${r.streak} 期` : '—'), sort: r => r.streak },
  { key: 'cum', label: '累计降幅', num: true, render: r => <span className={tone(r.cum)}>{pct(r.cum)}</span>, sort: r => r.cum },
  { key: 'notice', label: '公告日', render: r => md(r.notice), sort: r => r.notice },
]
function HoldersCard({ d }: { d: Data }): JSX.Element {
  const h = d.holders
  const [view, setView] = useState<HolderKey>('falling')
  const rows = h ? h[view] : []
  const initial = view === 'falling' ? { key: 'streak', dir: 'desc' as const } : view === 'drop' ? { key: 'change', dir: 'asc' as const } : view === 'rise' ? { key: 'change', dir: 'desc' as const } : { key: 'notice', dir: 'desc' as const }
  return (
    <Card title="股东户数" as="section" className="mm-card" description={h ? `覆盖 ${h.total} 只最新一期在近 200 天内的 A 股；连降 ≥3 期共 ${h.fallingCount} 只` : undefined}
      actions={<Segmented items={[...holderItems]} value={view} onChange={setView} label="股东户数视图" />}>
      {!h ? <p className="mm-empty">股东户数数据暂缺</p> : <StockTable key={view} label="股东户数变化" rows={rows} cols={holderCols} initial={initial} empty="暂无" />}
      <p className="mm-method">{METHOD.holders}</p>
    </Card>
  )
}

/* ---------- 大宗交易 ---------- */
const blockItems = [{ id: 'today', label: '当日明细' }, { id: 'top', label: '近 20 日成交' }, { id: 'inst', label: '机构专用买入' }] as const
type BlockKey = (typeof blockItems)[number]['id']
const blockStockCols: Array<Col<BlockStock>> = [
  { key: 'count', label: '笔数', num: true, render: r => `${r.count}`, sort: r => r.count },
  { key: 'amount', label: '成交额', num: true, render: r => money(r.amount), sort: r => r.amount },
  { key: 'premium', label: '加权溢价率', num: true, render: r => <span className={tone(r.premium)}>{pct(r.premium)}</span>, sort: r => r.premium },
  { key: 'inst', label: '机构专用买入', num: true, render: r => (r.instBuyCount ? `${money(r.instBuy)}（${r.instBuyCount} 笔）` : '—'), sort: r => r.instBuy },
  { key: 'last', label: '最近', render: r => md(r.last), sort: r => r.last },
]
function BlockCard({ d }: { d: Data }): JSX.Element {
  const b = d.block
  const [view, setView] = useState<BlockKey>('today')
  const [limit, setLimit] = useState(PAGE)
  return (
    <Card title="大宗交易" as="section" className="mm-card"
      description={b ? (view === 'today' ? `${b.date}：${b.count} 笔、${b.stocks} 只、${money(b.amount)}；溢价 ${b.premiumCount} 笔 / 折价 ${b.discountCount} 笔` : `${b.window.from} 至 ${b.window.to}（${b.window.days} 个交易日）共 ${b.window.count} 笔、${money(b.window.amount)}`) : undefined}
      actions={<Segmented items={[...blockItems]} value={view} onChange={setView} label="大宗交易视图" />}>
      {!b ? <p className="mm-empty">大宗交易数据暂缺</p> : view === 'today' ? (
        <>
          {b.date !== d.asOf && <p className="dc-lead">{d.asOf} 的大宗交易尚未发布，下表为 {b.date}。</p>}
          <RowsTable label="当日大宗交易明细" rows={b.items.slice(0, limit)} rowKey={(x, i) => `${x.code}-${i}`} empty="当日无大宗交易"
            head={[{ label: '名称' }, { label: '成交价', num: true }, { label: '溢价率', num: true }, { label: '成交额', num: true }, { label: '当日涨跌', num: true }, { label: '买方' }, { label: '卖方' }]}
            row={x => (
              <>
                <NameCell name={x.name} code={x.code}>{x.buyer === '机构专用' && <Tag kind="up">机构买</Tag>}</NameCell>
                <td className="num">{fin(x.price) ? fix(x.price, 2) : '—'}</td>
                <td className={`num ${tone(x.premium)}`}>{pct(x.premium)}</td>
                <td className="num">{money(x.amount)}</td>
                <td className={`num ${tone(x.pct)}`}>{pct(x.pct)}</td>
                <td className="dc-wide">{x.buyer || '—'}</td>
                <td className="dc-wide">{x.seller || '—'}</td>
              </>
            )} />
          {b.items.length > limit && <button type="button" className="dc-more" onClick={() => setLimit(l => l + PAGE)}>再显示 {Math.min(PAGE, b.items.length - limit)} 笔（共 {b.items.length}）</button>}
        </>
      ) : (
        <StockTable key={view} label={view === 'top' ? '近 20 日大宗交易成交额' : '近 20 日机构专用买入'} rows={view === 'top' ? b.window.top : b.window.inst} cols={blockStockCols}
          initial={{ key: view === 'top' ? 'amount' : 'inst', dir: 'desc' }} empty="暂无" />
      )}
      <p className="mm-method">{METHOD.block}</p>
    </Card>
  )
}

/* ---------- 机构调研 ---------- */
const surveyItems = [{ id: 'short', label: '近 5 日' }, { id: 'long', label: '近 20 日' }, { id: 'latest', label: '当日公告' }] as const
type SurveyKey = (typeof surveyItems)[number]['id']
const surveyCols: Array<Col<SurveyRank>> = [
  { key: 'orgs', label: '接待机构数', num: true, render: r => (fin(r.orgs) ? `${r.orgs}` : '—'), sort: r => r.orgs },
  { key: 'events', label: '调研次数', num: true, render: r => `${r.events}`, sort: r => r.events },
  { key: 'last', label: '最近公告', render: r => md(r.last), sort: r => r.last },
]
function SurveyCard({ d }: { d: Data }): JSX.Element {
  const s = d.survey
  const [view, setView] = useState<SurveyKey>('short')
  return (
    <Card title="机构调研" as="section" className="mm-card"
      description={s && view !== 'latest' ? `${s[view].from} 至 ${s[view].to} 公告的调研记录` : `${d.asOf} 公告的调研记录`}
      actions={<Segmented items={[...surveyItems]} value={view} onChange={setView} label="机构调研视图" />}>
      {!s ? <p className="mm-empty">机构调研数据暂缺</p> : view === 'latest' ? (
        <RowsTable label="当日公告的机构调研" rows={s.latest} rowKey={(x, i) => `${x.code}-${i}`} empty="当日没有公告的调研记录"
          head={[{ label: '名称' }, { label: '接待机构数', num: true }, { label: '调研开始' }, { label: '方式' }]}
          row={x => (<><NameCell name={x.name} code={x.code} /><td className="num">{fin(x.orgs) ? x.orgs : '—'}</td><td>{x.start ?? '—'}</td><td className="dc-wide">{x.ways || '—'}</td></>)} />
      ) : <StockTable key={view} label={`近 ${s[view].days} 日机构调研榜`} rows={s[view].rank} cols={surveyCols} initial={{ key: 'orgs', dir: 'desc' }} empty="暂无" />}
      <p className="mm-method">{METHOD.survey}</p>
    </Card>
  )
}

export default function KplDisclosure(): JSX.Element {
  const load = useData()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 财报避雷</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'error' && <EmptyState title="财报避雷数据暂不可用">{load.message}</EmptyState>}
      {load.state === 'ok' && <Body d={load.data} />}
    </Page>
  )
}

function Body({ d }: { d: Data }): JSX.Element {
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.asOf]} note="东方财富数据中心报表，盘后更新" />
      <TopPanel d={d} />
      <DisclosureCard d={d} />
      <RiskCard d={d} />
      <HoldersCard d={d} />
      <BlockCard d={d} />
      <SurveyCard d={d} />
      <Callout title="口径与来源">
        <p>{d.note} {METHOD.skip}</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。退市规则：<RuleSource /></p>
        <p>另见 <Link to="/earnings">财报前瞻</Link>（已研究公司的财报日期）、<Link to="/market-mood/lhb">龙虎榜</Link>。</p>
      </Callout>
    </>
  )
}
