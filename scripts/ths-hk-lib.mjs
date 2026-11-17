// 同花顺 · 港股通与AH：纯解析与计算。港股交易日历和 A 股不同，这里不用 A 股 isTradingDay；
// 每个数据块只认来源自带的日期，缺失为 null，不补零、不拿更早一天顶替。

export const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
/** 数字或带千分位的数字串；null / '' / '-' 视为缺失 */
export function numberOrNull(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  if (typeof x !== 'string') return null
  const s = x.replace(/,/g, '').trim()
  if (!s || s === '-' || s === '--' || !/^-?\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}
const round = (x, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d)

/** 北京时间（港股同为 UTC+8）的日期与分钟数 */
export function bjNow(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600e3)
  return { today: bj.toISOString().slice(0, 10), minutes: bj.getUTCHours() * 60 + bj.getUTCMinutes() }
}
/** 港股 16:00 收盘、约 16:10 收市竞价结束；当天的港股行情只在 16:15 之后接纳 */
export const HK_CLOSE_MIN = 16 * 60 + 15
export function settled(date, now, closeMin) {
  const { today, minutes } = bjNow(now)
  return date < today || (date === today && minutes >= closeMin)
}

// ---------- 来源地址 ----------
const DC = 'https://datacenter-web.eastmoney.com/api/data/v1/get?'
export const SOUTH_TYPES = { all: '006', sh: '002', sz: '004' }
export const southUrl = (type, size = 500) => DC + new URLSearchParams({ reportName: 'RPT_MUTUAL_DEAL_HISTORY', columns: 'MUTUAL_TYPE,TRADE_DATE,NET_DEAL_AMT,BUY_AMT,SELL_AMT,DEAL_AMT', filter: `(MUTUAL_TYPE="${type}")`, sortColumns: 'TRADE_DATE', sortTypes: '-1', pageSize: String(size), pageNumber: '1', source: 'WEB', client: 'WEB' })
const yyyymmdd = (d) => d.replaceAll('-', '')
export const connectStatUrl = (date, lang = 'chi') => `https://www.hkex.com.hk/${lang}/csm/DailyStat/data_tab_daily_${yyyymmdd(date)}${lang === 'chi' ? 'c' : 'e'}.js`
export const HOLD_COLUMNS = 'SECURITY_CODE,SECURITY_NAME,HOLD_DATE,HOLD_SHARES,HOLD_SHARES_CHANGE,HOLD_SHARES_RATIO,HOLD_MARKET_CAP,ADD_MARKET_CAP,CLOSE_PRICE,CHANGE_RATE,INDUSTRY'
/** 东财港股通持股（MUTUAL_TYPE 002 与 004 返回同一份沪深合计数据，取 002；与 HKEX 披露核对一致） */
export const holdUrl = (date, page, size = 500) => DC + new URLSearchParams({ reportName: 'RPT_MUTUAL_STOCK_HOLDRANKS', columns: HOLD_COLUMNS, filter: `(MUTUAL_TYPE="002")(INTERVAL_TYPE="1")${date ? `(HOLD_DATE='${date}')` : ''}`, sortColumns: date ? 'HOLD_MARKET_CAP' : 'HOLD_DATE', sortTypes: '-1', pageSize: String(size), pageNumber: String(page), source: 'WEB', client: 'WEB' })
export const ahListUrl = (pn) => 'https://push2delay.eastmoney.com/api/qt/clist/get?' + new URLSearchParams({ pn: String(pn), pz: '100', po: '1', np: '1', fltt: '2', invt: '2', fid: 'f12', fs: 'b:DLMK0101', fields: 'f12,f14,f191,f192,f193' })
export const klineUrl = (secid, lmt) => 'https://push2his.eastmoney.com/api/qt/stock/kline/get?' + new URLSearchParams({ secid, klt: '101', fqt: '0', lmt: String(lmt), end: '20500101', fields1: 'f1,f2,f3', fields2: 'f51,f53' })
export const HSAHP_SECID = '100.HSAHP'
export const HSI_SECID = '100.HSI'
export const FX_SECID = '120.HKDCNYC'
export const qtUrl = (codes) => `https://qt.gtimg.cn/q=${codes.join(',')}`
export const dayQuoteUrl = (date) => `https://www.hkex.com.hk/chi/stat/smstat/dayquot/d${yyyymmdd(date).slice(2)}c.htm`

