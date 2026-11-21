import { readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { NYSE_SHORT_SESSIONS, NYSE_SHORT_SESSIONS_SOURCE } from './lib/us-market-calendar.mjs'

import { parseFred } from './us-market-data.mjs'

const FILE = new URL('../public/data/us-market-slices.json', import.meta.url)
const INDEX_HISTORY = new URL('../public/data/index-history.json', import.meta.url)
const NY_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York', dateStyle: 'short' })
const QUOTE_DELAY_SECONDS = 15 * 60
// Daily closes for the latest ~20 months (returns, volume ratios), weekly closes before that.
const DAILY_OBSERVATIONS = 420
const MAX_FUND_OBSERVATIONS = 1320
const MIN_OBSERVATIONS = 21
const STATE_STREET = 'https://www.ssga.com/us/en/institutional/etfs/state-street-'
const sponsorFunds = {
  mid: ['MDY', 'spdr-sp-midcap-400-etf-trust-mdy'],
  small: ['SPSM', 'spdr-portfolio-sp-600-small-cap-etf-spsm'],
  growth: ['SPYG', 'spdr-portfolio-sp-500-growth-etf-spyg'],
  value: ['SPYV', 'spdr-portfolio-sp-500-value-etf-spyv'],
  ...Object.fromEntries([
    ['XLC', 'communication-services'], ['XLY', 'consumer-discretionary'], ['XLP', 'consumer-staples'],
    ['XLE', 'energy'], ['XLF', 'financial'], ['XLV', 'health-care'], ['XLI', 'industrial'],
    ['XLB', 'materials'], ['XLRE', 'real-estate'], ['XLK', 'technology'], ['XLU', 'utilities'],
  ].map(([symbol, sector]) => {
    const ticker = symbol.toLowerCase()
    return [`sector-${ticker}`, [symbol, `${sector}-select-sector-spdr-etf-${ticker}`]]
  })),
}
const groupScope = {
  broad: '美股指数 · 价格指数',
  size: '美股市值分组 · 价格指数',
  style: '标普 500 风格 ETF 代理 · 价格',
  sector: '标普 500 行业 ETF 代理 · 价格',
}

export const US_MARKET_SLICES = [
  ['spx', '标普 500', 'broad', '^GSPC'],
  ['rsp', '标普 500 等权', 'broad', '^SPXEW'],
  ['ixic', '纳斯达克综合指数', 'broad', '^IXIC'],
  ['ndx', '纳斯达克 100', 'broad', '^NDX'],
  ['mid', '标普中盘 400', 'size', '^MID'],
  ['small', '标普小盘 600', 'size', '^SP600'],
  ['growth', '标普 500 成长', 'style', 'SPYG'],
  ['value', '标普 500 价值', 'style', 'SPYV'],
  ['xlc', '通信服务', 'sector', 'XLC'],
  ['xly', '可选消费', 'sector', 'XLY'],
  ['xlp', '必需消费', 'sector', 'XLP'],
  ['xle', '能源', 'sector', 'XLE'],
  ['xlf', '金融', 'sector', 'XLF'],
  ['xlv', '医疗保健', 'sector', 'XLV'],
  ['xli', '工业', 'sector', 'XLI'],
  ['xlb', '原材料', 'sector', 'XLB'],
  ['xlre', '房地产', 'sector', 'XLRE'],
  ['xlk', '信息技术', 'sector', 'XLK'],
  ['xlu', '公用事业', 'sector', 'XLU'],
].map(([id, name, group, symbol]) => ({
  id: group === 'sector' ? `sector-${id}` : id,
  name, group, symbol,
  scope: id === 'ixic' ? '纳斯达克上市的合资格股票 · 综合价格指数'
    : id === 'ndx' ? '纳斯达克上市的大型非金融公司 · 纳斯达克 100 价格指数' : groupScope[group],
  source: id === 'ixic' ? 'https://fred.stlouisfed.org/series/NASDAQCOM' : `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`,
  priceNote: '按美东交易日收盘价比较价格表现，现金分红另计。',
}))

export function parseMarketSlice(body, symbol, now) {
  const result = body?.chart?.result?.[0]
  const quote = result?.indicators?.quote?.[0]
  const meta = result?.meta
  if (meta?.symbol !== symbol || meta.currency !== 'USD' || meta.exchangeTimezoneName !== 'America/New_York') {
    throw new Error('来源标的、币种或时区不符')
  }
  if (!Array.isArray(result.timestamp) || !Array.isArray(quote?.close)) throw new Error('无日线')

  const today = NY_DATE.format(now)
  const session = meta.currentTradingPeriod?.regular
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const completedToday = Number.isFinite(session?.start) && Number.isFinite(session?.end)
    && NY_DATE.format(session.start * 1000) === today
    && nowSeconds >= session.end + QUOTE_DELAY_SECONDS
    && meta.regularMarketTime >= session.end
  const byDate = new Map()
  result.timestamp.forEach((timestamp, index) => {
    const close = quote.close[index]
    if (!Number.isFinite(timestamp) || !Number.isFinite(close) || close <= 0) return
    const date = NY_DATE.format(timestamp * 1000)
    if (date > today || (date === today && !completedToday)) return
    byDate.set(date, { close, volume: quote.volume?.[index] })
  })
  const rows = compactPrices([...byDate].sort(([a], [b]) => a.localeCompare(b)))
  return {
    history: rows.map(([date, { close }]) => [date, Number(close.toFixed(2))]),
    volume: rows.slice(-DAILY_OBSERVATIONS).flatMap(([date, { volume }]) => Number.isFinite(volume) && volume > 0 ? [[date, volume]] : []),
  }
}

async function fetchChart(symbol) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1d`
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function fetchFundPage(source) {
  const response = await fetch(source, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

export function parseFundCharacteristics(html, symbol, now) {
  if (!html.match(new RegExp(`<title>\\s*${symbol}:`, 'i'))) throw new Error('发行人页面标的不符')
  const section = /<h2\b[^>]*>\s*Fund Characteristics\b([\s\S]*?)<\/section>/i.exec(html)?.[1]
  const displayDate = section?.match(/as of ([A-Z][a-z]{2} \d{1,2} \d{4})/i)?.[1]
  const date = displayDate ? Date.parse(`${displayDate} UTC`) : NaN
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) > NY_DATE.format(now)) {
    throw new Error('发行人披露日期缺失或晚于当前日期')
  }
  const rows = [...section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => row[1])
  const readMetric = label => {
    const row = rows.find(entry => entry.includes(label))
    const value = row?.match(/<td\b[^>]*>\s*(-?\d+(?:\.\d+)?)%?\s*<\/td>/i)?.[1]
    return value === undefined ? undefined : Number(value)
  }
  const valuation = readMetric('Price/Earnings Ratio FY1')
  const earnings = readMetric('Est. 3-5 Year EPS Growth')
  if (!(valuation > 0) && earnings === undefined) throw new Error('发行人未披露远期估值或盈利增速')
  return { date: new Date(date).toISOString().slice(0, 10), valuation: valuation > 0 ? valuation : undefined, earnings }
}

/** Keeps the last DAILY_OBSERVATIONS rows daily and one close per ISO week before them. */
export function compactPrices(rows) {
  const recent = rows.slice(-DAILY_OBSERVATIONS)
  const weekly = new Map()
  for (const row of rows.slice(0, -DAILY_OBSERVATIONS)) {
    const at = new Date(row[0] + 'T00:00:00Z')
    at.setUTCDate(at.getUTCDate() + 4 - (at.getUTCDay() || 7))
    weekly.set(at.toISOString().slice(0, 10), row)
  }
  return [...weekly.values(), ...recent]
}

function latestDate(series) {
  return series?.history?.at(-1)?.[0] ?? ''
}

function mergePriceHistory(data, old, hasTradableVolume) {
  const prices = new Map(data.history)
  const oldHistory = old?.history ?? []
  // A common close guards against splicing older prices across a provider split adjustment.
  const overlap = oldHistory.filter(([date]) => prices.has(date)).slice(-5)
  const comparable = overlap.length > 0 && overlap.every(([date, price]) => Math.abs(prices.get(date) / price - 1) <= .02)
  const history = comparable
    ? compactPrices([...new Map([...oldHistory, ...data.history])].sort(([a], [b]) => a.localeCompare(b)))
    : data.history
  const volumes = new Map([...(comparable ? old?.volume ?? [] : []), ...data.volume])
  const volume = hasTradableVolume ? history.flatMap(([date]) => volumes.has(date) ? [[date, volumes.get(date)]] : []) : []
  return { history, ...(volume.length ? { volume } : {}) }
}

function indexValuation(index, now) {
  const value = index?.agg?.fwd
  const date = index?.agg?.date
  if (!(Number.isFinite(value) && value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= NY_DATE.format(now))) return undefined
  return { date, value, scope: '项目指数成分股汇总 · 前瞻 P/E' }
}

function mergeFundHistory(incoming, current) {
  const latest = incoming && (!current || incoming.date >= current.date) ? incoming : current
  if (!latest) return undefined
  const history = new Map()
  for (const metric of [current, incoming]) {
    if (!metric || metric.scope !== latest.scope || metric.source !== latest.source) continue
    for (const [date, value] of metric.history ?? []) history.set(date, value)
    history.set(metric.date, metric.value)
  }
  return {
    ...latest,
    history: [...history].sort(([a], [b]) => a.localeCompare(b)).slice(-MAX_FUND_OBSERVATIONS),
  }
}

async function sponsorCharacteristics([symbol, slug], fetchHtml, now) {
  const source = `${STATE_STREET}${slug}`
  const { date, valuation, earnings } = parseFundCharacteristics(await fetchHtml(source), symbol, now)
  return {
    valuation: valuation === undefined ? undefined : { date, value: valuation, source, scope: `${symbol} 基金持仓 · FY1 P/E` },
    earnings: earnings === undefined ? undefined : { date, value: earnings, source, scope: `${symbol} 基金持仓 · 预计 3–5 年 EPS 增速` },
  }
}

export async function buildUsMarketSlices({
  previous, indexHistory, fetchJson = fetchChart, fetchHtml = fetchFundPage, now = new Date(), slices = US_MARKET_SLICES,
} = {}) {
  const oldById = new Map((previous?.slices ?? []).map(slice => [slice.id, slice]))
  const result = {
    generatedAt: now.toISOString(),
    shortSessions: NYSE_SHORT_SESSIONS,
    shortSessionsSource: NYSE_SHORT_SESSIONS_SOURCE,
    slices: [],
    warnings: [],
    fundWarnings: [],
  }
  const update = async definition => {
    const previousSlice = oldById.get(definition.id)
    const old = previousSlice?.symbol === definition.symbol ? previousSlice : undefined
    const fund = sponsorFunds[definition.id]
    const fundRequest = fund ? sponsorCharacteristics(fund, fetchHtml, now).catch(error => {
      result.fundWarnings.push(`${fund[0]}：${error.message}`)
      return {}
    }) : Promise.resolve({})
    let price = { history: old?.history ?? [], ...(old?.volume?.length ? { volume: old.volume } : {}) }
    try {
      let data
      if (definition.id === 'ixic') {
        const table = await fetchHtml('https://fred.stlouisfed.org/data/NASDAQCOM')
        const today = NY_DATE.format(now)
        const points = parseFred(table, 1).history.filter(([day, close]) => day <= today && close > 0)
        const history = [...new Map(points)].sort(([a], [b]) => a.localeCompare(b))
        data = { history: compactPrices(history), volume: [] }
      } else {
        data = parseMarketSlice(await fetchJson(definition.symbol), definition.symbol, now)
      }
      if (data.history.length < MIN_OBSERVATIONS) throw new Error('日线覆盖不足')
      if (latestDate(data) < latestDate(old)) throw new Error('返回行情观察日早于现有快照')
      price = mergePriceHistory(data, old, !definition.symbol.startsWith('^'))
    } catch (error) {
      result.warnings.push(`${definition.symbol}：${error.message}，${old?.history?.length ? '保留旧快照' : '行情未取得'}`)
    }
    const fundamental = await fundRequest
    const valuation = mergeFundHistory(fundamental.valuation ?? indexValuation(indexHistory?.indexes?.[definition.id], now), old?.valuation)
    const earnings = mergeFundHistory(fundamental.earnings, old?.earnings)
    return {
      ...definition, ...price,
      ...(valuation ? { valuation } : {}),
      ...(earnings ? { earnings } : {}),
      ...(old?.breadth ? { breadth: old.breadth } : {}),
    }
  }
  // Keep Yahoo requests bounded without serializing the entire run.
  for (let i = 0; i < slices.length; i += 4) {
    result.slices.push(...await Promise.all(slices.slice(i, i + 4).map(update)))
  }
  result.warnings.sort()
  result.fundWarnings.sort()
  if (previous?.generatedAt && isDeepStrictEqual(previous, { ...result, generatedAt: previous.generatedAt })) return previous
  return result
}

async function readSnapshot(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [previous, indexHistory] = await Promise.all([readSnapshot(FILE), readSnapshot(INDEX_HISTORY)])
  const result = await buildUsMarketSlices({ previous, indexHistory })
  for (const warning of [...result.warnings, ...result.fundWarnings]) console.warn(warning)
  if (result.warnings.length === result.slices.length) throw new Error('各分类均未取得新行情，保留原文件')
  if (result === previous) {
    console.log('美股分类快照数据未变动')
  } else {
    const temporary = new URL(`./us-market-slices.json.${process.pid}.tmp`, FILE)
    await writeFile(temporary, `${JSON.stringify(result)}\n`)
    await rename(temporary, FILE)
    console.log(`美股分类行情：${result.slices.length - result.warnings.length}/${result.slices.length} 项更新`)
  }
}
