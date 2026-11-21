import React from 'react'
import { format, MarketCard, signed } from './cards'
import { freshness, type Point, type Reading } from './model'

type Props = { series?: Record<string, Reading>; asOf: string; years: number | null }

function fundingSpread(sofr?: Reading, iorb?: Reading): Reading | undefined {
  if (sofr?.unit !== '%' || iorb?.unit !== '%') return undefined
  const reserves = new Map(iorb.history)
  const history = sofr.history.flatMap(([day, value]): Point[] => {
    const policy = reserves.get(day)
    return policy !== undefined && Number.isFinite(policy) && Number.isFinite(value)
      ? [[day, Math.round((value - policy) * 100)]] : []
  })
  return {
    name: 'SOFR − IORB', history, unit: 'bp', scope: '仅用两项利率都有观测的日期，以百分点差乘 100 换算基点。正值表示国债抵押隔夜融资成本高于准备金利率。',
    frequency: '日频', source: '', refreshError: sofr.refreshError || iorb.refreshError,
  }
}

export default function UsLiquidity({ series = {}, asOf, years }: Props) {
  const item = (id: string, name: string) => ({ id, name, reading: series[id] })
  const reserves = series.bankReserves
  const current = reserves?.history.at(-1)
  const currentDay = Date.parse(current?.[0] ?? '')
  const baseDay = Number.isFinite(currentDay) ? new Date(currentDay - 28 * 86400000).toISOString().slice(0, 10) : undefined
  const base = reserves?.history.find(([day]) => day === baseDay)
  const spread = fundingSpread(series.sofr, series.iorb)
  const common = spread?.history.at(-1)
  return <>
    <header>
      <h2>美国市场流动性</h2>
      <p>先看银行体系有多少准备金，再看隔夜融资要付多少利息。用成交量看交易活跃度，用 ETF 买卖价差观察交易成本。</p>
    </header>
    <div className="us-market__hero">
      <div><h3>准备金近四周变化</h3>
        <strong>{current && base ? signed(current[1] - base[1], '十亿美元') : '等待相隔四周的观测'}</strong>
        {current && <p className="us-market__muted">{base && base[0] + ' → '}{current[0]} · {freshness(current[0], '周频', asOf)} · 周均余额{reserves?.refreshError && ' · 本次未能复核'}</p>}
      </div>
      <div><h3>隔夜融资相对准备金利率</h3>
        <strong>{common ? format(common[1], 'bp') : '等待同日利率'}</strong>
        {common && <p className="us-market__muted">{common[0]} · {freshness(common[0], '日频', asOf)} · SOFR 减 IORB{spread?.refreshError && ' · 本次未能复核'}</p>}
      </div>
    </div>
    <div className="us-market__grid">
      <MarketCard title="准备金与联储资产负债表" asOf={asOf} years={years} items={[
        item('bankReserves', '银行准备金余额'), item('treasuryCash', '财政部一般账户（TGA）'),
        item('overnightRrp', '隔夜逆回购（ON RRP）'), item('fedAssets', '美联储总资产'),
      ]} />
      <MarketCard title="美元融资价格" asOf={asOf} years={years} items={[
        { name: 'SOFR − IORB', reading: spread }, item('sofr', '担保隔夜融资利率（SOFR）'), item('iorb', '准备金余额利率（IORB）'),
      ]} />
      <MarketCard title="股票交易成本与活跃度" asOf={asOf} years={years} items={[
        item('spyQuotedSpread', 'SPY 大盘 ETF 买卖价差'), item('spsmQuotedSpread', 'SPSM 小盘 ETF 买卖价差'),
        item('volumeRatio', '全美股票 20 日量比'), item('volume', '全美股票日成交量'),
      ]} />
    </div>
    <p className="us-market__muted">准备金与 TGA 采用周均余额，联储总资产采用周三余额。准备金变化还受流通现金等项目影响。ETF 价差为近 30 日中位数，发行人披露精度为 1 bp。显示为 0 bp 时仍可能有买卖成本，大额订单还需核对盘口深度。</p>
  </>
}
