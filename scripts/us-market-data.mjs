import { execFile } from 'node:child_process'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { computeEquityLongShort, parseFinraMargin, parseOfrTimeseries, sharedStrings, unzipEntry } from '../server/macro.mjs'
import { localParts, MARKETS } from './lib/trading-calendar.mjs'
import { NYSE_SHORT_SESSIONS } from './lib/us-market-calendar.mjs'

const BASE = 'https://www.ici.org'
const CBOE = 'https://cdn.cboe.com/resources/us/equities/market-statistics/historical-market-volume/market_history_'
const TREND = BASE + '/monthly-trends-in-mutual-fund-investing'
const FRED = 'https://fred.stlouisfed.org/data/'
const FINRA = 'https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics'
const FINRA_HISTORY = 'https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx'
const CFTC = 'https://www.cftc.gov/dea/futures/financial_lf.htm'
const CFTC_DATA = 'https://publicreporting.cftc.gov/Commitments-of-Traders/TFF-Futures-Only/gpe5-46if'
const CFTC_API = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json'
const CFTC_CONTRACTS = [['Spx', 'S&P 500 Consolidated', '13874+'], ['Ndx', 'NASDAQ-100 Consolidated', '20974+']]
const ALLOCATION = 'https://www.aaii.com/assetallocationsurvey'
const SENTIMENT = 'https://www.aaii.com/sentimentsurvey'
const MMF = BASE + '/research/stats/mmf'
const FLOW = BASE + '/research/stats/combined_flows'
const VOLUME = 'https://www.cboe.com/markets/us/equities/market-statistics/historical-market-volume'
const OFR = 'https://www.financialresearch.gov/hedge-fund-monitor/datasets/fpf/'
const OFR_API = 'https://data.financialresearch.gov/hf/v1/series/multifull?mnemonics='
const OFR_GROSS = 'FPF-ASSETCLASS_EQUITIES_GNE_SUM'
const OFR_CASH_LONG = 'FPF-ASSETCLASS_LEQYSEC_SUM'
const OFR_CASH_SHORT = 'FPF-ASSETCLASS_SEQYSEC_SUM'
const SHORT_SESSIONS = new Set(NYSE_SHORT_SESSIONS)
// Tape venues N/P/Q/K/Z and the two large off-exchange FINRA trade-reporting facilities.
const CBOE_CORE_VENUES = ['N', 'P', 'Q', 'K', 'Z', 'DN', 'DQ']
const OUTPUT = fileURLToPath(new URL('../public/data/us-market-data.json', import.meta.url))
const run = promisify(execFile)