// ---------- 南向资金 ----------
/** 东财港股通成交历史：金额单位百万港元（与 HKEX 港股通每日统计逐数一致）。返回升序。 */
export function parseSouthHistory(bodies, limit = 500) {
  const byDate = new Map()
  for (const [key, type] of Object.entries(SOUTH_TYPES)) {
    const rows = bodies[key]?.result?.data
    if (bodies[key]?.success !== true || !Array.isArray(rows) || !rows.length) throw new Error(`南向成交历史为空：${key}`)
    for (const r of rows) {
      const date = typeof r.TRADE_DATE === 'string' ? r.TRADE_DATE.slice(0, 10) : null
      if (r.MUTUAL_TYPE !== type || !validDate(date)) throw new Error('南向成交历史字段异常')
      const net = numberOrNull(r.NET_DEAL_AMT), buy = numberOrNull(r.BUY_AMT), sell = numberOrNull(r.SELL_AMT)
      // 净买入应等于买入减卖出，防止字段含义变化
      if (net !== null && buy !== null && sell !== null && Math.abs(net - (buy - sell)) > 0.05) throw new Error('南向净买入口径校验失败')
      const row = byDate.get(date) ?? { date, net: null, netSh: null, netSz: null, buy: null, sell: null, turnover: null }
      if (key === 'all') Object.assign(row, { net: round(net), buy: round(buy), sell: round(sell), turnover: round(numberOrNull(r.DEAL_AMT)) })
      else row[key === 'sh' ? 'netSh' : 'netSz'] = round(net)
      byDate.set(date, row)
    }
  }
  const out = [...byDate.values()].filter(r => r.net !== null || r.netSh !== null || r.netSz !== null).sort((a, b) => a.date.localeCompare(b.date))
  if (!out.length || out.at(-1).net === null) throw new Error('南向成交最新日缺少合计')
  return out.slice(-limit)
}

/** HKEX 港股通每日统计（JS 文件里的 tabData 数组）。休市日 tradingDay=0 返回 null。中文名为空（新股常见）时用英文版同代码的名称。 */
export function parseConnectStat(text, date, english = null) {
  const en = english ? parseConnectStat(english, date) : null
  if (typeof text !== 'string' || !/^\s*tabData\s*=/.test(text)) throw new Error('HKEX 每日统计格式异常')
  const arr = JSON.parse(text.replace(/^\s*tabData\s*=\s*/, '').replace(/;\s*$/, ''))
  const pick = (market) => {
    const m = arr.find(x => x.market === market)
    if (!m || m.date !== date) throw new Error(`HKEX 每日统计日期不符：${market}`)
    if (m.tradingDay !== 1) return null
    const sum = m.content.find(c => c.table?.classname === 'tradingTable')?.table
    const top = m.content.find(c => c.table?.classname === 'top10Table')?.table
    const schema = sum?.schema?.[0]
    const val = (name) => { const i = schema?.indexOf(name); return i >= 0 ? numberOrNull(sum.tr[i]?.td?.[0]?.[0]) : null }
    const head = top?.schema?.[0]
    if (!schema || !Array.isArray(head) || head.join('|') !== 'Rank|Stock Code|Stock Name|Buy Turnover|Sell Turnover|Total Turnover') throw new Error('HKEX 十大成交股表头变化')
    const top10 = top.tr.map(t => {
      const [rank, code, name, buy, sell, total] = t.td[0]
      const b = numberOrNull(buy), s = numberOrNull(sell)
      if (!/^\d{5}$/.test(code)) throw new Error('HKEX 十大成交股代码异常')
      const zh = String(name).normalize('NFKC').replace(/\s+/g, '')
      const alt = en?.[market === 'SSE Southbound' ? 'sh' : 'sz']?.top10.find(x => x.code === code)?.name
      return { rank: Number(rank), code, name: zh || alt || code, buy: b, sell: s, total: numberOrNull(total), net: b === null || s === null ? null : b - s }
    })
    if (top10.length !== 10) throw new Error('HKEX 十大成交股条数异常')
    return { turnover: val('Total Turnover'), buy: val('Buy Turnover'), sell: val('Sell Turnover'), top10 }
  }
  const sh = pick('SSE Southbound'), sz = pick('SZSE Southbound')
  return sh || sz ? { date, sh, sz } : null
}

