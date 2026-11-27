#!/usr/bin/env node
// 更新风格轮动 ETF 影子运行与风格雷达读数 public/data/style-rotation-shadow.json（L-042）。
// 从 Yahoo 抓美国与海外各 6 只风格 ETF 的日线复权收盘（含分红），增量写入 data-raw/style-rotation-shadow/etf-daily.json；
// 抓取失败就沿用缓存并 warn。
// 退出码：0 正常；1 其他错误（工作流里只发 warning）；2 已冻结的行被改写（工作流里要失败）。
// 用法：node scripts/style-rotation-shadow.mjs
import { fileURLToPath } from 'node:url'
import { readJson, writeJsonIfChanged } from './lib/json-io.mjs'
import { mergeAdjusted } from './lib/defensive-tilt-shadow.mjs'
import { monthAfter } from './lib/late-cycle-shadow.mjs'
import { SHADOW_SINCE, SYMBOLS, buildShadow, frozenViolations } from './lib/style-rotation-shadow.mjs'
import { parseYahooAdjusted } from './us-market-breadth.mjs'

const root = p => fileURLToPath(new URL(`../${p}`, import.meta.url))
const OUT = root('public/data/style-rotation-shadow.json')
const CACHE = root('data-raw/style-rotation-shadow/etf-daily.json')
// 风格雷达当月读数要用到 t−13 月月末；从影子期首月往前 15 个月与今天往前 15 个月取较早者
const FETCH_FROM = (() => { const a = monthAfter(SHADOW_SINCE, -15); const b = monthAfter(new Date().toISOString().slice(0, 7), -15); return `${a < b ? a : b}-01` })()

async function chart(symbol, now) {
  const p1 = Math.floor(Date.parse(`${FETCH_FROM}T00:00:00Z`) / 1000)
  const p2 = Math.floor(now.getTime() / 1000)
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d&events=div`
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function main() {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const cache = readJson(CACHE, {})
  const symbols = { ...(cache.symbols ?? {}) }
  for (const symbol of SYMBOLS) {
    try {
      const incoming = parseYahooAdjusted(await chart(symbol, now), symbol, now)
      if (!incoming.length) throw new Error('无复权收盘')
      const merged = mergeAdjusted(symbols[symbol]?.rows ?? [], incoming)
      if (!merged) throw new Error('新旧数据无重叠，无法对齐复权口径')
      symbols[symbol] = { fetchedAt: now.toISOString(), rows: merged.map(([d, v]) => [d, Math.round(v * 1e4) / 1e4]) }
    } catch (error) {
      console.warn(`::warning::${symbol} 行情抓取失败（${error.message}），沿用缓存（${symbols[symbol]?.rows?.at(-1)?.[0] ?? '无'}）`)
    }
  }
  writeJsonIfChanged(CACHE, { source: 'Yahoo Finance chart API，adjclose（含分红复权）', from: FETCH_FROM, symbols })

  const prices = Object.fromEntries(SYMBOLS.map(s => [s, symbols[s]?.rows ?? []]))
  const previous = readJson(OUT, null)
  const next = buildShadow({ previous, prices, today, generatedAt: now.toISOString() })
  const broken = frozenViolations(previous, next)
  if (broken.length) {
    console.error(`已冻结的风格轮动影子行被改写：${broken.join('、')}，停止`)
    process.exit(2)
  }
  writeJsonIfChanged(OUT, next, { pretty: true })
  const r = next.radar
  const fmt = g => (r[g] ? `R1 ${r[g].r1.join('、')}` : '—')
  console.log(`风格轮动影子运行：冻结 ${next.rows.length} 个月；风格雷达 ${r.month}：美国 ${fmt('us')}；海外 ${fmt('intl')}`)
}

await main().catch(error => { console.error(error.message); process.exit(1) })
