// 中国市场（A 股）补充数据：两市成交额/量比、两融、利率、宏观月频、涨跌停池、中金所基差与期权 PCR、北向成交额。
// 结构对齐 scripts/us-market-data.mjs：读取已有 JSON 作为 previous；每个来源一个 job（Promise.allSettled）；
// 失败保留旧序列并写 refreshError，成功合并历史；临时文件 + rename 落盘。纯解析函数全部导出供单元测试。
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { validDate, num, emUrl, emPaginate } from './ths-market-lib.mjs'
import { compactHistory, mergeSeries } from './us-market-data.mjs'

const OUTPUT = fileURLToPath(new URL('../public/data/cn-market-data.json', import.meta.url))

const KLINE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const CSIPERF = 'https://www.csindex.com.cn/csindex-home/perf/index-perf'
const CNINDEX = 'https://hq.cnindex.com.cn/market/market/getIndexDailyDataWithDataFormat'
const CHINABOND = 'https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery'
const CHINAMONEY = 'https://www.chinamoney.com.cn/ags/ms'
const SHIBOR_HIS = `${CHINAMONEY}/cm-u-bk-shibor/ShiborHis`
const LPR_HIS = `${CHINAMONEY}/cm-u-bk-currency/LprHis`
const POOL_U = '7eea3edcaed734bea9cbfc24409ed989'
const CFFEX = 'http://www.cffex.com.cn/sj/hqsj/rtj'
const HKEX = 'https://www.hkex.com.hk/chi/csm/DailyStat'

const AMOUNT_BEG = '20050101' // 两市成交额尽量长：2005 年起（深证综指 399106 与上证综指同日齐全）
const TEN_YEAR_BEG = 2002 // 中债国债收益率曲线起点
const SHIBOR_BEG = 2007 // Shibor 正式启用
const POOL_BACKFILL_MAX = 25 // 东财涨跌停池服务端仅保留约 1 个月
const HKEX_BACKFILL_MAX = 160 // 北向每日统计文件保留约 7 个月（实测 137 个交易日）
const DAY = 86_400_000

const meta = (name, unit, source, scope, frequency) => ({ name, unit, source, scope, frequency })
const specs = {
  cnAmount: meta('两市成交额', '亿元', 'https://quote.eastmoney.com/zs000001.html', '上证综指（000001）+ 深证综指（399106，全样本而非仅 500 只成分的深证成指）当日成交额之和；东财日 K 接口', '日频'),
  cnVolumeRatio: meta('两市成交额 20 日量比', '倍', 'https://quote.eastmoney.com/zs000001.html', '当日两市成交额 ÷ 此前 20 个交易日平均成交额；与美股 volumeRatio 同口径', '日频'),
  cnTurnover: meta('两市换手率（成交额 ÷ 流通市值）', '%', 'https://data.eastmoney.com/rzrq/total.html', '两市成交额 ÷ 沪深两市流通市值（RPTA_RZRQ_LSHJ 的 LTSZ）；流通市值 2010 年起可得', '日频'),
  cnMarginBalance: meta('两融余额（融资 + 融券）', '亿元', 'https://data.eastmoney.com/rzrq/total.html', '融资余额（RZYE）+ 融券余额（RQYE），沪深两市，2010-03-31 两融试点起', '日频'),
  cnMarginRatio: meta('融资余额 ÷ 两市流通市值', '%', 'https://data.eastmoney.com/rzrq/total.html', '融资余额（RZYE）÷ 沪深两市流通市值（LTSZ）× 100', '日频'),
  cnMarginYoy: meta('融资余额同比（月末）', '%', 'https://data.eastmoney.com/rzrq/total.html', '各月最后一个交易日的融资余额相对去年同月的增长率（同比，不用环比，避免春节季节性）', '月频'),
  cnMarginBuyShare: meta('融资买入额 ÷ 两市成交额', '%', 'https://data.eastmoney.com/rzrq/total.html', '当日融资买入额（RZMRE）÷ 当日两市成交额 × 100；常态约 6–12%', '日频'),
  cnTenYear: meta('中国 10 年期国债收益率', '%', 'https://yield.chinabond.com.cn/', '中债国债收益率曲线 10 年点，中债官网 historyQuery 为主、东财 RPTA_WEB_TREASURYYIELD 补缺', '日频'),
  cnShibor3m: meta('Shibor 3 个月', '%', 'https://www.chinamoney.com.cn/chinese/bkshibor/', '上海银行间同业拆放利率 3M，中国货币网官方历史', '日频'),
  cnLpr1y: meta('1 年期 LPR', '%', 'https://www.chinamoney.com.cn/chinese/bklpr/', '贷款市场报价利率 1 年期；中国货币网最近一年 + 东财 RPTA_WEB_RATE 全历史（2019-08 改革起）', '月频'),
  cnM1Yoy: meta('M1 同比', '%', 'https://data.eastmoney.com/cjsj/moneysupply.html', '狭义货币供应量同比增速，人民银行（东财数据中心镜像），月末值', '月频'),
  cnM2Yoy: meta('M2 同比', '%', 'https://data.eastmoney.com/cjsj/moneysupply.html', '广义货币供应量同比增速，人民银行（东财数据中心镜像），月末值', '月频'),
  cnM1M2: meta('M1 同比 − M2 同比（剪刀差）', '个百分点', 'https://data.eastmoney.com/cjsj/moneysupply.html', 'M1 同比 − M2 同比；回升代表活钱增多', '月频'),
  cnPmi: meta('制造业 PMI', '点', 'https://data.eastmoney.com/cjsj/pmi.html', '国家统计局制造业采购经理指数（东财数据中心镜像），月末值', '月频'),
  cnPpi: meta('PPI 同比', '%', 'https://data.eastmoney.com/cjsj/ppi.html', '工业生产者出厂价格指数同比（东财数据中心镜像），月末值', '月频'),
  cnLimitUp: meta('涨停家数', '家', 'https://quote.eastmoney.com/ztb/', '东财涨停池（ZTPool）当日收录家数，逐日积累（东财仅保留近约 1 个月，更早日期无法回补）', '日频'),
  cnLimitDown: meta('跌停家数', '家', 'https://quote.eastmoney.com/ztb/', '东财跌停池（DTPool）当日收录家数，逐日积累', '日频'),
  cnBrokenBoards: meta('炸板家数', '家', 'https://quote.eastmoney.com/ztb/', '东财炸板池（ZBPool）当日收录家数，逐日积累', '日频'),
  cnSealRate: meta('封板率', '%', 'https://quote.eastmoney.com/ztb/', '涨停家数 ÷（涨停家数 + 炸板家数）× 100；分母为 0 的日期不记录', '日频'),
  cnMaxBoard: meta('最高连板高度', '板', 'https://quote.eastmoney.com/ztb/', '涨停池当日最高连板数（lbc 字段），无涨停时为 0', '日频'),
  cnIfBasis: meta('IF（沪深300）主力合约年化基差', '%', 'http://www.cffex.com.cn/sj/hqsj/rtj/', '持仓量最大的 IF 合约：（今结算 − 沪深300 收盘）÷ 指数收盘 × 365 ÷ 到期剩余天数；到期日为合约月第三个周五', '日频'),
  cnImBasis: meta('IM（中证1000）主力合约年化基差', '%', 'http://www.cffex.com.cn/sj/hqsj/rtj/', '持仓量最大的 IM 合约：（今结算 − 中证1000 收盘）÷ 指数收盘 × 365 ÷ 到期剩余天数；IC/IM 贴水为期指对冲盘常态，看分位不看绝对', '日频'),
  cnOptionPcr: meta('股指期权成交量 PCR（IO+MO+HO）', '倍', 'http://www.cffex.com.cn/sj/hqsj/rtj/', '中金所股指期权（IO 沪深300 + MO 中证1000 + HO 上证50）看跌成交量 ÷ 看涨成交量；看涨为 0 不记录', '日频'),
  cnNorthTurnover: meta('北向（沪股通 + 深股通）成交额', '亿港元', 'https://www.hkex.com.hk/chi/csm/dailystat/dailystat_c.html', '港交所每日北向 Total Turnover（SSE + SZSE Northbound）之和，百万港元 ÷ 100；2024-08 起官方停披实时净买入，成交额口径未受影响', '日频'),
}

