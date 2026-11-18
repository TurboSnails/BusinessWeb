import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Callout, Card, EmptyState, Page, PageToolbar, Stat, StatGrid, TableWrap } from '../components/ui'
import { fetchPlanBars } from '../features/etf-signal-plans/bars'
import { LabNav } from '../features/etf-signal-plans/LabNav'
import {
  backtestPlan, backtestPlanYearly, cybPlan, hsPlan, macdPlan, yearlySummary,
  type PlanBacktest, type PlanKey, type PlanResult,
} from '../features/etf-signal-plans/plan-trades'
import { H1_CODES, R2_CODES, styleRatio } from '../features/etf-signal-plans/ratio'
import { bullLookup } from '../features/etf-signal-plans/kd10-signals'

const pct = (v?: number) => v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`
const num = (v?: number) => v == null || !Number.isFinite(v) ? '—' : v.toFixed(2)

type Bundle = {
  source: string
  plans: PlanResult[]
  full: Record<PlanKey, PlanBacktest | undefined>
  yearly: Record<PlanKey, ReturnType<typeof yearlySummary>>
  best: PlanKey | null
}

export default function EtfSignalPlansLab(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const [code, setCode] = useState(params.get('code') ?? '512480')
  const [name, setName] = useState(params.get('name') ?? '')
  const [input, setInput] = useState(code)
  const [load, setLoad] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [error, setError] = useState('')
  const [bundle, setBundle] = useState<Bundle | null>(null)

  useEffect(() => {
    if (!/^\d{6}$/.test(code)) return
    let live = true
    setLoad('loading'); setError('')
    ;(async () => {
      try {
        const [target, cyb, div, hs300] = await Promise.all([
          fetchPlanBars(code),
          fetchPlanBars(R2_CODES.growth),
          fetchPlanBars(R2_CODES.defensive),
          fetchPlanBars(H1_CODES.growth),
        ])
        if (!live) return
        const r2 = styleRatio(cyb.bars, div.bars)
        const h1 = styleRatio(hs300.bars, div.bars)
        const plans = [cybPlan(target.bars, r2), hsPlan(target.bars, h1), macdPlan(target.bars)]
        const full = {
          cyb: backtestPlan('cyb', target.bars, bullLookup(r2)),
          hs: backtestPlan('hs', target.bars, bullLookup(h1)),
          macd: backtestPlan('macd', target.bars, () => true),
        }
        const yearly = {
          cyb: yearlySummary(backtestPlanYearly('cyb', target.bars, bullLookup(r2))),
          hs: yearlySummary(backtestPlanYearly('hs', target.bars, bullLookup(h1))),
          macd: yearlySummary(backtestPlanYearly('macd', target.bars, () => true)),
        }
        const cals = (Object.entries(full) as [PlanKey, PlanBacktest | undefined][])
          .map(([k, v]) => [k, v?.calmar ?? -Infinity] as const)
          .sort((a, b) => b[1] - a[1])
        setBundle({
          source: target.source,
          plans,
          full,
          yearly,
          best: cals[0] && Number.isFinite(cals[0][1]) ? cals[0][0] : null,
        })
        setLoad('ok')
        if (!name && target.bars.length) setName(code)
      } catch (e) {
        if (!live) return
        setLoad('error')
        setError(e instanceof Error ? e.message : '加载失败')
        setBundle(null)
      }
    })()
    return () => { live = false }
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps -- name 不触发重算

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
    setCode(next)
    setParams({ code: next, ...(name ? { name } : {}) }, { replace: true })
  }

  return (
    <Page title="三方案回测（实验）">
      <LabNav current="/lab/etf-signal-plans" />
      <PageToolbar note="创业板择时 / 沪深300择时 / 纯MACD 的研究口径回测。独立实验页，不并入网格主流程；不发提醒。" />
      <Callout tone="warn" title="观察中 · 不是买卖指令">
        满仓进出、单边 0.1% 成本、前 120 根预热。日线与择时比值一律腾讯后复权（hfq），与研究站红利口径对齐。历史统计不代表未来。
      </Callout>
      <form className="lab-hub-links" onSubmit={e => { e.preventDefault(); run() }} style={{ alignItems: 'center' }}>
        <label>代码 <input value={input} onChange={e => setInput(e.target.value)} maxLength={6} inputMode="numeric" /></label>
        <button type="submit">回测</button>
        {name && <span>{name}</span>}
      </form>
      {load === 'loading' && <p role="status">拉取日线并回测中…</p>}
      {load === 'error' && <EmptyState title="失败">{error}</EmptyState>}
      {bundle && (
        <>
          <p className="etf-flow__foot">行情：{bundle.source}</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {bundle.plans.map(plan => {
              const full = bundle.full[plan.key]
              const y = bundle.yearly[plan.key]
              const isBest = bundle.best === plan.key
              return (
                <Card key={plan.key} as="section" title={`${plan.name}${isBest ? ' · 全历史卡玛最高' : ''}`}
                  description={plan.key === 'macd' ? '不择时' : plan.key === 'cyb' ? '创业板÷红利 > 20 日均线为牛 + Y1' : '沪深300÷红利 > 20 日均线为牛 + 只认金叉'}>
                  <StatGrid>
                    <Stat label="状态" value={plan.holding ? '规则持有中' : '空仓'} sub={plan.pendingBuy ? `待买 ${plan.pendingBuy.signalDate}` : undefined} />
                    <Stat label="全历史累计" value={pct(full?.total)} />
                    <Stat label="年化" value={pct(full?.cagr)} />
                    <Stat label="最大回撤" value={pct(full?.mdd)} />
                    <Stat label="卡玛" value={num(full?.calmar)} />
                    <Stat label="自然笔数" value={String(full?.natural ?? '—')} sub={full?.winRate != null ? `胜率 ${(full.winRate * 100).toFixed(0)}%` : undefined} />
                    <Stat label="单笔均盈亏" value={pct(full?.avgRet)} />
                  </StatGrid>
                  <p className="etf-flow__note">逐年：{y.years} 年，赚钱 {y.positive} 年，均 {pct(y.avg)}，最差 {pct(y.worst)}</p>
                  <TableWrap label={`${plan.name} 最近信号`}>
                    <table>
                      <thead><tr><th>日期</th><th>方向</th><th>价格</th><th>原因</th></tr></thead>
                      <tbody>
                        {[...plan.signals].filter(s => !s.forced).slice(-8).reverse().map(s => (
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
