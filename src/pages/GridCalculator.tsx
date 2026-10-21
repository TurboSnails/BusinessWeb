import FeeNote from '../features/grid-trading/FeeNote'
import React, { useMemo, useState } from 'react'
import { PageTitle } from '../components/ui/PageTabs'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, BarChart3, Save, Wand2 } from 'lucide-react'
import { calculateGrid } from '../features/grid-trading/simulation'
import { gridSensitivity } from '../features/grid-trading/sensitivity'
import { fetchQuotes, getCandles, marketToday, mergeQuote } from '../features/grid-trading/marketData'
import { saveRecord } from '../features/grid-trading/repository'
import { isEtf, symbolOf } from '../features/grid-trading/types'
import type { Candle, GridParams, GridResult, SavedRecord } from '../features/grid-trading/types'
import '../features/grid-trading/gridTrading.css'
import { Page } from '../components/ui'

type FormState = {
  code: string
  name: string
  date: string
  endDate: string
  initialPrice: string
  initialAmount: string
  gridAmount: string
  step: string
  rebound: string
  pullback: string
  floorPrice: string
  budget: string
}

type Calculated = { row: GridParams; result: GridResult; candles: Candle[]; source: string; fetchedAt: string; endDate: string }

const blankForm: FormState = { code: '', name: '', date: '', endDate: '', initialPrice: '', initialAmount: '', gridAmount: '', step: '', rebound: '0', pullback: '0', floorPrice: '', budget: '' }
/** 从候选池等页面带过来的 ?code=&name=，只接受 6 位代码 */
function formFromParams(params: URLSearchParams): FormState {
  const code = (params.get('code') ?? '').trim()
  if (!/^\d{6}$/.test(code)) return blankForm
  return { ...blankForm, code, name: (params.get('name') ?? '').trim().slice(0, 40) }
}

/** 一年前的同一天（北京时间），作为默认建仓日 */
export function oneYearBefore(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const date = new Date(Date.UTC(y - 1, m - 1, d))
  return date.toISOString().slice(0, 10)
}

/** 建议步长：价格的 3%；ETF 精确到 0.001，个股到 0.01，且不小于一个最小价位 */
export function suggestStep(price: number, etf: boolean): string {
  const tick = etf ? 0.001 : 0.01
  const step = Math.max(tick, Math.round((price * 0.03) / tick) * tick)
  return step.toFixed(etf ? 3 : 2)
}

