// 同花顺 · 港股通与AH（/ths-mood/hk）：南向资金、AH 溢价、港股通持股、港股卖空。公开来源、收盘后数据。
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Callout, Card, EmptyState, Page, Segmented, Stat, StatGrid } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import ThsTabs, { THS_DISCLAIMER } from '../../features/ths-tabs/ThsTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import StockTable, { type Col } from '../../features/kpl-daban/StockTable'
import { METHOD, SKIPPED, asThsHk, hkd, hkdMillion, signed, sumLast, tone, type AhRow, type HoldRow, type ShortRow, type ThsHkData, type TopTrade } from '../../features/ths-hk/model'
import '../../styles/market-mood.css'
import '../../styles/kpl-daban.css'
import '../../styles/ths-hk.css'

const BASE = import.meta.env.BASE_URL
const southRanges = [{ id: '20', label: '20 日' }, { id: '60', label: '60 日' }, { id: '250', label: '250 日' }]
const indexRanges = [{ id: '1', label: '近 1 年' }, { id: '3', label: '近 3 年' }]
const asOfLine = (d: string): string => `数据日期：${d}（收盘后）`
const price = (x: number | null, d = 2): string => (x === null ? '—' : x.toFixed(d))

const topCols: Array<Col<TopTrade>> = [
  { key: 'rank', label: '排名', num: true, render: r => r.rank, sort: r => -r.rank },
  { key: 'net', label: '净买入', num: true, render: r => hkd(r.net, true), sort: r => r.net, cls: r => tone(r.net) },
  { key: 'buy', label: '买入', num: true, render: r => hkd(r.buy), sort: r => r.buy },
  { key: 'sell', label: '卖出', num: true, render: r => hkd(r.sell), sort: r => r.sell },
  { key: 'total', label: '成交额', num: true, render: r => hkd(r.total), sort: r => r.total },
]
type AhView = AhRow & { code: string }
const ahCols: Array<Col<AhView>> = [
  { key: 'premium', label: 'A 股溢价率', num: true, render: r => signed(r.premium, 2, '%'), sort: r => r.premium, cls: r => tone(r.premium) },
  { key: 'aPrice', label: 'A 股价（元）', num: true, render: r => price(r.aPrice), sort: r => r.aPrice },
  { key: 'aPct', label: 'A 涨跌', num: true, render: r => signed(r.aPct, 2, '%'), sort: r => r.aPct, cls: r => tone(r.aPct) },
  { key: 'hPrice', label: 'H 股价（港元）', num: true, render: r => price(r.hPrice, 3), sort: r => r.hPrice },
  { key: 'hPct', label: 'H 涨跌', num: true, render: r => signed(r.hPct, 2, '%'), sort: r => r.hPct, cls: r => tone(r.hPct) },
  { key: 'aCode', label: 'A 股代码', render: r => r.aCode, sort: r => r.aCode },
]
const holdCols: Array<Col<HoldRow>> = [
  { key: 'ratio', label: '持股比例', num: true, render: r => (r.ratio === null ? '—' : `${r.ratio.toFixed(2)}%`), sort: r => r.ratio },
  { key: 'ratioChg', label: '比例变化', num: true, render: r => signed(r.ratioChg, 3, ' pp'), sort: r => r.ratioChg, cls: r => tone(r.ratioChg) },
  { key: 'cap', label: '持股市值', num: true, render: r => hkd(r.cap), sort: r => r.cap },
  { key: 'capChg', label: '持股市值变动', num: true, render: r => hkd(r.capChg, true), sort: r => r.capChg, cls: r => tone(r.capChg) },
  { key: 'pct', label: '当日涨跌', num: true, render: r => signed(r.pct, 2, '%'), sort: r => r.pct, cls: r => tone(r.pct) },
  { key: 'industry', label: '行业', render: r => r.industry ?? '—' },
]
const labelTone = { 较高: 'warm', 正常: 'neutral', 较低: 'muted' } as const
const shortCols: Array<Col<ShortRow>> = [
  { key: 'ratio', label: '卖空比例', num: true, render: r => `${r.ratio.toFixed(2)}%`, sort: r => r.ratio },
  { key: 'label', label: '相对历史', render: r => (r.label ? <Badge tone={labelTone[r.label]}>{r.label}</Badge> : '样本不足'), sort: r => r.pctile },
  { key: 'pctile', label: '分位 / 样本', num: true, render: r => (r.pctile === null ? `— / ${r.n} 日` : `${r.pctile.toFixed(1)} / ${r.n} 日`), sort: r => r.pctile },
  { key: 'short', label: '卖空额', num: true, render: r => hkd(r.short), sort: r => r.short },
  { key: 'turnover', label: '成交额', num: true, render: r => hkd(r.turnover), sort: r => r.turnover },
]

