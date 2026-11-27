// 同花顺 · 技术选股（/ths-mood/screener）：收盘后按固定公式对全市场机械筛选（均线、MACD、RSI、KDJ、BOLL、新高新低、K 线形态）
// + 当日量能条件（量比 / 换手 / 振幅快照）+ 市场宽度走势。
// 数据只读复用开盘啦「复盘」页的全市场日线快照仓，由 scripts/ths-screener.mjs 生成。历史统计，不是买卖信号。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, EmptyState, LoadError, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import ThsTabs, { THS_DISCLAIMER } from '../../features/ths-tabs/ThsTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import StockTable, { num, pct, tone, type Col } from '../../features/kpl-daban/StockTable'
import { METHOD, asThsScreener, byIndustry, rowsOf, snapRowsOf, type BreadthDay, type Preset, type Row, type Snapshot, type SnapRow, type ThsScreenerData } from '../../features/ths-screener/model'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/ths-screener.css'

const BASE = import.meta.env.BASE_URL

type Metric = 'above20' | 'above60' | 'high20' | 'low20' | 'ratio'
const METRICS: Array<{ id: Metric; label: string; chart: string; format: (v: number) => string; refs?: Array<{ value: number; label: string }>; kind: 'line' | 'bar' }> = [
  { id: 'above20', label: '站上 20 日线', chart: '站上 20 日线家数占比', format: v => `${v.toFixed(1)}%`, refs: [{ value: 50, label: '50%' }], kind: 'line' },
  { id: 'above60', label: '站上 60 日线', chart: '站上 60 日线家数占比', format: v => `${v.toFixed(1)}%`, refs: [{ value: 50, label: '50%' }], kind: 'line' },
  { id: 'high20', label: '20 日新高', chart: '20 日新高家数', format: v => `${Math.round(v)} 家`, kind: 'bar' },
  { id: 'low20', label: '20 日新低', chart: '20 日新低家数', format: v => `${Math.round(v)} 家`, kind: 'bar' },
  { id: 'ratio', label: '涨跌家数比', chart: '涨跌家数比（上涨 ÷ 下跌）', format: v => v.toFixed(2), refs: [{ value: 1, label: '1' }], kind: 'line' },
]
const metricText = (d: BreadthDay | undefined, m: Metric): string => {
  const v = d?.[m] ?? null
  return v === null ? '—' : METRICS.find(x => x.id === m)?.format(v) ?? '—'
}
const avg = (xs: Array<number | null>): number | null => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }
// 展示值是幅度 / 离散度而不是涨跌（均线离散度、布林带宽）：不带正负号、不上红绿色
const NEUTRAL = new Set(['tangle', 'squeeze'])
const xText = (p: Preset, x: number | null): string => x === null ? '—' : NEUTRAL.has(p.id) ? `${num(x, 2)}%` : p.xUnit === '%' ? pct(x) : p.xUnit ? `${num(x, 0)} ${p.xUnit}` : num(x, p.id.startsWith('rsi') || p.id.startsWith('kdj') ? 1 : 3)
const plain = (x: number | null, d = 2, unit = ''): string => x === null ? '—' : `${num(x, d)}${unit}`

function IndustryTable({ label, groups, total }: { label: string; groups: ReturnType<typeof byIndustry>; total: number }): JSX.Element {
  return <TableWrap label={`${label} 按行业汇总`}>
    <table className="mm-table ts-industry">
      <thead><tr><th scope="col">行业</th><th scope="col" className="num">家数</th><th scope="col" className="num">占命中</th><th scope="col">个股</th></tr></thead>
      <tbody>{groups.map(g => <tr key={g.industry}>
        <th scope="row">{g.industry}</th><td className="num">{g.count}</td><td className="num">{num((g.count / total) * 100, 1)}%</td>
        <td className="ts-names">{g.names.slice(0, 6).join('、')}{g.names.length > 6 ? ` 等 ${g.names.length} 只` : ''}</td>
      </tr>)}</tbody>
    </table>
  </TableWrap>
}

function PresetButtons({ group, presets, sel, onSel }: { group: string; presets: Preset[]; sel: string; onSel: (id: string) => void }): JSX.Element {
  return <div className="ts-presets" role="group" aria-label={`${group}预设`}>
    {presets.map(p => <button key={p.id} type="button" className="ts-preset" aria-pressed={p.id === sel} onClick={() => onSel(p.id)}>
      <span className="ts-preset__label">{p.label}</span>
      <strong className="ts-preset__count">{p.count}</strong>
      <span className="ts-preset__sub">{p.history.length > 1 ? `近 ${p.history.length} 日均 ${num(avg(p.history.map(h => h.count)), 0)}` : '首日采集'}</span>
    </button>)}
  </div>
}

