#!/usr/bin/env node
// 生成美股行业「前瞻 P/E 历史」快照 public/data/us-sector-forward-pe.json。
//
// 数据源：History of Market（historyofmarket.com，CC BY 4.0）sectors/forward-pe.json，
// 12 个月混合前瞻一致预期 P/E（终端口径，周度）。目前只覆盖 4 个标普行业：
// S5INFT、S5FINL、S5COND、S5CONS，分别对应项目行业切片 sector-xlk / xlf / xly / xlp。
// 上游行业序列更新常落后数周，所以每个行业都保留 latestDate，前端据此标注“截至”。
// 手动补充：把 Bloomberg 导出的 CSV（图表 Actions → Export）放进 data-raw/bloomberg-sector-pe/<行业id>.csv，
// 例如 sector-xlp.csv；同日期以 CSV 为准，行业不在上游 4 个里时只用 CSV 生成。两者同为 Bloomberg 终端口径。
// 只保存原始序列与全历史统计；不拼接 FactSet 等其他口径。用法：npm run sector-pe:update
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://historyofmarket.com/api/sectors/forward-pe.json'
const OUT = fileURLToPath(new URL('../public/data/us-sector-forward-pe.json', import.meta.url))
const CSV_DIR = fileURLToPath(new URL('../data-raw/bloomberg-sector-pe/', import.meta.url))
const TIMEOUT_MS = 30_000
/** 序列只保留这一日之后的点，控制文件体积；统计量仍按上游全历史计算。 */
const KEEP_FROM = '2005-01-01'

/** 项目 11 个行业切片 id → 彭博指数与中文名，供只有 CSV 的行业使用。 */
export const SECTOR_NAMES = {
  'sector-xlk': ['S5INFT', 'XLK', '信息科技'], 'sector-xlf': ['S5FINL', 'XLF', '金融'], 'sector-xly': ['S5COND', 'XLY', '可选消费'],
  'sector-xlp': ['S5CONS', 'XLP', '必需消费'], 'sector-xlv': ['S5HLTH', 'XLV', '医疗保健'], 'sector-xli': ['S5INDU', 'XLI', '工业'],
  'sector-xle': ['S5ENRS', 'XLE', '能源'], 'sector-xlb': ['S5MATR', 'XLB', '原材料'], 'sector-xlu': ['S5UTIL', 'XLU', '公用事业'],
  'sector-xlre': ['S5RLST', 'XLRE', '房地产'], 'sector-xlc': ['S5TELS', 'XLC', '通信服务'],
}

export const SECTOR_MAP = [
  { key: 'inft', id: 'sector-xlk' },
  { key: 'finl', id: 'sector-xlf' },
  { key: 'cond', id: 'sector-xly' },
  { key: 'cons', id: 'sector-xlp' },
]

/** 全历史里低于最新值的占比（0–100），与 History of Market 的百分位口径一致。 */
export function percentileOf(values, latest) {
  if (!values.length) return undefined
  return Math.round((values.filter(v => v < latest).length / values.length) * 1000) / 10
}

/** 日期统一成 YYYY-MM-DD；认 2026-11-19、2026/11/19 和彭博常见的 11/19/2026。 */
export function normalizeDate(text) {
  const t = String(text).trim().replace(/^"|"$/g, '')
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!m) { const u = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); m = u && [u[0], u[3], u[1], u[2]] }
  if (!m) return undefined
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return Number.isNaN(Date.parse(iso)) ? undefined : iso
}

/** 读彭博导出的 CSV：取第一列日期、第二列数值，表头与说明行自然被跳过；逗号分隔，数值可带引号和千分位。 */
export function parseBloombergCsv(text) {
  const byDate = new Map()
  for (const line of text.split(/\r?\n/)) {
    const cells = line.match(/("[^"]*"|[^,]*)(?:,|$)/g)?.map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').trim()) ?? []
    const date = normalizeDate(cells[0] ?? '')
    const value = Number((cells[1] ?? '').replace(/,/g, ''))
    if (date && value > 0) byDate.set(date, value)
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))
}

/** 上游序列与 CSV 合并，同日期 CSV 优先。 */
export function mergeSeries(upstream = [], manual = []) {
  const byDate = new Map(upstream.map(p => [p.date, p.value]))
  for (const p of manual) byDate.set(p.date, p.value)
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))
}

export function buildSector(raw, id, manual = []) {
  const upstreamLast = raw?.series?.at(-1)?.date
  const all = mergeSeries(raw?.series, manual).filter(p => typeof p?.date === 'string' && p.value > 0)
  if (all.length < 100) throw new Error(`${id} 只有 ${all.length} 个点，疑似上游异常`)
  const values = all.map(p => p.value)
  const last = all.at(-1)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sorted = [...values].sort((a, b) => a - b)
  const hi = all.reduce((best, p) => (p.value > best.value ? p : best))
  const lo = all.reduce((best, p) => (p.value < best.value ? p : best))
  const [ticker, etf, name] = SECTOR_NAMES[id] ?? []
  return {
    id,
    ticker: raw?.ticker ?? ticker,
    etf: raw?.etf ?? etf,
    name: raw?.label?.cn ?? raw?.label?.en ?? name ?? id,
    ...(manual.length ? { manual: { count: manual.length, from: manual[0].date, to: manual.at(-1).date, upstreamLast } } : {}),
    historyStarts: all[0].date,
    latest: { date: last.date, value: last.value },
    stats: {
      count: values.length,
      mean: Math.round(mean * 100) / 100,
      median: sorted[Math.floor(sorted.length / 2)],
      percentile: percentileOf(values, last.value),
      high: { date: hi.date, value: hi.value },
      low: { date: lo.date, value: lo.value },
    },
    history: all.filter(p => p.date >= KEEP_FROM).map(p => [p.date, p.value]),
  }
}

export function buildSnapshot(upstream, now = new Date(), manual = {}) {
  const sectors = {}
  for (const { key, id } of SECTOR_MAP) sectors[id] = buildSector(upstream.sectors?.[key], id, manual[id])
  for (const [id, points] of Object.entries(manual)) if (!sectors[id]) sectors[id] = buildSector(undefined, id, points)
  return {
    generatedAt: now.toISOString().slice(0, 10),
    upstreamUpdated: upstream.updated,
    source: 'History of Market（historyofmarket.com，CC BY 4.0）：12 个月混合前瞻一致预期 P/E，终端口径，周度',
    sourceUrl: SOURCE_URL,
    sectors,
  }
}

async function readManual() {
  const out = {}
  let files = []
  try { files = await readdir(CSV_DIR) } catch { return out }
  for (const file of files.filter(f => /^sector-[a-z]+\.csv$/.test(f))) {
    const points = parseBloombergCsv(await readFile(CSV_DIR + file, 'utf8'))
    if (points.length) out[file.replace('.csv', '')] = points
    else console.warn(`${file} 没有解析出任何「日期, 数值」行，已忽略`)
  }
  return out
}

async function main() {
  const res = await fetch(SOURCE_URL, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`History of Market HTTP ${res.status}`)
  const snapshot = buildSnapshot(await res.json(), new Date(), await readManual())
  await writeFile(OUT, JSON.stringify(snapshot) + '\n')
  for (const s of Object.values(snapshot.sectors)) {
    console.log(`${s.id} ${s.ticker}：${s.history.length} 点，最新 ${s.latest.value}（${s.latest.date}），分位 ${s.stats.percentile}%`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1 })
