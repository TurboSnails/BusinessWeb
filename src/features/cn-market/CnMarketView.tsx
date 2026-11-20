import React, { useEffect, useMemo, useState } from 'react'
import { CircleHelp, RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Segmented } from '../../components/ui/PageTabs'
import { format, GuideContext, MarketCard, RANGES, signed, val, type Item, type RangeId } from '../us-market/cards'
import { withinYears, type Lean } from '../us-market/explain'
import HistoryChart from '../us-market/HistoryChart'
import { compareReturns, freshness, periodReturn, relativeVolume, type MarketSlice, type Point, type Reading } from '../us-market/model'
import PlainSummary, { type Question } from '../us-market/PlainSummary'
import RelativePerformance from '../us-market/RelativePerformance'
import WeeklyMarketBrief, { type BriefSignal } from '../us-market/WeeklyMarketBrief'
import '../us-market/us-market.css'
import { CN_FAMILY, CN_GUIDES } from './explain'

type CnGroup = 'broad' | 'style' | 'sector' | 'participants'
const GROUPS: { id: CnGroup; label: string }[] = [
  { id: 'broad', label: '宽基' }, { id: 'style', label: '风格' }, { id: 'sector', label: '行业' }, { id: 'participants', label: '参与者' },
]
type CnSlice = Omit<MarketSlice, 'group' | 'valuation'> & { group: Exclude<CnGroup, 'participants'>; refreshError?: string; valuation?: NonNullable<MarketSlice['valuation']> & { pct?: number } }
interface Snap {
  data?: { series: Record<string, Reading> }
  slices?: { slices: CnSlice[] }
  ebs?: { rows: [string, number, number][]; source?: string }
  signals?: { indicators: { id: string; name: string; unit: string; history: Point[]; note?: string; date?: string }[] }
  screener?: { breadth: { date: string; above20?: number | null; above60?: number | null; high20?: number; low20?: number; up?: number; down?: number; n?: number }[] }
  etf?: { series: { date: string; flow_broad?: number | null }[]; updated?: string }
  national?: { periods: string[]; total: { mv: (number | null)[] } }
}
const FILES: Record<keyof Snap, string> = {
  data: 'cn-market-data.json', slices: 'cn-market-slices.json', ebs: 'equity-bond-spread.json', signals: 'jixing-signals.json',
  screener: 'ths-tab-screener.json', etf: 'etf-flow.json', national: 'national-team/series.json',
}
const SH_DATE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const JIXING = 'https://business-web-black.vercel.app/jixing'

