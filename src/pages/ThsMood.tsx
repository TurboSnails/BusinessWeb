// 入口名「同花顺」（/ths-mood）：功能参照同花顺 App V11.65.03 与市场情绪、涨停相关的模块（投资者情绪 / 情绪指数、市场概况与涨跌停对比、
// 涨跌分布、盘面评分与强弱指数、短线市场风向标、涨停封成比、涨停聚焦、涨停分析、近 10 日涨停数、每日市场复盘）。独立页面，不改动其他页。
// 数据：public/data/ths-mood.json（scripts/ths-mood.mjs 收盘后生成，只用公开行情，不调用同花顺接口）。盘后统计，不是买卖建议。
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented, TableWrap } from '../components/ui'
import { PageTitle } from '../components/ui/PageTabs'
import MoodChart from '../features/market-mood/MoodChart'
import ThsTabs, { THS_DISCLAIMER } from '../features/ths-tabs/ThsTabs'
import { asThsMood, METHOD, PART_LABELS, previousDay, SKIPPED, zoneTone, type ThsDay, type ThsLatest, type ThsMood as ThsMoodData } from '../features/ths-mood/model'
import '../styles/market-mood.css'
import '../styles/ths-mood.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: ThsMoodData }

function useThsMood(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/ths-mood.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => {
        const data = asThsMood(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [])
  return load
}

// 格式：真正的负号；涨跌按 A 股习惯红涨绿跌
const num = (x: number | null | undefined, d = 0): string => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('-', '−'))
const pct = (x: number | null | undefined, d = 2, signed = true): string => (x == null || !Number.isFinite(x) ? '—' : `${signed && x > 0 ? '+' : ''}${num(x, d)}%`)
const tone = (x: number | null | undefined): string => (x == null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
const yi = (x: number | null | undefined): string => (x == null ? '—' : x >= 10000 ? `${(x / 10000).toFixed(2)} 万亿` : `${num(x)} 亿`)
const rangeItems = [{ id: '20', label: '20 日' }, { id: '60', label: '60 日' }, { id: 'all', label: '全部' }] as const
type Range = (typeof rangeItems)[number]['id']
const sliceRange = <T extends { date: string }>(xs: T[], r: Range): T[] => (r === 'all' ? xs : xs.slice(-Number(r)))
const RangeSwitch = ({ value, onChange, label }: { value: Range; onChange: (r: Range) => void; label: string }): JSX.Element => (
  <Segmented items={rangeItems.map(r => ({ ...r }))} value={value} onChange={onChange} label={label} />
)

/* ---------- 投资者情绪（情绪指数） ---------- */
const ZONE_NOTE: Record<string, string> = {
  贪婪风险区: '情绪指数越高，市场越亢奋、分歧越小。',
  恐慌机会区: '情绪指数越低，市场越低迷、亏钱效应越明显。',
  情绪中立区: '情绪处在中间区间，涨跌力量相对均衡。',
}
function Emotion({ m }: { m: ThsMoodData }): JSX.Element {
  const e = m.latest.emotionInfo
  const [range, setRange] = useState<Range>('60')
  const v = e.value ?? 0
  const t = zoneTone(e.zone)
  return (
    <Card title="投资者情绪" as="section" className="mm-card" actions={<RangeSwitch value={range} onChange={setRange} label="情绪指数时间范围" />}>
      <div className="ths-emo">
        <div className="ths-emo__head">
          <strong className={`ths-emo__value is-${t}`}>{num(e.value)}</strong>
          <span className={`ths-badge is-${t}`}>{e.zone}</span>
          <span className="ths-emo__state">情绪状态 <b>{e.state ?? '—'}</b>{e.state ? <small>（近 {e.n} 日三分位 {num(e.p33, 0)} / {num(e.p67, 0)}）</small> : <small>（过去记录 {e.n} 天，不足 20 天暂不判断）</small>}</span>
        </div>
        <svg className="ths-zones" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={`情绪指数 ${num(e.value)}，${e.zone}`}>
          <rect className="ths-zones__cold" x="0" y="2" width="30" height="6" />
          <rect className="ths-zones__mid" x="30" y="2" width="40" height="6" />
          <rect className="ths-zones__hot" x="70" y="2" width="30" height="6" />
          {e.value !== null && <rect className="ths-zones__needle" x={Math.min(99, Math.max(0, v - 0.5))} y="0" width="1" height="10" />}
        </svg>
        <div className="ths-zones__scale" aria-hidden="true"><span>0 恐慌机会区</span><span>30</span><span>情绪中立区</span><span>70</span><span>贪婪风险区 100</span></div>
        <p className="ths-emo__sign">最新的情绪指数为 {num(e.value)}，处于{e.zone}。{ZONE_NOTE[e.zone] ?? ''}</p>
        <ul className="ths-parts" aria-label="情绪指数分项">
          {PART_LABELS.map(p => {
            const x = e.parts[p.key]
            return (
              <li key={p.key}>
                <span>{p.label}</span>
                <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect className="ths-parts__track" width="100" height="6" rx="3" /><rect className="ths-parts__fill" width={x ?? 0} height="6" rx="3" /></svg>
                <b>{num(x)}</b>
              </li>
            )
          })}
        </ul>
      </div>
      <MoodChart points={sliceRange(m.history, range).map(d => ({ date: d.date, value: d.emotion, muted: !!d.seeded }))} label="情绪指数走势" format={x => x.toFixed(0)} refs={[{ value: 70, label: '贪婪 70' }, { value: 30, label: '恐慌 30' }]} />
      <p className="mm-method">{METHOD.emotion}</p>
      <p className="mm-method">{METHOD.state}</p>
    </Card>
  )
}

/* ---------- 市场概况（涨跌停对比、成交额、涨跌家数、领涨行业） ---------- */
function Overview({ l, prev }: { l: ThsLatest; prev: ThsDay | null }): JSX.Element {
  const up = l.up ?? 0, down = l.down ?? 0, all = up + down || 1
  const zdAll = l.zt + l.dt || 1
  const chg = l.amount !== null && l.amountPrev !== null ? l.amount - l.amountPrev : null
  return (
    <section className="ths-overview" aria-label="市场概况">
      <div className="ths-overview__cell">
        <span className="ths-overview__label">沪深成交额</span>
        <strong className="ths-overview__value">{yi(l.amount)}</strong>
        <span className="ths-overview__sub">{chg === null ? '—' : <>较上一交易日 <b className={tone(chg)}>{chg >= 0 ? '放量' : '缩量'} {yi(Math.abs(chg))}</b></>}</span>
      </div>
      <div className="ths-overview__cell">
        <span className="ths-overview__label">涨跌家数</span>
        <strong className="ths-overview__value"><span className="mm-up">{l.up ?? '—'}</span> : <span className="mm-down">{l.down ?? '—'}</span></strong>
        <svg className="ths-bar" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true"><rect className="is-up" width={(up / all) * 100} height="4" /><rect className="is-down" x={(up / all) * 100} width={(down / all) * 100} height="4" /></svg>
      </div>
      <div className="ths-overview__cell">
        <span className="ths-overview__label">涨跌停对比</span>
        <strong className="ths-overview__value"><span className="mm-up">{l.zt}</span> : <span className="mm-down">{l.dt}</span></strong>
        <svg className="ths-bar" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true"><rect className="is-up" width={(l.zt / zdAll) * 100} height="4" /><rect className="is-down" x={(l.zt / zdAll) * 100} width={(l.dt / zdAll) * 100} height="4" /></svg>
        <span className="ths-overview__sub">昨日 {prev ? `${prev.zt} : ${prev.dt}` : '—'}，封板率 {pct(l.sealRate, 1, false)}</span>
      </div>
      <div className="ths-overview__cell">
        <span className="ths-overview__label">涨停最多的行业</span>
        {l.sectors.slice(0, 2).map(s => <span key={s.sector} className="ths-overview__plate"><b>{s.sector}</b> {s.count} 家 · {s.lead.name}{s.lead.boards > 1 ? ` ${s.lead.boards}板` : ''}</span>)}
        {!l.sectors.length && <span className="ths-overview__sub">今日无涨停</span>}
      </div>
    </section>
  )
}

/* ---------- 涨跌分布 ---------- */
const BUCKETS: Array<{ key: keyof ThsLatest['buckets']; label: string; up: boolean | null }> = [
  { key: 'limitUp', label: '涨停', up: true }, { key: 'above7', label: '>7%', up: true }, { key: 'from5To7', label: '5~7%', up: true },
  { key: 'from3To5', label: '3~5%', up: true }, { key: 'from0To3', label: '0~3%', up: true }, { key: 'flat', label: '平', up: null },
  { key: 'from0ToMinus3', label: '0~−3%', up: false }, { key: 'fromMinus3ToMinus5', label: '−3~−5%', up: false },
  { key: 'fromMinus5ToMinus7', label: '−5~−7%', up: false }, { key: 'belowMinus7', label: '<−7%', up: false }, { key: 'limitDown', label: '跌停', up: false },
]
function Distribution({ l }: { l: ThsLatest }): JSX.Element {
  const max = Math.max(...BUCKETS.map(b => l.buckets[b.key]), 1)
  return (
    <Card title="涨跌分布" as="section" className="mm-card">
      <ul className="mm-buckets" aria-label="涨跌幅分布">
        {BUCKETS.map(b => {
          const n = l.buckets[b.key]
          const h = Math.max((n / max) * 100, n ? 2 : 0)
          return (
            <li key={b.key}>
              <span className="mm-buckets__n">{n}</span>
              <svg className="mm-buckets__col" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true"><rect className={b.up === null ? 'is-flat' : b.up ? 'is-up' : 'is-down'} x="0" y={100 - h} width="10" height={h} rx="1.5" /></svg>
              <span className="mm-buckets__label">{b.label}</span>
            </li>
          )
        })}
      </ul>
      <ul className="ths-kv" aria-label="涨跌统计">
        <li><span>上涨</span><b className="mm-up">{l.up ?? '—'}</b></li>
        <li><span>下跌</span><b className="mm-down">{l.down ?? '—'}</b></li>
        <li><span>平盘</span><b>{l.flat ?? '—'}</b></li>
        <li><span>涨停</span><b className="mm-up">{l.zt}</b></li>
        <li><span>跌停</span><b className="mm-down">{l.dt}</b></li>
        <li><span>停牌</span><b>{l.suspended}</b></li>
      </ul>
      <p className="mm-method">沪深京全部 A 股，涨停 / 跌停按东方财富股池；全市场涨跌幅中位数 {pct(l.medianPct)}。</p>
    </Card>
  )
}

/* ---------- 盘面评分 · 强弱指数 ---------- */
const CHECKS = ['收盘 > MA5', '收盘 > MA10', '收盘 > MA20', 'MA5 > MA20', '近 5 日上涨']
function TrendCard({ m }: { m: ThsMoodData }): JSX.Element {
  const t = m.latest.trend
  const [view, setView] = useState<'rsi' | 'score'>('rsi')
  const [range, setRange] = useState<Range>('60')
  const pts = sliceRange(m.trendHistory, range).map(d => ({ date: d.date, value: view === 'rsi' ? d.rsi : d.score }))
  return (
    <Card title="盘面评分 · 强弱指数" as="section" className="mm-card" actions={<RangeSwitch value={range} onChange={setRange} label="强弱指数时间范围" />}>
      {t ? (
        <>
          <p className="ths-trend__head">
            <span>盘面评分：短期大盘趋势<b className={t.score >= 3 ? 'mm-up' : 'mm-down'}>{t.level}</b>（{t.score}/5）</span>
            <span>强弱指数 <b>{num(t.rsi, 1)}</b></span>
            <span>上证指数 {num(t.close, 2)} <b className={tone(t.pct)}>{pct(t.pct)}</b></span>
          </p>
          {t.checks && (
            <ul className="ths-checks" aria-label="评分条件">
              {CHECKS.map((c, i) => <li key={c} className={t.checks![i] ? 'is-on' : ''}>{t.checks![i] ? '✓' : '✗'} {c}</li>)}
            </ul>
          )}
        </>
      ) : <p className="mm-empty">指数日 K 暂不可用</p>}
      <Segmented items={[{ id: 'rsi', label: '强弱指数' }, { id: 'score', label: '盘面评分' }]} value={view} onChange={setView} label="趋势指标" />
      <MoodChart points={pts} label={view === 'rsi' ? '强弱指数走势' : '盘面评分走势'} format={x => (view === 'rsi' ? x.toFixed(0) : `${x.toFixed(0)}分`)} refs={view === 'rsi' ? [{ value: 70, label: '偏强 70' }, { value: 30, label: '偏弱 30' }] : [{ value: 3, label: '偏强 3' }]} kind={view === 'rsi' ? 'line' : 'bar'} />
      <p className="mm-method">{METHOD.trend}{view === 'score' ? ' 柱色表示较前一日升降。' : ''}</p>
    </Card>
  )
}

/* ---------- 短线市场风向标 ---------- */
function VaneCard({ m }: { m: ThsMoodData }): JSX.Element {
  const v = m.latest.vane
  const [range, setRange] = useState<Range>('60')
  return (
    <Card title="短线市场风向标" as="section" className="mm-card" actions={<RangeSwitch value={range} onChange={setRange} label="风向标时间范围" />}
      description="观察昨日最热涨停股今日竞价（开盘）表现">
      <ul className="ths-kv" aria-label="风向标统计">
        <li><span>竞价表现</span><b className={v.verdict === '竞价高开' ? 'mm-up' : v.verdict === '竞价大幅低开' ? 'mm-down' : ''}>{v.verdict}</b></li>
        <li><span>平均开盘</span><b className={tone(v.avgOpen)}>{pct(v.avgOpen)}</b></li>
        <li><span>平均收盘</span><b className={tone(v.avgClose)}>{pct(v.avgClose)}</b></li>
        <li><span>高开 / 低开</span><b><span className="mm-up">{v.highOpen}</span> / <span className="mm-down">{v.lowOpen}</span></b></li>
        <li><span>全部 {v.all} 只昨日涨停 · 次日开盘</span><b className={tone(v.allOpen)}>{pct(v.allOpen)}</b></li>
        <li><span>次日收盘</span><b className={tone(v.allClose)}>{pct(v.allClose)}</b></li>
      </ul>
      {v.stocks.length ? (
        <TableWrap label="昨日最热涨停股">
          <table className="mm-table">
            <thead><tr><th>股票</th><th className="num">昨日连板</th><th className="num">竞价（开盘）</th><th className="num">收盘涨幅</th><th>行业</th></tr></thead>
            <tbody>
              {v.stocks.map(s => (
                <tr key={s.code}><td>{s.name}<small>{s.code}</small></td><td className="num">{s.boards} 板</td><td className={`num ${tone(s.openPct)}`}>{pct(s.openPct)}</td><td className={`num ${tone(s.pct)}`}>{pct(s.pct)}</td><td>{s.sector || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">昨日无涨停股</p>}
      <MoodChart points={sliceRange(m.history, range).map(d => ({ date: d.date, value: d.hotOpen }))} label="昨日最热涨停股平均开盘涨幅走势" format={x => `${x.toFixed(1)}%`} refs={[{ value: 2, label: '高开 2%' }, { value: -2, label: '低开 −2%' }]} />
      <p className="mm-method">{METHOD.vane}</p>
    </Card>
  )
}

/* ---------- 涨停封成比 ---------- */
function FcbCard({ l }: { l: ThsLatest }): JSX.Element {
  const f = l.fcb
  const groups = f.groups ? ([['封成比高的三分之一', f.groups.high], ['中间三分之一', f.groups.mid], ['封成比低的三分之一', f.groups.low]] as const) : null
  return (
    <Card title="涨停封成比" as="section" className="mm-card" description={`今日涨停股封成比中位数 ${num(f.median, 2)}`}>
      {groups ? (
        <TableWrap label="昨日涨停按封成比分组的今日表现">
          <table className="mm-table">
            <caption className="ths-caption">昨日涨停股按昨日封成比分组 · 今日表现</caption>
            <thead><tr><th>分组</th><th className="num">只数</th><th className="num">封成比区间</th><th className="num">今日平均</th><th className="num">红盘率</th></tr></thead>
            <tbody>
              {groups.map(([k, g]) => <tr key={k}><td>{k}</td><td className="num">{g.n}</td><td className="num">{num(g.fcbMin, 2)}–{num(g.fcbMax, 2)}</td><td className={`num ${tone(g.avgPct)}`}>{pct(g.avgPct)}</td><td className="num">{pct(g.red, 0, false)}</td></tr>)}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">分组需要上一交易日的封成比记录，从本页开始采集的次日起显示。</p>}
      {!!f.top.length && (
        <TableWrap label="今日封成比最高的涨停股">
          <table className="mm-table">
            <caption className="ths-caption">今日封成比最高的涨停股</caption>
            <thead><tr><th>股票</th><th className="num">封成比</th><th className="num">封单（亿）</th><th className="num">连板</th></tr></thead>
            <tbody>{f.top.map(s => <tr key={s.code}><td>{s.name}<small>{s.code}</small></td><td className="num">{num(s.fcb, 2)}</td><td className="num">{num(s.fund, 2)}</td><td className="num">{s.boards}</td></tr>)}</tbody>
          </table>
        </TableWrap>
      )}
      <p className="mm-method">{METHOD.fcb}</p>
    </Card>
  )
}

/* ---------- 涨停聚焦（行业分布） ---------- */
function SectorCard({ l }: { l: ThsLatest }): JSX.Element {
  const max = Math.max(1, ...l.sectors.map(s => s.count))
  return (
    <Card title="涨停聚焦" as="section" className="mm-card" description="涨停股的行业分布（东方财富行业）">
      {l.sectors.length ? (
        <ul className="ths-sectors" aria-label="涨停行业分布">
          {l.sectors.map(s => (
            <li key={s.sector}>
              <span className="ths-sectors__name">{s.sector}</span>
              <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect className="ths-sectors__bar" width={(s.count / max) * 100} height="8" rx="2" /></svg>
              <b>{s.count}</b>
              <small>{s.lead.name}{s.lead.boards > 1 ? ` ${s.lead.boards}板` : ''}</small>
            </li>
          ))}
        </ul>
      ) : <p className="mm-empty">今日无涨停</p>}
    </Card>
  )
}

/* ---------- 涨停分析 ---------- */
function ZtTable({ l }: { l: ThsLatest }): JSX.Element {
  const [all, setAll] = useState(false)
  const rows = all ? l.ztList : l.ztList.slice(0, 30)
  return (
    <Card title={`涨停分析 ${l.ztList.length} 只`} as="section" className="mm-card">
      {l.ztList.length ? (
        <TableWrap label="今日涨停股">
          <table className="mm-table">
            <thead><tr><th>股票</th><th className="num">最新</th><th className="num">涨幅</th><th className="num">几天几板</th><th className="num">首封</th><th className="num">开板</th><th className="num">封单（亿）</th><th className="num">封成比</th><th className="num">近10日涨停</th><th>行业</th></tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.code}>
                  <td>{s.name}<small>{s.code}</small></td><td className="num">{num(s.price, 2)}</td><td className={`num ${tone(s.pct)}`}>{pct(s.pct)}</td>
                  <td className="num">{s.boards > 1 ? `${s.boards}连板` : s.days && s.times && s.days > 1 ? `${s.days}天${s.times}板` : '首板'}</td>
                  <td className="num">{s.firstSeal ?? '—'}</td><td className="num">{s.opens}</td><td className="num">{num(s.fund, 2)}</td><td className="num">{num(s.fcb, 2)}</td><td className="num">{s.ten ?? '—'}</td><td>{s.sector || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">暂无涨停分析数据</p>}
      {l.ztList.length > 30 && <button type="button" className="ths-more" onClick={() => setAll(x => !x)}>{all ? '收起' : `展开全部 ${l.ztList.length} 只`}</button>}
      <p className="mm-method">{METHOD.zt}</p>
    </Card>
  )
}

/* ---------- 近 10 日涨停数 ---------- */
function TenCard({ l }: { l: ThsLatest }): JSX.Element {
  const t = l.ten
  return (
    <Card title="近10日涨停数" as="section" className="mm-card" description={`近 ${t.window} 个交易日里涨停 2 次及以上的股票 ${t.multi} 只${t.covered < t.window ? `（目前只覆盖 ${t.covered} 天）` : ''}`}>
      {t.top.length ? (
        <ol className="ths-ten" aria-label="近10日涨停数排行">
          {t.top.map(s => <li key={s.code}><span>{s.name}<small>{s.code}</small></span><b>{s.count} 次</b>{s.todayZt && <em>今日涨停</em>}</li>)}
        </ol>
      ) : <p className="mm-empty">暂无数据</p>}
      <p className="mm-method">{METHOD.ten}</p>
    </Card>
  )
}

/* ---------- 每日市场复盘 ---------- */
function Review({ m }: { m: ThsMoodData }): JSX.Element {
  const [range, setRange] = useState<Range>('60')
  return (
    <Card title="每日市场复盘" as="section" className="mm-card" actions={<RangeSwitch value={range} onChange={setRange} label="涨停家数时间范围" />}>
      <p className="mm-comment">{m.latest.review}</p>
      <MoodChart points={sliceRange(m.history, range).map(d => ({ date: d.date, value: d.zt, muted: !!d.seeded }))} label="每日涨停家数" format={x => x.toFixed(0)} />
      <p className="mm-method">复盘文字按固定规则由当日统计拼成，不含预测。下图为每日涨停家数（含 ST）。</p>
    </Card>
  )
}

export default function ThsMood(): JSX.Element {
  const load = useThsMood()
  return (
    <Page className="mm-page">
      <PageTitle>同花顺 · 市场情绪</PageTitle>
      <ThsTabs />
      <p className="mm-disclaimer">{THS_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'error' && <EmptyState title="市场情绪数据暂不可用">{load.message}</EmptyState>}
      {load.state === 'ok' && <Body m={load.data} />}
    </Page>
  )
}

function Body({ m }: { m: ThsMoodData }): JSX.Element {
  const l = m.latest
  const hasSeeded = m.history.some(d => d.seeded)
  return (
    <>
      <PageDataFreshness checkedAt={m.generatedAt} dataDates={[l.date]} note="收盘后更新" />
      <Overview l={l} prev={previousDay(m)} />
      <Emotion m={m} />
      <Distribution l={l} />
      <TrendCard m={m} />
      <VaneCard m={m} />
      <FcbCard l={l} />
      <SectorCard l={l} />
      <ZtTable l={l} />
      <TenCard l={l} />
      <Review m={m} />
      <Callout title="口径与来源">
        <p>{m.note}{hasSeeded ? ` ${METHOD.seeded}` : ''}</p>
        <p>同花顺里有、本页没做的模块：</p>
        <ul className="ths-skipped">{SKIPPED.map(s => <li key={s.name}><b>{s.name}</b>：{s.reason}</li>)}</ul>
        <p>来源：{m.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。另见 <Link to="/market-mood">开盘啦</Link>、<Link to="/daily-analysis">A股每日复盘</Link>。</p>
      </Callout>
    </>
  )
}
