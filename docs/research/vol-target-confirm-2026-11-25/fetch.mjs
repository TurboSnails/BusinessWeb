#!/usr/bin/env node
// 取海外 9 个指数的 Yahoo 日收盘，写到 inputs-intl.json（之后离线复现）。行：[日期, 收盘]。
// 用法：node docs/research/vol-target-confirm-2026-11-25/fetch.mjs
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SYMBOLS = {
  n225: ['^N225', '日经 225'], ixic: ['^IXIC', '纳斯达克综合'], tsx: ['^GSPTSE', '多伦多综合'], ftse: ['^FTSE', '富时 100'],
  hsi: ['^HSI', '恒生'], dax: ['^GDAXI', '德国 DAX'], rut: ['^RUT', '罗素 2000'], sse: ['000001.SS', '上证综指'], asx: ['^AXJO', '澳大利亚 200'],
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = { source: 'Yahoo Finance v8 chart，interval=1d，收盘价（close）', fetchedAt: new Date().toISOString(), indexes: {} }
const period2 = Math.floor(Date.now() / 1000)
for (const [key, [symbol, name]] of Object.entries(SYMBOLS)) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=${period2}&interval=1d`
  let j
  for (let attempt = 0; attempt < 4; attempt++) {
    try { j = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) })).json(); break } catch (e) { if (attempt === 3) throw e; await sleep(15000) }
  }
  const r = j.chart.result[0]
  const closes = r.indicators.quote[0].close
  const rows = new Map()
  r.timestamp.forEach((t, i) => {
    const c = closes[i]
    if (!Number.isFinite(c) || c <= 0) return
    // 用交易所时区换算日期
    const d = new Date((t + (r.meta.gmtoffset ?? 0)) * 1000).toISOString().slice(0, 10)
    rows.set(d, Math.round(c * 100) / 100)
  })
  out.indexes[key] = { symbol, name, rows: [...rows].sort(([a], [b]) => a.localeCompare(b)) }
  console.log(key, symbol, rows.size, out.indexes[key].rows[0][0], out.indexes[key].rows.at(-1)[0])
  await sleep(2500)
}
writeFileSync(fileURLToPath(new URL('./inputs-intl.json', import.meta.url)), JSON.stringify(out) + '\n')