/** Builds the readings the page needs from the dedicated feed plus files other tabs already maintain. */
function readings(s: Snap) {
  const p = (key: string, name: string): Item => ({ id: key, name, reading: s.data?.series?.[key] })
  const signal = (id: string, key: string, name: string, frequency: string, scope: string): Item => {
    const row = s.signals?.indicators?.find(item => item.id === id)
    return { id: key, name, reading: row?.history?.length ? val(name, row.unit === '百分点' ? ' 个百分点' : row.unit, JIXING, scope, frequency, row.history, row.note) : undefined }
  }
  const ebs = s.ebs?.rows ?? []
  const breadth = s.screener?.breadth ?? []
  const fromBreadth = (key: string, name: string, pick: (row: typeof breadth[number]) => number | null | undefined, scope: string, unit = '%'): Item => {
    const history = breadth.flatMap(row => { const v = pick(row); return v === null || v === undefined || !Number.isFinite(v) ? [] : [[row.date, Math.round(v * 100) / 100] as Point] })
    return { id: key, name, reading: history.length ? val(name, unit, 'https://quote.eastmoney.com/center/gridlist.html', scope, '日频', history) : undefined }
  }
  const flows = s.etf?.series ?? []
  const nt = s.national
  // A null/missing daily flow is unknown, not zero: only publish a 20-day sum when every day in the window is known.
  const etfHistory: Point[] = flows.flatMap((row, i) => {
    if (i < 19) return []
    const window = flows.slice(i - 19, i + 1)
    if (!window.every(r => typeof r.flow_broad === 'number' && Number.isFinite(r.flow_broad))) return []
    return [[row.date, Math.round(window.reduce((sum, r) => sum + r.flow_broad!, 0) * 100) / 100] as Point]
  })
  const nationalHistory: Point[] = nt?.periods?.flatMap((date, i) => {
    const mv = nt.total?.mv?.[i]
    return typeof mv === 'number' && Number.isFinite(mv) ? [[date, Math.round(mv / 1e6) / 100] as Point] : []
  }) ?? []
  return {
    p,
    erp: { id: 'cnErp', name: '股债利差（沪深300 − 10 年国债）', reading: ebs.length ? val('股债利差', ' 个百分点', 'https://legulegu.com/stockdata/equity-bond-spread', '沪深300 盈利收益率减 10 年期国债收益率（乐咕乐股口径），2005 年起逐日', '日频', ebs.map(([date, spread]) => [date, spread])) : undefined } as Item,
    buffett: signal('buffett', 'cnBuffett', '巴菲特指标（总市值 ÷ GDP）', '周频', 'A 股总市值 ÷ 名义 GDP，周度，2017 年起'),
    pbAll: signal('pb', 'cnPbAll', '沪深两市整体市净率', '周频', '沪深两市整体市净率，周度，2016 年起'),
    funds: signal('funds', 'cnNewFunds', '新成立偏股型基金（月）', '月频', '当月新成立偏股型基金份额（天天基金），2023 年起'),
    accounts: signal('accounts', 'cnAccounts', '上交所新增投资者（月）', '月频', '上交所当月新增投资者数，2021 年起'),
    advance: fromBreadth('cnAdvanceShare', '上涨家数占比', row => row.up !== undefined && row.down !== undefined && row.up + row.down > 0 ? row.up / (row.up + row.down) * 100 : undefined, '全部 A 股当日上涨家数 ÷（上涨 + 下跌家数），2026 年 6 月起逐日积累'),
    above60: fromBreadth('cnAbove60', '高于 60 日线的股票占比', row => row.above60, '全部 A 股中收盘价高于 60 日均线的比例，逐日积累'),
    highLow: fromBreadth('cnHighLow', '20 日新高 − 新低（占比）', row => row.n && row.high20 !== undefined && row.low20 !== undefined ? (row.high20 - row.low20) / row.n * 100 : undefined, '创 20 日新高家数减创 20 日新低家数，占全部 A 股的比例，逐日积累', ' 个百分点'),
    etfFlow: { id: 'cnEtfFlow', name: '宽基 ETF 近 20 日净申购', reading: etfHistory.length ? val('宽基 ETF 近 20 日净申购', '亿元', 'https://business-web-black.vercel.app/lab/etf-flow', '宽基 ETF 申购净流入的 20 个交易日滚动合计（同花顺口径），2014 年起', '日频', etfHistory) : undefined } as Item,
    national: { id: 'cnNationalTeam', name: '国家队持股市值', reading: nationalHistory.length ? val('国家队持股市值', '亿元', 'https://business-web-black.vercel.app/national-team', '中央汇金、证金、社保等在上市公司前十大股东中的持股市值合计（季度）', '季频', nationalHistory) : undefined } as Item,
  }
}

function valuationItem(slice: CnSlice | undefined, id = 'slicePe', name?: string): Item {
  const v = slice?.valuation
  return { id, name: name ?? `${slice?.name ?? ''}市盈率`, reading: v && slice ? { ...val(name ?? `${slice.name}市盈率`, '倍', v.source ?? slice.source, v.scope ?? slice.scope, '周频', v.history?.length ? v.history : [[v.date, v.value]]), note: v.pct !== undefined ? `数据源给出的近 10 年分位约 ${v.pct}%。` : undefined } : undefined }
}

/** Above or below the 200-session average, from the daily window of 沪深300. */
function trendOf(slice: CnSlice | undefined): { label: string; lean: Lean } | undefined {
  const daily = slice?.volume?.length ? slice.history.slice(-slice.volume.length) : []
  if (daily.length < 200) return undefined
  const last = daily.at(-1)![1]
  const average = daily.slice(-200).reduce((sum, [, v]) => sum + v, 0) / 200
  const gap = (last / average - 1) * 100
  return gap >= 0 ? { label: `沪深300 高于 200 日均线 ${gap.toFixed(1)}%`, lean: 'offense' } : { label: `沪深300 低于 200 日均线 ${Math.abs(gap).toFixed(1)}%`, lean: 'defense' }
}