/** 南向块：EM 历史 + HKEX 十大成交股；同一天两个来源的成交额必须对得上 */
export function buildSouth(history, stat) {
  const last = history.at(-1)
  if (!stat || stat.date !== last.date) throw new Error('HKEX 十大成交股与东财历史日期不一致')
  const sum = (stat.sh?.turnover ?? 0) + (stat.sz?.turnover ?? 0)
  if (last.turnover !== null && Math.abs(sum - last.turnover) > 1) throw new Error('HKEX 与东财南向成交额对不上')
  return { asOf: last.date, history, top10: { sh: stat.sh?.top10 ?? null, sz: stat.sz?.top10 ?? null } }
}

// ---------- 港股通持股 ----------
export function latestHoldDate(body) {
  const d = body?.result?.data?.[0]?.HOLD_DATE
  const date = typeof d === 'string' ? d.slice(0, 10) : null
  if (body?.success !== true || !validDate(date)) throw new Error('港股通持股最新日期不可得')
  return date
}
/** 持股比例变化（百分点）= 持股比例 × 当日持股变动 / 持股数（比例为占已发行股份）。小市值噪音（持股市值 < 1 亿港元）不进变化排行。 */
export function buildHoldings(pages, date, { minCap = 1e8, n = 20 } = {}) {
  const rows = pages.flatMap(p => {
    if (p?.success !== true || !Array.isArray(p.result?.data)) throw new Error('港股通持股返回异常')
    return p.result.data
  })
  const total = pages[0].result.count
  if (!Number.isInteger(total) || rows.length !== total || total < 300) throw new Error('港股通持股条数不足')
  const seen = new Set()
  const list = rows.map(r => {
    if (String(r.HOLD_DATE).slice(0, 10) !== date || !/^\d{5}$/.test(r.SECURITY_CODE) || seen.has(r.SECURITY_CODE)) throw new Error('港股通持股字段或日期异常')
    seen.add(r.SECURITY_CODE)
    const shares = numberOrNull(r.HOLD_SHARES), chg = numberOrNull(r.HOLD_SHARES_CHANGE), ratio = numberOrNull(r.HOLD_SHARES_RATIO)
    return {
      code: r.SECURITY_CODE, name: String(r.SECURITY_NAME ?? '').trim() || r.SECURITY_CODE,
      ratio, ratioChg: ratio !== null && chg !== null && shares ? round((ratio * chg) / shares, 4) : null,
      cap: numberOrNull(r.HOLD_MARKET_CAP), capChg: numberOrNull(r.ADD_MARKET_CAP), shareChg: chg,
      close: numberOrNull(r.CLOSE_PRICE), pct: round(numberOrNull(r.CHANGE_RATE)), industry: typeof r.INDUSTRY === 'string' && r.INDUSTRY.trim() && r.INDUSTRY.trim() !== '-' ? r.INDUSTRY.trim() : null,
    }
  })
  const ranked = list.filter(r => r.ratioChg !== null && r.cap !== null && r.cap >= minCap)
  const by = (f, dir) => [...ranked].sort((a, b) => (f(b) - f(a)) * dir)
  return {
    asOf: date, count: list.length,
    top: [...list].filter(r => r.cap !== null).sort((a, b) => b.cap - a.cap).slice(0, n),
    ratioUp: by(r => r.ratioChg, 1).filter(r => r.ratioChg > 0).slice(0, n),
    ratioDown: by(r => r.ratioChg, -1).filter(r => r.ratioChg < 0).slice(0, n),
  }
}

