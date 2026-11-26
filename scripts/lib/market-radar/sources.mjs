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
export const OFR_FSI = 'https://www.financialresearch.gov/financial-stress-index/data/fsi.csv'
export const FRENCH_INDUSTRIES_DAILY = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_daily_CSV.zip'
export const FRENCH_INDUSTRIES = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_CSV.zip'
export const CASH_SERIES = ['CDCABSHNO', 'TSDABSHNO', 'MMFSABSHNO', 'TFAABSHNO']
/** 隔夜逆回购常设工具启用日：此前缺读数按 0 计。 */
export const ON_RRP_START = '2013-09-23'

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
  // 纳指、费城半导体（L-032）与罗素 2000、恒生、上证综指（L-035）日收盘，只展示：Yahoo 全历史；首次下载失败且没有缓存时跳过。
  // 港股、A 股的时间戳是当地开盘时刻，按纽约日期 +6 小时取日，得到的就是交易所当地日期。
  for (const [id, symbol] of [['ixic', '^IXIC'], ['sox', '^SOX'], ['rut', '^RUT'], ['hsi', '^HSI'], ['ssec', '000001.SS']]) {
    const url = YAHOO_CHART + encodeURIComponent(symbol) + '?period1=0&period2=9999999999&interval=1d'
    sources[id] = await refresh(id, url, body => parseYahooFuturesClose(JSON.parse(body), symbol, new Date(), 2).history,
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
  sources.industryShare = readJson(join(cache, 'industry-share.json'), [])
  // 49 行业日频宽度只展示；首次下载失败且没有缓存时跳过。
  sources.industryDaily = await refreshIndustryDaily({ cache, fetcher, warn })
    .catch(error => { warn(`industry-daily-breadth 暂缺：${error.message}`); return [] })
  // 2010 年 8 月以前的 20 日量比来自 Yahoo ^GSPC 日成交量，一次性回补（scripts/spx-volume-ratio-history.mjs）。
  sources.volumeRatioEarly = readJson(join(cache, 'spx-volume-ratio-early.json'), [])
    .filter(([, value]) => value >= 0.3)
  const realEps = await refresh('eps', EPS, html => parseMultplMonthly(html, monthEnd(today, -1)))
  if (realEps.at(-1)[0] > shillerEps.at(-1)[0]) {
    const cpiId = 'CPIAUCNS'
    const cpi = new Map((await refresh(cpiId, FRED_CSV + cpiId, csv => parseFred(csv, cpiId)))
      .map(([d, value]) => [month(d), value]))
    // Multpl reports EPS in constant dollars. Multiplying by the matching CPI
    // gives a level proportional to nominal EPS, which cancels in the YoY ratio.
    // A1：补算部分同样只取季末月。
    const nominal = quarterEndEarnings(realEps.flatMap(([d, value]) =>
      cpi.has(month(d)) ? [[d, value * cpi.get(month(d))]] : []))
    sources.supplementalEpsYoy = changeByMonth(nominal, 12, true)
      .filter(point => point.observedOn > shillerEps.at(-1)[0])
  }
  // 新接来源：失败且无缓存时 warn 并返回空，不拖累整体。
  sources.ofrFsi = await refreshOfrFsi({ cache, fetcher, today, warn })
  sources.realYield = await refresh('DFII10', FRED_CSV + 'DFII10', csv => parseFred(csv, 'DFII10'))
    .catch(error => { warn(`DFII10 暂缺：${error.message}`); return [] })
  sources.dollar = await refresh('DTWEXBGS', FRED_CSV + 'DTWEXBGS', csv => parseFred(csv, 'DTWEXBGS'))
    .catch(error => { warn(`DTWEXBGS 暂缺：${error.message}`); return [] })
  sources.vvix = await cboe('VVIX').catch(error => { warn(`VVIX 暂缺：${error.message}`); return [] })
  return sources
}

/** OFR FSI 保留 Credit 与总指数两列，不能走只留二元组的 normalize。 */
async function refreshOfrFsi({ cache, fetcher, today, warn }) {
  const path = join(cache, 'ofr-fsi.json')
  const previous = readJson(path, [])
  try {
    const response = await fetcher(OFR_FSI, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const fresh = parseOfrFsi(await response.text()).filter(([d]) => d <= today)
    if (!fresh.length || (previous.length && (fresh[0][0] > previous[0][0] || fresh.at(-1)[0] < previous.at(-1)[0]))) {
      throw new Error('来源历史覆盖不足')
    }
    writeJsonIfChanged(path, fresh)
    return fresh
  } catch (error) {
    if (!previous.length) {
      warn(`ofr-fsi 暂缺：${error.message}`)
      return []
    }
    warn(`ofr-fsi 沿用至 ${previous.at(-1)[0]} 的缓存：${error.message}`)
    return previous.filter(([d]) => d <= today)
  }
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

const TECH_INDUSTRIES = ['Hardw', 'Softw', 'Chips']
const ENERGY_INDUSTRIES = ['Oil', 'Coal']
const FIN_INDUSTRIES = ['Banks', 'Insur', 'RlEst', 'Fin']

/**
 * Ken French 49 行业的市值占比：行业市值 = 公司数 × 平均规模（第 t 行是 t 月初、即 t−1 月末的值）。
 * 返回 [t−1 月末日期, 科技（Hardw + Softw + Chips）占比 %, Chips（电子设备，含半导体）占比 %,
 *       能源（Oil + Coal）占比 %, 金融（Banks + Insur + RlEst + Fin）占比 %]。
 */
export function parseFrenchShares(csv) {
  const lines = csv?.split(/\r?\n/) ?? []
  const section = title => {
    const start = lines.findIndex(line => line.trim() === title)
    if (start < 0) throw new Error(`Ken French 缺少「${title}」表`)
    const header = lines[start + 1].split(',').slice(1).map(h => h.trim())
    if (header.length !== 49) throw new Error(`Ken French「${title}」行业列数异常`)
    const rows = new Map()
    for (const line of lines.slice(start + 2)) {
      const [ym, ...cells] = line.split(',')
      if (!/^\d{6}$/.test(ym?.trim() ?? '')) break
      rows.set(ym.trim(), cells.map(Number))
    }
    return { header, rows }
  }
  const firms = section('Number of Firms in Portfolios')
  const size = section('Average Firm Size')
  const index = name => firms.header.indexOf(name)
  if ([...TECH_INDUSTRIES, ...ENERGY_INDUSTRIES, ...FIN_INDUSTRIES].some(name => index(name) < 0)) throw new Error('Ken French 缺少行业列')
  const sum = (caps, names) => names.reduce((acc, name) => acc + caps[index(name)], 0)
  const out = []
  for (const [ym, counts] of firms.rows) {
    const sizes = size.rows.get(ym)
    if (!sizes) continue
    const caps = counts.map((n, i) => (n > 0 && sizes[i] > 0 ? n * sizes[i] : 0))
    const total = caps.reduce((sum, v) => sum + v, 0)
    if (!(total > 0)) continue
    const observedOn = monthEnd(`${ym.slice(0, 4)}-${ym.slice(4)}`, -1)
    const share = names => clean(sum(caps, names) / total * 100)
    out.push([observedOn, share(TECH_INDUSTRIES), share(['Chips']), share(ENERGY_INDUSTRIES), share(FIN_INDUSTRIES)])
  }
  return out
}

async function refreshIndustryTrend({ cache, fetcher, warn }) {
  const path = join(cache, 'industry-trend.json')
  const previous = readJson(path, [])
  try {
    const response = await fetcher(FRENCH_INDUSTRIES, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const csv = unzipEntry(Buffer.from(await response.arrayBuffer()), '49_Industry_Portfolios.csv')
    const monthly = parseFrenchMonthly(csv)
    const rows = buildIndustryTrend(monthly)
    if (!rows.length || rows.at(-1)[0] < (previous.at(-1)?.[0] ?? '')) throw new Error('行业覆盖不足')
    writeJsonIfChanged(path, rows)
    // 49 行业市值加权月收益（%），供牛市后期预警影子读数的防守轮动项使用（scripts/late-cycle-shadow.mjs）
    writeJsonIfChanged(join(cache, 'industry-returns.json'), monthly.filter(([d]) => d >= '2000-01-01'))
    // 科技、电子设备（L-032）与能源、金融（L-035）的市值占比，只展示
    try { writeJsonIfChanged(join(cache, 'industry-share.json'), parseFrenchShares(csv)) } catch (error) { warn(`industry-share 未更新：${error.message}`) }
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

/** 席勒数据的标普 500 月均价（P 列，月内日收盘均值）→ [月末日期, 点位]。 */
export function parseShillerPrice(csv) {
  const [header, ...lines] = csv.trim().split(/\r?\n/)
  if (header !== 'date,P,D,E,CPI,GS10') throw new Error('席勒数据表头不匹配')
  return lines.flatMap(line => {
    const [d, raw] = line.split(',')
    const value = Number(raw)
    return /^\d{4}-\d{2}$/.test(d) && raw?.trim() && value > 0 ? [[monthEnd(d), Math.round(value * 100) / 100]] : []
  })
}

/**
 * 给金银比各行补上同期标普 500 点位：月度行用席勒月均价，席勒快照之后的月份用日收盘的月均值（只取完整月份），
 * 最新一行（日度）用当日或之前最近一个交易日的收盘。与金、银的月均价口径一致。
 */
export function attachSpx(rows, monthly = [], daily = []) {
  const byMonth = new Map(monthly.map(([d, value]) => [month(d), value]))
  const sums = new Map()
  for (const [d, close] of daily) {
    if (byMonth.has(month(d)) || !(close > 0)) continue
    const [sum, n] = sums.get(month(d)) ?? [0, 0]
    sums.set(month(d), [sum + close, n + 1])
  }
  const lastDaily = daily.at(-1)?.[0] ?? ''
  for (const [key, [sum, n]] of sums) {
    // 当月还没结束的不算月均
    if (key < month(lastDaily)) byMonth.set(key, Math.round(sum / n * 100) / 100)
  }
  return rows.map((row, index) => {
    const isLatest = index === rows.length - 1 && row.change !== undefined
    const spx = isLatest ? daily.findLast(([d]) => d <= row.observedOn)?.[1] : byMonth.get(month(row.observedOn))
    return spx > 0 ? { ...row, spx } : row
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
    if (!tga.has(d)) return []
    // A2：2013-09-23 前隔夜逆回购缺读数按 0；之后仍要求 7 天内有读数。
    let overnight = 0
    if (d >= ON_RRP_START) {
      const point = near(rrp, d)
      if (!point) return []
      overnight = point[1]
    }
    return [[d, value - tga.get(d) - overnight]]
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

/** 是否季末月（3 / 6 / 9 / 12）。 */
export function isQuarterEndMonth(date) {
  return [3, 6, 9, 12].includes(Number(month(date).slice(5)))
}

/**
 * A1：只保留季末月盈利，按「季末后第 3 个月末可得」形成阶梯序列。
 * 输入 [[日期, 值]] 或已有 {observedOn,value}；输出带 availableOn 的点列。
 */
export function quarterEndEarnings(rows = [], lagMonths = 3) {
  return rows.flatMap(row => {
    const observedOn = Array.isArray(row) ? (row[0].length === 7 ? monthEnd(row[0]) : monthEnd(row[0])) : row.observedOn
    const value = Array.isArray(row) ? row[1] : row.value
    if (!isQuarterEndMonth(observedOn) || !Number.isFinite(value)) return []
    const end = monthEnd(observedOn)
    return [{ observedOn: end, value, availableOn: monthEnd(end, lagMonths) }]
  }).sort((a, b) => a.observedOn.localeCompare(b.observedOn))
}

/**
 * A1：用最近一个已可得季末市盈率 × 当月月均价 ÷ 该季末月月均价。
 * 只取季末月的市盈率作盈利锚点；对每个有价格的月份输出一行。
 */
export function priceAdjustedPe(peRows = [], priceSeries = []) {
  const priceByMonth = new Map(priceSeries.filter(point => point?.value > 0)
    .map(point => [month(point.observedOn), { value: point.value, observedOn: point.observedOn }]))
  const quarters = peRows.flatMap(row => {
    const observedOn = Array.isArray(row) ? row[0] : row.observedOn
    const value = Array.isArray(row) ? row[1] : row.value
    if (!(value > 0) || !isQuarterEndMonth(observedOn)) return []
    const end = monthEnd(observedOn)
    return [{
      earningsOn: end,
      value,
      availableOn: monthEnd(end, 3),
      earningsPrice: priceByMonth.get(month(end))?.value,
    }]
  }).filter(row => row.earningsPrice > 0)
    .sort((a, b) => a.availableOn.localeCompare(b.availableOn))
  const months = [...priceByMonth.keys()].sort()
  return months.flatMap(key => {
    const asOf = monthEnd(key + '-01')
    const anchor = quarters.findLast(row => row.availableOn <= asOf)
    const price = priceByMonth.get(key)
    if (!anchor || !price) return []
    return [{
      value: clean(anchor.value * price.value / anchor.earningsPrice),
      observedOn: `${key}-01`,
      availableOn: asOf,
      earningsOn: anchor.earningsOn,
    }]
  })
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

/** OFR FSI CSV → [日期, Credit, OFR FSI 总指数]。该文件无引号单元格，按逗号直接切分。 */
export function parseOfrFsi(csv) {
  const lines = csv.trim().split(/\r?\n/)
  const header = lines[0].split(',').map(cell => cell.trim())
  const dateIdx = header.findIndex(cell => /^date$/i.test(cell) || /^observation_date$/i.test(cell))
  const creditIdx = header.findIndex(cell => /^credit$/i.test(cell))
  const fsiIdx = header.findIndex(cell => /^ofr\s*fsi$/i.test(cell) || /^fsi$/i.test(cell))
  if (dateIdx < 0 || creditIdx < 0) throw new Error('OFR FSI 表头缺少 Date / Credit')
  return lines.slice(1).flatMap(line => {
    const cells = line.split(',')
    const d = cells[dateIdx]?.trim().slice(0, 10)
    const credit = Number(cells[creditIdx])
    const fsi = fsiIdx >= 0 ? Number(cells[fsiIdx]) : NaN
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(credit)
      ? [[d, credit, Number.isFinite(fsi) ? fsi : null]] : []
  })
}

/**
 * 约 N 天涨跌幅 %；前值取不晚于目标日、且距目标日不超过 5 天的最近读数。
 * 返回 [日期, 涨跌幅%, 当前水平]。
 */
export function changeOverDays(rows = [], days = 91, slack = 5) {
  const sorted = [...rows].filter(([, value]) => value > 0).sort(([a], [b]) => a.localeCompare(b))
  return sorted.flatMap(([d, value], index) => {
    const target = addDays(d, -days)
    let prior = null
    for (let i = index - 1; i >= 0; i--) {
      const [day, level] = sorted[i]
      if (day > target) continue
      if (ageDays(target, day) > slack) break
      prior = level
      break
    }
    return prior > 0 ? [[d, clean((value / prior - 1) * 100), value]] : []
  })
}

/**
 * VIX 变化趋势（%）：近 recent 个交易日均值 ÷ 之前 base 个交易日均值 − 1。
 * 对应第四轮研究（L-022）里「当月均值 ÷ 前 6 个月均值 − 1」的日频写法。
 */
export function vixTrend(daily = [], recent = 21, base = 126) {
  const rows = daily.filter(([, v]) => Number.isFinite(v) && v > 0)
  const out = []
  for (let i = recent + base - 1; i < rows.length; i++) {
    let r = 0, b = 0
    for (let k = i - recent + 1; k <= i; k++) r += rows[k][1]
    for (let k = i - recent - base + 1; k <= i - recent; k++) b += rows[k][1]
    const recentMean = r / recent, baseMean = b / base
    out.push({ observedOn: rows[i][0], availableOn: rows[i][0], value: clean((recentMean / baseMean - 1) * 100), recent: clean(recentMean), base: clean(baseMean) })
  }
  return out
}

/** 标普相对 200 日均线（%）、距 52 周高点回撤（%）、20 日已实现波动率（%）。 */
export function spxTrendVol(dailyRows = []) {
  const closes = dailyRows.filter(([, close]) => close > 0).map(([d, close]) => [d, close])
  const trend200 = []
  const drawdown = []
  const realizedVol = []
  const window = []
  for (let i = 0; i < closes.length; i++) {
    const [d, close] = closes[i]
    window.push(close)
    if (window.length > 252) window.shift()
    if (i >= 199) {
      const ma = closes.slice(i - 199, i + 1).reduce((sum, [, v]) => sum + v, 0) / 200
      trend200.push({ observedOn: d, availableOn: d, value: clean((close / ma - 1) * 100) })
    }
    if (window.length === 252) {
      const peak = Math.max(...window)
      drawdown.push({ observedOn: d, availableOn: d, value: clean((close / peak - 1) * 100) })
    }
    if (i >= 20) {
      const returns = []
      for (let j = i - 19; j <= i; j++) {
        const prev = closes[j - 1][1]
        const cur = closes[j][1]
        if (prev > 0 && cur > 0) returns.push(Math.log(cur / prev))
      }
      if (returns.length === 20) {
        const mean = returns.reduce((sum, v) => sum + v, 0) / 20
        const variance = returns.reduce((sum, v) => sum + (v - mean) ** 2, 0) / 20
        realizedVol.push({
          observedOn: d, availableOn: d,
          value: clean(Math.sqrt(variance) * Math.sqrt(252) * 100),
        })
      }
    }
  }
  return { trend200, drawdown, realizedVol }
}

/**
 * C2：用 volume 序列补算 volumeRatio 缺口（如 2026-01）。
 * volume 单位为亿股；半日市不计入；孤立错值规则同 volumeRatioFromDaily。
 */
export function fillVolumeRatioGaps(ratioRows = [], volumeRows = []) {
  const existing = new Map(ratioRows.map(row => [row.observedOn ?? row[0], row]))
  const daily = volumeRows
    .map(row => Array.isArray(row) ? row : [row.observedOn, row.value])
    .filter(([d, volume]) => volume > 0 && !likelyShortSession(d))
  const full = daily.filter(([, volume], index) => {
    const around = [...daily.slice(Math.max(0, index - 2), index), ...daily.slice(index + 1, index + 3)]
      .map(([, v]) => v).sort((a, b) => a - b)
    if (around.length < 4) return true
    const median = (around[1] + around[2]) / 2
    return volume / median <= 4 && volume / median >= 0.3
  })
  const filled = full.flatMap(([d, volume], index) => {
    if (existing.has(d) || index < 20) return []
    const average = full.slice(index - 20, index).reduce((sum, [, v]) => sum + v, 0) / 20
    const value = Math.round(volume / average * 100) / 100
    return [{ observedOn: d, availableOn: d, value }]
  })
  return [...ratioRows, ...filled].sort((a, b) => a.observedOn.localeCompare(b.observedOn))
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
 * 世界银行 Pink Sheet 月表（Monthly Prices）→ [月末日期, 金 ÷ 银, 金月均价, 银月均价]（美元/盎司）。sheetXml 为工作表 XML，shared 为共享字符串；
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
    if (label && gold > 0 && silver > 0) rows.push([monthEnd(`${label[1]}-${label[2]}`), round2(gold / silver), gold, silver])
  }
  if (!columns) throw new Error('世界银行月表缺少 Gold、Silver 列')
  return rows
}

/**
 * 金银比：2000 年 9 月以前用世界银行月均价之比（early），之后用 Yahoo 日线按月汇总（月均金 ÷ 月均银，只取完整月份），
 * 最后接上最新一个交易日的读数，并附较 20 个交易日前的变化。月度部分作为百分位的历史样本。
 * 每行同时带金、银价格（月均价或当日收盘，美元/盎司），供图表叠加显示；early 的旧格式（只有比值）没有价格。
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
    const sums = byMonth.get(month(d)) ?? [0, 0, 0]
    byMonth.set(month(d), [sums[0] + g, sums[1] + s, sums[2] + 1])
  }
  const monthly = [
    ...early.filter(([d]) => month(d) < firstFull),
    ...[...byMonth].map(([key, [g, s, n]]) => [monthEnd(key + '-01'), round2(g / s), round2(g / n), Math.round(s / n * 1000) / 1000]),
  ].map(([d, value, gold, silver]) => ({ observedOn: d, availableOn: d, value, ...(gold > 0 && silver > 0 && { gold, silver }) }))
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

function macroLong(entry, today) {
  return normalize(entry?.long ?? entry?.history ?? [], today)
}

export function buildRadarSeries({
  local, macroUs, breadth, universes = {}, indexes = {}, marketCache, fetched, shillerEps,
  shillerPrice = [], panel, currentPanel, today, lastComplete, spxDaily = [], mastersFred = {},
}) {
  const rows = id => publishedRows(local[id], today)
  const simple = id => marketSeries(rows(id), 0, true)
  const pe = rows('spxPe').filter(([d, value]) => d >= '1900-01' && value > 0)
  const cape = rows('shillerCape').filter(([d, value]) => d >= '1900-01' && value > 0)
  const industries = normalize(marketCache.breadth, today)
  const historical = {
    baaChange: changeByMonth(panel.baa, 6),
    pe: priceAdjustedPe(completeMonthly(pe, lastComplete), panel.price),
    cape: marketSeries(completeMonthly(cape, lastComplete), 0),
    equityShare: quarterly(normalize(macroUs.equityShare?.long ?? macroUs.equityShare?.history, today)),
    cashShare: balanceSheetCash(fetched),
    finraDebtYoy: marketSeries(rows('finraDebtYoy'), 1),
    breadth: marketSeries(industries, 2),
    epsYoy: [
      ...changeByMonth(quarterEndEarnings(shillerEps), 12, true),
      ...(fetched.supplementalEpsYoy ?? []),
    ],
  }
  const volumeData = marketSeries(normalize(marketCache.volume, lastComplete), 0)
  Object.assign(historical, marketReadings({ pe: historical.pe, volume: volumeData }, panel, lastComplete))

  const currentPe = includeLatest(marketSeries(completeMonthly(pe, lastComplete), 0, true),
    marketSeries(pe.slice(-1), 0, true)[0], today)
  const currentCape = includeLatest(historical.cape, marketSeries(cape.slice(-1), 0, true)[0], today)
  const currentErp = readMarket({ pe: currentPe }, currentPanel, today).erp
  const tenYearDaily = rows('tenYearDaily')
  if (currentErp && tenYearDaily.length) {
    const daily = tenYearDaily.findLast(([d]) => d <= today)
    if (daily) {
      currentErp.dailyOn = daily[0]
      currentErp.dailyYield = daily[1]
    }
  }
  const hy = rows('hyDaily')
  const vix = new Map(fetched.vix)
  const vixTerm = fetched.vix3m.flatMap(([d, vix3m]) => vix.has(d) ? [{
    observedOn: d, availableOn: d, value: clean(vix.get(d) / vix3m), vix: vix.get(d), vix3m,
  }] : [])
  const breadth200 = normalize([
    ...(breadth?.backfill ?? []), ...(breadth?.history ?? []), [breadth?.date, breadth?.above200],
  ], today)
  const spxSeries = spxTrendVol(spxDaily.filter(([d]) => d <= today))
  const ofrCredit = (fetched.ofrFsi ?? []).map(([d, credit, fsi]) => ({
    observedOn: d, availableOn: d, value: credit, fsi,
  }))
  const dollarRows = changeOverDays(normalize(fetched.dollar, today), 91).map(([d, value, level]) => ({
    observedOn: d, availableOn: d, value, level,
  }))
  const reservesRows = changeOverDays(rows('bankReserves'), 91).map(([d, value]) => ({
    observedOn: d, availableOn: d, value,
  }))
  const volumeRatio = (() => {
    const recent = simple('volumeRatio')
    const start = recent[0]?.observedOn ?? '9999'
    const early = marketSeries((fetched.volumeRatioEarly ?? []).filter(([d]) => d < start), 0, true)
    return fillVolumeRatioGaps([...early, ...recent], rows('volume'))
  })()
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
    cftcLev: simple('cftcSpxLev'),
    breadth: marketSeries(industries, 0, true),
    vixTerm,
    goldSilver: attachSpx(goldSilverRatio(normalize(fetched.gold, today), normalize(fetched.silver, today), fetched.goldSilverEarly, today),
      shillerPrice, spxDaily.filter(([d]) => d <= today)),
    impliedCorr: impliedCorrelation(fetched.COR1M, fetched.COR3M),
    gex: gammaExposure(normalize(fetched.gex, today)),
    breadth200: marketSeries(breadth200, 0, true),
    volumeRatio,
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
    nasdaqGap: spxTrendVol((fetched.ixic ?? []).filter(([d]) => d <= today)).trend200,
    soxGap: spxTrendVol((fetched.sox ?? []).filter(([d]) => d <= today)).trend200,
    techShare: marketSeries((fetched.industryShare ?? []).map(([d, value]) => [d, value]), 0, true),
    chipsShare: marketSeries((fetched.industryShare ?? []).map(([d, , value]) => [d, value]), 0, true),
    energyShare: marketSeries((fetched.industryShare ?? []).filter(row => row.length > 3).map(([d, , , value]) => [d, value]), 0, true),
    finShare: marketSeries((fetched.industryShare ?? []).filter(row => row.length > 4).map(([d, , , , value]) => [d, value]), 0, true),
    russellGap: spxTrendVol((fetched.rut ?? []).filter(([d]) => d <= today)).trend200,
    hsiGap: spxTrendVol((fetched.hsi ?? []).filter(([d]) => d <= today)).trend200,
    sseGap: spxTrendVol((fetched.ssec ?? []).filter(([d]) => d <= today)).trend200,
    forwardEps: forwardEpsChange(rows('spxFactSetFpe'), spxDaily.filter(([d]) => d <= today)),
    // 18 项新增（只展示）
    nfci: marketSeries(macroLong(macroUs.nfci, today), 0, true),
    ofrCredit,
    realYield: marketSeries(normalize(fetched.realYield, today), 0, true),
    dollar: dollarRows,
    reserves: reservesRows,
    // FRED 季频以季初月标注 → quarterly() 落到季末，可得日为季末后第 3 个月末
    buffett: quarterly(macroLong(macroUs.buffett, today)),
    dividendYield: simple('spxDividendYield'),
    putCall: marketSeries(macroLong(macroUs.putCall, today), 0, true),
    skew: simple('skew'),
    hfEquityLs: marketSeries(macroLong(macroUs.hfEquityLs, today), 0, true),
    // 月度序列观测日落到当月月末
    marginGdp: marketSeries(macroLong(macroUs.marginGdp, today).map(([d, value]) => [monthEnd(d), value]), 0, true),
    vix: marketSeries(rows('vixDaily'), 0, true),
    vixTrend: vixTrend(rows('vixDaily')),
    trend200: spxSeries.trend200,
    drawdown: spxSeries.drawdown,
    realizedVol: spxSeries.realizedVol,
    vvix: marketSeries(normalize(fetched.vvix, today), 0, true),
    profitGdp: quarterly(normalize(mastersFred.profitGdp?.history, today)),
  }
  // 当前 erp 读数也带上 pe/gs10（includeLatest 可能丢掉嵌套字段时从 currentErp 补）
  if (current.erp.at(-1) && currentErp) {
    const last = current.erp.at(-1)
    if (!last.pe) Object.assign(last, { pe: currentErp.pe, gs10: currentErp.gs10, dailyOn: currentErp.dailyOn, dailyYield: currentErp.dailyYield })
  }
  const sources = Object.fromEntries(Object.entries(local).map(([id, entry]) => [id, entry.source]))
  Object.assign(sources, {
    netLiquidity: FRED_SERIES + 'WALCL', hy: sources.hyDaily, goldSilver: 'https://finance.yahoo.com/quote/SI=F/',
    baaChange: FRED_SERIES + 'BAA', erp: FRED_SERIES + 'GS10',
    pe: sources.spxPe, cape: sources.shillerCape, forwardPe: sources.spxFactSetFpe,
    equityShare: FRED_SERIES + macroUs.equityShare?.fred, cashShare: FRED_SERIES + CASH_SERIES[3],
    breadth: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html',
    volume: 'https://finance.yahoo.com/quote/%5EGSPC/history/',
    aaiiSpread: sources.retailBull, cftcAsset: sources.cftcSpxAsset, cftcLev: sources.cftcSpxLev,
    industryMomentum: FRENCH_INDUSTRIES, industryHighs: FRENCH_INDUSTRIES,
    industry200: FRENCH_INDUSTRIES_DAILY, industryNetHighs: FRENCH_INDUSTRIES_DAILY, industryAdvDec: FRENCH_INDUSTRIES_DAILY,
    sectorBreadth: breadth?.source, netHighs: breadth?.source, advDec: breadth?.source, above50: breadth?.source,
    equalWeight: 'https://finance.yahoo.com/quote/%5ESPXEW/history/',
    nasdaqGap: 'https://finance.yahoo.com/quote/%5EIXIC/history/',
    soxGap: 'https://finance.yahoo.com/quote/%5ESOX/history/',
    techShare: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html',
    chipsShare: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html',
    energyShare: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html',
    finShare: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html',
    russellGap: 'https://finance.yahoo.com/quote/%5ERUT/history/',
    hsiGap: 'https://finance.yahoo.com/quote/%5EHSI/history/',
    sseGap: 'https://finance.yahoo.com/quote/000001.SS/history/',
    vixTerm: CBOE + 'VIX3M_History.csv', impliedCorr: CBOE + 'COR1M_History.csv', gex: 'https://squeezemetrics.com/monitor/dix', breadth200: breadth?.source,
    epsYoy: 'https://shillerdata.com/', forwardEps: sources.spxForwardEpsChange,
    nfci: FRED_SERIES + 'NFCI', ofrCredit: OFR_FSI, realYield: FRED_SERIES + 'DFII10',
    dollar: FRED_SERIES + 'DTWEXBGS', reserves: sources.bankReserves,
    buffett: FRED_SERIES + 'NCBEILQ027S',
    dividendYield: sources.spxDividendYield,
    putCall: 'https://www.cboe.com/us/options/market_statistics/daily/',
    skew: sources.skew,
    hfEquityLs: 'https://www.financialresearch.gov/hedge-fund-monitor/',
    marginGdp: 'https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics',
    // macro-posture-daily 标普收盘：站内 Yahoo 优先、FRED 补充
    vix: sources.vixDaily,
    vixTrend: sources.vixDaily,
    trend200: 'https://finance.yahoo.com/quote/%5EGSPC/history/',
    drawdown: 'https://finance.yahoo.com/quote/%5EGSPC/history/',
    realizedVol: 'https://finance.yahoo.com/quote/%5EGSPC/history/',
    vvix: CBOE + 'VVIX_History.csv',
    profitGdp: FRED_SERIES + 'CP',
  })
  return { current, historical, sources }
}
