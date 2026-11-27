// 开盘啦 · 异动监管（/market-mood/abnormal）：功能对照开盘啦 App 的「偏离值 / 严重异动 / 多次异动（复牌）/ 会不会上龙虎榜 / 市场雷达 / 监管问询」。
// 全部按沪深交易所公开规则机械计算，盘后版。数据：public/data/kpl-abnormal.json（scripts/kpl-abnormal.mjs 收盘后生成）。
// 不是预测，也不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, LoadError, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import {
  asKplAbnormal, BOARD_LABEL, CAT_LABEL, METHOD, RULE_SOURCES, RULES, TRIG_LABEL,
  type HistoryDay, type KplAbnormal as Data, type NearRow, type Radar, type RegItem, type RegKind, type Regulatory, type SevereRow, type SuspendRow, type TriggeredRow,
} from '../../features/kpl-abnormal/model'
import StockTable, { money, num, pct, tone, type Col } from '../../features/kpl-daban/StockTable'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/kpl-abnormal.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ok'; data: Data }

function useAbnormal(): Load & { retry: () => void } {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoad({ state: 'loading' }); setAttempt(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-abnormal.json`, { cache: 'no-cache', signal: controller.signal })
      .then(async r => {
        if (r.status === 404) { setLoad({ state: 'missing' }); return }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        // 静态托管在文件缺失时可能回退成 index.html（200 但不是 JSON），同样按「尚未生成」处理
        const body: unknown = await r.json().catch(() => undefined)
        if (body === undefined) { setLoad({ state: 'missing' }); return }
        const data = asKplAbnormal(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [attempt])
  return { ...load, retry }
}

const days = (v: number | null, n: number | null): React.ReactNode => (v == null ? '—' : <>{pct(v)}{n ? <small>{n} 日</small> : null}</>)
const tag = (text: string, strong = false): React.ReactNode => <span className={`kd-tag${strong ? ' is-strong' : ''}`}>{text}</span>

/* ---------- 顶部汇总 ---------- */
function Summary({ d }: { d: Data }): JSX.Element {
  const s = d.summary
  const lhb = d.lhb.stats
  const cells: Array<[string, React.ReactNode, React.ReactNode]> = [
    ['3 日异常波动', <><span className="mm-up">{s.d3up}</span> / <span className="mm-down">{s.d3down}</span></>, '涨 / 跌（按规则计算）'],
    ['严重异常波动', s.severe, '10 日 / 30 日 / 3 次同向'],
    ['下一交易日可能触发', <><span className="mm-up">{s.nearUp}</span> / <span className="mm-down">{s.nearDown}</span></>, '涨 / 跌，指数持平假设'],
    ['停牌 / 复牌 10 日内', <>{s.suspended ?? '—'} / {s.resumed ?? '—'}</>, '全天停牌 / 复牌后'],
    ['龙虎榜规则命中', lhb ? `${lhb.hit} / ${lhb.predicted}` : '—', d.lhb.available ? `实际上榜 ${lhb?.actual ?? '—'} 条` : '龙虎榜尚未发布'],
    ['盘口异动', s.radarTotal ?? '—', d.radar ? '当日事件数' : '收盘后当天采集'],
    ['监管问询', d.regulatory?.counts ? d.regulatory.counts.d5.inquiry + d.regulatory.counts.d5.attention + d.regulatory.counts.d5.measure + d.regulatory.counts.d5.discipline : '—', '近 5 个交易日（条）'],
  ]
  return (
    <section className="kd-summary" aria-label="异动监管总览">
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

/* ---------- 偏离值：今日已触发 ---------- */
const boardCol = <T extends { board: TriggeredRow['board'] }>(): Col<T> => ({ key: 'board', label: '板块', render: r => BOARD_LABEL[r.board] ?? r.board, sort: r => r.board })
const pctCol = <T extends { pct: number | null }>(label = '今日涨幅'): Col<T> => ({ key: 'pct', label, num: true, render: r => pct(r.pct), sort: r => r.pct, cls: r => tone(r.pct) })
const OFFICIAL: Record<string, [string, boolean]> = { d3up: ['已公布', true], d3down: ['已公布', true], severe: ['严重异常', true], none: ['未公布', false] }
const TRIG_COLS: Array<Col<TriggeredRow>> = [
  boardCol(), pctCol(),
  { key: 'trig', label: '按规则触发', render: r => (r.trig.length ? <span className="ka-tags">{r.trig.map(t => <React.Fragment key={t}>{tag(TRIG_LABEL[t] ?? t, /^d(10|30)|same3/.test(t))}</React.Fragment>)}</span> : '—') },
  { key: 'tdev', label: '触发窗口偏离', num: true, render: r => days(r.trigDev, r.trigDays), sort: r => (r.trigDev == null ? null : Math.abs(r.trigDev)), cls: r => tone(r.trigDev) },
  { key: 'd10', label: '10 日偏离', num: true, render: r => days(r.dev10, r.dev10Days), sort: r => r.dev10, cls: r => tone(r.dev10) },
  { key: 'd30', label: '30 日偏离', num: true, render: r => days(r.dev30, r.dev30Days), sort: r => r.dev30, cls: r => tone(r.dev30) },
  { key: 'off', label: '实际龙虎榜', render: r => (r.official == null ? '未发布' : tag(...(OFFICIAL[r.official] ?? ['—', false]))), sort: r => r.official },
]
function Triggered({ d }: { d: Data }): JSX.Element {
  return (
    <Card title="偏离值 · 今日已触发" as="section" className="mm-card" description="按规则计算今日构成异常波动 / 严重异常波动的个股，并与当日实际龙虎榜（交易所公开信息）对照。">
      <IndexLine d={d} />
      <StockTable label="今日已触发异常波动" rows={d.triggered} cols={TRIG_COLS} initial={{ key: 'tdev', dir: 'desc' }} empty="今日没有按规则触发的个股" />
      <p className="mm-method">{METHOD.dev}</p>
      <p className="mm-method">{METHOD.reset}</p>
    </Card>
  )
}
function IndexLine({ d }: { d: Data }): JSX.Element {
  return (
    <p className="ka-index">
      今日基准指数：{d.indices.map((x, i) => <React.Fragment key={x.board}>{i ? ' · ' : ''}{x.name} <span className={tone(x.pct)}>{pct(x.pct)}</span></React.Fragment>)}
    </p>
  )
}

/* ---------- 下一交易日可能触发 ---------- */
const needCell = (n: { need: number; price: number } | null): React.ReactNode => (n ? <>{pct(n.need)}<small>{num(n.price, 2)} 元</small></> : '—')
const nearCols = (dir: 1 | -1): Array<Col<NearRow>> => [
  boardCol(), pctCol(),
  { key: 'd3', label: '当前 3 日偏离', num: true, render: r => days(r.dev3, r.dev3Days), sort: r => r.dev3, cls: r => tone(r.dev3) },
  { key: 'need', label: dir > 0 ? '再涨多少触发' : '再跌多少触发', num: true, render: r => needCell(dir > 0 ? r.up3 : r.down3), sort: r => { const n = dir > 0 ? r.up3 : r.down3; return n ? Math.abs(n.need) : null }, cls: () => (dir > 0 ? 'mm-up' : 'mm-down') },
  { key: 'close', label: '今日收盘', num: true, render: r => num(r.close, 2) },
  { key: 'same', label: '10 日内同向异动', num: true, render: r => { const n = dir > 0 ? r.sameUp : r.sameDown; return n ? <>{n} 次{n >= 2 ? <small>再触发即严重</small> : null}</> : '—' }, sort: r => (dir > 0 ? r.sameUp : r.sameDown) },
]
function Near({ d }: { d: Data }): JSX.Element {
  const [dir, setDir] = useState<'up' | 'down'>('up')
  const rows = dir === 'up' ? d.nearUp : d.nearDown
  const total = dir === 'up' ? d.summary.nearUp : d.summary.nearDown
  return (
    <Card title="下一交易日可能触发（规则估算）" as="section" className="mm-card" description="假设今日按收盘价、下一交易日基准指数持平，个股再涨 / 跌多少会触发 3 日异常波动（也就是会因「连续三个交易日偏离值累计」上龙虎榜）。机械计算，不是预测。">
      <Segmented items={[{ id: 'up', label: `涨方向 ${d.summary.nearUp}` }, { id: 'down', label: `跌方向 ${d.summary.nearDown}` }]} value={dir} onChange={setDir} label="触发方向" />
      <div className="kd-list">
        <StockTable key={dir} label={dir === 'up' ? '下一交易日可能触发：涨方向' : '下一交易日可能触发：跌方向'} rows={rows} cols={nearCols(dir === 'up' ? 1 : -1)} initial={{ key: 'need', dir: 'asc' }} empty="没有在涨跌幅限制内能触发的个股" />
      </div>
      {total > rows.length && <p className="mm-method">共 {total} 只，按所需涨跌幅从小到大列出前 {rows.length} 只。</p>}
      <p className="mm-method">{METHOD.near}</p>
    </Card>
  )
}

/* ---------- 严重异常波动观察 ---------- */
const SEVERE_COLS: Array<Col<SevereRow>> = [
  boardCol(), pctCol(),
  { key: 'd10', label: '10 日偏离', num: true, render: r => days(r.dev10, r.dev10Days), sort: r => r.dev10, cls: r => tone(r.dev10) },
  { key: 'd30', label: '30 日偏离', num: true, render: r => days(r.dev30, r.dev30Days), sort: r => r.dev30, cls: r => tone(r.dev30) },
  { key: 'n10', label: '10 日再涨 / 跌', num: true, render: r => <>{needCell(r.up10)}{r.down10 ? <> · {needCell(r.down10)}</> : null}</> },
  { key: 'n30', label: '30 日再涨 / 跌', num: true, render: r => <>{needCell(r.up30)}{r.down30 ? <> · {needCell(r.down30)}</> : null}</> },
  { key: 'same', label: '同向异动', render: r => (r.sameNext ? tag(`已 ${Math.max(r.sameUp, r.sameDown)} 次，再触发即严重`, true) : '—') },
]
function Severe({ d }: { d: Data }): JSX.Element {
  return (
    <Card title="严重异常波动观察" as="section" className="mm-card" description="下一交易日在涨跌幅限制内就可能构成严重异常波动的个股（同样假设指数持平）。">
      <StockTable label="严重异常波动观察" rows={d.severeWatch} cols={SEVERE_COLS} initial={{ key: 'd10', dir: 'desc' }} empty="目前没有下一交易日就可能构成严重异常波动的个股" />
      <p className="mm-method">{METHOD.severe}</p>
    </Card>
  )
}

/* ---------- 停牌 / 复牌 ---------- */
const reasonCol: Col<SuspendRow> = { key: 'reason', label: '原因', render: r => r.reason || '—' }
const SUSPEND_COLS: Record<'today' | 'intraday' | 'resumed', Array<Col<SuspendRow>>> = {
  today: [
    { key: 'market', label: '市场', render: r => r.market || '—' },
    { key: 'start', label: '停牌起', num: true, render: r => r.start, sort: r => r.start },
    { key: 'days', label: '已停（交易日）', num: true, render: r => num(r.days ?? null), sort: r => r.days ?? null },
    { key: 'resume', label: '预计复牌', num: true, render: r => r.resume ?? '未定' },
    { key: 'kind', label: '类型', render: r => r.kind || '—' }, reasonCol,
  ],
  intraday: [
    { key: 'market', label: '市场', render: r => r.market || '—' },
    { key: 'time', label: '停牌时间', num: true, render: r => `${r.startTime ?? '—'}–${r.endTime ?? '—'}`, sort: r => r.startTime }, reasonCol,
  ],
  resumed: [
    { key: 'resume', label: '复牌日', num: true, render: r => r.resume ?? '—', sort: r => r.resume },
    { key: 'nth', label: '复牌第几日', num: true, render: r => (r.nth ? `第 ${r.nth} 日` : '—'), sort: r => r.nth ?? null },
    { key: 'since', label: '复牌以来', num: true, render: r => pct(r.since ?? null), sort: r => r.since ?? null, cls: r => tone(r.since ?? null) },
    { key: 'dev3', label: '3 日偏离', num: true, render: r => pct(r.dev3 ?? null), sort: r => r.dev3 ?? null, cls: r => tone(r.dev3 ?? null) },
    { key: 'sd', label: '停牌（交易日）', num: true, render: r => num(r.suspendedDays ?? null) }, reasonCol,
  ],
}
function Suspend({ d }: { d: Data }): JSX.Element {
  const [view, setView] = useState<'today' | 'intraday' | 'resumed'>('today')
  const sp = d.suspend
  return (
    <Card title="停牌 / 复牌" as="section" className="mm-card">
      {!sp ? <p className="mm-empty">停复牌信息本次未取到</p> : (
        <>
          <Segmented items={[{ id: 'today', label: `当日停牌 ${sp.today.length}` }, { id: 'intraday', label: `盘中停牌 ${sp.intraday.length}` }, { id: 'resumed', label: `复牌 10 日内 ${sp.resumed.length}` }]} value={view} onChange={setView} label="停复牌分类" />
          <div className="kd-list">
            <StockTable key={view} label={{ today: '当日停牌', intraday: '当日盘中停牌', resumed: '复牌 10 日内' }[view]} rows={sp[view]} cols={SUSPEND_COLS[view]} empty="暂无" />
          </div>
        </>
      )}
      <p className="mm-method">{METHOD.suspend}</p>
    </Card>
  )
}

/* ---------- 会不会上龙虎榜 ---------- */
function Lhb({ d }: { d: Data }): JSX.Element {
  const { rows, missed, stats, backtest, available } = d.lhb
  const [only, setOnly] = useState<'all' | 'miss'>('all')
  const shown = only === 'miss' ? rows.filter(r => r.hit === false) : rows
  return (
    <Card title="会不会上龙虎榜（盘后版）" as="section" className="mm-card" description="按交易所龙虎榜上榜规则判断今日「按规则应上榜」的条目，并与当日实际龙虎榜逐条对照。下一交易日可能因 3 日偏离累计上榜的个股见上方「下一交易日可能触发」。">
      <p className="ka-index">
        {available && stats
          ? <>今日按规则 {stats.predicted} 条，实际上榜（本页建模的类别）{stats.actual} 条，命中 {stats.hit} 条：准确率 {pct(stats.precision, 1, false)}、覆盖率 {pct(stats.recall, 1, false)}。</>
          : '今日龙虎榜尚未发布（约北京 17:00–18:30），先列出按规则判断的名单。'}
        {backtest && backtest.days > 0 && <> 回测 {backtest.from} 至 {backtest.to} 共 {backtest.days} 个交易日的 3 日异常波动：计算 {backtest.calc} 只次、实际 {backtest.actual}、命中 {backtest.hit}（{pct(backtest.precision, 1, false)} / {pct(backtest.recall, 1, false)}）。</>}
      </p>
      {available && <Segmented items={[{ id: 'all', label: `全部 ${rows.length}` }, { id: 'miss', label: `未上榜 ${rows.filter(r => r.hit === false).length}` }]} value={only} onChange={setOnly} label="上榜对照筛选" />}
      <div className="kd-list">
        {shown.length ? (
          <TableWrap label="按规则应上榜与实际对照" stickyFirst className="kd-wrap">
            <table className="ui-table kd-table">
              <thead><tr><th scope="col">名称</th><th scope="col">板块</th><th scope="col">规则</th><th scope="col" className="num">数值</th><th scope="col">实际</th></tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={`${r.code}|${r.cat}`}>
                    <th scope="row" className="kd-name">{r.name}<small>{r.code}</small></th>
                    <td>{BOARD_LABEL[r.board] ?? r.board}</td>
                    <td>{CAT_LABEL[r.cat] ?? r.cat}</td>
                    <td className={`num ${/turn|amp/.test(r.cat) ? '' : tone(r.value)}`.trim()}>{/turn|amp/.test(r.cat) ? pct(r.value, 2, false) : pct(r.value)}</td>
                    <td>{r.hit == null ? '未发布' : r.hit ? <span className="ka-hit">✓ 上榜</span> : <span className="ka-miss">✗ 未上榜</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : <p className="mm-empty">暂无</p>}
      </div>
      {missed.length > 0 && (
        <p className="mm-method">实际上榜但规则没判出：{missed.map((m, i) => <React.Fragment key={`${m.code}|${m.cat}`}>{i ? '、' : ''}{m.name}（{m.code}，{CAT_LABEL[m.cat] ?? m.cat}）</React.Fragment>)}。常见原因是并列时交易所按更多位小数排序、换手率口径不同。</p>
      )}
      <p className="mm-method">{METHOD.lhb}</p>
      <p className="mm-method">{METHOD.backtest} 席位明细见 <Link to="/market-mood/lhb">龙虎榜</Link>。</p>
    </Card>
  )
}

/* ---------- 盘中异动雷达 ---------- */
function RadarCard({ radar }: { radar: Radar | null }): JSX.Element {
  const types = radar?.types ?? []
  const [id, setId] = useState<number>(4)
  const current = types.find(t => t.id === id) ?? types[0]
  const points = useMemo(() => (radar && current ? radar.buckets.map(b => ({ date: b.t, value: b.c[String(current.id)] ?? 0 })) : []), [radar, current])
  if (!radar || !current) {
    return (
      <Card title="盘中异动雷达（盘后回放）" as="section" className="mm-card">
        <p className="mm-empty">盘口异动只能在交易日收盘后当天采集，本次还没有数据。</p>
        <p className="mm-method">{METHOD.radar}</p>
      </Card>
    )
  }
  const top = radar.top[String(current.id)] ?? []
  const big = current.id === 8193 || current.id === 8194
  const cols: Array<Col<(typeof top)[number]>> = [
    { key: 'n', label: '次数', num: true, render: r => num(r.n), sort: r => r.n },
    { key: 'first', label: '首次', num: true, render: r => r.first, sort: r => r.first },
    { key: 'last', label: '最后', num: true, render: r => r.last, sort: r => r.last },
    ...(big ? [{ key: 'amt', label: '合计金额', num: true, render: (r: (typeof top)[number]) => money(r.amount), sort: (r: (typeof top)[number]) => r.amount }] : []),
  ]
  return (
    <Card title="盘中异动雷达（盘后回放）" as="section" className="mm-card" description={`${radar.date} 东财盘口异动共 ${radar.total} 条。点类型查看分布和事件最多的个股。`}>
      <div className="ka-chips" role="group" aria-label="异动类型">
        {types.map(t => (
          <button key={t.id} type="button" className={`ka-chip ${t.dir > 0 ? 'is-up' : 'is-down'}`} aria-pressed={t.id === current.id} onClick={() => setId(t.id)}>
            {t.name} <strong>{t.count}</strong>
          </button>
        ))}
      </div>
      <MoodChart points={points} label={`${current.name}半小时分布`} format={v => v.toFixed(0)} kind="bar" colorBy="sign" tick={t => t} />
      <h3 className="ka-sub">{current.name}次数最多的个股</h3>
      <StockTable key={current.id} label={`${current.name}个股`} rows={top} cols={cols} initial={{ key: 'n', dir: 'desc' }} />
      {radar.timeline.length > 0 && (
        <>
          <h3 className="ka-sub">封板 / 开板时间线（前 {Math.min(radar.timeline.length, 60)} 条）</h3>
          <ol className="ka-timeline">
            {radar.timeline.slice(0, 60).map((e, i) => (
              <li key={`${e.time}|${e.code}|${i}`}><time>{e.time}</time> {e.name} <span className={e.type === 4 ? 'mm-up' : 'mm-down'}>{e.type === 4 ? '封涨停板' : '打开涨停板'}</span>{e.price != null ? ` ${num(e.price, 2)} 元` : ''}</li>
            ))}
          </ol>
        </>
      )}
      <p className="mm-method">{METHOD.radar} 半小时分布：09:15 段为集合竞价，11:00 段含 11:00–11:30，14:30 段含收盘集合竞价。</p>
    </Card>
  )
}

/* ---------- 监管问询 ---------- */
const REG_LABEL: Record<RegKind, string> = { inquiry: '问询函', attention: '关注函', measure: '监管措施', discipline: '纪律处分' }
const REG_SRC: Record<RegItem['src'], string> = { sse: '上交所', szse: '深交所', cninfo: '巨潮' }
type RegView = 'all' | 'ask' | 'measure' | 'discipline'
const REG_VIEW: Record<RegView, (r: RegItem) => boolean> = {
  all: () => true, ask: r => r.kind === 'inquiry' || r.kind === 'attention', measure: r => r.kind === 'measure', discipline: r => r.kind === 'discipline',
}
function RegCounts({ reg }: { reg: Regulatory }): JSX.Element | null {
  if (!reg.counts) return null
  const rows = [['近 5 个交易日', reg.counts.d5], ['近 20 个交易日', reg.counts.d20]] as const
  return (
    <TableWrap label="监管问询分类计数" stickyFirst>
      <table className="ui-table kd-table">
        <thead><tr><th scope="col">区间</th><th scope="col" className="num">问询函</th><th scope="col" className="num">关注函</th><th scope="col" className="num">监管措施</th><th scope="col" className="num">纪律处分</th><th scope="col" className="num">涉及公司</th><th scope="col" className="num">其中回复公告</th></tr></thead>
        <tbody>
          {rows.map(([k, c]) => (
            <tr key={k}>
              <th scope="row" className="kd-name">{k}<small>{c.from} 起</small></th>
              <td className="num">{c.inquiry}</td><td className="num">{c.attention}</td><td className="num">{c.measure}</td><td className="num">{c.discipline}</td><td className="num">{c.companies}</td><td className="num">{c.replies}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}
/** 近期被问询（问询函 / 关注函，含回复公告）公司的今日表现：按公司去重后的涨跌家数，只是统计 */
function askedToday(items: RegItem[]): { n: number; up: number; down: number; flat: number; none: number } {
  const seen = new Map<string, number | null>()
  for (const r of items) if ((r.kind === 'inquiry' || r.kind === 'attention') && !seen.has(r.code)) seen.set(r.code, r.pct)
  const v = [...seen.values()]
  return { n: v.length, up: v.filter(x => x != null && x > 0).length, down: v.filter(x => x != null && x < 0).length, flat: v.filter(x => x === 0).length, none: v.filter(x => x == null).length }
}
function RegulatoryCard({ d }: { d: Data }): JSX.Element {
  const [view, setView] = useState<RegView>('all')
  const reg = d.regulatory
  if (!reg) {
    return (
      <Card title="监管问询（近 30 日）" as="section" className="mm-card">
        <EmptyState title="监管问询数据暂缺">{d.regulatoryNote ?? '本次没有取到交易所监管信息，下次收盘后运行时会再试。'}</EmptyState>
        <p className="mm-method">{METHOD.regulatory}</p>
      </Card>
    )
  }
  const rows = reg.items.filter(REG_VIEW[view])
  const asked = askedToday(reg.items)
  const failed = reg.sources.filter(s => !s.ok)
  const count = (v: RegView): number => reg.items.filter(REG_VIEW[v]).length
  return (
    <Card title="监管问询（近 30 日）" as="section" className="mm-card" description={`${reg.from} 至 ${reg.to} 沪深交易所公开的问询函、关注函、监管函 / 监管措施与纪律处分，按日期倒序；「今日涨幅」为 ${d.date} 收盘行情。`}>
      <RegCounts reg={reg} />
      <p className="ka-index">
        近 30 日被问询（问询函 / 关注函，含回复公告）的公司 {asked.n} 家，今日 <span className="mm-up">上涨 {asked.up}</span> · <span className="mm-down">下跌 {asked.down}</span>{asked.flat ? ` · 平盘 ${asked.flat}` : ''}{asked.none ? ` · 停牌或无行情 ${asked.none}` : ''}。
      </p>
      {(reg.partial || failed.length > 0) && (
        <p className="ka-warn" role="status">
          本次未取到：{failed.map(s => s.label).join('、') || '部分来源'}。{failed.some(s => s.id === 'szse') ? '深交所网站在境外服务器上经常连接失败，深市条目暂以此前存档和巨潮回复公告为准。' : ''}{d.regulatoryNote ? ` ${d.regulatoryNote}` : ''}
        </p>
      )}
      <Segmented
        items={[{ id: 'all', label: `全部 ${count('all')}` }, { id: 'ask', label: `问询 / 关注 ${count('ask')}` }, { id: 'measure', label: `监管措施 ${count('measure')}` }, { id: 'discipline', label: `纪律处分 ${count('discipline')}` }]}
        value={view} onChange={setView} label="监管问询分类"
      />
      <div className="kd-list">
        {rows.length ? (
          <TableWrap label="监管问询列表" stickyFirst className="kd-wrap">
            <table className="ui-table kd-table ka-reg">
              <thead><tr><th scope="col">名称</th><th scope="col">日期</th><th scope="col">类型</th><th scope="col" className="num">今日涨幅</th><th scope="col" className="num">3 日偏离</th><th scope="col">标题 / 文件</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.ex}|${r.code}|${r.date}|${r.url ?? r.title}|${i}`}>
                    <th scope="row" className="kd-name">{r.name || '—'}<small>{r.code}</small></th>
                    <td className="num">{r.date}</td>
                    <td><span className="ka-tags">{tag(REG_LABEL[r.kind], r.kind === 'discipline')}{r.reply ? tag('回复公告') : null}</span><small className="ka-type">{r.type}</small></td>
                    <td className={`num ${tone(r.pct)}`.trim()}>{pct(r.pct)}</td>
                    <td className={`num ${tone(r.dev3)}`.trim()}>{pct(r.dev3)}</td>
                    <td className="ka-title">
                      {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : <>{r.title}<small>（未公开全文）</small></>}
                      {r.replyUrl && <> · <a href={r.replyUrl} target="_blank" rel="noreferrer">公司回复</a></>}
                      <small>{REG_SRC[r.src]}{r.reply ? ' · 公司公告，非函件原文' : ''}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : <p className="mm-empty">近 30 日这一类暂无</p>}
      </div>
      <p className="mm-method">
        来源状态：{reg.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '；' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> {s.ok ? `${s.n ?? '—'} 条` : '未取到'}</React.Fragment>)}。
      </p>
      <p className="mm-method">{METHOD.regulatory}</p>
    </Card>
  )
}