// ---------- AH 溢价 ----------
export function parseAhList(bodies) {
  const all = bodies.flatMap(b => {
    if (b?.rc !== 0 || !Array.isArray(b.data?.diff)) throw new Error('AH 列表返回异常')
    return b.data.diff
  })
  const total = bodies[0].data.total
  if (!Number.isInteger(total) || all.length !== total || total < 100) throw new Error('AH 列表条数不足')
  return all.map(r => {
    if (!/^\d{5}$/.test(r.f12) || !/^\d{6}$/.test(r.f191) || ![0, 1].includes(r.f192)) throw new Error('AH 列表字段异常')
    return { name: String(r.f193 || r.f14).trim(), hCode: r.f12, aCode: r.f191, aMarket: r.f192 === 1 ? 'sh' : 'sz' }
  })
}
export const qtCodesFor = (pairs) => pairs.flatMap(p => [`r_hk${p.hCode}`, `${p.aMarket}${p.aCode}`])

/** 腾讯行情：v_xxx="f0~f1~..."；第 3 项现价、第 30 项时间、第 32 项涨跌幅；港股第 63 项为证券类型（GP 股票 / GP-FUND 基金与杠反产品） */
export function parseQt(text) {
  const out = new Map()
  for (const m of String(text).matchAll(/v_(r_hk\d{5}|s[hz]\d{6})="([^"]*)"/g)) {
    const f = m[2].split('~')
    if (f.length < 33) continue
    const hk = m[1].startsWith('r_hk')
    const t = f[30] || ''
    const dm = hk ? t.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/) : t.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/)
    const price = numberOrNull(f[3])
    out.set(hk ? m[1].slice(2) : m[1], { price: price && price > 0 ? price : null, pct: numberOrNull(f[32]), date: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : null, minutes: dm ? Number(dm[4]) * 60 + Number(dm[5]) : null, type: hk && /^GP/.test(f[63] ?? "") ? f[63] : null })
  }
  return out
}

/** EM 日 K（fields2=f51,f53：日期、收盘）→ 升序 [{date, close}] */
export function parseKline(body) {
  const lines = body?.data?.klines
  if (body?.rc !== 0 || !Array.isArray(lines) || !lines.length) throw new Error('K 线为空')
  const out = lines.map(l => { const [date, close] = String(l).split(','); return { date, close: numberOrNull(close) } })
  if (!out.every((r, i) => validDate(r.date) && (!i || r.date > out[i - 1].date))) throw new Error('K 线日期异常')
  return out
}
/** 只保留港股交易日（恒指有 K 线的日期）；早于日历起点的部分原样保留 */
export const hkOnly = (rows, calendar) => { const set = new Set(calendar); return rows.filter(r => r.date < calendar[0] || set.has(r.date)) }
/** 当天的 K 线只在收盘后接纳 */
export const settledKline = (rows, now, closeMin) => rows.filter(r => settled(r.date, now, closeMin) && r.close !== null)

const yearsBefore = (date, y) => `${Number(date.slice(0, 4)) - y}${date.slice(4)}`
/** 恒生 AH 溢价指数统计：近 1 年 / 3 年均值与当前值所处分位（≤ 当前值的样本占比） */
export function ahIndexStats(rows) {
  const last = rows.at(-1)
  const stat = (y) => {
    const from = yearsBefore(last.date, y)
    const xs = rows.filter(r => r.date > from).map(r => r.close)
    if (rows[0].date > from) return { mean: null, pctile: null, n: xs.length }
    return { mean: round(xs.reduce((s, x) => s + x, 0) / xs.length), pctile: round((xs.filter(x => x <= last.close).length / xs.length) * 100, 1), n: xs.length }
  }
  return { close: last.close, y1: stat(1), y3: stat(3) }
}