function SnapshotCard({ snap, note }: { snap: Snapshot | null; note: string | null }): JSX.Element {
  const [sel, setSel] = useState(snap?.presets[0]?.id ?? '')
  const p = snap?.presets.find(x => x.id === sel) ?? snap?.presets[0]
  const rows = useMemo(() => (p && snap ? snapRowsOf(p, snap.stocks) : []), [p, snap])
  const groups = useMemo(() => byIndustry(rows), [rows])
  if (!snap || !p) return <Card title="量能条件（当日快照）" as="section" className="mm-card">
    <EmptyState title="暂无当日量能数据">{note ?? '当日量能快照缺失。'}</EmptyState>
    <p className="mm-method">{METHOD.snapshot}</p>
  </Card>
  const cols: Array<Col<SnapRow>> = [
    { key: 'x', label: p.xLabel, num: true, render: r => p.xUnit === '%' ? plain(r.x, 2, '%') : plain(r.x), sort: r => r.x },
    { key: 'industry', label: '行业', render: r => r.industry || '—', sort: r => r.industry || null },
    { key: 'close', label: '收盘', num: true, render: r => num(r.close, 2), sort: r => r.close },
    { key: 'pct', label: '涨跌幅', num: true, render: r => pct(r.pct), sort: r => r.pct, cls: r => tone(r.pct) },
    { key: 'volRatio', label: '量比', num: true, render: r => plain(r.volRatio), sort: r => r.volRatio },
    { key: 'turnover', label: '换手率', num: true, render: r => plain(r.turnover, 2, '%'), sort: r => r.turnover },
    { key: 'amount', label: '成交额', num: true, render: r => plain(r.amount, 2, ' 亿'), sort: r => r.amount },
    { key: 'amp', label: '振幅', num: true, render: r => plain(r.amp, 2, '%'), sort: r => r.amp },
  ]
  return <Card title="量能条件（当日快照）" as="section" className="mm-card" description={`${snap.date} 收盘后快照 · 当日有成交 ${snap.eligible} 只 · 点选查看公式与命中个股`}>
    <PresetButtons group="量能" presets={snap.presets} sel={p.id} onSel={setSel} />
    <h3 className="ts-h3">{p.label}：{p.count} 家</h3>
    <p className="ts-formula"><strong>公式</strong>{p.formula}</p>
    {p.history.length > 1 && <MoodChart label={`${p.label} 已采集 ${p.history.length} 日命中家数`} kind="bar" points={p.history.map(h => ({ date: h.date, value: h.count }))} format={v => `${Math.round(v)} 家`} />}
    <StockTable label={`${p.label} 命中个股`} rows={rows} cols={cols} initial={{ key: 'x', dir: 'desc' }} empty="今日没有股票满足这个条件。" />
    {groups.length > 0 && <IndustryTable label={p.label} groups={groups} total={rows.length} />}
    <p className="mm-method">{METHOD.snapshot}</p>
  </Card>
}

function PresetDetail({ p, data }: { p: Preset; data: ThsScreenerData }): JSX.Element {
  const rows = useMemo(() => rowsOf(p, data.stocks), [p, data.stocks])
  const groups = useMemo(() => byIndustry(rows), [rows])
  const cols: Array<Col<Row>> = [
    { key: 'x', label: p.xLabel, num: true, render: r => xText(p, r.x), sort: r => r.x, cls: r => (p.xUnit === '%' && !NEUTRAL.has(p.id) ? tone(r.x) : '') },
    { key: 'industry', label: '行业', render: r => r.industry || '—', sort: r => r.industry || null },
    { key: 'close', label: '收盘', num: true, render: r => num(r.close, 2), sort: r => r.close },
    { key: 'pct', label: '涨跌幅', num: true, render: r => pct(r.pct), sort: r => r.pct, cls: r => tone(r.pct) },
    { key: 'dev20', label: '较 MA20', num: true, render: r => pct(r.dev20), sort: r => r.dev20, cls: r => tone(r.dev20) },
    { key: 'rsi', label: 'RSI(14)', num: true, render: r => num(r.rsi, 1), sort: r => r.rsi },
  ]
  const hist = p.history.map(h => h.count)
  return <Card title={`${p.label}：${p.count} 家`} as="section" className="mm-card" description={`参与判定 ${p.eligible} 只 · 近 ${p.history.length} 个交易日平均 ${num(avg(hist), 0)} 家`}>
    <p className="ts-formula"><strong>公式</strong>{p.formula}</p>
    <MoodChart label={`${p.label} 近 ${p.history.length} 日命中家数`} kind="bar" points={p.history.map(h => ({ date: h.date, value: h.count }))} format={v => `${Math.round(v)} 家`} />
    <p className="mm-method">每天按同一公式对当天收盘数据重算的命中家数，柱色按较前一日增减（红增绿减），不代表涨跌方向。</p>
    <h3 className="ts-h3">命中个股（点表头排序）</h3>
    <StockTable label={`${p.label} 命中个股`} rows={rows} cols={cols} initial={{ key: 'x', dir: p.asc ? 'asc' : 'desc' }} empty="今日没有股票满足这个条件。" />
    {groups.length > 0 && <>
      <h3 className="ts-h3">按行业汇总</h3>
      <IndustryTable label={p.label} groups={groups} total={rows.length} />
      <p className="mm-method">行业取东方财富行业分类（代码表当前值）；缺失的归入「未分类」。</p>
    </>}
  </Card>
}

