#!/usr/bin/env node
// 月初检查：上月底的正式定档是否已生成。规则与 src/features/combined-strategy/freshness.ts 相同：
// 本月 3 日（北京时间）起，若综合策略的正式定档还停在更早的月份，退出码 1，让工作流失败并发通知。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GRACE_DAYS = 2

export function previousMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export function beijingToday(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

export function checkFreshness(officialMonth, today) {
  const expected = previousMonth(today.slice(0, 7))
  const day = Number(today.slice(8, 10))
  if (day <= GRACE_DAYS) return { stale: false, expected }
  return { stale: !officialMonth || officialMonth < expected, expected }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const file = JSON.parse(readFileSync(resolve(root, 'public/data/combined-strategy.json'), 'utf8'))
  const official = file.current?.official?.month ?? null
  const today = beijingToday()
  const { stale, expected } = checkFreshness(official, today)
  if (stale) {
    console.error(`::error::综合策略的正式定档还停在 ${official ?? '（无）'}，应为 ${expected}（今天 ${today}）。请检查 macro-posture.mjs / market-radar.mjs 的运行日志。`)
    process.exitCode = 1
  } else {
    console.log(`定档正常：正式定档 ${official}，今天 ${today}。`)
  }
}
