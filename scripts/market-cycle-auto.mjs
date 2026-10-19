// Automatic fact collection for the long-cycle board: CSI300 ERP z-score, HSI/HSTECH monthly PE,
// margin buying, FRED HKD, Yahoo CNH, SSE ETF shares. Facts only; no signals, no trading claims.
// Each source is isolated (own timeout); a failed source keeps its previous facts with the original dates.
import { readFile, writeFile, rename } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { collectHkLiquidity } from './market-cycle-liquidity.mjs'
import { collectHsiPeHistory } from './market-cycle-hk-pe-history.mjs'
import { officialMonthlyPePercentile } from './market-cycle-hk-official-pe.mjs'
import { collectCnFunding } from './market-cycle-cn-funding.mjs'
import { collectCnTurnover } from './market-cycle-cn-turnover.mjs'
import { collectHsiTurnover } from './market-cycle-hsi-turnover.mjs'

export const OUT_FILE = fileURLToPath(new URL('../public/data/market-cycle-auto.json', import.meta.url))
const XLSX_PY = fileURLToPath(new URL('./market-cycle-xlsx.py', import.meta.url))
const UA = 'Mozilla/5.0'
const MARKETS = ['csi300', 'hsi', 'hstech', 'all']
const KINDS = ['observed', 'proxy', 'backfilled']
const FREQUENCIES = ['daily', 'weekly', 'monthly']
export const MAX_PER_SERIES = 60
export const REQUEST_TIMEOUT_MS = 15000
export const SOURCE_TIMEOUT_MS = 90000
const ERP_WINDOW_YEARS = 5
const ERP_MIN_POINTS = 1000

export const URLS = {
  csindex: 'https://www.csindex.com.cn/csindex-home/perf/index-perf',
  treasury: 'https://datacenter-web.eastmoney.com/api/data/v1/get',
  hsi: 'https://www.hsi.com.hk/content/dam/wpb/hsil/index_operation/historical_pe/en_hk/hsi/hsi.xlsx',
  hstech: 'https://www.hsi.com.hk/content/dam/wpb/hsil/index_operation/historical_pe/en_hk/hstech/hstech.xlsx',
  margin: 'https://datacenter-web.eastmoney.com/api/data/v1/get',
  fredHkd: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXHKUS',
  yahooCnh: 'https://query1.finance.yahoo.com/v8/finance/chart/CNH=X',
  sseEtf: 'https://query.sse.com.cn/commonQuery.do',
  southbound: 'https://datacenter-web.eastmoney.com/api/data/v1/get',
}
// Names are checked against the SSE response so a re-used code cannot silently change meaning.
export const ETF_WHITELIST = [
  { code: '510300', name: '300ETF', market: 'csi300', label: '华泰柏瑞沪深300ETF' },
  { code: '510310', name: 'HS300ETF', market: 'csi300', label: '易方达沪深300ETF' },
  { code: '510330', name: '华夏300', market: 'csi300', label: '华夏沪深300ETF' },
  { code: '513660', name: '恒生通', market: 'hsi', label: '华夏恒生ETF(港股通)' },
  { code: '513130', name: '恒生科技', market: 'hstech', label: '华泰柏瑞恒生科技ETF' },
  { code: '513180', name: '恒指科技', market: 'hstech', label: '华夏恒生科技ETF' },
]

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(s) && !Number.isNaN(Date.parse(s))
const addDays = (date, n) => new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10)
const compact = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
const errText = e => (e instanceof Error ? e.message : String(e)).slice(0, 200)
const round = (n, d = 4) => Number(n.toFixed(d))

/** Returns an error string, or null when the fact satisfies the data contract. */
export function factProblem(f, now = new Date().toISOString()) {
  if (!f || typeof f !== 'object') return '不是对象'
  if (typeof f.metricId !== 'string' || !/^[a-z0-9_]+$/.test(f.metricId)) return 'metricId无效'
  if (!MARKETS.includes(f.market)) return 'market无效'
  if (typeof f.value !== 'number' || !Number.isFinite(f.value)) return 'value非有限数'
  if (!isDate(f.observationDate)) return 'observationDate无效'
  if (f.observationDate > now.slice(0, 10)) return 'observationDate晚于抓取日期'
  if (f.availableAt !== null && !isIso(f.availableAt)) return 'availableAt无效'
  if (!isIso(f.firstSeenAt) || !isIso(f.fetchedAt)) return 'firstSeenAt/fetchedAt无效'
  if (!(Date.parse(f.firstSeenAt) <= Date.parse(f.fetchedAt) && Date.parse(f.fetchedAt) <= Date.parse(now))) return '需满足firstSeenAt<=fetchedAt<=now'
  if (typeof f.source !== 'string' || !/^https:\/\/[^\s]+$/.test(f.source)) return 'source不是https URL'
  if (typeof f.unit !== 'string' || !f.unit) return 'unit缺失'
  if (!KINDS.includes(f.kind)) return 'kind无效'
  if (!FREQUENCIES.includes(f.frequency)) return 'frequency无效'
  if (typeof f.description !== 'string' || !f.description) return 'description缺失'
  return null
}

