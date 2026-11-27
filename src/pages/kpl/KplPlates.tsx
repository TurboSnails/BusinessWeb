// 开盘啦 · 板块题材（/market-mood/plates）：功能对照开盘啦 App「板块」列表（强度、涨幅、主力净额、领涨股）与题材涨停分布。
// 模块：今日概览、行业 / 概念 / 地域排行、板块资金热力图、板块关联 ETF、板块涨停 / 炸板 / 跌停分布、题材涨停分布（连板梯队）、板块叠加（当日分时）、
// 板块近 N 日走势、近几日强势板块、概念成分变动。
// 数据：public/data/kpl-plates.json（scripts/kpl-plates.mjs 收盘后生成）。盘后统计，不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import { asKplPlates, boardsOf, KINDS, METHOD, OVERLAY_MAX, rankKinds, SORTS, sortBoards, type Board, type ConceptChange, type DistRow, type Kind, type KplPlates, type RankKind, type SortKey, type Trend, type ZtGroup } from '../../features/kpl-plates/model'
import EtfLinks from '../../features/kpl-plates/EtfLinks'
import HeatMap from '../../features/kpl-plates/HeatMap'
import OverlayChart from '../../features/kpl-plates/OverlayChart'
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
const kindLabel = (k: RankKind): string => (k === 'region' ? '地域' : KINDS.find(x => x.id === k)!.label)

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
  const [kind, setKind] = useState<RankKind>('industry')
  const [sort, setSort] = useState<SortKey>('strength')
  const [all, setAll] = useState(false)
  const rows = useMemo(() => sortBoards(boardsOf(m, kind), sort), [m, kind, sort])
  const shown = all ? rows : rows.slice(0, PAGE)
  return (
    <Card title="板块排行" as="section" className="mm-card" actions={<Segmented items={rankKinds(m).map(k => ({ ...k }))} value={kind} onChange={k => { setKind(k); setAll(false) }} label="板块类型" />}>
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
      <p className="mm-method">{METHOD.strength} 缺失的数值显示为「—」并排在最后。{kind === 'region' ? ` ${METHOD.region}` : ''}</p>
    </Card>
  )
}

/* ---------- 板块资金热力图 ---------- */
/** 采集脚本记下的英文报错换成中文，读者只需要知道是网络没取到 */
const netErr = (e: string): string => e.replace(/fetch failed/gi, '网络请求失败').replace(/The operation was aborted due to timeout/gi, '请求超时')

function HeatCard({ m }: { m: KplPlates }): JSX.Element {
  const [kind, setKind] = useState<RankKind>('industry')
  return (
    <Card title="板块资金热力图" as="section" className="mm-card" actions={<Segmented items={rankKinds(m).map(k => ({ ...k }))} value={kind} onChange={setKind} label="热力图板块类型" />}>
      <HeatMap key={kind} rows={boardsOf(m, kind)} label={`${kindLabel(kind)}板块资金热力图`} />
      <p className="mm-method">{METHOD.heat}{m.region ? '' : m.sectionErrors.region ? ` 地域板块今日未取到（${netErr(m.sectionErrors.region)}）。` : ''}</p>
    </Card>
  )
}

