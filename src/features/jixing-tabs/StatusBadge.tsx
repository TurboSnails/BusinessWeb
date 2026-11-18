// 今天几星四页签共用的估值状态徽章与图例（低估/正常/高估）
import React from 'react'
import { Badge } from '../../components/ui'
import './status.css'

export type ValuationStatusKey = 'low' | 'normal' | 'high'
export type ValuationStatusLabel = '低估' | '正常' | '高估'

export const VALUATION_STATUS: Record<ValuationStatusKey, { label: ValuationStatusLabel; tone: 'down' | 'warm' | 'up'; order: number }> = {
  low: { label: '低估', tone: 'down', order: 0 },
  normal: { label: '正常', tone: 'warm', order: 1 },
  high: { label: '高估', tone: 'up', order: 2 },
}

const BY_LABEL: Record<ValuationStatusLabel, ValuationStatusKey> = {
  低估: 'low', 正常: 'normal', 高估: 'high',
}

export function asStatusKey(v: ValuationStatusKey | ValuationStatusLabel | null | undefined): ValuationStatusKey | null {
  if (v == null) return null
  if (v === 'low' || v === 'normal' || v === 'high') return v
  return BY_LABEL[v] ?? null
}

/** 估值状态徽章：颜色与文字同时给出；空状态显示 — 或自定义占位。 */
export function StatusBadge({
  status,
  empty = '—',
  count,
}: {
  status: ValuationStatusKey | ValuationStatusLabel | null | undefined
  empty?: string
  count?: number
}): JSX.Element {
  const key = asStatusKey(status)
  if (!key) return <span className="jx-status jx-status--empty">{empty}</span>
  const meta = VALUATION_STATUS[key]
  const label = count === undefined ? meta.label : `${meta.label} ${count} 只`
  return <Badge tone={meta.tone} className={`jx-status jx-status--${key}`}>{label}</Badge>
}

/** 统一图例说明：状态阈值文案放在 mm-method 段落里。 */
export function StatusLegend({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="mm-method jx-legend">{children}</p>
}

/** 窗口 / 样本数脚注。 */
export function SampleFootnote({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="mm-method jx-footnote">{children}</p>
}
