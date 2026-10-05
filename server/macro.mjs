// 宏观快照：拉取并整理中美宏观指标。月度脚本、Vercel 函数和本地开发服务共用这一份逻辑。
// 美国：FRED 公开 CSV；KRE 对标普：雅虎财经周线；中国：国家统计局 / 人民银行数据（经东方财富数据中心）。
const FRED = id => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`
const HISTORY_MONTHS = 24
const TIMEOUT_MS = 12000 // 东方财富偶尔较慢；Vercel 函数上限已设为 30 秒
const get = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })

/** 解析 FRED CSV：跳过表头与缺失值（"."） */
export function parseCsv(text) {
  return text.trim().split('\n').slice(1)
    .map(line => line.split(','))
    .filter(([date, v]) => date && v && v !== '.' && Number.isFinite(Number(v)))
    .map(([date, v]) => [date, Number(v)])
}

/** 日度、周度数据按月取最后一个观测值 */
export function monthly(rows) {
  const byMonth = new Map()
  for (const row of rows) byMonth.set(row[0].slice(0, 7), row)
  return [...byMonth.values()]
}

/** 同比：与 12 个月前的同月比较 */
export function yoy(rows) {
  const m = monthly(rows)
  const index = new Map(m.map(([d, v]) => [d.slice(0, 7), v]))
  return m.flatMap(([d, v]) => {
    const prev = index.get(`${Number(d.slice(0, 4)) - 1}${d.slice(4, 7)}`)
    return prev ? [[d, round((v / prev - 1) * 100, 2)]] : []
  })
}

/** 距窗口内最高点的回撤（正数，%） */
export function drawdown(rows) {
  let peak = -Infinity
  return rows.map(([d, v]) => { peak = Math.max(peak, v); return [d, round((1 - v / peak) * 100, 2)] })
}

/** 两个月度序列按月对齐相减 */
export function subtract(a, b) {
  const bm = new Map(monthly(b).map(([d, v]) => [d.slice(0, 7), v]))
  return monthly(a).flatMap(([d, v]) => (bm.has(d.slice(0, 7)) ? [[d, round(v - bm.get(d.slice(0, 7)), 2)]] : []))
}

export const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n
const scale = (rows, k, n = 2) => rows.map(([d, v]) => [d, round(v * k, n)])

async function fetchSeries(id) {
  const res = await get(FRED(id))
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`)
  const rows = parseCsv(await res.text())
  if (!rows.length) throw new Error(`${id}: 无数据`)
  return rows
}

function pack(rows, meta) {
  const latest = rows[rows.length - 1]
  const history = monthly(rows).slice(-HISTORY_MONTHS)
  return { ...meta, latest: { date: latest[0], value: latest[1] }, history }
}

/** 连续多少周 a 的周涨幅低于 b（从最近一周往前数） */
export function underperformStreak(a, b) {
  const bm = new Map(b.map(([d, v]) => [d, v]))
  const pairs = a.filter(([d]) => bm.has(d)).map(([d, v]) => [v, bm.get(d)])
  let streak = 0
  for (let i = pairs.length - 1; i > 0; i--) {
    const ra = pairs[i][0] / pairs[i - 1][0] - 1
    const rb = pairs[i][1] / pairs[i - 1][1] - 1
    if (ra < rb) streak++
    else break
  }
  return streak
}

async function yahooWeekly(symbol) {
  const res = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1wk`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`)
  const r = (await res.json()).chart.result[0]
  const close = r.indicators.quote[0].close
  // 只用已收盘的完整周，去掉本周未完成的最后一根
  return r.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), close[i]]).filter(([, v]) => v !== null).slice(0, -1)
}

