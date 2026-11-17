// 开盘啦 · 时间线（/market-mood/timeline）：对照开盘啦 App 的「市场雷达 / 板块异动（爆发时间线）/ 大盘直播」。
// 收盘后用公开数据还原当日盘面时间线，不是盘中直播；不做涨跌原因的文字归因。
// 数据：public/data/kpl-timeline.json（scripts/kpl-timeline.mjs 收盘后生成）。不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import {
  asKplTimeline, BOARD_KIND_LABEL, CHANGE_NAME, KIND_LABEL, METHOD,
  type BoardKind, type BoardRow, type EventKind, type Hint, type IndexId, type KplTimeline as Data,
} from '../../features/kpl-timeline/model'
import StockTable, { num, pct, tone, type Col } from '../../features/kpl-daban/StockTable'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/kpl-timeline.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ok'; data: Data }

function useTimeline(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-timeline.json`, { cache: 'no-cache', signal: controller.signal })
      .then(async r => {
        if (r.status === 404) { setLoad({ state: 'missing' }); return }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        // 静态托管在文件缺失时可能回退成 index.html（200 但不是 JSON），同样按「尚未生成」处理
        const body: unknown = await r.json().catch(() => undefined)
        if (body === undefined) { setLoad({ state: 'missing' }); return }
        const data = asKplTimeline(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [])
  return load
}

const hints = (list: Hint[] | undefined): React.ReactNode =>
  list?.length ? <span className="kt-hint">概念提示：{list.map(h => `${h.name}（${h.zt} 只）`).join('、')}</span> : null

/* ---------- 顶部汇总 ---------- */
function Summary({ d }: { d: Data }): JSX.Element {
  const s = d.summary
  const cells: Array<[string, React.ReactNode, React.ReactNode]> = d.indices.map(x => [x.name, <span key={x.id} className={tone(x.pct)}>{pct(x.pct)}</span>, `振幅 ${pct(x.amp, 2, false)}`])
  cells.push(
    ['涨停 / 触板未封', s.zt == null ? '—' : <><span className="mm-up">{s.zt}</span> / {s.touch ?? '—'}</>, s.firstZt ? `最早封板 ${s.firstZt}` : '涨停池缺失'],
    ['板块异动最多', s.boardTop ? s.boardTop.name : '—', s.boardTop ? `${num(s.boardTop.count)} 次` : '板块异动缺失'],
    ['盘口异动', s.radarTotal ?? '—', s.radarTotal == null ? '收盘后当天采集，本次没有' : '当日事件数'],
  )
  return (
    <section className="kd-summary" aria-label="时间线总览">
      {cells.map(([k, v, sub]) => (
        <div key={k} className="kd-summary__cell">
          <span className="kd-summary__label">{k}</span>
          <strong className="kd-summary__value">{v}</strong>
          <span className="kd-summary__sub">{sub}</span>
        </div>
      ))}
    </section>
  )
}

/* ---------- 指数分时与关键点 ---------- */
function Indices({ d }: { d: Data }): JSX.Element {
  const [id, setId] = useState<IndexId>(d.indices[0].id)
  const x = d.indices.find(i => i.id === id) ?? d.indices[0]
  const points = useMemo(() => d.times.map((t, i) => ({ date: t, value: x.series[i] ?? null })), [d.times, x])
  return (
    <Card title="指数分时与关键点" as="section" className="mm-card" description={`${d.date} 三大指数分钟走势（相对 ${d.prevDate} 收盘的涨跌幅）。`}>
      <Segmented items={d.indices.map(i => ({ id: i.id, label: i.name }))} value={id} onChange={setId} label="选择指数" />
      <MoodChart points={points} label={`${x.name}分时涨跌幅`} format={v => `${v.toFixed(2)}%`} zeroBase colorBy="sign" tick={t => t} />
      <TableWrap label="指数关键点" stickyFirst>
        <table className="ui-table kd-table">
          <thead>
            <tr><th scope="col">指数</th><th scope="col">开盘</th><th scope="col">日内最高</th><th scope="col">日内最低</th>{x.checkpoints.map(c => <th key={c.t} scope="col">{c.t}</th>)}<th scope="col">收盘</th><th scope="col">振幅</th></tr>
          </thead>
          <tbody>
            {d.indices.map(i => (
              <tr key={i.id}>
                <th scope="row" className="kd-name">{i.name}</th>
                <td className={tone(i.openPct)}>{pct(i.openPct)}</td>
                <td className={tone(i.high.pct)}>{pct(i.high.pct)}<small>{i.high.t}</small></td>
                <td className={tone(i.low.pct)}>{pct(i.low.pct)}<small>{i.low.t}</small></td>
                {i.checkpoints.map(c => <td key={c.t} className={tone(c.pct)}>{pct(c.pct)}</td>)}
                <td className={tone(i.pct)}>{pct(i.pct)}<small>{num(i.close, 2)}</small></td>
                <td>{pct(i.amp, 2, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="mm-method">{METHOD.index}</p>
    </Card>
  )
}

/* ---------- 半小时小结 ---------- */
function Slots({ d }: { d: Data }): JSX.Element {
  const radar = d.parts.radar != null
  return (
    <Card title="每 30 分钟小结" as="section" className="mm-card" description="按时段看涨停新增、上证涨跌和新增涨停最集中的板块。">
      {d.slots.length === 0 ? <p className="mm-empty">没有时段数据</p> : (
        <TableWrap label="每 30 分钟小结表" stickyFirst>
          <table className="ui-table kd-table">
            <thead>
              <tr><th scope="col">时段</th><th scope="col">涨停新增</th><th scope="col">累计</th><th scope="col">触板未封</th><th scope="col">上证时段涨跌（百分点）</th><th scope="col">新增最多的行业</th><th scope="col">新增最多的概念</th>{radar && <th scope="col">盘口异动</th>}<th scope="col">该时段涨停股</th></tr>
            </thead>
            <tbody>
              {d.slots.map(s => (
                <tr key={s.id}>
                  <th scope="row" className="kd-name">{s.label}</th>
                  <td className={s.ztNew ? 'mm-up' : ''}>{s.ztNew}</td>
                  <td>{s.ztCum}</td>
                  <td>{s.touchNew}</td>
                  <td className={tone(s.shChange)}>{s.shChange == null ? '—' : `${s.shChange > 0 ? '+' : ''}${num(s.shChange, 2)}`}{s.shEnd != null ? <small>至 {pct(s.shEnd)}</small> : null}</td>
                  <td>{s.topIndustry ? `${s.topIndustry.name}（${s.topIndustry.zt}）` : '—'}</td>
                  <td>{s.topConcept ? `${s.topConcept.name}（${s.topConcept.zt}）` : '—'}</td>
                  {radar && <td>{s.radar ?? '—'}{s.sealEv != null ? <small>封 {s.sealEv} / 开 {s.openEv ?? '—'}</small> : null}</td>}
                  <td className="kt-stocks">{s.stocks.length ? s.stocks.join('、') + (s.ztNew > s.stocks.length ? ' 等' : '') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <p className="mm-method">{METHOD.slots}</p>
    </Card>
  )
}

/* ---------- 合并时间线 ---------- */
const KIND_ORDER: EventKind[] = ['index', 'board', 'zt', 'touch', 'radar', 'bigbuy']
function Timeline({ d }: { d: Data }): JSX.Element {
  const counts = useMemo(() => {
    const c = new Map<EventKind, number>()
    for (const e of d.events) c.set(e.kind, (c.get(e.kind) ?? 0) + 1)
    return c
  }, [d.events])
  const [on, setOn] = useState<Set<EventKind>>(() => new Set(KIND_ORDER.filter(k => k !== 'radar')))
  const toggle = (k: EventKind): void => setOn(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next })
  const list = d.events.filter(e => on.has(e.kind))
  const missing: string[] = []
  if (!d.parts.pools) missing.push('涨停池（首次封板时间）本次缺失，时间线不含涨停与板块扩散事件')
  if (d.parts.radar == null) missing.push('个股盘口异动（封板 / 开板、大笔买入）只能在交易日收盘后当天采集，本次没有')
  return (
    <Card title="当日盘面时间线（收盘后还原）" as="section" className="mm-card" description={`共 ${d.events.length} 条，按时间排序。点类型筛选。`}>
      <div className="kt-chips" role="group" aria-label="事件类型">
        {KIND_ORDER.map(k => (
          <button key={k} type="button" className="kt-chip" aria-pressed={on.has(k)} disabled={!counts.get(k)} onClick={() => toggle(k)}>
            {KIND_LABEL[k]} <strong>{counts.get(k) ?? 0}</strong>
          </button>
        ))}
      </div>
      {missing.map(m => <p key={m} className="mm-method">{m}。</p>)}
      {list.length === 0 ? <p className="mm-empty">所选类型没有事件</p> : (
        <ol className="kt-timeline" aria-label="盘面时间线">
          {list.map((e, i) => (
            <li key={`${e.t}|${e.kind}|${e.title}|${i}`} className={`kt-ev kt-ev--${e.kind}`}>
              <time>{e.t.slice(0, 5)}<small>{e.t.slice(5)}</small></time>
              <div className="kt-ev__body">
                <span className="kt-ev__kind">{KIND_LABEL[e.kind]}</span>
                <span className={`kt-ev__title ${e.dir && e.kind !== 'index' ? (e.dir > 0 ? 'mm-up' : 'mm-down') : ''}`}>{e.title}</span>
                {e.detail ? <span className="kt-ev__detail">{e.detail}</span> : null}
                {hints(e.hint)}
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="mm-method">{METHOD.zt}</p>
      <p className="mm-method">{METHOD.board}</p>
      <p className="mm-method">{METHOD.hint}</p>
      <p className="mm-method">{METHOD.radar}</p>
    </Card>
  )
}

/* ---------- 板块异动 ---------- */
const share = (r: BoardRow): number | null => (r.up + r.down ? Math.round((r.up / (r.up + r.down)) * 1000) / 10 : null)
const BOARD_COLS: Array<Col<BoardRow>> = [
  { key: 'kind', label: '类型', render: r => BOARD_KIND_LABEL[r.kind] ?? r.kind, sort: r => r.kind },
  { key: 'pct', label: '涨跌幅', num: true, render: r => pct(r.pct), sort: r => r.pct, cls: r => tone(r.pct) },
  { key: 'flow', label: '主力净流入', num: true, render: r => (r.flow == null ? '—' : `${num(r.flow, 2)} 亿`), sort: r => r.flow, cls: r => tone(r.flow) },
  { key: 'count', label: '异动次数', num: true, render: r => num(r.count), sort: r => r.count },
  { key: 'updown', label: '偏多 / 偏空', num: true, render: r => <><span className="mm-up">{num(r.up)}</span> / <span className="mm-down">{num(r.down)}</span></>, sort: r => r.up - r.down },
  { key: 'share', label: '偏多占比', num: true, render: r => pct(share(r), 1, false), sort: r => share(r) },
  { key: 'types', label: '主要类型', render: r => (r.types.length ? r.types.slice(0, 3).map(([t, c]) => `${CHANGE_NAME[t]?.[0] ?? t} ${c}`).join(' · ') : '—') },
  { key: 'ms', label: '最频繁个股', render: r => (r.ms ? <>{r.ms.name}<small>{r.ms.type != null ? CHANGE_NAME[r.ms.type]?.[0] ?? '' : ''}</small></> : '—') },
  { key: 'zt', label: '当日涨停', num: true, render: r => (r.zt == null ? '—' : num(r.zt)), sort: r => r.zt },
  { key: 'first', label: '首只涨停', render: r => (r.firstZt ? <>{r.firstZt.time}<small>{r.firstZt.name}</small></> : '—'), sort: r => r.firstZt?.time ?? null },
  { key: 'hint', label: '概念提示', render: r => (r.hint.length ? r.hint.map(h => `${h.name}（${h.zt}）`).join('、') : '—') },
]
type KindFilter = 'all' | BoardKind
function Boards({ d }: { d: Data }): JSX.Element {
  const [kind, setKind] = useState<KindFilter>('all')
  if (!d.boards) {
    return (
      <Card title="板块异动" as="section" className="mm-card">
        <p className="mm-empty">本次没有取到当日板块异动数据（接口日期对不上或分类失败时不写入）。</p>
        <p className="mm-method">{METHOD.bk}</p>
      </Card>
    )
  }
  const rows = kind === 'all' ? d.boards.rows : d.boards.rows.filter(r => r.kind === kind)
  const items: Array<{ id: KindFilter; label: string }> = [{ id: 'all', label: '全部' }, ...(Object.keys(BOARD_KIND_LABEL) as BoardKind[]).map(k => ({ id: k, label: BOARD_KIND_LABEL[k] }))]
  return (
    <Card title="板块异动" as="section" className="mm-card" description={`${d.date} 截至 ${d.boards.asOf}，东财给出 ${d.boards.total} 个板块，去掉统计类等后 ${d.boards.kept} 个，按异动次数列出前 ${d.boards.rows.length} 个。`}>
      <Segmented items={items} value={kind} onChange={setKind} label="板块类型" />
      <div className="kd-list">
        <StockTable key={kind} label="板块异动表" rows={rows} cols={BOARD_COLS} initial={{ key: 'count', dir: 'desc' }} empty="该类型没有板块" />
      </div>
      <p className="mm-method">{METHOD.bk}</p>
    </Card>
  )
}

export default function KplTimeline(): JSX.Element {
  const load = useTimeline()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 时间线</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'missing' && <EmptyState title="时间线数据尚未生成">交易日收盘后运行数据脚本，这里就会显示当日盘面时间线（收盘后还原，不是盘中直播）。</EmptyState>}
      {load.state === 'error' && <EmptyState title="时间线数据暂不可用">{load.message}</EmptyState>}
      {load.state === 'ok' && <Body d={load.data} />}
    </Page>
  )
}

function Body({ d }: { d: Data }): JSX.Element {
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.date]} note="收盘后更新" />
      <Callout title="收盘后还原，不是盘中直播">
        <p>{METHOD.live} 数据日期：{d.date}。</p>
      </Callout>
      <Summary d={d} />
      <Indices d={d} />
      <Slots d={d} />
      <Timeline d={d} />
      <Boards d={d} />
      <Callout title="口径与来源">
        <p>{d.note}</p>
        <p>{METHOD.skipped}</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。另见 <Link to="/market-mood/abnormal">异动监管</Link>、<Link to="/market-mood/review">复盘</Link>、<Link to="/market-mood/daban">打板</Link>。</p>
      </Callout>
    </>
  )
}