function SouthSection({ data }: { data: NonNullable<ThsHkData['south']> }): JSX.Element {
  const [range, setRange] = useState('60')
  const last = data.history[data.history.length - 1]
  const shown = data.history.slice(-Number(range))
  return (
    <Card title="南向资金（港股通）" as="section" className="mm-card" description={asOfLine(data.asOf)}>
      <StatGrid className="th-stats">
        <Stat label="南向净买入" value={<span className={tone(last.net)}>{hkdMillion(last.net)}</span>} sub="港元" />
        <Stat label="港股通（沪）" value={<span className={tone(last.netSh)}>{hkdMillion(last.netSh)}</span>} />
        <Stat label="港股通（深）" value={<span className={tone(last.netSz)}>{hkdMillion(last.netSz)}</span>} />
        <Stat label="近 20 日累计" value={<span className={tone(sumLast(data.history, 20))}>{hkdMillion(sumLast(data.history, 20))}</span>} />
        <Stat label="近 60 日累计" value={<span className={tone(sumLast(data.history, 60))}>{hkdMillion(sumLast(data.history, 60))}</span>} />
        <Stat label="南向成交额" value={hkdMillion(last.turnover, false)} />
      </StatGrid>
      <Segmented items={southRanges} value={range} onChange={setRange} label="南向历史范围" />
      <MoodChart label="南向资金每日净买入" kind="bar" colorBy="sign" points={shown.map(d => ({ date: d.date, value: d.net === null ? null : d.net / 100 }))} format={v => `${v.toFixed(2)} 亿港元`} refs={[{ value: 0, label: '零' }]} />
      <p className="mm-method">{METHOD.south}</p>
      <p className="mm-method">{METHOD.top10}</p>
      <div className="th-split">
        {([['港股通（沪）十大成交股', data.top10.sh], ['港股通（深）十大成交股', data.top10.sz]] as const).map(([title, rows]) => (
          <div key={title}>
            <h3 className="th-sub">{title}</h3>
            {rows ? <StockTable label={title} rows={rows} cols={topCols} initial={{ key: 'rank', dir: 'desc' }} /> : <p className="mm-empty">当日该通道休市</p>}
          </div>
        ))}
      </div>
    </Card>
  )
}

function AhSection({ data }: { data: NonNullable<ThsHkData['ah']> }): JSX.Element {
  const [years, setYears] = useState('1')
  const { history, stats } = data.index
  const lastDate = history[history.length - 1].date
  const from = `${Number(lastDate.slice(0, 4)) - Number(years)}${lastDate.slice(4)}`
  const valid = data.rows.filter(r => r.premium !== null)
  const discount = valid.filter(r => (r.premium as number) < 0).length
  return (
    <Card title="AH 溢价" as="section" className="mm-card" description={`${asOfLine(data.asOf)} · 港元兑人民币中间价 ${data.fx.rate.toFixed(4)}（${data.fx.date}）`}>
      <h3 className="th-sub">恒生沪深港通 AH 股溢价指数（HSAHP）</h3>
      <StatGrid className="th-stats">
        <Stat label="最新收盘" value={stats.close.toFixed(2)} sub={data.index.asOf} />
        <Stat label="近 1 年均值" value={price(stats.y1.mean)} sub={stats.y1.pctile === null ? '历史不足' : `当前处于 ${stats.y1.pctile.toFixed(1)}% 分位`} />
        <Stat label="近 3 年均值" value={price(stats.y3.mean)} sub={stats.y3.pctile === null ? '历史不足' : `当前处于 ${stats.y3.pctile.toFixed(1)}% 分位`} />
        <Stat label="A 股折价的 AH 股" value={`${discount} / ${valid.length}`} sub="溢价率 < 0 的只数" />
      </StatGrid>
      <Segmented items={indexRanges} value={years} onChange={setYears} label="AH 溢价指数范围" />
      <MoodChart label="恒生 AH 股溢价指数走势" points={history.filter(r => r.date > from).map(r => ({ date: r.date, value: r.close }))} format={v => v.toFixed(2)} refs={[{ value: 100, label: 'A、H 同价' }]} />
      <p className="mm-method">{METHOD.ahIndex}</p>
      <h3 className="th-sub">全部 AH 股（{data.rows.length} 只，点表头排序）</h3>
      <StockTable label="AH 股溢价列表" rows={data.rows.map(r => ({ ...r, code: r.hCode }))} cols={ahCols} initial={{ key: 'premium', dir: 'desc' }} />
      <p className="mm-method">{METHOD.ah}</p>
    </Card>
  )
}

