// 同花顺 · 市场（/ths-mood/market）：对照同花顺「市场」分析页的估值、资金供需、利率与风格模块，公开数据盘后更新。
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, Page, Segmented, TableWrap } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import ThsTabs, { THS_DISCLAIMER } from '../../features/ths-tabs/ThsTabs'
import MoodChart from '../../features/market-mood/MoodChart'
import { METHOD, asThsMarket, fix, pct, signedPct, signedYi, tone, yi, zoneClass, type Overseas, type OverseasItem, type ThsMarketData, type ValRow } from '../../features/ths-market/model'
import '../../styles/market-mood.css'
import '../../styles/ths-market.css'

const BASE = import.meta.env.BASE_URL
const ym = (d: string): string => `${d.slice(2, 4)}/${Number(d.slice(5, 7))}`
const mmd = (m: string): string => `${m.slice(2, 4)}年${Number(m.slice(5, 7))}月`

/** 周采样历史的经验分位值，用作危险/机会参考线（近似，仅示意）。 */
function quantile(values: number[], q: number): number | null {
  if (values.length < 20) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]
}

function ValuationCard({ data }: { data: ThsMarketData }): JSX.Element {
  const [code, setCode] = useState(data.valuation[0].code)
  const row = data.valuation.find(r => r.code === code) ?? data.valuation[0]
  const refs = useMemo(() => {
    const years = row.zoneBasis ?? 10
    const start = `${Number(data.asOf.slice(0, 4)) - years}${data.asOf.slice(4)}`
    const vals = row.history.filter(p => p[0] > start && p[1] !== null).map(p => p[1] as number)
    const hi = quantile(vals, data.thresholds.danger / 100), lo = quantile(vals, data.thresholds.chance / 100)
    return [...(hi === null ? [] : [{ value: hi, label: `${data.thresholds.danger}% 分位` }]), ...(lo === null ? [] : [{ value: lo, label: `${data.thresholds.chance}% 分位` }])]
  }, [row, data.asOf, data.thresholds])
  const basis = (r: ValRow): string => r.zoneBasis === null ? '' : r.zoneBasis === 5 ? '（按 5 年）' : ''
  return <Card title="主要指数估值" as="section" className="mm-card" description={`PE 为滚动市盈率（TTM），分区阈值：≥ ${data.thresholds.danger}% 危险，≤ ${data.thresholds.chance}% 机会。`}>
    <TableWrap label="主要指数估值分位" stickyFirst>
      <table className="mm-table tm-table">
        <thead><tr>{['指数', 'PE(TTM)', '5 年分位', '10 年分位', '估值区间', 'PB', '股息率', 'PE 数据起点'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{data.valuation.map(r => <tr key={r.code}>
          <th scope="row">{r.name}<small>{r.code}{r.source === 'board' ? ' · 板块' : ''}</small></th>
          <td className="num">{fix(r.pe)}</td>
          <td className="num">{pct(r.peP5)}</td>
          <td className="num">{pct(r.peP10)}</td>
          <td>{r.zone ? <span className={zoneClass(r.zone)}>{r.zone}{basis(r)}</span> : '—'}</td>
          <td className="num">{fix(r.pb)}</td>
          <td className="num">{r.dp === null ? '—' : `${fix(r.dp)}%`}</td>
          <td>{r.since ?? '—'}</td>
        </tr>)}</tbody>
      </table>
    </TableWrap>
    <Segmented items={data.valuation.map(r => ({ id: r.code, label: r.name.replace('（整体）', '') }))} value={row.code} onChange={setCode} label="估值曲线指数" />
    <MoodChart label={`${row.name} PE(TTM) 近 10 年周线`} points={row.history.map(([date, value]) => ({ date, value }))} format={v => v.toFixed(2)} refs={refs} tick={ym} />
    <p className="mm-method">参考线为周采样历史的 {data.thresholds.danger}% / {data.thresholds.chance}% 分位值（近似，表中分位按逐日数据计算）。PB 已累积 {row.pbDays} 个交易日{row.pb === null ? '；该指数官网未提供 PB' : ''}。</p>
    <p className="mm-method">{METHOD.valuation(data.thresholds)}</p>
    <p className="mm-method">{METHOD.valuationSource} 沪深300 股债性价比与港美估值位置见 <Link to="/monitor">宏观温度</Link>。</p>
  </Card>
}

function SupplyCard({ data }: { data: ThsMarketData }): JSX.Element {
  const { lift, holder, financing, funds } = data.supply
  return <Card title="资金供需" as="section" className="mm-card" description="股票供给（解禁、减持、融资）与资金供给（新发基金），金额单位亿元。">
    <h3 className="tm-sub">未来 30 日限售解禁（{lift.from} 至 {lift.to}）合计 {yi(lift.total)}</h3>
    {lift.weeks.length ? <TableWrap label="限售解禁按周汇总">
      <table className="mm-table">
        <thead><tr>{['周', '解禁市值', '涉及公司', '缺价批次'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{lift.weeks.map(w => <tr key={w.start}><td>{w.start.slice(5)} ~ {w.end.slice(5)}</td><td className="num">{yi(w.amount)}</td><td className="num">{w.stocks}</td><td className="num">{w.unpriced}</td></tr>)}</tbody>
      </table>
    </TableWrap> : <p className="mm-empty">未来 30 日没有解禁批次</p>}
    <p className="mm-method">{METHOD.lift}</p>

    <h3 className="tm-sub">重要股东增减持（月度净额）</h3>
    <MoodChart label="重要股东增减持月度净额" kind="bar" colorBy="sign" points={holder.map(m => ({ date: `${m.month}-01`, value: m.net }))} format={v => `${v.toFixed(2)} 亿`} tick={ym} />
    <TableWrap label="重要股东增减持月度汇总">
      <table className="mm-table">
        <thead><tr>{['月份', '增持', '减持', '净额', '记录', '估算', '无价'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{holder.map(m => <tr key={m.month}><td>{mmd(m.month)}</td><td className="num">{yi(m.increase)}</td><td className="num">{yi(m.decrease)}</td><td className={`num ${tone(m.net)}`}>{signedYi(m.net)}</td><td className="num">{m.records}</td><td className="num">{m.estimated}</td><td className="num">{m.unpriced}</td></tr>)}</tbody>
      </table>
    </TableWrap>
    <p className="mm-method">{METHOD.holder}</p>

    <h3 className="tm-sub">市场融资：IPO / 增发 / 可转债</h3>
    <TableWrap label="市场融资月度汇总">
      <table className="mm-table">
        <thead><tr>{['月份', 'IPO', '增发', '可转债', '合计'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{financing.map(m => {
          const parts = [m.ipo, m.seo, m.cb]
          const total = parts.every(v => v === null) ? null : parts.reduce<number>((a, v) => a + (v ?? 0), 0)
          return <tr key={m.month}><td>{mmd(m.month)}</td><td className="num">{yi(m.ipo)}<small>{m.ipoCount} 家</small></td><td className="num">{yi(m.seo)}<small>{m.seoCount} 家</small></td><td className="num">{yi(m.cb)}<small>{m.cbCount} 只</small></td><td className="num">{yi(total)}</td></tr>
        })}</tbody>
      </table>
    </TableWrap>
    <p className="mm-method">{METHOD.financing}</p>

    <h3 className="tm-sub">新发基金规模</h3>
    <MoodChart label="新成立基金月度募集份额" kind="bar" colorBy="sign" zeroBase points={funds.map(m => ({ date: `${m.month}-01`, value: m.shares }))} format={v => `${v.toFixed(2)} 亿份`} tick={ym} />
    <TableWrap label="新发基金月度汇总">
      <table className="mm-table">
        <thead><tr>{['月份', '募集份额', '其中偏股', '基金数'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{funds.map(m => <tr key={m.month}><td>{mmd(m.month)}{m.complete === false ? <small>不完整</small> : null}</td><td className="num">{m.shares === null ? '—' : `${fix(m.shares)} 亿份`}</td><td className="num">{m.equityShares === null ? '—' : `${fix(m.equityShares)} 亿份`}</td><td className="num">{m.funds}</td></tr>)}</tbody>
      </table>
    </TableWrap>
    <p className="mm-method">{METHOD.funds}</p>
  </Card>
}

function RatesCard({ data }: { data: ThsMarketData }): JSX.Element {
  const t = data.rates.treasury, s = data.rates.shibor
  const lt = t.at(-1), ls = s.at(-1)
  return <Card title="货币与债市风向" as="section" className="mm-card" description="单位 %，近一年日度。">
    <dl className="tm-summary">
      <div><dt>10 年国债</dt><dd>{lt ? fix(lt[1], 4) : '—'}</dd><small>{lt?.[0]}</small></div>
      <div><dt>2 年国债</dt><dd>{lt ? fix(lt[2], 4) : '—'}</dd><small>{lt?.[0]}</small></div>
      <div><dt>Shibor 隔夜</dt><dd>{ls ? fix(ls[1], 4) : '—'}</dd><small>{ls?.[0]}</small></div>
      <div><dt>Shibor 1 周</dt><dd>{ls ? fix(ls[2], 4) : '—'}</dd><small>{ls?.[0]}</small></div>
    </dl>
    <MoodChart label="10 年期国债收益率" points={t.map(([date, v]) => ({ date, value: v }))} format={v => `${v.toFixed(3)}%`} tick={ym} />
    <MoodChart label="Shibor 隔夜利率" points={s.map(([date, v]) => ({ date, value: v }))} format={v => `${v.toFixed(3)}%`} tick={ym} />
    <p className="mm-method">{METHOD.rates} 宏观 M2、社融与 LPR 见 <Link to="/monitor">宏观温度</Link>。</p>
  </Card>
}

function StyleCard({ data }: { data: ThsMarketData }): JSX.Element {
  const [id, setId] = useState(data.style[0].id)
  const pair = data.style.find(p => p.id === id) ?? data.style[0]
  return <Card title="大小盘与成长价值风格" as="section" className="mm-card" description="比值上升 = 分子指数相对更强。">
    <TableWrap label="风格相对强弱">
      <table className="mm-table">
        <thead><tr>{['对比', '分子 / 分母', '近 20 日', '近 60 日'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{data.style.map(p => <tr key={p.id}><th scope="row">{p.label}</th><td>{p.num} / {p.den}</td><td className={`num ${tone(p.rel20)}`}>{signedPct(p.rel20)}</td><td className={`num ${tone(p.rel60)}`}>{signedPct(p.rel60)}</td></tr>)}</tbody>
      </table>
    </TableWrap>
    <Segmented items={data.style.map(p => ({ id: p.id, label: p.label }))} value={pair.id} onChange={setId} label="风格曲线" />
    <MoodChart label={`${pair.num} ÷ ${pair.den} 比值（起点 = 100）`} points={pair.series.map(([date, value]) => ({ date, value }))} format={v => v.toFixed(2)} refs={[{ value: 100, label: '起点' }]} tick={ym} />
    <p className="mm-method">{METHOD.style} 正值（红）表示分子跑赢，负值（绿）表示分母跑赢。</p>
  </Card>
}

/** 关联板块：名称 + 当日涨跌幅 + 主力净流入，逐行列出。 */
function BoardCells({ item, withFlow }: { item: OverseasItem; withFlow?: boolean }): JSX.Element {
  return <ul className="tm-boards">{item.boards.map(b => <li key={b.code}>
    <span>{b.name}</span> <span className={tone(b.pct)}>{signedPct(b.pct)}</span>
    {withFlow ? <small className={tone(b.flow)}>主力 {signedYi(b.flow)}</small> : null}
  </li>)}</ul>
}

/** 同向标记：外盘涨跌与各关联板块当日涨跌符号相同的个数 / 有效观测数。 */
function sameDir(item: OverseasItem): string {
  const obs = item.boards.filter(b => b.pct !== null && b.pct !== 0 && item.pct)
  if (!obs.length) return '—'
  return `${obs.filter(b => Math.sign(b.pct as number) === Math.sign(item.pct as number)).length} / ${obs.length}`
}

function OverseasBody({ o }: { o: Overseas }): JSX.Element {
  const [market, setMarket] = useState<'US' | 'HK'>('US')
  const anomalies = o.items.filter(i => i.anomaly).sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0) || Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0))
  const list = o.items.filter(i => i.market === market)
  const z = (i: OverseasItem): string => (i.z === null ? '—' : `${fix(Math.abs(i.z), 1)}σ`)
  return <>
    <h3 className="tm-sub">美股隔夜（{o.usSession} 美东收盘）</h3>
    <dl className="tm-summary">{o.indices.map(i => <div key={i.symbol}>
      <dt>{i.name}</dt><dd className={tone(i.pct)}>{signedPct(i.pct)}</dd><small>{i.close === null ? '—' : fix(i.close)}</small>
    </div>)}</dl>
    {o.hkNote ? <p className="mm-method">{o.hkNote}；港股列暂为空，晚些的采集会补上。</p> : null}
    {o.boardsNote ? <p className="mm-method">{o.boardsNote}；A 股板块列暂为空。</p> : null}

    <h3 className="tm-sub">外盘异动与 A 股关联板块当日表现</h3>
    <p className="mm-method">
      本期外盘异动 {o.summary.anomalies} 只；关联板块有效观测 {o.summary.obs} 个，其中当日同向 {o.summary.same} 个。
      {o.boardsTime ? ` 板块数据为 ${o.asOf} ${o.boardsTime}（北京）快照。` : ''}
    </p>
    {anomalies.length ? <TableWrap label="外盘异动与关联板块">
      <table className="mm-table">
        <thead><tr>{['外盘标的', '日期', '涨跌幅', 'σ 倍数', '关联 A 股板块（当日涨跌 / 主力净流入）', '同向'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{anomalies.map(i => <tr key={i.symbol}>
          <th scope="row">{i.name}<small>{i.symbol} · {i.market === 'US' ? '美股' : '港股'}</small></th>
          <td>{i.date}</td>
          <td className={`num ${tone(i.pct)}`}>{signedPct(i.pct)}</td>
          <td className="num">{z(i)}</td>
          <td><BoardCells item={i} withFlow /></td>
          <td className="num">{sameDir(i)}</td>
        </tr>)}</tbody>
      </table>
    </TableWrap> : <p className="mm-empty">本期没有达到阈值的外盘异动</p>}

    <h3 className="tm-sub">全部映射</h3>
    <Segmented items={[{ id: 'US', label: '美股' }, { id: 'HK', label: '港股' }]} value={market} onChange={id => setMarket(id as 'US' | 'HK')} label="外盘市场" />
    <TableWrap label="外盘标的与关联 A 股板块">
      <table className="mm-table">
        <thead><tr>{['外盘标的', '涨跌幅', 'σ 倍数', '关联板块（当日涨跌）', '关联理由'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{list.map(i => <tr key={i.symbol}>
          <th scope="row">{i.name}<small>{i.symbol}{i.anomaly ? ' · 异动' : ''}</small></th>
          <td className={`num ${tone(i.pct)}`}>{signedPct(i.pct)}</td>
          <td className="num">{z(i)}</td>
          <td><BoardCells item={i} /></td>
          <td className="tm-reason">{i.reason}</td>
        </tr>)}</tbody>
      </table>
    </TableWrap>

    {o.history.days ? <>
      <h3 className="tm-sub">累计观测（自 {o.history.since} 起 {o.history.days} 个交易日）</h3>
      {o.history.rows.length ? <TableWrap label="外盘异动累计同向次数">
        <table className="mm-table">
          <thead><tr>{['外盘标的', '异动天数', '板块观测', '当日同向'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{o.history.rows.map(r => <tr key={r.symbol}><th scope="row">{r.name}<small>{r.symbol}</small></th><td className="num">{r.events}</td><td className="num">{r.obs}</td><td className="num">{r.same}</td></tr>)}</tbody>
        </table>
      </TableWrap> : <p className="mm-empty">累计期内没有外盘异动记录</p>}
      <p className="mm-method">样本从上线日开始逐日累积，天数很少时只是个例，不构成统计规律。</p>
    </> : null}
    {o.boardIssues.length ? <p className="mm-method">以下板块名称与映射表不符，已不展示：{o.boardIssues.join('；')}。</p> : null}
    <p className="mm-method">{METHOD.overseas(o.thresholds)}</p>
    <p className="mm-method">{METHOD.overseasBoards}</p>
    <p className="mm-method">{METHOD.overseasMap(o.mapReviewed)} 完整全球指数见 <Link to="/pulse">全球行情</Link>。</p>
  </>
}

function OverseasCard({ data }: { data: ThsMarketData }): JSX.Element {
  return <Card title="外盘联动" as="section" className="mm-card" description="隔夜美股与当日港股的涨跌，对照本站整理的关联 A 股板块当天表现。">
    {data.overseas ? <OverseasBody o={data.overseas} /> : <EmptyState title="暂无外盘联动数据">{data.overseasError ? `本次未更新：${data.overseasError}` : '本节数据缺失，其余模块不受影响。'}</EmptyState>}
  </Card>
}

export default function ThsMarket(): JSX.Element {
  const [data, setData] = useState<ThsMarketData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/ths-tab-market.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((body: unknown) => { if (!controller.signal.aborted) setData(asThsMarket(body)) })
      .catch(() => { if (!controller.signal.aborted) setData(null) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  return (
    <Page className="mm-page tm-page">
      <PageTitle>同花顺 · 市场</PageTitle>
      <ThsTabs />
      <p className="mm-disclaimer">{THS_DISCLAIMER}</p>
      {loading ? <p role="status">正在读取市场数据…</p> : !data ? <EmptyState title="暂无市场数据">收盘后完整采集成功再更新；数据文件缺失、不可用或格式异常时不展示。</EmptyState> : <>
        <p className="mm-method">数据日期：{data.asOf}（盘后） · 采集时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京）。所有分区与强弱均为历史统计描述，不构成投资建议。</p>
        <ValuationCard data={data} />
        <SupplyCard data={data} />
        <RatesCard data={data} />
        <StyleCard data={data} />
        <OverseasCard data={data} />
        <Card title="口径与未纳入项" as="section" className="mm-card">
          <ul className="tm-list">{METHOD.skipped.map(s => <li key={s}>{s}</li>)}</ul>
          <p className="mm-method">站内相关：<Link to="/market-mood">开盘啦 · 市场情绪</Link>（北向、融资余额） · <Link to="/invest/national-team">国家队持仓</Link> · <Link to="/pulse">全球行情</Link> · <Link to="/monitor">宏观温度</Link>。</p>
          <p className="mm-method">公开来源：{data.sources.map((s, i) => <React.Fragment key={s.url}>{i ? '、' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></React.Fragment>)}。</p>
        </Card>
      </>}
    </Page>
  )
}
