import { useCallback, useEffect, useState } from 'react'

export const ETF_TECHNICAL_FILE = 'etf-technical-latest.json'

export type TechPeriod = {
  asOf: string; complete: boolean; count: number; limited?: boolean
  ma: '多头' | '空头' | '震荡' | null
  macd: '偏多' | '偏空' | null
  dif: number | null; dea: number | null; histogram: number | null
  previousHistogram?: number | null
  rsi: number | null; rsiState: '超买' | '超卖' | '中性' | null
}
export type EtfTechRecord = {
  code: string; name: string; kind: '宽基' | '策略' | '商品' | '货币' | '行业' | '债基'; group?: string
  asOf: string; navDate?: string; priceSeries: string
  sourceUrl?: string; retrievedAt?: string
  close: number; previousClose: number | null; changePct: number | null; return20SessionsPct: number | null
  day: TechPeriod; week: TechPeriod; month: TechPeriod
}
export type EtfTechFile = { asOf: string; records: EtfTechRecord[] }

let cache: Promise<Map<string, EtfTechRecord>> | null = null
export function clearEtfTechnicalCache(): void { cache = null }
export function loadEtfTechnical(): Promise<Map<string, EtfTechRecord>> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/${ETF_TECHNICAL_FILE}`, { signal: AbortSignal.timeout(15_000) })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('etf technical unavailable'))))
    .then((file: EtfTechFile) => {
      if (!file || !Array.isArray(file.records) || file.records.some(rec => !rec || !/^\d{6}$/.test(rec.code)
        || !['day', 'week', 'month'].every(k => {
          const p = rec[k as 'day' | 'week' | 'month']
          return p && typeof p.complete === 'boolean' && Number.isFinite(p.count) && p.count >= 0
        }))) throw new Error('技术快照格式不完整')
      return new Map(file.records.map(rec => [rec.code, rec]))
    })
    .catch(error => { cache = null; throw error })
  return cache
}

export function useEtfTechnicalState(): { map: Map<string, EtfTechRecord>; status: 'loading' | 'ready' | 'error'; retry(): void } {
  const [map, setMap] = useState<Map<string, EtfTechRecord>>(new Map())
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => { cache = null; setAttempt(n => n + 1) }, [])
  useEffect(() => {
    let alive = true
    setStatus('loading')
    loadEtfTechnical().then(m => { if (alive) { setMap(m); setStatus('ready') } })
      .catch(() => { if (alive) { setMap(new Map()); setStatus('error') } })
    return () => { alive = false }
  }, [attempt])
  return { map, status, retry }
}

/** 旧页面保持 Map 接口；需要错误/重试状态的页面使用状态 hook。 */
export function useEtfTechnical(): Map<string, EtfTechRecord> { return useEtfTechnicalState().map }

export const fmt = (v: number | null | undefined, digits = 2): string => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits))
