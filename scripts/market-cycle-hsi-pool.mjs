// Hang Seng Index 52-week turnover baseline rebuilt from the current constituent pool.
// The official daily report archive only exposes ~1–2 months, so the index's own 52-week
// history cannot be downloaded. HSI "Index Turnover" is the sum of constituent turnover;
// summing Tencent per-stock daily amounts reproduced the official figure to the HKD million
// on every 2026-09-07..10-16 session (after the last membership change). The completed week
// must reconcile with the official reports on every session or nothing is published.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeWeeklyTurnoverRatio } from './market-cycle-liquidity.mjs'

const UNIVERSES = fileURLToPath(new URL('../public/data/market-cycle-universes.json', import.meta.url))
export const POOL_TOLERANCE = 0.005
const MIN_TURNOVER_SHARE = 0.95
const dateOK = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
const add = (date, n) => new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10)
const symbol = code => `hk${String(code).padStart(5, '0')}`

export function poolBarsUrl(code, today) {
  return `https://web.ifzq.gtimg.cn/appstock/app/hkfqkline/get?param=${symbol(code)},day,${add(today, -400)},${today},320,qfq`
}

/** Tencent hkfqkline: [date, o, c, h, l, volume, info, turnoverRate, amount(10k HKD), ...]; some secondary
 * listings append two more fields, so the amount is read by position. Amount is unaffected by price adjustment. */
export function parsePoolBars(body, code, today) {
  const key = symbol(code), data = body?.data?.[key]
  if (body?.code !== 0 || !data) throw new Error(`${key}响应身份无效`)
  const rows = data.qfqday ?? data.day
  if (!Array.isArray(rows)) throw new Error(`${key}缺少日线`)
  const out = []
  let prior = ''
  for (const row of rows) {
    if (!Array.isArray(row) || !dateOK(row[0]) || row[0] <= prior || row[0] > today) throw new Error(`${key}日线日期乱序/重复/未来`)
    const raw = row[8]
    if (typeof raw !== 'string' || !/^\d+(?:\.\d+)?$/.test(raw)) throw new Error(`${key}成交额缺失`)
    prior = row[0]
    out.push([row[0], Number(raw) * 1e4])
  }
  return out
}

export function loadHsiUniverse(body, today) {
  const u = body?.universes?.hsi
  if (body?.schemaVersion !== 1 || u?.status !== 'ok' || !dateOK(u.date) || u.date > today || !Array.isArray(u.codes)) throw new Error('恒指成分名单无效')
  if ((Date.parse(today) - Date.parse(u.date)) / 864e5 > 14) throw new Error(`恒指成分名单${u.date}已超过14天`)
  if (u.codes.length < 50 || u.codes.length > 120 || new Set(u.codes).size !== u.codes.length) throw new Error('恒指成分名单数量或代码异常')
  return { date: u.date, source: u.source, codes: u.codes.map(String) }
}

/**
 * officialByDate: Map(date -> HKD) from the official reports; calendar: HSI trading days.
 * Returns the ratio built from constituents listed for the whole baseline window, after the
 * completed week reconciles with the official index turnover within POOL_TOLERANCE.
 */
export function computePoolTurnoverRatio(barsByCode, calendar, officialByDate, today) {
  const sums = new Map()
  for (const bars of barsByCode.values()) for (const [date, amount] of bars) sums.set(date, (sums.get(date) ?? 0) + amount)
  // Locate the completed week the same way as the official path, using a full-pool series.
  const probe = computeWeeklyTurnoverRatio(calendar.map(date => ({ date, amount: 1 })), calendar, today)
  const week = calendar.filter(d => d >= probe.weekStart && d <= probe.weekEnd)
  const checks = week.map(date => {
    const official = officialByDate.get(date)
    if (!official) throw new Error(`完整周${date}缺少官方日报，无法核对成分池`)
    const pool = sums.get(date) ?? 0
    return { date, official, pool, gap: pool / official - 1 }
  })
  const worst = checks.reduce((a, b) => Math.abs(b.gap) > Math.abs(a.gap) ? b : a)
  if (Math.abs(worst.gap) > POOL_TOLERANCE) throw new Error(`成分池成交额与官方Index Turnover不符：${worst.date} 偏差${(worst.gap * 100).toFixed(2)}%，可能名单已变更，不发布`)
  const matchedArchive = [...officialByDate].filter(([date, official]) => sums.has(date) && Math.abs(sums.get(date) / official - 1) <= POOL_TOLERANCE).length
  // Only stocks traded before the baseline start contribute; a later listing would inflate the ratio.
  const seasoned = [...barsByCode.values()].filter(bars => bars.length && bars[0][0] <= probe.baselineStart)
  const weekTotal = list => list.reduce((s, bars) => s + bars.filter(([d]) => d >= probe.weekStart && d <= probe.weekEnd).reduce((t, [, a]) => t + a, 0), 0)
  const share = weekTotal(seasoned) / weekTotal([...barsByCode.values()])
  if (!(share >= MIN_TURNOVER_SHARE)) throw new Error(`满一年交易历史的成分仅占本周成交额${(share * 100).toFixed(1)}%，低于95%`)
  const seasonedSums = new Map()
  for (const bars of seasoned) for (const [date, amount] of bars) seasonedSums.set(date, (seasonedSums.get(date) ?? 0) + amount)
  const rows = calendar.filter(d => d >= probe.baselineStart && d <= probe.weekEnd).map(date => ({ date, amount: seasonedSums.get(date) ?? 0 }))
  const ratio = computeWeeklyTurnoverRatio(rows, calendar, today)
  return { ...ratio, checks, matchedArchive, archiveDays: officialByDate.size, seasoned: seasoned.length, total: barsByCode.size, share }
}

export async function collectHsiPoolRatio(ctx, { calendar, official, cacheDir, universeFile = UNIVERSES }) {
  const today = ctx.now.slice(0, 10)
  const universe = loadHsiUniverse(JSON.parse(await readFile(universeFile, 'utf8')), today)
  const dir = join(cacheDir, 'pool')
  await mkdir(dir, { recursive: true })
  const lastSession = calendar.filter(d => d <= today).at(-1)
  const bars = new Map(), failed = []
  let next = 0
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < universe.codes.length) {
      const code = universe.codes[next++], path = join(dir, `${code}.json`)
      try {
        const cached = JSON.parse(await readFile(path, 'utf8'))
        if (Array.isArray(cached) && cached.at(-1)?.[0] === lastSession) { bars.set(code, cached); continue }
      } catch { /* not cached yet */ }
      try {
        const parsed = parsePoolBars(await ctx.get(poolBarsUrl(code, today)), code, today)
        await writeFile(`${path}.tmp`, JSON.stringify(parsed)); await rename(`${path}.tmp`, path)
        bars.set(code, parsed)
      } catch (error) { failed.push(`${code}: ${error.message}`) }
    }
  }))
  if (failed.length) throw new Error(`成分日线失败${failed.length}只，不能拼出全成分成交额：${failed.slice(0, 3).join('；')}`)
  return { ...computePoolTurnoverRatio(bars, calendar, official, today), universe }
}