const ymd = (s) => String(s).replaceAll('-', '')
const rounded = (value, digits = 2) => Number(value.toFixed(digits))
const sorted = (history) => history.sort(([a], [b]) => a.localeCompare(b))
const record = (history) => ({ history: sorted(history) })
const jsonOf = async (read, url) => JSON.parse(await read(url))
const bjDate = (now) => new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10)
const monthEndOf = (day) => { const [y, m] = day.split('-'); return new Date(Date.UTC(Number(y), Number(m), 0)).toISOString().slice(0, 10) }

function klineUrl(secid, beg, end, fields = 'f51,f57') {
  return `${KLINE}?secid=${secid}&fields1=f1&fields2=${fields}&klt=101&fqt=0&beg=${beg}&end=${end}&lmt=2000`
}

const csiPerfUrl = (code, start, end) => `${CSIPERF}?indexCode=${code}&startDate=${ymd(start)}&endDate=${ymd(end)}`
const cnindexUrl = (code, start, end) => `${CNINDEX}?indexCode=${code}&startDate=${start}&endDate=${end}&frequency=day`
const fiveYearWindows = (begYear, before) => {
  const windows = []
  for (let y = begYear; y <= Number(before.slice(0, 4)); y++) {
    const end = Math.min(y + 4, Number(before.slice(0, 4)))
    windows.push([y, end])
    y = end
  }
  return windows
}

