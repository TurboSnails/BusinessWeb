import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { unzipEntry } from '../../ths-etf-lib.mjs'
import { parseCboeIndex, parseYahooFuturesClose } from '../../us-market-data.mjs'
import { readJson, writeJsonIfChanged } from '../json-io.mjs'
import { marketSeries, month, parseFrenchMonthly } from '../macro-posture-market/data.mjs'
import { readMarket } from '../macro-posture-market/components.mjs'
import { parseFred, parseMultplMonthly } from '../macro-posture-research/fetch.mjs'
import { addDays, ageDays, clean, monthEnd } from '../macro-posture/panel.mjs'

const FRED_SERIES = 'https://fred.stlouisfed.org/series/'
const FRED_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id='
const CBOE = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/'
const EPS = 'https://www.multpl.com/s-p-500-earnings/table/by-month'
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/'
export const SQUEEZE_DIX = 'https://squeezemetrics.com/monitor/static/DIX.csv'
export const FRENCH_INDUSTRIES_DAILY = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_daily_CSV.zip'
export const FRENCH_INDUSTRIES = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_CSV.zip'
export const CASH_SERIES = ['CDCABSHNO', 'TSDABSHNO', 'MMFSABSHNO', 'TFAABSHNO']

function normalize(rows = [], through) {
  return [...new Map(rows.filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(v) && d <= through))].sort(([a], [b]) => a.localeCompare(b))
}

