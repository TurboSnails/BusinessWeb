#!/usr/bin/env node
// 按 PREREG.md 执行显著性检验。只读 inputs.json，结果写到 results.json，可离线复现。
// 用法：node docs/research/macro-significance-2026-11-25/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const IN = fileURLToPath(new URL('./inputs.json', import.meta.url))
const OUT = fileURLToPath(new URL('./results.json', import.meta.url))
const rawInput = readFileSync(IN, 'utf8')
const input = JSON.parse(rawInput)
const inputSha256 = createHash('sha256').update(rawInput).digest('hex')

const SEED = 20261125
const DRAWS = 10000
const PRIMARY_BLOCK = 12
const BLOCKS = [6, 12, 24, 36]
const NW_LAG = 12
const LAG = 2 // 月末信号用于隔一个月后的收益
const SPLIT = '2000-01'
const EQUITY = { offense: 1, 'lean-offense': 0.85, neutral: 0.7, 'lean-defense': 0.5, defense: 0.3 }

// ---------- 基础工具 ----------
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sampleVar = xs => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) }
const monthAfter = (d, k) => {
  const [y, m] = d.split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function blockIndices(n, block, rng) {
  const idx = new Array(n)
  let i = 0
  while (i < n) {
    const start = Math.floor(rng() * n)
    for (let k = 0; k < block && i < n; k += 1) { idx[i] = (start + k) % n; i += 1 }
  }
  return idx
}
const quantile = (sorted, q) => {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}
// 标准正态分布函数（Abramowitz–Stegun 7.1.26，误差 < 1.5e-7）
function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

// ---------- 业绩指标（与 scripts/lib/macro-posture/backtest.mjs 的 performance 同口径） ----------
function perf(port, cash) {
  const n = port.length
  const wealth = port.reduce((w, r) => w * (1 + r), 1)
  let w = 1
  let peak = 1
  let maxDd = 0
  for (const r of port) { w *= 1 + r; peak = Math.max(peak, w); maxDd = Math.min(maxDd, w / peak - 1) }
  const ex = port.map((r, i) => r - cash[i])
  const sd = Math.sqrt(sampleVar(ex))
  return {
    cagr: wealth ** (12 / n) - 1,
    vol: Math.sqrt(12 * sampleVar(port)),
    maxDd,
    sharpe: sd ? Math.sqrt(12) * mean(ex) / sd : 0,
  }
}
const sharpeOf = ex => Math.sqrt(12) * mean(ex) / Math.sqrt(sampleVar(ex))

// ---------- 数据对齐 ----------
const returns = new Map(input.returns.map(([d, spx, cash]) => [d, { spx, cash }]))
const price = new Map(input.price)
const priceMonths = input.price.map(([d]) => d)
function below(d) {
  const i = priceMonths.indexOf(d)
  if (i < 9) return null
  const window = priceMonths.slice(i - 9, i + 1)
  if (window.some((m, k) => k > 0 && m !== monthAfter(window[k - 1], 1))) return null
  const sma = mean(window.map(m => price.get(m)))
  return price.get(d) < sma
}
const rows = []
for (const [signal, tier] of input.tiers) {
  const d = monthAfter(signal, LAG)
  const r = returns.get(d)
  const b = below(signal)
  const w = EQUITY[tier]
  if (r?.cash == null || b == null || w == null) continue
  rows.push({ signal, d, spx: r.spx, cash: r.cash, w, tier, trendW: b ? 0.5 : 1 })
}
const STRATS = {
  strategy: row => row.w,
  static70: () => 0.7,
  buyhold: () => 1,
  trend: row => row.trendW,
}
const portOf = (id, rs = rows) => rs.map(row => STRATS[id](row) * row.spx + (1 - STRATS[id](row)) * row.cash)
const cash = rows.map(row => row.cash)
const series = Object.fromEntries(Object.keys(STRATS).map(id => [id, portOf(id)]))
const excess = Object.fromEntries(Object.keys(STRATS).map(id => [id, series[id].map((r, i) => r - cash[i])]))

// ---------- 复现门槛 ----------
const pageId = { strategy: 'full', static70: 'static70', buyhold: 'buyhold', trend: 'trend' }
const reproduction = Object.fromEntries(Object.keys(STRATS).map(id => {
  const mine = perf(series[id], cash)
  const page = input.pageVariants.find(v => v.id === pageId[id])
  const diff = { cagr: mine.cagr - page.cagr, maxDd: mine.maxDd - page.maxDd, sharpe: mine.sharpe - page.sharpe }
  const ok = Object.values(diff).every(x => Math.abs(x) < 0.0005)
  return [id, { mine, page: { cagr: page.cagr, maxDd: page.maxDd, sharpe: page.sharpe }, diff, ok }]
}))
const reproduced = Object.values(reproduction).every(r => r.ok)

// ---------- HAC delta 方法（Ledoit & Wolf 2008，第 3.1 节；Newey-West，滞后 12） ----------
// 注：这里按 LW 的写法用总体方差（除以 T）；点估计的夏普用样本方差（除以 T−1），两者差约 0.08%，可忽略。
function hacSharpeDiff(x, y, lag = NW_LAG) {
  const T = x.length
  const m1 = mean(x); const m2 = mean(y)
  const g1 = mean(x.map(v => v * v)); const g2 = mean(y.map(v => v * v))
  const v = x.map((_, t) => [x[t] - m1, y[t] - m2, x[t] * x[t] - g1, y[t] * y[t] - g2])
  const psi = Array.from({ length: 4 }, () => new Array(4).fill(0))
  for (let l = 0; l <= lag; l += 1) {
    const w = l === 0 ? 1 : 1 - l / (lag + 1)
    for (let t = l; t < T; t += 1) {
      for (let a = 0; a < 4; a += 1) for (let b = 0; b < 4; b += 1) {
        const c = v[t][a] * v[t - l][b] / T
        psi[a][b] += l === 0 ? c : w * (c + v[t - l][a] * v[t][b] / T)
      }
    }
  }
  const s1 = g1 - m1 * m1; const s2 = g2 - m2 * m2
  const grad = [g1 / s1 ** 1.5, -g2 / s2 ** 1.5, -m1 / (2 * s1 ** 1.5), m2 / (2 * s2 ** 1.5)]
  let varF = 0
  for (let a = 0; a < 4; a += 1) for (let b = 0; b < 4; b += 1) varF += grad[a] * psi[a][b] * grad[b]
  const diffMonthly = m1 / Math.sqrt(s1) - m2 / Math.sqrt(s2)
  const se = Math.sqrt(varF / T)
  const z = diffMonthly / se
  return { diff: diffMonthly * Math.sqrt(12), se: se * Math.sqrt(12), z, p: 2 * (1 - normCdf(Math.abs(z))) }
}

// ---------- 配对循环分块自助法 ----------
function bootSharpeDiff(x, y, block, seed = SEED) {
  const rng = mulberry32(seed)
  const n = x.length
  const draws = new Array(DRAWS)
  for (let b = 0; b < DRAWS; b += 1) {
    const idx = blockIndices(n, block, rng)
    draws[b] = sharpeOf(idx.map(i => x[i])) - sharpeOf(idx.map(i => y[i]))
  }
  const sorted = draws.slice().sort((a, b) => a - b)
  const le = draws.filter(d => d <= 0).length / DRAWS
  const ge = draws.filter(d => d >= 0).length / DRAWS
  return { block, low: quantile(sorted, 0.025), high: quantile(sorted, 0.975), p: Math.min(1, 2 * Math.min(le, ge)), excludesZero: quantile(sorted, 0.025) > 0 || quantile(sorted, 0.975) < 0 }
}

function holm(ps) {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0])
  const out = new Array(ps.length)
  let running = 0
  order.forEach(([p, i], k) => { running = Math.max(running, Math.min(1, p * (ps.length - k))); out[i] = running })
  return out
}