const seriesKey = f => `${f.metricId}|${f.market}`
const factKey = f => `${seriesKey(f)}|${f.observationDate}`

/** Same metric+market+date+value keeps the old firstSeenAt; a changed value is a new sighting. Old dates are retained (bounded). */
export function mergeFacts(previous, fresh) {
  const byKey = new Map(previous.map(f => [factKey(f), f]))
  for (const f of fresh) {
    const old = byKey.get(factKey(f))
    byKey.set(factKey(f), old && old.value === f.value ? { ...f, firstSeenAt: old.firstSeenAt } : f)
  }
  const groups = new Map()
  for (const f of byKey.values()) groups.set(seriesKey(f), [...(groups.get(seriesKey(f)) ?? []), f])
  return [...groups.values()].flatMap(list => list.sort((a, b) => b.observationDate.localeCompare(a.observationDate)).slice(0, MAX_PER_SERIES).reverse())
    .sort((a, b) => seriesKey(a).localeCompare(seriesKey(b)) || a.observationDate.localeCompare(b.observationDate))
}

// ---------- network ----------
function raceAbort(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('请求超时'))
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}
// One gate for the entire snapshot, including helpers that issue their own Promise.all.
// An aborted queue entry is removed; an already started request retains its slot until
// its actual fetch/body promise settles, even if a custom fetch ignores AbortSignal.
function requestGate(limit) {
  let active = 0
  const queue = []
  const drain = () => {
    while (active < limit && queue.length) {
      const entry = queue.shift()
      entry.signal.removeEventListener('abort', entry.abort)
      if (entry.signal.aborted) { entry.reject(entry.signal.reason); continue }
      active++
      let released = false
      entry.resolve(() => { if (!released) { released = true; active--; drain() } })
    }
  }
  return { acquire: signal => new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const entry = { signal, resolve, reject, abort: () => {
      const index = queue.indexOf(entry)
      if (index >= 0) queue.splice(index, 1)
      reject(signal.reason)
    } }
    queue.push(entry)
    signal.addEventListener('abort', entry.abort, { once: true })
    drain()
  }) }
}
async function request(fetchImpl, url, { signal, headers = {}, as = 'json', timeoutMs = REQUEST_TIMEOUT_MS }, gate) {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
  const release = await gate.acquire(combined)
  return raceAbort((async () => {
    try {
      combined.throwIfAborted()
      const res = await fetchImpl(url, { signal: combined, headers: { 'User-Agent': UA, ...headers } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (as === 'buffer') return Buffer.from(await res.arrayBuffer())
      return as === 'text' ? await res.text() : await res.json()
    } finally { release() }
  })(), combined)
}

// ---------- CSI300 PE + ERP z-score ----------
export function parseCsindexPe(body) {
  const rows = body?.data
  if (!Array.isArray(rows)) throw new Error('中证返回无data数组')
  const out = []
  let previous = ''
  for (const r of rows) {
    const raw = String(r?.tradeDate)
    const date = /^\d{8}$/.test(raw) ? compact(raw) : ''
    if (!isDate(date)) throw new Error('中证日期非法')
    if (date <= previous) throw new Error('中证日期乱序或重复')
    previous = date
    if (r.peg == null) continue
    const pe = Number(r.peg)
    if (!Number.isFinite(pe) || pe <= 0 || pe > 200) throw new Error('中证PE行无效')
    out.push({ date, pe })
  }
  if (!out.length) throw new Error('中证无非空PE')
  return out
}

/** EMM00166466 = 中国10年期国债收益率(%)；映射依据见 TREASURY_NOTE。 */
export function parseTreasuryPage(body) {
  const res = body?.result
  if (!res || !Array.isArray(res.data)) throw new Error('国债返回无result.data')
  const rows = []
  for (const r of res.data) {
    const date = String(r.SOLAR_DATE ?? '').slice(0, 10)
    if (r.EMM00166466 == null) continue
    const y = Number(r.EMM00166466)
    if (!isDate(date) || !Number.isFinite(y) || y <= 0 || y > 20) throw new Error('国债行无效')
    rows.push({ date, y })
  }
  return { pages: Number(res.pages) || 1, rows }
}

export function computeErpZ(peRows, yieldRows, years = ERP_WINDOW_YEARS) {
  const yields = new Map(yieldRows.map(r => [r.date, r.y]))
  if (yields.size !== yieldRows.length) throw new Error('国债日期重复')
  if (new Set(peRows.map(r => r.date)).size !== peRows.length) throw new Error('PE日期重复')
  const joint = peRows.filter(r => yields.has(r.date)).map(r => ({ date: r.date, pe: r.pe, y: yields.get(r.date), erp: 100 / r.pe - yields.get(r.date) }))
  if (!joint.length) throw new Error('PE与国债无同日交集')
  const last = joint[joint.length - 1]
  const start = `${Number(last.date.slice(0, 4)) - years}${last.date.slice(4)}`
  const win = joint.filter(r => r.date > start)
  // Calendar 5y window: require the first joint date to sit near its start (holiday slack) and enough points.
  if (win.length < ERP_MIN_POINTS || Date.parse(win[0].date) - Date.parse(start) > 20 * 864e5) {
    throw new Error(`同日历史不足${years}年：${win[0]?.date ?? '无'}起共${win.length}点（需覆盖至${start}且≥${ERP_MIN_POINTS}点）`)
  }
  const mean = win.reduce((s, r) => s + r.erp, 0) / win.length
  const sd = Math.sqrt(win.reduce((s, r) => s + (r.erp - mean) ** 2, 0) / (win.length - 1))
  if (!(sd > 0)) throw new Error('ERP窗口标准差为0')
  return { last, z: (last.erp - mean) / sd, mean, sd, n: win.length, windowStart: win[0].date }
}

const TREASURY_NOTE = '东财RPTA_WEB_TREASURYYIELD列EMM00166466=中国国债收益率10年（字段映射见akshare bond_zh_us_rate的rename：https://raw.githubusercontent.com/akfamily/akshare/main/akshare/bond/bond_em.py ；同表美国10年列与FRED DGS10同日吻合；东财转载原值，非中债官方直连）'

async function collectCsi300(ctx) {
  const { now } = ctx
  const today = now.slice(0, 10)
  const startDate = `${Number(today.slice(0, 4)) - ERP_WINDOW_YEARS - 1}0101`
  const peUrl = `${URLS.csindex}?indexCode=000300&startDate=${startDate}&endDate=${today.replaceAll('-', '')}`
  const pe = parseCsindexPe(await ctx.get(peUrl, { headers: { Referer: 'https://www.csindex.com.cn/' } }))
  const latestPe = pe[pe.length - 1]
  const facts = [{
    metricId: 'pe', market: 'csi300', value: latestPe.pe, observationDate: latestPe.date, source: peUrl, unit: '倍', kind: 'observed', frequency: 'daily',
    description: `中证指数官网沪深300滚动市盈率(index-perf接口peg字段)；本次取到${pe.length}个非空日点，自${pe[0].date}起（探测：官方PE自2011-06-28起，历史超5年）`,
  }]
  // A treasury/ERP failure must not drop the official PE already in hand.
  try { facts.push(...await collectErp(ctx, pe, latestPe)) } catch (e) {
    const old = ctx.previous.filter(f => ['erp_z', 'erp', 'cn10y'].includes(f.metricId) && f.market === 'csi300').map(f => f.observationDate).sort().pop()
    ctx.issue(`csi300-erp: 国债/ERP失败：${errText(e)}${old ? `，保留旧值及原日期(最新观测${old})` : '，无旧值可保留'}；官方PE已保留`)
  }
  return facts
}

async function collectErp(ctx, pe, latestPe) {
  // Treasury yields, newest first, 500 rows per page (hard server cap) — page until the 5y window is covered.
  const from = addDays(`${Number(latestPe.date.slice(0, 4)) - ERP_WINDOW_YEARS}${latestPe.date.slice(4)}`, -40)
  const base = `${URLS.treasury}?reportName=RPTA_WEB_TREASURYYIELD&columns=SOLAR_DATE,EMM00166466&filter=${encodeURIComponent(`(SOLAR_DATE>='${from}')`)}&pageSize=500&sortColumns=SOLAR_DATE&sortTypes=-1&source=WEB&client=WEB`
  const yields = []
  let pages = 1
  for (let page = 1; page <= pages; page++) {
    if (page > 8) throw new Error('国债分页超过8页，放弃')
    const got = parseTreasuryPage(await ctx.get(`${base}&pageNumber=${page}`))
    pages = got.pages
    yields.push(...got.rows)
  }
  yields.sort((a, b) => a.date.localeCompare(b.date))
  const erp = computeErpZ(pe, yields)
  const d = erp.last.date
  const common = { market: 'csi300', observationDate: d, source: base, kind: 'observed', frequency: 'daily' }
  const window = `${erp.windowStart}~${d}，同日交集${erp.n}点，样本标准差(n-1)`
  return [
    { ...common, metricId: 'erp_z', value: round(erp.z), unit: 'z-score', description: `简化ERP=100/沪深300 PE−中国10年国债收益率(%)的5年滚动z-score，窗口${window}，均值${round(erp.mean, 3)}、标准差${round(erp.sd, 3)}；PE官方、国债为东财转载(${TREASURY_NOTE})` },
    { ...common, metricId: 'erp', value: round(erp.last.erp), unit: '%', description: `简化ERP=100/PE(${erp.last.pe})−10年国债(${erp.last.y}%)，同日取值；仅为简化定义，非完整风险溢价；国债为东财转载，非中债直连` },
    { ...common, metricId: 'cn10y', value: erp.last.y, unit: '%', description: `中国10年期国债收益率；${TREASURY_NOTE}` },
  ]
}

// ---------- HSI / HSTECH monthly PE ----------
function excelDate(serial) {
  return new Date(Math.round((serial - 25569) * 864e5)).toISOString().slice(0, 10)
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
function monthEnd(label) {
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(String(label).trim())
  const idx = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1
  if (idx < 0) return null
  return new Date(Date.UTC(Number(m[2]), idx + 1, 0)).toISOString().slice(0, 10)
}

/** cells: output of market-cycle-xlsx.py. header cell must name the index so a re-ordered file cannot be misread. */
export function parseHsiPe(cells, { headerCol, headerText }) {
  const header = cells.find(c => c.r === 3 && c.c === headerCol)?.v
  if (header !== headerText) throw new Error(`恒生PE表头不符：期望"${headerText}"(${headerCol}3)，实际${JSON.stringify(header)}`)
  const valueCol = headerCol === 'A' ? 'B' : headerCol
  const dates = new Map(cells.filter(c => c.c === 'A' && c.r >= 4).map(c => [c.r, typeof c.v === 'number' ? excelDate(c.v) : monthEnd(c.v)]))
  const out = []
  for (const c of cells.filter(c => c.c === valueCol && c.r >= 4)) {
    const date = dates.get(c.r)
    if (!date || typeof c.v !== 'number' || c.v <= 0 || c.v > 200) throw new Error(`恒生PE第${c.r}行无效`)
    out.push({ date, pe: c.v })
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  if (!out.length) throw new Error('恒生PE无观测行')
  return out
}

export function runXlsxParser(buffer, { timeoutMs = 20000, script = XLSX_PY } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-I', script], { stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs })
    const out = [], err = []
    child.stdout.on('data', d => out.push(d))
    child.stderr.on('data', d => err.push(d))
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`xlsx解析失败(${code}): ${Buffer.concat(err).toString().trim().slice(0, 120)}`))
      try { resolve(JSON.parse(Buffer.concat(out).toString()).cells) } catch { reject(new Error('xlsx解析输出无效')) }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(buffer)
  })
}

