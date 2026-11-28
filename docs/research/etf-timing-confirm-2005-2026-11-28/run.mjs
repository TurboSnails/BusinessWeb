// L-056 主实现：朋友 ETF「择时 + 只认金叉」2005–2010 确认检验。严格按冻结的 PREREG v3（0a1f2036）。
// 规则函数直接 import 自 scripts/research/etf-strategy-oos/strategies.mjs（不复制、不改写），运行时校验 SHA-256。
// 输出：results.json（字段含义见 results.schema.json）。RESULTS.md 由人根据 results.json 撰写。
// 用法（仓库根目录）：node docs/research/etf-timing-confirm-2005-2026-11-28/run.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '../../..')
const STRAT = path.join(ROOT, 'scripts/research/etf-strategy-oos/strategies.mjs')
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const fail = (m) => { throw new Error('断言失败：' + m) }

// ---------- 断言链（PREREG「实现与复核」①–⑤，另加 cash-rates.json 与 power-results.json） ----------
const EXPECT = {
  strategies: '9570a34bd55439245012b9b8bfb2a2143b8d92acb346a301704501bb9edbbb82',
  inputsClean: '353b80a5b6f2b8c0091608b89149b2abfa5a53a70eb94054a8ed06a8fbd34cb0',
  l018Inputs: '3f1836349d6a1566e58c85f9d5c987514db71c9ea2f83d7b909bbbf83294e8e5',
  cashRates: '3f012682a9a131d0b702d3c32d80aa8e080f409a2ee7ee059d70d7318dcfb79b',
}
const checks = {}
// ④ strategies.mjs
if (sha256(fs.readFileSync(STRAT)) !== EXPECT.strategies) fail('strategies.mjs SHA-256')
checks.strategiesSha256 = EXPECT.strategies
const { ratioTiming, timingGold, windowStats, macdOnly, macdCross, COST } = await import(STRAT)
if (COST !== 0.001) fail('COST')

