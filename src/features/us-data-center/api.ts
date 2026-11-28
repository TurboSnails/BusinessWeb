import { useEffect, useState } from 'react'
import type { IpoData, MoversData, PutCallData, SectorData } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export function usdcUrl(kind: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams({ kind, ...params })
  return `${API_BASE}/api/grid-market?${query}`
}

export type QueryState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'ready'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: string }

export function useUsdcQuery<T>(url: string, parse: (value: unknown) => T): { state: QueryState<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void fetch(url, { signal: controller.signal }).then(async response => {
      let payload: unknown
      try { payload = await response.json() } catch { throw new Error('数据格式异常') }
      if (!response.ok) {
        const message = (payload as { error?: unknown })?.error
        throw new Error(typeof message === 'string' ? message : `HTTP ${response.status}`)
      }
      return parse(payload)
    }).then(data => {
      if (!controller.signal.aborted) setState({ status: 'ready', data })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ status: 'error', error: error instanceof Error ? error.message : '数据暂时不可用' })
    })
    return () => controller.abort()
  }, [url, parse, attempt])
  return { state, retry: () => setAttempt(value => value + 1) }
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('数据格式异常')
  return value as Record<string, unknown>
}
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('数据格式异常')
  return value
}
const text = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('数据格式异常')
  return value
}
const nullableText = (value: unknown): string | null => value === null ? null : text(value)
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('数据格式异常')
  return value
}
const nullableNumber = (value: unknown): number | null => value === null ? null : number(value)

export function parseMovers(value: unknown): MoversData {
  const data = record(value)
  return {
    mode: text(data.mode) as MoversData['mode'],
    partial: data.partial === true,
    rows: array(data.rows).map(item => {
      const row = record(item)
      return {
        symbol: text(row.symbol), name: text(row.name), price: number(row.price),
        changePct: number(row.changePct), volume: number(row.volume),
        volumeRatio: nullableNumber(row.volumeRatio), marketCap: number(row.marketCap),
      }
    }),
    asOf: nullableText(data.asOf), delayedBy: nullableNumber(data.delayedBy),
    source: text(data.source), fetchedAt: text(data.fetchedAt),
  }
}

export function parseIpo(value: unknown): IpoData {
  const data = record(value)
  const groups = record(data.groups)
  const parseGroup = (key: string) => array(groups[key]).map(item => {
    const row = record(item)
    return {
      symbol: nullableText(row.symbol), company: text(row.company), exchange: nullableText(row.exchange),
      date: nullableText(row.date), filedDate: nullableText(row.filedDate), price: nullableText(row.price),
      shares: nullableNumber(row.shares), amount: nullableNumber(row.amount), status: nullableText(row.status),
    }
  })
  return {
    month: text(data.month),
    groups: { upcoming: parseGroup('upcoming'), priced: parseGroup('priced'), filed: parseGroup('filed'), withdrawn: parseGroup('withdrawn') },
    sourceUpdated: nullableText(data.sourceUpdated), source: text(data.source),
    sourceUrl: text(data.sourceUrl), fetchedAt: text(data.fetchedAt),
  }
}

export function parseSectors(value: unknown): SectorData {
  const data = record(value)
  return {
    rows: array(data.rows).map(item => {
      const row = record(item)
      const returns = record(row.returns)
      return {
        symbol: text(row.symbol), name: text(row.name), group: text(row.group) as SectorData['rows'][number]['group'],
        returns: {
          day: nullableNumber(returns.day), week: nullableNumber(returns.week), month: nullableNumber(returns.month),
          quarter: nullableNumber(returns.quarter), ytd: nullableNumber(returns.ytd),
        },
        date: text(row.date), time: nullableText(row.time), delayedBy: nullableNumber(row.delayedBy),
      }
    }),
    source: text(data.source), fetchedAt: text(data.fetchedAt),
  }
}

export function parsePutCall(value: unknown): PutCallData {
  const data = record(value)
  const ratio = (input: unknown) => {
    const item = record(input)
    return { ratio: number(item.ratio), callVolume: number(item.callVolume), putVolume: number(item.putVolume) }
  }
  return {
    rows: array(data.rows).map(item => {
      const row = record(item)
      return { date: text(row.date), total: ratio(row.total), equity: ratio(row.equity), index: ratio(row.index) }
    }),
    spy: array(data.spy).map(item => {
      const point = record(item)
      return { date: text(point.date), close: number(point.close) }
    }),
    asOf: text(data.asOf), source: text(data.source), sourceUrl: text(data.sourceUrl), fetchedAt: text(data.fetchedAt),
    requestedDays: number(data.requestedDays), missingDays: number(data.missingDays),
  }
}