/**
 * AH 溢价率 =（A 股价 ÷（H 股价 × 港元兑人民币中间价）− 1）× 100，正值表示 A 股比 H 股贵。
 * 目标日 = H 股报价里最多的日期；A、H 报价和汇率都必须是这一天，停牌等日期不符的个股溢价置空。
 */
export function buildAh(pairs, quotes, fx, index, now) {
  const dates = new Map()
  for (const p of pairs) { const d = quotes.get(`hk${p.hCode}`)?.date; if (d) dates.set(d, (dates.get(d) ?? 0) + 1) }
  const date = [...dates.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!validDate(date) || !settled(date, now, HK_CLOSE_MIN)) throw new Error('H 股报价未收盘或无日期')
  if (!fx || fx.date !== date || !(fx.rate > 0.5 && fx.rate < 1.2)) throw new Error('港元中间价日期与行情不一致')
  const rows = pairs.map(p => {
    const h = quotes.get(`hk${p.hCode}`), a = quotes.get(`${p.aMarket}${p.aCode}`)
    const hOk = h && h.date === date && h.price !== null
    // 目标日已过港股收盘门禁（16:15），A 股（15:00 收盘）自然已收盘
    const aOk = a && a.date === date && a.price !== null
    return {
      name: p.name, aCode: p.aCode, hCode: p.hCode,
      aPrice: aOk ? a.price : null, aPct: aOk ? round(a.pct) : null,
      hPrice: hOk ? h.price : null, hPct: hOk ? round(h.pct) : null,
      premium: aOk && hOk ? round((a.price / (h.price * fx.rate) - 1) * 100) : null,
    }
  })
  const valid = rows.filter(r => r.premium !== null).length
  if (valid < pairs.length * 0.9) throw new Error(`AH 有效报价不足：${valid}/${pairs.length}`)
  rows.sort((x, y) => (x.premium === null) - (y.premium === null) || (y.premium ?? 0) - (x.premium ?? 0))
  if (!index.length) throw new Error('恒生 AH 溢价指数为空')
  return { asOf: date, fx: { date: fx.date, rate: fx.rate }, rows, index: { asOf: index.at(-1).date, history: index, stats: ahIndexStats(index) } }
}

// ---------- 港股卖空 ----------
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 }
/**
 * HKEX 日报表（中文 big5 已解码）里的「賣空成交-每日報表」。
 * 返回 { date, market: { short, turnover, ratio }, stocks: [{ code, name, short, turnover, ratio, currency }] }，金额为该证券交易币种。
 */