export default function ThsScreener(): JSX.Element {
  const [data, setData] = useState<ThsScreenerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoading(true); setError(null); setData(null); setAttempt(n => n + 1) }
  const [sel, setSel] = useState('bull')
  const [metric, setMetric] = useState<Metric>('above20')
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/ths-tab-screener.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: unknown) => {
        if (controller.signal.aborted) return
        const parsed = asThsScreener(body)
        if (!parsed) { setError('数据文件格式不对'); setData(null); return }
        setData(parsed)
        setError(null)
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        setData(null)
        setError(e instanceof Error ? e.message : '网络错误')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])
  const preset = data ? data.presets.find(p => p.id === sel) ?? data.presets[0] : null
  const groups = data ? [...new Set(data.presets.map(p => p.group))] : []
  const last = data?.breadth.at(-1)
  const m = METRICS.find(x => x.id === metric) ?? METRICS[0]
  return (
    <Page className="mm-page ts-page">
      <PageTitle>同花顺 · 技术选股</PageTitle>
      <ThsTabs />
      <p className="mm-disclaimer">{THS_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取技术选股数据…</p> : error ? (
        <LoadError reason="技术选股这份读数现在拿不到。" detail={error} onRetry={retry} />
      ) : !data || !preset ? <EmptyState title="暂无技术选股数据">全市场日线快照仓更新当日收盘数据后（收盘后）计算；数据文件缺失或格式异常时不展示。</EmptyState> : <>
        <p className="mm-method">数据日期：{data.asOf}（{data.store.source === 'kline' ? '东方财富日 K 回补的快照' : '新浪收盘行情'}） · 当日有行情 {data.store.stocks} 只 · 快照仓 {data.store.from} ~ {data.store.to}，{data.store.days} 个交易日 · 计算时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京）</p>
        <Callout tone="warn" title="历史统计，不是买卖信号">{METHOD.nature}</Callout>

        <Card title="选股预设" as="section" className="mm-card" description="今日命中家数；点选查看公式、近 20 日走势与命中个股。">
          {groups.map(g => <div key={g} className="ts-group">
            <h3 className="ts-h3">{g}</h3>
            <PresetButtons group={g} presets={data.presets.filter(p => p.group === g)} sel={preset.id} onSel={setSel} />
          </div>)}
          <p className="mm-method">{METHOD.eligible}</p>
        </Card>

        <PresetDetail key={preset.id} p={preset} data={data} />

        <SnapshotCard snap={data.snapshot} note={data.snapshotNote} />

        <Card title="市场宽度（回算）" as="section" className="mm-card" description={`全市场每日走势，共 ${data.breadth.length} 个交易日`}>
          <dl className="ts-summary">
            {METRICS.map(x => <div key={x.id}><dt>{x.label}</dt><dd>{metricText(last, x.id)}</dd></div>)}
            <div><dt>上涨 / 下跌 / 平盘</dt><dd><span className="mm-up">{num(last?.up)}</span> / <span className="mm-down">{num(last?.down)}</span> / {num(last?.flat)}</dd></div>
          </dl>
          <Segmented items={METRICS.map(x => ({ id: x.id, label: x.label }))} value={metric} onChange={setMetric} label="宽度指标" />
          <MoodChart label={m.chart} kind={m.kind} points={data.breadth.map(d => ({ date: d.date, value: d[metric], muted: d.seeded }))} format={m.format} refs={m.refs} zeroBase={m.kind === 'bar'} />
          <p className="mm-method">{METHOD.breadth}</p>
          <p className="mm-method">{METHOD.seeded}</p>
        </Card>

        <div className="mm-method ts-callout">
          <p><strong>口径与边界。</strong>{METHOD.data}</p>
          <p>{METHOD.skipped}</p>
          <p>相关页面：涨停、炸板、百日新高等短线统计看开盘啦 <Link to="/market-mood/review">复盘</Link>（同一份快照仓）。</p>
        </div>
        <p className="mm-method">公开来源：{data.sources.map(s => <React.Fragment key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>{' '}</React.Fragment>)}</p>
      </>}
    </Page>
  )
}
