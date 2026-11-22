import React from 'react'
import type { Reading } from './types'

const DIRECTION_LABELS = { up: '上升', down: '下降', flat: '持平' } as const

function formatValue(value: number): string {
  const abs = Math.abs(value)
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: abs > 0 && abs < 1 ? 4 : 2,
  }).format(value)
}

export default function ReadingCell({ reading, loading = false }: {
  reading: Reading | null | undefined
  loading?: boolean
}): JSX.Element {
  if (loading) return <span className="mm-reading mm-reading--muted" role="status">读数加载中</span>
  if (!reading) return <span className="mm-reading mm-reading--empty">本站暂无</span>

  const years = reading.percentileYears ?? 10

  return (
    <span className="mm-reading">
      <span className="mm-reading__label">{reading.label}</span>
      <span className="mm-reading__value">
        {formatValue(reading.value)}<span className="mm-reading__unit">{reading.unit}</span>
      </span>
      <time className="mm-reading__date" dateTime={reading.date}>{reading.date}</time>
      {reading.percentile !== undefined && (
        <span>近 {formatValue(years)} 年分位 {formatValue(reading.percentile)}%</span>
      )}
      {reading.direction && <span>近一月{DIRECTION_LABELS[reading.direction]}</span>}
      {reading.stale && <span className="mm-reading__stale">数据可能过期</span>}
      {reading.refreshFailed && (
        <span className="mm-reading__refresh">最近一次更新失败，显示上次读数</span>
      )}
      {reading.note && <span className="mm-reading__note">{reading.note}</span>}
      <span className="mm-reading__source">来源：{reading.source}</span>
    </span>
  )
}
