export type Plan = 'cyb' | 'hs'

export interface WatchItem {
  code: string
  name: string
  industry: string
  plan: Plan
  start: string
  years: number
  annual: number
  drawdown: number
  calmar: number
  yearly: Record<string, number>
}

export interface WatchPool {
  asOf: string
  rule: string
  items: WatchItem[]
}

export const PLAN_LABEL: Record<Plan, string> = {
  cyb: '创业板择时',
  hs: '沪深300择时',
}

export function asWatchPool(body: unknown): WatchPool | null {
  if (!body || typeof body !== 'object') return null
  const o = body as WatchPool
  if (!Array.isArray(o.items) || typeof o.rule !== 'string') return null
  return o
}

export const fmtPct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
