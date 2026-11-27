// 开盘啦 · 复盘（/market-mood/review）：功能对照开盘啦 App「复盘」区——图解复盘汇总、赚钱效应、盘面亮点标签（含标签次日表现历史）、
// 亏钱效应、百日新高、盘中涨停 / 跌停家数曲线（按股池时间还原的近似）。
// 数据：public/data/kpl-review.json（scripts/kpl-review.mjs 收盘后生成）。盘后统计，不是买卖建议。
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, LoadError, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import { asKplReview, METHOD, type HistoryDay, type KplReview as Data, type TagStock } from '../../features/kpl-review/model'
import StockTable, { num, pct, tone, type Col } from '../../features/kpl-daban/StockTable'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/kpl-review.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ok'; data: Data }

function useReview(): Load & { retry: () => void } {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoad({ state: 'loading' }); setAttempt(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-review.json`, { cache: 'no-cache', signal: controller.signal })
      .then(async r => {
        if (r.status === 404) { setLoad({ state: 'missing' }); return }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        // 静态托管在文件缺失时可能回退成 index.html（200 但不是 JSON），同样按「尚未生成」处理
        const body: unknown = await r.json().catch(() => undefined)
        if (body === undefined) { setLoad({ state: 'missing' }); return }
        const data = asKplReview(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [attempt])
  return { ...load, retry }
}

const rateTxt = (x: number | null | undefined): string => pct(x, 1, false)
const cnt = (x: number | null | undefined): string => num(x)

/* ---------- 图解复盘：一屏汇总 ---------- */
function Overview({ d }: { d: Data }): JSX.Element {
  const s = d.summary
  const cells: Array<{ k: string; v: React.ReactNode; sub: React.ReactNode; cls?: string; to?: string }> = [
    { k: '涨停', v: s.zt, sub: `最高 ${s.maxBoard ?? '—'} 板`, cls: 'mm-up', to: '/market-mood/daban' },
    { k: '跌停', v: s.dt, sub: `跌超 7% ${s.drop7} 家`, cls: 'mm-down', to: '/market-mood/daban' },
    { k: '打板成功率', v: rateTxt(s.sealRate), sub: `炸板 ${s.zb} 家` },
    { k: '昨日涨停今日盈利率', v: rateTxt(s.yztProfit), sub: <>平均 <span className={tone(s.yztAvg)}>{pct(s.yztAvg)}</span></> },
    { k: '首板→二板', v: rateTxt(s.firstToSecond), sub: `${s.firstOk} / ${s.first}` },
    { k: '大面', v: s.bigLoss, sub: '昨日涨停今跌 ≤ −7%', cls: s.bigLoss ? 'mm-down' : undefined },
    { k: '百日新高', v: cnt(s.newHigh), sub: s.newHighFresh == null ? '当日新增 —' : `当日新增 ${s.newHighFresh}` },
    { k: '昨日涨停开盘', v: <span className={tone(s.openAvg)}>{pct(s.openAvg)}</span>, sub: `高开占比 ${rateTxt(s.openHighRate)}` },
  ]
  return (
    <Card title="图解复盘" as="section" className="mm-card" description={`${d.asOf} 收盘后的关键数字，口径见下方各部分。`}>
      <div className="rv-overview" role="list" aria-label="复盘总览">
        {cells.map(c => (
          <div key={c.k} className="kd-summary__cell" role="listitem">
            <span className="kd-summary__label">{c.to ? <Link to={c.to}>{c.k}</Link> : c.k}</span>
            <strong className={`kd-summary__value ${c.cls ?? ''}`}>{c.v}</strong>
            <span className="kd-summary__sub">{c.sub}</span>
          </div>
        ))}
      </div>
      <p className="rv-links">
        更多：<Link to="/market-mood">市场情绪</Link>（连板天梯、风向标）· <Link to="/market-mood/daban">打板</Link>（涨停 / 炸板 / 跌停列表）· <Link to="/market-mood/plates">板块题材</Link>（板块核心）· <Link to="/market-mood/lhb">龙虎榜</Link>（龙虎榜动向）
      </p>
    </Card>
  )
}

/* ---------- 走势（单指标切换） ---------- */
type Metric = { id: string; label: string; pick: (h: HistoryDay) => number | null; format: (v: number) => string; kind?: 'line' | 'bar'; colorBy?: 'change' | 'sign' }
function Trend({ d, metrics, label, note }: { d: Data; metrics: Metric[]; label: string; note?: string }): JSX.Element {
  const [id, setId] = useState(metrics[0].id)
  const m = metrics.find(x => x.id === id) ?? metrics[0]
  return (
    <div className="rv-trend">
      <Segmented items={metrics.map(x => ({ id: x.id, label: x.label }))} value={id} onChange={setId} label={label} />
      <MoodChart points={d.history.map(h => ({ date: h.date, value: m.pick(h), muted: !!h.seeded }))} label={`${m.label}走势`} format={m.format} kind={m.kind} colorBy={m.colorBy} />
      <p className="mm-method">浅色 / 虚线为补算的日子（每日复盘归档、打板页历史与快照仓回推）。{note}</p>
    </div>
  )
}
const pctFmt = (v: number): string => `${v.toFixed(0)}%`
const intFmt = (v: number): string => v.toFixed(0)

/* ---------- 赚钱效应 ---------- */
function Effect({ d }: { d: Data }): JSX.Element {
  const s = d.summary, o = d.openDist
  const max = o ? Math.max(1, ...o.buckets.map(b => b.count)) : 1
  return (
    <Card title="赚钱效应" as="section" className="mm-card">
      <dl className="rv-stats">
        <div><dt>打板成功率</dt><dd>{rateTxt(s.sealRate)}<small>{s.zt} / {s.zt + s.zb}</small></dd></div>
        <div><dt>昨日涨停今日盈利率</dt><dd>{rateTxt(s.yztProfit)}<small>昨日涨停 {s.yzt} 家</small></dd></div>
        <div><dt>昨日涨停今日平均</dt><dd className={tone(s.yztAvg)}>{pct(s.yztAvg)}</dd></div>
        <div><dt>首板→二板</dt><dd>{rateTxt(s.firstToSecond)}<small>{s.firstOk} / {s.first}</small></dd></div>
      </dl>
      <h3 className="rv-sub">昨日非一字涨停今日开盘分布</h3>
      {o ? (
        <>
          <p className="mm-split__legend"><span className="mm-up">高开 {o.high}</span><span>平开 {o.flat}</span><span className="mm-down">低开 {o.low}</span><span>平均 {pct(o.avg)}</span><span>剔除昨日一字 {o.oneWord}</span></p>
          <ul className="mm-buckets rv-buckets" aria-label="开盘涨跌幅分布">
            {o.buckets.map(b => {
              const h = Math.max((b.count / max) * 100, b.count ? 2 : 0)
              const cls = b.id === 'flat' ? 'is-flat' : b.id.startsWith('p') || b.id === 'ge5' ? 'is-up' : 'is-down'
              return (
                <li key={b.id}>
                  <span className="mm-buckets__n">{b.count}</span>
                  <svg className="mm-buckets__col" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true"><rect className={cls} x="0" y={100 - h} width="10" height={h} rx="1.5" /></svg>
                  <span className="mm-buckets__label">{b.label}</span>
                </li>
              )
            })}
          </ul>
        </>
      ) : <p className="mm-empty">缺上一交易日的全市场快照，无法剔除一字板，今日不给出分布。</p>}
      <Trend d={d} label="赚钱效应走势" metrics={[
        { id: 'seal', label: '打板成功率', pick: h => h.sealRate, format: pctFmt, kind: 'line' },
        { id: 'profit', label: '昨日涨停盈利率', pick: h => h.yztProfit, format: pctFmt, kind: 'line' },
        { id: 'avg', label: '昨日涨停平均', pick: h => h.yztAvg, format: v => `${v.toFixed(1)}%`, kind: 'bar', colorBy: 'sign' },
        { id: 'first', label: '首板→二板', pick: h => h.firstToSecond, format: pctFmt, kind: 'line' },
        { id: 'open', label: '高开占比', pick: h => h.openHighRate, format: pctFmt, kind: 'line' },
      ]} />
      <p className="mm-method">{METHOD.effect}</p>
      <p className="mm-method">{METHOD.open}</p>
    </Card>
  )
}

/* ---------- 盘面亮点 ---------- */
const TAG_COLS: Array<Col<TagStock>> = [
  { key: 'pct', label: '涨幅', num: true, render: r => pct(r.pct), sort: r => r.pct, cls: r => tone(r.pct) },
  { key: 'boards', label: '连板', num: true, render: r => (r.boards == null ? '—' : r.boards === 1 ? '首板' : `${r.boards}连板`), sort: r => r.boards },
  { key: 'sector', label: '行业', render: r => r.sector || '—', sort: r => r.sector || null },
  { key: 'why', label: '备注', render: r => r.why ?? '' },
]
function Highlights({ d }: { d: Data }): JSX.Element {
  const first = d.tags.find(t => t.stocks.length) ?? d.tags[0]
  const [id, setId] = useState(first?.id ?? '')
  const tag = d.tags.find(t => t.id === id) ?? first
  const ts = d.tagStats
  return (
    <Card title="盘面亮点" as="section" className="mm-card" description="按规则给当日个股打标签；红色标签为正面、绿色为负面。">
      <Segmented items={d.tags.map(t => ({ id: t.id, label: `${t.label} ${t.stocks.length}` }))} value={tag?.id ?? ''} onChange={setId} label="盘面亮点标签" />
      {tag && (
        <div className="kd-list">
          <p className={`rv-tagdef ${tag.polarity === 'up' ? 'is-up' : 'is-down'}`}><b>{tag.label}</b>：{tag.def}</p>
          <StockTable label={`${tag.label}个股`} rows={tag.stocks} cols={TAG_COLS} initial={{ key: 'pct', dir: tag.polarity === 'up' ? 'desc' : 'asc' }} empty="今日没有符合该标签的股票" />
        </div>
      )}
      <h3 className="rv-sub">标签次日表现（历史统计）</h3>
      <p className="mm-method">{ts.days ? `样本：${ts.from} 至 ${ts.to} 共 ${ts.days} 个交易日的标签股，在下一交易日的表现。` : '从本页开始采集之日起逐日累积，下一交易日收盘后出现第一批样本。'}</p>
      <TableWrap label="标签次日表现">
        <table className="ui-table kd-table">
          <thead><tr><th scope="col">标签</th><th scope="col" className="num">样本数</th><th scope="col" className="num">覆盖天数</th><th scope="col" className="num">次日平均涨跌</th><th scope="col" className="num">次日红盘率</th></tr></thead>
          <tbody>
            {ts.rows.map(r => (
              <tr key={r.id}>
                <th scope="row" className={`kd-name rv-tagname ${r.polarity === 'up' ? 'is-up' : 'is-down'}`}>{r.label}</th>
                <td className="num">{r.n}</td><td className="num">{r.days}</td>
                <td className={`num ${tone(r.avg)}`}>{pct(r.avg)}</td><td className="num">{rateTxt(r.red)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="mm-method">{METHOD.tagStats}</p>
    </Card>
  )
}

/* ---------- 亏钱效应 ---------- */
function Loss({ d }: { d: Data }): JSX.Element {
  const s = d.summary
  return (
    <Card title="亏钱效应" as="section" className="mm-card">
      <dl className="rv-stats">
        <div><dt>大面</dt><dd className={s.bigLoss ? 'mm-down' : undefined}>{s.bigLoss}<small>家</small></dd></div>
        <div><dt>跌停</dt><dd className="mm-down">{s.dt}<small>家</small></dd></div>
        <div><dt>炸板率</dt><dd>{rateTxt(s.brokenRate)}<small>炸板 {s.zb}</small></dd></div>
        <div><dt>跌超 7%</dt><dd>{s.drop7}<small>家</small></dd></div>
      </dl>
      <Trend d={d} label="亏钱效应走势" metrics={[
        { id: 'big', label: '大面', pick: h => h.bigLoss, format: intFmt, kind: 'bar' },
        { id: 'dt', label: '跌停', pick: h => h.dt, format: intFmt, kind: 'bar' },
        { id: 'broken', label: '炸板率', pick: h => h.brokenRate, format: pctFmt, kind: 'line' },
        { id: 'drop7', label: '跌超 7%', pick: h => h.drop7, format: intFmt, kind: 'bar' },
      ]} note="柱色按较前一日增减：红 = 比前一日多，绿 = 比前一日少。" />
      <p className="mm-method">{METHOD.loss} 大幅回撤个股见 <Link to="/market-mood">市场情绪</Link>。</p>
    </Card>
  )
}

/* ---------- 百日新高 ---------- */
function NewHighs({ d }: { d: Data }): JSX.Element {
  const n = d.newHigh, c = d.closes
  const progress = c ? (c.complete ? `快照仓 ${c.from} 至 ${c.to}，共 ${c.days} 个交易日。` : `快照仓回补中：已补 ${c.done} / ${c.universe} 只股票（截至 ${c.end ?? '—'}），补齐后开始计算。`) : ''
  return (
    <Card title="百日新高" as="section" className="mm-card" description={progress}>
      {n ? (
        <>
          <dl className="rv-stats">
            <div><dt>当日百日新高</dt><dd className="mm-up">{n.count}<small>家</small></dd></div>
            <div><dt>当日新增</dt><dd>{cnt(n.fresh)}<small>家</small></dd></div>
            <div><dt>参与统计</dt><dd>{n.eligible}<small>家</small></dd></div>
          </dl>
          <Trend d={d} label="百日新高走势" metrics={[
            { id: 'nh', label: '新高家数', pick: h => h.newHigh, format: intFmt, kind: 'bar' },
            { id: 'fresh', label: '当日新增', pick: h => h.newHighFresh, format: intFmt, kind: 'bar' },
          ]} note="走势从快照仓满 100 个交易日的那天开始。" />
          <h3 className="rv-sub">按行业</h3>
          <ul className="rv-groups" aria-label="百日新高按行业">
            {n.groups.map(g => (
              <li key={g.industry} className="rv-group">
                <details>
                  <summary><b>{g.industry}</b> <span>{g.count} 家</span></summary>
                  <ul className="rv-chips">
                    {g.stocks.map(s => (
                      <li key={s.code}><span>{s.name}</span><small>{s.code}</small> <span className={tone(s.pct)}>{pct(s.pct)}</span>{s.fresh ? <span className="kd-tag is-strong">新增</span> : null}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="mm-empty">{c && !c.complete ? '全市场日线快照仓还在回补，补齐后显示百日新高。' : '暂无百日新高数据。'}</p>}
      <p className="mm-method">{METHOD.newHigh}</p>
    </Card>
  )
}

/* ---------- 盘中家数曲线 ---------- */
const INTRA = [
  { id: 'zt', label: '涨停' }, { id: 'touched', label: '曾涨停' }, { id: 'dt', label: '跌停' },
] as const
function Intraday({ d }: { d: Data }): JSX.Element | null {
  const [id, setId] = useState<(typeof INTRA)[number]['id']>('zt')
  const intra = d.intraday
  if (!intra) return null
  const m = INTRA.find(x => x.id === id) ?? INTRA[0]
  return (
    <Card title="盘中涨停 / 跌停家数" as="section" className="mm-card">
      <Segmented items={INTRA.map(x => ({ id: x.id, label: x.label }))} value={id} onChange={setId} label="盘中家数" />
      <MoodChart points={intra.points.map(p => ({ date: p.t, value: p[id] }))} label={`盘中${m.label}累计家数`} format={intFmt} zeroBase tick={t => t} />
      <p className="mm-method">{METHOD.intraday}{intra.missing[id] ? ` 另有 ${intra.missing[id]} 只缺时间，未计入。` : ''}</p>
    </Card>
  )
}

export default function KplReview(): JSX.Element {
  const load = useReview()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 复盘</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'missing' && <EmptyState title="复盘数据尚未生成">交易日收盘后（北京 15:10 之后）首次运行数据脚本，这里就会显示赚钱效应、盘面亮点、百日新高等复盘数据。</EmptyState>}
      {load.state === 'error' && (
        <LoadError reason="复盘这份读数现在拿不到。" detail={load.message} onRetry={load.retry} />
      )}
      {load.state === 'ok' && <ReviewBody d={load.data} />}
    </Page>
  )
}

function ReviewBody({ d }: { d: Data }): JSX.Element {
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.asOf]} note="收盘后更新" />
      <Overview d={d} />
      <Effect d={d} />
      <Highlights d={d} />
      <Loss d={d} />
      <NewHighs d={d} />
      <Intraday d={d} />
      <Callout title="口径与来源">
        <p>{d.note}</p>
        <p>{METHOD.skipped}</p>
        <p>来源：{d.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。</p>
      </Callout>
    </>
  )
}