const money = (value: number): string => `${value < 0 ? '-' : ''}¥${Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
const uid = (): string => globalThis.crypto?.randomUUID?.() ?? `grid-${Date.now()}-${Math.random().toString(36).slice(2)}`

function validate(form: FormState): string | null {
  if (!/^\d{6}$/.test(form.code.trim())) return '证券代码必须为六位数字。'
  if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return '请选择建仓日期。'
  if (form.endDate && form.endDate < form.date) return '结束日期不能早于建仓日期。'
  const values: Array<[string, string, boolean]> = [
    ['建仓价格', form.initialPrice, true], ['建仓金额', form.initialAmount, true], ['每格金额', form.gridAmount, true],
    ['网格步长', form.step, true], ['买入反弹', form.rebound, false], ['卖出回落', form.pullback, false],
  ]
  for (const [name, raw, requiredPositive] of values) {
    if (raw.trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0 || (requiredPositive && Number(raw) <= 0)) return `${name}参数无效。`
  }
  for (const [name, raw] of [['价格下沿', form.floorPrice], ['资金预算', form.budget]] as Array<[string, string]>) {
    if (raw.trim() !== '' && (!Number.isFinite(Number(raw)) || Number(raw) <= 0)) return `${name}参数无效。`
  }
  return null
}

function EquityPreview({ result }: { result: GridResult }): JSX.Element {
  const series = result.series
  if (!series.length) return <div className="grid-chart-empty">暂无资金曲线数据</div>
  const values = series.map(point => point.pnl)
  const min = Math.min(...values, 0), max = Math.max(...values, 0)
  const span = max - min || 1
  const points = values.map((value, index) => {
    const x = series.length === 1 ? 460 : 24 + (index / (series.length - 1)) * 872
    const y = 18 + ((max - value) / span) * 190
    return `${x},${y}`
  }).join(' ')
  return <svg className="grid-equity-preview" viewBox="0 0 920 230" role="img" aria-label="回测盈亏曲线">
    <line x1="24" x2="896" y1={18 + (max / span) * 190} y2={18 + (max / span) * 190} className="grid-chart-zero" />
    <polyline points={points} className="grid-chart-pnl" />
    <text x="24" y="224">{series[0].date}</text><text x="896" y="224" textAnchor="end">{series[series.length - 1].date}</text>
  </svg>
}

export default function GridCalculator(): JSX.Element {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState<FormState>(() => formFromParams(params))
  const [suggesting, setSuggesting] = useState(false)
  const [suggestNotice, setSuggestNotice] = useState('')
  const [calculated, setCalculated] = useState<Calculated | null>(null)
  const [error, setError] = useState('')
  const [quoteNotice, setQuoteNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const update = (key: keyof FormState, value: string) => {
    setForm(current => ({ ...current, [key]: value }))
    setSaved(false)
  }

  // 按建仓日收盘价填入建仓价，并给出步长与金额的起步值；已填写的金额不覆盖
  const suggest = async () => {
    const code = form.code.trim()
    if (!/^\d{6}$/.test(code)) { setError('请先填写六位证券代码。'); return }
    const date = form.date || oneYearBefore(marketToday())
    setError('')
    setSuggestNotice('')
    setSuggesting(true)
    try {
      const history = await getCandles(code, date)
      const first = history.candles.find(candle => candle.date >= date)
      if (!first) throw new Error('建仓日之后没有行情数据，请换一个日期。')
      let name = form.name
      if (!name.trim()) {
        try { name = (await fetchQuotes([code])).get(code)?.name ?? '' } catch { /* 名称可选 */ }
      }
      const etf = isEtf(code)
      setForm(current => ({
        ...current, name, date: first.date,
        initialPrice: String(first.close),
        step: suggestStep(first.close, etf),
        initialAmount: current.initialAmount || '10000',
        gridAmount: current.gridAmount || '2000',
      }))
      setSaved(false)
      setSuggestNotice(`已按 ${first.date} 收盘价 ${first.close} 填入建仓价，步长取价格的 3%；金额是起步值，请按自己的预算调整。`)
    } catch (suggestError) {
      setError(suggestError instanceof Error ? suggestError.message : '获取行情失败，请稍后再试。')
    } finally {
      setSuggesting(false)
    }
  }

  const run = async (event: React.FormEvent) => {
    event.preventDefault()
    const validation = validate(form)
    if (validation) { setError(validation); return }
    setError('')
    setQuoteNotice('')
    setBusy(true)
    setCalculated(null)
    try {
      const history = await getCandles(form.code.trim(), form.date)
      let candles = history.candles
      try {
        const quote = (await fetchQuotes([form.code.trim()])).get(form.code.trim())
        candles = mergeQuote(candles, quote)
        if (quote) setQuoteNotice(`已合并 ${quote.date} 实时报价`)
      } catch (quoteError) {
        setQuoteNotice(quoteError instanceof Error ? `实时行情暂不可用：${quoteError.message}；使用日线数据` : '实时行情暂不可用；使用日线数据')
      }
      if (form.endDate) candles = candles.filter(candle => candle.date <= form.endDate)
      if (!candles.length) throw new Error('所选回测日期范围内没有行情数据。')
      const row: GridParams = {
        name: form.name.trim() || form.code.trim(),
        code: form.code.trim(),
        date: form.date,
        initialPrice: Number(form.initialPrice),
        initialAmount: Number(form.initialAmount),
        gridAmount: Number(form.gridAmount),
        step: Number(form.step),
        rebound: Number(form.rebound),
        pullback: Number(form.pullback),
        ...(form.floorPrice.trim() !== '' ? { floorPrice: Number(form.floorPrice) } : {}),
        ...(form.budget.trim() !== '' ? { budget: Number(form.budget) } : {}),
      }
      const result = calculateGrid(row, candles)
      setCalculated({ row, result, candles, source: history.source, fetchedAt: history.fetchedOn, endDate: form.endDate })
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : '回测失败，请检查输入和行情服务。')
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    if (!calculated) return
    const record: SavedRecord = {
      id: uid(), savedAt: new Date().toISOString(), schemaVersion: 1,
      dataSource: calculated.source, dataFetchedAt: calculated.fetchedAt,
      algorithmVersion: 'notes-grid-v1', feeVersion: 'notes-fees-v1', endDate: calculated.endDate,
      row: calculated.row, result: calculated.result,
    }
    try {
      saveRecord(record)
      setSaved(true)
      navigate(`/grid-trading/records/${encodeURIComponent(record.id)}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '本地记录保存失败。')
    }
  }

  const marketPrefix = form.code ? symbolOf(form.code).slice(0, 2).toUpperCase() : ''

  return <Page className="grid-page">
    <FeeNote code={form.code} />
    <PageTitle>网格交易</PageTitle>
    <div className="page-toolbar">
      <span className="page-toolbar__note">用前复权日线推演网格策略，回测记录默认保存在当前浏览器，不会自动上传。</span>
      <Link className="tool-btn" to="/etf-review">ETF 复盘</Link>
      <Link className="tool-btn" to="/grid-trading/records">查看已保存记录 <ArrowRight size={15} /></Link>
    </div>

    <section className="grid-card">
      <div className="grid-section-heading">
        <div className="grid-icon-badge"><BarChart3 size={18} /></div>
        <div><h2>策略参数</h2><p>行情源：腾讯前复权日线与公开实时报价，无需登录。当前日期：{marketToday()}</p></div>
      </div>
      <form className="grid-form" onSubmit={event => void run(event)} noValidate>
        <label>证券代码
          <input aria-label="证券代码" value={form.code} onChange={event => update('code', event.target.value)} inputMode="numeric" maxLength={6} placeholder="如 510300" />
          {form.code.length === 6 && <small>{isEtf(form.code) ? 'ETF' : 'A 股'} · {marketPrefix} 交易所</small>}
        </label>
        <label>标的名称<input value={form.name} onChange={event => update('name', event.target.value)} placeholder="可选" /></label>
        <label>建仓日期<input type="date" value={form.date} onChange={event => update('date', event.target.value)} /></label>
        <label>结束日期<input type="date" value={form.endDate} onChange={event => update('endDate', event.target.value)} /><small>留空则回测到最新行情日</small></label>
        <label>建仓价格<input type="number" min="0" step="0.001" value={form.initialPrice} onChange={event => update('initialPrice', event.target.value)} placeholder="0.000" /></label>
        <label>建仓金额<input type="number" min="0" step="100" value={form.initialAmount} onChange={event => update('initialAmount', event.target.value)} placeholder="¥" /></label>
        <label>每格金额<input type="number" min="0" step="100" value={form.gridAmount} onChange={event => update('gridAmount', event.target.value)} placeholder="¥" /></label>
        <label>网格步长<input type="number" min="0" step="0.001" value={form.step} onChange={event => update('step', event.target.value)} placeholder="价格差" /></label>
        <label>买入反弹<input type="number" min="0" step="0.001" value={form.rebound} onChange={event => update('rebound', event.target.value)} /></label>
        <label>卖出回落<input type="number" min="0" step="0.001" value={form.pullback} onChange={event => update('pullback', event.target.value)} /></label>
        <label>价格下沿<input type="number" min="0" step="0.001" value={form.floorPrice} onChange={event => update('floorPrice', event.target.value)} placeholder="可选" /><small>可选：网格买入价低于此价时永久停止买入，卖出不受影响</small></label>
        <label>资金预算<input type="number" min="0" step="100" value={form.budget} onChange={event => update('budget', event.target.value)} placeholder="可选 ¥" /><small>可选：最大资金占用超过预算时给出告警，不改变回测结果</small></label>
        <div className="grid-submit-row">
          <button type="button" className="tool-btn" disabled={suggesting || busy} title="按建仓日收盘价填入建仓价与步长；建仓日留空时取一年前" onClick={() => void suggest()}><Wand2 size={15} aria-hidden="true" />{suggesting ? '正在取价…' : '填入建议参数'}</button>
          <button type="submit" className="grid-button" disabled={busy}>{busy ? '正在获取行情并回测…' : '运行回测'}</button>
        </div>
        {suggestNotice && <p className="grid-suggest-note" role="status">{suggestNotice}</p>}
      </form>
      <div className="grid-assumption"><strong>回测假设</strong>：按日线最高/最低价判断触发，成交按固定网格价；建仓日不触发。若同一日同时触及买卖价，按买入优先处理，一天最多一笔。这是历史模拟，不会提交实盘委托。</div>
      {error && <p className="grid-error-text" role="alert">{error}</p>}
      {quoteNotice && <p className="grid-inline-message" role="status">{quoteNotice}</p>}
    </section>

    {calculated && <section className="grid-card grid-result-card">
      <div className="grid-section-heading"><div><h2>回测结果</h2><p>{calculated.row.name} · {calculated.row.code} · {calculated.result.range}</p></div><button type="button" className="grid-button" onClick={save}><Save size={16} /> {saved ? '已保存' : '保存记录'}</button></div>
      <div className="grid-metrics">
        <Metric label="总盈亏" value={money(calculated.result.pnl)} positive={calculated.result.pnl >= 0} />
        <Metric label="已实现盈亏" value={money(calculated.result.realized)} positive={calculated.result.realized >= 0} />
        <Metric label="最新收盘" value={`¥${calculated.result.current.toFixed(3)}`} />
        <Metric label="持仓市值" value={money((calculated.result.position ?? 0) * calculated.result.current)} />
        <Metric label="最大资金占用（需要为这张网准备的资金）" value={money(calculated.result.maxCapital)} />
        <Metric label="买入 / 卖出" value={`${calculated.result.buys} / ${calculated.result.sells}`} />
        <Metric label="下一买入价" value={calculated.result.floorHitDate ? '已触及下沿停止买入' : `¥${calculated.result.nextBuy.toFixed(3)}`} />
        <Metric label="下一卖出价" value={`¥${calculated.result.nextSell.toFixed(3)}`} />
      </div>
      {calculated.result.floorHitDate && <p className="grid-error-text" role="alert">已于 {calculated.result.floorHitDate} 触及价格下沿 ¥{calculated.row.floorPrice!.toFixed(3)}，此后停止买入；卖出仍可触发，持仓可继续出清。</p>}
      {calculated.result.budgetExceeded && calculated.row.budget !== undefined && <p className="grid-error-text" role="alert">最大资金占用 {money(calculated.result.maxCapital)} 已超过你设定的资金预算 {money(calculated.row.budget)}：这张网需要的资金超出计划，请考虑缩小每格金额、减少格数或设置价格下沿。</p>}
      <div className="grid-chart-wrap"><h3>资金盈亏曲线</h3><EquityPreview result={calculated.result} /></div>
      <SensitivityTable row={calculated.row} candles={calculated.candles} />
      <p className="grid-data-caption">{calculated.source} · 数据获取于 {calculated.fetchedAt} · 算法 notes-grid-v1</p>
      <p className="grid-data-caption">历史模拟不代表未来表现；模拟未含滑点与买卖价差，实盘成本会更高。</p>
      {calculated.result.warnings?.map(warning => <p className="grid-error-text" key={warning}>{warning}</p>)}
    </section>}
  </Page>
}

