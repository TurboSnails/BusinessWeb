// 开盘啦 · 持仓两融（/market-mood/holders）：功能对照开盘啦 App 的融资融券个股排行、基金季度持仓、牛散追踪——
// 融资净买入前 / 后 30、近 5 日累计、融资余额增幅、融资余额占流通市值、行业汇总；基金重仓股增持 / 减持 / 新进与行业汇总；
// 十大流通股东里出现频次最高的自然人及其持股，可按股东名或股票检索。
// 数据：public/data/kpl-holders.json（scripts/kpl-holders.mjs 盘后生成，来源东方财富数据中心）。盘后统计，不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import StockTable, { type Col } from '../../features/kpl-daban/StockTable'
import {
  asKplHolders, METHOD, STATE_LABEL,
  type FundIndustry, type FundRow, type Holding, type Investor, type KplHolders as Data, type MarginIndustry, type MarginRow,
} from '../../features/kpl-holders/model'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/kpl-holders.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: Data }

function useData(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-holders.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => {
        const data = asKplHolders(body)
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
const signed = (x: number | null | undefined): string => (fin(x) && x > 0 ? `+${money(x)}` : money(x))
const pct = (x: number | null | undefined, d = 2, sign = true): string => (fin(x) ? `${sign && x > 0 ? '+' : ''}${fix(x, d)}%` : '—')
const shares = (x: number | null | undefined): string => (!fin(x) ? '—' : Math.abs(x) >= 1e8 ? `${fix(x / 1e8, 2)} 亿股` : `${fix(x / 1e4, 1)} 万股`)
const tone = (x: number | null | undefined): string => (!fin(x) || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
const md = (d: string | null | undefined): string => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '—')

/** 不按代码去重的简单表（同一股票可能对应多个股东） */
function RowsTable<T>({ label, rows, head, row, rowKey, empty = '暂无' }: {
  label: string; rows: T[]; head: Array<{ label: string; num?: boolean }>; row: (r: T) => React.ReactNode; rowKey: (r: T, i: number) => string; empty?: string
}): JSX.Element {
  if (!rows.length) return <p className="mm-empty">{empty}</p>
  return (
    <TableWrap label={label} stickyFirst className="kd-wrap">
      <table className="ui-table hd-table">
        <thead><tr>{head.map(h => <th key={h.label} scope="col" className={h.num ? 'num' : undefined}>{h.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={rowKey(r, i)}>{row(r)}</tr>)}</tbody>
      </table>
    </TableWrap>
  )
}
const StateTag = ({ s }: { s: Holding['state'] }): JSX.Element => (s ? <span className={s === 'new' || s === 'add' ? 'hd-tag is-up' : s === 'cut' ? 'hd-tag is-down' : 'hd-tag'}>{STATE_LABEL[s]}</span> : <>—</>)

/* ---------- 顶部总览 ---------- */
function TopPanel({ d }: { d: Data }): JSX.Element {
  const m = d.margin, f = d.funds, v = d.investors
  return (
    <section className="hd-top" aria-label="持仓两融总览">
      <div className="hd-top__cell">
        <span className="hd-top__label">A 股融资余额{m ? `（${md(m.date)}）` : ''}</span>
        <strong className="hd-top__value">{m ? money(m.totals.balance) : '—'}</strong>
        <span className="hd-top__sub">{m ? `覆盖 ${m.count} 只两融标的` : '暂缺'}</span>
      </div>
      <div className="hd-top__cell">
        <span className="hd-top__label">个股融资净买入合计</span>
        <strong className={`hd-top__value ${m ? tone(m.totals.net) : ''}`}>{m ? signed(m.totals.net) : '—'}</strong>
        <span className="hd-top__sub">{m ? `净买入 ${m.totals.up} 只 · 净偿还 ${m.totals.down} 只` : '暂缺'}</span>
      </div>
      <div className="hd-top__cell">
        <span className="hd-top__label">基金持股{f ? `（${f.label}）` : ''}</span>
        <strong className="hd-top__value">{f ? money(f.totalValue) : '—'}</strong>
        <span className="hd-top__sub">{f ? `${f.count} 只 · 新进 ${f.newCount ?? '—'} · 增持 ${f.addCount}` : '暂缺'}</span>
      </div>
      <div className="hd-top__cell">
        <span className="hd-top__label">高频自然人股东</span>
        <strong className="hd-top__value">{v ? v.list.length : '—'}</strong>
        <span className="hd-top__sub">{v ? `出现在 ≥${v.minStocks} 只股票的共 ${v.eligible} 人` : '暂缺'}</span>
      </div>
    </section>
  )
}

/* ---------- 融资融券 ---------- */
const marginItems = [
  { id: 'buy', label: '净买入前 30' }, { id: 'sell', label: '净偿还前 30' }, { id: 'buy5', label: '5 日净买入' }, { id: 'sell5', label: '5 日净偿还' },
  { id: 'growth', label: '余额增幅' }, { id: 'ratio', label: '占流通市值' }, { id: 'industry', label: '行业' },
] as const
type MarginKey = (typeof marginItems)[number]['id']
const marginCols: Array<Col<MarginRow>> = [
  { key: 'net', label: '融资净买入', num: true, render: r => signed(r.net), sort: r => r.net, cls: r => tone(r.net) },
  { key: 'net5', label: '近 5 日累计', num: true, render: r => signed(r.net5), sort: r => r.net5, cls: r => tone(r.net5) },
  { key: 'balance', label: '融资余额', num: true, render: r => money(r.balance), sort: r => r.balance },
  { key: 'growth', label: '余额增幅', num: true, render: r => pct(r.growth), sort: r => r.growth, cls: r => tone(r.growth) },
  { key: 'ratio', label: '占流通市值', num: true, render: r => pct(r.ratio, 2, false), sort: r => r.ratio },
  { key: 'buy', label: '融资买入', num: true, render: r => money(r.buy), sort: r => r.buy },
  { key: 'pct', label: '当日涨跌', num: true, render: r => pct(r.pct), sort: r => r.pct, cls: r => tone(r.pct) },
]
const marginInitial: Record<Exclude<MarginKey, 'industry'>, { key: string; dir: 'asc' | 'desc' }> = {
  buy: { key: 'net', dir: 'desc' }, sell: { key: 'net', dir: 'asc' }, buy5: { key: 'net5', dir: 'desc' }, sell5: { key: 'net5', dir: 'asc' },
  growth: { key: 'growth', dir: 'desc' }, ratio: { key: 'ratio', dir: 'desc' },
}
function IndustryTable({ label, rows }: { label: string; rows: MarginIndustry[] }): JSX.Element {
  return (
    <RowsTable label={label} rows={rows} rowKey={r => r.code}
      head={[{ label: '行业' }, { label: '融资净买入', num: true }, { label: '融资余额', num: true }, { label: '占流通市值', num: true }]}
      row={r => (<><th scope="row">{r.name}</th><td className={`num ${tone(r.net)}`}>{signed(r.net)}</td><td className="num">{money(r.balance)}</td><td className="num">{pct(r.ratio, 2, false)}</td></>)} />
  )
}
function MarginCard({ d }: { d: Data }): JSX.Element {
  const m = d.margin
  const [view, setView] = useState<MarginKey>('buy')
  return (
    <Card title="融资融券个股排行" as="section" className="mm-card"
      description={m ? `${m.date} 交易所两融数据（次一交易日早上公布）` : undefined}
      actions={<Segmented items={[...marginItems]} value={view} onChange={setView} label="两融视图" />}>
      {!m ? <p className="mm-empty">两融数据暂缺</p> : view === 'industry' ? (
        <div className="hd-two">
          <div><h3 className="hd-sub">融资净买入前 {m.industries.inflow.length} 行业</h3><IndustryTable label="融资净买入行业" rows={m.industries.inflow} /></div>
          <div><h3 className="hd-sub">融资净偿还前 {m.industries.outflow.length} 行业</h3><IndustryTable label="融资净偿还行业" rows={m.industries.outflow} /></div>
        </div>
      ) : <StockTable key={view} label={marginItems.find(x => x.id === view)?.label ?? '两融'} rows={m[view]} cols={marginCols} initial={marginInitial[view]} empty="暂无" />}
      <p className="mm-method">{METHOD.margin}</p>
      {view === 'growth' && <p className="mm-method">{METHOD.growth}</p>}
      {view === 'industry' && <p className="mm-method">{METHOD.industry}</p>}
    </Card>
  )
}

/* ---------- 基金季度持仓 ---------- */
const fundItems = [{ id: 'add', label: '增持' }, { id: 'cut', label: '减持' }, { id: 'fresh', label: '新进' }, { id: 'top', label: '持股市值' }, { id: 'industry', label: '行业' }] as const
type FundKey = (typeof fundItems)[number]['id']
const fundCols: Array<Col<FundRow>> = [
  { key: 'changeValue', label: '变动市值（估）', num: true, render: r => signed(r.changeValue), sort: r => r.changeValue, cls: r => tone(r.changeValue) },
  { key: 'change', label: '持股变化', num: true, render: r => (r.isNew ? '新进' : shares(r.change)), sort: r => r.change, cls: r => tone(r.change) },
  { key: 'changeRatio', label: '变化幅度', num: true, render: r => pct(r.changeRatio), sort: r => r.changeRatio, cls: r => tone(r.changeRatio) },
  { key: 'value', label: '持股市值', num: true, render: r => money(r.value), sort: r => r.value },
  { key: 'funds', label: '持有基金数', num: true, render: r => (fin(r.funds) ? r.funds : '—'), sort: r => r.funds },
  { key: 'freeRatio', label: '占流通股', num: true, render: r => pct(r.freeRatio, 2, false), sort: r => r.freeRatio },
  { key: 'industry', label: '行业', render: r => r.industry ?? '—', sort: r => r.industry },
]
const fundInitial: Record<Exclude<FundKey, 'industry'>, { key: string; dir: 'asc' | 'desc' }> = {
  add: { key: 'changeValue', dir: 'desc' }, cut: { key: 'changeValue', dir: 'asc' }, fresh: { key: 'value', dir: 'desc' }, top: { key: 'value', dir: 'desc' },
}
function FundsCard({ d }: { d: Data }): JSX.Element {
  const f = d.funds
  const [view, setView] = useState<FundKey>('add')
  const [indSort, setIndSort] = useState<'value' | 'change'>('value')
  const inds = useMemo<FundIndustry[]>(() => (f ? [...f.industries].sort((a, b) => (indSort === 'value' ? b.value - a.value : b.changeValue - a.changeValue)).slice(0, 30) : []), [f, indSort])
  const mixed = f && f.prevFull !== null && f.full !== f.prevFull
  return (
    <Card title="基金季度持仓" as="section" className="mm-card"
      description={f ? `${f.label}（报告期 ${f.period}）${f.prevLabel ? `，与${f.prevLabel}比较` : ''}；数据随基金定期报告披露，滞后` : undefined}
      actions={<Segmented items={[...fundItems]} value={view} onChange={setView} label="基金持仓视图" />}>
      {!f ? <p className="mm-empty">基金持仓数据暂缺</p> : (
        <>
          {mixed && <p className="hd-warn">{f.label}{f.full ? '为全部持仓' : '只含前十大重仓股'}，{f.prevLabel}{f.prevFull ? '为全部持仓' : '只含前十大重仓股'}，两期口径不同：{f.full ? '增持会被高估' : '减持会被高估，增持与新进是保守下限'}。</p>}
          {view === 'industry' ? (
            <>
              <div className="hd-bar"><Segmented items={[{ id: 'value', label: '按持股市值' }, { id: 'change', label: '按变动市值' }]} value={indSort} onChange={setIndSort} label="行业排序" /></div>
              <RowsTable label="基金持仓行业汇总" rows={inds} rowKey={r => r.name}
                head={[{ label: '行业' }, { label: '持股市值', num: true }, { label: '变动市值（估）', num: true }, { label: '股票数', num: true }, { label: '新进 / 增持 / 减持', num: true }]}
                row={r => (<><th scope="row">{r.name}</th><td className="num">{money(r.value)}</td><td className={`num ${tone(r.changeValue)}`}>{signed(r.changeValue)}</td><td className="num">{r.stocks}</td><td className="num">{r.newCount} / {r.addCount} / {r.cutCount}</td></>)} />
            </>
          ) : view === 'fresh' && !f.fresh ? <p className="mm-empty">上一期数据不足，无法判断新进</p>
            : <StockTable key={view} label={`基金${fundItems.find(x => x.id === view)?.label ?? ''}`} rows={(view === 'fresh' ? f.fresh : f[view]) ?? []} cols={fundCols} initial={fundInitial[view]} empty="暂无" />}
        </>
      )}
      <p className="mm-method">{METHOD.funds}</p>
      <p className="mm-method">{METHOD.fundsBias}</p>
      <p className="mm-method">{METHOD.fundsLag}{f?.industryDate ? ` 行业归属取 ${f.industryDate} 的分类。` : ''}</p>
    </Card>
  )
}

/* ---------- 牛散追踪 ---------- */
const PAGE = 30
type StockHit = Holding & { holder: string }
function InvestorsCard({ d }: { d: Data }): JSX.Element {
  const v = d.investors
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const query = q.trim()
  const people = useMemo<Investor[]>(() => (v ? (query ? v.list.filter(p => p.name.includes(query)) : v.list) : []), [v, query])
  const hits = useMemo<StockHit[]>(() => (v && query ? v.list.flatMap(p => p.items.filter(s => s.code.includes(query) || s.name.includes(query)).map(s => ({ ...s, holder: p.name }))) : []), [v, query])
  const sel = v?.list.find(p => p.name === picked) ?? null
  return (
    <Card title="牛散追踪" as="section" className="mm-card"
      description={v ? `十大流通股东里出现频次最高的 ${v.list.length} 位自然人；最新一期截止日 ${v.endFrom ?? '—'} 至 ${v.endTo ?? '—'}，来自定期报告，滞后` : undefined}>
      {!v ? <p className="mm-empty">十大流通股东数据暂缺</p> : (
        <>
          <div className="hd-bar">
            <label className="hd-search">按股东名或股票检索<input type="search" value={q} placeholder="姓名 / 股票名称 / 代码" onChange={e => { setQ(e.target.value); setLimit(PAGE) }} /></label>
          </div>
          {sel && (
            <div className="hd-picked">
              <h3 className="hd-sub">{sel.name} · 出现在 {sel.count} 只股票 · 合计 {money(sel.value)} <button type="button" className="hd-more" onClick={() => setPicked(null)}>收起</button></h3>
              <RowsTable label={`${sel.name} 的持股`} rows={sel.items} rowKey={s => s.code}
                head={[{ label: '股票' }, { label: '持股市值', num: true }, { label: '持股数', num: true }, { label: '占流通股', num: true }, { label: '变动' }, { label: '变动股数', num: true }, { label: '名次', num: true }, { label: '截止日' }]}
                row={s => (<><th scope="row">{s.name}<small>{s.code}</small></th><td className="num">{money(s.value)}</td><td className="num">{shares(s.shares)}</td><td className="num">{pct(s.ratio, 2, false)}</td><td><StateTag s={s.state} /></td><td className={`num ${tone(s.change)}`}>{s.state === 'new' ? '—' : shares(s.change)}</td><td className="num">{fin(s.rank) ? s.rank : '—'}</td><td>{s.end}</td></>)} />
            </div>
          )}
          {query && (
            <>
              <h3 className="hd-sub">持有「{query}」的高频自然人股东（{hits.length}）</h3>
              <RowsTable label="按股票检索结果" rows={hits} rowKey={(s, i) => `${s.holder}-${s.code}-${i}`} empty="名单里没有人持有匹配的股票"
                head={[{ label: '股东' }, { label: '股票' }, { label: '持股市值', num: true }, { label: '占流通股', num: true }, { label: '变动' }, { label: '截止日' }]}
                row={s => (<><th scope="row"><button type="button" className="hd-name" onClick={() => setPicked(s.holder)}>{s.holder}</button></th><td>{s.name}<small>{s.code}</small></td><td className="num">{money(s.value)}</td><td className="num">{pct(s.ratio, 2, false)}</td><td><StateTag s={s.state} /></td><td>{s.end}</td></>)} />
              <h3 className="hd-sub">姓名匹配（{people.length}）</h3>
            </>
          )}
          <RowsTable label="高频自然人股东" rows={people.slice(0, limit)} rowKey={p => p.name} empty="名单里没有匹配的姓名"
            head={[{ label: '股东' }, { label: '出现只数', num: true }, { label: '合计持股市值', num: true }, { label: '新进 / 加仓 / 减仓', num: true }, { label: '市值最大的持股' }]}
            row={p => (<><th scope="row"><button type="button" className="hd-name" aria-pressed={picked === p.name} onClick={() => setPicked(p.name === picked ? null : p.name)}>{p.name}</button></th><td className="num">{p.count}</td><td className="num">{money(p.value)}</td><td className="num">{p.newCount} / {p.addCount} / {p.cutCount}</td><td>{p.items.slice(0, 3).map(s => s.name).join('、')}</td></>)} />
          {people.length > limit && <button type="button" className="hd-more" onClick={() => setLimit(l => l + PAGE)}>再显示 {Math.min(PAGE, people.length - limit)} 位（共 {people.length}）</button>}
        </>
      )}
      <p className="mm-method">{METHOD.investors}{v ? ` 本期共 ${v.rows} 条自然人股东记录、${v.candidates} 个不同姓名。` : ''}</p>
      <p className="mm-method">{METHOD.investorsCaveat}</p>
    </Card>
  )
}

export default function KplHolders(): JSX.Element {
  const load = useData()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 持仓两融</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'error' && <EmptyState title="持仓两融数据暂不可用">{load.message}</EmptyState>}
      {load.state === 'ok' && <Body d={load.data} />}
    </Page>
  )
}

function Body({ d }: { d: Data }): JSX.Element {
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.asOf]} note="两融为上一交易日数据；基金持仓、十大流通股东来自定期报告" />
      <TopPanel d={d} />
      <MarginCard d={d} />
      <FundsCard d={d} />
      <InvestorsCard d={d} />
      <Callout title="口径与来源">
        <p>{d.note} {METHOD.skip}</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。</p>
        <p>另见 <Link to="/invest/national-team">国家队持仓</Link>（汇金、证金、社保持仓变化）、<Link to="/market-mood">市场情绪</Link>（全市场融资余额）、<Link to="/market-mood/disclosure">财报避雷</Link>（股东户数）。</p>
      </Callout>
    </>
  )
}