export async function refreshRadarSources({ cache, fetcher, today, localVix, shillerEps, warn }) {
  const sources = {}
  let lastRequest = -Infinity
  async function refresh(id, url, parse, headers) {
    const path = join(cache, id + '.json')
    const previous = readJson(path, [])
    try {
      const wait = 1000 - (performance.now() - lastRequest)
      if (wait > 0) await delay(Math.ceil(wait))
      lastRequest = performance.now()
      const response = await fetcher(url, { signal: AbortSignal.timeout(20_000), ...(headers ? { headers } : {}) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const fresh = normalize(parse(await response.text()), today)
      if (!fresh.length || (previous.length && (fresh[0][0] > previous[0][0] || fresh.at(-1)[0] < previous.at(-1)[0]))) {
        throw new Error('来源历史覆盖不足')
      }
      writeJsonIfChanged(path, fresh)
      return fresh
    } catch (error) {
      if (!previous.length) throw new Error(`${id} 下载失败且没有缓存：${error.message}`, { cause: error })
      warn(`${id} 沿用至 ${previous.at(-1)[0]} 的缓存：${error.message}`)
      return normalize(previous, today)
    }
  }
  for (const id of CASH_SERIES) {
    sources[id] = await refresh(id, FRED_CSV + id, csv => parseFred(csv, id))
  }
  const cboe = id => refresh(id, CBOE + id + '_History.csv', csv => parseCboeIndex(csv).history)
  const cboeVix3m = await cboe('VIX3M')
  // VIX3M（原 VXV）在 Cboe 文件里从 2009 年 9 月开始；FRED 的 VXVCLS 是同一指数，从 2007 年 12 月开始，用来接上更早的一段。
  const fredVix3m = await refresh('VXVCLS', FRED_CSV + 'VXVCLS', csv => parseFred(csv, 'VXVCLS'))
    .catch(error => { warn(`VXVCLS 未能补齐 2009 年前的三个月 VIX：${error.message}`); return [] })
  sources.vix3m = [...fredVix3m.filter(([d]) => d < cboeVix3m[0][0]), ...cboeVix3m]
  const localDays = new Set(localVix.map(([d]) => d))
  // Fetch the matching daily closes when the station snapshot has compacted its old daily observations.
  const complete = sources.vix3m.every(([d]) => localDays.has(d))
  sources.vix = complete ? localVix : await cboe('VIX')
  // SqueezeMetrics 估算的做市商 Gamma 敞口（GEX），只展示；首次下载失败且没有缓存时跳过。
  sources.gex = await refresh('gex', SQUEEZE_DIX, parseSqueezeGex)
    .catch(error => { warn(`gex 暂缺：${error.message}`); return [] })
  // 金银比只展示：Yahoo COMEX 金、银连续合约全历史（2000 年 8 月起）；首次下载失败且没有缓存时跳过。
  for (const [id, symbol, digits] of [['gold', 'GC=F', 2], ['silver', 'SI=F', 3]]) {
    const url = YAHOO_CHART + encodeURIComponent(symbol) + '?period1=0&period2=9999999999&interval=1d'
    sources[id] = await refresh(id, url, body => parseYahooFuturesClose(JSON.parse(body), symbol, new Date(), digits).history,
      { 'User-Agent': 'Mozilla/5.0' }).catch(error => { warn(`${id} 暂缺：${error.message}`); return [] })
  }
  // 2000 年以前的月度金银比来自世界银行 Pink Sheet，一次性回补（scripts/gold-silver-history.mjs），不再变动。
  sources.goldSilverEarly = readJson(join(cache, 'gold-silver-worldbank.json'), [])
  if (!sources.goldSilverEarly.length) warn('gold-silver-worldbank.json 缺失，金银比只有 2000 年起的历史')
  // 隐含相关性只展示；首次下载失败且没有缓存时跳过，不影响雷达其余部分。
  for (const id of ['COR1M', 'COR3M']) {
    sources[id] = await cboe(id).catch(error => { warn(`${id} 暂缺：${error.message}`); return [] })
  }
  sources.industryTrend = await refreshIndustryTrend({ cache, fetcher, warn })
  // 49 行业日频宽度只展示；首次下载失败且没有缓存时跳过。
  sources.industryDaily = await refreshIndustryDaily({ cache, fetcher, warn })
    .catch(error => { warn(`industry-daily-breadth 暂缺：${error.message}`); return [] })
  // 2010 年 8 月以前的 20 日量比来自 Yahoo ^GSPC 日成交量，一次性回补（scripts/spx-volume-ratio-history.mjs）。
  sources.volumeRatioEarly = readJson(join(cache, 'spx-volume-ratio-early.json'), [])
  const realEps = await refresh('eps', EPS, html => parseMultplMonthly(html, monthEnd(today, -1)))
  if (realEps.at(-1)[0] > shillerEps.at(-1)[0]) {
    const cpiId = 'CPIAUCNS'
    const cpi = new Map((await refresh(cpiId, FRED_CSV + cpiId, csv => parseFred(csv, cpiId)))
      .map(([d, value]) => [month(d), value]))
    // Multpl reports EPS in constant dollars. Multiplying by the matching CPI
    // gives a level proportional to nominal EPS, which cancels in the YoY ratio.
    const nominal = marketSeries(realEps.flatMap(([d, value]) =>
      cpi.has(month(d)) ? [[d, value * cpi.get(month(d))]] : []), 3)
    sources.supplementalEpsYoy = changeByMonth(nominal, 12, true)
      .filter(point => point.observedOn > shillerEps.at(-1)[0])
  }
  return sources
}

/**
 * Ken French 49 个行业（市值加权月收益）：逐月给出 12 个月累计收益为正的行业占比，
 * 以及月末点位不低于近 12 个月任一月末点位（处于 12 个月新高）的行业占比。
 * 行业出现缺值时重新累积，需要连续 13 个月末点位。
 */
export function buildIndustryTrend(rows) {
  const windows = rows[0]?.[1].map(() => []) ?? []
  const output = []
  let previous
  for (const [d, returns] of rows) {
    if (previous && monthEnd(previous, 1) !== d) windows.forEach(window => { window.length = 0 })
    previous = d
    let known = 0
    let positive = 0
    let highs = 0
    returns.forEach((ret, index) => {
      const window = windows[index]
      if (ret == null) {
        window.length = 0
        return
      }
      const level = (window.at(-1) ?? 1) * (1 + ret / 100)
      window.push(level)
      if (window.length > 13) window.shift()
      if (window.length === 13) {
        known += 1
        if (level > window[0]) positive += 1
        if (level >= Math.max(...window.slice(1))) highs += 1
      }
    })
    if (known) output.push([d, clean(positive / known * 100), clean(highs / known * 100)])
  }
  return output
}

async function refreshIndustryTrend({ cache, fetcher, warn }) {
  const path = join(cache, 'industry-trend.json')
  const previous = readJson(path, [])
  try {
    const response = await fetcher(FRENCH_INDUSTRIES, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const csv = unzipEntry(Buffer.from(await response.arrayBuffer()), '49_Industry_Portfolios.csv')
    const rows = buildIndustryTrend(parseFrenchMonthly(csv))
    if (!rows.length || rows.at(-1)[0] < (previous.at(-1)?.[0] ?? '')) throw new Error('行业覆盖不足')
    writeJsonIfChanged(path, rows)
    return rows
  } catch (error) {
    if (!previous.length) throw new Error(`industry-trend 下载失败且没有缓存：${error.message}`, { cause: error })
    warn(`industry-trend 沿用至 ${previous.at(-1)[0]} 的缓存：${error.message}`)
    return previous
  }
}

/** Ken French 49 行业日表（市值加权）→ [日期, 49 个日收益或 null]。 */
export function parseFrenchDaily(csv) {
  const lines = csv?.split(/\r?\n/) ?? []
  const start = lines.findIndex(line => line.trim() === 'Average Value Weighted Returns -- Daily')
  const width = lines[start + 1]?.split(',').length
  if (start < 0 || width !== 50) throw new Error('Ken French 市值加权日表表头异常')
  const rows = []
  for (const line of lines.slice(start + 2)) {
    const [ymd, ...cells] = line.split(',')
    if (!/^\d{8}$/.test(ymd.trim())) break
    if (cells.length !== width - 1) throw new Error('Ken French 日表行业列数异常')
    rows.push([ymd.trim().replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), cells.map(raw => {
      const value = Number(raw)
      return raw.trim() && Number.isFinite(value) && value > -99 ? value : null
    })])
  }
  if (!rows.length) throw new Error('Ken French 市值加权日表无观测')
  return rows
}

/**
 * 49 个行业的日收益累积成指数后逐日统计：站上 200 日均线的行业占比、252 日新高减新低占可比行业的比例、
 * 近 10 个交易日上涨行业次数 ÷ 下跌行业次数。行业缺值时重新累积；可比行业不足 10 个的日子记 null。
 * 返回 [日期, 200 日线占比, 新高减新低, 10 日涨跌比]。
 */
export function buildIndustryDailyBreadth(rows, { ma = 200, year = 252, days = 10 } = {}) {
  const levels = rows[0]?.[1].map(() => []) ?? []
  const updown = []
  const output = []
  const round = (n, digits) => n == null ? null : Math.round(n * 10 ** digits) / 10 ** digits
  for (const [d, returns] of rows) {
    let maKnown = 0, above = 0, yearKnown = 0, highs = 0, lows = 0, up = 0, down = 0
    returns.forEach((ret, index) => {
      const window = levels[index]
      if (ret == null) {
        window.length = 0
        return
      }
      if (ret > 0) up += 1
      else if (ret < 0) down += 1
      const level = (window.at(-1) ?? 100) * (1 + ret / 100)
      window.push(level)
      if (window.length > year) window.shift()
      if (window.length >= ma) {
        let sum = 0
        for (let i = window.length - ma; i < window.length; i++) sum += window[i]
        maKnown += 1
        if (level > sum / ma) above += 1
      }
      if (window.length === year) {
        let max = -Infinity, min = Infinity
        for (let i = 0; i < year - 1; i++) {
          if (window[i] > max) max = window[i]
          if (window[i] < min) min = window[i]
        }
        yearKnown += 1
        if (level >= max) highs += 1
        if (level <= min) lows += 1
      }
    })
    updown.push([up, down])
    if (updown.length > days) updown.shift()
    const ups = updown.reduce((sum, [u]) => sum + u, 0)
    const downs = updown.reduce((sum, [, n]) => sum + n, 0)
    const row = [
      d,
      maKnown >= 10 ? round(above / maKnown * 100, 1) : null,
      yearKnown >= 10 ? round((highs - lows) / yearKnown * 100, 1) : null,
      updown.length === days && downs > 0 ? round(ups / downs, 2) : null,
    ]
    if (row.slice(1).some(value => value != null)) output.push(row)
  }
  return output
}

async function refreshIndustryDaily({ cache, fetcher, warn }) {
  const path = join(cache, 'industry-daily-breadth.json')
  const previous = readJson(path, [])
  try {
    const response = await fetcher(FRENCH_INDUSTRIES_DAILY, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const csv = unzipEntry(Buffer.from(await response.arrayBuffer()), '49_Industry_Portfolios_Daily.csv')
    const rows = buildIndustryDailyBreadth(parseFrenchDaily(csv))
    if (!rows.length || rows.at(-1)[0] < (previous.at(-1)?.[0] ?? '')) throw new Error('行业日表覆盖不足')
    writeJsonIfChanged(path, rows)
    return rows
  } catch (error) {
    if (!previous.length) throw error
    warn(`industry-daily-breadth 沿用至 ${previous.at(-1)[0]} 的缓存：${error.message}`)
    return previous
  }
}

/** 纽交所半日市与周六场次的近似判定（2010 年以前没有逐日日历）：周六、12 月 24 日、7 月 3 日、感恩节次日。 */
export function likelyShortSession(d) {
  const date = new Date(d + 'T00:00:00Z')
  const [, m, day] = d.split('-').map(Number)
  if (date.getUTCDay() === 6) return true
  if ((m === 12 && day === 24) || (m === 7 && day === 3)) return true
  // 感恩节为 11 月第四个周四，次日为周五且日期在 23–29 日之间
  return m === 11 && date.getUTCDay() === 5 && day >= 23 && day <= 29
}

/**
 * 日成交量 → 20 日量比：当日成交 ÷ 前 20 个完整交易日均量，半日市与周六场次不计入分子分母。
 * Yahoo 早年日线偶有孤立错值（如 1951-06-01 为前后几日的 8 倍、2008-08-05 只有四分之一），
 * 与前后各 2 个交易日中位数之比超过 4 倍或低于 0.3 倍的单日剔除；真实放量（如 1987 年 10 月）在 3 倍以内。
 */
export function volumeRatioFromDaily(rows) {
  const sessions = rows.filter(([d, volume]) => volume > 0 && !likelyShortSession(d))
  const full = sessions.filter(([, volume], index) => {
    const around = [...sessions.slice(Math.max(0, index - 2), index), ...sessions.slice(index + 1, index + 3)]
      .map(([, v]) => v).sort((a, b) => a - b)
    if (around.length < 4) return true
    const median = (around[1] + around[2]) / 2
    return volume / median <= 4 && volume / median >= 0.3
  })
  return full.flatMap(([d, volume], index) => {
    if (index < 20) return []
    const average = full.slice(index - 20, index).reduce((sum, [, v]) => sum + v, 0) / 20
    return [[d, Math.round(volume / average * 100) / 100]]
  })
}

/** 11 个 GICS 板块中，过半成分股站上 200 日线的板块数；只取 11 个板块都有读数的交易日。 */
export function sectorBreadth(universes) {
  const sectors = Object.entries(universes ?? {}).filter(([id]) => id.startsWith('sector-'))
  const byDay = new Map()
  for (const [, sector] of sectors) {
    const rows = [...(sector.backfill ?? []), ...(sector.history ?? []), [sector.date, sector.above200]]
    for (const [d, value] of new Map(rows)) {
      if (!Number.isFinite(value)) continue
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d).push(value)
    }
  }
  return [...byDay].filter(([, values]) => sectors.length && values.length === sectors.length)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, values]) => ({ observedOn: d, availableOn: d, value: values.filter(value => value > 50).length, total: values.length }))
}