const MONTHS = 'January February March April May June July August September October November December'.split(' ')
const meta = (name, unit, source, scope, frequency) => ({ name, unit, source, scope, frequency })
const specs = {
  retailCash: meta('散户现金仓位（AAII）', '%', ALLOCATION, '美国 AAII 个人投资者会员调查；2026 年 10 月报告给出的历史均值为 22.0%', '月频'),
  retailStocks: meta('散户股票及股票基金仓位（AAII）', '%', ALLOCATION, '美国 AAII 个人投资者会员调查', '月频'),
  retailBull: meta('散户看多（AAII）', '%', SENTIMENT, '美国 AAII 会员对未来六个月的看法', '周频'),
  retailBear: meta('散户看空（AAII）', '%', SENTIMENT, '美国 AAII 会员对未来六个月的看法', '周频'),
  fundLiquidity: meta('股票共同基金流动资产比率（ICI）', '%', TREND, '美国股票共同基金行业，包含投资境内及境外股票的基金', '月频'),
  mmfTotal: meta('美国货币基金资产（ICI）', '亿美元', MMF, '美国货币基金总资产', '周频'),
  mmfRetail: meta('零售类货币基金资产（ICI）', '亿美元', MMF, '美国零售类货币基金', '周频'),
  mmfInstitutional: meta('机构类货币基金资产（ICI）', '亿美元', MMF, '美国机构类货币基金', '周频'),
  domesticFlows: meta('美国国内股票基金净流入（ICI）', '亿美元', FLOW, '美国国内股票共同基金估计净流量 + ETF 净发行', '周频'),
  volume: meta('美股全市场成交量（Cboe）', '亿股', VOLUME, '纽约当日之前、主要交易所和 FINRA 交易报告设施（TRF）齐备的成交日，保留提前收盘日成交量', '日频'),
  volumeRatio: meta('美股全市场 20 日量比（Cboe）', '倍', VOLUME, '本交易日成交股数 ÷ 前 20 个完整交易日均量；涵盖交易所及 TRF，排除纽约证交所公布的提前收盘日', '日频'),
  cftcSpxLev: meta('杠杆基金 · 标普 500 期货净仓', '%', CFTC, 'CFTC 仅期货，标普合并合约；杠杆基金净仓 ÷ 全合约未平仓量', '周频'),
  cftcNdxLev: meta('杠杆基金 · 纳指 100 期货净仓', '%', CFTC, 'CFTC 仅期货，纳指合并合约；杠杆基金净仓 ÷ 全合约未平仓量', '周频'),
  cftcSpxAsset: meta('资产管理机构 · 标普 500 期货净仓', '%', CFTC, 'CFTC 仅期货，标普合并合约；资管机构净仓 ÷ 全合约未平仓量', '周频'),
  cftcNdxAsset: meta('资产管理机构 · 纳指 100 期货净仓', '%', CFTC, 'CFTC 仅期货，纳指合并合约；资管机构净仓 ÷ 全合约未平仓量', '周频'),
  finraDebt: meta('证券保证金账户借方余额（FINRA）', '亿美元', FINRA, 'FINRA 申报券商客户的证券保证金账户', '月频'),
  finraDebtYoy: meta('证券保证金借方余额同比（FINRA）', '%', FINRA, '同一口径保证金借方余额相对去年同月的增长率', '月频'),
  finraCashDebt: meta('券商客户自由贷方余额／融资（FINRA）', '%', FINRA, 'FINRA 申报券商客户的现金和保证金账户合计自由贷方余额 ÷ 借方余额', '月频'),
  ofrEquityGross: meta('对冲基金股票总名义敞口（OFR）', '亿美元', OFR, '大型合格对冲基金，涵盖美国和境外股票、股指及其衍生品，多仓与空仓名义敞口绝对值之和', '季频'),
  ofrCashEquityLs: meta('对冲基金股票现货多空比（OFR）', '倍', OFR, '大型合格对冲基金全球股票现货多头证券敞口 ÷ 空头证券敞口，排除衍生品', '季频'),
  hyDaily: meta('美国高收益债信用利差（FRED）', 'bp', FRED + 'BAMLH0A0HYM2', 'ICE BofA 美国高收益债期权调整利差', '日频'),
  vixDaily: meta('VIX（FRED）', '点', FRED + 'VIXCLS', '标普 500 期权隐含波动率指数', '日频'),
  tenYearDaily: meta('美国 10 年期国债收益率（FRED）', '%', FRED + 'DGS10', '美联储 H.15，美国 10 年期固定期限国债收益率', '日频'),
}

function clean(markup) {
  return markup.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&(?:minus|#8722);/gi, '−').replace(/\s+/g, ' ').trim()
}

function rows(markup) {
  return [...markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, row]) =>
    [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, cell]) => clean(cell)))
}

function number(raw) {
  const value = String(raw ?? '').trim().replace(/[, ]/g, '').replace(/−/g, '-')
  return /^-?\d+(?:\.\d+)?%?$/.test(value) ? Number(value.replace('%', '')) : NaN
}

function date(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day))
  return year >= 1900 && year < 2100 && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
    ? value.toISOString().slice(0, 10) : undefined
}

function monthIndex(name) {
  return MONTHS.findIndex(month => month.toLowerCase().startsWith(name.toLowerCase())) + 1
}

