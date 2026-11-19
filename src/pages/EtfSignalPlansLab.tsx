import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageToolbar, Stat, StatGrid, TableWrap } from '../components/ui'
import { loadPlanBundle } from '../features/etf-signal-plans/load-plans'
import { PlanPriceChart } from '../features/etf-signal-plans/PlanPriceChart'
import { LabNav } from '../features/etf-signal-plans/LabNav'
import {
  backtestPlan, backtestPlanYearly, yearlySummary,
  type PlanBacktest, type PlanBar, type PlanKey, type PlanResult, type PlanYearly,
} from '../features/etf-signal-plans/plan-trades'
import '../features/etf-flow/etf-flow.css'

const pct = (v?: number, signed = false) => {
  if (v == null || !Number.isFinite(v)) return '—'
  const body = `${(v * 100).toFixed(1)}%`
  return signed && v > 0 ? `+${body}` : body
}
const num = (v?: number) => v == null || !Number.isFinite(v) ? '—' : v.toFixed(2)
const tone = (v?: number) => (v == null || !Number.isFinite(v) || v === 0 ? undefined : v > 0 ? 'etf-kpi--up' : 'etf-kpi--down')

type Bundle = {
  source: string
  bars: PlanBar[]
  plans: PlanResult[]
  full: Record<PlanKey, PlanBacktest | undefined>
  yearlyRows: Record<PlanKey, PlanYearly>
  yearly: Record<PlanKey, ReturnType<typeof yearlySummary>>
  best: PlanKey | null
}

