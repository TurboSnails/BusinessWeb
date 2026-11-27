// 今天几星 · 今日星级（/jixing）：本站自定的 A 股估值星级（1.0–5.9 星，越高越便宜），公开数据收盘后每天计算一次。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, EmptyState, LoadError, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import JixingTabs, { JIXING_DISCLAIMER } from '../../features/jixing-tabs/JixingTabs'
import { SampleFootnote } from '../../features/jixing-tabs/StatusBadge'
import MoodChart from '../../features/market-mood/MoodChart'
import { METHOD, asJixingStar, bandOf, fix, pct, signed, starTone, type JixingStarData, type NeutralCheckWindow, type NeutralStar, type StarCheck, type StarInput } from '../../features/jixing-star/model'
import '../../styles/market-mood.css'
import '../../styles/jixing-star.css'

const BASE = import.meta.env.BASE_URL
const ym = (d: string): string => `${d.slice(2, 4)}/${Number(d.slice(5, 7))}`
const yy = (d: string): string => d.slice(0, 4)
const back = (d: string, years: number): string => `${Number(d.slice(0, 4)) - years}${d.slice(4)}`

/** 星级尺：色条在 SVG 内；刻度/标签用 HTML，避免 viewBox 缩放把字压到 12px 以下。 */
function Ruler({ data }: { data: Pick<JixingStarData, 'bands' | 'star' | 'band'> }): JSX.Element {
  const W = 600, L = 8, R = 8
  const x = (v: number): number => L + ((v - 1) / 5) * (W - L - R)
  const bands = [...data.bands].sort((a, b) => a.min - b.min)
  return <figure className="js-ruler">
    <div className="js-ruler__ticks" aria-hidden="true">
      {bands.map((b, i) => (
        <span key={`t-${b.min}`} className={i === bands.length - 1 ? 'is-end' : undefined}>
          {b.min}{i === bands.length - 1 ? <em>6</em> : null}
        </span>
      ))}
    </div>
    <svg viewBox={`0 0 ${W} 40`} role="img" aria-label={`星级尺：当前 ${data.star.toFixed(1)} 星，位于「${data.band}」区间`}>
      {bands.map((b, i) => (
        <rect key={b.label} className={`js-ruler__band is-b${i + 1}`} x={x(b.min)} y={10} width={x(b.min + 1) - x(b.min) - 2} height={14} rx={3} />
      ))}
      <path className="js-ruler__mark" d={`M${x(data.star)},26 l-6,9 h12 z`} />
      <line className="js-ruler__needle" x1={x(data.star)} x2={x(data.star)} y1={6} y2={28} />
    </svg>
    <div className="js-ruler__labels" aria-hidden="true">
      {bands.map(b => <span key={b.label}>{b.label}</span>)}
    </div>
  </figure>
}

function Hero({ data }: { data: JixingStarData }): JSX.Element {
  const main = data.neutral ?? data
  const tone = starTone(main.star)
  return <Card as="section" className="mm-card js-hero" title={data.neutral ? '行业中性星级' : '中证全指口径星级'} description={`数据日 ${main.asOf}（收盘后计算，不做盘中更新）`}>
    <div className="js-hero__main">
      <p className="js-hero__star"><strong>{main.star.toFixed(1)}</strong><span>星</span></p>
      <div className="js-hero__meta">
        <Badge tone={tone}>{main.band}</Badge>
        <p className="js-hero__change">
          较上一交易日{main.prevDate && main.prevStar !== null ? `（${main.prevDate}，${fix(main.prevStar, 1)} 星）` : ''}：
          <b className={main.change === null || main.change === 0 ? '' : main.change > 0 ? 'mm-down' : 'mm-up'}>{main.change === null ? '—' : `${signed(main.change)} 星`}</b>
        </p>
        <p className="mm-method">星级越高越便宜；变化为正（绿）表示估值较前一日更低。未截断的原始值 {fix(main.raw, 4)}。</p>
      </div>
    </div>
    <Ruler data={{ bands: data.bands, star: main.star, band: main.band }} />
    {data.neutral ? <div className="js-hero__comparison">
      <p><strong>中证全指口径星级 {data.star.toFixed(1)} 星</strong> · {data.asOf}</p>
      <p>股债性价比 {data.inputs.erp.value === null ? '—' : `${fix(data.inputs.erp.value)} 个百分点`} · {data.asOf}</p>
      <SampleFootnote>{METHOD.neutralErp}</SampleFootnote>
    </div> : <SampleFootnote>暂无行业中性数据。</SampleFootnote>}
    <SampleFootnote>{METHOD.bands}</SampleFootnote>
  </Card>
}