/** 中证官网 index-perf 行 → [{date, value}]：tradingValue=成交额（亿元）、close=收盘，value 乘 scale 归一。 */
export function parseCsiPerfRows(body, code, field, scale = 1) {
  if (String(body?.code) !== '200' || !Array.isArray(body?.data) || !body.data.length) throw new Error('中证指数行情为空')
  const rows = []
  for (const r of body.data) {
    const date = String(r?.tradeDate ?? '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
    const value = Number(r?.[field])
    if (r?.indexCode !== code || !validDate(date) || !Number.isFinite(value) || value <= 0) continue
    rows.push({ date, value: value * scale })
  }
  if (!rows.length) throw new Error('中证指数行情无有效观测')
  return rows
}

/** 国证官网日行情（item[8]=成交额，亿元）→ [{date, value}]，value 乘 scale 归一。 */
export function parseCnindexRows(json, scale = 1) {
  const data = json?.data?.data
  if (!Array.isArray(data) || !data.length) throw new Error('国证指数行情为空')
  const rows = []
  for (const r of data) {
    const date = String(r?.[0] ?? ''), value = Number(r?.[8])
    if (!validDate(date) || !Number.isFinite(value) || value <= 0) continue
    rows.push({ date, value: value * scale })
  }
  if (!rows.length) throw new Error('国证指数行情无有效观测')
  return rows
}

// 中债/中国货币网需要 Referer；中金所非交易日 302 跳错误页，需手动拦截以便跳过当天。
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
}
async function fetchText(url, attempt = 0) {
  const headers = { ...HEADERS }
  if (url.startsWith(CHINABOND)) headers.Referer = 'https://yield.chinabond.com.cn/'
  if (url.startsWith(CHINAMONEY)) headers.Referer = 'https://www.chinamoney.com.cn/'
  if (url.startsWith('https://www.csindex.com.cn')) headers.Referer = 'https://www.csindex.com.cn/'
  // CFFEX redirects full browser user agents to an error page, which would read as a holiday.
  if (url.includes('cffex.com.cn')) headers['User-Agent'] = 'Mozilla/5.0'
  let response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(30000), headers,
      redirect: url.includes('cffex.com.cn') ? 'manual' : 'follow',
    })
  } catch (error) {
    if (attempt < 1 && error?.name === 'TypeError') { await new Promise((r) => setTimeout(r, 1000)); return fetchText(url, attempt + 1) }
    throw error
  }
  if (!response.ok) {
    const error = new Error('HTTP ' + response.status)
    error.status = response.status
    throw error
  }
  const buffer = await response.arrayBuffer()
  return new TextDecoder(url.includes('cffex.com.cn') ? 'gbk' : 'utf-8').decode(buffer)
}

/** 东财 push2his 日 K：klineUrl 的 fields2 只取 f51 日期 + 一个数值列（f57 成交额或 f53 收盘）。校验 rc 与返回代码，非法行丢弃。 */
export function parseKline(body, code) {
  if (body?.rc !== 0 || String(body?.data?.code ?? '').padStart(6, '0') !== code) throw new Error(`东财K线身份不符（${body?.data?.code ?? '无'}）`)
  const klines = body?.data?.klines
  if (!Array.isArray(klines) || !klines.length) throw new Error('东财K线为空')
  const rows = []
  for (const line of klines) {
    const parts = String(line).split(',')
    const date = parts[0], value = Number(parts[1])
    if (!validDate(date) || !Number.isFinite(value)) continue
    rows.push({ date, value })
  }
  return rows
}

/** 上证综指 + 深证综指成交额按日相加（只取两日都有的交易日，分段抓取的重叠日期去重），元 → 亿元。 */
export function sumAmounts(shRows, szRows) {
  const sh = new Map(shRows.map((r) => [r.date, r.value]))
  const byDate = new Map()
  for (const r of szRows) {
    if (sh.has(r.date)) byDate.set(r.date, rounded((sh.get(r.date) + r.value) / 1e8))
  }
  return sorted([...byDate.entries()])
}

/** 当日成交额 ÷ 此前 20 个交易日均值（倍）；不足 21 个观测的日期没有值。 */
export function volumeRatioFromAmount(history) {
  const ratios = []
  for (let i = 20; i < history.length; i++) {
    const mean = history.slice(i - 20, i).reduce((sum, [, value]) => sum + value, 0) / 20
    ratios.push([history[i][0], rounded(history[i][1] / mean)])
  }
  return ratios
}

/** 东财 RPTA_RZRQ_LSHJ 行 → 规整两融观测；数值非法或余额非正的行丢弃。 */
export function parseRzrq(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('两融数据为空')
  const out = []
  for (const r of rows) {
    const date = String(r?.DIM_DATE ?? '').slice(0, 10)
    const rzye = num(r?.RZYE), rqye = num(r?.RQYE), rzmre = num(r?.RZMRE), ltsz = num(r?.LTSZ)
    if (!validDate(date) || rzye === null || rzye <= 0 || rqye === null || rqye < 0) continue
    out.push({ date, rzye, rqye, rzmre: rzmre ?? null, ltsz: ltsz ?? null })
  }
  if (!out.length) throw new Error('两融数据无有效观测')
  return sorted(out.map((r) => [r.date, r])).map(([, r]) => r)
}

/**
 * 两融五个序列：余额（RZYE+RQYE，亿元）、融资余额占流通市值、换手率（成交额 ÷ 流通市值）、
 * 融资买入额占成交额、融资余额月末同比。amountByDate：两市成交额 Map（元 → 已亿元）。
 */
export function marginSeries(cleaned, amountByDate) {
  const balance = [], ratio = [], turnover = [], buyShare = []
  for (const r of cleaned) {
    balance.push([r.date, rounded((r.rzye + r.rqye) / 1e8)])
    if (r.ltsz !== null && r.ltsz > 0) {
      ratio.push([r.date, rounded(r.rzye / r.ltsz * 100)])
      const amount = amountByDate.get(r.date)
      if (amount !== undefined) turnover.push([r.date, rounded(amount * 1e8 / r.ltsz * 100)])
    }
    const amount = amountByDate.get(r.date)
    if (r.rzmre !== null && amount !== undefined && amount > 0) buyShare.push([r.date, rounded(r.rzmre / 1e8 / amount * 100)])
  }
  const monthEnd = []
  for (const r of cleaned) {
    const me = monthEndOf(r.date)
    if (monthEnd.length && monthEnd.at(-1)[0] === me) monthEnd[monthEnd.length - 1] = [me, r.rzye]
    else monthEnd.push([me, r.rzye])
  }
  const byMonth = new Map(monthEnd.map(([d, v]) => [d.slice(0, 7), v]))
  const yoy = monthEnd.flatMap(([d, v]) => {
    const prev = byMonth.get(`${Number(d.slice(0, 4)) - 1}${d.slice(4, 7)}`)
    return prev ? [[d, rounded((v / prev - 1) * 100)]] : []
  })
  return { balance, ratio, turnover, buyShare, yoy }
}