function monthEnd(name, year) {
  const month = name && monthIndex(name)
  return month && Number(year) >= 1900 ? new Date(Date.UTC(Number(year), month, 0)).toISOString().slice(0, 10) : undefined
}

function calendarDate(text) {
  const match = text.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/)
  return match && date(Number(match[3]), monthIndex(match[1]), Number(match[2]))
}

function slashDate(text) {
  const match = text?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return match && date(Number(match[3]), Number(match[1]), Number(match[2]))
}

function record(history, releasedAt) {
  return { history, ...(releasedAt && { releasedAt }) }
}

function requireReadings(history, label) {
  if (!history.length) throw new Error(label + ' 未找到可核实的观测值')
  return history
}

function published(markup) {
  const body = clean(markup)
  return calendarDate(body.match(/Washington,\s*DC\s*[;:][^—]{0,40}/i)?.[0] ?? '')
}

export function parseAllocation(markup) {
  const text = clean(markup)
  const period = text.match(/Asset Allocation Results for ([a-z]+) (\d{4})/i)
  const observedAt = period && monthEnd(period[1], period[2])
  const data = rows(markup)
  // Cells may be blank spacers or carry the monthly change, e.g. "13.31% (-0.04%)".
  const share = (label, pattern) => {
    const cells = data.find(row => label.test(row[0]))?.slice(1) ?? []
    const cell = cells.map(value => value.match(/^(\d+(?:\.\d+)?)%/)?.[1]).find(Boolean)
    return number(cell ?? text.match(pattern)?.[1])
  }
  const stocks = share(/^stocks total$/i, /Stocks Total\s+(\d+(?:\.\d+)?%)/i)
  const cash = share(/^cash$/i, /\bCash\s+(\d+(?:\.\d+)?%)/i)
  if (!observedAt || !(stocks > 0 && cash > 0 && stocks + cash <= 100.1)) throw new Error('AAII 资产配置表已变化')
  const release = calendarDate(text.match(/Commentary [^|]{0,40}/i)?.[0] ?? '')
  const releasedAt = release && release > observedAt ? release : undefined
  return {
    retailCash: record([[observedAt, cash]], releasedAt),
    retailStocks: record([[observedAt, stocks]], releasedAt),
  }
}

export function parseSentiment(markup) {
  const recent = clean(markup).match(/Recent weekly results\s+(.*?)(?:Historical view|How the survey works)/i)?.[1] ?? ''
  const cardRows = [...recent.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d[\d.]*%)\s+(\d[\d.]*%)\s+(\d[\d.]*%)/g)]
    .map(match => match.slice(1))
  const entries = []
  for (const row of [...rows(markup), ...cardRows]) {
    const day = slashDate(row[0])
    const [bull, neutral, bear] = row.slice(1, 4).map(number)
    if (day && [bull, neutral, bear].every(x => x >= 0 && x <= 100) && Math.abs(bull + neutral + bear - 100) < .25) {
      entries.push({ day, bull, bear })
    }
  }
  const readings = requireReadings(entries, 'AAII 情绪')
  return {
    retailBull: record(readings.map(({ day, bull }) => [day, bull])),
    retailBear: record(readings.map(({ day, bear }) => [day, bear])),
  }
}

function iciTable(markup, identify) {
  for (const [html] of markup.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const data = rows(html)
    const header = data.find(row => row.filter(slashDate).length >= 2)
    if (!header || !identify(data)) continue
    return { data, header }
  }
  throw new Error('ICI 发布表格已变化')
}

function iciAmounts(header, row, scale) {
  return requireReadings(header.flatMap((label, index) => {
    const day = slashDate(label)
    const observation = number(row?.[index])
    return day && Number.isFinite(observation) ? [[day, rounded(observation * scale)]] : []
  }), 'ICI')
}