// ① raw 文件 SHA-256 与 SOURCES.md 一致
const RAW = path.join(ROOT, 'data-raw/etf-timing-confirm/raw')
const SOURCES = fs.readFileSync(path.join(ROOT, 'data-raw/etf-timing-confirm/SOURCES.md'), 'utf8')
const srcRows = [...SOURCES.matchAll(/^\| `([^`]+\.(?:json|htm))` \|.*\| `([0-9a-f]{64})` \|$/gm)].map((m) => ({ file: m[1], sha: m[2] }))
const rawPresent = fs.existsSync(RAW)
if (rawPresent) {
  let n = 0
  for (const { file, sha } of srcRows) {
    const p = path.join(RAW, file)
    if (!fs.existsSync(p)) fail(`raw 缺文件 ${file}`)
    if (sha256(fs.readFileSync(p)) !== sha) fail(`raw ${file} SHA-256 与 SOURCES.md 不符`)
    n++
  }
  checks.rawFilesVerified = n
} else checks.rawFilesVerified = 'raw 不在本机，跳过 ① ②，以 inputs-clean.json 为输入'

// ② 由 raw 清洗得到的数据与 inputs-clean.json 逐值相同
const CLEAN_PATH = path.join(HERE, 'inputs-clean.json')
const cleanBuf = fs.readFileSync(CLEAN_PATH)
if (sha256(cleanBuf) !== EXPECT.inputsClean) fail('inputs-clean.json SHA-256')
checks.inputsCleanSha256 = EXPECT.inputsClean
const CLEAN = JSON.parse(cleanBuf).series
const BASE = '2004-12-31', END = '2010-12-31'
if (rawPresent) {
  const man = JSON.parse(fs.readFileSync(path.join(RAW, 'manifest.json'), 'utf8'))
  for (const code of Object.keys(CLEAN)) {
    const rows = new Map()
    for (const m of man.filter((x) => x.file.startsWith(`perf-${code}-`) && !x.file.includes('-20080101-'))) {
      const start = m.url.match(/startDate=(\d{8})/)[1]
      for (const r of JSON.parse(fs.readFileSync(path.join(RAW, m.file), 'utf8')).data || []) {
        if (!(r.close > 0) || r.tradeDate === start) continue // 清洗 ④ 与 ①
        const d = `${r.tradeDate.slice(0, 4)}-${r.tradeDate.slice(4, 6)}-${r.tradeDate.slice(6)}`
        if (rows.has(d) && rows.get(d) !== r.close) fail(`${code} ${d} 重叠日收盘不一致`) // 清洗 ②
        rows.set(d, r.close)
      }
    }
    const mine = [...rows.entries()].filter(([d]) => d >= BASE && d <= END).sort((a, b) => a[0].localeCompare(b[0])) // 清洗 ③
    const frozen = CLEAN[code]
    if (mine.length !== frozen.length || mine.some(([d, c], i) => d !== frozen[i][0] || c !== frozen[i][1])) fail(`${code} raw 清洗结果与 inputs-clean.json 不同`)
  }
  checks.rawCleanEqualsInputsClean = true
}
// ⑤ L-018 inputs.json
const L018_PATH = path.join(ROOT, 'docs/research/etf-volume-2026-11-25/inputs.json')
const l018Buf = fs.readFileSync(L018_PATH)
if (sha256(l018Buf) !== EXPECT.l018Inputs) fail('L-018 inputs.json SHA-256')
checks.l018InputsSha256 = EXPECT.l018Inputs
const L018 = JSON.parse(l018Buf)
const cashBuf = fs.readFileSync(path.join(HERE, 'cash-rates.json'))
if (sha256(cashBuf) !== EXPECT.cashRates) fail('cash-rates.json SHA-256')
checks.cashRatesSha256 = EXPECT.cashRates
const CASH = JSON.parse(cashBuf).oneYearDeposit

// ---------- 常量 ----------
const TARGETS = ['H00300', 'H00905', 'H00852', 'H00016', 'H00922', 'H00986', 'H00987', 'H00988', 'H00989', 'H00990', 'H00991', 'H00992', 'H00993', 'H00994', 'H00995']
const W = ['2005-07-06', '2010-12-31'], C = ['2007-10-16', '2008-11-04'], WP = ['2008-05-26', '2010-12-31'], C_SSE = ['2007-10-16', '2008-10-28']
const SHIFTS = (lo, hi) => { const a = []; for (let s = lo; s <= hi; s++) a.push(s); return a }
const MAIN_SHIFTS = SHIFTS(63, 1275)
const toBars = (rows) => rows.map(([date, close]) => ({ date, open: close, high: close, low: close, close }))
const MAIN = Object.fromEntries(Object.entries(CLEAN).map(([c, rows]) => [c, toBars(rows)]))
const L004 = Object.fromEntries([...TARGETS, '000300', '000922'].map((c) => [c, toBars((L018.targets[c] ?? L018.timing[c]).rows.filter((r) => r[0] <= END).map(([d, cl]) => [d, cl]))]))

// ③ 交易日历
const cal = MAIN.H00300.map((b) => b.date)
for (const c of Object.keys(MAIN)) if (MAIN[c].map((b) => b.date).join() !== cal.join()) fail(`${c} 交易日历不同`)
const countIn = (ds, [a, b]) => ds.filter((d) => d >= a && d <= b).length
if (cal.length !== 1458 || countIn(cal, W) !== 1338 || countIn(cal, C) !== 259 || countIn(cal, WP) !== 637) fail('交易日历 / W / C / W′ 根数')
checks.calendar = { bars: 1458, W: 1338, C: 259, Wprime: 637 }

// ---------- 工具 ----------
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const yearsOf = (a, b) => (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5)
const idx = (bars, d) => { const i = bars.findIndex((b) => b.date === d); if (i < 0) fail(`日期 ${d} 不在序列中`); return i }
function mddRange(eq, i0, i1) { let pk = -Infinity, dd = 0; for (let i = i0; i <= i1; i++) { if (eq[i] > pk) pk = eq[i]; const d = eq[i] / pk - 1; if (d < dd) dd = d } return dd * 100 }
function volOf(eq, i0, i1) { const x = []; for (let i = i0 + 1; i <= i1; i++) x.push(eq[i] / eq[i - 1] - 1); const mu = mean(x); return Math.sqrt(x.reduce((a, b) => a + (b - mu) ** 2, 0) / (x.length - 1)) * Math.sqrt(252) * 100 }
/** 静态同仓位净值：i ≤ i0 为 1，之后 Π(1 + k·r(i))（每日再平衡、现金 0、不计成本） */
function staticEq(hold, i0, k) { const m = new Array(hold.length).fill(1); for (let i = i0 + 1; i < hold.length; i++) m[i] = m[i - 1] * (1 + k * (hold[i] / hold[i - 1] - 1)); return m }
/** k = 区间 [i0, i1] 内 t = 2..n 的 e(t) = pos(t−1) 均值 */
const kOf = (pos, i0, i1) => { let s = 0; for (let i = i0 + 1; i <= i1; i++) s += pos[i - 1]; return s / (i1 - i0) }
const GRADES = ['未确认', '回撤门槛通过、择时增量未证实', '部分确认', '确认'] // 由低到高
function grade(nP, nD, nX, pC) {
  if (nD < 12) return '未确认'
  if (nX < 8) return '回撤门槛通过、择时增量未证实'
  if (nP >= 9 && pC <= 0.10) return '确认'
  return '部分确认'
}
const lower = (a, b) => (GRADES.indexOf(a) <= GRADES.indexOf(b) ? a : b)
const tradesOf = (bars, pos) => { const b = [], s = []; for (let i = 1; i < pos.length; i++) { if (pos[i] && !pos[i - 1]) b.push(bars[i].date); if (!pos[i] && pos[i - 1]) s.push(bars[i].date) } return { buys: b, sells: s } }

/**
 * 按 PREREG 评估一个口径。series：代码 → bars；bull：Map(date → boolean)；shifts：平移量集合。
 * 返回逐指数结果、个数、安慰剂 p 值、等级（含降级规则 1）。
 */
function evaluate(series, bull, shifts, { withCalt = true } = {}) {
  const per = {}, E = [], R = [], ctx = []
  for (const code of TARGETS) {
    const bars = series[code], hold = bars.map((b) => b.close)
    const g = timingGold(bars, bull, { fill: 'close' })
    const iW0 = idx(bars, W[0]), iWT = idx(bars, W[1]), iC0 = idx(bars, C[0]), iC1 = idx(bars, C[1]), iP0 = idx(bars, WP[0]), iPT = idx(bars, WP[1])
    const L = iWT - iW0 + 1
    const e = new Uint8Array(L), r = new Float64Array(L)
    e[0] = g.pos[iW0 - 1]
    for (let u = 1; u < L; u++) { e[u] = g.pos[iW0 + u - 1]; r[u] = hold[iW0 + u] / hold[iW0 + u - 1] - 1 }
    const k = kOf(g.pos, iW0, iWT)
    const M = staticEq(hold, iW0, k)
    const st = (eq, a, b) => windowStats(bars, eq, a, b)
    const wR = st(g.eq, ...W), wH = st(hold, ...W), wM = st(M, ...W)
    const cR = st(g.eq, ...C), cH = st(hold, ...C), cM = st(M, ...C)
    const D = cR.dd >= 0.7 * cH.dd, A = wR.annual >= wH.annual - 1, Xann = wR.annual >= wM.annual, Xdd = cR.dd >= cM.dd
    // W′（降级规则 1）：e 沿用主口径持仓，k′ 与 M′ 在 W′ 内重算
    const kP = kOf(g.pos, iP0, iPT), MP = staticEq(hold, iP0, kP)
    const pR = st(g.eq, ...WP), pM = st(MP, ...WP), pH = st(hold, ...WP)
    const XPann = pR.annual >= pM.annual, XPdd = pR.dd >= pM.dd
    const out = {
      name: bars.at(-1).name ?? null, k, kPrime: kP, eW0: e[0],
      W: { rule: wR, hold: wH, M: wM, vol: { rule: volOf(g.eq, iW0, iWT), hold: volOf(hold, iW0, iWT), M: volOf(M, iW0, iWT) } },
      C: { rule: cR, hold: cH, M: cM },
      Wprime: { rule: pR, hold: pH, M: pM, Xann: XPann, Xdd: XPdd, X: XPann && XPdd },
      D, A, P: D && A, Xann, Xdd, X: Xann && Xdd, volLowerThanM: volOf(g.eq, iW0, iWT) < volOf(M, iW0, iWT),
      trades: tradesOf(bars, g.pos),
    }
    if (withCalt) {
      const aR = st(g.eq, ...C_SSE), aH = st(hold, ...C_SSE), aM = st(M, ...C_SSE)
      out.Csse = { rule: aR, hold: aH, M: aM, D: aR.dd >= 0.7 * aH.dd, Xdd: aR.dd >= aM.dd, X: Xann && aR.dd >= aM.dd }
    }
    per[code] = out
    E.push(e); R.push(r)
    ctx.push({ L, cs: iC0 - iW0, ce: iC1 - iW0, as: withCalt ? idx(bars, C_SSE[0]) - iW0 : 0, ae: withCalt ? idx(bars, C_SSE[1]) - iW0 : 0, yrs: yearsOf(W[0], W[1]), Mann: wM.annual, MCdd: cM.dd, MAdd: withCalt ? per[code].Csse.M.dd : 0, holdCdd: cH.dd, holdAnn: wH.annual, ruleCdd: cR.dd })
  }
  const cnt = (f) => TARGETS.filter((c) => f(per[c])).length
  const counts = { P: cnt((x) => x.P), D: cnt((x) => x.D), A: cnt((x) => x.A), X: cnt((x) => x.X), Xann: cnt((x) => x.Xann), Xdd: cnt((x) => x.Xdd), Xprime: cnt((x) => x.Wprime.X), XprimeAnn: cnt((x) => x.Wprime.Xann), XprimeDd: cnt((x) => x.Wprime.Xdd), volLowerThanM: cnt((x) => x.volLowerThanM) }
  if (withCalt) Object.assign(counts, { Csse_D: cnt((x) => x.Csse.D), Csse_X: cnt((x) => x.Csse.X), Csse_Xdd: cnt((x) => x.Csse.Xdd) })
  // ---------- 时机安慰剂（15 个指数共用 s） ----------
  const Dbar = mean(TARGETS.map((c) => per[c].C.rule.dd)), Abar = mean(TARGETS.map((c) => per[c].W.rule.annual))
  const DbarAlt = withCalt ? mean(TARGETS.map((c) => per[c].Csse.rule.dd)) : null
  let geC = 0, geA = 0, geX = 0, geCalt = 0
  const perIdxGe = new Array(TARGETS.length).fill(0)
  const dist = { Dbar: [], Abar: [], X: [] }
  for (const s of shifts) {
    let sd = 0, sa = 0, nx = 0, sdAlt = 0
    for (let i = 0; i < TARGETS.length; i++) {
      const { L, cs, ce, as, ae, yrs, Mann, MCdd, ruleCdd } = ctx[i], e = E[i], r = R[i]
      const eq = new Float64Array(L); let v = 1
      for (let u = 0; u < L; u++) {
        const cur = e[(u + s) % L]
        if (u > 0) v *= 1 + cur * r[u]
        if (u < L - 1 && e[(u + 1 + s) % L] !== cur) v *= 1 - COST
        eq[u] = v
      }
      const ann = (eq[L - 1] ** (1 / yrs) - 1) * 100, dc = mddRange(eq, cs, ce)
      sd += dc; sa += ann
      if (ann >= Mann && dc >= MCdd) nx++
      if (dc >= ruleCdd) perIdxGe[i]++
      if (withCalt) sdAlt += mddRange(eq, as, ae)
    }
    sd /= 15; sa /= 15; sdAlt /= 15
    if (sd >= Dbar) geC++
    if (sa >= Abar) geA++
    if (nx >= counts.X) geX++
    if (withCalt && sdAlt >= DbarAlt) geCalt++
    dist.Dbar.push(sd); dist.Abar.push(sa); dist.X.push(nx)
  }
  const NS = shifts.length, p = (ge) => (1 + ge) / (1 + NS)
  const placebo = { nShifts: NS, shiftRange: [shifts[0], shifts.at(-1)], DbarRule: Dbar, AbarRule: Abar, pC: p(geC), pA: p(geA), pX: p(geX), perIndexP: Object.fromEntries(TARGETS.map((c, i) => [c, p(perIdxGe[i])])), dist: summarize(dist) }
  if (withCalt) Object.assign(placebo, { DbarRuleCsse: DbarAlt, pCsse: p(geCalt) })
  // ---------- 等级与降级规则 1 ----------
  const raw = grade(counts.P, counts.D, counts.X, placebo.pC)
  let g = raw, downgrade1 = false
  if (counts.X >= 8 && counts.Xprime < 8 && GRADES.indexOf(g) > GRADES.indexOf('部分确认')) { g = '部分确认'; downgrade1 = true }
  if (counts.X >= 8 && counts.Xprime < 8) downgrade1 = true
  const sub = g === '回撤门槛通过、择时增量未证实' ? (placebo.pC <= 0.10 ? '大跌段时机优于随机' : '大跌段时机与随机无异') : null
  const note = g === '部分确认' && placebo.pC > 0.10 ? '与同样仓位结构的随机时机相比不显著' : null
  const gradeCsse = withCalt ? grade(counts.P, counts.Csse_D, counts.Csse_X, placebo.pCsse) : null
  return { perIndex: per, counts, placebo, gradeBeforeDowngrade: raw, downgrade1Triggered: downgrade1, grade: g, subLabel: sub, note, gradeCsseReportOnly: gradeCsse }
}
function summarize(d) { const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))] }; return Object.fromEntries(Object.entries(d).map(([k, a]) => [k, { p10: q(a, 0.1), median: q(a, 0.5), p90: q(a, 0.9), mean: mean(a) }])) }

// ---------- 主口径 / L-004 布局 / E1 ----------
const bullMain = ratioTiming(MAIN['000300'], MAIN['000922'])
const main = evaluate(MAIN, bullMain, MAIN_SHIFTS)
const bullL004 = ratioTiming(L004['000300'], L004['000922'])
const l004 = evaluate(L004, bullL004, MAIN_SHIFTS)
const l004Alt = evaluate(L004, bullL004, SHIFTS(63, 1276), { withCalt: false }) // clarify-needed 第 1 条：L = 1339 时平移上限的备选
const bullE1 = ratioTiming(MAIN['000300'], MAIN['000015'])
const e1 = evaluate(MAIN, bullE1, MAIN_SHIFTS)
const finalGrade = lower(main.grade, l004.grade)
const sensitive = main.grade !== l004.grade

// ---------- 自检：timingGold 的 pos 与 count-results.json 的买卖次数一致 ----------
const countRes = JSON.parse(fs.readFileSync(path.join(HERE, 'count-results.json'), 'utf8'))
const countCheck = Object.fromEntries(TARGETS.map((c) => { const t = main.perIndex[c].trades; const ref = countRes.events[c].totals; return [c, { buys: t.buys.length, sells: t.sells.length, countBuys: ref.buys, countSells: ref.sells, kCount: countRes.events[c].k, ok: t.buys.length === ref.buys && t.sells.length === ref.sells && Math.abs(countRes.events[c].k - +main.perIndex[c].k.toFixed(6)) < 1e-9 }] }))
if (!Object.values(countCheck).every((x) => x.ok)) fail('与 count-results.json 的买卖次数 / k 不一致')
checks.countResultsAgree = true

// ---------- 报告项：现金计息版与「死叉次日收盘卖」版（主口径） ----------
const rateOn = (d) => { let r = null; for (const [dd, v] of CASH) if (dd <= d) r = v; if (r == null) fail('利率表不覆盖 ' + d); return r }
function interest(d0, d1) { let s = 0; for (let t = Date.parse(d0) + 864e5; t <= Date.parse(d1); t += 864e5) s += rateOn(new Date(t).toISOString().slice(0, 10)) / 100 / 365; return s }
/** 由 pos 重建净值：空仓日计息（cash=true 时）；pos 变化当日收盘成交扣 COST（含窗口末日，与 timingGold 相同） */
function eqFromPos(bars, pos, i0, cash) {
  const eq = new Array(bars.length).fill(1)
  for (let i = i0 + 1; i < bars.length; i++) {
    const held = pos[i - 1]
    let v = eq[i - 1] * (held ? bars[i].close / bars[i - 1].close : 1 + (cash ? interest(bars[i - 1].date, bars[i].date) : 0))
    if (pos[i] !== pos[i - 1]) v *= 1 - COST
    eq[i] = v
  }
  return eq
}
function staticEqCash(bars, i0, k) { const m = new Array(bars.length).fill(1); for (let i = i0 + 1; i < bars.length; i++) m[i] = m[i - 1] * (1 + k * (bars[i].close / bars[i - 1].close - 1) + (1 - k) * interest(bars[i - 1].date, bars[i].date)); return m }
/** 「死叉次日收盘卖」变体：除死叉一律挂次日卖出外，与 timingGold 逐行相同（只用于报告项） */
function timingGoldNextDaySell(bars, bull, warmup = 120) {
  const { gold, dead } = macdCross(bars); const eq = [], pos = []
  let cash = 1, units = 0, pend, lastBull
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]; const t = bull.get(b.date); if (t !== undefined) lastBull = t; const isBull = lastBull !== false
    const px = b.close
    if (pend === 'buy') { units = cash * (1 - COST) / px; cash = 0 } else if (pend === 'sell') { cash = units * px * (1 - COST); units = 0 }
    pend = undefined
    if (i >= warmup) {
      if (!units && gold[i] && isBull) pend = 'buy'
      else if (units && dead[i]) pend = 'sell'
    }
    eq.push(units ? units * b.close : cash); pos.push(units ? 1 : 0)
  }
  return { eq, pos }
}
const variants = { cash: {}, nextDaySell: {} }
let selfCheckEqFromPos = 0
for (const code of TARGETS) {
  const bars = MAIN[code], hold = bars.map((b) => b.close), g = timingGold(bars, bullMain, { fill: 'close' })
  const iW0 = idx(bars, W[0]), st = (eq, a, b) => windowStats(bars, eq, a, b)
  const eq0 = eqFromPos(bars, g.pos, iW0, false)
  for (let i = iW0; i < bars.length; i++) selfCheckEqFromPos = Math.max(selfCheckEqFromPos, Math.abs(eq0[i] / g.eq[i] - 1))
  const k = main.perIndex[code].k
  const eqC = eqFromPos(bars, g.pos, iW0, true), MC = staticEqCash(bars, iW0, k), M0 = staticEq(hold, iW0, k)
  const wR = st(eqC, ...W), cR = st(eqC, ...C), wH = st(hold, ...W), cH = st(hold, ...C), wMC = st(MC, ...W), cMC = st(MC, ...C)
  variants.cash[code] = { W: wR, C: cR, D: cR.dd >= 0.7 * cH.dd, A: wR.annual >= wH.annual - 1, MCash: { W: wMC, C: cMC }, XvsMCash: wR.annual >= wMC.annual && cR.dd >= cMC.dd }
  variants.cash[code].P = variants.cash[code].D && variants.cash[code].A
  const n = timingGoldNextDaySell(bars, bullMain), kN = kOf(n.pos, iW0, idx(bars, W[1])), MN = staticEq(hold, iW0, kN)
  const nW = st(n.eq, ...W), nC = st(n.eq, ...C), nMW = st(MN, ...W), nMC = st(MN, ...C)
  variants.nextDaySell[code] = { k: kN, W: nW, C: nC, D: nC.dd >= 0.7 * cH.dd, A: nW.annual >= wH.annual - 1, X: nW.annual >= nMW.annual && nC.dd >= nMC.dd, trades: tradesOf(bars, n.pos) }
  variants.nextDaySell[code].P = variants.nextDaySell[code].D && variants.nextDaySell[code].A
  void M0
}
if (selfCheckEqFromPos > 1e-12) fail('由 pos 重建的净值与 timingGold 不一致 ' + selfCheckEqFromPos)
const vc = (o, f) => TARGETS.filter((c) => f(o[c])).length
variants.cashCounts = { A: vc(variants.cash, (x) => x.A), D: vc(variants.cash, (x) => x.D), P: vc(variants.cash, (x) => x.P), XvsMCash: vc(variants.cash, (x) => x.XvsMCash), crossesP9Boundary: (vc(variants.cash, (x) => x.P) >= 9) !== (main.counts.P >= 9) }
variants.nextDaySellCounts = { D: vc(variants.nextDaySell, (x) => x.D), A: vc(variants.nextDaySell, (x) => x.A), P: vc(variants.nextDaySell, (x) => x.P), X: vc(variants.nextDaySell, (x) => x.X) }
variants.selfCheckEqFromPosMaxRelDiff = selfCheckEqFromPos

// ---------- 报告项：macdOnly 参照 ----------
const macdOnlyRes = Object.fromEntries(TARGETS.map((code) => {
  const bars = MAIN[code], hold = bars.map((b) => b.close), m = macdOnly(bars, { fill: 'close' }).eq
  const st = (eq, a, b) => windowStats(bars, eq, a, b)
  const w = st(m, ...W), c = st(m, ...C), cH = st(hold, ...C), wH = st(hold, ...W)
  return [code, { W: w, C: c, D: c.dd >= 0.7 * cH.dd, A: w.annual >= wH.annual - 1 }]
}))

// ---------- 报告项：择时滤网安慰剂（主口径；牛熊序列在 1,439 个有定义日期上循环平移，MACD 不动） ----------
const defDates = [...bullMain.keys()], defVals = [...bullMain.values()], ND = defDates.length
if (ND !== 1439 || defDates[0] !== '2005-01-28') fail('择时有定义日期数 / 起点')
const filt = { Dbar: [], Abar: [], D: [], X: [] }
for (const s of MAIN_SHIFTS) {
  const b2 = new Map(defDates.map((d, kk) => [d, defVals[(kk + s) % ND]]))
  let sd = 0, sa = 0, nd = 0, nx = 0
  for (const code of TARGETS) {
    const bars = MAIN[code], hold = bars.map((b) => b.close), g = timingGold(bars, b2, { fill: 'close' })
    const iW0 = idx(bars, W[0]), iWT = idx(bars, W[1]), k = kOf(g.pos, iW0, iWT), M = staticEq(hold, iW0, k)
    const w = windowStats(bars, g.eq, ...W), c = windowStats(bars, g.eq, ...C), cH = main.perIndex[code].C.hold
    const wM = windowStats(bars, M, ...W), cM = windowStats(bars, M, ...C)
    sd += c.dd; sa += w.annual; if (c.dd >= 0.7 * cH.dd) nd++; if (w.annual >= wM.annual && c.dd >= cM.dd) nx++
  }
  filt.Dbar.push(sd / 15); filt.Abar.push(sa / 15); filt.D.push(nd); filt.X.push(nx)
}
const pct = (arr, v) => (1 + arr.filter((x) => x >= v).length) / (1 + arr.length)
const filterPlacebo = { nShifts: MAIN_SHIFTS.length, dist: summarize(filt), pDbar: pct(filt.Dbar, main.placebo.DbarRule), pAbar: pct(filt.Abar, main.placebo.AbarRule), pD: pct(filt.D, main.counts.D), pX: pct(filt.X, main.counts.X), note: '择时滤网安慰剂的 X 以各自的平均仓位 k 构造静态对照（clarify-needed 第 3 条）' }

// ---------- 报告项：自然年、分段贡献、其他回撤段、发布后 / 回填分开（主口径） ----------
const YEARS = [2005, 2006, 2007, 2008, 2009, 2010]
const SEGMENTS = [['2007-10-16', '2007-11-28'], ['2008-01-14', '2008-04-21'], ['2008-05-05', '2008-11-04'], ['2009-08-03', '2009-08-31'], ['2009-12-07', '2010-07-05']]
const C_SPLIT = [['2007-10-16', '2008-05-23'], ['2008-05-26', '2008-11-04']]
const BULL = ['2006-01-04', '2007-10-16']
const PUB = { H00300: ['2005-07-06', END], H00016: ['2005-07-06', END], H00905: ['2007-01-15', END], H00922: ['2008-05-26', END] }
const BACKFILL = ['2005-07-06', '2008-05-23']
const reports = {}
for (const code of TARGETS) {
  const bars = MAIN[code], hold = bars.map((b) => b.close), g = timingGold(bars, bullMain, { fill: 'close' })
  const iW0 = idx(bars, W[0]), k = main.perIndex[code].k, M = staticEq(hold, iW0, k)
  const st = (eq, a, b) => windowStats(bars, eq, a, b)
  const ret = (eq, a, b) => eq[idx(bars, b)] / eq[idx(bars, a)] - 1
  const years = {}
  for (const y of YEARS) {
    const inY = bars.map((b, i) => [b.date, i]).filter(([d]) => d.startsWith(String(y)) && d >= W[0])
    const a = y === 2005 ? W[0] : bars.filter((b) => b.date < `${y}-01-01`).at(-1).date, b = inY.at(-1)[0]
    const t = tradesOf(bars, g.pos)
    years[y] = { from: a, to: b, rule: ret(g.eq, a, b) * 100, hold: ret(hold, a, b) * 100, M: ret(M, a, b) * 100, buys: t.buys.filter((d) => d.startsWith(String(y))).length, sells: t.sells.filter((d) => d.startsWith(String(y))).length, heldShare: mean(inY.map(([, i]) => g.pos[i])) }
  }
  const lr = (eq, a, b) => Math.log(eq[idx(bars, b)] / eq[idx(bars, a)])
  const contrib = Object.fromEntries([['bull', BULL], ['C', C], ['W', W]].map(([kk, [a, b]]) => [kk, { from: a, to: b, ruleMinusHold: lr(g.eq, a, b) - lr(hold, a, b), ruleMinusM: lr(g.eq, a, b) - lr(M, a, b) }]))
  const seg = (list) => list.map(([a, b]) => ({ from: a, to: b, rule: st(g.eq, a, b), hold: st(hold, a, b), M: st(M, a, b) }))
  const fresh = ([a, b]) => { const i0 = idx(bars, a), i1 = idx(bars, b), kk = kOf(g.pos, i0, i1), MM = staticEq(hold, i0, kk); return { from: a, to: b, k: kk, rule: st(g.eq, a, b), hold: st(hold, a, b), M: st(MM, a, b) } }
  reports[code] = { years, contributions: contrib, otherSegments: seg(SEGMENTS), cSplit: seg(C_SPLIT), backfillSegment: fresh(BACKFILL), published: PUB[code] ? fresh(PUB[code]) : null }
}

// ---------- 报告项：分组观察与 L-004 集合 ----------
const GROUPS = { bluechipDividend: ['H00300', 'H00016', 'H00922', 'H00992'], smallCyclical: ['H00905', 'H00852', 'H00987', 'H00988', 'H00993'], other: ['H00986', 'H00989', 'H00990', 'H00991', 'H00994', 'H00995'] }
const L004_PASS = ['H00905', 'H00852', 'H00986', 'H00987', 'H00988', 'H00989', 'H00990', 'H00993', 'H00995'], L004_FAIL = ['H00300', 'H00016', 'H00922', 'H00991', 'H00992', 'H00994']
const gc = (list, f) => list.filter((c) => f(main.perIndex[c])).length
const groups = Object.fromEntries(Object.entries(GROUPS).map(([g, list]) => [g, { n: list.length, P: gc(list, (x) => x.P), D: gc(list, (x) => x.D), A: gc(list, (x) => x.A), X: gc(list, (x) => x.X) }]))
groups.patternReproduced = groups.bluechipDividend.P / 4 < groups.smallCyclical.P / 5
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }
const l004Sets = {
  passSet: { n: 9, P: gc(L004_PASS, (x) => x.P), notP: 9 - gc(L004_PASS, (x) => x.P), medianRuleMinusMAnnual: median(L004_PASS.map((c) => main.perIndex[c].W.rule.annual - main.perIndex[c].W.M.annual)) },
  failSet: { n: 6, P: gc(L004_FAIL, (x) => x.P), notP: 6 - gc(L004_FAIL, (x) => x.P), medianRuleMinusMAnnual: median(L004_FAIL.map((c) => main.perIndex[c].W.rule.annual - main.perIndex[c].W.M.annual)) },
}

// ---------- 近似并列诊断（主口径） ----------
const nearTies = { ratio: [], macd: [] }
{
  const a = new Map(MAIN['000300'].map((x) => [x.date, x.close])); const q = []
  for (const x of MAIN['000922']) { q.push(a.get(x.date) / x.close); if (q.length > 20) q.shift(); if (q.length === 20) { const ma = q.reduce((s, v) => s + v, 0) / 20; if (Math.abs(q.at(-1) - ma) / ma < 1e-12) nearTies.ratio.push(x.date) } }
  for (const code of TARGETS) {
    const bars = MAIN[code]; let f = bars[0].close, s = f, dea = 0
    const { gold, dead } = macdCross(bars), t = main.perIndex[code].trades, tset = new Set([...t.buys, ...t.sells])
    for (let i = 0; i < bars.length; i++) { if (i) { f += 2 / 13 * (bars[i].close - f); s += 2 / 27 * (bars[i].close - s) } const dif = f - s; dea += 0.2 * (dif - dea); if (Math.abs(dif - dea) < 1e-12) nearTies.macd.push({ code, date: bars[i].date, gold: gold[i], dead: dead[i], tradeDayOrNext: tset.has(bars[i].date) || (i + 1 < bars.length && tset.has(bars[i + 1].date)) }) }
  }
}

// ---------- 结论用数字 ----------
const power = JSON.parse(fs.readFileSync(path.join(HERE, 'power-results.json'), 'utf8'))
const LRKEY = { 确认: '确认', 部分确认: '部分确认', '回撤门槛通过、择时增量未证实': '回撤过·增量未证实', 未确认: '未确认' }
const fg = finalGrade, fpC = main.placebo.pC
let lrH1, lrH0
if (fg === '回撤门槛通过、择时增量未证实') {
  if (fpC <= 0.10) { lrH1 = power.H1.drawdownOnlyWithPcLe010; lrH0 = power.H0.drawdownOnlyWithPcLe010 } else { lrH1 = power.H1.gradeFreq[LRKEY[fg]] - power.H1.drawdownOnlyWithPcLe010; lrH0 = power.H0.gradeFreq[LRKEY[fg]] - power.H0.drawdownOnlyWithPcLe010 }
} else { lrH1 = power.H1.gradeFreq[LRKEY[fg]]; lrH0 = power.H0.gradeFreq[LRKEY[fg]] }
const fourCrashes = {
  '2008（本检验 C 段）': { pC: main.placebo.pC, X: main.counts.X, Xdd: main.counts.Xdd, Xann: main.counts.Xann, betterThanRandom: main.placebo.pC <= 0.10 },
  ...Object.fromEntries(Object.entries(power.H1.byEpisode).map(([k, v]) => [`${k}（功效分析，中位）`, { pC: v.pC.median, X: v.nX.median, Xdd: v.nXdd.median, Xann: v.nXann.median, betterThanRandom: v.pC.median <= 0.10 }])),
}

const results = {
  study: 'L-056', prereg: { version: 'v3', freezeCommit: '0a1f2036', ledgerCommit: 'f4f67429' }, generatedAt: new Date().toISOString(),
  checks, windows: { W, C, Wprime: WP, Csse: C_SSE }, targets: TARGETS,
  main, l004Layout: l004, l004LayoutAltShifts: { shiftRange: [63, 1276], pC: l004Alt.placebo.pC, grade: l004Alt.grade, counts: l004Alt.counts },
  e1: { grade: e1.grade, subLabel: e1.subLabel, counts: e1.counts, placebo: { pC: e1.placebo.pC, pA: e1.placebo.pA, pX: e1.placebo.pX }, downgrade1Triggered: e1.downgrade1Triggered, differsFromMain: e1.grade !== main.grade, perIndex: e1.perIndex },
  final: { mainGrade: main.grade, l004Grade: l004.grade, grade: finalGrade, sensitiveToSingleDataDay: sensitive, subLabel: finalGrade === '回撤门槛通过、择时增量未证实' ? (fpC <= 0.10 ? '大跌段时机优于随机' : '大跌段时机与随机无异') : null, pC: fpC, likelihood: { pH1: lrH1, pH0: lrH0, ratio: lrH0 > 0 ? lrH1 / lrH0 : null }, e1DependencyStatement: e1.grade !== main.grade },
  variants, macdOnly: macdOnlyRes, filterPlacebo, reports, groups, l004Sets, nearTies, fourCrashes, countCheck,
}
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 1))
console.log(JSON.stringify({ checks, final: results.final, mainCounts: main.counts, mainPlacebo: { pC: main.placebo.pC, pA: main.placebo.pA, pX: main.placebo.pX, pCsse: main.placebo.pCsse }, l004: { grade: l004.grade, counts: l004.counts, pC: l004.placebo.pC }, l004Alt: results.l004LayoutAltShifts, e1: { grade: e1.grade, counts: e1.counts, pC: e1.placebo.pC }, cash: variants.cashCounts, nextDay: variants.nextDaySellCounts, nearTies: { ratio: nearTies.ratio.length, macd: nearTies.macd.length } }, null, 1))