function IndustriesCard({ data }: { data: NeutralStar }): JSX.Element {
  const sample = (metric: NeutralStar['industries'][number]['pe']): string =>
    metric.start ? `${metric.start}（${metric.n} 周）` : '—'
  return <Card as="section" className="mm-card" title="一级行业估值分位" description={`${data.asOf} · ${data.count}/${data.industries.length} 个行业参与计算`}>
    <TableWrap label="一级行业估值分位" stickyFirst>
      <table className="mm-table js-table">
        <thead><tr>{['行业', 'PE(TTM)', 'PE 分位', 'PB', 'PB 分位', '便宜度', 'PE 样本起点', 'PB 样本起点'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{data.industries.map(row => <tr key={row.code}>
          <th scope="row">{row.name}<small>{row.code}（旧 {row.oldCode}）</small></th>
          <td className="num">{fix(row.pe.value)}</td>
          <td className="num">{pct(row.pe.pct)}</td>
          <td className="num">{fix(row.pb.value)}</td>
          <td className="num">{pct(row.pb.pct)}</td>
          <td className="num">{pct(row.cheapness === null ? null : 100 * row.cheapness)}</td>
          <td>{sample(row.pe)}</td>
          <td>{sample(row.pb)}</td>
        </tr>)}</tbody>
      </table>
    </TableWrap>
    <SampleFootnote>通信服务（50）接续旧版电信业务（08）。2021-12-10 中证行业分类修订，部分行业成分调整，前后估值不完全可比。</SampleFootnote>
    <SampleFootnote>{METHOD.neutral}</SampleFootnote>
  </Card>
}

function InputsCard({ data }: { data: JixingStarData }): JSX.Element {
  const { pe, pb, erp } = data.inputs
  const win = (i: StarInput): string => (i.start ? `${i.start} 起 ${i.n} 个交易日` : '—')
  const rows: Array<{ name: React.ReactNode; key: string; i: StarInput; value: string; median: string; hint: string }> = [
    { key: 'pe', name: <>中证全指 滚动市盈率 <Link to="/jixing/table?code=000985">估值表</Link></>, i: pe, value: fix(pe.value), median: fix(pe.median), hint: '越低越便宜' },
    { key: 'pb', name: <>沪深市场 PB <Link to="/jixing/signals">信号板</Link></>, i: pb, value: fix(pb.value), median: fix(pb.median), hint: '越低越便宜' },
    { key: 'erp', name: <>股债性价比 <Link to="/jixing/signals">信号板</Link></>, i: erp, value: erp.value === null ? '—' : `${fix(erp.value)} 个百分点`, median: erp.median === null ? '—' : `${fix(erp.median)} 个百分点`, hint: '越高越便宜' },
  ]
  return <Card as="section" className="mm-card" title="中证全指口径的三项输入" description={`同一交易日 ${data.asOf} 的数据；分位窗口为滚动近 ${data.params.windowYears} 年（不足时为已有全部历史）。`}>
    <ul className="jx-links">
      <li><Link to="/jixing/table?code=000985">估值表 · 中证全指</Link></li>
      <li><Link to="/jixing/signals">牛熊信号板 · 股债性价比 / PB</Link></li>
    </ul>
    <TableWrap label="星级的三项输入" stickyFirst>
      <table className="mm-table js-table">
        <thead><tr>{['输入', '当前值', `近 ${data.params.windowYears} 年中位数`, '历史分位', '窗口', '分项星'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.key}>
          <th scope="row">{r.name}<small>{r.hint}</small></th>
          <td className="num">{r.value}</td>
          <td className="num">{r.median}</td>
          <td className="num">{pct(r.i.pct)}</td>
          <td>{win(r.i)}</td>
          <td className="num">{signed(r.i.sub, 2)}</td>
        </tr>)}</tbody>
      </table>
    </TableWrap>
    <SampleFootnote>股债性价比 = 盈利收益率 {erp.ey === null ? '—' : `${fix(erp.ey)}%`}（100 ÷ PE）− 10 年期国债收益率 {erp.y10 === null ? '—' : `${fix(erp.y10, 4)}%`}。</SampleFootnote>
    <SampleFootnote>{METHOD.pct}</SampleFootnote>
  </Card>
}

const RANGES = [{ id: '1', label: '近 1 年' }, { id: '3', label: '近 3 年' }, { id: '5', label: '近 5 年' }, { id: 'all', label: '全部' }]
const BASES = [{ id: 'neutral', label: '行业中性' }, { id: 'legacy', label: '中证全指口径' }]
const INPUTS = [{ id: '1', label: '滚动市盈率' }, { id: '2', label: 'PB' }, { id: '3', label: '股债性价比' }]

function HistoryCard({ data }: { data: JixingStarData }): JSX.Element {
  const [basis, setBasis] = useState('neutral')
  const neutral = basis === 'neutral' ? data.neutral : undefined
  const [range, setRange] = useState('3')
  const [inp, setInp] = useState('1')
  const pts = useMemo(() => {
    const from = range === 'all' ? '' : back(neutral?.asOf ?? data.asOf, Number(range))
    return (neutral?.history ?? data.history).filter(p => p[0] > from).map(([date, value]) => ({ date, value }))
  }, [data, neutral, range])
  const inputPts = useMemo(() => data.inputsWeekly.map(p => ({ date: p[0], value: p[Number(inp)] as number | null })), [data, inp])
  const label = RANGES.find(r => r.id === range)?.label ?? ''
  return <Card as="section" className="mm-card" title="历史星级" description={`自 ${neutral?.history[0]?.[0] ?? data.since.star ?? '—'} 起${neutral ? '按周采样' : '逐个交易日'}，点按或移动到图上读取星级。`}>
    {data.neutral && <Segmented items={BASES} value={basis} onChange={setBasis} label="历史星级口径" />}
    <Segmented items={RANGES} value={range} onChange={setRange} label="历史星级区间" />
    <MoodChart
      label={`${neutral ? '行业中性' : '中证全指口径'}历史星级（${label}）`} points={pts} format={v => v.toFixed(1)}
      tipFormat={v => `${v.toFixed(1)} 星 · ${bandOf(data.bands, v) ?? ''}`}
      refs={[{ value: 5, label: '5 星' }, { value: 3, label: '3 星' }, { value: 2, label: '2 星' }]}
      tick={range === '1' ? ym : range === 'all' ? yy : ym}
    />
    <h3 className="js-sub">输入的历史（周采样）</h3>
    <Segmented items={INPUTS} value={inp} onChange={setInp} label="输入历史曲线" />
    <MoodChart label={`${INPUTS.find(i => i.id === inp)?.label} 周线`} points={inputPts} format={v => (inp === '3' ? `${v.toFixed(1)}` : v.toFixed(2))} tipFormat={v => (inp === '3' ? `${v.toFixed(2)} 个百分点` : v.toFixed(2))} tick={yy} />
  </Card>
}

function checkValue(star: number | null, ref: StarCheck): string {
  if (star === null) return '—'
  if (ref.refMax === undefined) return `${star.toFixed(1)} 星`
  const min = signed(star - ref.refMax)
  const delta = ref.refMin === null ? `≥ ${min}` : ref.refMin === undefined || ref.refMin === ref.refMax ? min : `${min} 至 ${signed(star - ref.refMin)}`
  return `${star.toFixed(1)} 星（偏差 ${delta}）`
}

function checkWindow(window: NeutralCheckWindow | null): string {
  if (!window) return '—'
  const start = window.start === window.latestStart ? window.start : `${window.start} 至 ${window.latestStart}`
  const weeks = window.min === window.max ? window.min : `${window.min}–${window.max}`
  return `${start} 起（${weeks} 周）`
}

function ChecksCard({ data }: { data: JixingStarData }): JSX.Element {
  const neutral = new Map(data.neutral?.checks.map(row => [row.date, row]))
  return <Card as="section" className="mm-card" title="与螺丝钉星级对照" description="参考值来自公开文章及用户的小程序观察。偏差为本站星级减去参考星级，单位为星。">
    <TableWrap label="星级对照" stickyFirst>
      <table className="mm-table js-table">
        <thead><tr>{['日期', '螺丝钉参考星级', '行业中性星级', '行业中性样本窗口', '中证全指口径星级'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{data.checks.map(c => {
          const check = neutral.get(c.date)
          const insufficient = check?.window && check.star === null
          const missingLabel = check?.window && check.window.min < (data.neutral?.minWeeks ?? 156) ? '样本不足' : '估值数据缺失'
          return <tr key={c.date}>
            <th scope="row">{c.date}</th>
            <td>{c.ref}</td>
            <td className="num">{insufficient ? missingLabel : checkValue(check?.star ?? null, c)}</td>
            <td>{checkWindow(check?.window ?? null)}</td>
            <td className="num">{checkValue(c.star, c)}</td>
          </tr>
        })}</tbody>
      </table>
    </TableWrap>
    <SampleFootnote>{METHOD.differ}</SampleFootnote>
  </Card>
}

export default function JixingStar(): JSX.Element {
  const [data, setData] = useState<JixingStarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setLoading(true); setError(null); setData(null); setAttempt(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/jixing-star.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: unknown) => {
        if (controller.signal.aborted) return
        const parsed = asJixingStar(body)
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
  return (
    <Page className="mm-page">
      <PageTitle>今天几星 · 今日星级</PageTitle>
      <JixingTabs />
      <p className="mm-disclaimer">{JIXING_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取星级数据…</p> : error ? (
        <LoadError reason="星级数据这份读数现在拿不到。" detail={error} onRetry={retry} />
      ) : !data ? <EmptyState title="暂无星级数据">收盘后更新，待公开数据发布。</EmptyState> : <>
        <Hero data={data} />
        {data.neutral && <IndustriesCard data={data.neutral} />}
        <InputsCard data={data} />
        <HistoryCard data={data} />
        <ChecksCard data={data} />
        <Card as="section" className="mm-card" title="计算方法">
          <h3 className="js-sub">行业中性口径</h3>
          <ul className="js-list">
            <li>{METHOD.neutralScope}</li>
            <li>{METHOD.neutralScore(data.neutral?.minWeeks ?? 156)}</li>
            <li>{METHOD.neutralErp}</li>
          </ul>
          <h3 className="js-sub">中证全指口径</h3>
          <ul className="js-list">
            <li>{METHOD.formula(data.params)}</li>
            <li>{METHOD.subs(data.params)}</li>
            <li>{METHOD.window(data.params, data.since)}</li>
            <li>{METHOD.inputs}</li>
            <li>{METHOD.update}</li>
            <li>{METHOD.differ}</li>
          </ul>
          <p className="mm-method">采集时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京）。公开来源：{data.sources.map((s, i) => <React.Fragment key={s.url}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。</p>
        </Card>
      </>}
    </Page>
  )
}
