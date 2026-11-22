import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseCsv, round } from '../server/macro.mjs'

const FRED = 'https://fred.stlouisfed.org'
const OUTPUT = fileURLToPath(new URL('../public/data/macro-masters-fred.json', import.meta.url))
const DAY_MS = 86_400_000
const START_1990 = '1990-01-01'

const SERIES = {
  fedFunds: { fred: 'FEDFUNDS', name: '联邦基金有效利率', frequency: 'monthly', start: START_1990 },
  nominalGdpYoy: { fred: 'GDP', name: '美国名义 GDP 同比', frequency: 'quarterly', start: START_1990, transform: yearOverYear },
  dotMedian: { fred: 'FEDTARMD', name: 'SEP 联邦基金利率中位数', frequency: 'quarterly', note: 'SEP 联邦基金利率中位数；history 的日期是预测目标年份' },
  privateCreditGdp: { fred: 'QUSPAM770A', name: '美国私人非金融部门信贷占 GDP', frequency: 'quarterly', start: START_1990 },
  govDebtGdp: { fred: 'GFDEGDQ188S', name: '美国联邦政府债务占 GDP', frequency: 'quarterly', start: START_1990 },
  hyYield: { fred: 'BAMLH0A0HYM2EY', name: '美国高收益债有效收益率', frequency: 'daily' },
  cccSpread: { fred: 'BAMLH0A3HYC', name: '美国 CCC 及以下高收益债期权调整利差', unit: 'bp', frequency: 'daily', transform: rows => rows.map(([date, value]) => [date, Math.round(value * 100)]) },
  m2Yoy: { fred: 'M2SL', name: '美国 M2 同比', frequency: 'monthly', start: START_1990, transform: yearOverYear },
  inflationExp: { fred: 'T10YIE', name: '美国 10 年盈亏平衡通胀率', frequency: 'daily', start: '2006-01-01' },
  primeRate: { fred: 'MPRIME', name: '美国优惠贷款利率', frequency: 'monthly', start: START_1990 },
  discountRate: { fred: 'DPCREDIT', name: '美联储一级信贷利率', frequency: 'daily' },
  consumerCreditYoy: { fred: 'NONREVSL', name: '美国非循环消费信贷同比', frequency: 'monthly', start: START_1990, transform: yearOverYear },
  profitGdp: { fred: 'CP ÷ GDP', name: '美国税后企业利润占 GDP', frequency: 'quarterly', start: START_1990, ids: ['CP', 'GDP'], transform: profitToGdp },
}

export function parseFredCsv(text) {
  return [...new Map(parseCsv(text))].sort(([a], [b]) => a.localeCompare(b))
}

export function yearOverYear(rows) {
  const values = new Map(rows)
  return rows.flatMap(([date, value]) => {
    const priorDate = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`
    const prior = values.get(priorDate)
    return prior ? [[date, round((value / prior - 1) * 100, 2)]] : []
  })
}

export function profitToGdp(profitRows, gdpRows) {
  const gdp = new Map(gdpRows)
  return profitRows.flatMap(([date, profit]) => {
    const denominator = gdp.get(date)
    return denominator ? [[date, round(profit / denominator * 100, 2)]] : []
  })
}

// Keep the last observation in each older Monday–Sunday week. Input is in date order.
export function downsampleDaily(rows, today) {
  const cutoff = Date.parse(today) - 399 * DAY_MS
  const weeks = new Map()
  const daily = []
  for (const row of rows) {
    const date = new Date(row[0])
    if (date.getTime() >= cutoff) {
      daily.push(row)
    } else {
      const daysSinceMonday = (date.getUTCDay() + 6) % 7
      weeks.set(date.getTime() - daysSinceMonday * DAY_MS, row)
    }
  }
  return [...weeks.values(), ...daily]
}

export function parseSepUpdated(html) {
  const match = html.match(/\bUpdated:\s*(?:<span[^>]*>\s*)?<span\s+class="series-meta-updated-date(?: [^"]*)?">\s*([A-Z][a-z]{2} (\d{1,2}), \d{4})\s*<\/span>/)
  if (!match) return undefined
  const date = new Date(`${match[1]} UTC`)
  if (date.getUTCDate() === Number(match[2])) return date.toISOString().slice(0, 10)
}

async function fetchFred(fetcher, url, id, parse) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(20_000) })
      if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`)
      return parse(await response.text())
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
}

async function collectSeries(key, definition, today, fetcher) {
  const { fred, name, unit = '%', frequency, note, start, ids = [fred], transform } = definition
  const projection = key === 'dotMedian'
  const inputs = ids.map(id => fetchFred(fetcher, `${FRED}/graph/fredgraph.csv?id=${id}`, id, csv => {
    const rows = parseFredCsv(csv).filter(([date]) => projection || date <= today)
    if (!rows.length) throw new Error(`${id}: 无有效观测`)
    return rows
  }))
  // FEDTARMD dates mark forecast years. Its release date comes from the series page.
  const release = projection ? fetchFred(fetcher, `${FRED}/series/${fred}`, fred, html => {
    const updated = parseSepUpdated(html)
    if (!updated || updated > today) throw new Error(`${fred}: 未能核实 SEP 更新时间`)
    return updated
  }) : undefined
  const [updated, ...rows] = await Promise.all([release, ...inputs])
  let history = (transform ? transform(...rows) : rows[0])
    .map(([date, value]) => [date, round(value, 3)])
    .filter(([date, value]) => (!start || date >= start) && Number.isFinite(value))
  if (frequency === 'daily') history = downsampleDaily(history, today)
  if (!history.length) throw new Error(`${fred}: 无可用历史数据`)
  return { fred, name, unit, frequency, note, updated, history }
}

export async function updateFredFile({
  output = OUTPUT, today = new Date().toISOString().slice(0, 10), fetcher = fetch, warn = console.warn,
} = {}) {
  let previous
  try {
    previous = JSON.parse(await readFile(output, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const definitions = Object.entries(SERIES)
  const results = await Promise.allSettled(definitions.map(([key, definition]) => collectSeries(key, definition, today, fetcher)))
  const series = {}
  for (const [index, result] of results.entries()) {
    const [key] = definitions[index]
    if (result.status === 'fulfilled') {
      series[key] = result.value
    } else {
      const refreshError = result.reason?.message ?? String(result.reason)
      const old = previous?.series?.[key]
      const retain = old?.history?.length && (key !== 'dotMedian' || old.updated)
      if (retain) series[key] = { ...old, refreshError }
      warn(`${key}: ${refreshError}（${retain ? '沿用旧数据' : '省略该序列'}）`)
    }
  }
  if (results.every(result => result.status === 'rejected')) throw new Error('FRED 序列全部刷新失败，未写入数据文件')

  const data = { generatedAt: today, source: 'FRED, Federal Reserve Bank of St. Louis', series }
  // Keep each observation on a single line for small, readable data diffs.
  const content = JSON.stringify(data, null, 2).replace(/\[\n {10}("\d{4}-\d{2}-\d{2}"),\n {10}([^\n]+)\n {8}\]/g, '[$1, $2]') + '\n'
  const temporary = `${output}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content)
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }
  return { data, bytes: Buffer.byteLength(content) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { data, bytes } = await updateFredFile()
    for (const [key, series] of Object.entries(data.series)) {
      const [date, value] = series.history.at(-1)
      const updated = series.updated ? `；SEP 更新 ${series.updated}` : ''
      console.log(`${key}: ${value} ${series.unit} (${date}${updated})`)
    }
    console.log(`macro-masters-fred.json: ${bytes} bytes`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
