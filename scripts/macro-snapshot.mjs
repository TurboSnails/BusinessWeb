#!/usr/bin/env node
// 生成 public/data/macro-{us,cn,hk}.json（短期读数的取数逻辑见 server/macro.mjs）。
// 用法：npm run macro:update；只补美国长历史：npm run macro:update -- --us-long-only
// 自动：工作日 UTC 22:00 由 Vercel Cron 派发 macro-snapshot.yml（GitHub 22:30 兜底）；周六 UTC 06:00 再补一轮。
// 某个数据源失败时保留上一次的读数并打印警告，不会把已有数据清空。
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildSnapshots, drawdown, monthly, parseCsv, round, subtract, yoy } from '../server/macro.mjs'

export const DATA_FILES = {
  us: fileURLToPath(new URL('../public/data/macro-us.json', import.meta.url)),
  cn: fileURLToPath(new URL('../public/data/macro-cn.json', import.meta.url)),
  hk: fileURLToPath(new URL('../public/data/macro-hk.json', import.meta.url)),
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return null }
}

async function fetchFredRows(id) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`)
  const rows = parseCsv(await response.text())
  if (!rows.length) throw new Error(`${id}: 无数据`)
  return rows.sort(([a], [b]) => a.localeCompare(b))
}

async function readSpxRows() {
  const { rows } = JSON.parse(await readFile(new URL('../data-raw/macro-posture-daily/spx-daily.json', import.meta.url), 'utf8'))
  if (!rows?.length) throw new Error('标普日线缓存无数据')
  return rows
}

const FRED_LONG = {
  gdp: { id: 'A191RL1Q225SBEA', frequency: 'quarterly' },
  unrate: { id: 'UNRATE', frequency: 'monthly' },
  sahm: { id: 'SAHMREALTIME', frequency: 'monthly' },
  claims: { id: 'IC4WSA', convert: value => round(value * (1 / 10000), 1) },
  curve: { id: 'T10Y2Y' },
  hy: { id: 'BAMLH0A0HYM2', convert: value => round(value * 100, 0) },
  nfci: { id: 'NFCI' },
  vix: { id: 'VIXCLS' },
  ccDelinq: { id: 'DRCCLACBS', frequency: 'quarterly' },
  tenYear: { id: 'DGS10' },
  saving: { id: 'PSAVERT', frequency: 'monthly' },
}

const FINRA_START = '1997-01'
const QUARTER_END = { '01': ['03', '31'], '04': ['06', '30'], '07': ['09', '30'], '10': ['12', '31'] }

/**
 * 融资余额 ÷ GDP 的早期历史：FINRA 统计从 1997-01 起；之前用美联储资金流量表 Z.1
 * 「券商应收客户款项（保证金贷款等）」BOGZ1FL663067003Q（季度，1945 起）÷ GDP，
 * 按 1997 年四个季末两者比值的平均数缩放后接在 FINRA 序列前面（1997–2005 年两者相差在一成以内；
 * 2010 年后 FINRA 口径变宽，两者差到约 2 倍，所以只用于 1997 年以前）。早期为季度点。
 */
export function spliceEarlyMarginGdp(finraLong, receivables, gdp) {
  const finra = finraLong.filter(([date]) => date.slice(0, 7) >= FINRA_START)
  const sortedGdp = [...gdp].sort(([a], [b]) => a.localeCompare(b))
  const gdpAt = month => [...sortedGdp].reverse().find(([d]) => d.slice(0, 7) <= month)?.[1]
  const early = receivables.flatMap(([date, value]) => {
    const [year, month] = date.split('-')
    const end = QUARTER_END[month]
    const g = end && gdpAt(`${year}-${end[0]}`)
    return g ? [[`${year}-${end[0]}-${end[1]}`, (value / 1000) / g * 100]] : []
  })
  const byMonth = new Map(finra.map(([date, value]) => [date.slice(0, 7), value]))
  const overlap = early.filter(([date]) => date.startsWith(FINRA_START.slice(0, 4)) && byMonth.has(date.slice(0, 7)))
  if (overlap.length < 2) throw new Error('融资余额早期拼接：1997 年重叠季末不足')
  const scale = overlap.reduce((sum, [date, value]) => sum + byMonth.get(date.slice(0, 7)) / value, 0) / overlap.length
  const before = early.filter(([date]) => date.slice(0, 7) < FINRA_START).map(([date, value]) => [date, round(value * scale, 2)])
  return [...before, ...finra]
}

/** 只更新长历史；最近读数和迷你图仍由原有快照生成。 */
export async function refreshUsLong(us, previous = us, { fetchRows = fetchFredRows, readSpx = readSpxRows } = {}) {
  const fixed = Object.fromEntries(Object.entries(FRED_LONG).map(([key, { id, frequency, convert }]) => [key, {
    frequency: frequency ?? 'monthly',
    build: async () => {
      const rows = await fetchRows(id)
      const points = frequency ? rows : monthly(rows)
      return convert ? points.map(([date, value]) => [date, convert(value)]) : points
    },
  }]))
  let pce
  const corePce = () => (pce ??= fetchRows('PCEPILFE').then(yoy))
  const definitions = {
    ...fixed,
    corePce: { frequency: 'monthly', build: corePce },
    realRate: { frequency: 'monthly', build: async () => {
      const [funds, inflation] = await Promise.all([fetchRows('FEDFUNDS'), corePce()])
      return subtract(funds, inflation)
    } },
    marginGdp: { frequency: 'monthly', build: async () => {
      const [receivables, gdp] = await Promise.all([fetchRows('BOGZ1FL663067003Q'), fetchRows('GDP')])
      return spliceEarlyMarginGdp(us.series.marginGdp?.long ?? [], receivables, gdp)
    } },
    dd: { frequency: 'monthly', build: async () => {
      const [cached, recent] = await Promise.all([readSpx(), fetchRows('SP500')])
      // 近期用 FRED 日收盘，早期用本地日线补齐。先逐日更新峰值，再取每月最后一笔回撤。
      const earlier = cached.filter(([date]) => date < recent[0][0])
      return monthly(drawdown([...earlier, ...recent]))
    } },
  }
  const series = { ...us.series }
  const warnings = []
  await Promise.all(Object.entries(definitions).map(async ([key, { frequency, build }]) => {
    const current = series[key]
    if (!current) return
    try {
      const long = await build()
      if (!long.length) throw new Error('无长历史观测')
      series[key] = { ...current, frequency, long }
    } catch (error) {
      const old = previous?.series?.[key]
      if (old?.long?.length) series[key] = { ...current, frequency, long: old.long }
      warnings.push(`${key} 长历史：${error.message}${old?.long?.length ? '（保留旧长历史）' : ''}`)
    }
  }))
  return { us: { ...us, series }, warnings }
}

/** 拉取最新数据并写入 public/data；本地开发服务的「刷新」也调用它 */
export async function updateSnapshotFiles({ usLongOnly = false } = {}) {
  if (usLongOnly) {
    const previous = await readJson(DATA_FILES.us)
    if (!previous) throw new Error('无法读取现有美国快照')
    const result = await refreshUsLong(previous)
    await writeFile(DATA_FILES.us, JSON.stringify(result.us) + '\n')
    return result
  }
  const previous = { us: await readJson(DATA_FILES.us), cn: await readJson(DATA_FILES.cn), hk: await readJson(DATA_FILES.hk) }
  const result = await buildSnapshots(previous)
  const extended = await refreshUsLong(result.us, previous.us)
  result.us = extended.us
  result.warnings.push(...extended.warnings)
  // 文件里只保留日期，避免每次运行都产生无意义的改动
  // live 标记只在实时刷新时有意义，不写进文件
  const strip = ({ fetchedAt, series, ...rest }) => ({ ...rest, series: Object.fromEntries(Object.entries(series).map(([k, { live, ...v }]) => [k, v])) })
  await writeFile(DATA_FILES.us, JSON.stringify(strip(result.us)) + '\n')
  await writeFile(DATA_FILES.cn, JSON.stringify(strip(result.cn)) + '\n')
  await writeFile(DATA_FILES.hk, JSON.stringify(strip(result.hk)) + '\n')
  return result
}

async function main() {
  const { us, cn, hk, warnings } = await updateSnapshotFiles({ usLongOnly: process.argv.includes('--us-long-only') })
  for (const w of warnings) console.warn(`⚠ ${w}`)
  for (const [label, set] of [['美国', us], ['中国', cn], ['港股', hk]]) {
    if (!set) continue
    console.log(`── ${label}`)
    for (const [k, v] of Object.entries(set.series)) console.log(`${k.padEnd(9)} ${String(v.latest.value).padStart(8)} ${(v.unit || '').padEnd(3)} ${v.latest.date}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1 })