export function parseMoneyFunds(markup) {
  const { data, header } = iciTable(markup, entries => entries.some(row => /^government$/i.test(row[0])))
  const total = data.findIndex(row => /^total$/i.test(row[0]))
  if (total < 0 || !/^retail$/i.test(data[total + 1]?.[0]) || !/^institutional$/i.test(data[total + 2]?.[0])) {
    throw new Error('ICI 货币基金总额分类已变化')
  }
  const release = published(markup)
  return {
    mmfTotal: record(iciAmounts(header, data[total], 10), release),
    mmfRetail: record(iciAmounts(header, data[total + 1], 10), release),
    mmfInstitutional: record(iciAmounts(header, data[total + 2], 10), release),
  }
}

export function parseIciFlows(markup) {
  const { data, header } = iciTable(markup, entries => entries.some(row => /^domestic(?: equity)?$/i.test(row[0])))
  const domestic = data.find(row => /^domestic(?: equity)?$/i.test(row[0]))
  return { domesticFlows: record(iciAmounts(header, domestic, .01), published(markup)) }
}

export function parseFundLiquidity(markup, source) {
  const text = clean(markup)
  const period = text.match(/Trends in Mutual Fund Investing,\s+([a-z]+) (\d{4})/i)
  const day = period && monthEnd(period[1], period[2])
  const liquidity = text.match(/liquidity ratio of equity funds\s*(?:\([^)]*\)\s*)?was (\d+(?:\.\d+)?) percent in ([a-z]+)/i)
  if (!day || !liquidity || monthIndex(liquidity[2]) !== monthIndex(period[1])) throw new Error('ICI 股票基金流动资产比例的月份或口径已变化')
  const release = published(markup) ?? calendarDate(clean(markup.match(/<time\b[^>]*>([\s\S]*?)<\/time>/i)?.[1] ?? ''))
  return { fundLiquidity: { ...record([[day, Number(liquidity[1])]], release), source } }
}

export function parseVolume(csvFiles, { before = '', requiredVenues = [] } = {}) {
  const sessions = new Map()
  for (const csv of csvFiles) {
    const [head, ...observations] = csv.trim().split(/\r?\n/)
    const headings = head.replace(/^\uFEFF/, '').split(',')
    const dateIndex = headings.indexOf('Day')
    const venueIndex = headings.indexOf('Market Participant')
    const totalIndex = headings.indexOf('Total Shares')
    if ([dateIndex, venueIndex, totalIndex].includes(-1)) throw new Error('Cboe 历史成交 CSV 列已变化')
    for (const string of observations) {
      const row = (string.match(/"(?:[^"]|"")*"|[^,]+|(?<=,)(?=,)/g) ?? []).map(value => value.replace(/^"|"$/g, ''))
      const day = row[dateIndex]
      const venue = row[venueIndex]
      const shares = number(row[totalIndex])
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (before && day >= before) || !venue || /^total$/i.test(venue) || !(shares > 0)) continue
      if (!sessions.has(day)) sessions.set(day, new Map())
      sessions.get(day).set(venue.match(/\(([A-Z]{1,3})\)$/)?.[1] ?? venue, shares)
    }
  }
  const daily = requireReadings(sorted([...sessions].flatMap(([day, venues]) => requiredVenues.every(code => venues.has(code))
    ? [[day, [...venues.values()].reduce((sum, value) => sum + value, 0)]] : [])), 'Cboe 完整交易场所')
  const fullDays = daily.filter(([day]) => !SHORT_SESSIONS.has(day))
  const ratios = fullDays.slice(20).map(([day, shares], offset) => [
    day, rounded(shares * 20 / fullDays.slice(offset, offset + 20).reduce((sum, [, value]) => sum + value, 0), 4),
  ])
  return { volume: record(daily.map(([day, shares]) => [day, rounded(shares / 1e8, 4)])), volumeRatio: record(ratios) }
}

