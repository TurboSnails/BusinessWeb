// 今天几星 · 今日星级（/jixing）：本站自定的 A 股估值星级（1.0–5.9 星，越高越便宜），公开数据收盘后每天计算一次。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, EmptyState, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import JixingTabs, { JIXING_DISCLAIMER } from '../../features/jixing-tabs/JixingTabs'
import { SampleFootnote } from '../../features/jixing-tabs/StatusBadge'
import MoodChart from '../../features/market-mood/MoodChart'
import { METHOD, asJixingStar, bandOf, fix, pct, signed, starTone, type JixingStarData, type StarInput } from '../../features/jixing-star/model'
import '../../styles/market-mood.css'
import '../../styles/jixing-star.css'

const BASE = import.meta.env.BASE_URL
const ym = (d: string): string => `${d.slice(2, 4)}/${Number(d.slice(5, 7))}`
const yy = (d: string): string => d.slice(0, 4)
const back = (d: string, years: number): string => `${Number(d.slice(0, 4)) - years}${d.slice(4)}`

/** 星级尺：1–6 等分 5 段，标出当前星级。 */
function Ruler({ data }: { data: JixingStarData }): JSX.Element {
  const W = 600, L = 8, R = 8
  const x = (v: number): number => L + ((v - 1) / 5) * (W - L - R)
  const bands = [...data.bands].sort((a, b) => a.min - b.min)
  return <figure className="js-ruler">
    <svg viewBox={`0 0 ${W} 64`} role="img" aria-label={`星级尺：当前 ${data.star.toFixed(1)} 星，位于「${data.band}」区间`}>
      {bands.map((b, i) => <g key={b.label}>
        <rect className={`js-ruler__band is-b${i + 1}`} x={x(b.min)} y={22} width={x(b.min + 1) - x(b.min) - 2} height={14} rx={3} />
        <text className="js-ruler__label" x={(x(b.min) + x(b.min + 1)) / 2} y={54} textAnchor="middle">{b.label}</text>
        <text className="js-ruler__tick" x={x(b.min) + 2} y={16}>{b.min}</text>
      </g>)}
      <path className="js-ruler__mark" d={`M${x(data.star)},38 l-6,9 h12 z`} />
      <line className="js-ruler__needle" x1={x(data.star)} x2={x(data.star)} y1={18} y2={40} />
    </svg>
  </figure>
}

function Hero({ data }: { data: JixingStarData }): JSX.Element {
  const tone = starTone(data.star)
  return <Card as="section" className="mm-card js-hero" title="今日星级" description={`数据日 ${data.asOf}（收盘后计算，每天一次，不做盘中更新）`}>
    <div className="js-hero__main">
      <p className="js-hero__star"><strong>{data.star.toFixed(1)}</strong><span>星</span></p>
      <div className="js-hero__meta">
        <Badge tone={tone}>{data.band}</Badge>
        <p className="js-hero__change">
          较上一交易日{data.prevDate ? `（${data.prevDate}，${fix(data.prevStar, 1)} 星）` : ''}：
          <b className={data.change === null || data.change === 0 ? '' : data.change > 0 ? 'mm-down' : 'mm-up'}>{data.change === null ? '—' : `${signed(data.change)} 星`}</b>
        </p>
        <p className="mm-method">星级越高越便宜；变化为正（绿）表示估值较前一日更低。未截断的原始值 {fix(data.raw, 2)}。</p>
      </div>
    </div>
    <Ruler data={data} />
    <SampleFootnote>{METHOD.bands}</SampleFootnote>
  </Card>
}

