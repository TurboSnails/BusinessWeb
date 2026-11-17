// 开盘啦 · 板块题材（/market-mood/plates）：功能对照开盘啦 App「板块」列表（强度、涨幅、主力净额、领涨股）与题材涨停分布。
// 模块：今日概览、行业 / 概念排行、题材涨停分布（连板梯队）、板块近 N 日走势、近几日强势板块。
// 数据：public/data/kpl-plates.json（scripts/kpl-plates.mjs 收盘后生成）。盘后统计，不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import { asKplPlates, KINDS, METHOD, SORTS, sortBoards, type Board, type Kind, type KplPlates, type SortKey, type Trend, type ZtGroup } from '../../features/kpl-plates/model'
import '../../styles/market-mood.css'
import '../../styles/kpl-plates.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ok'; data: KplPlates }

function usePlates(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/kpl-plates.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => {
        // 文件还没生成：静态托管回 404，或单页应用回退成 index.html
        if (r.status === 404 || (r.headers?.get?.('content-type') ?? '').includes('text/html')) { setLoad({ state: 'missing' }); return }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json().then((body: unknown) => {
          const data = asKplPlates(body)
          setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
        })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [])
  return load
}

// 格式：真正的负号；红涨绿跌
const num = (x: number | null | undefined, d = 0): string => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('-', '−'))
const pct = (x: number | null | undefined, d = 2): string => (x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${num(x, d)}%`)
const tone = (x: number | null | undefined): string => (x == null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
const yi = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${num(x, 2)} 亿`)
const kindLabel = (k: Kind): string => KINDS.find(x => x.id === k)!.label

/* ---------- 今日概览 ---------- */
function Overview({ m }: { m: KplPlates }): JSX.Element {
  const s = m.summary
  const topI = m.industry.find(b => b.strength !== null) ?? null
  const topC = m.concept.find(b => b.strength !== null) ?? null
  const cell = (label: string, b: Board | null): JSX.Element => (
    <div className="mm-top__cell">
      <span className="mm-top__label">{label}</span>
      <strong className="mm-top__value kp-top__name">{b?.name ?? '—'}</strong>
      <span className="mm-top__sub">{b ? <>强度 <b>{num(b.strength)}</b> · <b className={tone(b.pct)}>{pct(b.pct)}</b> · 涨停 {b.zt} 家</> : '暂无'}</span>
    </div>
  )
  return (
    <section className="kp-top" aria-label="今日概览">
      <div className="mm-top__cell">
        <span className="mm-top__label">今日涨停</span>
        <strong className="mm-top__value mm-up">{s.zt} 家</strong>
        <span className="mm-top__sub">分布在 {s.industryWithZt} 个行业、{s.conceptWithZt} 个概念</span>
      </div>
      <div className="mm-top__cell">
        <span className="mm-top__label">上涨板块</span>
        <strong className="mm-top__value">{s.upIndustries} / {s.industries}</strong>
        <span className="mm-top__sub">行业；概念 {s.upConcepts} / {s.concepts}</span>
      </div>
      {cell('最强行业', topI)}
      {cell('最强概念', topC)}
    </section>
  )
}