export function parseCftc(markup) {
  const text = clean(markup)
  const result = {}
  const sections = text.split(/Traders in Financial Futures\s*-\s*Futures Only Positions as of\s+/i).slice(1)
  for (const [key, label, code] of CFTC_CONTRACTS) {
    const section = sections.find(part => part.includes(label) && part.includes('Code #' + code))
    const day = section && calendarDate(section.slice(0, 30))
    const values = section?.slice(section.indexOf(label)).match(/Open Interest is\s+([\d,]+)\s+Positions\s+((?:[\d,]+\s+){13}[\d,]+)/i)
    const interest = number(values?.[1])
    const positions = values?.[2].trim().split(/\s+/).map(number)
    if (!day || !(interest > 0) || positions?.length !== 14) throw new Error('CFTC 合并股指期货数据已变化')
    result['cftc' + key + 'Lev'] = record([[day, rounded((positions[6] - positions[7]) / interest * 100)]])
    result['cftc' + key + 'Asset'] = record([[day, rounded((positions[3] - positions[4]) / interest * 100)]])
  }
  return result
}

export function parseCftcHistory(json) {
  const records = JSON.parse(json)
  if (!Array.isArray(records)) throw new Error('CFTC 历史接口未返回记录')
  const result = {}
  for (const [key, , code] of CFTC_CONTRACTS) {
    const leveraged = []
    const assetManager = []
    for (const item of records) {
      if (item.cftc_contract_market_code !== code) continue
      const day = item.report_date_as_yyyy_mm_dd?.slice(0, 10)
      const openInterest = number(item.open_interest_all)
      const positions = [
        item.lev_money_positions_long, item.lev_money_positions_short,
        item.asset_mgr_positions_long, item.asset_mgr_positions_short,
      ].map(number)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(openInterest > 0) || positions.some(value => !(value >= 0))) continue
      leveraged.push([day, rounded((positions[0] - positions[1]) / openInterest * 100)])
      assetManager.push([day, rounded((positions[2] - positions[3]) / openInterest * 100)])
    }
    result['cftc' + key + 'Lev'] = { ...record(requireReadings(leveraged, 'CFTC ' + code)), source: CFTC_DATA }
    result['cftc' + key + 'Asset'] = { ...record(assetManager), source: CFTC_DATA }
  }
  return result
}

export function parseFinra(markup) {
  const debts = []
  const cashToDebt = []
  for (const [period, debit, cash, margin] of rows(markup)) {
    const match = period?.match(/^([a-z]{3})-(\d{2})$/i)
    const observed = match && monthEnd(match[1], 2000 + Number(match[2]))
    const [debt, cashBalance, marginBalance] = [debit, cash, margin].map(number)
    if (!observed || !(debt > 0) || !(cashBalance >= 0) || !(marginBalance >= 0)) continue
    debts.push([observed, rounded(debt / 100)])
    cashToDebt.push([observed, rounded((cashBalance + marginBalance) / debt * 100)])
  }
  return {
    finraDebt: record(requireReadings(debts, 'FINRA')),
    finraCashDebt: record(cashToDebt),
  }
}

/** FINRA's full monthly workbook (since 1997), in the same units and month-end dates as the web table. */
export function parseFinraHistory(rows) {
  const monthEndOf = (first) => {
    const [year, month] = first.split('-').map(Number)
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  }
  const usable = rows.filter(({ debit, cash, margin }) => debit > 0 && cash >= 0 && margin >= 0)
  return {
    finraDebt: record(requireReadings(usable.map(({ date, debit }) => [monthEndOf(date), rounded(debit / 100)]), 'FINRA 历史')),
    finraCashDebt: record(usable.map(({ date, debit, cash, margin }) => [monthEndOf(date), rounded((cash + margin) / debit * 100)])),
  }
}

const DAY = 86_400_000
/**
 * Keeps long histories readable and small: daily series stay daily for the
 * latest ~13 months and keep one close per week before that.
 */
