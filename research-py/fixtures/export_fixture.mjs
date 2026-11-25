#!/usr/bin/env node
// 用 JS 研究引擎（与 docs/research/late-cycle-2026-11-25/run.mjs 的 periods + simulate 同一套代码）导出
// 现行 v2.2 的 E1 按日净值，作为 Python 第二套引擎的对照文件。
// 输出：e1-baseline-periods.csv（每期参数）、e1-baseline-daily.csv（逐日仓位、收益、净值）、e1-baseline-meta.json（汇总与输入校验值）。
// 用法：node research-py/fixtures/export_fixture.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const FILES = {
  tiers: '../../docs/research/macro-significance-2026-11-25/inputs.json',
  daily: '../../data-raw/macro-posture-daily/spx-daily.json',
  lateCycle: '../../docs/research/late-cycle-2026-11-25/results.json',
}
const raw = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(here(p), 'utf8')]))
const input = JSON.parse(raw.tiers)
const daily = JSON.parse(raw.daily).rows
const ref = JSON.parse(raw.lateCycle).B.full.base

const FIRST = '1973-01'; const LAST = '2026-08'; const EXEC_DAY = 3; const COST = 0.001
const EQUITY = { offense: 1, 'lean-offense': 0.85, neutral: 0.7, 'lean-defense': 0.5, defense: 0.3 }
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sampleVar = xs => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) }
const sharpeOf = ex => Math.sqrt(12) * mean(ex) / Math.sqrt(sampleVar(ex))
const monthAfter = (d, k) => { const [y, m] = d.split('-').map(Number); const t = y * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }

const returns = new Map(input.returns.map(([d, spx, cash]) => [d, { spx, cash }]))
const price = new Map(input.price)
const dividend = m => { const r = returns.get(m); const p = price.get(m); const p0 = price.get(monthAfter(m, -1)); return r && p && p0 ? r.spx - (p / p0 - 1) : null }
const cashOf = m => returns.get(m)?.cash ?? null
const dates = daily.map(([d]) => d); const closes = daily.map(([, c]) => c)
const byMonth = new Map()
for (const d of dates) { const m = d.slice(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(d) }
const dayIndex = new Map(dates.map((d, i) => [d, i]))
const execDay = m => byMonth.get(m)?.[EXEC_DAY - 1]

const periods = input.tiers.filter(([d]) => d >= FIRST && d <= LAST).map(([d, tier]) => {
  const m1 = monthAfter(d, 1); const m2 = monthAfter(d, 2)
  const start = execDay(m1); const end = execDay(m2)
  const d1 = dividend(m1); const d2 = dividend(m2); const c1 = cashOf(m1); const c2 = cashOf(m2)
  const n1 = byMonth.get(m1).filter(x => x > start).length; const n2 = byMonth.get(m2).filter(x => x <= end).length
  const N1 = byMonth.get(m1).length; const N2 = byMonth.get(m2).length
  const div = d1 * n1 / N1 + d2 * n2 / N2; const cash = c1 * n1 / N1 + c2 * n2 / N2
  const i0 = dayIndex.get(start); const i1 = dayIndex.get(end)
  return { d, tier, start, end, n: i1 - i0, div, cash, weight: EQUITY[tier], i0, i1 }
})

// 与 late-cycle simulate 相同：第 j 日收益用当期仓位；仓位变化的那天扣成本；首次建仓不计费
const dailyRows = []; const gross = []; const net = []; const cashes = []
let w = 1; let prev = null
for (const p of periods) {
  let g = 1; let gn = 1
  for (let j = p.i0 + 1; j <= p.i1; j += 1) {
    const stock = closes[j] / closes[j - 1] - 1 + p.div / p.n
    const r = p.weight * stock + (1 - p.weight) * p.cash / p.n
    const trade = prev == null ? 0 : Math.abs(p.weight - prev)
    prev = p.weight
    g *= 1 + r; gn *= (1 + r) * (1 - COST * trade); w *= 1 + r
    dailyRows.push([dates[j], p.d, p.weight, stock, r, w])
  }
  gross.push(g - 1); net.push(gn - 1); cashes.push(p.cash)
}
let peak = 1; let maxDd = 0
for (const [, , , , , v] of dailyRows) { peak = Math.max(peak, v); maxDd = Math.min(maxDd, v / peak - 1) }
let m = 1; for (const r of gross) m *= 1 + r
const summary = {
  periods: periods.length, navStart: periods[0].start, navEnd: periods.at(-1).end,
  sharpe: sharpeOf(gross.map((r, i) => r - cashes[i])), sharpeNet: sharpeOf(net.map((r, i) => r - cashes[i])),
  cagr: m ** (12 / gross.length) - 1, dailyMaxDd: maxDd,
}
// 自检：与 late-cycle 已发布的结果一致
for (const k of ['sharpe', 'sharpeNet', 'cagr', 'dailyMaxDd']) if (Math.abs(summary[k] - ref[k]) > 1e-12) throw new Error(`${k} 与 late-cycle 不一致：${summary[k]} vs ${ref[k]}`)

const csv = (head, rows) => [head.join(','), ...rows.map(r => r.map(x => (typeof x === 'number' ? x.toPrecision(17) : x)).join(','))].join('\n') + '\n'
writeFileSync(here('./e1-baseline-periods.csv'), csv(['signal', 'tier', 'start', 'end', 'n', 'div', 'cash', 'weight'], periods.map(p => [p.d, p.tier, p.start, p.end, p.n, p.div, p.cash, p.weight])))
writeFileSync(here('./e1-baseline-daily.csv'), csv(['date', 'signal', 'weight', 'stock', 'ret', 'nav'], dailyRows))
// 日线缓存每天追加新收盘，只对回测用到的部分（2026-10-31 以前）算内容校验值：每行「日期,收盘」，收盘用最短往返表示
const DAILY_UNTIL = '2026-10-31'
const dailySlice = daily.filter(([d]) => d <= DAILY_UNTIL).map(([d, c]) => `${d},${String(c)}`).join('\n') + '\n'
writeFileSync(here('./e1-baseline-meta.json'), JSON.stringify({
  note: '由 export_fixture.mjs 用 JS 研究引擎导出；Python 引擎须独立复现，不得读取 daily/periods CSV 来计算。',
  inputs: {
    tiers: { file: FILES.tiers.replace('../../', ''), sha256: createHash('sha256').update(raw.tiers).digest('hex') },
    daily: { file: FILES.daily.replace('../../', ''), until: DAILY_UNTIL, contentSha256: createHash('sha256').update(dailySlice).digest('hex') },
  },
  summary,
}, null, 2) + '\n')
console.log('导出完成', summary)