/** 近 10 个交易日上涨家数合计 ÷ 下跌家数合计。advDec 行为 [日期, 上涨, 下跌, 平盘, 合计]。 */
export function advanceDecline(rows = [], days = 10) {
  return rows.flatMap((row, index) => {
    if (index < days - 1) return []
    const window = rows.slice(index - days + 1, index + 1)
    const up = window.reduce((sum, [, adv]) => sum + adv, 0)
    const down = window.reduce((sum, [, , dec]) => sum + dec, 0)
    return down > 0 ? [{ observedOn: row[0], availableOn: row[0], value: clean(up / down), up, down }] : []
  })
}

/**
 * 标普 500 等权指数（^SPXEW）近 12 个月相对市值加权标普 500 的超额表现（均为价格指数）。index-history 的月线以
 * 「YYYY-MM-01」标记该月最后一个收盘，末尾另有最新收盘日。
 */
export function equalWeightSpread(rsp = [], spx = []) {
  const monthly = rows => {
    const byMonth = new Map()
    for (const [d, value] of rows) if (value > 0) byMonth.set(month(d), [d, value])
    return byMonth
  }
  const equal = monthly(rsp)
  const cap = monthly(spx)
  return [...equal].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, [d, value]]) => {
    const prior = month(monthEnd(key + '-01', -12))
    if (!cap.has(key) || !equal.has(prior) || !cap.has(prior)) return []
    const observedOn = d.endsWith('-01') ? monthEnd(d) : d
    const excess = (value / equal.get(prior)[1]) / (cap.get(key)[1] / cap.get(prior)[1]) - 1
    return [{ observedOn, availableOn: observedOn, value: clean(excess * 100) }]
  })
}

