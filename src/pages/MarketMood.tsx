// 入口名「开盘啦」（/market-mood）：功能对照开盘啦「市场情绪」页（顶部总览、综合强度、涨跌统计、涨停表现、今昨对比、市场量能、
// 活跃股走势、连板强度、大幅回撤、风向标、权重表现、融资余额）。独立页面，不改动 A股每日复盘。
// 数据：public/data/market-mood.json（scripts/market-mood.mjs 收盘后生成）。盘后统计，不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, LoadError, Page, PageDataFreshness, Segmented, TableWrap } from '../components/ui'
import { PageTitle } from '../components/ui/PageTabs'
import MoodChart, { type Point } from '../features/market-mood/MoodChart'
import KplTabs, { KPL_DISCLAIMER } from '../features/market-mood/KplTabs'
import { asMarketMood, forecastSeries, lastDays, MARKETS, METHOD, previousDay, type Amount, type MarketMood, type MoodDay, type MoodLatest } from '../features/market-mood/model'
import '../styles/market-mood.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: MarketMood }

function useMarketMood(): Load & { retry: () => void } {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoad({ state: 'loading' }); setAttempt(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/market-mood.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => {
        const data = asMarketMood(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [attempt])
  return { ...load, retry }
}

// 格式：真正的负号；涨跌按 A 股习惯红涨绿跌
const num = (x: number | null | undefined, d = 0): string => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('-', '−'))
const pct = (x: number | null | undefined, d = 2, signed = true): string => (x == null || !Number.isFinite(x) ? '—' : `${signed && x > 0 ? '+' : ''}${num(x, d)}%`)
const tone = (x: number | null | undefined): string => (x == null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
const yi = (x: number | null | undefined): string => (x == null ? '—' : x >= 10000 ? `${(x / 10000).toFixed(2)} 万亿` : `${num(x)} 亿`)
const rangeItems = [{ id: '20', label: '20 日' }, { id: '60', label: '60 日' }, { id: 'all', label: '全部' }] as const
type Range = (typeof rangeItems)[number]['id']
const sliceRange = <T extends { date: string }>(xs: T[], r: Range): T[] => (r === 'all' ? xs : lastDays(xs, Number(r)))

/* ---------- 顶部总览 ---------- */
function TopPanel({ l, hsPrev }: { l: MoodLatest; hsPrev: number | null }): JSX.Element {
  const hs = l.amount.total - l.amount.bj
  return (
    <section className="mm-top" aria-label="今日总览">
      <div className="mm-top__cell">
        <span className="mm-top__label">沪深京全A · 实际量能</span>
        <strong className="mm-top__value">{yi(l.amount.total)}</strong>
        <span className="mm-top__sub">{hsPrev ? <>沪深较上一交易日 <b className={tone(hs - hsPrev)}>{hs >= hsPrev ? '放量' : '缩量'} {yi(Math.abs(hs - hsPrev))}</b></> : '—'}</span>
      </div>
      <div className="mm-top__cell">
        <span className="mm-top__label">市场情绪（活跃股）</span>
        <strong className={`mm-top__value ${tone(l.mood)}`}>{pct(l.mood)}</strong>
        <span className={`mm-top__badge is-${l.moodStatus === '活跃' ? 'hot' : l.moodStatus === '冰点' ? 'cold' : 'mid'}`}>{l.moodStatus}</span>
      </div>
      <div className="mm-top__cell">
        <span className="mm-top__label">连板强度</span>
        <strong className="mm-top__value">{num(l.lbStrength)}</strong>
        <span className="mm-top__sub">大幅回撤 <b>{l.retreat ?? '—'}</b> 只</span>
      </div>
    </section>
  )
}

/* ---------- 综合强度（温度计 + 盘面点评） ---------- */
function Composite({ l }: { l: MoodLatest }): JSX.Element {
  const v = l.composite ?? 0
  return (
    <Card title="综合强度" as="section" className="mm-card">
      <div className="mm-thermo">
        <svg className="mm-thermo__bar" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label={`综合强度 ${num(l.composite)}，${l.zone}`}>
          <rect className="mm-thermo__track" x="0" y="0" width="100" height="8" rx="4" />
          <rect className={`mm-thermo__fill is-${l.zone === '偏热' ? 'hot' : l.zone === '偏冷' ? 'cold' : 'mid'}`} x="0" y="0" width={Math.max(2, v)} height="8" rx="4" />
          <line className="mm-thermo__mark" x1="30" x2="30" y1="0" y2="8" />
          <line className="mm-thermo__mark" x1="70" x2="70" y1="0" y2="8" />
        </svg>
        <div className="mm-thermo__scale" aria-hidden="true"><span>0 偏冷</span><span>30</span><span>中性</span><span>70</span><span>偏热 100</span></div>
        <p className="mm-thermo__value"><strong>{num(l.composite)}</strong> <span>{l.zone}</span></p>
      </div>
      <p className="mm-comment"><b>盘面点评：</b>{l.comment}</p>
      <p className="mm-method">{METHOD.composite}</p>
    </Card>
  )
}

/* ---------- 涨跌统计 ---------- */
const BUCKETS: Array<{ key: keyof MoodLatest['buckets']; label: string; up: boolean | null }> = [
  { key: 'limitUp', label: '涨停', up: true }, { key: 'above7', label: '>7%', up: true }, { key: 'from5To7', label: '5~7%', up: true },
  { key: 'from3To5', label: '3~5%', up: true }, { key: 'from0To3', label: '0~3%', up: true }, { key: 'flat', label: '平', up: null },
  { key: 'from0ToMinus3', label: '0~−3%', up: false }, { key: 'fromMinus3ToMinus5', label: '−3~−5%', up: false },
  { key: 'fromMinus5ToMinus7', label: '−5~−7%', up: false }, { key: 'belowMinus7', label: '<−7%', up: false }, { key: 'limitDown', label: '跌停', up: false },
]
function Breadth({ l }: { l: MoodLatest }): JSX.Element {
  const max = Math.max(...BUCKETS.map(b => l.buckets[b.key]), 1)
  const up = l.up ?? 0, down = l.down ?? 0, flat = l.flat ?? 0, all = up + down + flat || 1
  return (
    <Card title="涨跌统计" as="section" className="mm-card" description={<>实际涨跌停 <b className="mm-up">{l.ztReal}</b> : <b className="mm-down">{l.dtReal ?? '—'}</b>（过滤 ST 股）</>}>
      <svg className="mm-split" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={`上涨 ${up}，平盘 ${flat}，下跌 ${down}`}>
        <rect className="is-up" x="0" width={(up / all) * 100} height="4" />
        <rect className="is-flat" x={(up / all) * 100} width={(flat / all) * 100} height="4" />
        <rect className="is-down" x={((up + flat) / all) * 100} width={(down / all) * 100} height="4" />
      </svg>
      <p className="mm-split__legend"><span className="mm-up">上涨 {up}</span><span>平 {flat}</span><span className="mm-down">下跌 {down}</span><span>中位数 {pct(l.medianPct)}</span><span>停牌 {l.suspended}</span></p>
      <ul className="mm-buckets" aria-label="涨跌幅分布">
        {BUCKETS.map(b => {
          const n = l.buckets[b.key]
          return (
            <li key={b.key}>
              <span className="mm-buckets__n">{n}</span>
              <svg className="mm-buckets__col" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">
                <rect className={b.up === null ? 'is-flat' : b.up ? 'is-up' : 'is-down'} x="0" y={100 - Math.max((n / max) * 100, n ? 2 : 0)} width="10" height={Math.max((n / max) * 100, n ? 2 : 0)} rx="1.5" />
              </svg>
              <span className="mm-buckets__label">{b.label}</span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/* ---------- 涨停表现 ---------- */
function LimitUpPerf({ l }: { l: MoodLatest }): JSX.Element {
  const rows: Array<[string, number, number | null]> = [
    ['一板', l.boards.b1, null], ['二板', l.boards.b2, l.rates.r12], ['三板', l.boards.b3, l.rates.r23], ['四板', l.boards.b4, l.rates.r34], ['高度板', l.boards.high, l.rates.rHigh],
  ]
  return (
    <Card title="涨停表现" as="section" className="mm-card" description={`最高 ${l.boards.max} 板；连板率 = 今日 n 板家数 ÷ 昨日 n−1 板家数`}>
      <div className="mm-boards">
        {rows.map(([name, n, r]) => (
          <div key={name} className="mm-boards__cell">
            <span className="mm-boards__name">{name}</span>
            <strong>{n}</strong>
            <span className="mm-boards__rate">{r === null ? (name === '一板' ? '首板' : '—') : `连板率 ${pct(r, 1, false)}`}</span>
          </div>
        ))}
      </div>
      <ul className="mm-perf">
        <li><span>今日涨停破板率</span><b>{pct(l.brokenRate, 1, false)}</b><small>炸板 {l.broken ?? '—'} 只</small></li>
        <li><span>昨日涨停今表现</span><b className={tone(l.perf.zt)}>{pct(l.perf.zt)}</b><small>红盘率 {pct(l.perf.ztRed, 0, false)}</small></li>
        <li><span>昨日连板今表现</span><b className={tone(l.perf.lb)}>{pct(l.perf.lb)}</b><small>晋级率 {pct(l.rates.lbPromotion, 1, false)}</small></li>
        <li><span>昨日破板今表现</span><b className={tone(l.perf.broken)}>{pct(l.perf.broken)}</b><small>{l.perf.broken === null ? '需前一日记录' : ' '}</small></li>
      </ul>
    </Card>
  )
}

/* ---------- 涨停 / 封板率 / 跌停 今昨对比 ---------- */
function TodayVsYesterday({ l, prev }: { l: MoodLatest; prev: MoodDay | null }): JSX.Element {
  const cells: Array<[string, string, string]> = [
    ['涨停板', String(l.zt), prev ? String(prev.zt) : '—'],
    ['封板率', pct(l.sealRate, 1, false), prev ? pct(prev.sealRate, 1, false) : '—'],
    ['跌停板', String(l.dt), prev ? String(prev.dt) : '—'],
  ]
  return (
    <section className="mm-vs" aria-label="今日与昨日对比">
      {cells.map(([k, t, y]) => (
        <div key={k} className="mm-vs__cell"><span>{k}</span><strong>{t}</strong><small>今 / 昨 {y}</small></div>
      ))}
    </section>
  )
}

/* ---------- 市场量能 ---------- */
const hhmm = (t: string): string => t
function IntradayView({ l }: { l: MoodLatest }): JSX.Element {
  const it = l.intraday
  if (!it) return <p className="mm-empty">当日分时量能暂缺（只在交易日收盘后采集）。</p>
  const scope = it.scope ?? '沪深'
  const series = forecastSeries(it)
  const final = series.at(-1)
  const diff = it.total - it.prevTotal
  const fmtYi = (v: number): string => (v >= 10000 ? `${(v / 10000).toFixed(2)}万亿` : `${Math.round(v)}亿`)
  const signed = (v: number, d = 2): string => `${v > 0 ? '+' : ''}${v.toFixed(d)}`
  return (
    <>
      <p className="mm-intraday__head">
        <span>{it.date} {scope} · 实际量能 <b>{yi(it.total)}</b></span>
        <span>今日 · 预测量能 <b className={tone(diff)}>{yi(final?.forecast ?? it.total)}（{signed(final?.pct ?? 0)}%，{diff >= 0 ? '放量' : '缩量'} {yi(Math.abs(diff))}）</b></span>
        <span>{it.prevDate} 全天 {yi(it.prevTotal)}</span>
      </p>
      <MoodChart
        points={series.map(p => ({ date: p.t, value: p.pct === null ? null : Math.round(p.pct * 100) / 100 }))}
        label={`${it.date} 预测量能较昨日全天增减`}
        format={v => `${signed(v, 0)}%`}
        tipFormat={v => `预测 ${fmtYi(it.prevTotal * (1 + v / 100))}（${signed(v)}%）`}
        refs={[{ value: 0, label: `昨日总量能 ${fmtYi(it.prevTotal)}` }]}
        tick={hhmm}
        colorBy="sign"
      />
      <p className="mm-method">预测量能（开盘啦口径）：每个时刻的预测全天成交额 = 今日开盘至该时刻的累计成交额 ÷ 上一交易日同一时刻的累计成交额 × 上一交易日全天成交额。曲线是预测量能较上一交易日全天的增减百分比，0 线为昨日总量能；高于 0 为放量（红），低于 0 为缩量（绿），收盘时预测量能就是实际量能。量能 = 上证综指＋深证综指{scope === '沪深京' ? '＋北证50' : ''}成交额（{scope}）。收盘后采集，非盘中实时。</p>
    </>
  )
}

function Volume({ m }: { m: MarketMood }): JSX.Element {
  const [view, setView] = useState<'history' | 'today'>('history')
  const [market, setMarket] = useState<keyof Amount>('total')
  const [range, setRange] = useState<Range>('60')
  const points: Point[] = useMemo(() => {
    if (market === 'total') {
      // 沪深两市用指数成交额历史（较长）；当日加上北证，口径为沪深京
      const own = new Map(m.history.filter(d => d.amount).map(d => [d.date, d.amount!.total]))
      const idx = new Map(m.amountHistory.map(d => [d.date, d.total]))
      // 两个来源的日期取并集：指数成交额历史取数失败时，本页每日采集的量能仍要显示
      return [...new Set([...idx.keys(), ...own.keys()])].sort().map(date => ({ date, value: own.get(date) ?? idx.get(date) ?? null, muted: !own.has(date) }))
    }
    // 分板块：本页每日采集（实色）优先，之前的日子用指数口径历史补（浅色）
    const own = new Map(m.history.filter(d => d.amount).map(d => [d.date, d.amount![market]]))
    const idx = new Map(m.amountHistory.filter(d => typeof d[market] === 'number').map(d => [d.date, d[market] as number]))
    return [...new Set([...idx.keys(), ...own.keys()])].sort().map(date => ({ date, value: own.get(date) ?? idx.get(date) ?? null, muted: !own.has(date) }))
  }, [m, market])
  const label = MARKETS.find(x => x.key === market)!.label
  return (
    <Card title="市场量能" as="section" className="mm-card" actions={<Segmented items={[{ id: 'history', label: '历史量能' }, { id: 'today', label: '当日' }]} value={view} onChange={setView} label="量能视图" />}>
      {view === 'today' ? <IntradayView l={m.latest} /> : (
        <>
          <div className="mm-volume__controls">
            <Segmented items={MARKETS.map(x => ({ id: x.key, label: x.label }))} value={market} onChange={setMarket} label="市场" />
            <Segmented items={rangeItems.map(r => ({ ...r }))} value={range} onChange={setRange} label="时间范围" />
          </div>
          <MoodChart points={sliceRange(points, range)} label={`${label}成交额走势`} format={v => (v >= 10000 ? `${(v / 10000).toFixed(1)}万亿` : `${Math.round(v)}亿`)} kind="bar" />
          <p className="mm-method">红色为较前一日放量，绿色为缩量。{market === 'total' ? '浅色柱为沪深两市（上证综指＋深证综指成交额），实色柱为本页每日采集的沪深京合计。' : '实色柱为本页每日采集（按股票代码归入板块合计）；浅色柱为指数口径历史：上证主板 = 上证综指 − 科创综指，科创板 = 科创综指，深证主板 = 深证综指 − 创业板综指，创业板 = 创业板综指，北证 = 北证50（只含 50 只成分股，略低于北证全市场）。'}</p>
        </>
      )}
    </Card>
  )
}

/* ---------- 活跃股走势 / 连板强度 / 情绪统计 ---------- */
function HistoryChart({ m, title, pick, format, refs, method, extra }: {
  m: MarketMood; title: string; pick: (d: MoodDay) => number | null; format: (v: number) => string
  refs?: Array<{ value: number; label: string }>; method: string; extra?: React.ReactNode
}): JSX.Element {
  const [range, setRange] = useState<Range>('60')
  const points = sliceRange(m.history, range).map(d => ({ date: d.date, value: pick(d), muted: !!d.seeded }))
  return (
    <Card title={title} as="section" className="mm-card" actions={<Segmented items={rangeItems.map(r => ({ ...r }))} value={range} onChange={setRange} label={`${title}时间范围`} />}>
      {extra}
      <MoodChart points={points} label={`${title}走势`} format={format} refs={refs} />
      <p className="mm-method">{method}</p>
    </Card>
  )
}

function LbExtra({ l }: { l: MoodLatest }): JSX.Element {
  return (
    <>
      <ul className="mm-promo" aria-label="晋级率">
        <li><span>一进二</span><b>{pct(l.rates.r12, 1, false)}</b></li>
        <li><span>二进三</span><b>{pct(l.rates.r23, 1, false)}</b></li>
        <li><span>三进四</span><b>{pct(l.rates.r34, 1, false)}</b></li>
        <li><span>高度板</span><b>{pct(l.rates.rHigh, 1, false)}</b></li>
        <li><span>昨日连板今平均</span><b className={tone(l.perf.lb)}>{pct(l.perf.lb)}</b></li>
      </ul>
      {!!l.ladder.length && (
        <div className="mm-ladder" aria-label="连板天梯">
          {l.ladder.map(row => (
            <div key={row.boards} className="mm-ladder__row">
              <span className="mm-ladder__boards">{row.boards} 板</span>
              <span className="mm-ladder__stocks">{row.stocks.map(s => <span key={s.code} title={s.sector}>{s.name}</span>)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------- 大幅回撤 ---------- */
function Retreat({ l }: { l: MoodLatest }): JSX.Element {
  return (
    <Card title={`大幅回撤 ${l.retreat ?? 0} 只`} as="section" className="mm-card">
      {l.retreatStocks.length ? (
        <TableWrap label="大幅回撤个股">
          <table className="mm-table">
            <thead><tr><th>股票名称</th><th className="num">涨幅</th><th className="num">当日回撤</th><th>板块</th></tr></thead>
            <tbody>
              {l.retreatStocks.slice(0, 20).map(s => (
                <tr key={s.code}><td>{s.name}<small>{s.code}</small></td><td className={`num ${tone(s.pct)}`}>{pct(s.pct)}</td><td className="num mm-down">−{num(s.retreat, 2)}%</td><td>{s.sector || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">今日暂无大幅回撤个股</p>}
      <p className="mm-method">{METHOD.retreat}{l.retreatStocks.length > 20 ? ` 只列回撤最大的 20 只。` : ''}</p>
    </Card>
  )
}

/* ---------- 风向标 ---------- */
function VaneCard({ l }: { l: MoodLatest }): JSX.Element {
  return (
    <Card title="风向标" as="section" className="mm-card">
      {l.vane.length ? (
        <div className="mm-vane">
          {l.vane.map(v => (
            <div key={v.sector} className="mm-vane__item">
              <p className="mm-vane__head"><b>{v.sector}</b> 涨停 {v.count} 家</p>
              <p className="mm-vane__stocks">{v.stocks.map(s => <span key={s.code}>{s.name}{s.boards && s.boards > 1 ? <em>{s.boards}板</em> : null}</span>)}</p>
            </div>
          ))}
        </div>
      ) : <p className="mm-empty">暂无风向标数据</p>}
      <p className="mm-method">{METHOD.vane}</p>
    </Card>
  )
}

/* ---------- 权重表现 ---------- */
function WeightCard({ l }: { l: MoodLatest }): JSX.Element {
  const w = l.weight
  return (
    <Card title="权重表现" as="section" className="mm-card" description={w?.avg != null ? <>权重股平均 <b className={tone(w.avg)}>{pct(w.avg)}</b>，全市场中位数 <b className={tone(l.medianPct)}>{pct(l.medianPct)}</b></> : undefined}>
      {w ? (
        <>
          <ul className="mm-indices">{w.indices.map(i => <li key={i.symbol}><span>{i.name}</span><b className={tone(i.pct)}>{pct(i.pct)}</b></li>)}</ul>
          <ul className="mm-weights">{[...w.stocks].sort((a, b) => b.pct - a.pct).map(s => <li key={s.code}><span>{s.name}</span><b className={tone(s.pct)}>{pct(s.pct)}</b></li>)}</ul>
        </>
      ) : <p className="mm-empty">今日暂无权重表现个股</p>}
    </Card>
  )
}

/* ---------- 融资余额 ---------- */
// 1 年以内用主文件里的近 250 天；5 年、10 年、全部（2010-03-31 两融开通起）按需加载全历史文件
const marginRanges = [
  { id: '20', label: '20 日' }, { id: '60', label: '60 日' }, { id: '250', label: '1 年' },
  { id: '1250', label: '5 年' }, { id: '2500', label: '10 年' }, { id: 'all', label: '全部' },
] as const
type MarginRange = (typeof marginRanges)[number]['id']
type MarginRow = MarketMood['margin'][number]
const needsHistory = (r: MarginRange): boolean => r === '1250' || r === '2500' || r === 'all'

/** 校验全历史文件：[日期, 融资余额, 占比, 沪深300] 数组，日期升序 */
export function asMarginHistory(body: unknown): MarginRow[] | null {
  if (typeof body !== 'object' || body === null) return null
  const rows = (body as { rows?: unknown }).rows
  if (!Array.isArray(rows) || !rows.length) return null
  const nOrNull = (x: unknown): x is number | null => x === null || (typeof x === 'number' && Number.isFinite(x))
  const out: MarginRow[] = []
  for (const r of rows) {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r[0]) || typeof r[1] !== 'number' || !nOrNull(r[2]) || !nOrNull(r[3])) return null
    if (out.length && out[out.length - 1].date >= r[0]) return null
    out.push({ date: r[0], balance: r[1], ratio: r[2], hs300: r[3] })
  }
  return out
}

function useMarginHistory(enabled: boolean): { rows: MarginRow[] | null; state: 'idle' | 'loading' | 'ok' | 'error' } {
  const [state, setState] = useState<{ rows: MarginRow[] | null; state: 'idle' | 'loading' | 'ok' | 'error' }>({ rows: null, state: 'idle' })
  useEffect(() => {
    if (!enabled || state.state !== 'idle') return
    setState({ rows: null, state: 'loading' })
    fetch(`${BASE}data/market-mood-margin.json`, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => { const rows = asMarginHistory(body); setState(rows ? { rows, state: 'ok' } : { rows: null, state: 'error' }) })
      .catch(() => setState({ rows: null, state: 'error' }))
  }, [enabled, state.state])
  return state
}

function Margin({ m }: { m: MarketMood }): JSX.Element {
  const [range, setRange] = useState<MarginRange>('60')
  const [view, setView] = useState<'balance' | 'ratio' | 'hs300'>('balance')
  const hist = useMarginHistory(needsHistory(range))
  const last = m.margin.at(-1)
  if (!last) return <Card title="融资余额" as="section" className="mm-card"><p className="mm-empty">暂无融资余额数据</p></Card>
  const pick = { balance: (d: MarginRow) => d.balance, ratio: (d: MarginRow) => d.ratio, hs300: (d: MarginRow) => d.hs300 }[view]
  const fmt = { balance: (v: number) => `${(v / 10000).toFixed(2)}万亿`, ratio: (v: number) => `${v.toFixed(2)}%`, hs300: (v: number) => v.toFixed(0) }[view]
  // 全历史文件可能比主文件晚一天：用主文件补上更新的日子
  const merged = (): MarginRow[] => {
    if (!hist.rows) return m.margin
    const lastHist = hist.rows[hist.rows.length - 1].date
    return [...hist.rows, ...m.margin.filter(d => d.date > lastHist)]
  }
  const source = needsHistory(range) ? merged() : m.margin
  const rows = range === 'all' ? source : source.slice(-Number(range))
  const longRange = range !== '20' && range !== '60'
  const pending = needsHistory(range) && hist.state !== 'ok'
  return (
    <Card title="融资余额" as="section" className="mm-card" description={`${last.date}：融资余额 ${yi(last.balance)}，占流通市值 ${last.ratio == null ? '—' : `${num(last.ratio, 2)}%`}，沪深300 ${num(last.hs300)}`}
      actions={<Segmented items={marginRanges.map(r => ({ ...r }))} value={range} onChange={setRange} label="融资余额时间范围" />}>
      <Segmented items={[{ id: 'balance', label: '融资余额' }, { id: 'ratio', label: '占流通市值比' }, { id: 'hs300', label: '对照：沪深300' }]} value={view} onChange={setView} label="融资指标" />
      {pending && <p className="mm-empty">{hist.state === 'error' ? '长期历史暂时加载不了，先显示近一年。' : '正在加载长期历史…'}</p>}
      <MoodChart points={rows.map(d => ({ date: d.date, value: pick(d) }))} label="融资余额走势" format={fmt} tick={longRange ? (d: string) => d.slice(0, 7) : undefined} zeroBase={view === 'balance'} />
      <p className="mm-method">融资数据比行情晚一个交易日公布；全部历史从 2010-03-31 两融开通起（不到 20 年）。对照指数单独成图，不与融资余额叠在同一纵轴上。</p>
    </Card>
  )
}

export default function MarketMood(): JSX.Element {
  const load = useMarketMood()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 市场情绪</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'error' && (
        <LoadError
          reason="市场情绪这份读数现在拿不到。"
          detail={load.message}
          onRetry={load.retry}
        />
      )}
      {load.state === 'ok' && <MoodBody m={load.data} />}
    </Page>
  )
}

function MoodBody({ m }: { m: MarketMood }): JSX.Element {
  const l = m.latest
  const prev = previousDay(m)
  const hsPrev = [...m.amountHistory].reverse().find(d => d.date < l.date)?.total ?? null
  const hasSeeded = m.history.some(d => d.seeded)
  return (
    <>
      <PageDataFreshness checkedAt={m.generatedAt} dataDates={[l.date]} note="收盘后更新" />
      <TopPanel l={l} hsPrev={hsPrev} />
      <Composite l={l} />
      <Breadth l={l} />
      <LimitUpPerf l={l} />
      <TodayVsYesterday l={l} prev={prev} />
      <Volume m={m} />
      <HistoryChart m={m} title="活跃股走势" pick={d => d.mood} format={v => `${v.toFixed(1)}%`} refs={[{ value: 2, label: '活跃 2%' }, { value: -1, label: '冰点 −1%' }]} method={METHOD.mood} />
      <HistoryChart m={m} title="连板强度" pick={d => d.lbStrength} format={v => v.toFixed(0)} refs={[{ value: 75, label: '偏热 75' }, { value: 25, label: '偏冷 25' }]} method={METHOD.lb} extra={<LbExtra l={l} />} />
      <HistoryChart m={m} title="涨停家数" pick={d => d.zt} format={v => v.toFixed(0)} method="每日涨停家数（含 ST）。" />
      <HistoryChart m={m} title="连板高度" pick={d => d.boards.max} format={v => `${v.toFixed(0)}板`} method="每日最高连板数（市场高标）。" />
      <Retreat l={l} />
      <VaneCard l={l} />
      <WeightCard l={l} />
      <Margin m={m} />
      <Card title="北向资金" as="section" className="mm-card"><p className="mm-empty">2024 年 8 月起交易所不再披露北向资金每日买卖数据，本页不展示。</p></Card>
      <Callout title="口径与来源">
        <p>{m.note}{hasSeeded ? ` ${METHOD.seeded}` : ''}</p>
        <p>来源：{m.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。另见 <Link to="/daily-analysis">A股每日复盘</Link>、<Link to="/limit-up-analysis">涨停板块</Link>。</p>
      </Callout>
    </>
  )
}