async function eastmoney(reportName, sortColumn = 'REPORT_DATE', pageSize = 30) {
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=${reportName}&columns=ALL&sortColumns=${sortColumn}&sortTypes=-1&pageSize=${pageSize}&pageNumber=1`
  const res = await get(url)
  const body = await res.json()
  if (!body.success || !body.result?.data?.length) throw new Error(`${reportName}: ${body.message || '无数据'}`)
  return body.result.data.reverse()
}
const emRows = (data, field, dateField = 'REPORT_DATE') => data.filter(d => d[field] !== null && d[field] !== undefined).map(d => [d[dateField].slice(0, 10), Number(d[field])])

/** 并行拉取各项；失败的保留旧值（没有旧值就跳过，并记录原因） */
async function collect(builders, previous, warnings) {
  const entries = Object.entries(builders)
  const results = await Promise.allSettled(entries.map(([, build]) => build()))
  const out = {}
  results.forEach((r, i) => {
    const key = entries[i][0]
    if (r.status === 'fulfilled') { out[key] = r.value; return }
    if (previous?.[key]) out[key] = previous[key]
    warnings.push(`${key}：${r.reason?.message ?? r.reason}${previous?.[key] ? `（保留 ${previous[key].latest.date} 的旧值）` : ''}`)
  })
  return out
}

export const US_SOURCE = 'FRED, Federal Reserve Bank of St. Louis；KRE/SPY：Yahoo Finance'
export const CN_SOURCE = '国家统计局、中国人民银行（经东方财富数据中心）'

/**
 * 拉取最新快照。previous 为上一次的快照（{ us, cn }），某项失败时沿用其中的旧值。
 * 返回 { us, cn, warnings }，us/cn 的结构与 public/data/macro-*.json 相同。
 */
export async function buildSnapshots(previous = null) {
  const warnings = []
  const fred = {}
  const series = id => (fred[id] ??= fetchSeries(id))
  const corePce = async () => yoy(await series('PCEPILFE'))

  const usTask = collect({
    gdp: async () => pack(await series('A191RL1Q225SBEA'), { fred: 'A191RL1Q225SBEA', unit: '%' }),
    unrate: async () => pack(await series('UNRATE'), { fred: 'UNRATE', unit: '%' }),
    sahm: async () => pack(await series('SAHMREALTIME'), { fred: 'SAHMREALTIME', unit: 'pp' }),
    claims: async () => pack(scale(await series('IC4WSA'), 1 / 10000, 1), { fred: 'IC4WSA', unit: '万人' }),
    corePce: async () => pack(await corePce(), { fred: 'PCEPILFE', unit: '%', note: '由价格指数计算同比' }),
    realRate: async () => pack(subtract(await series('FEDFUNDS'), await corePce()), { fred: 'FEDFUNDS − PCEPILFE', unit: 'pp', note: '联邦基金利率减核心 PCE 同比' }),
    curve: async () => pack(await series('T10Y2Y'), { fred: 'T10Y2Y', unit: 'pp' }),
    hy: async () => pack(scale(await series('BAMLH0A0HYM2'), 100, 0), { fred: 'BAMLH0A0HYM2', unit: 'bp' }),
    nfci: async () => pack(await series('NFCI'), { fred: 'NFCI', unit: '' }),
    vix: async () => pack(await series('VIXCLS'), { fred: 'VIXCLS', unit: '' }),
    dd: async () => pack(drawdown(await series('SP500')), { fred: 'SP500', unit: '%', note: '距 FRED 可得窗口（约十年）内最高收盘的回撤' }),
    kre: async () => {
      const [kre, spy] = await Promise.all([yahooWeekly('KRE'), yahooWeekly('SPY')])
      // 走势：每周往回算的连续跑输周数
      const history = kre.map(([d], i) => [d, underperformStreak(kre.slice(0, i + 1), spy)]).slice(-HISTORY_MONTHS * 2)
      return { fred: 'Yahoo Finance: KRE vs SPY', unit: '周', note: '区域银行 ETF 周涨幅连续低于标普 500 ETF 的周数', latest: { date: history[history.length - 1][0], value: history[history.length - 1][1] }, history }
    },
  }, previous?.us?.series, warnings)

  let pmiData
  const pmi = () => (pmiData ??= eastmoney('RPT_ECONOMY_PMI'))
  let moneyData
  const money = () => (moneyData ??= eastmoney('RPT_ECONOMY_CURRENCY_SUPPLY'))
  const cnTask = collect({
    gdp: async () => pack(emRows(await eastmoney('RPT_ECONOMY_GDP'), 'SUM_SAME'), { source: '国家统计局', unit: '%', note: '年内累计同比' }),
    pmi: async () => pack(emRows(await pmi(), 'MAKE_INDEX'), { source: '国家统计局', unit: '' }),
    nmpmi: async () => pack(emRows(await pmi(), 'NMAKE_INDEX'), { source: '国家统计局', unit: '' }),
    cpi: async () => pack(emRows(await eastmoney('RPT_ECONOMY_CPI'), 'NATIONAL_SAME'), { source: '国家统计局', unit: '%' }),
    ppi: async () => pack(emRows(await eastmoney('RPT_ECONOMY_PPI'), 'BASE_SAME'), { source: '国家统计局', unit: '%' }),
    ip: async () => pack(emRows(await eastmoney('RPT_ECONOMY_INDUS_GROW'), 'BASE_SAME'), { source: '国家统计局', unit: '%' }),
    m1m2: async () => {
      const data = await money()
      const rows = data.filter(d => d.CURRENCY_SAME !== null && d.BASIC_CURRENCY_SAME !== null).map(d => [d.REPORT_DATE.slice(0, 10), round(d.CURRENCY_SAME - d.BASIC_CURRENCY_SAME, 2)])
      return pack(rows, { source: '中国人民银行', unit: 'pp', note: 'M1 同比减 M2 同比' })
    },
    lpr: async () => pack(emRows(await eastmoney('RPTA_WEB_RATE', 'TRADE_DATE', 60), 'LPR1Y', 'TRADE_DATE'), { source: '中国人民银行', unit: '%' }),
  }, previous?.cn?.series, warnings)

  const [us, cn] = await Promise.all([usTask, cnTask])
  const fetchedAt = new Date().toISOString()
  return {
    us: { generatedAt: fetchedAt.slice(0, 10), fetchedAt, source: US_SOURCE, series: us },
    cn: { generatedAt: fetchedAt.slice(0, 10), fetchedAt, source: CN_SOURCE, series: cn },
    warnings,
  }
}

/** 本地开发（npm run dev）：/api/macro 由本机 Node 直接拉取，与线上 Vercel 函数返回同样的结构 */
export async function macroMiddleware(req, res, next) {
  if (!req.url?.startsWith('/api/macro')) return next()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  try {
    res.end(JSON.stringify(await buildSnapshots()))
  } catch {
    res.statusCode = 502
    res.end(JSON.stringify({ error: '数据源暂时不可用' }))
  }
}