function Matrix({ slices, active, benchmark, choose }: { slices: CnSlice[]; active?: CnSlice; benchmark: Point[]; choose(slice: CnSlice): void }) {
  if (!slices.length) return null
  return <section className="us-market__matrix" aria-label="同类指数比较" tabIndex={0}>
    <table>
      <caption>同类指数比较</caption>
      <thead><tr><th scope="col">指数</th><th scope="col">5 日</th><th scope="col">20 日</th><th scope="col">20 日相对沪深300</th><th scope="col">市盈率</th><th scope="col">近 10 年分位</th><th scope="col">成交额量比</th><th scope="col">行情日期</th></tr></thead>
      <tbody>{slices.map(slice => {
        const ratio = relativeVolume(slice.volume ?? [], slice.history.slice(-(slice.volume?.length ?? 0)))
        return <tr key={slice.id} className={active?.id === slice.id ? 'is-active' : ''}>
          <th scope="row"><button type="button" aria-pressed={active?.id === slice.id} onClick={() => choose(slice)}>{slice.name}<small>{slice.symbol}</small></button></th>
          <td>{signed(periodReturn(slice.history, 5), '%')}</td>
          <td>{signed(periodReturn(slice.history, 20), '%')}</td>
          <td>{slice.id === '000300' ? '—' : signed(compareReturns(slice.history, benchmark, 20), ' 个百分点')}</td>
          <td>{slice.valuation ? format(slice.valuation.value, '倍') : '—'}</td>
          <td>{slice.valuation?.pct !== undefined ? `${slice.valuation.pct}%` : '—'}</td>
          <td>{ratio === undefined ? '—' : ratio.toFixed(2) + ' 倍'}</td>
          <td>{slice.history.at(-1)?.[0] ?? '—'}</td>
        </tr>
      })}</tbody>
    </table>
  </section>
}

