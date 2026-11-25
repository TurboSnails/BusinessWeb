#!/usr/bin/env node
// 按 PREREG.md 执行：「择时＋只认金叉」基线与三个成交额候选（V1–V3），15 个中证全收益指数。只读 inputs.json。
// 用法：node docs/research/etf-volume-2026-11-25/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { COST, macdCross, ratioTiming, timingGold, windowStats } from '../../../scripts/research/etf-strategy-oos/strategies.mjs'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const raw = readFileSync(here('./inputs.json'), 'utf8')
const refRaw = readFileSync(here('../../../data-raw/etf-timing-research/long-history.json'), 'utf8')
const input = JSON.parse(raw)
const ref = JSON.parse(refRaw)

const WINDOWS = [
  ['全期 2011-01 起', '2011-01-01', null],
  ['2011—2018（规则未见过）', '2011-01-01', '2018-12-31'],
  ['2019 起（规则设计期）', '2019-01-01', null],
  ['2015 股灾 2015-06-12～2016-01-28', '2015-06-12', '2016-01-28'],
  ['2018 熊市 2018-01-24～2019-01-03', '2018-01-24', '2019-01-03'],
  ['2021—2024 下跌 2021-02-18～2024-02-05', '2021-02-18', '2024-02-05'],
]
const FULL = WINDOWS[0][0]; const OOS = WINDOWS[1][0]
const CRASH = WINDOWS.slice(3).map(w => w[0])
const WARMUP = 120

const toBars = rows => rows.map(([date, close, value]) => ({ date, open: close, high: close, low: close, close, value }))
const tHs = ratioTiming(toBars(input.timing['000300'].rows), toBars(input.timing['000922'].rows))

// 成交额指标（含当日）
function volumeIndicators(bars) {
  const n = bars.length; const v = bars.map(b => (Number.isFinite(b.value) && b.value > 0 ? b.value : null))
  const avg = (i, len, offset = 0) => {
    const from = i - offset - len + 1; const to = i - offset
    if (from < 0) return null
    let s = 0
    for (let k = from; k <= to; k += 1) { if (v[k] == null) return null; s += v[k] }
    return s / len
  }
  const ma5 = new Array(n).fill(null); const ma20 = new Array(n).fill(null); const prev20 = new Array(n).fill(null)
  const pct250 = new Array(n).fill(null); const priceMa20 = new Array(n).fill(null)
  let ps = 0
  for (let i = 0; i < n; i += 1) {
    ma5[i] = avg(i, 5); ma20[i] = avg(i, 20); prev20[i] = avg(i, 20, 1)
    ps += bars[i].close; if (i >= 20) ps -= bars[i - 20].close
    if (i >= 19) priceMa20[i] = ps / 20
    if (i >= 249 && ma20[i] != null) {
      let below = 0; let count = 0
      for (let k = i - 249; k <= i; k += 1) if (ma20[k] != null) { count += 1; if (ma20[k] <= ma20[i]) below += 1 }
      pct250[i] = count >= 200 ? below / count : null
    }
  }
  return { v, ma5, ma20, prev20, pct250, priceMa20 }
}

// 与 strategies.mjs timingGold 相同的状态机（fill = 'close'），加两个钩子：canOpen(i)、extraSell(i)
function timingGoldVar(bars, bull, { canOpen = () => true, extraSell = () => false } = {}) {
  const { gold, dead } = macdCross(bars); const eq = []; const pos = []
  let cash = 1; let units = 0; let pend; let buyIdx = -1; let lastBull; let trades = 0
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i]; const t = bull.get(b.date); if (t !== undefined) lastBull = t; const isBull = lastBull !== false
    const px = b.close
    if (pend === 'buy') { units = cash * (1 - COST) / px; cash = 0; buyIdx = i; trades += 1 } else if (pend === 'sell') { cash = units * px * (1 - COST); units = 0; trades += 1 }
    pend = undefined
    if (i >= WARMUP) {
      if (!units && gold[i] && isBull && canOpen(i)) pend = 'buy'
      else if (units && (dead[i] || extraSell(i))) { if (buyIdx === i) pend = 'sell'; else { cash = units * b.close * (1 - COST); units = 0; trades += 1 } }
    }
    eq.push(units ? units * b.close : cash); pos.push(units ? 1 : 0)
  }
  return { eq, pos, trades }
}

const CANDIDATES = {
  V1: { label: '量能确认买入', hooks: ind => ({ canOpen: i => ind.ma5[i] == null || ind.ma20[i] == null || ind.ma5[i] >= ind.ma20[i] }) },
  V2: {
    label: '放量破位提前卖',
    hooks: (ind, bars) => ({
      extraSell: i => i > 0 && bars[i].close < bars[i - 1].close && ind.v[i] != null && ind.prev20[i] != null
        && ind.v[i] >= 1.5 * ind.prev20[i] && ind.priceMa20[i] != null && bars[i].close < ind.priceMa20[i],
    }),
  },
  V3: { label: '成交过热不开仓', hooks: ind => ({ canOpen: i => ind.pct250[i] == null || ind.pct250[i] < 0.95 }) },
}

