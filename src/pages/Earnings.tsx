import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Page, PageDataFreshness, Segmented } from '../components/ui'
import { PageTitle } from '../components/ui/PageTabs'
import { useCandidates } from '../features/candidates/useCandidates'
import { EarningsCard, RatingBadge, SurpriseBadge } from '../features/earnings/EarningsCard'
import {
  addDays, asEarningsCalendar, candidateKeys, companyHref, DEFAULT_FILTERS, fmtAmount, fmtEps, fmtPct, groupByDay, matches, mostWatched,
  MEGA_CAP, shortDay, SLOT_LABEL, staleDays, venueKey, VENUE_NAME, weekDays, weekdayLabel,
  type CnNotice, type EarningsCalendar, type EarningsItem, type Filters, type Slot, type VenueFilter,
} from '../features/earnings/model'
import '../styles/earnings.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type View = 'week0' | 'week1' | 'reported' | 'cn'
type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: EarningsCalendar }

const beijingDay = (now: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
const SLOTS: Slot[] = ['bmo', 'amc', 'other']

function useEarningsCalendar(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/earnings-calendar.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => {
        const data = asEarningsCalendar(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [])
  return load
}

function FilterBar({ filters, setFilters, counts }: { filters: Filters; setFilters: (f: Filters) => void; counts: Record<VenueFilter, number> }): JSX.Element {
  const venues: VenueFilter[] = ['all', 'us', 'hk', 'cn']
  return (
    <div className="ec-filters">
      <div className="ui-cluster" role="group" aria-label="市场">
        {venues.map(v => (
          <button key={v} type="button" className={filters.venue === v ? 'ui-chip is-active' : 'ui-chip'} aria-pressed={filters.venue === v} onClick={() => setFilters({ ...filters, venue: v })}>
            {v === 'all' ? '全部' : VENUE_NAME[v]} <span className="ui-chip__count">{counts[v]}</span>
          </button>
        ))}
      </div>
      <div className="ui-cluster" role="group" aria-label="范围">
        <button type="button" className={filters.onlyCandidates ? 'ui-chip is-active' : 'ui-chip'} aria-pressed={filters.onlyCandidates} onClick={() => setFilters({ ...filters, onlyCandidates: !filters.onlyCandidates })}>只看候选池</button>
        <button type="button" className={filters.onlyRated ? 'ui-chip is-active' : 'ui-chip'} aria-pressed={filters.onlyRated} onClick={() => setFilters({ ...filters, onlyRated: !filters.onlyRated })}>只看条件关注以上</button>
      </div>
      <label className="ec-search">
        <span className="visually-hidden">搜索公司名称或代码</span>
        <input type="search" value={filters.query} placeholder="搜索名称 / 代码" onChange={e => setFilters({ ...filters, query: e.target.value })} />
      </label>
    </div>
  )
}

function OffSeason({ data, venue }: { data: EarningsCalendar; venue: VenueFilter }): JSX.Element {
  const next = data.seasons.cn?.next
  return (
    <div className="ec-empty" role="note">
      {venue === 'cn' ? (
        <>
          <p>这段时间公司库里的 A 股没有定期报告披露。{next && <>下一个披露窗口：<strong>{next.label}</strong>（{next.start} 至 {next.end}），交易所预约披露表发布后这里会显示每家公司的日期。</>}</p>
          <p className="ec-muted">{data.seasons.cn?.rule} 期间可看「A 股预告 / 快报」。</p>
        </>
      ) : venue === 'hk' ? (
        <>
          <p>这一周公司库里的港股没有已通告的业绩日。</p>
          <p className="ec-muted">{data.seasons.hk?.rule}</p>
        </>
      ) : <p>这一周公司库里没有财报，或都被筛选条件排除了。</p>}
    </div>
  )
}

function WeekView({ data, days, filters, pool, title }: { data: EarningsCalendar; days: string[]; filters: Filters; pool: Set<string>; title: string }): JSX.Element {
  const inWeek = data.items.filter(i => days.includes(i.date))
  const shown = inWeek.filter(i => matches(i, filters, pool))
  const watched = mostWatched(inWeek.filter(i => matches(i, { ...filters, onlyCandidates: false, onlyRated: false }, pool)), pool)
  const byDay = groupByDay(shown, days)
  return (
    <>
      <section className="ec-watch" aria-labelledby="ec-watch-title">
        <h2 id="ec-watch-title">{title}最受关注</h2>
        <p className="ec-muted">站内口径，不是外部热度：候选池 +3，站内评级优先关注 / 优先跟踪 +2、条件关注 +1，大市值（≥ {MEGA_CAP.USD / 1e8} 亿美元 / ≥ {MEGA_CAP.HKD / 1e12} 万亿港元）+1；至少 1 分，最多 8 家。A 股条目没有市值数据，不计大市值分。</p>
        {watched.length ? (
          <ol className="ec-watch__list">
            {watched.map(i => (
              <li key={`${i.market}:${i.code}`}>
                <Link to={companyHref(i)}>{i.name}</Link>
                <span className="ec-muted"> {weekdayLabel(i.date)} {shortDay(i.date)}{i.time === 'bmo' ? ' 盘前' : i.time === 'amc' ? ' 盘后' : ''}</span>
                {pool.has(venueKey(i.market, i.code)) && <span className="ec-tag is-pool">候选池</span>}
                <RatingBadge rating={i.research?.rating} />
              </li>
            ))}
          </ol>
        ) : <p className="ec-muted">这一周没有符合上述口径的公司。</p>}
      </section>

      {shown.length === 0 ? <OffSeason data={data} venue={filters.venue} /> : (
        <div className="ec-week" role="list" aria-label="按日财报日历">
          {days.map(day => {
            const slots = byDay.get(day)!
            const count = SLOTS.reduce((n, s) => n + slots[s].length, 0)
            return (
              <section key={day} className={`ec-day${count ? '' : ' is-empty'}`} role="listitem" aria-label={`${weekdayLabel(day)} ${day}，${count} 家`}>
                <h3 className="ec-day__head">{weekdayLabel(day)} <span>{shortDay(day)}</span> <span className="ec-day__count">{count} 家</span></h3>
                {count === 0 && <p className="ec-muted ec-day__none">无</p>}
                {SLOTS.map(s => slots[s].length > 0 && (
                  <div key={s} className="ec-slot">
                    <h4 className="ec-slot__head">{SLOT_LABEL[s]}</h4>
                    {slots[s].map(i => <EarningsCard key={`${i.market}:${i.code}`} item={i} inPool={pool.has(venueKey(i.market, i.code))} sources={data.sources} />)}
                  </div>
                ))}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

function ReportedView({ data, today, filters, pool }: { data: EarningsCalendar; today: string; filters: Filters; pool: Set<string> }): JSX.Element {
  const rows = data.items.filter(i => i.date <= today && i.date >= addDays(today, -14) && matches(i, filters, pool)).sort((a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code))
  if (!rows.length) return <div className="ec-empty" role="note"><p>近两周公司库里没有已公布的财报，或都被筛选条件排除了。</p></div>
  return (
    <section aria-labelledby="ec-reported-title">
      <h2 id="ec-reported-title" className="ec-h2">近两周已公布</h2>
      <p className="ec-muted">实际 EPS 与公布前一致预期对比；颜色按市场习惯：美股绿色为超预期，A 股 / 港股红色为超预期。A 股季报没有一致预期，只列同比。结果尚未入库的显示“缺失”。</p>
      <div className="ec-reported">
        {rows.map(i => <ReportedRow key={`${i.market}:${i.code}:${i.date}`} item={i} inPool={pool.has(venueKey(i.market, i.code))} data={data} />)}
      </div>
    </section>
  )
}

function ReportedRow({ item, inPool, data }: { item: EarningsItem; inPool: boolean; data: EarningsCalendar }): JSX.Element {
  const r = item.result
  const ccy = r?.currency ?? item.consensus?.currency ?? null
  return (
    <article className={`ec-row${inPool ? ' is-pool' : ''}`} aria-label={`${item.name} 已公布`}>
      <div className="ec-row__name">
        <Link to={companyHref(item)}>{item.name}</Link>
        <small>{item.code} · {item.date}{item.period ? ` · ${item.period}` : ''}</small>
      </div>
      <div className="ec-row__nums">
        {r ? (
          <>
            <span>EPS {fmtEps(r.epsActual, ccy)} <span className="ec-muted">vs {fmtEps(r.epsEstimate, ccy)}</span></span>
            {item.market !== 'cn' && <SurpriseBadge item={item} pct={r.surprisePct} />}
            <span>营收 {fmtAmount(r.revenueActual, ccy)} <span className="ec-muted">同比 {fmtPct(r.revenueYoY)}</span></span>
            {r.netProfitYoY != null && <span className="ec-muted">净利同比 {fmtPct(r.netProfitYoY)}</span>}
            <small className="ec-muted">{data.sources[r.source]?.label ?? r.source}，{r.asOf}</small>
          </>
        ) : <span className="ec-muted">结果缺失（来源尚未更新）</span>}
      </div>
      <div className="ec-row__tags">{inPool && <span className="ec-tag is-pool">候选池</span>}<RatingBadge rating={item.research?.rating} /></div>
    </article>
  )
}

const amountRange = (n: CnNotice): string => (n.lower != null || n.upper != null ? `${fmtAmount(n.lower, 'CNY')} 至 ${fmtAmount(n.upper, 'CNY')}` : '金额缺失')
const changeRange = (n: CnNotice): string => (n.changeLower != null || n.changeUpper != null ? `同比 ${fmtPct(n.changeLower)} 至 ${fmtPct(n.changeUpper)}` : '')

function CnNoticesView({ data, filters, pool }: { data: EarningsCalendar; filters: Filters; pool: Set<string> }): JSX.Element {
  const rows = data.cnNotices.filter(n => matches(n, filters, pool))
  const next = data.seasons.cn?.next
  return (
    <section aria-labelledby="ec-cn-title">
      <h2 id="ec-cn-title" className="ec-h2">A 股业绩预告 / 快报（最近 45 天）</h2>
      <p className="ec-muted">公司自己发布的预告区间与快报数字（东方财富数据中心整理）。{next && `下一个定期报告窗口：${next.label}（${next.start} 至 ${next.end}）。`}</p>
      {rows.length === 0 ? <div className="ec-empty" role="note"><p>最近 45 天公司库里的 A 股没有业绩预告或快报，或都被筛选条件排除了。</p></div> : (
        <div className="ec-reported">
          {rows.map(n => (
            <article key={`${n.code}:${n.kind}:${n.reportDate}`} className={`ec-row${pool.has(venueKey(n.market, n.code)) ? ' is-pool' : ''}`} aria-label={`${n.name} ${n.kind === 'forecast' ? '业绩预告' : '业绩快报'}`}>
              <div className="ec-row__name">
                <Link to={companyHref(n)}>{n.name}</Link>
                <small>{n.code} · 公告 {n.noticeDate} · {n.period ?? '报告期缺失'}</small>
              </div>
              <div className="ec-row__nums">
                {n.kind === 'forecast' ? (
                  <>
                    <span><span className="ec-tag">业绩预告{n.type ? ` · ${n.type}` : ''}</span> {n.metric ?? '指标缺失'}</span>
                    <span>{amountRange(n)} <span className="ec-muted">{changeRange(n)}</span></span>
                  </>
                ) : (
                  <>
                    <span><span className="ec-tag">业绩快报</span> EPS {fmtEps(n.eps, 'CNY')}</span>
                    <span>营收 {fmtAmount(n.revenue, 'CNY')} <span className="ec-muted">同比 {fmtPct(n.revenueYoY)}</span></span>
                    <span>归母净利 {fmtAmount(n.netProfit, 'CNY')} <span className="ec-muted">同比 {fmtPct(n.netProfitYoY)}</span></span>
                  </>
                )}
                <small className="ec-muted">{data.sources[n.source]?.label ?? n.source}</small>
              </div>
              <div className="ec-row__tags"><RatingBadge rating={n.research?.rating} /></div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function SourceList({ data }: { data: EarningsCalendar }): JSX.Element {
  return (
    <section className="ec-sources" aria-labelledby="ec-sources-title">
      <h2 id="ec-sources-title" className="ec-h2">数据来源</h2>
      <ul>
        {Object.entries(data.sources).map(([id, s]) => (
          <li key={id}>
            <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
            <span className={`ec-status is-${s.ok === true ? 'ok' : s.ok === false ? 'error' : 'idle'}`}>{s.ok === true ? '本次正常' : s.ok === false ? '本次失败' : '本次未运行'}</span>
            <span className="ec-muted">最近成功 {s.fetchedAt?.slice(0, 10) ?? '无'}</span>
          </li>
        ))}
      </ul>
      <p className="ec-muted">
        美股、港股的日期与一致预期来自 Yahoo Finance（经 yfinance 采集，Zacks / LSEG 等汇总口径，仅供个人研究）；港股官方会议日来自港交所披露易；A 股来自交易所预约披露表与公司公告（东方财富数据中心整理）。
        「这次要验证什么」、评级、林奇分类与三情景取自本站公司研究页，是研究假设，不是预测。观察，不是买卖指令。
      </p>
    </section>
  )
}

export default function Earnings({ now }: { now?: Date } = {}): JSX.Element {
  const load = useEarningsCalendar()
  const cand = useCandidates(true)
  const pool = useMemo(() => candidateKeys(cand.items), [cand.items])
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [view, setView] = useState<View>('week0')
  const clock = useMemo(() => now ?? new Date(), [now])
  const today = beijingDay(clock)
  const weekend = [0, 6].includes(new Date(`${today}T00:00:00Z`).getUTCDay())
  const week0 = useMemo(() => weekDays(today, 0), [today])
  const week1 = useMemo(() => weekDays(today, 1), [today])

  const data = load.state === 'ok' ? load.data : null
  const viewDays = view === 'week1' ? week1 : week0
  const counts = useMemo(() => {
    const base = data ? (view === 'cn' ? data.cnNotices : view === 'reported' ? data.items.filter(i => i.date <= today && i.date >= addDays(today, -14)) : data.items.filter(i => viewDays.includes(i.date))) : []
    const of = (v: VenueFilter): number => base.filter(i => matches(i, { ...filters, venue: v }, pool)).length
    return { all: of('all'), us: of('us'), hk: of('hk'), cn: of('cn') }
  }, [data, view, viewDays, filters, pool, today])

  const label = (offset: number, days: string[]): string => `${weekend ? (offset ? '再下周' : '下周') : offset ? '下周' : '本周'} ${shortDay(days[0])}–${shortDay(days[4])}`
  const failed = data ? Object.values(data.sources).filter(s => s.ok === false) : []
  const stale = data ? staleDays(data.generatedAt, clock) : null

  return (
    <Page className="earnings-page">
      <PageTitle>财报前瞻</PageTitle>
      <section className="ec-intro">
        <h2>财报前瞻：日期、一致预期与站内要验证的事</h2>
        <p>公司库里的公司未来六周的财报日（盘前 / 盘后、日期是否已确认）、一致预期、近四季超预期幅度，以及我们自己的研究：站内评级、林奇分类、三情景位置和「这次要验证什么」。只整理事实与研究假设，不预测财报结果，也不是买卖指令。</p>
      </section>

      {load.state === 'loading' && <p role="status" className="ec-muted">正在加载财报日历…</p>}
      {load.state === 'error' && <Callout tone="danger" title="财报日历暂时无法加载">{load.message}。请稍后刷新；数据由每天的定时任务生成。</Callout>}

      {data && (
        <>
          <PageDataFreshness checkedAt={data.generatedAt} dataLabel="各来源最近成功" dataDates={Object.values(data.sources).map(s => s.fetchedAt)} note={`窗口 ${data.window.start} 至 ${data.window.end}`} />
          {stale !== null && <Callout tone="warn" title={`数据已 ${stale} 天未更新`}>生成于 {data.generatedAt.slice(0, 10)}；日期可能已变更，以公司公告为准。</Callout>}
          {failed.length > 0 && (
            <Callout tone="warn" title="部分来源本次没有取到">
              <ul className="ec-errors">
                {failed.map(s => <li key={s.label}>{s.label}：{s.error ?? '未知错误'}；沿用 {s.fetchedAt?.slice(0, 10) ?? '无'} 的数据</li>)}
              </ul>
            </Callout>
          )}

          <Segmented<View>
            label="视图"
            value={view}
            onChange={setView}
            items={[
              { id: 'week0', label: label(0, week0) },
              { id: 'week1', label: label(1, week1) },
              { id: 'reported', label: '近两周已公布' },
              { id: 'cn', label: 'A 股预告 / 快报' },
            ]}
          />
          <FilterBar filters={filters} setFilters={setFilters} counts={counts} />

          {(view === 'week0' || view === 'week1') && <WeekView data={data} days={viewDays} filters={filters} pool={pool} title={label(view === 'week1' ? 1 : 0, viewDays).split(' ')[0]} />}
          {view === 'reported' && <ReportedView data={data} today={today} filters={filters} pool={pool} />}
          {view === 'cn' && <CnNoticesView data={data} filters={filters} pool={pool} />}

          <SourceList data={data} />
        </>
      )}
    </Page>
  )
}
