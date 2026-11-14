// HKEX 公开行情数据访问（港交所官网「證券價格 › 股本證券」报价页使用的同一 widget 接口）。
//
// 流程：
//   1) GET 报价页 https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=<code>&sc_lang=en，
//      页面脚本里 `LabCI.getToken = function () { //return "..."; return "<TOKEN>"; }` 的非注释返回值即访问令牌（已 URL 编码）。
//   2) GET https://www1.hkex.com.hk/hkexwidget/data/getequityquote?sym=<无前导零代码>&token=<TOKEN>&lang=chn|eng&qid=<n>&callback=<cb>
//      （Referer: https://www.hkex.com.hk/）→ JSONP `cb({...})`，data.quote 带恒生行业分类（HSICS，恒生指数有限公司提供）与报价/估值字段。
//
// 约定：令牌进程内缓存，403/401/空令牌时刷新一次后重试；全部请求经同一节流器（并发 ≤2、两次请求间隔 ≥ minIntervalMs）。
// 解析函数是纯函数，单元测试用固定样本（scripts/lib/hkex.test.mjs），不触网。
// 港交所页面声明：转发恒生行业分类资料前须与恒生指数有限公司签订使用权协议——本仓库只用于内部板块口径核对与证据留存。

export const HKEX_QUOTE_PAGE = 'https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote'
export const HKEX_WIDGET_QUOTE = 'https://www1.hkex.com.hk/hkexwidget/data/getequityquote'
const UA = 'Mozilla/5.0'
const REFERER = 'https://www.hkex.com.hk/'

export class HkexError extends Error {
  constructor(message, { status, code, cause } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'HkexError'
    if (status !== undefined) this.status = status
    if (code !== undefined) this.code = code
  }
}

/** 页面 HTML → 令牌。去掉 `//` 行注释后取 getToken 函数体里第一个 return "..."。 */
export function extractToken(html) {
  const m = /LabCI\.getToken\s*=\s*function\s*\(\s*\)\s*\{([\s\S]*?)\}/.exec(String(html ?? ''))
  if (!m) throw new HkexError('报价页未找到 LabCI.getToken', { code: 'TOKEN_NOT_FOUND' })
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n\r]*/g, '')
  const r = /return\s+(["'])([^"']+)\1/.exec(body)
  if (!r || !r[2].trim()) throw new HkexError('LabCI.getToken 没有非注释的返回值', { code: 'TOKEN_EMPTY' })
  return r[2].trim()
}

/** JSONP `cb({...});` → 对象；也接受纯 JSON。 */
export function parseJsonp(text) {
  const s = String(text ?? '').trim()
  if (!s) throw new HkexError('空响应', { code: 'EMPTY' })
  let json = s
  const m = /^[\w$.]+\s*\(([\s\S]*)\)\s*;?\s*$/.exec(s)
  if (m) json = m[1]
  try {
    return JSON.parse(json)
  } catch (cause) {
    throw new HkexError(`JSONP 解析失败：${s.slice(0, 80)}`, { code: 'BAD_JSONP', cause })
  }
}

/** '00066' / '66' / 66 → '66'（接口要求无前导零）。 */
export function widgetSymbol(code) {
  const s = String(code ?? '').trim().replace(/\.HK$/i, '')
  if (!/^\d{1,5}$/.test(s) || Number(s) === 0) throw new HkexError(`港股代码无效：${code}`, { code: 'BAD_SYMBOL' })
  return String(Number(s))
}

const EMPTY = new Set(['', '-', '--', 'N/A', 'NA', 'null', 'undefined'])
/** '1,234.5' / '12.3%' / '3.45B' → number；空值/占位 → null。带 K/M/B/T 后缀时按倍数换算。 */
export function toNumber(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim().replace(/,/g, '').replace(/%$/, '')
  if (EMPTY.has(s)) return null
  const m = /^(-?\d+(?:\.\d+)?)\s*([KMBT])?$/i.exec(s)
  if (!m) return null
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || '').toUpperCase()] ?? 1
  return Number(m[1]) * mult
}
const str = v => (v === null || v === undefined || EMPTY.has(String(v).trim()) ? null : String(v).trim())

/**
 * HSICS 字段 → { industry, sector, subSector, label }。
 * hsic_ind_classification 形如「非必需性消费 - 旅游及消闲设施」（行业 - 业务类别）；
 * 偶见三段式「行业 - 业务类别 - 子业务类别」，此时第三段作 subSector 兜底。
 */
export function parseHsics(indText, subText) {
  const ind = str(indText)
  if (!ind) return null
  const parts = ind.split(/\s+-\s+/).map(x => x.trim()).filter(Boolean)
  const industry = parts[0] ?? null
  const sector = parts[1] ?? null
  const subSector = str(subText) ?? parts[2] ?? null
  return { industry, sector, subSector, label: [industry, sector, subSector].filter(Boolean).join(' - ') }
}