const hsiSource = (market, url, headerCol, headerText, name) => async ctx => {
  const buffer = await ctx.get(url, { as: 'buffer', timeoutMs: 30000 })
  if (buffer.length < 1000 || buffer.length > 5e6 || buffer.subarray(0, 2).toString() !== 'PK') throw new Error('恒生PE文件不是有效xlsx')
  const rows = parseHsiPe(await ctx.parseXlsx(buffer), { headerCol, headerText })
  const note = `${name}官方月末PE（倍）；当前XLSX覆盖${rows.length}个月（${rows[0].date}~${rows.at(-1).date}）。官方盈利口径采用最新年度业绩，指数层面为经自由流通及上限因子调整后的市值÷成分股总盈利，不标作TTM。`
  const facts = rows.map(r => ({ metricId: 'pe', market, value: r.pe, observationDate: r.date, source: url, unit: '倍', kind: 'observed', frequency: 'monthly', description: note }))
  try {
    const archive = JSON.parse(await readFile(new URL('../public/data/market-cycle-hk-pe-history.json', import.meta.url), 'utf8'))
    // Retain previously collected official months as the publisher's 12-month XLSX rolls forward.
    const accumulated = new Map((ctx.previous ?? []).filter(f => f.metricId === 'pe' && f.market === market && f.kind === 'observed' && f.source === url && f.frequency === 'monthly').map(f => [f.observationDate.slice(0, 7), { date: f.observationDate, pe: f.value }]))
    for (const row of rows) accumulated.set(row.date.slice(0, 7), row)
    const result = officialMonthlyPePercentile(archive, market, [...accumulated.values()], ctx.now.slice(0, 10))
    facts.push({ metricId: 'pe_official_5y_percentile', market, value: round(result.value, 6), observationDate: result.observationDate, source: url, unit: '%', kind: 'observed', frequency: 'monthly',
      description: `恒生官方同口径月末PE近五年中位秩分位；窗口${result.windowStart}~${result.observationDate}，${result.samples}/${result.expectedMonths}个月度样本（覆盖${(result.samples / result.expectedMonths * 100).toFixed(1)}%），缺失月份${result.missingMonths.join('、') || '无'}，未插值。以官方Monthly Roundup原始PE为历史，逐月核对与当前XLSX重叠值；同源月度采样，不与第三方日频分位混用。最新年度盈利口径与调整定义见官方运作指引10.15：https://www.hsi.com.hk/content/dam/wpb/hsil/index_operation/en_hk/index_operation_guide.pdf；逐月PDF来源和SHA256：https://turbosnails.github.io/BusinessWeb/data/market-cycle-hk-pe-history.json` })
  } catch (e) { ctx.issue(`${market}-official-pe: ${errText(e)}`) }
  return facts
}

