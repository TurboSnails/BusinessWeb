// 开盘啦 · 互动问答（/market-mood/irm）：功能对照开盘啦 App「互动易」与「重点监控 / 问询函」——
// 每日已回复问答（深交所互动易 + 上证 e 互动）、关键词规则分类、热门公司与当日行情、关键词热度、近 7 天检索，近 30 日问询函 / 监管函。
// 数据：public/data/kpl-irm.json（索引）+ public/data/kpl-irm-<星期>.json（某一回复日明细），scripts/kpl-irm.mjs 盘后生成。不是买卖建议。
import React, { useEffect, useMemo, useState } from 'react'
import { Callout, Card, EmptyState, Page, PageDataFreshness, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import {
  asIrmDay, asKplIrm, LETTER_GROUP_LABEL, METHOD, PLATFORM,
  type CatId, type DaySummary, type HotCompany, type IrmDay, type KplIrm as Data, type Platform,
} from '../../features/kpl-irm/model'
import StockTable, { pct, tone, type Col } from '../../features/kpl-daban/StockTable'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/kpl-irm.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load<T> = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ok'; data: T }

function useJson<T>(file: string | null, parse: (body: unknown) => T | null): Load<T> {
  const [load, setLoad] = useState<Load<T>>({ state: 'loading' })
  useEffect(() => {
    if (!file) return undefined
    setLoad({ state: 'loading' })
    const controller = new AbortController()
    fetch(`${BASE}data/${file}`, { cache: 'no-cache', signal: controller.signal })
      .then(async r => {
        if (r.status === 404) { setLoad({ state: 'missing' }); return }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        // 静态托管在文件缺失时可能回退成 index.html（200 但不是 JSON），同样按「尚未生成」处理
        const body: unknown = await r.json().catch(() => undefined)
        if (body === undefined) { setLoad({ state: 'missing' }); return }
        const data = parse(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
    // parse 是稳定的纯函数，只随文件名变化重新请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])
  return load
}

const catLabel = (d: Data, id: CatId | string): string => d.rules.cats.find(c => c.id === id)?.label ?? id
const md = (date: string | null): string => (date ? date.slice(5).replace('-', '/') : '—')
const topCat = (d: Data, c: HotCompany): string => {
  const e = Object.entries(c.cats).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
  return e.length ? e.slice(0, 2).map(([k, v]) => `${catLabel(d, k)} ${v}`).join('、') : '—'
}

/* ---------- 当日概览 ---------- */
function Overview({ d, s }: { d: Data; s: DaySummary }): JSX.Element {
  const max = Math.max(1, ...Object.values(s.cats).map(v => v ?? 0))
  const warn = (['sz', 'sh'] as Platform[]).filter(p => s.platforms?.[p] && !s.platforms[p]?.ok)
  const capped = (['sz', 'sh'] as Platform[]).filter(p => s.platforms?.[p]?.capped)
  return (
    <>
      <dl className="ir-stats" aria-label="当日问答概览">
        <div><dt>已回复问答</dt><dd>{s.total}<small>条</small></dd></div>
        <div><dt>深交所互动易</dt><dd>{s.sz}<small>条</small></dd></div>
        <div><dt>上证 e 互动</dt><dd>{s.sh}<small>条</small></dd></div>
        <div><dt>涉及公司</dt><dd>{s.companies}<small>家</small></dd></div>
      </dl>
      {warn.length > 0 && <p className="mm-method">{warn.map(p => PLATFORM[p]).join('、')} 当天抓取失败，只含之前已存的条目。</p>}
      {capped.length > 0 && <p className="mm-method">{capped.map(p => PLATFORM[p]).join('、')} 达到每次抓取的页数上限，当天可能不全。</p>}
      <h3 className="ir-sub">回复分类（关键词规则）</h3>
      <ul className="ir-bars" aria-label="回复分类">
        {d.rules.cats.map(c => {
          const v = s.cats[c.id] ?? 0
          return (
            <li key={c.id}>
              <span className="ir-bars__label">{c.label}</span>
              <svg className="ir-bars__bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width={(v / max) * 100} height="10" rx="1.5" /></svg>
              <span className="ir-bars__n">{v}<small>{s.total ? ` ${((v / s.total) * 100).toFixed(0)}%` : ''}</small></span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/* ---------- 热门公司 ---------- */
function Hot({ d, s }: { d: Data; s: DaySummary }): JSX.Element {
  const cols: Array<Col<HotCompany>> = [
    { key: 'n', label: '回复数', num: true, render: r => r.n, sort: r => r.n },
    { key: 'p', label: '平台', render: r => (r.p === 'sz' ? '互动易' : 'e 互动') },
    { key: 'cats', label: '主要分类', render: r => topCat(d, r) },
    { key: 'chg', label: `回复日涨跌${s.quoteDay ? `（${md(s.quoteDay)}）` : ''}`, num: true, render: r => pct(r.chg), sort: r => r.chg, cls: r => tone(r.chg) },
    { key: 'next', label: `次一交易日${s.quoteNext ? `（${md(s.quoteNext)}）` : ''}`, num: true, render: r => pct(r.next), sort: r => r.next, cls: r => tone(r.next) },
    { key: 'ind', label: '行业', render: r => r.ind ?? '—', sort: r => r.ind },
  ]
  return (
    <>
      <StockTable label="热门公司列表" rows={s.hot} cols={cols} initial={{ key: 'n', dir: 'desc' }} empty="当天没有问答" />
      {!s.quoteDay && <p className="mm-method">回复日不是交易日，没有当日涨跌。</p>}
      <p className="mm-method">{METHOD.hot}</p>
    </>
  )
}

/* ---------- 关键词热度 ---------- */
function Keywords({ d, s, onPick }: { d: Data; s: DaySummary; onPick: (kw: string) => void }): JSX.Element {
  return (
    <>
      {s.keywords.length ? (
        <ul className="ir-chips" aria-label="关键词热度">
          {s.keywords.map(k => (
            <li key={k.kw}><button type="button" className="ir-chip" onClick={() => onPick(d.rules.keywords.find(x => x.kw === k.kw)?.words[0] ?? k.kw)}>{k.kw}<b>{k.n}</b><small>{k.companies} 家</small></button></li>
          ))}
        </ul>
      ) : <p className="mm-empty">当天提问里没有命中关键词表。</p>}
      <p className="mm-method">{METHOD.keywords} 点关键词可在下方问答里检索。</p>
      <details className="ir-details">
        <summary>关键词表</summary>
        <p className="ir-words">{d.rules.keywords.map(k => `${k.kw}：${k.words.join(' / ')}`).join('；')}</p>
      </details>
    </>
  )
}

/* ---------- 问答检索 ---------- */
const PAGE = 30
function QaList({ d, s, query, setQuery }: { d: Data; s: DaySummary; query: string; setQuery: (q: string) => void }): JSX.Element {
  const load = useJson<IrmDay>(s.file, body => asIrmDay(body, s.date))
  const [cat, setCat] = useState<'all' | CatId>('all')
  const [plat, setPlat] = useState<'all' | Platform>('all')
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => { setLimit(PAGE) }, [s.date, cat, plat, query])
  const filtered = useMemo(() => {
    const items = load.state === 'ok' ? load.data.items : []
    const k = query.trim()
    return items.filter(x => (cat === 'all' || x.cat === cat) && (plat === 'all' || x.p === plat)
      && (!k || x.q.includes(k) || x.a.includes(k) || x.name.includes(k) || x.code === k))
  }, [load, cat, plat, query])
  if (load.state === 'loading') return <p className="mm-empty">加载问答明细…</p>
  if (load.state !== 'ok') return <p className="mm-empty">{s.date} 的问答明细暂不可用{load.state === 'error' ? `（${load.message}）` : ''}。</p>
  const q = load.data.quotes
  return (
    <>
      <div className="ir-filters">
        <label className="ir-search">
          <span>检索</span>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="公司名、代码或关键词" aria-label="检索问答" />
        </label>
        <Segmented items={[{ id: 'all' as const, label: '全部平台' }, { id: 'sz' as const, label: '互动易' }, { id: 'sh' as const, label: 'e 互动' }]} value={plat} onChange={setPlat} label="平台" />
        <Segmented items={[{ id: 'all' as const, label: '全部分类' }, ...d.rules.cats.map(c => ({ id: c.id, label: c.label }))]} value={cat} onChange={setCat} label="分类" />
      </div>
      <p className="mm-method" aria-live="polite">共 {filtered.length} 条{query.trim() ? `（检索「${query.trim()}」）` : ''}，按回复时间倒序。</p>
      <ul className="ir-qa" aria-label="问答列表">
        {filtered.slice(0, limit).map(x => {
          const chg = q.d?.[x.code]?.[0] ?? null, next = q.n?.[x.code]?.[0] ?? null
          return (
            <li key={x.id} className="ir-qa__item">
              <div className="ir-qa__head">
                <b>{x.name}</b><small>{x.code}</small>
                <span className="kd-tag">{catLabel(d, x.cat)}</span>
                <span className="ir-qa__meta">{x.p === 'sz' ? '互动易' : 'e 互动'} · 回复 {x.at.slice(5)}</span>
                <span className="ir-qa__meta">回复日 <span className={tone(chg)}>{pct(chg)}</span> · 次一交易日 <span className={tone(next)}>{pct(next)}</span></span>
              </div>
              <p className="ir-qa__q"><span className="ir-qa__mark">问</span>{x.q}</p>
              <p className="ir-qa__a"><span className="ir-qa__mark">答</span>{x.a} <a href={x.url} target="_blank" rel="noreferrer">{x.p === 'sz' ? '原文' : '公司主页'}</a></p>
            </li>
          )
        })}
      </ul>
      {filtered.length > limit && <button type="button" className="ir-more" onClick={() => setLimit(l => l + PAGE)}>再显示 {Math.min(PAGE, filtered.length - limit)} 条</button>}
    </>
  )
}

/* ---------- 问询函 / 监管函 ---------- */
function Letters({ d }: { d: Data }): JSX.Element {
  const [g, setG] = useState<string>('all')
  const L = d.letters
  if (!L) return <Card title="问询函 / 监管函" as="section" className="mm-card"><p className="mm-empty">函件数据暂不可用。</p></Card>
  const groups = Object.keys(LETTER_GROUP_LABEL)
  const rows = L.items.filter(x => g === 'all' || x.group === g)
  return (
    <Card title="问询函 / 监管函" as="section" className="mm-card" description={`${L.from} 至 ${L.to}，两所共 ${L.items.length} 份。`}>
      <Segmented items={[{ id: 'all', label: `全部 ${L.items.length}` }, ...groups.map(id => ({ id, label: `${LETTER_GROUP_LABEL[id]} ${L.counts[id] ?? 0}` }))]} value={g} onChange={setG} label="函件类型" />
      {rows.length ? (
        <TableWrap label="函件列表">
          <table className="ui-table kd-table ir-letters">
            <thead><tr><th scope="col">日期</th><th scope="col">公司</th><th scope="col">交易所</th><th scope="col">类型</th><th scope="col">标题</th></tr></thead>
            <tbody>
              {rows.map(x => (
                <tr key={`${x.ex}${x.date}${x.title}${x.url ?? ''}`}>
                  <td>{x.date}</td>
                  <td>{x.name || '—'}{x.code ? <small>{x.code}</small> : null}</td>
                  <td>{x.ex === 'sz' ? '深交所' : '上交所'}</td>
                  <td>{x.type}</td>
                  <td className="ir-letters__title">{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> : x.title}{x.reply ? <> · <a href={x.reply} target="_blank" rel="noreferrer">公司回复</a></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : <p className="mm-empty">这段时间没有该类函件。</p>}
      {L.errors.length > 0 && <p className="mm-method">部分来源本次抓取失败（{L.errors.join('、')}），沿用上一次的结果。</p>}
      <p className="mm-method">{METHOD.letters}</p>
    </Card>
  )
}

/* ---------- 分类规则 ---------- */
function Rules({ d }: { d: Data }): JSX.Element {
  return (
    <>
      <p className="mm-method">{METHOD.cats.replace('{head}', String(d.rules.headChars))}</p>
      <TableWrap label="分类规则表">
        <table className="ui-table kd-table ir-rules">
          <thead><tr><th scope="col">顺序</th><th scope="col">分类</th><th scope="col">匹配范围</th><th scope="col">关键词</th></tr></thead>
          <tbody>
            {d.rules.list.map((r, i) => (
              <tr key={r.id}><td>{i + 1}</td><th scope="row">{r.label}</th><td>{r.scope === 'head' ? `去掉客套话后前 ${d.rules.headChars} 字` : '回复全文'}</td><td className="ir-rules__words">{r.words.join('、')}</td></tr>
            ))}
            <tr><td>{d.rules.list.length + 1}</td><th scope="row">其他</th><td>—</td><td>以上都没命中</td></tr>
          </tbody>
        </table>
      </TableWrap>
    </>
  )
}

export default function KplIrm(): JSX.Element {
  const load = useJson<Data>('kpl-irm.json', asKplIrm)
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 互动问答</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      {load.state === 'loading' && <p className="mm-empty">加载中…</p>}
      {load.state === 'missing' && <EmptyState title="互动问答数据尚未生成">收盘后首次运行数据脚本，这里就会显示当日互动易 / e 互动问答、热门公司和问询函。</EmptyState>}
      {load.state === 'error' && <EmptyState title="互动问答数据暂不可用">{load.message}</EmptyState>}
      {load.state === 'ok' && <IrmBody d={load.data} />}
    </Page>
  )
}

function IrmBody({ d }: { d: Data }): JSX.Element {
  const [date, setDate] = useState(d.days[0].date)
  const [query, setQuery] = useState('')
  const s = d.days.find(x => x.date === date) ?? d.days[0]
  const pick = (kw: string): void => { setQuery(kw); document.getElementById('ir-qa')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) }
  return (
    <>
      <PageDataFreshness checkedAt={d.generatedAt} dataDates={[d.asOf]} note="收盘后更新" />
      <Card title="每日互动问答" as="section" className="mm-card" description="按公司回复日期归档；可切换最近 7 天。">
        <Segmented items={d.days.map(x => ({ id: x.date, label: `${md(x.date)} · ${x.total}` }))} value={s.date} onChange={setDate} label="回复日期" />
        <Overview d={d} s={s} />
        {d.history.length > 1 && (
          <div className="ir-trend">
            <MoodChart points={d.history.map(h => ({ date: h.date, value: h.total }))} label="每日已回复问答条数" format={v => v.toFixed(0)} kind="bar" zeroBase />
            <p className="mm-method">每日已回复问答条数（两所合计），从本页开始采集之日起累积。</p>
          </div>
        )}
      </Card>
      <Card title="热门公司" as="section" className="mm-card" description={`${s.date} 回复条数最多的公司。`}>
        <Hot d={d} s={s} />
      </Card>
      <Card title="关键词热度" as="section" className="mm-card">
        <Keywords d={d} s={s} onPick={pick} />
      </Card>
      <Card id="ir-qa" title="问答明细" as="section" className="mm-card" description={`${s.date} 的已回复问答，可按关键词、平台、分类筛选。`}>
        <QaList d={d} s={s} query={query} setQuery={setQuery} />
      </Card>
      <Letters d={d} />
      <Card title="分类规则" as="section" className="mm-card">
        <Rules d={d} />
      </Card>
      <Callout title="口径与来源">
        <p>{d.note}</p>
        <p>{METHOD.qa}</p>
        <p>{METHOD.skipped}</p>
        <p>来源：{d.sources.map((x, i) => <React.Fragment key={x.id}>{i ? '、' : ''}<a href={x.url} target="_blank" rel="noreferrer">{x.label}</a></React.Fragment>)}。</p>
      </Callout>
    </>
  )
}
