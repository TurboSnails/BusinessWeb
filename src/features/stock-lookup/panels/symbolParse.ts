import { loadCompanies, type Market } from '../../../data/companies'
import { companyPath } from '../../../data/siteMap'
import type { LookupMarket } from '../types'

export interface ParsedSymbol {
  symbol: string
  market: LookupMarket
  /** 公司库用的裸代码：美股 MRVL；港股 00700；沪深 600519 */
  code: string
}

/** 统一代码：美股裸代码；港股 hk00700；沪深 sh600519 / sz000858 */
export function parseLookupSymbol(raw: string): ParsedSymbol | null {
  const s = raw.trim()
  if (!s) return null
  const lower = s.toLowerCase()
  if (/^(sh|sz)\d{6}$/.test(lower)) {
    return { symbol: lower, market: 'cn', code: lower.slice(2) }
  }
  if (/^hk\d{1,5}$/.test(lower)) {
    const digits = lower.slice(2).padStart(5, '0')
    return { symbol: `hk${digits}`, market: 'hk', code: digits }
  }
  if (/^[A-Za-z]{1,5}(\.[A-Za-z])?$/.test(s)) {
    const code = s.toUpperCase()
    return { symbol: code, market: 'us', code }
  }
  return null
}

const US_MARKETS: Market[] = ['us', 'adr', 'ndx']

/** 本站公司库是否有研究页；只读 companies.ts 的 loadCompanies */
export async function findResearchPath(lookupSymbol: string): Promise<string | null> {
  const parsed = parseLookupSymbol(lookupSymbol)
  if (!parsed) return null
  try {
    if (parsed.market === 'us') {
      for (const m of US_MARKETS) {
        const list = await loadCompanies(m)
        const hit = list.find(c => c.code.toUpperCase() === parsed.code)
        if (hit) return companyPath({ c: hit.code, m: hit.market })
      }
      return null
    }
    const list = await loadCompanies(parsed.market)
    const hit = list.find(c => {
      if (parsed.market === 'hk') {
        const a = c.code.replace(/^0+/, '')
        const b = parsed.code.replace(/^0+/, '')
        return a === b || c.code === parsed.code
      }
      return c.code === parsed.code
    })
    return hit ? companyPath({ c: hit.code, m: hit.market }) : null
  } catch {
    return null
  }
}

export const EXAMPLE_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: 'MRVL', label: 'MRVL' },
  { symbol: 'NVDA', label: 'NVDA' },
  { symbol: 'sh600519', label: '贵州茅台' },
  { symbol: 'hk00700', label: '腾讯控股' },
]