/** 中债 historyQuery HTML：取「中债国债收益率曲线」行，10 年列按表头定位；无数据行返回空数组。 */
export function parseChinabondTenYear(html) {
  const tables = String(html).match(/<table[\s\S]*?<\/table>/gi) ?? []
  for (const table of tables) {
    const trs = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1])
    const cellsOf = (tr) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(([, cell]) => cell.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim())
    const rows = trs.map(cellsOf)
    const header = rows.find((cells) => cells.includes('日期') && cells.includes('10年'))
    if (!header) continue
    const col = { date: header.indexOf('日期'), y10: header.indexOf('10年') }
    const out = []
    for (const cells of rows) {
      const date = cells[col.date]
      const value = Number(cells[col.y10])
      if (cells[0] !== '中债国债收益率曲线' || !validDate(date) || !Number.isFinite(value)) continue
      out.push([date, rounded(value)])
    }
    return sorted(out)
  }
  return []
}

/** 中国货币网 ShiborHis / LprHis 的 records → [[date, value]]；缺字段或非法日期丢弃。 */
export function parseChinamoneyRecords(json, field) {
  const records = json?.records
  if (!Array.isArray(records)) throw new Error('中国货币网未返回 records')
  const out = []
  for (const r of records) {
    const date = r?.showDateCN, value = Number(r?.[field])
    if (!validDate(date) || !Number.isFinite(value)) continue
    out.push([date, rounded(value)])
  }
  return sorted(out)
}

/** 东财 RPTA_WEB_RATE 行 → 1 年期 LPR（LPR1Y 为 null 的早年行丢弃）。 */
export function parseEmLpr(rows) {
  if (!Array.isArray(rows)) throw new Error('东财 LPR 数据为空')
  const out = []
  for (const r of rows) {
    const date = String(r?.TRADE_DATE ?? '').slice(0, 10)
    const value = num(r?.LPR1Y)
    if (!validDate(date) || value === null) continue
    out.push([date, value])
  }
  return sorted(out)
}

/** 东财宏观月频行 → [[月末日期, 值]]：REPORT_DATE 为月初，转成月末。 */
export function parseEmMonthly(rows, field) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('东财宏观数据为空')
  const out = []
  for (const r of rows) {
    const date = String(r?.REPORT_DATE ?? '').slice(0, 10)
    const value = num(r?.[field])
    if (!validDate(date) || value === null) continue
    out.push([monthEndOf(date), value])
  }
  return sorted(out)
}

/** 同月对齐相减（M1 − M2 剪刀差），单位：个百分点。 */
export function spreadSeries(a, b) {
  const bm = new Map(b.map(([d, v]) => [d.slice(0, 7), v]))
  return a.flatMap(([d, v]) => (bm.has(d.slice(0, 7)) ? [[d, rounded(v - bm.get(d.slice(0, 7)))]] : []))
}

/** 东财股池（涨停/跌停/炸板）单日三池汇总：三个池都空视为无数据（超出保留期）；否则计数齐全，连板高度取 lbc（缺省用 zttj.days）。 */
export function poolDay(zt, dt, zb) {
  for (const body of [zt, dt, zb]) if (body?.rc !== 0 || !body?.data) throw new Error('股池返回异常')
  const up = zt.data.tc ?? 0, down = dt.data.tc ?? 0, broken = zb.data.tc ?? 0
  if (!up && !down && !broken) return null
  const pool = Array.isArray(zt.data.pool) ? zt.data.pool : []
  const maxBoard = pool.reduce((m, r) => Math.max(m, num(r?.lbc) ?? num(r?.zttj?.days) ?? 0), 0)
  return { up, down, broken, maxBoard }
}

/** 合约月第三个周五（中金所股指期货/期权到期日）。 */
export function thirdFriday(year, month) {
  const d = new Date(Date.UTC(year, month - 1, 1))
  let fridays = 0
  while (fridays < 3) {
    if (d.getUTCDay() === 5) fridays++
    if (fridays < 3) d.setUTCDate(d.getUTCDate() + 1)
  }
  return d.toISOString().slice(0, 10)
}