// ---------- margin buying ----------
export function parseMargin(body) {
  const row = body?.result?.data?.[0]
  const date = String(row?.DIM_DATE ?? '').slice(0, 10)
  const yuan = Number(row?.RZMRE)
  if (row?.RZMRE == null || !isDate(date) || !Number.isFinite(yuan) || yuan <= 0) throw new Error('融资买入额行无效')
  return { date, yi: yuan / 1e8 }
}
async function collectMargin(ctx) {
  const url = `${URLS.margin}?reportName=RPTA_RZRQ_LSHJ&columns=DIM_DATE,RZMRE&pageNumber=1&pageSize=1&sortColumns=DIM_DATE&sortTypes=-1&source=WEB&client=WEB`
  const m = parseMargin(await ctx.get(url))
  return [{
    metricId: 'financing_buy', market: 'all', value: round(m.yi, 2), observationDate: m.date, source: url, unit: '亿元', kind: 'observed', frequency: 'daily',
    description: '沪深两市合计融资买入额原值(东财RPTA_RZRQ_LSHJ.RZMRE，元÷1e8)；同范围成交额分母未核定，故不计占比',
  }]
}

// ---------- HK southbound: single-channel 006 (Eastmoney 已发布的南向汇总=002+004，20天百万元值已cross-checked) ----------
// MUTUAL_TYPE="006" 是港股通(沪)+港股通(深) 的合计，已等于各 002+004 之和；HTML 页面注："资金数据默认为人民币单位"。
// AKShare stock_hsgt_em.py 同表用 NET_DEAL_AMT / 100 = 亿元；现有 macro-hk.json 20 日合计 400.1 亿元与之吻合（参考文档已下载到本机 /private/tmp/cycle-eastmoney-page.html）。
// 本采集器不复算 002+004；仅取 006 单通道的"南向资金历史走势=每日成交净买额"。
const SOUTH_TYPE = '006' // 港股通南北向汇总(S港股通+S港股通)
export function parseSouthboundPage(body, type) {
  if (body?.success !== true || !Array.isArray(body?.result?.data)) throw new Error(`南向资金 ${type}: success!=true 或 data 缺失`)
  const rows = []
  for (const r of body.result.data) {
    if (r?.MUTUAL_TYPE !== type) throw new Error(`南向资金 ${type}: 出现非本通道MUTUAL_TYPE=${r?.MUTUAL_TYPE}`)
    const raw = r?.NET_DEAL_AMT
    if (raw == null || !['number', 'string'].includes(typeof raw) || (typeof raw === 'string' && !raw.trim())) throw new Error(`南向资金 ${type}: NET_DEAL_AMT 缺失或类型无效`)
    const date = String(r?.TRADE_DATE ?? '').slice(0, 10)
    if (!isDate(date)) throw new Error(`南向资金 ${type}: 日期非法 ${r?.TRADE_DATE}`)
    const net = Number(r.NET_DEAL_AMT)
    if (!Number.isFinite(net)) throw new Error(`南向资金 ${type}: NET_DEAL_AMT 非数 ${r.NET_DEAL_AMT}`)
    rows.push({ date, net })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  for (let i = 1; i < rows.length; i++) if (rows[i].date === rows[i - 1].date) throw new Error(`南向资金 ${type}: 重复日期 ${rows[i].date}`)
  return rows
}
// Take the trailing N unique dates directly from the single-channel payload. No channel pairing. Each kept date
// is a real southbound trading day Eastmoney published, with a verified NET_DEAL_AMT (non-null finite).
export function parseSouthboundRows(rows, days = 20) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const unique = sorted.filter((r, i) => !i || sorted[i - 1].date !== r.date)
  if (unique.length < days) throw new Error(`南向资金(006): 仅${unique.length}个唯一交易日，不足${days}`)
  const window = unique.slice(-days)
  const sumMn = window.reduce((s, r) => s + r.net, 0)
  return {
    observationDate: window.at(-1).date, // 最新一日作为观测日
    windowStart: window[0].date,         // 最早一日作为窗口起点
    days: window.length,
    sumMn,
  }
}
async function collectSouthbound(ctx) {
  const base = `${URLS.southbound}?reportName=RPT_MUTUAL_DEAL_HISTORY&columns=MUTUAL_TYPE,TRADE_DATE,NET_DEAL_AMT&filter=${encodeURIComponent(`(MUTUAL_TYPE="${SOUTH_TYPE}")`)}&sortColumns=TRADE_DATE&sortTypes=-1&pageSize=30&pageNumber=1&source=WEB&client=WEB`
  const headers = { Referer: 'https://data.eastmoney.com/hsgt/index.html' }
  const body = await ctx.get(base, { headers })
  const rows = parseSouthboundPage(body, SOUTH_TYPE)
  const out = parseSouthboundRows(rows, 20)
  // 百万元 → 亿元；已核对单位（HTML "资金数据默认为人民币单位" + AKShare /100 + 与 macro-hk.json 历史 400.1 亿元一致）
  const sumYi = out.sumMn / 100
  if (!Number.isFinite(sumYi) || Math.abs(sumYi) > 3000) throw new Error(`南向资金: 20日合计异常 ${sumYi} 亿元`)
  return [{
    metricId: 'hk_south_20d', market: 'all', value: round(sumYi, 2), observationDate: out.observationDate, source: base, unit: '亿元', kind: 'observed', frequency: 'daily',
    description: `港股通南向合计（沪+深，MUTUAL_TYPE=006）近${out.days}个交易日净买入；原始单位百万元人民币÷100=亿元；窗口${out.windowStart}~${out.observationDate}。东财公开汇总，仅作全港股背景，不代表恒指或恒科成分股流入，不计票。`,
  }]
}