/* ---------- 板块关联 ETF ---------- */
function EtfCard({ m }: { m: KplPlates }): JSX.Element {
  const [kind, setKind] = useState<Kind>('industry')
  const e = m.etf
  const pctOf = (code: string): number | null => [...m.industry, ...m.concept].find(b => b.code === code)?.pct ?? null
  return (
    <Card title="板块关联 ETF" as="section" className="mm-card" description={e ? `${e.date} 收盘，场内股票型 ETF ${e.universe} 只，已知跟踪指数 ${e.indexed} 只${e.pending ? `、待查 ${e.pending} 只（之后每个交易日补查）` : ''}。` : undefined}
      actions={e ? <Segmented items={KINDS.map(k => ({ ...k }))} value={kind} onChange={setKind} label="ETF 板块类型" /> : undefined}>
      {e ? <EtfLinks key={kind} boards={e.boards.filter(b => b.kind === kind)} pct={pctOf} /> : <EmptyState title="板块关联 ETF 暂无数据">{m.sectionErrors.etf ? `今日 ETF 数据未取到：${netErr(m.sectionErrors.etf)}` : '旧数据没有这一项，下一个交易日收盘后生成。'}</EmptyState>}
      <p className="mm-method">{METHOD.etf}</p>
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

/* ---------- 板块涨停 / 炸板 / 跌停分布 ---------- */
const DIST_COLS: Array<{ key: keyof Omit<DistRow, 'code' | 'name'>; label: string; cls: string }> = [
  { key: 'zt', label: '涨停', cls: 'mm-up' }, { key: 'zb', label: '炸板', cls: '' }, { key: 'dt', label: '跌停', cls: 'mm-down' },
  { key: 'natural', label: '自然涨停', cls: 'mm-up' }, { key: 'touched', label: '曾跌停', cls: '' },
]
function DistCard({ m }: { m: KplPlates }): JSX.Element | null {
  const [kind, setKind] = useState<Kind>('industry')
  const [all, setAll] = useState(false)
  const d = m.dist
  if (!d) return null
  const rows = d[kind]
  const shown = all ? rows : rows.slice(0, PAGE)
  const cnt = (k: string): string => (d.counts[k] == null ? '—' : String(d.counts[k]))
  return (
    <Card title="板块涨停 / 炸板 / 跌停分布" as="section" className="mm-card" actions={<Segmented items={KINDS.map(k => ({ ...k }))} value={kind} onChange={k => { setKind(k); setAll(false) }} label="分布板块类型" />}>
      <p className="kp-dist__total">全市场：涨停 {cnt('zt')} · 炸板 {cnt('zb')} · 跌停 {cnt('dt')} · 自然涨停 {cnt('natural')} · 曾跌停 {cnt('touched')}</p>
      {rows.length ? (
        <TableWrap label={`${kindLabel(kind)}涨停 / 炸板 / 跌停分布`}>
          <table className="mm-table kp-table">
            <thead><tr><th>板块</th>{DIST_COLS.map(c => <th key={c.key} className="num">{c.label}</th>)}</tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.code}>
                  <td className="kp-name">{r.name}</td>
                  {DIST_COLS.map(c => { const v = r[c.key]; return <td key={c.key} className={`num ${v ? c.cls : 'kp-muted'}`}>{v == null ? '—' : v}</td> })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">今日暂无</p>}
      {rows.length > PAGE && <button type="button" className="kp-more" onClick={() => setAll(v => !v)}>{all ? '收起' : `显示全部 ${rows.length} 个`}</button>}
      <p className="mm-method">{METHOD.dist}{d.source === 'pools' ? ` ${METHOD.distPools}` : ''} 按涨停、炸板、跌停家数排序，只列至少有一项不为 0 的板块（最多 80 个）。</p>
    </Card>
  )
}

/* ---------- 板块叠加（当日分时） ---------- */
function OverlayCard({ m }: { m: KplPlates }): JSX.Element | null {
  const it = m.intraday
  const [kind, setKind] = useState<Kind>('industry')
  const [picked, setPicked] = useState<string[]>(() => (it ? it.boards.filter(b => b.kind === 'industry').slice(0, 2).map(b => b.code) : []))
  if (!it) return null
  const list = it.boards.filter(b => b.kind === kind)
  const toggle = (code: string): void => setPicked(p => (p.includes(code) ? p.filter(c => c !== code) : p.length >= OVERLAY_MAX ? p : [...p, code]))
  const series = picked.map(c => it.boards.find(b => b.code === c)).filter((b): b is NonNullable<typeof b> => !!b)
  return (
    <Card title="板块叠加" as="section" className="mm-card" description={`${it.date} 分时，最多选 ${OVERLAY_MAX} 个板块对比（已选 ${series.length} 个），行业与概念可混选。`} actions={<Segmented items={KINDS.map(k => ({ ...k }))} value={kind} onChange={setKind} label="叠加板块类型" />}>
      <div className="kp-chips" role="group" aria-label="选择叠加板块">
        {list.map(b => {
          const on = picked.includes(b.code)
          return (
            <button key={b.code} type="button" className={`kp-chip${on ? ' is-on' : ''}`} aria-pressed={on} disabled={!on && picked.length >= OVERLAY_MAX} onClick={() => toggle(b.code)}>
              {b.name}<small className={tone(b.pct)}>{pct(b.pct)}</small>
            </button>
          )
        })}
      </div>
      {picked.length > 0 && <button type="button" className="kp-more" onClick={() => setPicked([])}>清空选择</button>}
      <OverlayChart times={it.times} series={series} label={`板块叠加：${series.map(s => s.name).join('、') || '未选择'}`} />
      <p className="mm-method">{METHOD.intraday}</p>
    </Card>
  )
}

/* ---------- 概念成分变动 ---------- */
function MembersCard({ m }: { m: KplPlates }): JSX.Element | null {
  const mb = m.members
  const [open, setOpen] = useState<string | null>(null)
  if (!mb) return null
  const t = mb.today
  const names = (xs: ConceptChange['added'], n: number): string => xs.map(x => x.name).join('、') + (n > xs.length ? ` 等 ${n} 只` : '')
  return (
    <Card title="概念成分变动" as="section" className="mm-card" description={t ? `${mb.date} 与 ${t.base} 相比` : `${mb.date} 已存快照（${mb.stocks} 只股票）`}>
      {!t && <p className="mm-empty">{mb.base === null ? `上一交易日（${mb.prevDay}）没有成分快照（首次采集或上一交易日未采集成功），暂无比较对象；下一个交易日起显示变动。` : '暂无比较结果'}</p>}
      {t && (t.concepts.length || t.newConcepts.length || t.droppedConcepts.length ? (
        <>
          {t.newConcepts.length > 0 && <p className="kp-mb__line">新上线概念：{t.newConcepts.map(c => `${c.name}（${c.members} 只）`).join('、')}</p>}
          {t.droppedConcepts.length > 0 && <p className="kp-mb__line">下线概念：{t.droppedConcepts.map(c => `${c.name}（原 ${c.members} 只）`).join('、')}</p>}
          <ul className="kp-mb">
            {t.concepts.map(c => (
              <li key={c.code}>
                <button type="button" className="kp-mb__head" aria-expanded={open === c.code} onClick={() => setOpen(o => (o === c.code ? null : c.code))}>
                  <b>{c.name}</b>
                  <span>{c.addedCount ? <span className="mm-up">+{c.addedCount}</span> : null}{c.removedCount ? <span className="mm-down"> −{c.removedCount}</span> : null}</span>
                  <small>现 {c.members} 只</small>
                </button>
                {open === c.code && (
                  <div className="kp-mb__body">
                    {c.added.length > 0 && <p><span className="mm-up">新增</span> {names(c.added, c.addedCount)}</p>}
                    {c.removed.length > 0 && <p><span className="mm-down">剔除</span> {names(c.removed, c.removedCount)}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : <p className="mm-empty">与上一交易日相比没有成分变动</p>)}
      {t && t.skipped > 0 && <p className="mm-method">另有 {t.skipped} 只股票当天所属概念为空，视为数据缺失，未计入剔除。</p>}
      {mb.recent.length > 0 && (
        <ul className="kp-strong" aria-label="近几日成分变动">
          {mb.recent.map(r => (
            <li key={r.date}>
              <span className="kp-strong__date">{r.date.slice(5)}</span>
              <span className="kp-strong__list"><span>{r.concepts} 个概念变动</span><span className="mm-up">新增 {r.added}</span><span className="mm-down">剔除 {r.removed}</span>{r.newConcepts.length ? <span>新上线 {r.newConcepts.join('、')}</span> : null}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mm-method">{METHOD.members}</p>
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
      <HeatCard m={m} />
      <EtfCard m={m} />
      <DistCard m={m} />
      <Groups m={m} />
      <OverlayCard m={m} />
      <TrendCard m={m} />
      <StrongCard m={m} />
      <MembersCard m={m} />
      <Card title="暂未提供" as="section" className="mm-card">
        <p className="mm-empty">开盘啦「题材挖掘」「互动精灵」「股权拍卖」依赖它自有的编辑内容、问答抓取与拍卖数据，没有可靠的公开来源，本页不提供；板块叠加只用收盘后预存的当日分时，盘中实时分时、区间强度等盘中数据不提供；板块关联 ETF 不含 ETF 份额变化与关联港股板块（港股 / 跨境 ETF 不与 A 股板块匹配）。</p>
      </Card>
      <Callout title="口径与来源">
        <p>{m.note} {METHOD.scope}{m.region ? ` ${METHOD.region}` : ''}{m.seededDays.length ? ` ${METHOD.seeded}` : ''}</p>
        <p>来源：{m.sources.map((s, i) => <React.Fragment key={s.id}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。另见 <Link to="/limit-up-analysis">涨停板块</Link>、<Link to="/market-mood">市场情绪</Link>。</p>
      </Callout>
    </>
  )
}
