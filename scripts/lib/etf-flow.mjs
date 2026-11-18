// ETF 资金净流入：同花顺行情 gateway「全市场 ETF 申购净流入」历史序列 + 上证指数日 K。
// 口径来自公开 H5（sjdp_etf_capital）；本站重写采集与展示，不连朋友服务。
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1'
const DAY = 86400

async function request(url, { headers = {}, retries = 3, timeoutMs = 25000, fetchImpl = fetch } = {}) {
  let lastError
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': UA, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (error) {
      lastError = error
      if (attempt === retries) throw error
    }
  }
  throw lastError
}

export function beijingDayUnix(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 0, 0, 0) / 1000 - 8 * 3600
}

export function secToBeijingDate(sec) {
  return new Date((Number(sec) + 8 * 3600) * 1000).toISOString().slice(0, 10)
}

export const toYi = yuan => Number((yuan / 1e8).toFixed(2))

export function parseFlowGateway(json) {
  if (json?.status_code !== 0) return []
  const tr = json?.data?.time_range
  const vals = json?.data?.data?.[0]?.values?.[0]?.values
  if (!Array.isArray(tr) || !Array.isArray(vals)) return []
  const out = []
  for (let i = 0; i < tr.length; i += 1) {
    const sec = Number(tr[i])
    if (!Number.isFinite(sec)) continue
    const v = vals[i]
    out.push({ date: secToBeijingDate(sec), yuan: v == null ? null : Number(v) })
  }
  return out
}

export function parseSinaKline(rows) {
  const m = new Map()
  for (const r of Array.isArray(rows) ? rows : []) {
    const day = String(r?.day ?? '').slice(0, 10)
    const close = Number(r?.close)
    if (day && close > 0) m.set(day, close)
  }
  return m
}

export function mergeSeries(allRows, broadRows = [], indexMap = new Map()) {
  const broadByDate = new Map(broadRows.filter(r => r.yuan != null).map(r => [r.date, toYi(r.yuan)]))
  return allRows
    .filter(r => r.yuan != null)
    .map(r => ({
      date: r.date,
      flow_all: toYi(r.yuan),
      flow_broad: broadByDate.has(r.date) ? broadByDate.get(r.date) : null,
      index: indexMap.get(r.date) ?? null,
    }))
}

export function cumulative(values, n) {
  return values.slice(-n).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
}

export function kpiOf(series, key) {
  const vals = series.map(s => s[key]).filter(v => v != null)
  return { yesterday: series.at(-1)?.[key] ?? 0, cum60: Number(cumulative(vals, 60).toFixed(2)) }
}

const FLOW_CODE = '48%3A883957'
export const FLOW_INDEX_ALL = 'a_etf_total_net_buy_flow_amount'
export const FLOW_INDEX_BROAD = 'broad_etf_total_net_buy_flow_amount'
const FLOW_URL = (index, start, end) =>
  'https://fund.10jqka.com.cn/quotation/data/query/gateway/cache/v2/line'
  + `/${FLOW_CODE}/${index}/DAY_1/${start}/${end}/-150`
const SINA_KLINE = datalen =>
  'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData'
  + `?symbol=sh000001&scale=240&ma=no&datalen=${datalen}`

export async function fetchFlowHistory({ startDate, endDate, index = FLOW_INDEX_ALL, fetchImpl = fetch } = {}) {
  const start = beijingDayUnix(startDate)
  const end = beijingDayUnix(endDate) + DAY
  const json = await request(FLOW_URL(index, start, end), { headers: { Referer: 'https://fund.10jqka.com.cn/' }, fetchImpl })
  return parseFlowGateway(json)
}

export async function fetchIndexHistory({ datalen = 3200, fetchImpl = fetch } = {}) {
  try {
    const rows = await request(SINA_KLINE(datalen), { fetchImpl })
    return parseSinaKline(rows)
  } catch {
    return new Map()
  }
}
