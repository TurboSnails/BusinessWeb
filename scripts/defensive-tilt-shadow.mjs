#!/usr/bin/env node
// 更新防守倾斜 ETF 影子运行 public/data/defensive-tilt-shadow.json。
// 先从 Yahoo 抓 SPY、XLP、XLV、XLU、USMV、SPLV 的日线复权收盘（含分红）并增量写入 data-raw/defensive-tilt-shadow/etf-daily.json，
// 抓取失败就沿用缓存并 warn；研究口径篮子读本地 data-raw/market-radar/industry-returns.json。
// 退出码：0 正常；1 其他错误（工作流里只发 warning）；2 已冻结的行被改写（工作流里要失败）。
// 用法：node scripts/defensive-tilt-shadow.mjs
import { fileURLToPath } from 'node:url'
import { readJson, writeJsonIfChanged } from './lib/json-io.mjs'
import { SYMBOLS, SHADOW_SINCE, buildShadow, frozenViolations, mergeAdjusted } from './lib/defensive-tilt-shadow.mjs'
import { monthAfter } from './lib/late-cycle-shadow.mjs'
import { parseYahooAdjusted } from './us-market-breadth.mjs'

const root = p => fileURLToPath(new URL(`../${p}`, import.meta.url))
const OUT = root('public/data/defensive-tilt-shadow.json')
const CACHE = root('data-raw/defensive-tilt-shadow/etf-daily.json')
// 抓取窗口从影子起点前一个月月初开始（算首月收益要用上月月末收盘）；复权价会随分红整体重算，所以每次整段重抓再合并
const FETCH_FROM = `${monthAfter(SHADOW_SINCE, -2)}-01`

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

async function refreshPrices(cache, now) {
  const symbols = { ...(cache.symbols ?? {}) }
  const failed = []
  for (const symbol of SYMBOLS) {
    try {
      const incoming = parseYahooAdjusted(await chart(symbol, now), symbol, now)
      if (!incoming.length) throw new Error('无复权收盘')
      const merged = mergeAdjusted(symbols[symbol]?.rows ?? [], incoming)
      if (!merged) throw new Error('新旧数据无重叠，无法对齐复权口径')
      symbols[symbol] = { fetchedAt: now.toISOString(), rows: merged.map(([d, v]) => [d, Math.round(v * 1e4) / 1e4]) }
    } catch (error) {
      failed.push(symbol)
      console.warn(`::warning::${symbol} 行情抓取失败（${error.message}），沿用缓存（${symbols[symbol]?.rows?.at(-1)?.[0] ?? '无'}）`)
    }
  }
  return { cache: { source: 'Yahoo Finance chart API，adjclose（含分红复权）', from: FETCH_FROM, symbols }, failed }
}

async function main() {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const { cache } = await refreshPrices(readJson(CACHE, {}), now)
  writeJsonIfChanged(CACHE, cache)

  const prices = Object.fromEntries(SYMBOLS.map(s => [s, cache.symbols[s]?.rows ?? []]))
  const industry = new Map(readJson(root('data-raw/market-radar/industry-returns.json'), []).map(([d, r]) => [d.slice(0, 7), r]))
  const previous = readJson(OUT, null)
  const next = buildShadow({ previous, prices, industry, today, generatedAt: now.toISOString() })
  const broken = frozenViolations(previous, next)
  if (broken.length) {
    console.error(`已冻结的防守倾斜影子行被改写：${broken.join('、')}，停止`)
    process.exit(2)
  }
  writeJsonIfChanged(OUT, next, { pretty: true })
  const c = next.current
  const pct = v => (v == null ? '—' : `${(v * 100).toFixed(2)}%`)
  console.log(`防守倾斜影子运行：冻结 ${next.rows.length} 个月；`
    + (c ? `当月 ${c.month} 至 ${c.period?.[1] ?? '—'} 预估 SPY ${pct(c.etf.SPY)}、S1 ${pct(c.S1)}、S2 ${pct(c.S2)}（缺 ${c.missing.join('、') || '无'}）` : '影子期已结束'))
}

await main().catch(error => { console.error(error.message); process.exit(1) })