// ---------- 主检验与次要检验 ----------
const BENCHES = ['static70', 'buyhold', 'trend']
const comparisons = Object.fromEntries(BENCHES.map(bench => {
  const point = sharpeOf(excess.strategy) - sharpeOf(excess[bench])
  return [bench, {
    point,
    hac: hacSharpeDiff(excess.strategy, excess[bench]),
    boot: Object.fromEntries(BLOCKS.map(b => [b, bootSharpeDiff(excess.strategy, excess[bench], b)])),
  }]
}))
const holmHac = holm(BENCHES.map(b => comparisons[b].hac.p))
const holmBoot = holm(BENCHES.map(b => comparisons[b].boot[PRIMARY_BLOCK].p))
BENCHES.forEach((b, i) => { comparisons[b].holm = { hac: holmHac[i], boot: holmBoot[i] } })

// 两段
const periods = Object.fromEntries([['1973-1999', r => r.d < SPLIT], ['2000-2026', r => r.d >= SPLIT]].map(([name, keep]) => {
  const idx = rows.map((r, i) => (keep(r) ? i : -1)).filter(i => i >= 0)
  const pick = (arr) => idx.map(i => arr[i])
  const out = { months: idx.length, range: `${rows[idx[0]].d} 至 ${rows[idx.at(-1)].d}` }
  out.perf = Object.fromEntries(Object.keys(STRATS).map(id => [id, perf(pick(series[id]), pick(cash))]))
  out.vsStatic70 = { point: sharpeOf(pick(excess.strategy)) - sharpeOf(pick(excess.static70)), hac: hacSharpeDiff(pick(excess.strategy), pick(excess.static70)), boot: bootSharpeDiff(pick(excess.strategy), pick(excess.static70), PRIMARY_BLOCK) }
  return [name, out]
}))

