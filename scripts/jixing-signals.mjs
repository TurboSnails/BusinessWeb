// 今天几星 · 牛熊信号板：盘后汇总定量（估值）与情绪指标，每项给出当前值、日期、历史分位与本站自定信号。
// 只用带日期的公开源；页面数据日 = 估值三项（中证全指 PE、沪深市场 PB、10 年国债）共同的最新完整交易日，其余指标截断到该日。
// 单个指标失败只置空该项（同日旧文件里有值则沿用）；估值核心失败则整份不写。
import fs from 'node:fs'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import { csiPerfUrl, emPaginate, emUrl, fundUrl, parseFundIssue, fundCoverage } from './ths-market-lib.mjs'
import { MV_FROM, mvUrl, parsePerfSeries, parseMarketVal, treasuryMap, buildStarRows, pickAsOf, addYears } from './jixing-star-lib.mjs'
import {
  RULES, IPO_WINDOW, windowPct, rollingGdp, totalMcap, buffettSeries, marginSeries, parseIpo, ipoRolling,
  fundMonthly, mergeFundMonths, fundStart, parseSseAccounts, miniHistory, summarize, valuationSignal, moodSignal, buffettSignal, brokenSignal, addDays, round,
  trM2Series,
} from './jixing-signals-lib.mjs'

const OUT = 'public/data/jixing-signals.json'
const RAW = 'data-raw/jixing-signals'
const STAR_MV = 'data-raw/jixing-star/market-valuation.json' // 今日星级页签累积的板块 PB（只读）
const FUND_FILE = `${RAW}/funds-monthly.json`
const SSE_FILE = `${RAW}/sse-accounts.json`
const NEWS_FILE = 'scripts/jixing-signals-news.json'
const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', referer: 'https://data.eastmoney.com/' }
const CSI_UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', referer: 'https://www.csindex.com.cn/', accept: 'application/json' }
const SSE_UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', referer: 'https://www.sse.com.cn/' }
const sseUrl = (mdate) => `https://query.sse.com.cn/commonQuery.do?sqlId=COMMON_SSE_TZZ_M_ALL_ACCT_C&isPagination=true&pageHelp.pageSize=20&pageHelp.pageNo=1${mdate ? `&MDATE=${mdate}` : ''}`
const SSE_FROM_YEAR = 2021 // 该表 2021 年起有月度数据，更早年份返回空

