#!/usr/bin/env node
// 更新牛市后期预警影子读数 public/data/late-cycle-shadow.json（只读本地缓存，不联网）。
// 已冻结的月份不改动；若发现已有行被改写则失败退出。用法：node scripts/late-cycle-shadow.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildShadow, capeByMonth, frozenViolations, lastByMonth, monthlyMean } from './lib/late-cycle-shadow.mjs'

const root = p => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p, fallback) => (existsSync(root(p)) ? JSON.parse(readFileSync(root(p), 'utf8')) : fallback)
const OUT = root('public/data/late-cycle-shadow.json')

const combined = read('public/data/combined-strategy.json', { timeline: [] })
const radar = read('public/data/market-radar.json', { indicators: [] })
const macro = read('public/data/macro-posture.json', {})
const today = new Date().toISOString().slice(0, 10)
const spxRows = read('data-raw/macro-posture-daily/spx-daily.json', { rows: [] }).rows
const series = {
  baa: new Map((radar.indicators.find(x => x.id === 'baaChange')?.history ?? []).map(([d, v]) => [d.slice(0, 7), v])),
  vix: monthlyMean(read('data-raw/market-radar/VIX.json', [])),
  close: lastByMonth(spxRows),
  avgPrice: monthlyMean(spxRows),
  highs: new Map(read('data-raw/market-radar/industry-trend.json', []).map(([d, , h]) => [d.slice(0, 7), h])),
  industry: new Map(read('data-raw/market-radar/industry-returns.json', []).map(([d, r]) => [d.slice(0, 7), r])),
  // CAPE：market-radar 的 shillerCape（Multpl 月表，样本自 1900-01）；分位只用当月及以前
  cape: capeByMonth(radar.indicators.find(x => x.id === 'cape')?.history ?? []),
}
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
const estimateTier = macro.backtest?.live?.rows?.find(r => r.d === today.slice(0, 7))?.final ?? null
const next = buildShadow({ previous, timeline: combined.timeline, estimateTier, series, today, generatedAt: new Date().toISOString() })
const broken = frozenViolations(previous, next)
if (broken.length) {
  console.error(`已冻结的预警读数被改写：${broken.join('、')}，停止`)
  process.exit(1)
}
writeFileSync(OUT, JSON.stringify(next, null, 2) + '\n')
const c = next.current
const p = c.panicValueTrend
console.log(`牛市后期预警影子读数：冻结 ${next.rows.length} 个月；当月 ${c.month} 预估 裂缝 ${c.counts.n}（缺 ${c.missing.join('、') || '无'}），W1 ${c.flags.W1}；破位封顶 ${c.trendCap.below}（触发线 ${c.trendCap.triggerPrice}）；恐慌命中 ${p?.panic?.hit} CAPE分位 ${p?.valuation?.percentile} 趋势破位 ${p?.trend?.below}`)