/** 中金所日行情 CSV 单日解析：IF/IM 持仓量最大合约的今结算与到期月、IO/MO/HO 认购/认沽成交量。无合约数据返回 null。 */
export function parseCffexDay(text) {
  const lines = String(text).split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length || !lines[0].includes('合约代码')) throw new Error('中金所 CSV 表头异常')
  const futures = { IF: [], IM: [] }
  const volume = { call: 0, put: 0 }
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.trim())
    const code = cols[0]
    const settle = Number(cols[9]), oi = Number(cols[6]), vol = Number(cols[4])
    const fut = code.match(/^(IF|IM)(\d{4})$/)
    if (fut) {
      if (Number.isFinite(settle) && settle > 0 && Number.isFinite(oi)) futures[fut[1]].push({ month: fut[2], settle, oi })
      continue
    }
    const opt = code.match(/^(?:IO|MO|HO)(\d{4})-([CP])-\d+$/)
    if (opt && Number.isFinite(vol) && vol > 0) volume[opt[2] === 'C' ? 'call' : 'put'] += vol
  }
  const main = (list) => list.reduce((best, r) => (r.oi > (best?.oi ?? -1) ? r : best), null)
  const expiryOf = (m) => thirdFriday(2000 + Number(m.slice(0, 2)), Number(m.slice(2)))
  const ifMain = main(futures.IF), imMain = main(futures.IM)
  if (!ifMain && !imMain && !volume.call && !volume.put) return null
  return {
    ifSettlement: ifMain ? ifMain.settle : null, ifExpiry: ifMain ? expiryOf(ifMain.month) : null,
    imSettlement: imMain ? imMain.settle : null, imExpiry: imMain ? expiryOf(imMain.month) : null,
    callVol: volume.call, putVol: volume.put,
  }
}

/** 年化基差（%）=（结算 − 指数收盘）÷ 指数收盘 × 365 ÷ 剩余天数；剩余天数 < 1 或无指数收盘返回 null。 */
export function annualizedBasis(settlement, indexClose, expiry, day) {
  if (settlement === null || indexClose === null || !expiry) return null
  const left = Math.round((Date.parse(expiry) - Date.parse(day)) / DAY)
  if (left < 1 || !(indexClose > 0)) return null
  return rounded((settlement - indexClose) / indexClose * 365 / left * 100)
}

/** HKEX 北向每日统计 js → 沪股通 + 深股通 Total Turnover 之和（百万港元 → 亿港元）；结构不符返回 null。 */
export function parseHkexNorth(text) {
  const match = String(text).match(/tabData\s*=\s*(\[[\s\S]*?\])\s*;?\s*$/)
  if (!match) return null
  let data
  try { data = JSON.parse(match[1]) } catch { return null }
  if (!Array.isArray(data)) return null
  let total = 0, found = false
  for (const item of data) {
    const market = item?.market
    if (market !== 'SSE Northbound' && market !== 'SZSE Northbound') continue
    const cells = item?.content?.[0]?.table?.tr?.[0]?.td?.[0]
    const value = Number(String(Array.isArray(cells) ? cells[0] : '').replaceAll(',', ''))
    if (!Number.isFinite(value)) return null
    total += value
    found = true
  }
  return found ? rounded(total / 100) : null
}

/** 并发 3、每 worker 请求间隔 ≥150ms 的逐日回补；4xx/3xx 视为当日无数据（跳过），网络/5xx 记入 errors。 */
async function backfillDaily(days, worker, { concurrency = 3, interval = 150 } = {}) {
  const results = new Map()
  const errors = []
  let next = 0
  async function run() {
    let last = 0
    while (next < days.length) {
      const day = days[next++]
      const wait = last + interval - Date.now()
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      last = Date.now()
      try {
        const value = await worker(day)
        if (value !== null && value !== undefined) results.set(day, value)
      } catch (error) {
        if (error?.status && error.status >= 300 && error.status < 500) continue
        errors.push({ day, error })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(days.length, 1)) }, run))
  return { results, errors }
}

function emReport(read, reportName, sortColumn, pageSize = '800') {
  return emPaginate((page) => jsonOf(read, emUrl({ reportName, sortColumns: sortColumn, sortTypes: '-1', pageNumber: String(page), pageSize })), reportName, 12)
}

/** 两市成交额 + 20 日量比。主源东财 push2his 分段抓全；被限流时回退官方源（中证 perf 上证综指 + 国证 深证综指，成交额口径已核对一致）。 */
async function fetchAmount(read, before) {
  const history = await fetchAmountEm(read, before).catch(() => fetchAmountOfficial(read, before))
  if (!history.length) throw new Error('两市成交额为空')
  return { cnAmount: record(history), cnVolumeRatio: record(volumeRatioFromAmount(history)) }
}

async function fetchAmountEm(read, before) {
  const windows = fiveYearWindows(Number(AMOUNT_BEG.slice(0, 4)), before)
  const fetchIndex = async (secid, code) => {
    const parts = []
    for (const [from, to] of windows) {
      const end = to === Number(before.slice(0, 4)) ? before : `${to}-12-31`
      const body = await jsonOf(read, klineUrl(secid, `${from}0101`, ymd(end)))
      parts.push(...parseKline(body, code))
    }
    return parts
  }
  const [sh, sz] = await Promise.all([fetchIndex('1.000001', '000001'), fetchIndex('0.399106', '399106')])
  return sumAmounts(sh, sz).filter(([day]) => day <= before)
}

async function fetchAmountOfficial(read, before) {
  const windows = fiveYearWindows(Number(AMOUNT_BEG.slice(0, 4)), before)
  const sh = [], sz = []
  for (const [from, to] of windows) {
    const end = to === Number(before.slice(0, 4)) ? before : `${to}-12-31`
    sh.push(...parseCsiPerfRows(await jsonOf(read, csiPerfUrl('000001', `${from}-01-01`, end)), '000001', 'tradingValue', 1e8))
    sz.push(...parseCnindexRows(await jsonOf(read, cnindexUrl('399106', `${from}-01-01`, end)), 1e8))
  }
  return sumAmounts(sh, sz).filter(([day]) => day <= before)
}