const median = xs => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
const results = []
const reproduction = []
let baselineIdentical = true
for (const [code, { name, rows }] of Object.entries(input.targets)) {
  const bars = toBars(rows)
  const ind = volumeIndicators(bars)
  const hold = bars.map(b => b.close)
  const official = timingGold(bars, tHs, { fill: 'close' }).eq
  const base = timingGoldVar(bars, tHs)
  if (base.eq.some((x, i) => Math.abs(x - official[i]) > 1e-9)) baselineIdentical = false
  const curves = { hold: { eq: hold }, base }
  for (const [id, c] of Object.entries(CANDIDATES)) curves[id] = timingGoldVar(bars, tHs, c.hooks(ind, bars))
  const windows = {}
  for (const [label, from, to] of WINDOWS) windows[label] = Object.fromEntries(Object.entries(curves).map(([k, c]) => [k, windowStats(bars, c.eq, from, to)]))
  const i2011 = bars.findIndex(b => b.date >= '2011-01-01')
  const volumeCoverage = ind.v.slice(i2011).filter(x => x != null).length / (bars.length - i2011)
  const exposure = Object.fromEntries(Object.entries(curves).filter(([k]) => k !== 'hold').map(([k, c]) => [k, c.pos.slice(i2011).reduce((s, x) => s + x, 0) / (bars.length - i2011)]))
  const trades = Object.fromEntries(Object.entries(curves).filter(([k]) => k !== 'hold').map(([k, c]) => [k, c.trades]))
  const verdict = Object.fromEntries(['base', ...Object.keys(CANDIDATES)].map(k => {
    const ddPass = CRASH.every(w => windows[w][k] && windows[w].hold && windows[w][k].dd >= 0.7 * windows[w].hold.dd)
    const annualPass = windows[FULL][k].annual >= windows[FULL].hold.annual - 1
    return [k, { ddPass, annualPass, both: ddPass && annualPass }]
  }))
  // 复现：基线 2011—2018 窗口 vs long-history.json 的 hs
  const r = ref.results.find(x => x.code === code)?.windows?.[OOS]?.hs
  const mine = windows[OOS].base
  reproduction.push({ code, annualDiff: r ? mine.annual - r.annual : null, ddDiff: r ? mine.dd - r.dd : null, ok: !!r && Math.abs(mine.annual - r.annual) <= 0.1 && Math.abs(mine.dd - r.dd) <= 0.1 })
  results.push({ code, name, start: bars[0].date, end: bars.at(-1).date, volumeCoverage, exposure, trades, windows, verdict })
}
const okCount = reproduction.filter(r => r.ok).length
// 预注册修订（b2e55703）：复现门槛改为引擎一致；与 11-15 的数据差异照常报告
if (!baselineIdentical) {
  console.error('引擎与 strategies.mjs 不一致，停止')
  process.exit(1)
}

const countBoth = k => results.filter(r => r.verdict[k].both).length
const summary = { base: { both: countBoth('base'), dd: results.filter(r => r.verdict.base.ddPass).length, annual: results.filter(r => r.verdict.base.annualPass).length } }
const decision = {}
for (const id of Object.keys(CANDIDATES)) {
  const both = countBoth(id)
  const fullDiff = median(results.map(r => r.windows[FULL][id].annual - r.windows[FULL].base.annual))
  const oosDiff = median(results.map(r => r.windows[OOS][id].annual - r.windows[OOS].base.annual))
  const ddDiff = median(results.map(r => r.windows[FULL][id].dd - r.windows[FULL].base.dd))
  const delta = both - summary.base.both
  const better = delta >= 2 && fullDiff >= 0 && oosDiff >= 0
  const text = better ? '更好（进入影子跟踪）' : Math.abs(delta) <= 1 ? '无实质差别' : '更差'
  summary[id] = { both, dd: results.filter(r => r.verdict[id].ddPass).length, annual: results.filter(r => r.verdict[id].annualPass).length }
  decision[id] = { label: CANDIDATES[id].label, bothDelta: delta, medianFullAnnualDiff: fullDiff, medianOosAnnualDiff: oosDiff, medianFullDdDiff: ddDiff, text }
}

const out = {
  prereg: 'docs/research/etf-volume-2026-11-25/PREREG.md',
  inputs: { file: 'docs/research/etf-volume-2026-11-25/inputs.json', sha256: createHash('sha256').update(raw).digest('hex'), fetchedAt: input.fetchedAt },
  reproduction: { baselineIdenticalToStrategiesMjs: baselineIdentical, oosWithin01: okCount, detail: reproduction },
  windows: WINDOWS, summary, decision, results,
}
writeFileSync(here('./results.json'), JSON.stringify(out, null, 1) + '\n')

const f = x => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(1))
console.log(`复现：与 strategies.mjs 逐日一致=${baselineIdentical}；与 11-15 结果 2011—2018 窗口 ${okCount}/15 在 0.1 以内（不一致：${reproduction.filter(r => !r.ok).map(r => r.code).join('、')}）`)
console.log(`基线：两项都过 ${summary.base.both}/15（回撤 ${summary.base.dd}，年化 ${summary.base.annual}）`)
for (const [id, d] of Object.entries(decision)) console.log(`${id} ${d.label}：两项都过 ${summary[id].both}（${d.bothDelta >= 0 ? '+' : ''}${d.bothDelta}），全期年化中位差 ${f(d.medianFullAnnualDiff)}，2011—2018 ${f(d.medianOosAnnualDiff)}，全期回撤中位差 ${f(d.medianFullDdDiff)} → ${d.text}`)
for (const r of results) {
  const w = r.windows[FULL]
  console.log(`${r.code} ${r.name.padEnd(10)} 量覆盖 ${(r.volumeCoverage * 100).toFixed(0)}% | 持有 ${f(w.hold.annual)}/${f(w.hold.dd)} 基线 ${f(w.base.annual)}/${f(w.base.dd)} ` +
    Object.keys(CANDIDATES).map(id => `${id} ${f(w[id].annual)}/${f(w[id].dd)}`).join(' ') + ' | 两项 ' + ['base', ...Object.keys(CANDIDATES)].map(k => (r.verdict[k].both ? '✓' : '·')).join(''))
}