// ---------- FRED HKD / Yahoo CNH ----------
export function parseFredCsv(text, seriesId) {
  const lines = String(text).trim().split(/\r?\n/)
  if (!/^(observation_date|DATE),/.test(lines[0]) || !lines[0].includes(seriesId)) throw new Error(`FRED ${seriesId}返回不是CSV`)
  let last = null
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',')
    if (raw === '.' || raw === '' || raw == null) continue
    const value = Number(raw)
    if (!isDate(date) || !Number.isFinite(value)) throw new Error(`FRED ${seriesId}行无效`)
    last = { date, value }
  }
  if (!last) throw new Error(`FRED ${seriesId}无有效值`)
  return last
}
async function collectHkd(ctx) {
  const url = `${URLS.fredHkd}&cosd=${addDays(ctx.now.slice(0, 10), -45)}`
  const r = parseFredCsv(await ctx.get(url, { as: 'text' }), 'DEXHKUS')
  if (r.value < 7 || r.value > 8.5) throw new Error('港元汇率超出合理范围')
  return [{
    metricId: 'hkd', market: 'all', value: r.value, observationDate: r.date, source: url, unit: 'HKD/USD', kind: 'observed', frequency: 'daily',
    description: 'FRED DEXHKUS 港元兑美元(H.10)，每美元港元数；官方序列通常滞后约1周，保留原观测日',
  }]
}
export function parseYahooCnh(body) {
  const r = body?.chart?.result?.[0]
  if (!r) throw new Error('Yahoo CNH无结果')
  if (r.meta?.symbol !== 'CNH=X' || r.meta?.currency !== 'CNH') throw new Error(`Yahoo返回非离岸CNH：${r.meta?.symbol}/${r.meta?.currency}`)
  const ts = r.timestamp, close = r.indicators?.quote?.[0]?.close
  if (!Array.isArray(ts) || !Array.isArray(close)) throw new Error('Yahoo CNH无时间序列')
  for (let i = ts.length - 1; i >= 0; i--) {
    if (close[i] == null) continue
    const value = Number(close[i])
    if (!Number.isFinite(value) || value < 3 || value > 12) throw new Error('CNH超出合理范围')
    return { date: new Date(ts[i] * 1000).toISOString().slice(0, 10), value: round(value, 5) }
  }
  throw new Error('Yahoo CNH无有效收盘价')
}
async function collectCnh(ctx) {
  const url = `${URLS.yahooCnh}?range=10d&interval=1d`
  const r = parseYahooCnh(await ctx.get(url))
  return [{
    metricId: 'cnh', market: 'all', value: r.value, observationDate: r.date, source: url, unit: 'CNH/USD', kind: 'observed', frequency: 'daily',
    description: 'Yahoo Finance CNH=X 离岸人民币兑美元(每美元CNH，非在岸CNY，不可与CNY互换)；非官方免费源，取最近一根日线(可能为盘中价)',
  }]
}