export function parseShortSelling(text, date) {
  const dm = String(text).match(/DATE\s*:\s*(\d{1,2}) ([A-Z]{3}) (\d{4})/)
  const fileDate = dm ? `${dm[3]}-${String(MONTHS[dm[2]]).padStart(2, '0')}-${dm[1].padStart(2, '0')}` : null
  if (fileDate !== date) throw new Error(`日报表日期不符：${fileDate}`)
  const start = text.indexOf('name = "short_selling"')
  if (start < 0) throw new Error('日报表缺少卖空章节')
  const end = text.indexOf('<a name', start + 30)
  const sec = text.slice(start, end > 0 ? end : undefined)
  const stocks = []
  const seen = new Set()
  // 分页处行首会夹着 </font></pre><pre> 标签；非港元证券写成「%83437」或「% 9067」
  for (const raw of sec.split(/\r?\n/)) {
    const line = raw.replace(/<[^>]*>/g, '')
    const m = line.match(/^\s*([%#]?)\s*(\d{1,5})\s+(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/)
    if (!m) continue
    const code = m[2].padStart(5, '0')
    if (seen.has(code)) throw new Error('卖空个股重复')
    seen.add(code)
    const short = numberOrNull(m[5]), turnover = numberOrNull(m[7])
    stocks.push({ code, name: m[3].replace(/&amp;/g, '&').normalize('NFKC').replace(/\s+/g, '') || code, short, turnover, ratio: turnover ? round((short / turnover) * 100) : null, currency: m[1] === '%' ? 'other' : 'HKD' })
  }
  const c = sec.slice(sec.search(/（C）|\(C\)/))
  const short = numberOrNull(c.match(/HKD[\s\u3000]*([\d,]+)/u)?.[1])
  const turnover = numberOrNull(c.match(/(?:市場總成交|Total market turnover)[^\n]*?HKD[\s\u3000]*([\d,]+)/u)?.[1])
  // 与报表自己的「錄得賣空交易之證券（所有證券）數目」核对，防止漏行
  const reported = numberOrNull(sec.match(/(?:錄得賣空交易之證券（所有證券）數目|Total No\. of all Securities recording Short Selling)[^\n]*?([\d,]+)\s*$/mu)?.[1])
  if (stocks.length < 200 || short === null || !turnover) throw new Error('卖空章节解析不完整')
  if (reported !== stocks.length) throw new Error(`卖空个股数与报表不符：解析 ${stocks.length}，报表 ${reported}`)
  return { date, market: { short, turnover, ratio: round((short / turnover) * 100) }, stocks }
}
/** 存档用：只留港元证券的卖空比例（%） */
export const compactShort = (day) => ({ date: day.date, market: day.market, ratios: Object.fromEntries(day.stocks.filter(s => s.currency === 'HKD' && s.ratio !== null).map(s => [s.code, s.ratio])) })

/**
 * 卖空比例分位标签（自定义阈值）：取该股最近 90 个出现在卖空报表的港股交易日（含当天），
 * 当天比例的分位 ≥ 80 为「较高」、≤ 20 为「较低」，其余「正常」；样本少于 20 日不标。
 */
export function shortLabel(samples, current, { min = 20 } = {}) {
  if (current === null || samples.length < min) return { pctile: null, label: null, n: samples.length }
  const p = round((samples.filter(x => x <= current).length / samples.length) * 100, 1)
  return { pctile: p, label: p >= 80 ? '较高' : p <= 20 ? '较低' : '正常', n: samples.length }
}
/** 排行候选：港元证券、成交额 ≥ 1 亿港元（再用证券类型去掉 ETF、杠杆及反向产品） */
export const shortCandidates = (day, minTurnover = 1e8) => day.stocks.filter(s => s.currency === 'HKD' && s.turnover !== null && s.turnover >= minTurnover && s.ratio !== null).map(s => s.code)
/** 卖空块：当天股票（types 里为 GP 的候选）按卖空比例排序 Top N，叠加历史分位；全市场卖空占比走势 */
export function buildShort(day, store, types, { minTurnover = 1e8, n = 30, window = 90 } = {}) {
  const days = [...store.filter(d => d.date < day.date), compactShort(day)].sort((a, b) => a.date.localeCompare(b.date)).slice(-window)
  const cand = new Set(shortCandidates(day, minTurnover))
  if (![...cand].some(c => types.has(c))) throw new Error('证券类型不可得')
  const top = day.stocks.filter(s => cand.has(s.code) && types.get(s.code) === 'GP')
    .sort((a, b) => b.ratio - a.ratio).slice(0, n)
    .map(s => {
      const samples = days.map(d => d.ratios[s.code]).filter(x => typeof x === 'number')
      return { code: s.code, name: s.name, short: s.short, turnover: s.turnover, ratio: s.ratio, ...shortLabel(samples, s.ratio) }
    })
  return { asOf: day.date, market: day.market, history: days.map(d => ({ date: d.date, ratio: d.market.ratio, short: d.market.short, turnover: d.market.turnover })), since: days[0].date, top }
}