function InputsCard({ data }: { data: JixingStarData }): JSX.Element {
  const { pe, pb, erp } = data.inputs
  const win = (i: StarInput): string => (i.start ? `${i.start} 起 ${i.n} 个交易日` : '—')
  const rows: Array<{ name: React.ReactNode; key: string; i: StarInput; value: string; median: string; hint: string }> = [
    { key: 'pe', name: <>中证全指 PE(TTM) <Link to="/jixing/table">估值表</Link></>, i: pe, value: fix(pe.value), median: fix(pe.median), hint: '越低越便宜' },
    { key: 'pb', name: <>沪深市场 PB <Link to="/jixing/signals">信号板</Link></>, i: pb, value: fix(pb.value), median: fix(pb.median), hint: '越低越便宜' },
    { key: 'erp', name: <>股债性价比 <Link to="/jixing/signals">信号板</Link></>, i: erp, value: erp.value === null ? '—' : `${fix(erp.value)} 个百分点`, median: erp.median === null ? '—' : `${fix(erp.median)} 个百分点`, hint: '越高越便宜' },
  ]
  return <Card as="section" className="mm-card" title="三项输入" description={`同一交易日 ${data.asOf} 的数据；分位窗口为滚动近 ${data.params.windowYears} 年（不足时为已有全部历史）。`}>
    <ul className="jx-links">
      <li><Link to="/jixing/table">A股估值表 · 中证全指</Link></li>
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
const INPUTS = [{ id: '1', label: 'PE(TTM)' }, { id: '2', label: 'PB' }, { id: '3', label: '股债性价比' }]

function HistoryCard({ data }: { data: JixingStarData }): JSX.Element {
  const [range, setRange] = useState('3')
  const [inp, setInp] = useState('1')
  const pts = useMemo(() => {
    const from = range === 'all' ? '' : back(data.asOf, Number(range))
    return data.history.filter(p => p[0] > from).map(([date, value]) => ({ date, value }))
  }, [data, range])
  const inputPts = useMemo(() => data.inputsWeekly.map(p => ({ date: p[0], value: p[Number(inp)] as number | null })), [data, inp])
  const label = RANGES.find(r => r.id === range)?.label ?? ''
  return <Card as="section" className="mm-card" title="历史星级" description={`自 ${data.since.star ?? '—'} 起逐个交易日；点按或移到图上读取当天星级。`}>
    <Segmented items={RANGES} value={range} onChange={setRange} label="历史星级区间" />
    <MoodChart
      label={`历史星级（${label}）`} points={pts} format={v => v.toFixed(1)}
      tipFormat={v => `${v.toFixed(1)} 星 · ${bandOf(data.bands, v) ?? ''}`}
      refs={[{ value: 5, label: '5 星' }, { value: 3, label: '3 星' }, { value: 2, label: '2 星' }]}
      tick={range === '1' ? ym : range === 'all' ? yy : ym}
    />
    <h3 className="js-sub">输入的历史（周采样）</h3>
    <Segmented items={INPUTS} value={inp} onChange={setInp} label="输入历史曲线" />
    <MoodChart label={`${INPUTS.find(i => i.id === inp)?.label} 周线`} points={inputPts} format={v => (inp === '3' ? `${v.toFixed(1)}` : v.toFixed(2))} tipFormat={v => (inp === '3' ? `${v.toFixed(2)} 个百分点` : v.toFixed(2))} tick={yy} />
  </Card>
}

function ChecksCard({ data }: { data: JixingStarData }): JSX.Element {
  return <Card as="section" className="mm-card" title="与公开文章里的螺丝钉星级对照" description="右列为公开文章里提到的银行螺丝钉当日星级（近似）；本站数值按本页公式独立计算。">
    <TableWrap label="星级对照">
      <table className="mm-table js-table">
        <thead><tr>{['日期', '本站星级', '本站区间', '公开文章里的螺丝钉星级', '中证全指 PE', '股债性价比'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{data.checks.map(c => <tr key={c.date}>
          <td>{c.date}</td>
          <td className="num">{c.star === null ? '—' : `${c.star.toFixed(1)} 星`}</td>
          <td>{c.band ?? '—'}</td>
          <td>{c.ref}</td>
          <td className="num">{fix(c.pe)}</td>
          <td className="num">{fix(c.erp)}</td>
        </tr>)}</tbody>
      </table>
    </TableWrap>
    <p className="mm-method">{METHOD.differ}</p>
  </Card>
}

export default function JixingStar(): JSX.Element {
  const [data, setData] = useState<JixingStarData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/jixing-star.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((body: unknown) => { if (!controller.signal.aborted) setData(asJixingStar(body)) })
      .catch(() => { if (!controller.signal.aborted) setData(null) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  return (
    <Page className="mm-page">
      <PageTitle>今天几星 · 今日星级</PageTitle>
      <JixingTabs />
      <p className="mm-disclaimer">{JIXING_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取星级数据…</p> : !data ? <EmptyState title="暂无星级数据">收盘后三项输入齐全才更新；数据文件缺失或格式异常时不展示。</EmptyState> : <>
        <Hero data={data} />
        <InputsCard data={data} />
        <HistoryCard data={data} />
        <ChecksCard data={data} />
        <Card as="section" className="mm-card" title="计算方法">
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