// ---------- SSE ETF shares ----------
export function parseSseEtf(body, date) {
  if (!Array.isArray(body?.result)) throw new Error('上交所ETF返回无result')
  const facts = []
  for (const w of ETF_WHITELIST) {
    const row = body.result.find(r => r.SEC_CODE === w.code)
    if (!row) throw new Error(`上交所ETF缺少白名单产品${w.code}`)
    if (row.SEC_NAME !== w.name || row.STAT_DATE !== date) throw new Error(`上交所ETF ${w.code}名称或日期不符：${row.SEC_NAME}/${row.STAT_DATE}`)
    const value = Number(row.TOT_VOL)
    if (!Number.isFinite(value) || value <= 0) throw new Error(`上交所ETF ${w.code}份额无效`)
    facts.push({ w, value })
  }
  return facts
}
async function collectEtf(ctx) {
  let day = ctx.now.slice(0, 10)
  for (let tries = 0; tries < 7; tries++, day = addDays(day, -1)) {
    const dow = new Date(day).getUTCDay()
    if (dow === 0 || dow === 6) continue
    const url = `${URLS.sseEtf}?sqlId=COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L&STAT_DATE=${day}&pageHelp.pageSize=2000`
    const body = await ctx.get(url, { headers: { Referer: 'https://www.sse.com.cn/' } })
    if (Array.isArray(body?.result) && !body.result.length) continue // not published yet / holiday
    return parseSseEtf(body, day).map(({ w, value }) => ({
      metricId: `etf_shares_${w.code}`, market: w.market, value, observationDate: day, source: url, unit: '万份', kind: 'observed', frequency: 'daily',
      description: `上交所披露${w.label}(${w.code})总份额，单只白名单产品，不是宽基合计，不含深市产品`,
    }))
  }
  throw new Error('近7天上交所无ETF份额数据')
}