export function compactHistory(history, frequency, latest = history.at(-1)?.[0]) {
  if (!latest) return history
  const end = Date.parse(latest)
  const years = { 日频: 25, 周频: 25, 月频: 40, 季频: 40 }[frequency] ?? 40
  const kept = history.filter(([day]) => end - Date.parse(day) <= years * 366 * DAY)
  if (frequency !== '日频') return kept
  const weekly = new Map()
  for (const point of kept) {
    if (end - Date.parse(point[0]) <= 400 * DAY) { weekly.set(point[0], point); continue }
    const at = new Date(point[0] + 'T00:00:00Z')
    at.setUTCDate(at.getUTCDate() + 4 - (at.getUTCDay() || 7))
    weekly.set('w' + at.toISOString().slice(0, 10), point)
  }
  return sorted([...weekly.values()])
}

export function finraDebtGrowth(history) {
  const monthly = new Map(history.map(([day, value]) => [day.slice(0, 7), value]))
  return history.flatMap(([day, value]) => {
    const year = Number(day.slice(0, 4))
    const baseline = monthly.get((year - 1) + day.slice(4, 7))
    return baseline > 0 ? [[day, rounded((value / baseline - 1) * 100)]] : []
  })
}

export function parseOfrExposure(json) {
  const raw = JSON.parse(json)
  const points = key => raw[key]?.timeseries?.aggregation
  const gross = parseOfrTimeseries(points(OFR_GROSS)).map(([day, amount]) => [day, rounded(amount / 1e8)])
  const cash = computeEquityLongShort(points(OFR_CASH_LONG), points(OFR_CASH_SHORT))
  requireReadings([...gross, ...cash], 'OFR 股票敞口')
  return { ofrEquityGross: record(gross), ofrCashEquityLs: record(cash) }
}

export function parseFred(markup, scale) {
  const data = []
  for (const row of rows(markup)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(row[0]) && Number.isFinite(number(row[1]))) {
      data.push([row[0], rounded(number(row[1]) * scale)])
    }
  }
  // FRED compresses its older table into #date|value blocks. CSV uses the same two columns.
  for (const [, day, value] of markup.matchAll(/(?:^|#|\n)(\d{4}-\d{2}-\d{2})[,|]\s*(\d+(?:\.\d+)?)(?=\s|$)/g)) {
    data.push([day, rounded(Number(value) * scale)])
  }
  return record(requireReadings(data, 'FRED'))
}

function rounded(value, digits = 2) {
  return Number(value.toFixed(digits))
}

function sorted(history) {
  return history.sort(([a], [b]) => a.localeCompare(b))
}

export function mergeSeries(previous, incoming) {
  if (!incoming.history.length) return previous
  const oldHistory = previous?.history ?? []
  const latest = sorted([...incoming.history]).at(-1)[0]
  const older = oldHistory.at(-1)?.[0] > latest
  const winner = older ? previous : incoming
  const history = sorted([...new Map(older ? [...incoming.history, ...oldHistory] : [...oldHistory, ...incoming.history])])
  return { ...winner, history }
}

// Hosts disagree: FINRA rejects browser-like headers while AAII and ICI reject a bare
// user agent, so a 403 escalates from the bare request to full navigation headers.
const BARE_HEADERS = { 'User-Agent': 'Mozilla/5.0' }
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
}

async function curlText(url) {
  const headers = Object.entries(BROWSER_HEADERS).flatMap(([name, value]) => ['-H', `${name}: ${value}`])
  const { stdout } = await run('curl', ['--fail', '--silent', '--show-error', '--location', '--compressed', '--max-time', '15', ...headers, url],
    { maxBuffer: 8 * 1024 * 1024 })
  return stdout
}

async function download(url) {
  let response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(18000), headers: BARE_HEADERS })
    if (response.status === 403) response = await fetch(url, { signal: AbortSignal.timeout(18000), headers: BROWSER_HEADERS })
  } catch (error) {
    if (error.name !== 'TypeError') throw error
    // Some runners provide proxy access to curl but not to Node's default agent,
    // and some CDNs close Node's HTTP/2 socket where curl is served.
    return curlText(url)
  }
  if (response.status === 403) return curlText(url).catch(() => { throw new Error('HTTP 403') })
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return response.text()
}