// 最大回撤：分块自助法下策略回撤浅于恒定七成的比例
function bootMaxDd(block) {
  const rng = mulberry32(SEED)
  const n = rows.length
  let shallower = 0
  const diffs = new Array(DRAWS)
  for (let b = 0; b < DRAWS; b += 1) {
    const idx = blockIndices(n, block, rng)
    const a = perf(idx.map(i => series.strategy[i]), idx.map(i => cash[i])).maxDd
    const c = perf(idx.map(i => series.static70[i]), idx.map(i => cash[i])).maxDd
    diffs[b] = a - c
    if (a > c) shallower += 1
  }
  const sorted = diffs.sort((x, y) => x - y)
  return { block, shareShallower: shallower / DRAWS, diffLow: quantile(sorted, 0.025), diffMedian: quantile(sorted, 0.5), diffHigh: quantile(sorted, 0.975) }
}
const maxDd = [12, 24].map(bootMaxDd)

// 随机择时对照：打乱「同档位连续段」的先后顺序，且相邻两段档位必须不同，
// 这样换档次数和各档时间占比都与策略相同（PREREG 第 5 条）。
// 抽样：从原顺序出发做随机交换，只接受交换后仍满足「相邻不同档」的提议；提议对称、目标为均匀分布，
// 所以链的平稳分布就是所有合法排列上的均匀分布。先预热，再每隔 THIN 步取一个样本。
// 初版实现漏了「相邻不同档」这一约束（同档相邻会合并，换档次数平均只有约 161 次），已按预注册的要求改正，见 README。
const BURN_IN = 50000
const THIN = 500
function placebo() {
  const runs = []
  for (const row of rows) {
    const last = runs.at(-1)
    if (last && last.w === row.w) last.len += 1
    else runs.push({ w: row.w, len: 1 })
  }
  const rng = mulberry32(SEED)
  const actual = perf(series.strategy, cash)
  const switchesOf = ws => ws.filter((w, i) => i > 0 && w !== ws[i - 1]).length
  const actualSwitches = switchesOf(rows.map(r => r.w))
  const order = runs.slice()
  const okAt = (i) => i < 0 || i >= order.length
    || ((i === 0 || order[i - 1].w !== order[i].w) && (i === order.length - 1 || order[i].w !== order[i + 1].w))
  const step = () => {
    const i = Math.floor(rng() * order.length)
    const j = Math.floor(rng() * order.length)
    if (i === j || order[i].w === order[j].w) return
    ;[order[i], order[j]] = [order[j], order[i]]
    if (!(okAt(i) && okAt(j) && okAt(i - 1) && okAt(i + 1) && okAt(j - 1) && okAt(j + 1))) {
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  }
  for (let k = 0; k < BURN_IN; k += 1) step()
  const res = { sharpe: [], cagr: [], maxDd: [] }
  let switchMismatch = 0
  for (let b = 0; b < DRAWS; b += 1) {
    for (let k = 0; k < THIN; k += 1) step()
    const weights = order.flatMap(run => new Array(run.len).fill(run.w))
    if (switchesOf(weights) !== actualSwitches) switchMismatch += 1
    const port = rows.map((row, i) => weights[i] * row.spx + (1 - weights[i]) * row.cash)
    const p = perf(port, cash)
    res.sharpe.push(p.sharpe); res.cagr.push(p.cagr); res.maxDd.push(p.maxDd)
  }
  const rank = (arr, x) => arr.filter(v => v < x).length / arr.length
  return {
    runs: runs.length, actualSwitches, switchMismatch,
    sharpe: { actual: actual.sharpe, percentile: rank(res.sharpe, actual.sharpe), shareAtLeast: res.sharpe.filter(v => v >= actual.sharpe).length / DRAWS, median: quantile(res.sharpe.slice().sort((a, b) => a - b), 0.5) },
    cagr: { actual: actual.cagr, percentile: rank(res.cagr, actual.cagr), shareAtLeast: res.cagr.filter(v => v >= actual.cagr).length / DRAWS, median: quantile(res.cagr.slice().sort((a, b) => a - b), 0.5) },
    // 回撤是负数：越大越浅
    maxDd: { actual: actual.maxDd, percentile: rank(res.maxDd, actual.maxDd), shareAtLeastAsShallow: res.maxDd.filter(v => v >= actual.maxDd).length / DRAWS, median: quantile(res.maxDd.slice().sort((a, b) => a - b), 0.5) },
  }
}
const placeboResult = placebo()

// 多重检验：Bonferroni 放大主检验的 p
const primary = comparisons.static70
const bonferroni = Object.fromEntries([10, 30].map(n => [n, { hac: Math.min(1, primary.hac.p * n), boot: Math.min(1, primary.boot[PRIMARY_BLOCK].p * n) }]))

// ---------- 按预注册的措辞规则给结论 ----------
const robustBlocks = [6, 24, 36].filter(b => primary.boot[b].excludesZero).length
let verdict
if (primary.point > 0 && primary.hac.p < 0.05 && primary.boot[PRIMARY_BLOCK].p < 0.05 && primary.boot[PRIMARY_BLOCK].excludesZero && robustBlocks >= 2) {
  verdict = '显著优于恒定七成'
} else if (primary.point > 0) {
  verdict = '方向一致，但统计上不够显著'
} else {
  verdict = '与恒定七成没有可分辨的差别'
}
const multipleTestingCaveat = Math.max(bonferroni[30].hac, bonferroni[30].boot) >= 0.05

const result = {
  prereg: 'PREREG.md（git 提交 c6203911，计算前）',
  input: input.generatedFrom,
  inputSha256,
  // 自助法 p 值的蒙特卡洛标准误 ≈ sqrt(p(1−p)/抽样次数) × 2（双侧）
  bootMcError: (p => 2 * Math.sqrt(p * (1 - p) / DRAWS))(comparisons.static70.boot[PRIMARY_BLOCK].p / 2),
  sample: { months: rows.length, range: `${rows[0].d} 至 ${rows.at(-1).d}` },
  reproduced, reproduction,
  perf: Object.fromEntries(Object.keys(STRATS).map(id => [id, perf(series[id], cash)])),
  avgEquity: mean(rows.map(r => r.w)),
  comparisons, periods, maxDd, placebo: placeboResult, bonferroni,
  revisedPoint: input.pageVariants.find(v => v.id === 'revised'),
  verdict, multipleTestingCaveat, robustBlocks,
}
writeFileSync(OUT, JSON.stringify(result, null, 2))

const f = (x, d = 3) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(d)
const pct = x => f(x * 100, 2) + '%'
console.log(`复现：${reproduced ? '通过' : '未通过'}`)
for (const [id, r] of Object.entries(reproduction)) console.log(`  ${id}: 年化差 ${f(r.diff.cagr, 5)} 回撤差 ${f(r.diff.maxDd, 5)} 夏普差 ${f(r.diff.sharpe, 5)}`)
if (!reproduced) { console.log('复现未通过，按预注册停止，不出结论。'); process.exit(1) }
console.log(`样本 ${result.sample.range}，${rows.length} 个月，平均仓位 ${pct(result.avgEquity)}`)
for (const b of BENCHES) {
  const c = comparisons[b]
  console.log(`vs ${b}: 夏普差 ${f(c.point)} | HAC se ${f(c.hac.se)} p=${f(c.hac.p, 4)} (Holm ${f(c.holm.hac, 4)}) | ` +
    BLOCKS.map(k => `块${k} [${f(c.boot[k].low)}, ${f(c.boot[k].high)}] p=${f(c.boot[k].p, 4)}`).join(' | ') + ` (Holm 块12 ${f(c.holm.boot, 4)})`)
}
for (const [name, p] of Object.entries(periods)) {
  console.log(`${name}（${p.range}）：策略夏普 ${f(p.perf.strategy.sharpe)} 七成 ${f(p.perf.static70.sharpe)} 差 ${f(p.vsStatic70.point)} HAC p=${f(p.vsStatic70.hac.p, 4)} 块12 [${f(p.vsStatic70.boot.low)}, ${f(p.vsStatic70.boot.high)}]；回撤 ${pct(p.perf.strategy.maxDd)} vs ${pct(p.perf.static70.maxDd)}`)
}
for (const m of maxDd) console.log(`最大回撤 块${m.block}：策略更浅的比例 ${pct(m.shareShallower)}，差值中位 ${pct(m.diffMedian)} [${pct(m.diffLow)}, ${pct(m.diffHigh)}]`)
const pl = placeboResult
console.log(`换档次数：策略 ${pl.actualSwitches}，随机样本不等的次数 ${pl.switchMismatch}`)
console.log(`块长 12 自助法 p 的蒙特卡洛误差约 ±${f(result.bootMcError, 4)}；输入 sha256 ${inputSha256.slice(0, 16)}…`)
console.log(`随机择时（${pl.runs} 段打乱）：夏普 第 ${pct(pl.sharpe.percentile)} 百分位，随机 ≥ 实际 ${pct(pl.sharpe.shareAtLeast)}，中位 ${f(pl.sharpe.median)}；年化 第 ${pct(pl.cagr.percentile)}，中位 ${pct(pl.cagr.median)}；回撤 第 ${pct(pl.maxDd.percentile)}，随机不差于实际 ${pct(pl.maxDd.shareAtLeastAsShallow)}，中位 ${pct(pl.maxDd.median)}`)
console.log(`Bonferroni：N=10 HAC ${f(bonferroni[10].hac, 4)} 块12 ${f(bonferroni[10].boot, 4)}；N=30 HAC ${f(bonferroni[30].hac, 4)} 块12 ${f(bonferroni[30].boot, 4)}`)
console.log(`结论：${verdict}${multipleTestingCaveat ? '；考虑到开发中试过多种写法，不能排除部分优势来自挑选' : ''}（块长稳健 ${robustBlocks}/3）`)
