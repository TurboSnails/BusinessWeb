import { useEffect, useState } from 'react'

export const ETF_TECHNICAL_FILE = 'etf-technical-2026-10-21.json'

export type TechPeriod = {
  asOf: string; complete: boolean; count: number; limited?: boolean
  ma: '多头' | '空头' | '震荡' | null
  macd: '偏多' | '偏空' | null
  dif: number | null; dea: number | null; histogram: number | null
  rsi: number | null; rsiState: '超买' | '超卖' | '中性' | null
}
export type EtfTechRecord = {
  code: string; name: string; kind: '宽基' | '策略' | '商品' | '货币' | '行业' | '债基'; group?: string
  asOf: string; navDate?: string; priceSeries: string
  close: number; previousClose: number | null; changePct: number | null; return20SessionsPct: number | null
  day: TechPeriod; week: TechPeriod; month: TechPeriod
}
export type EtfTechFile = { asOf: string; records: EtfTechRecord[] }

let cache: Promise<Map<string, EtfTechRecord>> | null = null
export function loadEtfTechnical(): Promise<Map<string, EtfTechRecord>> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/${ETF_TECHNICAL_FILE}`)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('etf technical unavailable'))))
    .then((file: EtfTechFile) => new Map(file.records.map(rec => [rec.code, rec])))
    .catch(() => { cache = null; return new Map<string, EtfTechRecord>() })
  return cache
}

/** 取不到数据时返回空 Map，页面显示「—」而不报错 */
export function useEtfTechnical(): Map<string, EtfTechRecord> {
  const [map, setMap] = useState<Map<string, EtfTechRecord>>(new Map())
  useEffect(() => {
    let alive = true
    loadEtfTechnical().then(m => { if (alive) setMap(m) })
    return () => { alive = false }
  }, [])
  return map
}

export const fmt = (v: number | null | undefined, digits = 2): string => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits))