export function parseShillerEps(csv) {
  const [header, ...lines] = csv.trim().split(/\r?\n/)
  if (header !== 'date,P,D,E,CPI,GS10') throw new Error('席勒盈利数据表头不匹配')
  const rows = lines.flatMap(line => {
    const [d, , , raw] = line.split(',')
    return /^\d{4}-\d{2}$/.test(d) && raw?.trim() && Number.isFinite(Number(raw))
      ? [[monthEnd(d), Number(raw)]] : []
  })
  if (rows[0]?.[0] !== '1871-01-31') throw new Error('席勒盈利历史缺少 1871 年初观测')
  return rows
}

function pointAt(rows, date) {
  return rows.findLast(([d]) => d <= date)
}

function near(rows, date) {
  const point = pointAt(rows, date)
  return point && ageDays(date, point[0]) <= 7 ? point : null
}

function netLiquidity(rows) {
  const tga = new Map(rows('treasuryCash'))
  const rrp = rows('overnightRrp')
  const levels = rows('fedAssets').flatMap(([d, value]) => {
    const overnight = near(rrp, d)
    return overnight && tga.has(d) ? [[d, value - tga.get(d) - overnight[1]]] : []
  })
  const byDate = new Map(levels)
  return levels.flatMap(([d, value]) => {
    const prior = byDate.get(addDays(d, -91))
    return prior > 0 ? [[d, clean((value / prior - 1) * 100)]] : []
  })
}