/** getequityquote 响应 → 规范化报价。未知/新增字段原样保留在 raw。 */
export function mapEquityQuote(payload) {
  const data = payload?.data
  if (!data || typeof data !== 'object') throw new HkexError('响应缺少 data', { code: 'NO_DATA' })
  if (data.responsecode !== undefined && String(data.responsecode) !== '000') {
    throw new HkexError(`接口返回 responsecode=${data.responsecode} ${data.responsemsg ?? ''}`.trim(), { code: 'RESPONSE_CODE' })
  }
  const q = data.quote
  if (!q || typeof q !== 'object') throw new HkexError('响应缺少 data.quote', { code: 'NO_QUOTE' })
  return {
    symbol: str(q.sym),
    name: str(q.nm),
    nameShort: str(q.nm_s),
    currency: str(q.ccy),
    last: toNumber(q.ls),
    prevClose: toNumber(q.hc),
    open: toNumber(q.op),
    high: toNumber(q.hi),
    low: toNumber(q.lo),
    high52w: toNumber(q.hi52),
    low52w: toNumber(q.lo52),
    change: toNumber(q.nc),
    changePct: toNumber(q.pc),
    volume: str(q.vo),
    volumeUnit: str(q.vo_u), // M = 百万股
    turnover: str(q.am),
    turnoverUnit: str(q.am_u), // B = 十亿港元
    marketCap: str(q.mkt_cap),
    marketCapUnit: str(q.mkt_cap_u),
    pe: toNumber(q.pe),
    eps: toNumber(q.eps),
    epsCurrency: str(q.eps_ccy),
    dividendYield: toNumber(q.div_yied ?? q.div_yield),
    lotSize: toNumber(q.lot),
    listingDate: str(q.listing_date),
    issuedShares: str(q.amt_os),
    hsics: parseHsics(q.hsic_ind_classification, q.hsic_sub_sector_classification),
    updateTime: str(q.updatetime),
    raw: q,
  }
}

/** 节流器：最多 concurrency 个并发，相邻两次启动间隔 ≥ minIntervalMs。 */
export function createThrottle({ concurrency = 2, minIntervalMs = 800 } = {}) {
  const limit = Math.max(1, Math.min(2, concurrency))
  let active = 0
  let last = 0
  const queue = []
  const pump = () => {
    if (active >= limit || !queue.length) return
    const wait = Math.max(0, last + minIntervalMs - Date.now())
    if (wait > 0) return void setTimeout(pump, wait)
    const { fn, resolve, reject } = queue.shift()
    active++
    last = Date.now()
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; pump() })
    pump()
  }
  return fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); pump() })
}

/**
 * 客户端：getToken() 缓存令牌；getEquityQuote(code, {lang}) 返回 mapEquityQuote 结果。
 * fetchImpl 可注入（测试或代理）；令牌失效（401/403、空 quote 且 responsecode 异常）时刷新一次重试。
 */
export function createHkexClient({ fetchImpl = fetch, concurrency = 2, minIntervalMs = 800, timeoutMs = 15000, tokenSymbol = '700' } = {}) {
  const throttle = createThrottle({ concurrency, minIntervalMs })
  let token = null
  let tokenPromise = null
  let qid = 0

  const get = (url, headers = {}) => throttle(async () => {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(timeoutMs) })
    const text = await res.text()
    return { status: res.status, ok: res.ok, text }
  })

  async function fetchToken() {
    const url = `${HKEX_QUOTE_PAGE}?sym=${widgetSymbol(tokenSymbol)}&sc_lang=en`
    const r = await get(url)
    if (!r.ok) throw new HkexError(`报价页 HTTP ${r.status}`, { status: r.status, code: 'TOKEN_HTTP' })
    return extractToken(r.text)
  }

  async function getToken({ refresh = false } = {}) {
    if (refresh) token = null
    if (token) return token
    if (!tokenPromise) tokenPromise = fetchToken().then(t => (token = t)).finally(() => { tokenPromise = null })
    return tokenPromise
  }

  async function getEquityQuote(code, { lang = 'chn' } = {}) {
    const sym = widgetSymbol(code)
    if (!['chn', 'eng'].includes(lang)) throw new HkexError(`lang 只能是 chn/eng：${lang}`, { code: 'BAD_LANG' })
    for (let attempt = 0; attempt < 2; attempt++) {
      const t = await getToken({ refresh: attempt > 0 })
      const cb = `cb${++qid}`
      // token 已是 URL 编码形式，原样拼接
      const url = `${HKEX_WIDGET_QUOTE}?sym=${sym}&token=${t}&lang=${lang}&qid=${qid}&callback=${cb}`
      const r = await get(url, { referer: REFERER })
      if (r.status === 401 || r.status === 403) {
        if (attempt === 0) continue
        throw new HkexError(`getequityquote HTTP ${r.status}（令牌刷新后仍被拒）`, { status: r.status, code: 'AUTH' })
      }
      if (!r.ok) throw new HkexError(`getequityquote HTTP ${r.status}`, { status: r.status, code: 'HTTP' })
      const payload = parseJsonp(r.text)
      const rc = payload?.data?.responsecode
      if (rc !== undefined && String(rc) !== '000' && attempt === 0 && !payload?.data?.quote) continue // 令牌过期常表现为非 000
      return mapEquityQuote(payload)
    }
    throw new HkexError(`getequityquote 重试后仍失败：${sym}`, { code: 'RETRY_EXHAUSTED' })
  }

  return { getToken, getEquityQuote }
}
