import React from 'react'
import { RefreshCw } from 'lucide-react'
import { formatNyTime } from './format'

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }): JSX.Element {
  return <button type="button" className="tool-btn usdc-refresh" onClick={onClick} disabled={loading}>
    <RefreshCw size={15} aria-hidden="true" className={loading ? 'usdc-spin' : undefined} />刷新
  </button>
}

export function MarketTime({ asOf, delayedBy, fetchedAt }: { asOf: string | null; delayedBy?: number | null; fetchedAt: string }): JSX.Element {
  return <p className="usdc-meta">
    行情时间：{formatNyTime(asOf)}（纽约时间）{delayedBy ? ` · 延迟约 ${delayedBy} 分钟` : ' · 是否延迟以数据源为准'}
    <span>本页取数：{formatNyTime(fetchedAt)}（纽约时间）</span>
  </p>
}

export function Loading({ label = '正在读取公开数据…' }: { label?: string }): JSX.Element {
  return <div className="usdc-state" role="status"><span className="usdc-loader" aria-hidden="true" />{label}</div>
}