function quarterly(rows) {
  return rows.map(([d, value]) => {
    const observedOn = monthEnd(d, 2)
    return { observedOn, value, availableOn: monthEnd(observedOn, 3) }
  })
}

function balanceSheetCash(fetched) {
  const [checking, savings, funds, assets] = CASH_SERIES.map(id => new Map(fetched[id]))
  const rows = [...assets].flatMap(([d, value]) =>
    value > 0 && [checking, savings, funds].every(series => series.has(d))
      ? [[d, clean(100 * (checking.get(d) + savings.get(d) + funds.get(d)) / value)]] : [])
  return quarterly(rows)
}

function changeByMonth(series, monthsBack, relative = false) {
  const byMonth = new Map(series.map(point => [month(point.observedOn), point]))
  return series.flatMap(point => {
    const prior = byMonth.get(month(monthEnd(point.observedOn, -monthsBack)))
    if (!prior || (relative && prior.value <= 0)) return []
    return [{
      ...point,
      value: clean(relative ? (point.value / prior.value - 1) * 100 : point.value - prior.value),
      availableOn: point.availableOn < prior.availableOn ? prior.availableOn : point.availableOn,
    }]
  })
}

function completeMonthly(rows, lastComplete) {
  const completed = rows.filter(([d]) => monthEnd(d) <= lastComplete)
  return [...new Map(completed.map(row => [month(row[0]), row])).values()]
}

function marketReadings(data, panel, lastComplete) {
  const output = { erp: [], volume: [] }
  const start = [panel.GS10[0], data.volume[0]].filter(Boolean)
    .map(point => monthEnd(point.observedOn)).sort()[0]
  for (let date = start; date <= lastComplete; date = monthEnd(date, 1)) {
    // readMarket supplies the joint PE/rate spread and its exact-month price and volume windows.
    const reading = readMarket({ pe: data.pe, volume: data.volume }, panel, date)
    for (const id of ['erp', 'volume']) {
      if (reading[id] && reading[id].observedOn !== output[id].at(-1)?.observedOn) {
        output[id].push({ ...reading[id], availableOn: date })
      }
    }
  }
  return output
}

function includeLatest(series, reading, availableOn) {
  if (!reading) return series
  return [
    ...series.filter(row => month(row.observedOn) < month(reading.observedOn)),
    { ...reading, availableOn },
  ]
}

function publishedRows(entry, today) {
  const rows = normalize(entry?.history, today)
  return entry?.releasedAt?.slice(0, 10) > today ? rows.slice(0, -1) : rows
}

/**
 * 隐含前瞻每股盈利 = 标普收盘 ÷ FactSet 前瞻市盈率。FactSet 周报引用发布日前一个交易日的收盘，
 * 市盈率只保留一位小数，单点误差约 ±0.3%。返回近 3 个月（91 天，前后容差 21 天）的变化。
 */