function SensitivityTable({ row, candles }: { row: GridParams; candles: Candle[] }): JSX.Element {
  const { rows, buyHoldPnl } = useMemo(() => gridSensitivity(row, candles), [row, candles])
  return <div className="grid-chart-wrap grid-sensitivity">
    <h3>步长敏感性</h3>
    <p className="grid-data-caption">同一段行情只改网格步长，其余参数不变；对比同样本金一直持有（{money(buyHoldPnl)}）。</p>
    <div className="grid-sensitivity-scroll"><table>
      <thead><tr><th>步长</th><th>总盈亏</th><th>最大资金占用</th><th>盈亏/占用</th><th>成交次数</th></tr></thead>
      <tbody>{rows.map(item => <tr key={item.scale} className={item.isCurrent ? 'is-current' : ''}>
        <td>{item.step}{item.isCurrent ? '（当前）' : ` (×${item.scale})`}</td>
        <td className={item.pnl >= 0 ? 'grid-positive' : 'grid-negative'}>{money(item.pnl)}</td>
        <td>{money(item.maxCapital)}</td><td>{(item.returnOnCapital * 100).toFixed(1)}%</td><td>{item.trades}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="grid-data-caption">只是这一段历史行情上的结果，换一个区间排名可能完全不同；不要据此挑“最优步长”。</p>
  </div>
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }): JSX.Element {
  return <div className="grid-metric"><small>{label}</small><strong className={positive === undefined ? '' : positive ? 'grid-positive' : 'grid-negative'}>{value}</strong></div>
}
