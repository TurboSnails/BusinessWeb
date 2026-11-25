#!/usr/bin/env node
// 月初检查，任一项不满足就退出码 1，让工作流失败并发通知：
// 1. 上月底的正式定档是否已生成。规则与 src/features/combined-strategy/freshness.ts 相同：
//    本月 4 日（北京时间）起，若综合策略的正式定档还停在更早的月份即为过期。
//    留三天余量：本月 1 日是周日时，正式定档要到北京时间 3 日约 6:00 才生成。
// 2. 同样从 4 日起，上个月是否已在前推记录里冻结为正式定档。
// 3. 回测改用席勒快照时，快照股息是否快到沿用上限（提前 3 个月提醒更新快照）。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIVE_SINCE } from './lib/macro-posture/backtest.mjs'
import { DIVIDEND_CARRY_MONTHS, lastShillerDividendMonth, SNAPSHOT_DISCLOSURE } from './macro-posture.mjs'

export const GRACE_DAYS = 3

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

/** 上个月（不早于前推记录起点）在 4 日后仍没有冻结行即为缺失。 */
export function checkLedgerFrozen(liveRows, today) {
  const expected = previousMonth(today.slice(0, 7))
  if (Number(today.slice(8, 10)) <= GRACE_DAYS || expected < LIVE_SINCE.slice(0, 7)) return { missing: false, expected }
  const row = (liveRows ?? []).find(r => r.d === expected)
  return { missing: row?.status !== 'official', expected }
}

const monthsBetween = (from, to) => {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** 回测正在用席勒快照，且快照股息离沿用上限不到 3 个月时提醒。 */
export function checkSnapshotDividend(disclosures, lastDividendMonth, today) {
  const usingSnapshot = (disclosures ?? []).some(line => line.startsWith(SNAPSHOT_DISCLOSURE))
  if (!usingSnapshot || !lastDividendMonth) return { due: false, age: null }
  const age = monthsBetween(lastDividendMonth, previousMonth(today.slice(0, 7)))
  return { due: age >= DIVIDEND_CARRY_MONTHS - 3, age }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
  const file = read('public/data/combined-strategy.json')
  const posture = read('public/data/macro-posture.json')
  const official = file.current?.official?.month ?? null
  const today = beijingToday()
  const { stale, expected } = checkFreshness(official, today)
  if (stale) {
    console.error(`::error::综合策略的正式定档还停在 ${official ?? '（无）'}，应为 ${expected}（今天 ${today}）。请检查 macro-posture.mjs / market-radar.mjs 的运行日志。`)
    process.exitCode = 1
  } else {
    console.log(`定档正常：正式定档 ${official}，今天 ${today}。`)
  }
  const ledger = checkLedgerFrozen(posture.backtest?.live?.rows, today)
  if (ledger.missing) {
    console.error(`::error::前推记录里 ${ledger.expected} 还没有冻结为正式定档（今天 ${today}）。请检查 macro-posture.mjs 的运行日志：实时版本数据或标普日收盘是否完整。`)
    process.exitCode = 1
  }
  const lastDividend = lastShillerDividendMonth(readFileSync(resolve(root, 'data-raw/sp500-backtest/shiller.csv'), 'utf8'))
  const dividend = checkSnapshotDividend(posture.backtest?.disclosures, lastDividend, today)
  if (dividend.due) {
    console.error(`::error::回测正在用席勒快照，快照股息停在 ${lastDividend}，已沿用 ${dividend.age} 个月（上限 ${DIVIDEND_CARRY_MONTHS} 个月）。` +
      '请用 scripts/sp500-backtest-fetch.py 更新 data-raw/sp500-backtest/shiller.csv，或恢复 Multpl 访问。')
    process.exitCode = 1
  }
}