export function forwardEpsChange(fpeRows, closes) {
  const eps = fpeRows.flatMap(([d, pe]) => {
    const close = closes.findLast(([day]) => day < d)
    return pe > 0 && close && ageDays(d, close[0]) <= 5 ? [[d, close[1] / pe]] : []
  })
  return eps.flatMap(([d, value]) => {
    const target = addDays(d, -91)
    const prior = eps.filter(([day]) => Math.abs(ageDays(day, target)) <= 21)
      .sort((a, b) => Math.abs(ageDays(a[0], target)) - Math.abs(ageDays(b[0], target)))[0]
    return prior ? [{ observedOn: d, availableOn: d, value: clean((value / prior[1] - 1) * 100), priorOn: prior[0] }] : []
  })
}

/** SqueezeMetrics DIX.csv（date,price,dix,gex）→ [日期, GEX 亿美元]。 */
export function parseSqueezeGex(csv) {
  const [header, ...lines] = csv.trim().split(/\r?\n/)
  if (header.trim() !== 'date,price,dix,gex') throw new Error('SqueezeMetrics 表头不匹配')
  return lines.flatMap(line => {
    const [d, , , raw] = line.split(',')
    const value = Number(raw)
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && raw?.trim() && Number.isFinite(value) ? [[d, clean(value / 1e8)]] : []
  })
}

/** GEX 读数附近 5 个交易日里为负的天数。 */
export function gammaExposure(rows = []) {
  return rows.map(([d, value], index) => ({
    observedOn: d, availableOn: d, value,
    negativeDays: rows.slice(Math.max(0, index - 4), index + 1).filter(([, v]) => v < 0).length,
  }))
}

/** Cboe 一个月隐含相关性，附较 5 个交易日前的变化和同日三个月隐含相关性。 */
export function impliedCorrelation(cor1m = [], cor3m = []) {
  const longer = new Map(cor3m)
  return cor1m.map(([d, value], index) => ({
    observedOn: d, availableOn: d, value,
    change: index >= 5 ? clean(value - cor1m[index - 5][1]) : null,
    cor3m: longer.get(d) ?? null,
  }))
}

const round2 = n => Math.round(n * 100) / 100
export const WORLD_BANK_CMO = 'https://www.worldbank.org/en/research/commodity-markets'

/**
 * 世界银行 Pink Sheet 月表（Monthly Prices）→ [月末日期, 金 ÷ 银]。sheetXml 为工作表 XML，shared 为共享字符串；
 * 按表头里的 Gold、Silver 两列取值，行标签形如 1960M01。
 */
