import { join } from 'node:path'
import { parseMonthlyTable } from '../../macro-posture.mjs'
import { unzipEntry } from '../../ths-etf-lib.mjs'
import { readJson, writeJsonIfChanged } from '../json-io.mjs'
import { average } from '../macro-posture/model.mjs'
import { monthEnd } from '../macro-posture/panel.mjs'

const FRENCH_URL = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_CSV.zip'
const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC'
const MULTPL = 'https://www.multpl.com/'
const CAPE_START = '1900-01'
const INDUSTRIES = 49
const MISSING = new Set([-99.99, -999])

export const month = date => date.slice(0, 7)
export function marketSeries(rows, lag, current = false) {
  return rows.map(([observedOn, value]) => ({
    observedOn, value, availableOn: current ? observedOn : monthEnd(observedOn, lag),
  })).sort((a, b) => a.observedOn.localeCompare(b.observedOn))
}

export function parseFrenchMonthly(csv) {
  const lines = csv?.split(/\r?\n/) ?? []
  const start = lines.findIndex(line => line.trim() === 'Average Value Weighted Returns -- Monthly')
  if (start < 0 || lines[start + 1]?.split(',').length !== INDUSTRIES + 1) {
    throw new Error('Ken French 市值加权月表表头异常')
  }
  const rows = []
  for (const line of lines.slice(start + 2)) {
    const [ym, ...cells] = line.split(',')
    if (!/^\d{6}$/.test(ym.trim())) break
    if (cells.length !== INDUSTRIES) throw new Error('Ken French 行业列数异常')
    const d = monthEnd(ym.trim().replace(/^(\d{4})(\d{2})$/, '$1-$2'))
    rows.push([d, cells.map(raw => {
      const value = Number(raw)
      return raw.trim() && Number.isFinite(value) && !MISSING.has(value) ? value : null
    })])
  }
  if (!rows.length) throw new Error('Ken French 市值加权月表无观测')
  return rows
}

export function buildBreadth(rows) {
  const windows = Array.from({ length: INDUSTRIES }, () => [])
  const breadth = []
  let previous
  for (const [d, returns] of rows) {
    if (previous && monthEnd(previous, 1) !== d) windows.forEach(window => { window.length = 0 })
    previous = d
    let known = 0
    let above = 0
    returns.forEach((ret, index) => {
      const window = windows[index]
      if (ret == null) {
        window.length = 0
        return
      }
      // Reset after a gap. A window requires ten consecutive month-end levels.
      const price = (window.at(-1) ?? 1) * (1 + ret / 100)
      window.push(price)
      if (window.length > 10) window.shift()
      if (window.length === 10) {
        known += 1
        if (price > average(window)) above += 1
      }
    })
    if (known) breadth.push([d, above / known * 100])
  }
  return breadth
}

export function parseYahooVolume(body, through, from = '1950-01') {
  const chart = body?.chart?.result?.[0]
  const volumes = chart?.indicators?.quote?.[0]?.volume
  if (!chart?.timestamp?.length || volumes?.length !== chart.timestamp.length) {
    throw new Error('Yahoo 标普日成交量响应异常')
  }
  const sums = new Map()
  chart.timestamp.forEach((timestamp, i) => {
    const volume = volumes[i]
    if (!Number.isFinite(timestamp) || !Number.isFinite(volume) || volume <= 0) return
    const d = monthEnd(new Date(timestamp * 1000).toISOString().slice(0, 10))
    if (d > through || month(d) < from) return
    const total = sums.get(d) ?? { sum: 0, days: 0 }
    total.sum += volume
    total.days += 1
    sums.set(d, total)
  })
  return [...sums.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([d, { sum, days }]) => [d, sum / days])
}

