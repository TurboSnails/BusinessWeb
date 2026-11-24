#!/usr/bin/env node
// 按 PREREG.md 执行防守结束后加码检验（R1、R2）。只读本地文件，结果写到 results.json。
// 用法：node docs/research/post-defense-2026-11-25/run.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const INPUT = '../macro-significance-2026-11-25/inputs.json'
const raw = readFileSync(here(INPUT), 'utf8')
const us = JSON.parse(raw)

const SEED = 20261125
const DRAWS = 10000
const BLOCK = 12
const SPLIT = '2000-01'
const WINDOW = 12
const EQUITY = { offense: 1, 'lean-offense': 0.85, neutral: 0.7, 'lean-defense': 0.5, defense: 0.3 }
const isDefense = t => t === 'lean-defense' || t === 'defense'

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
  const lo = Math.floor(pos); const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}
function perf(port, cash, spx) {
  let w = 1; let peak = 1; let maxDd = 0
  for (const r of port) { w *= 1 + r; peak = Math.max(peak, w); maxDd = Math.min(maxDd, w / peak - 1) }
  const ex = port.map((r, i) => r - cash[i])
  const up = spx.map((r, i) => (r > 0 ? i : -1)).filter(i => i >= 0)
  return {
    months: port.length, cagr: w ** (12 / port.length) - 1, maxDd,
    sharpe: Math.sqrt(12) * mean(ex) / Math.sqrt(sampleVar(ex)),
    upCapture: mean(up.map(i => port[i])) / mean(up.map(i => spx[i])),
  }
}
const sharpeOf = ex => Math.sqrt(12) * mean(ex) / Math.sqrt(sampleVar(ex))
function bootSharpeDiff(x, y) {
  const rng = mulberry32(SEED)
  const draws = new Array(DRAWS)
  for (let b = 0; b < DRAWS; b += 1) {
    const idx = blockIndices(x.length, BLOCK, rng)
    draws[b] = sharpeOf(idx.map(i => x[i])) - sharpeOf(idx.map(i => y[i]))
  }
  const sorted = draws.slice().sort((a, b) => a - b)
  const le = draws.filter(d => d <= 0).length / DRAWS
  const ge = draws.filter(d => d >= 0).length / DRAWS
  return { point: sharpeOf(x) - sharpeOf(y), low: quantile(sorted, 0.025), high: quantile(sorted, 0.975), p: Math.min(1, 2 * Math.min(le, ge)) }
}
function holm(ps) {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0])
  const out = new Array(ps.length)
  let running = 0
  order.forEach(([p, i], k) => { running = Math.max(running, Math.min(1, p * (ps.length - k))); out[i] = running })
  return out
}

// ---------- 按信号月计算加码标记（只用过去的档位） ----------
function boostFlags(minLength) {
  const tiers = us.tiers
  const flags = new Map()
  const episodes = []
  let run = 0 // 当前连续防守月数
  let window = null // { left, episode }
  for (const [d, tier] of tiers) {
    if (isDefense(tier)) {
      run += 1
      window = null // 重新进入防守，窗口结束
      flags.set(d, false)
      continue
    }
    if (run > 0) {
      // 刚从防守段出来：这一个月是窗口第一个月
      if (run >= minLength) {
        const ep = { start: monthAfter(d, -run), end: monthAfter(d, -1), length: run, exit: d, boosted: [] }
        episodes.push(ep)
        window = { left: WINDOW, episode: ep }
      }
      run = 0
    }
    let boosted = false
    if (window && window.left > 0) {
      if (tier === 'neutral') { boosted = true; window.episode.boosted.push(d) }
      window.left -= 1
      if (window.left === 0) window = null
    }
    flags.set(d, boosted)
  }
  return { flags, episodes }
}

const returns = new Map(us.returns.map(([d, spx, cash]) => [d, { spx, cash }]))
const rows = []
for (const [signal, tier] of us.tiers) {
  const d = monthAfter(signal, 2)
  const r = returns.get(d)
  if (r?.cash == null || EQUITY[tier] == null) continue
  rows.push({ signal, d, tier, spx: r.spx, cash: r.cash })
}
const CANDS = { R1: boostFlags(2), R2: boostFlags(6) }
const weightOf = id => row => (id && CANDS[id].flags.get(row.signal) ? EQUITY['lean-offense'] : EQUITY[row.tier])
const port = (id, rs = rows) => rs.map(row => weightOf(id)(row) * row.spx + (1 - weightOf(id)(row)) * row.cash)
const periods = { train: r => r.d < SPLIT, test: r => r.d >= SPLIT, full: () => true }
const evalId = id => Object.fromEntries(Object.entries(periods).map(([name, keep]) => {
  const rs = rows.filter(keep)
  return [name, { ...perf(port(id, rs), rs.map(r => r.cash), rs.map(r => r.spx)), avgEquity: mean(rs.map(weightOf(id))) }]
}))
const base = evalId(null)
const cand = { R1: evalId('R1'), R2: evalId('R2') }