/* ---------- 行业 / 概念排行 ---------- */
const PAGE = 20
function Ranking({ m }: { m: KplPlates }): JSX.Element {
  const [kind, setKind] = useState<Kind>('industry')
  const [sort, setSort] = useState<SortKey>('strength')
  const [all, setAll] = useState(false)
  const rows = useMemo(() => sortBoards(m[kind], sort), [m, kind, sort])
  const shown = all ? rows : rows.slice(0, PAGE)
  return (
    <Card title="板块排行" as="section" className="mm-card" actions={<Segmented items={KINDS.map(k => ({ ...k }))} value={kind} onChange={k => { setKind(k); setAll(false) }} label="板块类型" />}>
      <Segmented items={SORTS.map(s => ({ ...s }))} value={sort} onChange={s => { setSort(s); setAll(false) }} label="排序指标" />
      <TableWrap label={`${kindLabel(kind)}板块排行`}>
        <table className="mm-table kp-table">
          <thead>
            <tr>
              <th className="num">#</th><th>板块</th><th className="num">强度</th><th className="num">涨幅</th><th className="num">涨停</th>
              <th className="num">涨 / 跌</th><th className="num">主力净额</th><th>领涨股</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b, i) => (
              <tr key={b.code}>
                <td className="num kp-rank">{i + 1}</td>
                <td className="kp-name">{b.name}</td>
                <td className="num"><StrengthBar v={b.strength} /></td>
                <td className={`num ${tone(b.pct)}`}>{pct(b.pct)}</td>
                <td className="num">{b.zt ? <b className="mm-up">{b.zt}</b> : '0'}{b.maxBoards && b.maxBoards > 1 ? <small className="kp-hi">{b.maxBoards}板</small> : null}</td>
                <td className="num"><span className="mm-up">{b.up ?? '—'}</span> / <span className="mm-down">{b.down ?? '—'}</span>{b.upRatio !== null ? <small>{num(b.upRatio)}%</small> : null}</td>
                <td className={`num ${tone(b.mainNet)}`}>{yi(b.mainNet)}</td>
                <td>{b.leader ? <>{b.leader.name}<small className={tone(b.leader.pct)}>{pct(b.leader.pct)}</small></> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {rows.length > PAGE && <button type="button" className="kp-more" onClick={() => setAll(v => !v)}>{all ? '收起' : `显示全部 ${rows.length} 个`}</button>}
      <p className="mm-method">{METHOD.strength} 缺失的数值显示为「—」并排在最后。</p>
    </Card>
  )
}

function StrengthBar({ v }: { v: number | null }): JSX.Element {
  if (v === null) return <span className="kp-muted">—</span>
  return (
    <span className="kp-strength">
      <svg viewBox="0 0 40 6" preserveAspectRatio="none" aria-hidden="true">
        <rect className="kp-strength__track" x="0" y="0" width="40" height="6" rx="3" />
        <rect className={`kp-strength__fill${v >= 70 ? ' is-hot' : v <= 30 ? ' is-cold' : ''}`} x="0" y="0" width={Math.max(1, (v / 100) * 40)} height="6" rx="3" />
      </svg>
      <b>{v}</b>
    </span>
  )
}

/* ---------- 题材涨停分布 ---------- */
const GROUPS_SHOWN = 12
function Groups({ m }: { m: KplPlates }): JSX.Element {
  const [kind, setKind] = useState<Kind>('concept')
  const [all, setAll] = useState(false)
  const list = m.groups[kind]
  const shown = all ? list : list.slice(0, GROUPS_SHOWN)
  return (
    <Card title="题材涨停分布" as="section" className="mm-card" actions={<Segmented items={KINDS.map(k => ({ ...k }))} value={kind} onChange={k => { setKind(k); setAll(false) }} label="分组方式" />}>
      {shown.length ? <div className="kp-groups">{shown.map(g => <GroupCard key={g.name} g={g} />)}</div> : <p className="mm-empty">今日暂无{kind === 'concept' ? '涨停 ≥ 2 家的概念' : '涨停股'}</p>}
      {list.length > GROUPS_SHOWN && <button type="button" className="kp-more" onClick={() => setAll(v => !v)}>{all ? '收起' : `显示全部 ${list.length} 组`}</button>}
      {m.unmatched.length > 0 && <p className="mm-method">另有 {m.unmatched.length} 只涨停股查不到所属行业板块：{m.unmatched.map(s => s.name).join('、')}。</p>}
      <p className="mm-method">{METHOD.groups}</p>
    </Card>
  )
}

function GroupCard({ g }: { g: ZtGroup }): JSX.Element {
  // 连板梯队：同一组内按连板数分行
  const tiers = new Map<number, ZtGroup['stocks']>()
  for (const s of g.stocks) { const b = s.boards ?? 1; tiers.set(b, [...(tiers.get(b) ?? []), s]) }
  return (
    <article className="kp-group" aria-label={`${g.name} 涨停 ${g.count} 家`}>
      <p className="kp-group__head"><b>{g.name}</b><span>涨停 <b className="mm-up">{g.count}</b> 家</span><span className={tone(g.pct)}>{pct(g.pct)}</span></p>
      {[...tiers.entries()].sort((a, b) => b[0] - a[0]).map(([b, stocks]) => (
        <div key={b} className="kp-tier">
          <span className="kp-tier__boards">{b > 1 ? `${b} 板` : '首板'}</span>
          <span className="kp-tier__stocks">
            {stocks.map(s => <span key={s.code} title={s.firstSeal ? `首次封板 ${s.firstSeal}` : undefined} className={s.st ? 'kp-muted' : undefined}>{s.name}</span>)}
          </span>
        </div>
      ))}
    </article>
  )
}

/* ---------- 板块近 N 日走势 ---------- */
type Metric = 'close' | 'zt' | 'strength'
const METRICS: Array<{ id: Metric; label: string }> = [{ id: 'close', label: '板块指数' }, { id: 'zt', label: '涨停家数' }, { id: 'strength', label: '强度' }]
function TrendCard({ m }: { m: KplPlates }): JSX.Element {
  const [kind, setKind] = useState<Kind>('industry')
  const list = m.trend.filter(t => t.kind === kind)
  const [code, setCode] = useState<string>('')
  const [metric, setMetric] = useState<Metric>('close')
  const t: Trend | undefined = list.find(x => x.code === code) ?? list[0]
  const seeded = new Set(m.seededDays)
  return (
    <Card title="板块近 N 日走势" as="section" className="mm-card" actions={<Segmented items={KINDS.map(k => ({ ...k }))} value={kind} onChange={k => { setKind(k); setCode('') }} label="走势板块类型" />}>
      {t ? (
        <>
          <div className="kp-trend__bar">
            <select className="ui-input kp-select" aria-label="选择板块" value={t.code} onChange={e => setCode(e.target.value)}>
              {list.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
            <span>近 5 日 <b className={tone(t.r5)}>{pct(t.r5)}</b></span>
            <span>近 20 日 <b className={tone(t.r20)}>{pct(t.r20)}</b></span>
          </div>
          <Segmented items={METRICS.map(x => ({ ...x }))} value={metric} onChange={setMetric} label="走势指标" />
          <MoodChart
            points={t.points.map(p => ({ date: p.date, value: p[metric], muted: metric === 'zt' && seeded.has(p.date) }))}
            label={`${t.name}${METRICS.find(x => x.id === metric)!.label}走势`}
            format={v => v.toFixed(0)}
            kind={metric === 'zt' ? 'bar' : 'line'}
            refs={metric === 'strength' ? [{ value: 70, label: '70' }, { value: 30, label: '30' }] : []}
          />
          <p className="mm-method">只列当日强度前 12 的板块。板块指数取东方财富日 K 收盘；涨停家数与强度从本页每日存档累计{seeded.size ? '，浅色柱为由每日复盘归档补算的涨停家数' : ''}。涨停家数柱按较前一日增减着色。</p>
        </>
      ) : <p className="mm-empty">暂无走势数据</p>}
    </Card>
  )
}

/* ---------- 近几日强势板块 ---------- */
function StrongCard({ m }: { m: KplPlates }): JSX.Element {
  const [kind, setKind] = useState<Kind>('industry')
  const days = m.strong[kind]
  return (
    <Card title="近几日强势板块" as="section" className="mm-card" actions={<Segmented items={KINDS.map(k => ({ ...k }))} value={kind} onChange={setKind} label="强势板块类型" />}>
      {days.length ? (
        <ul className="kp-strong">
          {days.map(d => (
            <li key={d.date}>
              <span className="kp-strong__date">{d.date.slice(5)}</span>
              <span className="kp-strong__list">{d.boards.map(b => <span key={b.code}>{b.name}<small>{b.strength}</small></span>)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mm-empty">暂无记录</p>}
      <p className="mm-method">每天强度前 5 的板块，从本页开始采集之日起累计（补算日没有强度，不列）。</p>
    </Card>
  )
}

export default function KplPlates(): JSX.Element {
  const load = usePlates()
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 板块题材</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'missing' && <EmptyState title="板块题材数据尚未生成">收盘后自动更新，首个交易日采集完成后在这里显示。</EmptyState>}
      {load.state === 'error' && <EmptyState title="板块题材数据暂不可用">{load.message}</EmptyState>}
      {load.state === 'ok' && <PlatesBody m={load.data} />}
    </Page>
  )
}

function PlatesBody({ m }: { m: KplPlates }): JSX.Element {
  return (
    <>
      <PageDataFreshness checkedAt={m.generatedAt} dataDates={[m.asOf]} note="收盘后更新" />
      <Overview m={m} />
      <Ranking m={m} />
      <Groups m={m} />
      <TrendCard m={m} />
      <StrongCard m={m} />
      <Card title="暂未提供" as="section" className="mm-card">
        <p className="mm-empty">开盘啦「题材挖掘」「互动精灵」「股权拍卖」依赖它自有的编辑内容、问答抓取与拍卖数据，没有可靠的公开来源，本页不提供；板块分时、区间强度等盘中数据也不提供。</p>
      </Card>
      <Callout title="口径与来源">
        <p>{m.note} {METHOD.scope}{m.seededDays.length ? ` ${METHOD.seeded}` : ''}</p>
        <p>来源：{m.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。另见 <Link to="/limit-up-analysis">涨停板块</Link>、<Link to="/market-mood">市场情绪</Link>。</p>
      </Callout>
    </>
  )
}
