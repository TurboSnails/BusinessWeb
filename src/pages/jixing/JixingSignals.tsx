// 今天几星 · 牛熊信号板（/jixing/signals）：定量估值与市场情绪指标，各给当前值、历史分位与本站自定信号，公开数据收盘后更新。
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, EmptyState, Page } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import JixingTabs, { JIXING_DISCLAIMER } from '../../features/jixing-tabs/JixingTabs'
import { SampleFootnote, StatusBadge } from '../../features/jixing-tabs/StatusBadge'
import MoodChart from '../../features/market-mood/MoodChart'
import { METHOD, asJixingSignals, fmt, pct, signalTone, type Indicator, type JixingSignalsData } from '../../features/jixing-signals/model'
import '../../styles/market-mood.css'
import '../../styles/jixing-signals.css'

const BASE = import.meta.env.BASE_URL
const ym = (d: string): string => `${d.slice(2, 4)}/${Number(d.slice(5, 7))}`
const unitText = (i: Indicator, v: number | null): string => (v === null ? '—' : `${fmt(v, i.digits)}${i.unit === '%' ? '%' : ` ${i.unit}`}`)

function Row({ i }: { i: Indicator }): JSX.Element {
  const [open, setOpen] = useState(false)
  const when = i.month ? `${i.month}（月度）` : i.date
  const win = i.pct === null ? (i.window ? `${i.window}样本不足` : '不计算分位') : `${i.window}分位 ${pct(i.pct)}`
  return <li className="jsg-item">
    <div className="jsg-item__head">
      <h3 className="jsg-item__name">{i.name}</h3>
      {i.signal === '低估' || i.signal === '正常' || i.signal === '高估'
        ? <StatusBadge status={i.signal} />
        : i.signal ? <Badge tone={signalTone(i.signal)}>{i.signal}</Badge> : <Badge tone="muted">不判</Badge>}
    </div>
    <p className="jsg-item__value"><strong>{unitText(i, i.value)}</strong><span>{when}</span></p>
    <p className="jsg-item__pct">{win}{i.start ? `（${i.start} 起，${i.n} 个样本）` : ''}</p>
    {i.extra.length ? <dl className="jsg-item__extra">{i.extra.map(e => <div key={e.label}><dt>{e.label}</dt><dd>{e.value}</dd></div>)}</dl> : null}
    <SampleFootnote><b>规则：</b>{i.rule}</SampleFootnote>
    {i.note ? <SampleFootnote>{i.note}</SampleFootnote> : null}
    {(i.id === 'erp' || i.id === 'pb') ? <p className="jx-links"><Link to="/jixing">今日星级中的同口径输入</Link></p> : null}
    <button type="button" className="jsg-item__toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? '收起历史' : '查看历史'}</button>
    {open ? <MoodChart label={`${i.name} 历史`} points={i.history.map(([date, value]) => ({ date, value }))} format={v => fmt(v, Math.min(i.digits, 2))} tipFormat={v => unitText(i, v)} tick={ym} /> : null}
  </li>
}

function Group({ title, description, items }: { title: string; description: string; items: Indicator[] }): JSX.Element {
  return <Card as="section" className="mm-card" title={title} description={description}>
    {items.length ? <ul className="jsg-list">{items.map(i => <Row key={i.id} i={i} />)}</ul> : <p className="mm-empty">本组暂无数据</p>}
  </Card>
}

const INDICATOR_NAMES: Partial<Record<string, string>> = {
  buffett: '巴菲特指标',
  erp: '股债性价比',
  pb: '沪深市场 PB 分位',
  trM2: '中证全指全收益 / M2',
  margin: '融资余额 / 流通市值',
  amount: '两市成交额',
  ipo: '新股上市数与破发率',
  ipoCount: '新股上市数',
  ipoBroken: '新股破发率',
  funds: '新成立偏股型基金',
  accounts: '新增投资者（上交所）',
}

function SummaryLine({ data }: { data: JixingSignalsData }): JSX.Element {
  const s = data.summary
  const errorIds = data.errors.map(error => error.split('：', 1)[0])
  const missing = data.missing.filter(id => !errorIds.includes(id))
  const updateNotes = [
    ...data.errors.map((error, i) => {
      const id = errorIds[i]
      return (INDICATOR_NAMES[id] ?? id) + error.slice(id.length)
    }),
    ...missing.map(id => INDICATOR_NAMES[id] ?? id),
  ]
  return <Card as="section" className="mm-card" title="信号计数" description={`数据日 ${data.asOf}（收盘后更新）`}>
    <ul className="jsg-summary">
      <li><span>估值类</span> 低估 <b>{s.低估}</b> · 正常 <b>{s.正常}</b> · 高估 <b>{s.高估}</b></li>
      <li><span>情绪类</span> 偏牛 <b>{s.偏牛}</b> · 中性 <b>{s.中性}</b> · 偏熊 <b>{s.偏熊}</b>{s.none ? ` · 不判 ${s.none}` : ''}</li>
    </ul>
    <ul className="jx-links">
      <li><Link to="/jixing">今日星级</Link></li>
      <li><Link to="/jixing/table">估值表</Link></li>
    </ul>
    <SampleFootnote>{METHOD.signals}</SampleFootnote>
    {updateNotes.length ? <SampleFootnote>本次未更新的指标：{updateNotes.join('；')}。</SampleFootnote> : null}
  </Card>
}

export default function JixingSignals(): JSX.Element {
  const [data, setData] = useState<JixingSignalsData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/jixing-signals.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((body: unknown) => { if (!controller.signal.aborted) setData(asJixingSignals(body)) })
      .catch(() => { if (!controller.signal.aborted) setData(null) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  return (
    <Page className="mm-page jsg-page">
      <PageTitle>今天几星 · 牛熊信号板</PageTitle>
      <JixingTabs />
      <p className="mm-disclaimer">{JIXING_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取信号板数据…</p> : !data ? <EmptyState title="暂无信号板数据">收盘后采集成功才更新；数据文件缺失或格式异常时不展示。</EmptyState> : <>
        <SummaryLine data={data} />
        <Group title="定量：估值" description="越便宜越接近熊市底部特征；信号为低估 / 正常 / 高估。" items={data.indicators.filter(i => i.group === 'valuation')} />
        <Group title="情绪：资金与参与度" description="越热越接近牛市特征；信号为偏牛 / 中性 / 偏熊。" items={data.indicators.filter(i => i.group === 'mood')} />
        <Card as="section" className="mm-card" title="市场消息" description="本站整理，按时间倒序。">
          {data.news?.length ? (
            <ol className="jsg-news">
              {data.news.map(n => (
                <li key={`${n.date}-${n.url}`}>
                  <time dateTime={n.date}>{n.date}</time>
                  <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                  <span className="jsg-news__src">{n.source}</span>
                </li>
              ))}
            </ol>
          ) : <p className="mm-empty">暂无整理的市场消息。</p>}
          <SampleFootnote>{METHOD.news}</SampleFootnote>
        </Card>
        <Card as="section" className="mm-card" title="口径与未纳入项">
          <ul className="jsg-notes">
            <li>{METHOD.update}</li>
            <li>{METHOD.pct}</li>
            {METHOD.skipped.map(s => <li key={s}>{s}</li>)}
          </ul>
          <p className="mm-method">采集时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京）。公开来源：{data.sources.map((s, i) => <React.Fragment key={s.url}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。</p>
        </Card>
      </>}
    </Page>
  )
}