export default function CnMarketView() {
  const [params, setParams] = useSearchParams()
  const [snap, setSnap] = useState<Snap>({})
  const [failed, setFailed] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    const entries = Object.entries(FILES) as [keyof Snap, string][]
    Promise.allSettled(entries.map(async ([key, file]) => {
      const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache', signal: abort.signal })
      if (!res.ok) throw new Error(file)
      return [key, await res.json()] as const
    })).then(results => {
      if (abort.signal.aborted) return
      setSnap(previous => ({ ...previous, ...Object.fromEntries(results.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])) }))
      setFailed(entries.filter((_, i) => results[i].status === 'rejected').map(([, file]) => file))
      setLoading(false)
    })
    return () => abort.abort()
  }, [attempt])

  const group = GROUPS.find(g => g.id === params.get('view'))?.id ?? 'broad'
  const range: RangeId = RANGES.find(r => r.id === params.get('range'))?.id ?? '5y'
  const years = RANGES.find(r => r.id === range)?.years ?? null
  const set = (patch: Record<string, string | undefined>) => setParams(prev => {
    const next = new URLSearchParams(prev)
    for (const [key, value] of Object.entries(patch)) value === undefined ? next.delete(key) : next.set(key, value)
    return next
  }, { replace: true })
  const asOf = SH_DATE()
  const all = snap.slices?.slices ?? []
  const csi300 = all.find(s => s.id === '000300')
  const csiAll = all.find(s => s.id === '000985')
  const slices = all.filter(s => s.group === group)
  const slice = slices.find(s => s.id === params.get('index')?.toLowerCase()) ?? slices[0]
  const r = useMemo(() => readings(snap), [snap])
  const { p } = r
  const trend = trendOf(csi300)

  const valuation = [valuationItem(csi300, 'csi300Pe', '沪深300 市盈率'), valuationItem(csiAll, 'csiAllPe', '中证全指市盈率'), r.erp, r.buffett, r.pbAll]
  const mood = [p('cnLimitUp', '涨停家数'), p('cnSealRate', '封板率'), p('cnMaxBoard', '最高连板'), p('cnLimitDown', '跌停家数'), r.advance, p('cnOptionPcr', '股指期权 PCR'), p('cnBrokenBoards', '炸板家数')]
  const activity = [p('cnTurnover', '两市换手率'), p('cnVolumeRatio', '两市成交额 20 日量比'), p('cnAmount', '两市成交额'), r.above60, r.highLow, p('cnNorthTurnover', '北向成交额')]
  const inflow = [r.etfFlow, r.funds, r.accounts]
  const leverage = [p('cnMarginRatio', '融资余额 ÷ 流通市值'), p('cnMarginYoy', '融资余额同比'), p('cnMarginBuyShare', '融资买入占成交额'), p('cnIfBasis', '沪深300 期指年化基差'), p('cnImBasis', '中证1000 期指年化基差'), p('cnMarginBalance', '两融余额')]
  const environment = [p('cnM1M2', 'M1 − M2 剪刀差'), p('cnTenYear', '10 年期国债收益率'), p('cnShibor3m', 'Shibor 3 个月'), p('cnLpr1y', '1 年期 LPR'), p('cnPmi', '制造业 PMI'), p('cnPpi', 'PPI 同比'), p('cnM1Yoy', 'M1 同比'), p('cnM2Yoy', 'M2 同比')]
  const questions: Question[] = [
    { title: 'A 股贵不贵？', items: valuation, offense: '估值不贵', defense: '估值偏贵', neutral: '估值适中' },
    { title: '大家的情绪如何？', items: [...mood.slice(0, 6), p('cnTurnover', '两市换手率')], offense: '偏冷（逆向看是机会）', defense: '偏热（要防回调）', neutral: '情绪中性' },
    { title: '成交和参与度？', items: [p('cnVolumeRatio', '成交额 20 日量比'), r.above60, r.highLow], offense: '参与广、量能足', defense: '参与度偏弱', neutral: '量能一般' },
    { title: 'ETF申赎与参与意愿如何？', items: inflow, offense: '申购与开户偏热', defense: '申购与开户偏冷', neutral: '参与意愿一般' },
    { title: '杠杆和对冲情绪？', items: leverage.slice(0, 5), offense: '杠杆不高、对冲盘悲观', defense: '杠杆偏高、情绪乐观', neutral: '高低互见（看下方各项）' },
    { title: '利率、流动性和经济？', items: environment.slice(0, 7), offense: '环境友好', defense: '环境偏紧', neutral: '环境中性' },
  ]
  const weeklySignals: BriefSignal[] = [
    { item: r.above60, label: '高于 60 日线的股票占比', polarity: 1, min: 2 },
    { item: r.highLow, label: '20 日新高 − 新低', polarity: 1, min: 2 },
    { item: p('cnMarginBalance', '两融余额'), label: '两融余额', polarity: 1, min: 0.5, mode: 'pct' },
    { item: p('cnOptionPcr', '股指期权 PCR'), label: '股指期权 PCR', polarity: -1, min: 0.05 },
    { item: p('cnIfBasis', '沪深300 期指年化基差'), label: '沪深300 期指年化基差', polarity: 1, min: 1 },
  ]
  const marketDate = slice?.history.at(-1)?.[0]
  const relative = slice && csi300 && slice.id !== csi300.id ? compareReturns(slice.history, csi300.history, 20) : undefined
  const sliceValuation = valuationItem(slice)

  return <GuideContext.Provider value={{ guides: CN_GUIDES, family: CN_FAMILY }}>
    <section className="us-market" aria-label="中国市场仪表盘">
      <div className="us-market__top">
        <Segmented label="A 股细分" items={GROUPS} value={group} onChange={next => set({ view: next === 'broad' ? undefined : next, index: undefined })} />
        <button type="button" className="tool-btn" disabled={loading} onClick={() => { setLoading(true); setAttempt(n => n + 1) }}><RefreshCw size={15} aria-hidden="true" />刷新快照</button>
      </div>
      <p className="us-market__notice" role="status">{loading ? '正在核对数据快照…' : failed.length ? `部分数据暂时不可用（${failed.length} 个快照），保留可用读数。` : ''}</p>
      <WeeklyMarketBrief market="cn" asOf={asOf} benchmark={csi300} peers={all} signals={weeklySignals} loading={loading} />
      <details className="weekly-brief__full">
        <summary>市场各维度依据</summary>
        <PlainSummary asOf={asOf} market="A股" questions={questions} trend={trend} />
      </details>
      {group !== 'participants' && slice && <label className="us-market__select">选择指数
        <select value={slice.id} onChange={event => set({ index: event.target.value })}>{slices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </label>}
      <div className="us-market__range">
        <Segmented label="历史区间" items={RANGES.map(({ id, label }) => ({ id, label }))} value={range} onChange={id => set({ range: id === '5y' ? undefined : id })} />
        <span className="us-market__muted">图表与区间均值随所选区间变化</span>
      </div>
      {group !== 'participants' && slice && <header className="us-market__hero">
        <div>
          <p className="us-market__muted">{slice.scope} · {marketDate ? `收盘 ${marketDate} · ${freshness(marketDate, '每日', asOf)}` : '收盘日期待确认'}</p>
          <h2>{slice.name}</h2>
          <p className="us-market__return">{signed(periodReturn(slice.history, 5), '%')} <span>近 5 日</span>{relative !== undefined && <span>近 20 日相对沪深300 {signed(relative, ' 个百分点')}</span>}</p>
          <HistoryChart points={withinYears(slice.history, years)} label={`${slice.name}价格走势`} format={value => format(Math.round(value * 100) / 100, '')} priceRange={range} />
        </div>
        <div className="us-market__stance" data-state={trend?.lean === 'defense' ? '防守压力上升' : trend?.lean === 'offense' ? '修复证据增强' : ''}>
          <p className="us-market__muted">判断对象：沪深300</p>
          <strong>{trend ? (trend.lean === 'offense' ? '中期趋势向上' : '中期趋势向下') : '趋势待确认'}</strong>
          <p>{trend?.label ?? '等待足够的日线数据。'}</p>
          {sliceValuation.reading && <dl>
            <div><dt>{slice.name}市盈率</dt><dd>{format(slice.valuation!.value, '倍')}</dd></div>
            {slice.valuation?.pct !== undefined && <div><dt>近 10 年分位</dt><dd>{slice.valuation.pct}%</dd></div>}
          </dl>}
          <p className="us-market__stance-help">站在 200 日均线上方为中期向上，跌破为向下；不随上方所选指数变化。</p>
        </div>
      </header>}
      <RelativePerformance market="cn" slices={all} asOf={asOf} />
      <div className="us-market__grid">
        {group !== 'participants' && <>
          <MarketCard title="估值" items={slice && slice.id !== '000300' && slice.id !== '000985' ? [sliceValuation, ...valuation] : valuation} asOf={asOf} years={years} />
          <MarketCard title="情绪" items={mood} asOf={asOf} years={years} />
          <MarketCard title="成交与参与度" items={activity} asOf={asOf} years={years} />
          <MarketCard title="ETF 申赎与参与意愿" items={inflow} asOf={asOf} years={years} />
          <MarketCard title="杠杆与期指" items={leverage} asOf={asOf} years={years} />
          <MarketCard title="利率、流动性与经济" items={environment} asOf={asOf} years={years} />
        </>}
        {group === 'participants' && <>
          <MarketCard title="杠杆资金（两融）" items={[p('cnMarginRatio', '融资余额 ÷ 流通市值'), p('cnMarginBuyShare', '融资买入占成交额'), p('cnMarginYoy', '融资余额同比'), p('cnMarginBalance', '两融余额')]} asOf={asOf} years={years} />
          <MarketCard title="散户与新基金" items={[r.accounts, r.funds, p('cnLimitUp', '涨停家数'), p('cnMaxBoard', '最高连板')]} asOf={asOf} years={years} />
          <MarketCard title="国家队与 ETF" items={[r.etfFlow, r.national]} asOf={asOf} years={years} />
          <MarketCard title="机构对冲（期指与期权）" items={[p('cnIfBasis', '沪深300 期指年化基差'), p('cnImBasis', '中证1000 期指年化基差'), p('cnOptionPcr', '股指期权 PCR')]} asOf={asOf} years={years} />
          <MarketCard title="外资（北向）" items={[p('cnNorthTurnover', '北向成交额')]} asOf={asOf} years={years} />
        </>}
      </div>
      {group !== 'participants' && <Matrix slices={slices} active={slice} benchmark={csi300?.history ?? []} choose={item => set({ index: item.id })} />}
      <details className="us-market__reference"><summary><CircleHelp size={16} aria-hidden="true" />如何读图 · A 股的特殊之处</summary>
        <p>价格与成交以完成的交易日为准（北京时间 15:30 后计入当天）。估值使用中证指数公司、国证指数公司公布的滚动市盈率；创业板指使用创业板整体估值近似。</p>
        <p>成交额、两融余额会随市场规模长期增长，判断热度主要看换手率、量比和融资占流通市值的比例。中证1000 等小盘股期指长期贴水是常态，要看是否异常深。</p>
        <p>国家队集中买入时，宽基 ETF 流入、跌停家数等指标会显示“有支撑”，但不代表市场自发转强。2024 年 8 月起北向资金不再公布每日净买入，只能看成交额。</p>
      </details>
    </section>
  </GuideContext.Provider>
}
