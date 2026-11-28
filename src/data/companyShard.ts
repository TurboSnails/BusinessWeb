import { parseValuationDocument, type CompanyValuation } from '../features/company-valuation/model'
import type { Company, LynchInfo, Market } from './companies'

export interface CompanyShardPayload {
  market: Market
  code: string
  company: Company | null
  valuationDoc: { schemaVersion: number; asOf: string; records: unknown[] } | null
  lynch: LynchInfo | null
}

export interface CompanyShardResult {
  company: Company | null
  valuation: CompanyValuation | undefined
  lynch: LynchInfo | null
  lynchKey: string
}

const shardCache = new Map<string, Promise<CompanyShardResult | null>>()

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Vercel/Pages 对缺失 JSON 常回退 index.html 且 200：必须校验解析与字段，不能只看状态码 */
export function parseCompanyShardPayload(raw: unknown, market: Market, code: string): CompanyShardPayload | null {
  if (!isRecord(raw)) return null
  if (raw.market !== market || raw.code !== code) return null
  if (!('company' in raw) || !('valuationDoc' in raw) || !('lynch' in raw)) return null
  if (raw.company !== null && !isRecord(raw.company)) return null
  if (raw.valuationDoc !== null) {
    if (!isRecord(raw.valuationDoc) || !Array.isArray(raw.valuationDoc.records)) return null
  }
  if (raw.lynch !== null && !isRecord(raw.lynch)) return null
  return raw as unknown as CompanyShardPayload
}

function valuationFromDoc(doc: CompanyShardPayload['valuationDoc'], market: Market, code: string): CompanyValuation | undefined {
  if (!doc) return undefined
  return parseValuationDocument(doc, market).get(code)
}

async function fetchCompanyShard(market: Market, code: string): Promise<CompanyShardResult | null> {
  let response: Response
  try {
    response = await fetch(`${import.meta.env.BASE_URL}data/company/${market}/${encodeURIComponent(code)}.json`)
  } catch {
    return null
  }
  const contentType = response.headers.get('content-type') || ''
  let text: string
  try {
    text = await response.text()
  } catch {
    return null
  }
  // SPA 回退：200 + HTML / 非 JSON
  if (/text\/html/i.test(contentType) || /^\s*</.test(text)) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const payload = parseCompanyShardPayload(raw, market, code)
  if (!payload) return null
  return {
    company: payload.company,
    valuation: valuationFromDoc(payload.valuationDoc, market, code),
    lynch: payload.lynch,
    lynchKey: `${market}:${code}`,
  }
}

/** 详情页优先拉分片；失败返回 null，由调用方回退全量。VITE_DISABLE_COMPANY_SHARD=1 时强制回退（测速对照）。 */
export const loadCompanyShard = (market: Market, code: string): Promise<CompanyShardResult | null> => {
  if (import.meta.env.VITE_DISABLE_COMPANY_SHARD === '1') return Promise.resolve(null)
  const key = `${market}:${code}`
  const cached = shardCache.get(key)
  if (cached) return cached
  const pending = fetchCompanyShard(market, code).then(result => {
    if (!result && shardCache.get(key) === pending) shardCache.delete(key)
    return result
  })
  shardCache.set(key, pending)
  return pending
}

/** 测试或强制回退时清缓存 */
export const clearCompanyShardCache = (): void => { shardCache.clear() }