export const SOURCES = [
  { id: 'csi300-erp', produces: [['pe', 'csi300'], ['erp_z', 'csi300'], ['erp', 'csi300'], ['cn10y', 'csi300']], run: collectCsi300 },
  { id: 'hsi-pe', produces: [['pe', 'hsi'], ['pe_official_5y_percentile', 'hsi']], run: hsiSource('hsi', URLS.hsi, 'B', 'Hang Seng Index', '恒生指数') },
  { id: 'hstech-pe', produces: [['pe', 'hstech'], ['pe_official_5y_percentile', 'hstech']], run: hsiSource('hstech', URLS.hstech, 'A', 'Hang Seng TECH Index', '恒生科技指数') },
  { id: 'hsi-pe-history', produces: [['pe_history_5y_percentile', 'hsi']], run: collectHsiPeHistory },
  { id: 'margin', produces: [['financing_buy', 'all']], run: collectMargin },
  { id: 'cn-funding', produces: [['financing_buy_ratio_pct', 'csi300'], ['cn_turnover_yi', 'csi300']], run: collectCnFunding },
  { id: 'cn-turnover', produces: [['turnover_ratio_52w', 'csi300']], timeoutMs: 370000, run: ctx => collectCnTurnover(ctx, ctx.cnTurnoverOptions) },
  { id: 'fred-hkd', produces: [['hkd', 'all']], run: collectHkd },
  { id: 'yahoo-cnh', produces: [['cnh', 'all']], run: collectCnh },
  { id: 'sse-etf', produces: ETF_WHITELIST.map(w => [`etf_shares_${w.code}`, w.market]), run: collectEtf },
  { id: 'hk-south', produces: [['hk_south_20d', 'all']], run: collectSouthbound },
  { id: 'hk-liquidity', produces: [['turnover_ratio_52w', 'hstech']], run: collectHkLiquidity },
  { id: 'hsi-turnover', produces: [['index_week_daily_turnover_hkd', 'hsi'], ['turnover_ratio_52w', 'hsi']], run: ctx => collectHsiTurnover(ctx, ctx.hsiTurnoverOptions) },
]