function HoldingsSection({ data }: { data: NonNullable<ThsHkData['holdings']> }): JSX.Element {
  return (
    <Card title="港股通持股变化" as="section" className="mm-card" description={`持股日期：${data.asOf} · 共 ${data.count} 只`}>
      <p className="mm-method">{METHOD.holdings}</p>
      <h3 className="th-sub">持股比例增加 Top {data.ratioUp.length}</h3>
      <StockTable label="港股通持股比例增加排行" rows={data.ratioUp} cols={holdCols} initial={{ key: 'ratioChg', dir: 'desc' }} empty="当日没有持股比例增加的个股" />
      <h3 className="th-sub">持股比例减少 Top {data.ratioDown.length}</h3>
      <StockTable label="港股通持股比例减少排行" rows={data.ratioDown} cols={holdCols} initial={{ key: 'ratioChg', dir: 'asc' }} empty="当日没有持股比例减少的个股" />
      <h3 className="th-sub">南向重仓（持股市值 Top {data.top.length}）</h3>
      <StockTable label="港股通持股市值排行" rows={data.top} cols={holdCols} initial={{ key: 'cap', dir: 'desc' }} />
    </Card>
  )
}

function ShortSection({ data }: { data: NonNullable<ThsHkData['short']> }): JSX.Element {
  return (
    <Card title="港股卖空" as="section" className="mm-card" description={asOfLine(data.asOf)}>
      <StatGrid className="th-stats">
        <Stat label="全市场卖空占比" value={`${data.market.ratio.toFixed(2)}%`} />
        <Stat label="卖空成交额" value={hkd(data.market.short)} sub="港元" />
        <Stat label="市场总成交额" value={hkd(data.market.turnover)} sub="港元" />
      </StatGrid>
      <MoodChart label="港股全市场卖空占比走势" points={data.history.map(d => ({ date: d.date, value: d.ratio }))} format={v => `${v.toFixed(2)}%`} />
      <p className="mm-method">历史自 {data.since} 起（HKEX 日报表存档可得的最早日期），之后每天累积。</p>
      <h3 className="th-sub">卖空比例最高的 {data.top.length} 只股票</h3>
      <StockTable label="港股卖空比例排行" rows={data.top} cols={shortCols} initial={{ key: 'ratio', dir: 'desc' }} />
      <p className="mm-method">{METHOD.short}</p>
      <p className="mm-method">{METHOD.shortLabel}</p>
    </Card>
  )
}

export default function ThsHk(): JSX.Element {
  const [data, setData] = useState<ThsHkData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/ths-tab-hk.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((body: unknown) => { if (!controller.signal.aborted) setData(asThsHk(body)) })
      .catch(() => { if (!controller.signal.aborted) setData(null) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  return (
    <Page className="mm-page th-page">
      <PageTitle>同花顺 · 港股通与AH</PageTitle>
      <ThsTabs />
      <p className="mm-disclaimer">{THS_DISCLAIMER}</p>
      <p className="mm-method">对照同花顺 App 的南下资金、AH 溢价分析、港股通持股与卖空比例异动。港股交易日历与 A 股不同，四块数据各自标注日期；恒指等指数行情见 <Link to="/pulse">全球行情</Link> 与 <Link to="/monitor">宏观温度</Link>。</p>
      {loading ? <p role="status">正在读取港股通与 AH 数据…</p> : !data ? <EmptyState title="暂无港股通与AH数据">收盘后完整采集成功再更新；数据文件缺失、不可用或格式异常时不展示。</EmptyState> : <>
        <p className="mm-method">采集时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京）。某一块当天采集失败时沿用上一次的结果，以该块标注的日期为准。</p>
        {data.south ? <SouthSection data={data.south} /> : <EmptyState title="南向资金暂缺">来源未返回完整数据。</EmptyState>}
        {data.ah ? <AhSection data={data.ah} /> : <EmptyState title="AH 溢价暂缺">来源未返回完整数据。</EmptyState>}
        {data.holdings ? <HoldingsSection data={data.holdings} /> : <EmptyState title="港股通持股暂缺">来源未返回完整数据。</EmptyState>}
        {data.short ? <ShortSection data={data.short} /> : <EmptyState title="港股卖空暂缺">来源未返回完整数据。</EmptyState>}
        <Callout title="口径与未做的部分">
          <ul className="th-skip">{SKIPPED.map(([what, why]) => <li key={what}><strong>{what}</strong>：{why}</li>)}</ul>
          <p>本页只陈列公开统计，不构成任何买卖依据。</p>
        </Callout>
        <p className="mm-method">公开来源：{data.sources.map(s => <React.Fragment key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>{' '}</React.Fragment>)}</p>
      </>}
    </Page>
  )
}
