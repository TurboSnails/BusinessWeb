import React from 'react'
import { Link } from 'react-router-dom'
import '../etf-flow/etf-flow.css'

const ITEMS = [
  ['/lab/etf-flow', 'ETF 资金流'],
  ['/lab/etf-uptrend', 'ETF 主升浪'],
  ['/lab/etf-watch-pool', '行业观察池'],
  ['/lab/etf-macd-good', '创业板择时优选'],
  ['/lab/etf-hs300-timing', '沪深300择时优选'],
  ['/lab/etf-signal-plans', '三方案回测'],
  ['/lab/etf-timing', '择时实验'],
] as const

export function LabNav({ current }: { current: string }): JSX.Element {
  return (
    <nav className="lab-hub-links" aria-label="实验观察入口">
      {ITEMS.map(([path, label]) => (
        path === current ? <span key={path}>{label}</span> : <Link key={path} to={path}>{label}</Link>
      ))}
    </nav>
  )
}