export default function EtfSignalPlansLab(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const initialCode = params.get('code') ?? '512480'
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState(params.get('name') ?? '')
  const [input, setInput] = useState(initialCode)
  const [load, setLoad] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [error, setError] = useState('')
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [openYears, setOpenYears] = useState<Partial<Record<PlanKey, boolean>>>({})

  useEffect(() => {
    if (!/^\d{6}$/.test(code)) return
    let live = true
    setLoad('loading'); setError('')
    ;(async () => {
      try {
        const base = await loadPlanBundle(code)
        if (!live) return
        const { bars, plans, bullR2, bullH1 } = base
        const yearlyRows = {
          cyb: backtestPlanYearly('cyb', bars, bullR2),
          hs: backtestPlanYearly('hs', bars, bullH1),
          macd: backtestPlanYearly('macd', bars, () => true),
        }
        const full = {
          cyb: backtestPlan('cyb', bars, bullR2),
          hs: backtestPlan('hs', bars, bullH1),
          macd: backtestPlan('macd', bars, () => true),
        }
        const yearly = {
          cyb: yearlySummary(yearlyRows.cyb),
          hs: yearlySummary(yearlyRows.hs),
          macd: yearlySummary(yearlyRows.macd),
        }
        const cals = (Object.entries(full) as [PlanKey, PlanBacktest | undefined][])
          .map(([k, v]) => [k, v?.calmar ?? -Infinity] as const)
          .sort((a, b) => b[1] - a[1])
        setBundle({
          source: base.source,
          bars,
          plans,
          full,
          yearlyRows,
          yearly,
          best: cals[0] && Number.isFinite(cals[0][1]) ? cals[0][0] : null,
        })
        setLoad('ok')
      } catch (e) {
        if (!live) return
        setLoad('error')
        setError(e instanceof Error ? e.message : '加载失败')
        setBundle(null)
      }
    })()
    return () => { live = false }
  }, [code])

  const recent = useMemo(() => {
    if (!bundle) return []
    return bundle.plans.map(p => ({
      key: p.key, name: p.name, holding: p.holding,
      last: [...p.signals].reverse().find(s => !s.forced),
      pending: p.pendingBuy,
      n: p.signals.filter(s => !s.forced).length,
    }))
  }, [bundle])

  function run() {
    const next = input.trim()
    if (!/^\d{6}$/.test(next)) { setError('请输入六位 ETF 代码'); return }
    const same = next === code
    setCode(next)
    setName('') // 手输代码时清掉旧名称，避免串名
    setParams({ code: next }, { replace: true })
    if (same) {
      // 同代码强制重拉：靠改 load 不够，这里直接触发依赖不变时的提示
      setError('')
    }
  }

  return (
    <Page title="三方案回测（实验）">
      <LabNav current="/lab/etf-signal-plans" />
      <PageToolbar note="创业板择时 / 沪深300择时 / 纯MACD 的研究口径回测。独立实验页，不并入网格主流程；不发提醒。" />
      <Callout tone="warn" title="观察中 · 不是买卖指令">
        满仓进出、单边 0.1% 成本、前 120 根预热。日线与择时比值一律腾讯后复权（hfq）。逐年=自然年单独回测（不足 120 交易日不计）；年化需满一年；卡玛=年化÷|最大回撤|。历史统计不代表未来。
      </Callout>
      <form className="lab-hub-links lab-hub-links--center" onSubmit={e => { e.preventDefault(); run() }}>
        <label>代码 <input value={input} onChange={e => setInput(e.target.value)} maxLength={6} inputMode="numeric" /></label>
        <button type="submit">回测</button>
        {name ? <span>{name}（{code}）</span> : <span className="etf-flow__note">{code}</span>}
      </form>
      {load === 'loading' && <p role="status">拉取日线并回测中…</p>}
      {load === 'error' && <EmptyState title="失败">{error}</EmptyState>}
      {bundle && (
        <>
          <p className="etf-flow__foot">行情：{bundle.source}</p>
          <Card title="价格与信号" as="section" description="粗线段 = 规则认为适合持有的时段；箭头 = 买卖信号">
            <PlanPriceChart bars={bundle.bars} plans={bundle.plans} name={name || code} />
          </Card>
          <div className="lab-stack">
            {bundle.plans.map(plan => {
              const full = bundle.full[plan.key]
              const y = bundle.yearly[plan.key]
              const rows = bundle.yearlyRows[plan.key]
              const isBest = bundle.best === plan.key
              const yearsOpen = !!openYears[plan.key]
              const signals = [...plan.signals].filter(s => !s.forced).slice(-8).reverse()
              return (
                <Card key={plan.key} as="section" title={`${plan.name}${isBest ? ' · 全历史卡玛最高' : ''}`}
                  description={plan.key === 'macd' ? '不择时' : plan.key === 'cyb' ? '创业板÷红利 > 20 日均线为牛 + Y1' : '沪深300÷红利 > 20 日均线为牛 + 只认金叉'}>
                  {full && (
                    <p className="etf-flow__note">
                      全历史 {full.first} — {full.last} · {full.years.toFixed(1)} 年 · {full.sessions} 根
                    </p>
                  )}
                  <StatGrid>
                    <Stat label="状态" value={plan.holding ? '规则持有中' : '空仓'} sub={plan.pendingBuy ? `待买 ${plan.pendingBuy.signalDate}` : undefined} />
                    <Stat className={tone(full?.total)} label="累计收益" value={pct(full?.total, true)} />
                    <Stat className={tone(full?.cagr)} label="年化" value={pct(full?.cagr, true)} />
                    <Stat className={tone(full?.mdd)} label="最大回撤" value={pct(full?.mdd)} />
                    <Stat label="卡玛" value={num(full?.calmar)} />
                    <Stat className={tone(full?.hold)} label="一直持有" value={pct(full?.hold, true)} />
                    <Stat
                      label="完成交易"
                      value={String(full?.natural ?? '—')}
                      sub={full && full.natural > 0 ? `${full.wins}赚 / ${full.natural - full.wins}亏` : undefined}
                    />
                    <Stat label="胜率" value={full?.winRate == null ? '—' : pct(full.winRate)} />
                    <Stat label="盈亏比" value={num(full?.payoff)} />
                    <Stat className={tone(full?.avgRet)} label="单笔均盈亏" value={pct(full?.avgRet, true)} />
                    <Stat className={tone(full?.best)} label="单笔最好" value={pct(full?.best, true)} />
                    <Stat className={tone(full?.worst)} label="单笔最差" value={pct(full?.worst, true)} />
                  </StatGrid>
                  <p className="etf-flow__note">
                    逐年汇总：{y.years} 年，赚钱 {y.positive} 年，均 {pct(y.avg, true)}，最差 {pct(y.worst, true)}
                    {' · '}
                    <button type="button" className="lab-text-btn" onClick={() => setOpenYears(o => ({ ...o, [plan.key]: !yearsOpen }))}>
                      {yearsOpen ? '收起年度明细' : '展开年度明细'}
                    </button>
                  </p>
                  {yearsOpen && (
                    <TableWrap label={`${plan.name} 年度回测`}>
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">年份</th>
                            <th scope="col">收益</th>
                            <th scope="col">最大回撤</th>
                            <th scope="col">一直持有</th>
                            <th scope="col">完成交易</th>
                            <th scope="col">胜率</th>
                            <th scope="col">盈亏比</th>
                            <th scope="col">单笔均</th>
                            <th scope="col">最好/最差</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr><td colSpan={9} className="etf-flow__note">当年可交易日不足，没有逐年样本。</td></tr>
                          ) : rows.map(({ year, result: r }) => (
                            <tr key={year}>
                              <th scope="row">{year}{r.sessions < 200 ? `（${r.sessions}日）` : ''}</th>
                              <td className={`num ${tone(r.total) ?? ''}`}>{pct(r.total, true)}</td>
                              <td className="num">{pct(r.mdd)}</td>
                              <td className={`num ${tone(r.hold) ?? ''}`}>{pct(r.hold, true)}</td>
                              <td className="num">{r.natural ? `${r.natural}（${r.wins}/${r.natural - r.wins}）` : '0'}</td>
                              <td className="num">{r.winRate == null ? '—' : pct(r.winRate)}</td>
                              <td className="num">{num(r.payoff)}</td>
                              <td className={`num ${tone(r.avgRet) ?? ''}`}>{pct(r.avgRet, true)}</td>
                              <td className="num">{pct(r.best, true)} / {pct(r.worst, true)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrap>
                  )}
                  <TableWrap label={`${plan.name} 最近信号`}>
                    <table>
                      <thead><tr><th>日期</th><th>方向</th><th>价格</th><th>原因</th></tr></thead>
                      <tbody>
                        {signals.length === 0 ? (
                          <tr><td colSpan={4} className="etf-flow__note">暂无已完成信号（可能仍在预热或空仓等待）。</td></tr>
                        ) : signals.map(s => (
                          <tr key={`${s.date}-${s.side}-${s.signalDate}`}>
                            <td>{s.date}</td>
                            <td>{s.side === 'buy' ? '买' : '卖'}</td>
                            <td className="num">{s.price.toFixed(3)}</td>
                            <td>{s.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                </Card>
              )
            })}
          </div>
          <Card title="三方案快览" as="section">
            <TableWrap label="快览">
              <table>
                <thead><tr><th>方案</th><th>持仓</th><th>信号数</th><th>最近</th></tr></thead>
                <tbody>
                  {recent.map(r => (
                    <tr key={r.key}>
                      <th scope="row">{r.name}</th>
                      <td>{r.holding ? '持有' : '空仓'}</td>
                      <td className="num">{r.n}</td>
                      <td>{r.last ? `${r.last.date} ${r.last.side === 'buy' ? '买' : '卖'}` : (r.pending ? `待买 ${r.pending.signalDate}` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </>
      )}
    </Page>
  )
}
