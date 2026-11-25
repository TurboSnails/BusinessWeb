#!/usr/bin/env node
// 从中证指数官网取 15 个全收益指数（含每日成交额）与择时用的 000300、000922 价格指数，写到 inputs.json。
// 取数方式与 scripts/research/etf-strategy-oos/bt-index.mjs 的 csindex() 相同，只多保留 tradingValue。
// 用法：node docs/research/etf-volume-2026-11-25/fetch.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TARGETS = ['H00300', 'H00905', 'H00852', 'H00016', 'H00922', 'H00986', 'H00987', 'H00988', 'H00989', 'H00990', 'H00991', 'H00992', 'H00993', 'H00994', 'H00995']
const sleep = ms => new Promise(r => setTimeout(r, ms))
// 中证接口有频率限制：请求间隔 PACE_MS（默认 8 秒），被拦时按 60 秒递增退避
const PACE = Number(process.env.PACE_MS || 8000)
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.csindex.com.cn/' }
// 逐个指数缓存，被限流时可重跑续取（缓存目录可用 CACHE_DIR 指定）
const CACHE = process.env.CACHE_DIR || `${process.env.HOME}/.businessweb-etf-oos/volume`
mkdirSync(CACHE, { recursive: true })
async function cached(code) {
  const file = `${CACHE}/${code}.json`
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const data = await csindex(code)
  writeFileSync(file, JSON.stringify(data))
  return data
}

async function csindex(code) {
  const rows = new Map()
  for (let y = 2004; y <= new Date().getFullYear(); y += 4) {
    const url = `https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=${code}&startDate=${y}0101&endDate=${y + 3}1231`
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const j = await (await fetch(url, { signal: AbortSignal.timeout(30000), headers: HEADERS })).json()
        for (const r of j.data || []) {
          if (r.close > 0) rows.set(r.tradeDate, [`${r.tradeDate.slice(0, 4)}-${r.tradeDate.slice(4, 6)}-${r.tradeDate.slice(6)}`, r.close, r.tradingValue ?? null, r.indexNameCn])
        }
        break
      } catch (e) { if (attempt === 5) throw new Error(`${code} ${y}: ${e.message}`); await sleep(60000 * (attempt + 1)) }
    }
    await sleep(PACE)
  }
  const arr = [...rows.values()].sort((a, b) => a[0].localeCompare(b[0]))
  return { name: arr.at(-1)?.[3] ?? code, rows: arr.map(([d, c, v]) => [d, c, v]) }
}

const out = { source: '中证指数官网 index-perf 接口；行：[日期, 收盘, 成交额(亿元)]', fetchedAt: new Date().toISOString(), timing: {}, targets: {} }
for (const code of ['000300', '000922']) { out.timing[code] = await cached(code); console.log(code, out.timing[code].rows.length) }
for (const code of TARGETS) { out.targets[code] = await cached(code); console.log(code, out.targets[code].name, out.targets[code].rows.length, out.targets[code].rows[0][0]) }
writeFileSync(fileURLToPath(new URL('./inputs.json', import.meta.url)), JSON.stringify(out) + '\n')
