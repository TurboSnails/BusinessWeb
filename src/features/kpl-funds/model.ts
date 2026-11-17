// 金额统一为元；缺值为 null，展示时才换算亿元。
export type FlowDay = { date: string; main: number | null; small: number | null; medium: number | null; large: number | null; superLarge: number | null }
export type FlowRow = { code: string; name: string; pct: number | null; main: number; mainRatio: number | null; superLarge: number | null; large: number | null; amount: number | null; industry: string | null }
export type Ranking = { inflow: FlowRow[]; outflow: FlowRow[] }
export type KplFundsData = { version: 1; asOf: string; generatedAt: string; history: FlowDay[]; stocks: Ranking; industries: Ranking; sources: Array<{ label: string; url: string }> }
const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const nullable = (x: unknown) => x === null || num(x)
function ranking(x: unknown, count: number, code: RegExp): boolean {
  if (!obj(x)) return false
  return ['inflow', 'outflow'].every(key => {
    const rows = x[key]
    return Array.isArray(rows) && rows.length === count && new Set(rows.map(r => obj(r) ? r.code : null)).size === count && rows.every((r, i) => obj(r) && typeof r.code === 'string' && code.test(r.code) && typeof r.name === 'string' && !!r.name.trim() && num(r.main) && (key === 'inflow' ? r.main >= 0 : r.main <= 0) && (!i || (key === 'inflow' ? r.main <= rows[i - 1].main : r.main >= rows[i - 1].main)) && ['pct', 'mainRatio', 'superLarge', 'large', 'amount'].every(k => nullable(r[k])) && (r.industry === null || typeof r.industry === 'string'))
  })
}
/** 拒绝半份数据、字符串数字、非有限数和 HTML 回退页。 */
export function asKplFunds(x: unknown): KplFundsData | null {
  if (!obj(x) || x.version !== 1 || !date(x.asOf) || typeof x.generatedAt !== 'string' || !Number.isFinite(Date.parse(x.generatedAt))) return null
  if (!Array.isArray(x.history) || !x.history.length || !x.history.every((r, i, rows) => obj(r) && date(r.date) && r.date <= String(x.asOf) && (!i || r.date > rows[i - 1].date) && ['main', 'small', 'medium', 'large', 'superLarge'].every(k => nullable(r[k]))) || x.history.at(-1)?.date !== x.asOf || !num(x.history.at(-1)?.main)) return null
  if (!ranking(x.stocks, 30, /^\d{6}$/) || !ranking(x.industries, 15, /^BK\d{4}$/)) return null
  if (!Array.isArray(x.sources) || !x.sources.length || !x.sources.every(s => obj(s) && typeof s.label === 'string' && typeof s.url === 'string' && /^https:\/\/(push2|push2his)\.eastmoney\.com\//.test(s.url))) return null
  return x as unknown as KplFundsData
}
export const money = (x: number | null): string => x === null ? '—' : `${x > 0 ? '+' : ''}${(x / 1e8).toFixed(2).replace('-', '−')} 亿`
export const percent = (x: number | null): string => x === null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(2).replace('-', '−')}%`
export const tone = (x: number | null): string => x === null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down'