async function fetchText(url) {
  const body = await download(url)
  // Imperva answers 200 with a script challenge once it flags the client.
  if (isBotChallenge(body)) throw new Error(BOT_CHALLENGE)
  return body
}

async function fetchBinary(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: BARE_HEADERS })
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return Buffer.from(await response.arrayBuffer())
}

export const BOT_CHALLENGE = '来源拦截自动访问'
export const isBotChallenge = (body) => body.length < 20_000 && /_Incapsula_Resource|Incapsula incident ID/i.test(body)

async function fetchLiquidity(read) {
  const listing = await read(TREND)
  const matched = [...listing.matchAll(/href=["']([^"']+)["'][^>]*>\s*Release:\s*Trends in Mutual Fund Investing,\s*[a-z]+ \d{4}\s*<\/a>/gi)][0]
    ?? listing.match(/href=["'](\/research\/stats\/trends_\d{2}_\d{2})["']/i)
  if (!matched) throw new Error('ICI 月报列表未找到本期发布链接')
  const url = new URL(matched[1], TREND)
  if (url.origin !== BASE) throw new Error('ICI 月报链接校验失败')
  return parseFundLiquidity(await read(url.href), url.href)
}

async function fetchVolume(read, before) {
  const year = Number(before.slice(0, 4))
  const current = await read(CBOE + year + '.csv')
  // Use the same Cboe annual feed across the year boundary for the full-session baseline.
  const days = [...current.matchAll(/^(\d{4}-\d{2}-\d{2}),/gm)].map(match => match[1]).filter(day => day < before)
  const files = new Set(days).size < 42 ? [await read(CBOE + (year - 1) + '.csv'), current] : [current]
  return parseVolume(files, { before, requiredVenues: CBOE_CORE_VENUES })
}

async function fetchCftc(read) {
  const query = new URLSearchParams({
    '$where': "cftc_contract_market_code in ('13874+','20974+')",
    '$select': 'report_date_as_yyyy_mm_dd,cftc_contract_market_code,open_interest_all,asset_mgr_positions_long,asset_mgr_positions_short,lev_money_positions_long,lev_money_positions_short',
    '$order': 'report_date_as_yyyy_mm_dd DESC',
    '$limit': '320',
  })
  try {
    return parseCftcHistory(await read(CFTC_API + '?' + query))
  } catch {
    return parseCftc(await read(CFTC))
  }
}

export async function collectUsMarketData(previous, { read = fetchText, readBinary = fetchBinary, now = new Date() } = {}) {
  const beforeNyDay = localParts(now, MARKETS.us.tz).date
  const jobs = {
    'AAII 资产配置': [['retailCash', 'retailStocks'], async () => parseAllocation(await read(ALLOCATION))],
    'AAII 情绪': [['retailBull', 'retailBear'], async () => parseSentiment(await read(SENTIMENT))],
    'ICI 货币基金': [['mmfTotal', 'mmfRetail', 'mmfInstitutional'], async () => parseMoneyFunds(await read(MMF))],
    'ICI 资金流': [['domesticFlows'], async () => parseIciFlows(await read(FLOW))],
    'ICI 流动资产比率': [['fundLiquidity'], async () => fetchLiquidity(read)],
    'Cboe 成交': [['volume', 'volumeRatio'], async () => fetchVolume(read, beforeNyDay)],
    'CFTC 仓位': [['cftcSpxLev', 'cftcNdxLev', 'cftcSpxAsset', 'cftcNdxAsset'], async () => fetchCftc(read)],
    'FINRA 保证金': [['finraDebt', 'finraCashDebt', 'finraDebtYoy'], async () => parseFinra(await read(FINRA))],
    // No keys: a failed archive download must not flag the fresher web-table months.
    'FINRA 历史': [[], async () => {
      const book = await readBinary(FINRA_HISTORY)
      return parseFinraHistory(parseFinraMargin(unzipEntry(book, 'xl/worksheets/sheet1.xml'), sharedStrings(book)))
    }],
    'OFR 股票敞口': [['ofrEquityGross', 'ofrCashEquityLs'], async () => parseOfrExposure(await read(OFR_API + [OFR_GROSS, OFR_CASH_LONG, OFR_CASH_SHORT].join(',')))],
    'FRED 高收益债利差': [['hyDaily'], async () => ({ hyDaily: parseFred(await read(FRED + 'BAMLH0A0HYM2'), 100) })],
    'FRED VIX': [['vixDaily'], async () => ({ vixDaily: parseFred(await read(FRED + 'VIXCLS'), 1) })],
    'FRED 10 年期美债': [['tenYearDaily'], async () => ({ tenYearDaily: parseFred(await read(FRED + 'DGS10'), 1) })],
  }
  const entries = Object.entries(jobs)
  const settled = await Promise.allSettled(entries.map(([, [, load]]) => load()))
  const series = { ...previous?.series }
  const warnings = []
  let sourcesUpdated = 0
  const today = now.toISOString().slice(0, 10)
  for (const key of ['volume', 'volumeRatio']) {
    const prior = series[key]
    if (prior) series[key] = { ...prior, history: prior.history.filter(([day]) =>
      day < beforeNyDay && (key !== 'volumeRatio' || !SHORT_SESSIONS.has(day))) }
  }
  for (const [index, result] of settled.entries()) {
    const [name, [keys]] = entries[index]
    if (result.status === 'rejected') {
      const issue = refreshError(result.reason)
      warnings.push(name + '：' + issue)
      for (const key of keys) if (series[key]) series[key] = { ...series[key], refreshError: issue }
      continue
    }
    let accepted = false
    for (const [key, values] of Object.entries(result.value)) {
      const previousSeries = series[key]
      const history = values.history.filter(([day]) => day <= today)
      if (!history.length) continue
      // A successful Cboe download supersedes the covered interval so rejected
      // venue days cannot quietly survive in previously published snapshots.
      const volumeStart = result.value.volume?.history[0]?.[0]
      const current = volumeStart && previousSeries ? {
        ...previousSeries, history: previousSeries.history.filter(([day]) => day < volumeStart),
      } : previousSeries
      const newest = sorted([...history]).at(-1)[0]
      const priorDay = current?.history.at(-1)?.[0]
      const release = values.releasedAt || (priorDay === newest ? current?.releasedAt : undefined)
      const updated = mergeSeries(current, { ...specs[key], ...values, releasedAt: release, history })
      if (!updated) continue
      delete updated.refreshError
      updated.history = compactHistory(updated.history, updated.frequency)
      series[key] = updated
      accepted = true
    }
    if (accepted) sourcesUpdated++
    else warnings.push(name + '：没有适用的已发生观测值')
  }
  const marginDebt = series.finraDebt?.history ?? []
  const marginGrowth = finraDebtGrowth(marginDebt)
  if (marginGrowth.length) series.finraDebtYoy = mergeSeries(series.finraDebtYoy, {
    ...specs.finraDebtYoy, history: marginGrowth, ...(series.finraDebt.refreshError && { refreshError: series.finraDebt.refreshError }),
  })
  return { snapshot: { series }, warnings, sourcesUpdated }
}

function refreshError(error) {
  const message = String(error?.message ?? error)
  const http = message.match(/(?:HTTP |returned error: )(\d{3})\b/)
  if (http) return 'HTTP ' + http[1]
  if (/^(?:fetch failed|Command failed: curl|The operation was aborted)/i.test(message)) return '来源连接失败'
  return message.split('\n')[0].slice(0, 100)
}

async function main() {
  const previous = await readFile(OUTPUT, 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return { series: {} }
    throw error
  })
  const { snapshot, warnings, sourcesUpdated } = await collectUsMarketData(previous)
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
  if (!sourcesUpdated) throw new Error('美股市场补充数据源均不可用，保留上一份观测值')
  console.log('美股市场补充数据：' + sourcesUpdated + ' 个来源可用，' + Object.keys(snapshot.series).length + ' 项序列')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