async function get(url, type = 'json', headers = UA) {
  const hdr = url.includes('csindex.com.cn') ? CSI_UA : headers
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: hdr, signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 80)}`)
      return type === 'json' ? await res.json() : await res.text()
    } catch (e) { if (i >= 2) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))) }
  }
}
const emAll = (params) => emPaginate(page => get(emUrl({ ...params, pageNumber: String(page), pageSize: '500' })), params.reportName)
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }

function targetDate(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600e3)
  const today = bj.toISOString().slice(0, 10)
  const afterClose = bj.getUTCHours() * 60 + bj.getUTCMinutes() >= 15 * 60 + 30
  return { today, candidate: isTradingDay(today) && afterClose ? today : prevTradingDay(today) }
}

const ind = (o) => ({ note: null, extra: [], ...o })

/** 估值核心：与今日星级同一套计算（PB 读星级页签的累积文件，缺的日子在内存里补抓，不写回）。 */
async function valuationCore(candidate) {
  const perf = parsePerfSeries(await get(csiPerfUrl('000985', '2011-01-01', candidate))).filter(r => r.date <= candidate)
  const mv = readJson(STAR_MV, {})
  const missing = perf.map(r => r.date).filter(d => d >= MV_FROM && !(d in mv)).reverse().slice(0, 10)
  for (const d of missing) { const s = parseMarketVal(await get(mvUrl(d)), d); if (s.status === 'ok') mv[d] = [s.pb, s.pe, s.dp] }
  const pb = Object.fromEntries(Object.entries(mv).map(([d, v]) => [d, v ? v[0] : null]))
  const y10 = treasuryMap(await emAll({ reportName: 'RPTA_WEB_TREASURYYIELD', columns: 'SOLAR_DATE,EMM00166466', filter: "(SOLAR_DATE>='2011-01-01')", sortColumns: 'SOLAR_DATE', sortTypes: '1' }))
  const rows = buildStarRows({ perf, pb, y10 })
  return { perf, rows, idx: pickAsOf(rows, candidate) }
}

async function buffettInd(asOf) {
  const mcapRows = await emAll({ reportName: 'RPT_VALUEMARKET', columns: 'TRADE_DATE,TRADE_MARKET_CODE,TOTAL_MARKET_CAP', filter: `(TRADE_MARKET_CODE in ("000300","899050"))(TRADE_DATE>='2017-01-01')(TRADE_DATE<='${asOf}')`, sortColumns: 'TRADE_DATE', sortTypes: '1' })
  const gdpRows = await emAll({ reportName: 'RPT_ECONOMY_GDP', columns: 'REPORT_DATE,DOMESTICL_PRODUCT_BASE', sortColumns: 'REPORT_DATE', sortTypes: '-1' })
  const s = buffettSeries(totalMcap(mcapRows), rollingGdp(gdpRows)).filter(p => p.v !== null)
  const last = s.at(-1)
  if (!last || last.date < addDays(asOf, -7)) throw new Error('总市值未更新')
  const w = windowPct(s, 10)
  return ind({
    id: 'buffett', group: 'valuation', name: '巴菲特指标', unit: '%', digits: 1, value: last.v, date: last.date, pct: w.pct, window: '近 10 年', start: w.start, n: w.n,
    signal: buffettSignal(last.v), rule: RULES.buffett, history: miniHistory(s, 10, 1),
    extra: [{ label: 'A 股总市值', value: `${round(last.mcap / 1e4, 2)} 万亿元` }, { label: `滚动 4 季度名义 GDP（截至 ${last.quarter}）`, value: `${round(last.gdp / 1e4, 2)} 万亿元` }],
    note: '总市值 = 东方财富「市场估值」沪深两市合计 + 北交所（2021-11-15 开市前不存在）；GDP 为国家统计局季度累计值（经东方财富，当前修订版本）换算的滚动 4 季度名义 GDP，按季末次月 20 日起可用（近似发布日）。东财市值表 2017 年起，分位窗口不足 10 年。',
  })
}

function valuationInds(rows, idx) {
  const kept = rows.slice(0, idx + 1)
  const r = kept.at(-1)
  const erp = kept.filter(x => x.erp !== null).map(x => ({ date: x.date, v: x.erp }))
  const pb = kept.filter(x => x.pb !== null).map(x => ({ date: x.date, v: x.pb }))
  const we = windowPct(erp, 10), wp = windowPct(pb, 10)
  return [
    ind({
      id: 'erp', group: 'valuation', name: '股债性价比', unit: '百分点', digits: 2, value: r.erp, date: r.date, pct: we.pct, window: '近 10 年', start: we.start, n: we.n,
      signal: valuationSignal(we.pct, true), rule: RULES.erp, history: miniHistory(erp, 10, 2),
      extra: [{ label: '中证全指 滚动市盈率', value: r.pe.toFixed(2) }, { label: '盈利收益率 1/PE', value: `${(100 / r.pe).toFixed(2)}%` }, { label: '10 年期国债收益率', value: `${r.y10.toFixed(4)}%` }],
      note: '股债性价比 = 中证全指盈利收益率（1 / 滚动 PE）− 10 年期国债收益率（中债，经东方财富），同日数据。与「今日星级」页签同一口径。',
    }),
    ind({
      id: 'pb', group: 'valuation', name: '沪深市场 PB 分位', unit: '倍', digits: 2, value: r.pb, date: r.date, pct: wp.pct, window: '近 10 年', start: wp.start, n: wp.n,
      signal: valuationSignal(wp.pct), rule: RULES.pb, history: miniHistory(pb, 10, 2),
      note: '中证全指没有公开的逐日 PB 历史，这里用中证指数官网「行业市盈率」里的板块口径「沪深市场」整体市净率代替（2014-01-02 起），两者覆盖范围接近但不完全相同。',
    }),
  ]
}

async function marginInd(asOf) {
  const rows = await emAll({ reportName: 'RPTA_RZRQ_LSHJ', columns: 'DIM_DATE,RZYE,RZYEZB', filter: `(DIM_DATE>='${addYears(asOf, -10)}')(DIM_DATE<='${asOf}')`, sortColumns: 'DIM_DATE', sortTypes: '1' })
  const s = marginSeries(rows)
  const ratio = s.filter(p => p.ratio !== null).map(p => ({ date: p.date, v: p.ratio }))
  const bal = s.filter(p => p.balance !== null).map(p => ({ date: p.date, v: p.balance }))
  const last = ratio.at(-1), lb = bal.at(-1)
  if (!last || last.date < addDays(asOf, -7)) throw new Error('融资余额未更新')
  const wr = windowPct(ratio, 10), wb = windowPct(bal, 10)
  return ind({
    id: 'margin', group: 'mood', name: '融资余额 / 流通市值', unit: '%', digits: 3, value: last.v, date: last.date, pct: wr.pct, window: '近 10 年', start: wr.start, n: wr.n,
    signal: moodSignal(wr.pct), rule: RULES.marginRatio, history: miniHistory(ratio, 10, 3),
    extra: [{ label: `融资余额（${lb.date}）`, value: `${lb.v.toFixed(0)} 亿元` }, { label: '融资余额近 10 年分位', value: wb.pct === null ? '—' : `${wb.pct}%` }],
    note: '东方财富融资融券历史（沪深京合计）。融资余额绝对值随市场扩容长期上升，所以信号用占流通市值的比例判断。融资余额通常比行情晚一个交易日公布。',
  })
}

function amountInd(asOf) {
  const mm = readJson('public/data/market-mood.json', null)
  const s = (Array.isArray(mm?.amountHistory) ? mm.amountHistory : [])
    .filter(p => typeof p?.date === 'string' && p.date <= asOf && typeof p.total === 'number' && Number.isFinite(p.total) && p.total > 0)
    .map(p => ({ date: p.date, v: p.total }))
  const last = s.at(-1)
  if (!last || last.date < addDays(asOf, -7)) throw new Error('两市成交额未更新')
  const w = windowPct(s, 1)
  return ind({
    id: 'amount', group: 'mood', name: '两市成交额', unit: '亿元', digits: 0, value: last.v, date: last.date, pct: w.pct, window: '近 1 年', start: w.start, n: w.n,
    signal: moodSignal(w.pct), rule: RULES.amount, history: s.map(p => [p.date, p.v]),
    note: '沪市（上证指数）+ 深市（深证综指）当日成交额，取自本站开盘啦页签的公开行情累积（东方财富指数日 K），近 250 个交易日。',
  })
}

async function ipoInds(asOf, days) {
  const from = days[Math.max(0, days.findIndex(d => d >= addYears(asOf, -10)) - IPO_WINDOW)]
  const rows = await emAll({ reportName: 'RPTA_APP_IPOAPPLY', columns: 'SECURITY_CODE,LISTING_DATE,ISSUE_PRICE,CLOSE_PRICE', filter: `(LISTING_DATE>='${from}')(LISTING_DATE<='${asOf}')`, sortColumns: 'LISTING_DATE', sortTypes: '1' })
  const roll = ipoRolling(parseIpo(rows), days.filter(d => d >= from && d <= asOf))
  const last = roll.at(-1)
  if (!last || last.date !== asOf || last.count === null) throw new Error('新股统计窗口不足')
  const cnt = roll.filter(p => p.count !== null).map(p => ({ date: p.date, v: p.count }))
  const rate = roll.filter(p => p.rate !== null).map(p => ({ date: p.date, v: p.rate }))
  const wc = windowPct(cnt, 10)
  const span = `${last.from} 至 ${last.date}`
  return [
    ind({
      id: 'ipoCount', group: 'mood', name: `新股上市数（近 ${IPO_WINDOW} 个交易日）`, unit: '家', digits: 0, value: last.count, date: last.date, pct: wc.pct, window: '近 10 年', start: wc.start, n: wc.n,
      signal: moodSignal(wc.pct), rule: RULES.ipoCount, history: miniHistory(cnt, 10, 0),
      extra: [{ label: '统计区间', value: span }],
      note: '东方财富新股申购与中签表（沪深京），按上市日计数。',
    }),
    ind({
      id: 'ipoBroken', group: 'mood', name: `新股破发率（近 ${IPO_WINDOW} 个交易日）`, unit: '%', digits: 1, value: last.rate, date: last.date, pct: null, window: null, start: rate[0]?.date ?? null, n: rate.length,
      signal: brokenSignal(last.rate, last.priced), rule: RULES.ipoBroken, history: miniHistory(rate, 10, 1),
      extra: [{ label: '破发 / 有首日收盘', value: `${last.broken} / ${last.priced} 家` }, { label: '统计区间', value: span }],
      note: '破发 = 上市首日收盘价 < 发行价（东方财富「首日收盘价」字段）；首日收盘缺失的不计入分母。',
    }),
  ]
}

async function fundsInd(asOf) {
  const cache = readJson(FUND_FILE, { months: [] }).months ?? []
  const lastComplete = addDays(`${asOf.slice(0, 7)}-01`, -1).slice(0, 7)
  const refreshFrom = cache.length ? addDays(`${lastComplete}-01`, -1).slice(0, 7) : '0000-00' // 刷新最近两个完整月 + 当月
  const from = cache.length ? `${refreshFrom}-01` : '2000-01-01'
  const pages = []
  for (let page = 1; page <= 20; page++) {
    const rows = parseFundIssue(await get(fundUrl(page, 500), 'text', { ...UA, referer: 'https://fund.eastmoney.com/' }))
    pages.push(rows)
    if (fundCoverage(pages, from, 500) === null) break
  }
  const covered = fundCoverage(pages, from, 500) // null = 覆盖完整；否则该日所在月份及以前可能不全
  const fresh = fundMonthly(pages.flat().filter(r => r.setup && r.setup <= asOf))
  const cut = covered ? covered.slice(0, 7) : null
  const freshOk = fresh.filter(m => cut === null || m.month > cut)
  if (cache.length && cut && cut >= refreshFrom) throw new Error('新发基金翻页未覆盖刷新区间')
  const months = mergeFundMonths(cache, freshOk, refreshFrom).filter(m => m.month <= asOf.slice(0, 7))
  const start = fundStart(months.filter(m => m.month <= lastComplete))
  if (!start) throw new Error('新发基金覆盖不足')
  const complete = months.filter(m => m.month >= start && m.month <= lastComplete && m.equity !== null)
  const last = complete.at(-1)
  if (!last || last.month !== lastComplete) throw new Error('新发基金缺最近完整月')
  const s = complete.map(m => ({ date: `${m.month}-01`, v: m.equity }))
  const w = windowPct(s, null, 12)
  const cur = months.find(m => m.month === asOf.slice(0, 7))
  return {
    months,
    ind: ind({
      id: 'funds', group: 'mood', name: '新成立偏股型基金（月）', unit: '亿份', digits: 0, value: last.equity, date: `${last.month}-01`, month: last.month, pct: w.pct, window: `${complete[0].month} 起全部月份`, start: s[0].date, n: w.n,
      signal: moodSignal(w.pct), rule: RULES.funds, history: s.map(p => [p.date, p.v]),
      extra: [{ label: `${last.month} 偏股基金只数`, value: `${last.equityFunds} 只` }, ...(cur && cur.equity !== null ? [{ label: `${cur.month} 截至 ${asOf}（不完整）`, value: `${cur.equity.toFixed(0)} 亿份` }] : [])],
      note: '天天基金「新成立基金」列表，按成立日归月；偏股型 = 股票型 + 混合型-偏股 + 指数型-股票（不含 QDII、灵活配置）。同一基金 A/C 等份额去重。该列表只能翻到约 2022 年底：取此后每月都有 ≥ 20 只新基金的最早月份，并跳过这个可能不完整的首月作为统计起点，更早月份不计。',
    }),
  }
}

/** 中证全指全收益 H00985 vs M2（BASIC_CURRENCY）。 */
async function trM2Ind(asOf) {
  const start = addYears(asOf, -12)
  const perf = await get(csiPerfUrl('H00985', start, asOf))
  const trMonthly = (Array.isArray(perf?.data) ? perf.data : []).map(r => {
    const d = String(r?.tradeDate ?? '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
    const close = Number(r?.close)
    return { date: d, close: Number.isFinite(close) && close > 0 ? close : null }
  }).filter(p => p.close && p.date <= asOf)

  const m2Rows = await emAll({
    reportName: 'RPT_ECONOMY_CURRENCY_SUPPLY',
    columns: 'REPORT_DATE,BASIC_CURRENCY',
    sortColumns: 'REPORT_DATE',
    sortTypes: '1',
  })
  const m2Monthly = m2Rows.map(r => {
    const month = String(r?.REPORT_DATE ?? '').slice(0, 7)
    const m2 = Number(r?.BASIC_CURRENCY)
    return { month, m2: Number.isFinite(m2) && m2 > 0 ? m2 : null }
  }).filter(r => r.m2 && r.month >= start.slice(0, 7) && r.month <= asOf.slice(0, 7))

  const series = trM2Series(trMonthly, m2Monthly).filter(p => p.date <= `${asOf.slice(0, 7)}-01`)
  const last = series.at(-1)
  if (!last) throw new Error('全收益/M2 序列为空')
  const w = windowPct(series, 10)
  return ind({
    id: 'trM2', group: 'valuation', name: '中证全指全收益 / M2', unit: '倍（归一）', digits: 3,
    value: last.v, date: last.date, month: last.month, pct: w.pct, window: '近 10 年', start: w.start, n: w.n,
    signal: valuationSignal(w.pct), rule: RULES.trM2, history: miniHistory(series, 10, 3),
    extra: [
      { label: '全收益点位（对齐月）', value: String(last.tr) },
      { label: 'M2 余额（亿元）', value: round(last.m2, 0).toLocaleString('zh-CN') },
    ],
    note: '全收益取中证 H00985 月末收盘；M2 取东方财富 RPT_ECONOMY_CURRENCY_SUPPLY 的 BASIC_CURRENCY（与宏观页 M1−M2 同源，为人行公布）。比值按序列首月归一。月度对齐，不日度插值。',
  })
}

function loadNews(asOf) {
  const rows = readJson(NEWS_FILE, [])
  if (!Array.isArray(rows)) return []
  return rows
    .filter(r => r && typeof r.date === 'string' && r.date <= asOf && typeof r.title === 'string' && typeof r.url === 'string' && /^https?:\/\//.test(r.url))
    .map(r => ({ date: r.date, title: r.title, url: r.url, source: String(r.source ?? '公开来源') }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'zh-CN'))
}

async function accountsInd(asOf) {
  const cache = readJson(SSE_FILE, { years: {} }).years ?? {}
  const year = Number(asOf.slice(0, 4))
  const years = { ...cache }
  for (let y = SSE_FROM_YEAR; y <= year; y++) {
    if (y < year - 1 && Array.isArray(years[y]) && years[y].length === 12) continue // 已完整的旧年份不再请求
    const rows = parseSseAccounts(await get(sseUrl(y === year ? '' : `${y}12`), 'json', SSE_UA))
    if (rows.length && rows.every(r => r.month.startsWith(String(y)))) years[y] = rows
  }
  const s = Object.keys(years).sort().flatMap(y => years[y]).filter(r => r.month <= asOf.slice(0, 7)).map(r => ({ date: `${r.month}-01`, v: r.v }))
  const last = s.at(-1)
  if (!last) throw new Error('上交所新增投资者为空')
  const w = windowPct(s, null, 12)
  return {
    years,
    ind: ind({
      id: 'accounts', group: 'mood', name: '新增投资者（上交所，月）', unit: '万户', digits: 2, value: last.v, date: last.date, month: last.date.slice(0, 7), pct: w.pct, window: `${s[0].date.slice(0, 7)} 起全部月份`, start: s[0].date, n: w.n,
      signal: moodSignal(w.pct), rule: RULES.accounts, history: s.map(p => [p.date, p.v]),
      note: '上交所「一户通」月度新增投资者数（万户，含 A 股、B 股与基金账户）。中国结算全市场开户数自 2023 年 8 月起停止按月公布，这里只有上交所口径；该表 2021 年起有月度数据。',
    }),
  }
}

async function main() {
  const t0 = Date.now()
  const { today, candidate } = targetDate()
  const core = await valuationCore(candidate)
  if (core.idx < 0) { console.log(`${today}：估值输入没有共同的完整交易日，未更新`); return }
  const asOf = core.rows[core.idx].date
  const prev = readJson(OUT, null)
  if (prev?.asOf && prev.asOf > asOf) { console.log(`已有更新的信号板文件（${prev.asOf}），本次 ${asOf} 不覆盖`); return }
  const days = core.perf.map(r => r.date).filter(d => d <= asOf)

  const errors = []
  const safe = async (id, fn) => {
    try { return await fn() } catch (e) {
      errors.push({ id, message: e.message }); console.log(`${id} 未更新：${e.message}`)
      return null
    }
  }
  const sameDay = prev?.asOf === asOf ? prev : null
  const keepPrev = (ids) => (sameDay ? sameDay.indicators.filter(i => ids.includes(i.id)) : [])

  const buffett = await safe('buffett', () => buffettInd(asOf))
  const val = valuationInds(core.rows, core.idx)
  const trM2 = await safe('trM2', () => trM2Ind(asOf))
  const margin = await safe('margin', () => marginInd(asOf))
  const amount = await safe('amount', async () => amountInd(asOf))
  const ipo = await safe('ipo', () => ipoInds(asOf, days))
  const funds = await safe('funds', () => fundsInd(asOf))
  const accounts = await safe('accounts', () => accountsInd(asOf))

  const indicators = [
    ...(buffett ? [buffett] : keepPrev(['buffett'])), ...val,
    ...(trM2 ? [trM2] : keepPrev(['trM2'])),
    ...(margin ? [margin] : keepPrev(['margin'])), ...(amount ? [amount] : keepPrev(['amount'])),
    ...(ipo ?? keepPrev(['ipoCount', 'ipoBroken'])), ...(funds ? [funds.ind] : keepPrev(['funds'])), ...(accounts ? [accounts.ind] : keepPrev(['accounts'])),
  ]
  const order = ['buffett', 'erp', 'pb', 'trM2', 'margin', 'amount', 'ipoCount', 'ipoBroken', 'funds', 'accounts']
  indicators.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  const missing = order.filter(id => !indicators.some(i => i.id === id))
  if (sameDay && sameDay.indicators.length > indicators.length) { console.log(`同日已有更完整的文件（${sameDay.indicators.length} 项），本次 ${indicators.length} 项不覆盖`); return }

  const news = loadNews(asOf)

  fs.mkdirSync(RAW, { recursive: true })
  if (funds) fs.writeFileSync(FUND_FILE, JSON.stringify({ updatedAt: asOf, months: funds.months }, null, 1) + '\n')
  if (accounts) fs.writeFileSync(SSE_FILE, JSON.stringify({ updatedAt: asOf, years: accounts.years }, null, 1) + '\n')
  const data = {
    version: 1, asOf, generatedAt: new Date().toISOString(), indicators, summary: summarize(indicators), missing,
    errors: errors.map(e => `${e.id}：${e.message}`),
    news,
    sources: [
      { label: '中证指数官网 · 中证全指行情（滚动市盈率）', url: csiPerfUrl('000985', addDays(asOf, -30), asOf) },
      { label: '中证指数官网 · 中证全指全收益（H00985）', url: csiPerfUrl('H00985', addDays(asOf, -30), asOf) },
      { label: '中证指数官网 · 行业市盈率（板块：沪深市场 PB）', url: mvUrl(asOf) },
      { label: '东方财富 · 中美国债收益率', url: emUrl({ reportName: 'RPTA_WEB_TREASURYYIELD', columns: 'SOLAR_DATE,EMM00166466' }) },
      { label: '东方财富 · 市场估值（总市值）', url: emUrl({ reportName: 'RPT_VALUEMARKET', columns: 'TRADE_DATE,TRADE_MARKET_CODE,TOTAL_MARKET_CAP' }) },
      { label: '东方财富 · 国内生产总值（国家统计局）', url: emUrl({ reportName: 'RPT_ECONOMY_GDP', columns: 'REPORT_DATE,DOMESTICL_PRODUCT_BASE' }) },
      { label: '东方财富 · 货币供应量（M2）', url: emUrl({ reportName: 'RPT_ECONOMY_CURRENCY_SUPPLY', columns: 'REPORT_DATE,BASIC_CURRENCY' }) },
      { label: '东方财富 · 融资融券历史', url: emUrl({ reportName: 'RPTA_RZRQ_LSHJ', columns: 'DIM_DATE,RZYE,RZYEZB' }) },
      { label: '东方财富 · 新股申购与中签', url: emUrl({ reportName: 'RPTA_APP_IPOAPPLY', columns: 'SECURITY_CODE,LISTING_DATE,ISSUE_PRICE,CLOSE_PRICE' }) },
      { label: '天天基金 · 新成立基金', url: fundUrl(1, 50) },
      { label: '上海证券交易所 · 投资者月度新增', url: sseUrl('') },
    ],
  }
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(data) + '\n')
  fs.renameSync(`${OUT}.tmp`, OUT)
  console.log(JSON.stringify({ asOf, indicators: indicators.length, missing, summary: data.summary, ms: Date.now() - t0 }))
}

main().catch(e => { console.error(`牛熊信号板采集失败，未发布数据：${e.message}`); process.exitCode = 1 })