/** Runs `tasks` with at most `limit` in flight. */
async function pool(tasks, limit) {
  const results = new Array(tasks.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) { const i = next++; results[i] = await tasks[i]() }
  }))
  return results
}

export async function buildAutoSnapshot(previous, {
  fetchImpl = fetch, now = new Date().toISOString(), parseXlsx = runXlsxParser, sources = SOURCES, concurrency = 2,
  requestTimeoutMs = REQUEST_TIMEOUT_MS, sourceTimeoutMs = SOURCE_TIMEOUT_MS, cnTurnoverOptions = {}, hsiTurnoverOptions = {},
} = {}) {
  const issues = []
  const maxConcurrency = Number.isFinite(concurrency) ? Math.max(1, Math.min(2, Math.floor(concurrency))) : 2
  const gate = requestGate(maxConcurrency)
  const kept = []
  if (previous && previous.schemaVersion !== 1) issues.push(`旧文件schemaVersion=${JSON.stringify(previous.schemaVersion)}不受支持，已忽略其全部事实`)
  for (const f of previous?.schemaVersion === 1 && Array.isArray(previous.facts) ? previous.facts : []) {
    const p = factProblem(f, now)
    if (p) issues.push(`旧数据丢弃：${f?.metricId}/${f?.market}/${f?.observationDate} ${p}`)
    else kept.push(f)
  }
  const outcomes = await pool(sources.map(src => async () => {
    const ac = new AbortController()
    const timeoutMs = src.timeoutMs ?? sourceTimeoutMs
    const timer = setTimeout(() => ac.abort(new Error(`数据源超时(${timeoutMs}ms)`)), timeoutMs)
    const ctx = {
      now, parseXlsx, signal: ac.signal, previous: kept, cnTurnoverOptions, hsiTurnoverOptions, issue: msg => issues.push(msg),
      get: (url, opts = {}) => request(fetchImpl, url, { timeoutMs: requestTimeoutMs, ...opts, signal: ac.signal }, gate),
    }
    try {
      const raw = await raceAbort(src.run(ctx), ac.signal)
      const facts = []
      for (const f of raw) {
        const full = { ...f, availableAt: null, firstSeenAt: now, fetchedAt: now }
        const p = factProblem(full, now)
        if (p) issues.push(`${src.id}: 丢弃事实 ${f.metricId}/${f.market}/${f.observationDate}：${p}`)
        else facts.push(full)
      }
      if (!facts.length) throw new Error('无有效事实')
      return facts
    } catch (e) {
      const olds = kept.filter(f => src.produces.some(([m, mk]) => m === f.metricId && mk === f.market))
      const latest = olds.map(f => f.observationDate).sort().pop()
      issues.push(`${src.id}: ${errText(e)}${latest ? `，保留旧值及原日期(最新观测${latest})` : '，无旧值可保留'}`)
      return []
    } finally { clearTimeout(timer); ac.abort(new Error('数据源已结束')) }
  }), maxConcurrency)
  return { schemaVersion: 1, generatedAt: now, facts: mergeFacts(kept, outcomes.flat()), issues }
}

/** CLI exit rule: fatal only when no valid fact survives (invalid or unsupported previous facts do not count). */
export const isFatal = result => !result.facts.length

export async function writeAtomic(file, data) {
  await writeFile(`${file}.tmp`, `${JSON.stringify(data, null, 1)}\n`)
  await rename(`${file}.tmp`, file)
}

async function main() {
  const outArg = process.argv.indexOf('--out')
  const file = outArg > 0 ? process.argv[outArg + 1] : OUT_FILE
  let previous = null
  try { previous = JSON.parse(await readFile(file, 'utf8')) } catch { /* first run */ }
  const result = await buildAutoSnapshot(previous)
  for (const i of result.issues) console.warn(`⚠ ${i}`)
  if (isFatal(result)) { console.error('全部数据源失败且无旧数据，未写入'); process.exitCode = 1; return }
  await writeAtomic(file, result)
  const latest = new Map()
  for (const f of result.facts) latest.set(`${f.metricId}/${f.market}`, f)
  for (const [k, f] of latest) console.log(`${k.padEnd(24)} ${String(f.value).padStart(12)} ${f.unit.padEnd(8)} ${f.observationDate} 抓取于${f.fetchedAt}`)
  console.log(`写入 ${file}：${result.facts.length} 条事实，${result.issues.length} 条问题`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(errText(e)); process.exitCode = 1 })