async function fetchMargin(read, amountByDate) {
  const cleaned = parseRzrq(await emReport(read, 'RPTA_RZRQ_LSHJ', 'DIM_DATE'))
  const { balance, ratio, turnover, buyShare, yoy } = marginSeries(cleaned, amountByDate)
  return {
    cnMarginBalance: record(balance), cnMarginRatio: record(ratio), cnMarginYoy: record(yoy),
    cnMarginBuyShare: record(buyShare), cnTurnover: record(turnover),
  }
}

/** 全量拉取（表逐日增长、count 快照会漂移，不用 emPaginate 的行数校验）：顺序翻页到不足一页或再无数据为止。
 *  东财单页实际上限 500 条（传更大被静默截断），短页判断必须按 500；单页网络抖动重试 2 次。 */
async function emFullReport(read, reportName, sortColumn, pageSize = '500', maxPages = 80) {
  const out = []
  for (let page = 1; page <= maxPages; page++) {
    let body, lastError
    for (let attempt = 0; attempt <= 2 && !body; attempt++) {
      try {
        body = await jsonOf(read, emUrl({ reportName, sortColumns: sortColumn, sortTypes: '-1', pageNumber: String(page), pageSize }))
      } catch (error) {
        lastError = error
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
    if (!body) throw lastError
    if (body?.code === 9201 || body?.success === false) {
      if (out.length) return out
      throw new Error(`东财 ${reportName} 无数据`)
    }
    if (!Array.isArray(body?.result?.data)) throw new Error(`东财 ${reportName} 返回异常：${body?.message}`)
    out.push(...body.result.data)
    if (body.result.data.length < Math.min(Number(pageSize), 500)) return out
  }
  throw new Error(`东财 ${reportName} 页数超过上限`)
}

/** 10 年期国债收益率：中债按半年分段为主（接口单次跨度需小于 1 年），东财镜像补缺（中债缺失的日期用东财值）。 */
async function fetchTenYear(read, before) {
  const cn = []
  const chunks = []
  for (let y = TEN_YEAR_BEG; y <= Number(before.slice(0, 4)); y++) {
    chunks.push([`${y}-01-01`, `${y}-06-30`], [`${y}-07-01`, `${y}-12-31`])
  }
  for (const [start, end] of chunks) {
    const capped = end > before ? before : end
    if (start > capped) continue
    try {
      cn.push(...parseChinabondTenYear(await read(`${CHINABOND}?startDate=${start}&endDate=${capped}&gjqx=0&qxId=ycqx&locale=cn_ZH`)))
    } catch { /* 单段失败不拖垮整体，东财补缺 */ }
  }
  let em = []
  try {
    em = parseTreasuryRows(await emFullReport(read, 'RPTA_WEB_TREASURYYIELD', 'SOLAR_DATE'), before)
  } catch { /* 东财补缺失败不拖垮中债主源 */ }
  const merged = new Map(em.map(([d, v]) => [d, v]))
  for (const [d, v] of cn) merged.set(d, v)
  const history = sorted([...merged.entries()])
  if (!history.length) throw new Error('10 年期国债收益率无数据')
  return { cnTenYear: record(history) }
}

/** 东财 RPTA_WEB_TREASURYYIELD → [[date, y10]]，数值四舍五入 2 位。 */
function parseTreasuryRows(rows, before) {
  if (!Array.isArray(rows)) throw new Error('东财国债收益率数据为空')
  const out = []
  for (const r of rows) {
    const date = String(r?.SOLAR_DATE ?? '').slice(0, 10)
    const value = num(r?.EMM00166466)
    if (!validDate(date) || date > before || value === null) continue
    out.push([date, rounded(value)])
  }
  return sorted(out)
}

/** Shibor 3M：中国货币网按年分段（接口单次跨度上限 1 年）。 */
async function fetchShibor(read, before) {
  const out = []
  for (let y = SHIBOR_BEG; y <= Number(before.slice(0, 4)); y++) {
    try {
      out.push(...parseChinamoneyRecords(await jsonOf(read, `${SHIBOR_HIS}?lang=CN&startDate=${y}-01-01&endDate=${y}-12-31`), '3M'))
    } catch { /* 单年失败跳过 */ }
  }
  if (!out.length) throw new Error('Shibor 无数据')
  return { cnShibor3m: record(out) }
}

/** 1 年期 LPR：东财全历史 + 中国货币网最近一年（官方值优先）。 */
async function fetchLpr(read) {
  const em = parseEmLpr(await emReport(read, 'RPTA_WEB_RATE', 'TRADE_DATE'))
  let cm = []
  try {
    cm = parseChinamoneyRecords(await jsonOf(read, `${LPR_HIS}?lang=CN&startDate=2019-01-01&endDate=20500101`), '1Y')
  } catch { /* 东财全历史仍在 */ }
  const merged = new Map(em.map(([d, v]) => [d, v]))
  for (const [d, v] of cm) merged.set(d, v)
  const history = sorted([...merged.entries()]).filter(([d]) => d >= '2019-08-19') // 2019-08-20 LPR 改革首日报价起，改革前旧报价不混入
  if (!history.length) throw new Error('LPR 无数据')
  return { cnLpr1y: record(history) }
}

async function fetchCurrencySupply(read) {
  const rows = await emReport(read, 'RPT_ECONOMY_CURRENCY_SUPPLY', 'REPORT_DATE')
  const m1 = parseEmMonthly(rows, 'CURRENCY_SAME')
  const m2 = parseEmMonthly(rows, 'BASIC_CURRENCY_SAME')
  return { cnM1Yoy: record(m1), cnM2Yoy: record(m2), cnM1M2: record(spreadSeries(m1, m2)) }
}

async function fetchPmi(read) {
  return { cnPmi: record(parseEmMonthly(await emReport(read, 'RPT_ECONOMY_PMI', 'REPORT_DATE'), 'MAKE_INDEX')) }
}

async function fetchPpi(read) {
  return { cnPpi: record(parseEmMonthly(await emReport(read, 'RPT_ECONOMY_PPI', 'REPORT_DATE'), 'BASE_SAME')) }
}

/** 涨跌停池：逐日回补最近 N 个交易日中序列缺失的日期（三池同空=超出东财保留期，跳过）。 */
async function fetchPools(read, days) {
  if (!days.length) return null
  const { results, errors } = await backfillDaily(days, async (day) => {
    const arg = `ut=${POOL_U}&dpt=wz.ztzt&Pageindex=0&pagesize=500&sort=fbt:asc&date=${ymd(day)}`
    const [zt, dt, zb] = await Promise.all([
      jsonOf(read, `https://push2ex.eastmoney.com/getTopicZTPool?${arg}`),
      jsonOf(read, `https://push2ex.eastmoney.com/getTopicDTPool?${arg}`),
      jsonOf(read, `https://push2ex.eastmoney.com/getTopicZBPool?${arg}`),
    ])
    return poolDay(zt, dt, zb)
  })
  if (!results.size && errors.length) throw errors[0].error
  const up = [], down = [], broken = [], seal = [], maxBoard = []
  for (const [day, v] of [...results.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    up.push([day, v.up])
    down.push([day, v.down])
    broken.push([day, v.broken])
    maxBoard.push([day, v.maxBoard])
    if (v.up + v.broken > 0) seal.push([day, rounded(v.up / (v.up + v.broken) * 100)])
  }
  return {
    cnLimitUp: record(up), cnLimitDown: record(down), cnBrokenBoards: record(broken),
    cnSealRate: record(seal), cnMaxBoard: record(maxBoard),
  }
}

/** 中金所日行情：逐日回补 CSV，算 IF/IM 主力年化基差与股指期权成交量 PCR；指数收盘东财 K 线为主、中证官网兜底。 */
async function fetchCffex(read, days, before) {
  if (!days.length) return null
  const closes = {}
  for (const [secid, code, key] of [['1.000300', '000300', 'if'], ['1.000852', '000852', 'im']]) {
    let rows
    try {
      rows = parseKline(await jsonOf(read, klineUrl(secid, ymd(days[0]), ymd(before), 'f51,f53')), code)
    } catch {
      rows = parseCsiPerfRows(await jsonOf(read, csiPerfUrl(code, days[0], before)), code, 'close')
    }
    closes[key] = new Map(rows.map((r) => [r.date, r.value]))
  }
  const { results, errors } = await backfillDaily(days, async (day) => {
    const stamp = ymd(day)
    const text = await read(`${CFFEX}/${stamp.slice(0, 6)}/${stamp.slice(6)}/${stamp}_1.csv`)
    return parseCffexDay(text)
  })
  if (!results.size && errors.length) throw errors[0].error
  const ifBasis = [], imBasis = [], pcr = []
  for (const [day, v] of [...results.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ifClose = closes.if.get(day), imClose = closes.im.get(day)
    const ifValue = annualizedBasis(v.ifSettlement, ifClose === undefined ? null : ifClose, v.ifExpiry, day)
    const imValue = annualizedBasis(v.imSettlement, imClose === undefined ? null : imClose, v.imExpiry, day)
    if (ifValue !== null) ifBasis.push([day, ifValue])
    if (imValue !== null) imBasis.push([day, imValue])
    if (v.putVol > 0 && v.callVol > 0) pcr.push([day, rounded(v.putVol / v.callVol)])
  }
  return { cnIfBasis: record(ifBasis), cnImBasis: record(imBasis), cnOptionPcr: record(pcr) }
}

/** 北向成交额：HKEX 每日统计 js（404=无该日文件，跳过；保留期约 5 个月）。 */
async function fetchNorth(read, days) {
  if (!days.length) return null
  const { results, errors } = await backfillDaily(days, async (day) => {
    const text = await read(`${HKEX}/data_tab_daily_${ymd(day)}c.js`)
    return parseHkexNorth(text)
  })
  if (!results.size && errors.length) throw errors[0].error
  return { cnNorthTurnover: record([...results.entries()].sort(([a], [b]) => a.localeCompare(b))) }
}

/** 逐日来源共用的缺日列表：最近 backfill 个交易日中，给定 key 的日期未全部存在的。
 *  已有观测之前的日期不再请求（东财股池约 1 个月、HKEX 约半年保留期，更早的日期永远取不到）。 */
function missingDays(previous, history, backfill, keys) {
  const have = keys.map((key) => new Set(previous?.series?.[key]?.history?.map(([d]) => d) ?? []))
  const earliest = have.map((set) => [...set].sort().at(0)).filter(Boolean).sort().at(-1)
  return history.slice(-backfill).filter((day) =>
    (!earliest || day >= earliest) && !have.every((set) => set.has(day)))
}

/**
 * 汇总：先取两市成交额（逐日来源的交易日列表来自它），再并行其余来源；失败保留旧序列并写 refreshError。
 * 测试注入 read（url → text）；backfill 为每次运行回补的交易日数（默认 15）。
 */
export async function collectCnMarketData(previous, { read = fetchText, now = new Date(), backfill = 15 } = {}) {
  const before = bjDate(now)
  const series = { ...previous?.series }
  const warnings = []
  let sourcesUpdated = 0
  const today = before

  const settle = (name, keys, values) => {
    let accepted = false
    for (const [key, item] of Object.entries(values)) {
      const history = item.history.filter(([day]) => day <= today)
      if (!history.length) continue
      const updated = mergeSeries(series[key], { ...specs[key], ...item, history })
      if (!updated) continue
      delete updated.refreshError
      updated.history = compactHistory(updated.history, updated.frequency)
      series[key] = updated
      accepted = true
    }
    if (accepted) sourcesUpdated++
    else warnings.push(name + '：没有适用的已发生观测值')
  }

  const reject = (name, keys, reason) => {
    const issue = refreshError(reason)
    warnings.push(name + '：' + issue)
    for (const key of keys) if (series[key]) series[key] = { ...series[key], refreshError: issue }
  }

  // 第一跳：两市成交额（其余逐日来源的交易日列表依赖它）
  let amountHistory = series.cnAmount?.history ?? []
  try {
    const amount = await fetchAmount(read, before)
    settle('两市成交额', ['cnAmount', 'cnVolumeRatio'], amount)
    amountHistory = series.cnAmount?.history ?? amountHistory
  } catch (error) {
    reject('两市成交额', ['cnAmount', 'cnVolumeRatio'], error)
  }

  const tradingDays = amountHistory.map(([d]) => d).filter((d) => d <= before).sort()
  const amountByDate = new Map(amountHistory.filter(([d]) => d <= before))
  const jobs = {
    '两融': [['cnMarginBalance', 'cnMarginRatio', 'cnMarginYoy', 'cnMarginBuyShare', 'cnTurnover'], () => fetchMargin(read, amountByDate)],
    '10 年期国债': [['cnTenYear'], () => fetchTenYear(read, before)],
    'Shibor 3M': [['cnShibor3m'], () => fetchShibor(read, before)],
    'LPR': [['cnLpr1y'], () => fetchLpr(read)],
    'M1/M2': [['cnM1Yoy', 'cnM2Yoy', 'cnM1M2'], () => fetchCurrencySupply(read)],
    '制造业 PMI': [['cnPmi'], () => fetchPmi(read)],
    'PPI': [['cnPpi'], () => fetchPpi(read)],
    '涨跌停池': [['cnLimitUp', 'cnLimitDown', 'cnBrokenBoards', 'cnSealRate', 'cnMaxBoard'],
      () => fetchPools(read, missingDays(previous, tradingDays, Math.min(backfill, POOL_BACKFILL_MAX), ['cnLimitUp', 'cnLimitDown', 'cnBrokenBoards', 'cnMaxBoard']))],
    '中金所': [['cnIfBasis', 'cnImBasis', 'cnOptionPcr'], () => fetchCffex(read, missingDays(previous, tradingDays, backfill, ['cnIfBasis', 'cnImBasis', 'cnOptionPcr']), before)],
    '北向成交额': [['cnNorthTurnover'], () => fetchNorth(read, missingDays(previous, tradingDays, Math.min(backfill, HKEX_BACKFILL_MAX), ['cnNorthTurnover']))],
  }
  const entries = Object.entries(jobs)
  const settled = await Promise.allSettled(entries.map(([, [, load]]) => load()))
  for (const [index, result] of settled.entries()) {
    const [name, [keys]] = entries[index]
    if (result.status === 'rejected') { reject(name, keys, result.reason); continue }
    if (result.value) settle(name, keys, result.value) // null = 本次无需回补（日期已齐）
  }
  return { snapshot: { series }, warnings, sourcesUpdated }
}

function refreshError(error) {
  const message = String(error?.message ?? error)
  const http = message.match(/HTTP (\d{3})\b/)
  if (http) return 'HTTP ' + http[1]
  if (/^(?:fetch failed|The operation was aborted)/i.test(message)) return '来源连接失败'
  return message.split('\n')[0].slice(0, 100)
}

function parseArgs(argv) {
  const i = argv.indexOf('--backfill')
  if (i < 0) return {}
  const value = Number(argv[i + 1])
  return Number.isFinite(value) ? { backfill: Math.max(1, Math.min(600, Math.floor(value))) } : {}
}

async function main() {
  const { backfill = 15 } = parseArgs(process.argv.slice(2))
  const previous = await readFile(OUTPUT, 'utf8').then(JSON.parse).catch((error) => {
    if (error.code === 'ENOENT') return { series: {} }
    throw error
  })
  const { snapshot, warnings, sourcesUpdated } = await collectCnMarketData(previous, { backfill })
  for (const warning of warnings) console.warn(warning)
  const output = JSON.stringify(snapshot, null, 2) + '\n'
  if (output !== JSON.stringify(previous, null, 2) + '\n') {
    const temporary = OUTPUT + '.' + process.pid + '.tmp'
    try {
      await writeFile(temporary, output)
      await rename(temporary, OUTPUT)
    } finally {
      await unlink(temporary).catch(() => {})
    }
  }
  if (!sourcesUpdated) throw new Error('中国市场补充数据源均不可用，保留上一份观测值')
  console.log('中国市场补充数据：' + sourcesUpdated + ' 个来源可用，' + Object.keys(snapshot.series).length + ' 项序列')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