async function request(fetcher, url, type, headers) {
  const res = await fetcher(url, { signal: AbortSignal.timeout(25_000), ...(headers ? { headers } : {}) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res[type]()
}

async function refreshVolume(fetcher, file, now, through) {
  const cached = readJson(file, [])
  const latest = cached.at(-1)?.[0]
  if (latest >= through) return cached
  const from = latest ? month(latest) : '1950-01'
  // Keep the last cached month in the request so any late correction replaces it in full.
  const period1 = latest ? Date.parse(from + '-01') / 1000 : -631152000
  const url = `${YAHOO_URL}?period1=${period1}&period2=${Math.floor(now.getTime() / 1000)}&interval=1d`
  try {
    const body = await request(fetcher, url, 'json', { 'User-Agent': 'Mozilla/5.0' })
    const rows = parseYahooVolume(body, through, from)
    if (!rows.length || (!latest && month(rows[0][0]) !== from)) throw new Error('初始历史缺失或没有完整月')
    const merged = [...new Map([...cached, ...rows])].sort(([a], [b]) => a.localeCompare(b))
    if (merged.some(([d], i) => i > 0 && monthEnd(merged[i - 1][0], 1) !== d)) throw new Error('月度历史有缺口')
    writeJsonIfChanged(file, merged)
    return merged
  } catch (error) {
    if (!cached.length) throw new Error(`Yahoo 成交量抓取失败，且无缓存：${error.message}`, { cause: error })
    console.warn(`Yahoo 成交量沿用缓存（至 ${latest}）：${error.message}`)
    return cached
  }
}

async function refreshBreadth(fetcher, file) {
  const cached = readJson(file, [])
  try {
    const zip = await request(fetcher, FRENCH_URL, 'arrayBuffer')
    const rows = buildBreadth(parseFrenchMonthly(unzipEntry(Buffer.from(zip), '49_Industry_Portfolios.csv')))
    if (!rows.length || rows.at(-1)[0] < cached.at(-1)?.[0]) throw new Error('行业覆盖不足')
    writeJsonIfChanged(file, rows)
    return rows
  } catch (error) {
    if (!cached.length) throw new Error(`行业宽度抓取失败，且无缓存：${error.message}`, { cause: error })
    console.warn(`行业宽度沿用缓存（至 ${cached.at(-1)[0]}）：${error.message}`)
    return cached
  }
}

async function valuationTable(fetcher, path, today) {
  const html = await request(fetcher, MULTPL + path + '/table/by-month', 'text')
  const rows = parseMonthlyTable(html, monthEnd(today)).filter(([date, value]) => date <= today && value > 0)
  if (!rows.length) throw new Error(`multpl ${path} 无有效月度数据`)
  return rows
}

export async function loadMarketData(fetcher, directory, now, local) {
  const today = now.toISOString().slice(0, 10)
  const through = monthEnd(today, -1)
  const localCape = local.series?.shillerCape?.history?.filter(([d, value]) => d <= today && value > 0)
  const [breadth, volume, pe, cape] = await Promise.all([
    refreshBreadth(fetcher, join(directory, 'industry-breadth.json')),
    refreshVolume(fetcher, join(directory, 'spx-monthly-volume.json'), now, through),
    valuationTable(fetcher, 's-p-500-pe-ratio', today),
    localCape?.[0]?.[0]?.startsWith(CAPE_START) && month(localCape.at(-1)[0]) >= month(through)
      ? localCape : valuationTable(fetcher, 'shiller-pe', today),
  ])
  const capeWindow = cape.filter(([d]) => month(d) >= CAPE_START)
  const peWindow = pe.filter(([d]) => month(d) >= CAPE_START)
  if (!capeWindow[0]?.[0]?.startsWith(CAPE_START)) throw new Error('CAPE 必须包含 1900-01 起的扩张窗口')
  const forwardPe = local.series?.spxFactSetFpe?.history?.filter(([d, value]) => d <= today && value > 0).at(-1)
  return {
    historical: {
      breadth: marketSeries(breadth, 2), volume: marketSeries(volume, 0),
      pe: marketSeries(peWindow, 3), cape: marketSeries(capeWindow, 0),
    },
    current: {
      breadth: marketSeries(breadth, 2, true), volume: marketSeries(volume, 0),
      pe: marketSeries(peWindow, 3, true), cape: marketSeries(capeWindow, 0, true),
    },
    forwardPe: forwardPe ? { observedOn: forwardPe[0], value: forwardPe[1] } : null,
  }
}