// 复现门槛：基线须与 macro-significance 的复现结果一致
const page = us.pageVariants.find(v => v.id === 'full')
const reproduced = ['cagr', 'maxDd', 'sharpe'].every(k => Math.abs(base.full[k] - page[k]) < 0.0005)

const baseEx = port(null).map((r, i) => r - rows[i].cash)
const boot = Object.fromEntries(['R1', 'R2'].map(id => [id, bootSharpeDiff(port(id).map((r, i) => r - rows[i].cash), baseEx)]))
const holmP = holm(['R1', 'R2'].map(id => boot[id].p))
boot.R1.holm = holmP[0]; boot.R2.holm = holmP[1]

const passTrain = id => cand[id].train.sharpe >= base.train.sharpe + 0.02 && cand[id].train.maxDd >= base.train.maxDd - 0.01
const pick = ['R1', 'R2'].filter(passTrain).sort((a, b) => cand[b].train.sharpe - cand[a].train.sharpe)[0] ?? null
const decision = Object.fromEntries(['R1', 'R2'].map(id => {
  const failed = []
  if (!passTrain(id)) failed.push('门槛1 训练期')
  else if (id !== pick) failed.push('门槛2 训练期夏普非最高')
  if (id === pick && !(cand[id].test.sharpe >= base.test.sharpe + 0.02 && cand[id].test.maxDd >= base.test.maxDd - 0.01)) failed.push('门槛2 验证期')
  if (!(boot[id].holm < 0.05)) failed.push('门槛3 Holm 校正后不显著')
  return [id, { adopt: failed.length === 0, failed }]
}))

// 每段加码窗口内的累计收益差（加码月份对应的收益月）
const rowBySignal = new Map(rows.map(r => [r.signal, r]))
function episodeContrib(id) {
  return CANDS[id].episodes.map(ep => {
    let g0 = 1; let g1 = 1
    for (const s of ep.boosted) {
      const r = rowBySignal.get(s)
      if (!r) continue
      g0 *= 1 + (EQUITY.neutral * r.spx + (1 - EQUITY.neutral) * r.cash)
      g1 *= 1 + (EQUITY['lean-offense'] * r.spx + (1 - EQUITY['lean-offense']) * r.cash)
    }
    return { episode: `${ep.start}~${ep.end}（${ep.length} 个月）`, boostedMonths: ep.boosted.length, diff: g1 / g0 - 1 }
  })
}
const contrib = { R1: episodeContrib('R1'), R2: episodeContrib('R2') }
const boostedMonths = id => [...CANDS[id].flags.values()].filter(Boolean).length

writeFileSync(here('./results.json'), JSON.stringify({
  prereg: 'PREREG.md（git 提交 3da5992f，计算前）', inputSha256: createHash('sha256').update(raw).digest('hex'),
  reproduced, base, candidates: cand, boot, decision, contrib,
  boostedMonths: { R1: boostedMonths('R1'), R2: boostedMonths('R2') },
}, null, 2))

const f = (x, d = 3) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(d)
const pct = x => f(x * 100, 2) + '%'
console.log(`复现：${reproduced ? '通过' : '未通过'}`)
if (!reproduced) process.exit(1)
const line = (name, e) => `${name} 训练 夏普 ${f(e.train.sharpe)} 回撤 ${pct(e.train.maxDd)} | 验证 夏普 ${f(e.test.sharpe)} 回撤 ${pct(e.test.maxDd)} | 全样本 年化 ${pct(e.full.cagr)} 夏普 ${f(e.full.sharpe)} 回撤 ${pct(e.full.maxDd)} 仓位 ${pct(e.full.avgEquity)} 上行捕获 ${f(e.full.upCapture)}`
console.log(line('基线', base))
for (const id of ['R1', 'R2']) {
  const b = boot[id]
  console.log(line(id, cand[id]) + ` | 加码 ${boostedMonths(id)} 个月 | 夏普差 ${f(b.point)} [${f(b.low)}, ${f(b.high)}] p=${f(b.p, 4)} Holm ${f(b.holm, 4)} | ${decision[id].adopt ? '采用' : '不采用：' + decision[id].failed.join('；')}`)
  console.log('   各段：' + contrib[id].map(c => `${c.episode} 加码${c.boostedMonths}月 ${pct(c.diff)}`).join('；'))
}