/* ---------- 规则 ---------- */
function Rules(): JSX.Element {
  return (
    <Card title="规则（沪深交易所，2026-11 查证）" as="section" className="mm-card">
      <TableWrap label="异常波动与龙虎榜规则" stickyFirst>
        <table className="ui-table kd-table">
          <thead><tr><th scope="col">板块</th><th scope="col">基准指数</th><th scope="col">3 日异常波动</th><th scope="col">龙虎榜日榜（各前五）</th><th scope="col">振幅</th><th scope="col">换手率</th></tr></thead>
          <tbody>{RULES.map(r => <tr key={r.board}><th scope="row" className="kd-name">{r.board}</th><td>{r.index}</td><td>{r.d3}</td><td>{r.daily}</td><td>{r.amp}</td><td>{r.turn}</td></tr>)}</tbody>
        </table>
      </TableWrap>
      <p className="mm-method">严重异常波动（各板块）：10 日内 3 次同向异常波动；10 日偏离累计 +100% / −50%；30 日 +200% / −70%。2026-07-06 起主板 ST 股涨跌幅限制改为 10%，异常波动指标与主板其他股票一致（原为 ±12%）。北交所规则不同，未纳入。</p>
      <ul className="ka-links">{RULE_SOURCES.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>
    </Card>
  )
}

/* ---------- 每日走势 ---------- */
const METRICS: Array<{ id: string; label: string; pick: (h: HistoryDay) => number | null }> = [
  { id: 'd3up', label: '3 日涨幅异动', pick: h => h.d3up },
  { id: 'd3down', label: '3 日跌幅异动', pick: h => h.d3down },
  { id: 'nearUp', label: '可能触发（涨）', pick: h => h.nearUp },
  { id: 'nearDown', label: '可能触发（跌）', pick: h => h.nearDown },
  { id: 'suspended', label: '停牌', pick: h => h.suspended },
  { id: 'radar', label: '盘口异动', pick: h => h.radarTotal },
]
function Trend({ d }: { d: Data }): JSX.Element {
  const [id, setId] = useState('d3up')
  const m = METRICS.find(x => x.id === id) ?? METRICS[0]
  return (
    <Card title="每日走势" as="section" className="mm-card">
      <Segmented items={METRICS.map(x => ({ id: x.id, label: x.label }))} value={id} onChange={setId} label="走势指标" />
      <MoodChart points={d.history.map(h => ({ date: h.date, value: m.pick(h), muted: !!h.kline }))} label={`${m.label}走势`} format={v => v.toFixed(0)} zeroBase kind="bar" />
      <p className="mm-method">从本页开始采集之日起逐日累计。偏离值所需的逐日涨跌幅存档{d.archive ? `为 ${d.archive.from} 至 ${d.archive.to} 共 ${d.archive.days} 个交易日，其中 ${d.archive.backfilled} 天由东财日 K 补出` : '尚未建立'}；浅色柱为当日用日 K（而非收盘快照）计算的日子。</p>
    </Card>
  )
}

export default function KplAbnormal(): JSX.Element {
  const load = useAbnormal()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 异动监管</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'missing' && <EmptyState title="异动监管数据尚未生成">交易日收盘后（北京 15:10 之后）运行数据脚本，这里就会显示偏离值、停复牌、龙虎榜规则对照和盘口异动。</EmptyState>}
      {load.state === 'error' && (
        <LoadError reason="异动监管这份读数现在拿不到。" detail={load.message} onRetry={load.retry} />
      )}
      {load.state === 'ok' && <Body d={load.data} />}
    </Page>
  )
}

function Body({ d }: { d: Data }): JSX.Element {
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.date]} note="收盘后更新" />
      <Summary d={d} />
      <Triggered d={d} />
      <Near d={d} />
      <Severe d={d} />
      <Lhb d={d} />
      <Suspend d={d} />
      <RadarCard radar={d.radar} />
      <RegulatoryCard d={d} />
      <Rules />
      <Trend d={d} />
      <Callout title="口径与来源">
        <p>{d.note}</p>
        <p>{METHOD.skipped}</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。另见 <Link to="/market-mood/lhb">龙虎榜</Link>、<Link to="/market-mood/daban">打板</Link>。</p>
      </Callout>
    </>
  )
}