export function parseWorldBankGoldSilver(sheetXml, shared) {
  const cellsOf = row => Object.fromEntries([...row.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
    .map(([, col, attrs, body = '']) => {
      const raw = /<v>([^<]*)<\/v>/.exec(body)?.[1]
      return [col, /t="s"/.test(attrs) ? shared[Number(raw)] : raw]
    }))
  let columns
  const rows = []
  for (const [, row] of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = cellsOf(row)
    if (!columns) {
      const find = name => Object.keys(cells).find(col => cells[col]?.trim() === name)
      if (find('Gold') && find('Silver')) columns = [find('Gold'), find('Silver')]
      continue
    }
    const label = /^(\d{4})M(\d{2})$/.exec(cells.A ?? '')
    const [gold, silver] = columns.map(col => Number(cells[col]))
    if (label && gold > 0 && silver > 0) rows.push([monthEnd(`${label[1]}-${label[2]}`), round2(gold / silver)])
  }
  if (!columns) throw new Error('世界银行月表缺少 Gold、Silver 列')
  return rows
}

/**
 * 金银比：2000 年 9 月以前用世界银行月均价之比（early），之后用 Yahoo 日线按月汇总（月均金 ÷ 月均银，只取完整月份），
 * 最后接上最新一个交易日的读数，并附较 20 个交易日前的变化。月度部分作为百分位的历史样本。
 */
export function goldSilverRatio(gold = [], silver = [], early = [], today = gold.at(-1)?.[0] ?? '') {
  const silverByDay = new Map(silver)
  const daily = gold.flatMap(([d, price]) => {
    const other = silverByDay.get(d)
    return price > 0 && other > 0 ? [[d, price, other]] : []
  })
  if (!daily.length) return []
  // 日线首月通常不完整（Yahoo 从 2000-08-30 开始），从下一个月起按月汇总，首月及以前用 early。
  const firstFull = month(monthEnd(daily[0][0], 1))
  const byMonth = new Map()
  for (const [d, g, s] of daily) {
    if (month(d) < firstFull || month(d) >= month(today)) continue
    const sums = byMonth.get(month(d)) ?? [0, 0]
    byMonth.set(month(d), [sums[0] + g, sums[1] + s])
  }
  const monthly = [
    ...early.filter(([d]) => month(d) < firstFull),
    ...[...byMonth].map(([key, [g, s]]) => [monthEnd(key + '-01'), round2(g / s)]),
  ].map(([d, value]) => ({ observedOn: d, availableOn: d, value }))
  const ratio = row => row[1] / row[2]
  const last = daily.at(-1)
  const prior = daily.at(-21)
  return [...monthly, {
    observedOn: last[0], availableOn: last[0], value: round2(ratio(last)), gold: last[1], silver: last[2],
    change: daily.length > 20 ? round2(ratio(last) - ratio(prior)) : null,
  }]
}

/** AAII 看多减看空，只用两边同一调查周都有的读数。 */
export function aaiiSpread(bull, bear) {
  const bears = new Map(bear)
  return bull.flatMap(([d, value]) => bears.has(d) ? [{
    observedOn: d, availableOn: d, value: clean(value - bears.get(d)), bull: value, bear: bears.get(d),
  }] : [])
}

export function buildRadarSeries({ local, macroUs, breadth, universes = {}, indexes = {}, marketCache, fetched, shillerEps, panel, currentPanel, today, lastComplete, spxDaily = [] }) {
  const rows = id => publishedRows(local[id], today)
  const simple = id => marketSeries(rows(id), 0, true)
  const pe = rows('spxPe').filter(([d, value]) => d >= '1900-01' && value > 0)
  const cape = rows('shillerCape').filter(([d, value]) => d >= '1900-01' && value > 0)
  const industries = normalize(marketCache.breadth, today)
  const historical = {
    baaChange: changeByMonth(panel.baa, 6),
    pe: marketSeries(completeMonthly(pe, lastComplete), 3),
    cape: marketSeries(completeMonthly(cape, lastComplete), 0),
    equityShare: quarterly(normalize(macroUs.equityShare?.long ?? macroUs.equityShare?.history, today)),
    cashShare: balanceSheetCash(fetched),
    finraDebtYoy: marketSeries(rows('finraDebtYoy'), 1),
    breadth: marketSeries(industries, 2),
    epsYoy: [
      ...changeByMonth(marketSeries(shillerEps, 3), 12, true),
      ...(fetched.supplementalEpsYoy ?? []),
    ],
  }
  const volumeData = marketSeries(normalize(marketCache.volume, lastComplete), 0)
  Object.assign(historical, marketReadings({ pe: historical.pe, volume: volumeData }, panel, lastComplete))

  const currentPe = includeLatest(marketSeries(completeMonthly(pe, lastComplete), 0, true),
    marketSeries(pe.slice(-1), 0, true)[0], today)
  const currentCape = includeLatest(historical.cape, marketSeries(cape.slice(-1), 0, true)[0], today)
  const currentErp = readMarket({ pe: currentPe }, currentPanel, today).erp
  const hy = rows('hyDaily')
  const vix = new Map(fetched.vix)
  const vixTerm = fetched.vix3m.flatMap(([d, vix3m]) => vix.has(d) ? [{
    observedOn: d, availableOn: d, value: clean(vix.get(d) / vix3m), vix: vix.get(d), vix3m,
  }] : [])
  const breadth200 = normalize([
    ...(breadth?.backfill ?? []), ...(breadth?.history ?? []), [breadth?.date, breadth?.above200],
  ], today)
  const current = {
    ...historical,
    netLiquidity: marketSeries(netLiquidity(rows), 0, true),
    hy: marketSeries(hy, 0, true).map(point => {
      const prior = near(hy, addDays(point.observedOn, -28))
      return { ...point, change: prior ? clean(point.value - prior[1]) : null }
    }),
    baaChange: changeByMonth(currentPanel.baa, 6),
    pe: currentPe,
    cape: currentCape,
    erp: includeLatest(historical.erp, currentErp, today),
    forwardPe: simple('spxFactSetFpe'),
    finraDebtYoy: simple('finraDebtYoy'),
    managerCash: simple('managerCash'),
    managerUsOverweight: simple('managerUsOverweight'),
    managerTechOverweight: simple('managerTechOverweight'),
    naaim: simple('naaim'),
    aaiiSpread: aaiiSpread(rows('retailBull'), rows('retailBear')),
    cftcAsset: simple('cftcSpxAsset'),
    cftcNdxAsset: simple('cftcNdxAsset'),
    breadth: marketSeries(industries, 0, true),
    vixTerm,
    goldSilver: goldSilverRatio(normalize(fetched.gold, today), normalize(fetched.silver, today), fetched.goldSilverEarly, today),
    impliedCorr: impliedCorrelation(fetched.COR1M, fetched.COR3M),
    gex: gammaExposure(normalize(fetched.gex, today)),
    breadth200: marketSeries(breadth200, 0, true),
    volumeRatio: (() => {
      const recent = simple('volumeRatio')
      const start = recent[0]?.observedOn ?? '9999'
      return [...marketSeries((fetched.volumeRatioEarly ?? []).filter(([d]) => d < start), 0, true), ...recent]
    })(),
    industry200: marketSeries((fetched.industryDaily ?? []).flatMap(([d, value]) => value == null ? [] : [[d, value]]), 0, true),
    industryNetHighs: marketSeries((fetched.industryDaily ?? []).flatMap(([d, , value]) => value == null ? [] : [[d, value]]), 0, true),
    industryAdvDec: marketSeries((fetched.industryDaily ?? []).flatMap(([d, , , value]) => value == null ? [] : [[d, value]]), 0, true),
    industryMomentum: marketSeries((fetched.industryTrend ?? []).map(([d, value]) => [d, value]), 0, true),
    industryHighs: marketSeries((fetched.industryTrend ?? []).map(([d, , value]) => [d, value]), 0, true),
    sectorBreadth: sectorBreadth(universes).filter(row => row.observedOn <= today),
    netHighs: marketSeries(normalize(breadth?.netHighs, today), 0, true),
    advDec: advanceDecline((breadth?.advDec ?? []).filter(([d]) => d <= today)),
    above50: marketSeries(normalize([[breadth?.date, breadth?.above50]], today), 0, true),
    equalWeight: equalWeightSpread(indexes.rsp?.monthly, indexes.spx?.monthly).filter(row => row.observedOn <= today),
    forwardEps: forwardEpsChange(rows('spxFactSetFpe'), spxDaily.filter(([d]) => d <= today)),
  }
  const sources = Object.fromEntries(Object.entries(local).map(([id, entry]) => [id, entry.source]))
  Object.assign(sources, {
    netLiquidity: FRED_SERIES + 'WALCL', hy: sources.hyDaily, goldSilver: 'https://finance.yahoo.com/quote/SI=F/',
    baaChange: FRED_SERIES + 'BAA', erp: FRED_SERIES + 'GS10',
    pe: sources.spxPe, cape: sources.shillerCape, forwardPe: sources.spxFactSetFpe,
    equityShare: FRED_SERIES + macroUs.equityShare?.fred, cashShare: FRED_SERIES + CASH_SERIES[3],
    breadth: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html',
    volume: 'https://finance.yahoo.com/quote/%5EGSPC/history/',
    aaiiSpread: sources.retailBull, cftcAsset: sources.cftcSpxAsset,
    industryMomentum: FRENCH_INDUSTRIES, industryHighs: FRENCH_INDUSTRIES,
    industry200: FRENCH_INDUSTRIES_DAILY, industryNetHighs: FRENCH_INDUSTRIES_DAILY, industryAdvDec: FRENCH_INDUSTRIES_DAILY,
    sectorBreadth: breadth?.source, netHighs: breadth?.source, advDec: breadth?.source, above50: breadth?.source,
    equalWeight: 'https://finance.yahoo.com/quote/%5ESPXEW/history/',
    vixTerm: CBOE + 'VIX3M_History.csv', impliedCorr: CBOE + 'COR1M_History.csv', gex: 'https://squeezemetrics.com/monitor/dix', breadth200: breadth?.source,
    epsYoy: 'https://shillerdata.com/', forwardEps: sources.spxForwardEpsChange,
  })
  return { current, historical, sources }
}
