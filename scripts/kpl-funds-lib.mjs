// 资金页纯解析：金额保留元，空值保留 null；不混用不同供应商口径。
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'

export const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
export const numberOrNull = (x) => (typeof x !== 'number' && typeof x !== 'string') || String(x).trim() === '' || !Number.isFinite(Number(x)) ? null : Number(x)

/** clist 没有日期，只能在北京时间当日收盘后接纳。FORCE 仅探测，不发布。 */
export function collectionWindow(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600e3)
  const today = bj.toISOString().slice(0, 10)
  const ready = isTradingDay(today) && bj.getUTCHours() * 60 + bj.getUTCMinutes() >= 910
  return { today, ready, date: ready ? today : prevTradingDay(today) }
}

export const historyUrl = 'https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?' + new URLSearchParams({ lmt: '0', klt: '101', secid: '1.000001', secid2: '0.399001', fields1: 'f1,f2,f3,f7', fields2: 'f51,f52,f53,f54,f55,f56,f57' })
export function rankUrl(kind, direction) {
  return 'https://push2.eastmoney.com/api/qt/clist/get?' + new URLSearchParams({ fid: 'f62', po: direction === 'inflow' ? '1' : '0', pz: kind === 'stock' ? '30' : '15', pn: '1', np: '1', fltt: '2', invt: '2', fs: kind === 'stock' ? 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048' : 'm:90+t:2', fields: 'f12,f14,f2,f3,f62,f184,f66,f72,f6,f100' })
}

/** 按请求的 fields2 顺序：日期、主力、小单、中单、大单、超大单；f57 不参与计算。 */
export function parseHistory(body, date) {
  const lines = body?.data?.klines
  if (body?.rc !== 0 || !Array.isArray(lines) || !lines.length) throw new Error('资金历史为空')
  const seen = new Set()
  const rows = lines.map((line) => {
    if (typeof line !== 'string') throw new Error('资金历史格式异常')
    const f = line.split(',')
    if (f.length < 6 || !validDate(f[0]) || !isTradingDay(f[0]) || f[0] > date || seen.has(f[0])) throw new Error('资金历史日期异常')
    seen.add(f[0])
    const [main, small, medium, large, superLarge] = f.slice(1, 6).map(numberOrNull)
    // 主力应为大单与超大单之和；不符时拒绝发布，防止字段顺序变化。
    if (main !== null && large !== null && superLarge !== null && Math.abs(main - large - superLarge) > Math.max(10, Math.abs(main) * 1e-5)) throw new Error('主力资金字段口径校验失败')
    return { date: f[0], main, small, medium, large, superLarge }
  }).sort((a, b) => a.date.localeCompare(b.date))
  if (rows.at(-1).date !== date || rows.at(-1).main === null) throw new Error('资金历史尚未更新到目标交易日')
  return rows.slice(-250)
}

export function parseRanking(body, kind, direction) {
  const rows = body?.data?.diff
  const count = kind === 'stock' ? 30 : 15
  if (body?.rc !== 0 || !Array.isArray(rows) || rows.length !== count || !Number.isInteger(body.data.total) || body.data.total < count) throw new Error('资金排行条数不足')
  const seen = new Set()
  return rows.map((r, i) => {
    const main = numberOrNull(r.f62)
    if (!(kind === 'stock' ? /^\d{6}$/ : /^BK\d{4}$/).test(r.f12) || typeof r.f14 !== 'string' || !r.f14.trim() || seen.has(r.f12) || main === null) throw new Error('资金排行字段异常')
    if ((direction === 'inflow' ? main < 0 : main > 0) || (i && (direction === 'inflow' ? main > numberOrNull(rows[i - 1].f62) : main < numberOrNull(rows[i - 1].f62)))) throw new Error('资金排行顺序或方向异常')
    seen.add(r.f12)
    return { code: r.f12, name: r.f14.trim(), pct: numberOrNull(r.f3), main, mainRatio: numberOrNull(r.f184), superLarge: numberOrNull(r.f66), large: numberOrNull(r.f72), amount: numberOrNull(r.f6), industry: typeof r.f100 === 'string' && r.f100.trim() && r.f100.trim() !== '-' ? r.f100.trim() : null } // 东财用「-」表示没有
  })
}

export function buildSnapshot(raw, date, generatedAt) {
  if (!validDate(date) || !isTradingDay(date)) throw new Error('目标日期异常')
  const history = parseHistory(raw.history, date)
  return {
    version: 1, asOf: date, generatedAt, history,
    stocks: { inflow: parseRanking(raw.stockIn, 'stock', 'inflow'), outflow: parseRanking(raw.stockOut, 'stock', 'outflow') },
    industries: { inflow: parseRanking(raw.industryIn, 'industry', 'inflow'), outflow: parseRanking(raw.industryOut, 'industry', 'outflow') },
    sources: [{ label: '东方财富 · 沪深资金历史', url: historyUrl }, { label: '东方财富 · 个股资金排行', url: rankUrl('stock', 'inflow') }, { label: '东方财富 · 行业资金排行', url: rankUrl('industry', 'inflow') }],
  }
}
