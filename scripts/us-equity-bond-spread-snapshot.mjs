#!/usr/bin/env node
// 生成监控页「股债息差 · 美股」的数据快照 public/data/us-equity-bond-spread.json。
//
// 息差 = 100 / 标普500 12 个月 Forward PE − 10 年期美债收益率（百分点），周度。
// - Forward PE：public/data/index-history.json 里 spx.ref.points（History of Market，周度，随 npm run index:update 维护）
// - 10 年期美债：FRED DGS10（取不晚于该周的最近一个观测）
// - 标普500 收盘：Yahoo ^GSPC 周线（价格指数，不含分红）
// 只保存原始序列，分位、分组和通道回测都在前端计算。用法：npm run spread:us-update
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const INDEX_FILE = fileURLToPath(new URL('../public/data/index-history.json', import.meta.url))
const OUT = fileURLToPath(new URL('../public/data/us-equity-bond-spread.json', import.meta.url))
const UA = { 'user-agent': 'Mozilla/5.0' }
const TIMEOUT_MS = 30_000

/** 返回 dates（升序）里不晚于 day 的最后一个值 */
function lastOnOrBefore(dates, values, day) {
  let lo = 0, hi = dates.length - 1, hit = -1
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (dates[mid] <= day) { hit = mid; lo = mid + 1 } else hi = mid - 1 }
  return hit >= 0 ? { date: dates[hit], value: values[hit] } : null
}

async function fredDgs10() {
  const res = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=1989-01-01', { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`FRED DGS10 HTTP ${res.status}`)
  const lines = (await res.text()).trim().split(/\r?\n/).slice(1)
  const pts = lines.map(l => l.split(',')).filter(([, v]) => v && v !== '.').map(([d, v]) => [d, Number(v)])
  return { dates: pts.map(p => p[0]), values: pts.map(p => p[1]) }
}

async function yahooWeekly() {
  const now = Math.floor(Date.now() / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=631152000&period2=${now}&interval=1wk`
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Yahoo ^GSPC HTTP ${res.status}`)
  const r = (await res.json()).chart.result[0]
  const close = r.indicators.quote[0].close
  const pts = r.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), close[i]]).filter(([, c]) => Number.isFinite(c))
  return { dates: pts.map(p => p[0]), values: pts.map(p => p[1]) }
}

async function main() {
  const spx = JSON.parse(await readFile(INDEX_FILE, 'utf8')).indexes.spx
  const fpe = spx?.ref?.points
  if (!Array.isArray(fpe) || fpe.length < 500) throw new Error('index-history.json 里的 spx.ref.points 缺失或过短')
  const [y10, px] = await Promise.all([fredDgs10(), yahooWeekly()])
  const rows = []
  for (const [day, pe] of fpe) {
    const y = lastOnOrBefore(y10.dates, y10.values, day)
    const p = lastOnOrBefore(px.dates, px.values, day)
    if (!y || !p || !(pe > 0)) continue
    rows.push([day, Number((100 / pe - y.value).toFixed(3)), Number(p.value.toFixed(2)), pe, y.value])
  }
  if (rows.length < 1000) throw new Error(`只拼出 ${rows.length} 行，疑似上游异常，未写入`)
  const snapshot = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: `Forward PE：${spx.ref.source}；10 年期美债：FRED DGS10；标普500：Yahoo ^GSPC 周线收盘（价格指数，不含分红）`,
    latestYield: { date: y10.dates.at(-1), value: y10.values.at(-1) },
    window: 156,
    k: 2,
    rows,
  }
  await writeFile(OUT, JSON.stringify(snapshot) + '\n')
  const last = rows.at(-1)
  console.log(`已写入 ${OUT}：${rows.length} 行，${rows[0][0]} 至 ${last[0]}，最新息差 ${last[1]}（PE ${last[3]}，10Y ${last[4]}）`)
}

main().catch(e => { console.error(e.message); process.exitCode = 1 })
