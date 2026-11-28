// L-056 功效与有效样本分析（REVIEW-1 必改 7）。只用已用掉的 2011–2026 数据（L-018 inputs.json；LEDGER：15 个中证全收益指数 2011 年以来已用）。
// 纪律：断言本脚本用到的每一个日期都 ≥ 2011-01-01，2005–2010 年的任何数据都不进入计算。
// 做法：5.5 年（1,338 个交易日）滚动窗口，逐月起点（2011-07 起）；每个窗口前取 120 根作全新预热，使规则在窗口首日必然空仓、EMA 重新初始化，
// 与主检验 W 的起点状态完全相同。C′ = 窗口内 H00300 最大回撤段。H1 = 原规则；H0 = 15 个指数共用平移量的循环平移安慰剂（同样仓位结构、随机时机）。
// 用法：node docs/research/etf-timing-confirm-2005-2026-11-28/power.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'
import { ratioTiming, timingGold, windowStats, COST } from '../../../scripts/research/etf-strategy-oos/strategies.mjs'

const HERE = new URL('.', import.meta.url).pathname
const INPUT = `${HERE}/../etf-volume-2026-11-25/inputs.json`
const buf = fs.readFileSync(INPUT)
const sha = crypto.createHash('sha256').update(buf).digest('hex')
if (sha !== '3f1836349d6a1566e58c85f9d5c987514db71c9ea2f83d7b909bbbf83294e8e5') throw new Error('inputs.json SHA-256 不符')
const J = JSON.parse(buf)
const TARGETS = ['H00300', 'H00905', 'H00852', 'H00016', 'H00922', 'H00986', 'H00987', 'H00988', 'H00989', 'H00990', 'H00991', 'H00992', 'H00993', 'H00994', 'H00995']
const FLOOR = '2011-01-01', L = 1338, WARM = 120, S_MIN = 63, S_MAX = 1275
// 剔除分段假行（2012-01-01、2016-01-01、2020-01-01、2024-01-01：非交易日、收盘复制下一交易日），与主检验的清洗口径一致
const FAKE = new Set(['2012-01-01', '2016-01-01', '2020-01-01', '2024-01-01'])
const rows = (c) => (J.targets[c] ?? J.timing[c]).rows.filter((r) => r[0] >= FLOOR && !FAKE.has(r[0]))
const toBars = (rs) => rs.map(([date, close]) => ({ date, open: close, high: close, low: close, close }))
const all = Object.fromEntries([...TARGETS, '000300', '000922'].map((c) => [c, toBars(rows(c))]))
const cal = all.H00300.map((b) => b.date)
// 15 个被交易指数与 000922 的日历必须相同；000300 价格版少 2018-06-18（端午节，全收益序列在这一天多一行），按 L-004 代码由 ratioTiming 跳过、沿用前一日状态
for (const c of [...TARGETS, '000922']) if (all[c].map((b) => b.date).join() !== cal.join()) throw new Error(`${c} 交易日历与 H00300 不同`)
const miss300 = cal.filter((d) => !new Set(all['000300'].map((b) => b.date)).has(d))
if (miss300.join() !== '2018-06-18') throw new Error('000300 缺日与预期不符：' + miss300.join())

const yearsOf = (a, b) => (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5)
function mddRange(eq, i0, i1) { let pk = -Infinity, dd = 0; for (let i = i0; i <= i1; i++) { if (eq[i] > pk) pk = eq[i]; const d = eq[i] / pk - 1; if (d < dd) dd = d } return dd * 100 }
function grade(nP, nD, nX, pC) {
  if (nD < 12) return '未确认'
  if (nX < 8) return '回撤过·增量未证实'
  if (nP >= 9 && pC <= 0.10) return '确认'
  return '部分确认'
}
const GRADES = ['确认', '部分确认', '回撤过·增量未证实', '未确认']

// 窗口起点：每月第一个交易日，需要前面有 WARM 根、后面有 L 根
const starts = []
for (let j = WARM; j + L - 1 < cal.length; j++) if (cal[j].slice(0, 7) !== cal[j - 1].slice(0, 7) && cal[j] >= '2011-07-01') starts.push(j)

const SHIFTS = []; for (let s = S_MIN; s <= S_MAX; s++) SHIFTS.push(s)
const NS = SHIFTS.length
const H1 = [], H0count = Object.fromEntries(GRADES.map((g) => [g, 0])); let H0n = 0
const h0Counts = { D: [], A: [], P: [], X: [] }; const h0pc = []
let s0Check = { windows: 0, maxRelDiff: 0, lastDayTradeIndexWindows: 0 }
const H0sub = { pcLe010_in_drawdownOnly: 0 }
for (const j of starts) {
  const lo = j - WARM, hi = j + L - 1
  const ds = cal.slice(lo, hi + 1)
  if (ds[0] < FLOOR) throw new Error('用到了 2011 年以前的数据')
  const bull = ratioTiming(all['000300'].filter((b) => b.date >= cal[lo] && b.date <= cal[hi]), all['000922'].slice(lo, hi + 1))
  const W0 = ds[WARM], WT = ds.at(-1), yrs = yearsOf(W0, WT)
  // C′：窗口内 H00300 最大回撤段（峰值日 → 谷底日）
  const h = all.H00300.slice(j, hi + 1).map((b) => b.close)
  let pk = 0, best = 0, bp = 0, bt = 0
  for (let u = 0; u < L; u++) { if (h[u] > h[pk]) pk = u; const d = h[u] / h[pk] - 1; if (d < best) { best = d; bp = pk; bt = u } }
  const cs = bp, ce = bt
  const per = []
  const R = [], E = [], K = [], Mann = [], Mdd = []
  for (const code of TARGETS) {
    const bars = all[code].slice(lo, hi + 1)
    const g = timingGold(bars, bull, { fill: 'close' })
    const hold = bars.map((b) => b.close)
    const wR = windowStats(bars, g.eq, W0, WT), wH = windowStats(bars, hold, W0, WT)
    const cR = windowStats(bars, g.eq, ds[WARM + cs], ds[WARM + ce]), cH = windowStats(bars, hold, ds[WARM + cs], ds[WARM + ce])
    // 逐日收益与暴露 e(u) = pos(u−1)，W 首日 e = 0
    const r = new Float64Array(L), e = new Uint8Array(L)
    for (let u = 1; u < L; u++) { r[u] = hold[WARM + u] / hold[WARM + u - 1] - 1; e[u] = g.pos[WARM + u - 1] }
    let k = 0; for (let u = 1; u < L; u++) k += e[u]; k /= L - 1
    // 同平均仓位静态对照 M
    const m = new Float64Array(L); m[0] = 1; for (let u = 1; u < L; u++) m[u] = m[u - 1] * (1 + k * r[u])
    const mAnn = (m[L - 1] ** (1 / yrs) - 1) * 100, mC = mddRange(m, cs, ce)
    const D = cH.dd < 0 ? cR.dd >= 0.7 * cH.dd : true
    const A = wR.annual >= wH.annual - 1
    const X = wR.annual >= mAnn && cR.dd >= mC
    // 日波动（对照报告）：ddof = 1，× √252
    const vol = (eq) => { const x = []; for (let u = 1; u < L; u++) x.push(eq[u] / eq[u - 1] - 1); const mu = x.reduce((a, b) => a + b, 0) / x.length; return Math.sqrt(x.reduce((a, b) => a + (b - mu) ** 2, 0) / (x.length - 1)) * Math.sqrt(252) }
    const volR = vol(g.eq.slice(WARM)), volM = vol(m)
    per.push({ code, D, A, P: D && A, X, Xann: wR.annual >= mAnn, Xdd: cR.dd >= mC, k, volLower: volR < volM })
    R.push(r); E.push(e); K.push(k); Mann.push(mAnn); Mdd.push(mC)
    // 自检：s = 0 的占位净值公式与 timingGold 净值一致（除窗口末日有成交的情况）
    const eq0 = placebo(r, e, 0)
    const lastTrade = g.pos[hi - lo] !== g.pos[hi - lo - 1]
    if (lastTrade) s0Check.lastDayTradeIndexWindows++
    else for (let u = 0; u < L; u++) s0Check.maxRelDiff = Math.max(s0Check.maxRelDiff, Math.abs(eq0[u] / g.eq[WARM + u] - 1))
  }
  s0Check.windows++
  // 规则的 15 指数均值
  const ruleDbar = mean(TARGETS.map((code, i) => windowStats(all[code].slice(lo, hi + 1), timingGold(all[code].slice(lo, hi + 1), bull, { fill: 'close' }).eq, ds[WARM + cs], ds[WARM + ce]).dd))
  // 安慰剂：15 个指数共用 s
  const pD = new Float64Array(NS), pA = new Float64Array(NS), pX = new Int32Array(NS), pnD = new Int32Array(NS), pnA = new Int32Array(NS), pnP = new Int32Array(NS)
  const holdC = TARGETS.map((code) => { const hb = all[code].slice(j, hi + 1).map((b) => b.close); return mddRange(hb, cs, ce) })
  const holdAnn = TARGETS.map((code) => { const hb = all[code].slice(j, hi + 1).map((b) => b.close); return ((hb[L - 1] / hb[0]) ** (1 / yrs) - 1) * 100 })
  for (let si = 0; si < NS; si++) {
    let sd = 0, sa = 0, nx = 0, nd = 0, na = 0, np = 0
    for (let i = 0; i < TARGETS.length; i++) {
      const eq = placebo(R[i], E[i], SHIFTS[si])
      const ann = (eq[L - 1] ** (1 / yrs) - 1) * 100, dc = mddRange(eq, cs, ce)
      sd += dc; sa += ann
      const d = holdC[i] < 0 ? dc >= 0.7 * holdC[i] : true, a = ann >= holdAnn[i] - 1
      if (ann >= Mann[i] && dc >= Mdd[i]) nx++
      if (d) nd++; if (a) na++; if (d && a) np++
    }
    pD[si] = sd / 15; pA[si] = sa / 15; pX[si] = nx; pnD[si] = nd; pnA[si] = na; pnP[si] = np
  }
  let ge = 0; for (let si = 0; si < NS; si++) if (pD[si] >= ruleDbar) ge++
  const pC = (1 + ge) / (1 + NS)
  const nD = per.filter((x) => x.D).length, nA = per.filter((x) => x.A).length, nP = per.filter((x) => x.P).length, nX = per.filter((x) => x.X).length
  H1.push({ start: W0, end: WT, C: [ds[WARM + cs], ds[WARM + ce]], nD, nA, nP, nX, nXann: per.filter((x) => x.Xann).length, nXdd: per.filter((x) => x.Xdd).length, pC: +pC.toFixed(4), grade: grade(nP, nD, nX, pC), volLower: per.filter((x) => x.volLower).length, kRange: [Math.min(...K).toFixed(3), Math.max(...K).toFixed(3)] })
  // H0：每个平移量当作「观测」，p_C 以其余平移量与规则本身为参照
  const pool = [...pD, ruleDbar]
  for (let si = 0; si < NS; si++) {
    let g2 = 0; for (let q = 0; q < pool.length; q++) if (q !== si && pool[q] >= pD[si]) g2++
    const pc = (1 + g2) / (1 + NS)
    const gg = grade(pnP[si], pnD[si], pX[si], pc); H0count[gg]++; H0n++
    if (gg === '回撤过·增量未证实' && pc <= 0.10) H0sub.pcLe010_in_drawdownOnly++
    h0pc.push(pc); h0Counts.D.push(pnD[si]); h0Counts.A.push(pnA[si]); h0Counts.P.push(pnP[si]); h0Counts.X.push(pX[si])
  }
}
function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length }
/** 占位净值：E(−1) = 1；E(u) = E(u−1)·(1 + e^s(u)·r(u))；若 u < L−1 且 e^s(u+1) ≠ e^s(u)，当日收盘成交，乘 (1 − COST)。窗口末日不计成交（与规则「窗口末不强制平仓」一致）。 */
function placebo(r, e, s) {
  const eq = new Float64Array(L); let v = 1
  for (let u = 0; u < L; u++) {
    const cur = e[(u + s) % L]
    if (u > 0) v *= 1 + cur * r[u]
    if (u < L - 1 && e[(u + 1 + s) % L] !== cur) v *= 1 - COST
    eq[u] = v
  }
  return eq
}

// 有效样本：2011-01 至 2026-11 15 个指数日收益两两相关的均值
const ret = TARGETS.map((c) => all[c].slice(1).map((b, i) => b.close / all[c][i].close - 1))
const corr = (x, y) => { const mx = mean(x), my = mean(y); let a = 0, b = 0, c = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2 } return a / Math.sqrt(b * c) }
const cs2 = []; for (let a = 0; a < 15; a++) for (let b = a + 1; b < 15; b++) cs2.push(corr(ret[a], ret[b]))
const rho = mean(cs2), Neff = 15 / (1 + 14 * rho)

const freq = (arr) => Object.fromEntries(GRADES.map((g) => [g, +(arr.filter((x) => x === g).length / arr.length).toFixed(3)]))
const dist = (arr) => { const s = [...arr].sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { p10: q(0.1), median: q(0.5), p90: q(0.9), mean: +mean(arr).toFixed(2) } }
const h1Grades = H1.map((w) => w.grade)
const out = {
  generatedAt: new Date().toISOString(), input: { file: 'docs/research/etf-volume-2026-11-25/inputs.json', sha256: sha, dateFloor: FLOOR, lastDate: cal.at(-1) },
  design: { windowDays: L, warmup: WARM, shifts: [S_MIN, S_MAX], nShifts: NS, windows: H1.length, firstStart: H1[0].start, lastStart: H1.at(-1).start, independentWindowsApprox: +(yearsOf(cal[0], cal.at(-1)) / 5.5).toFixed(1) },
  effectiveSample: { rhoBar: +rho.toFixed(3), rhoMin: +Math.min(...cs2).toFixed(3), rhoMax: +Math.max(...cs2).toFixed(3), Neff: +Neff.toFixed(2) },
  H1: { gradeFreq: freq(h1Grades), nD: dist(H1.map((w) => w.nD)), nA: dist(H1.map((w) => w.nA)), nP: dist(H1.map((w) => w.nP)), nX: dist(H1.map((w) => w.nX)), pC: dist(H1.map((w) => w.pC)), pCle010: +(H1.filter((w) => w.pC <= 0.1).length / H1.length).toFixed(3), volLowerThanM: dist(H1.map((w) => w.volLower)) },
  H0: { n: H0n, gradeFreq: Object.fromEntries(GRADES.map((g) => [g, +(H0count[g] / H0n).toFixed(3)])), nD: dist(h0Counts.D), nA: dist(h0Counts.A), nP: dist(h0Counts.P), nX: dist(h0Counts.X) },
  selfCheckS0: s0Check,
  windows: H1,
}
out.H1.nXann = { ...dist(H1.map((w) => w.nXann)), ge8: +(H1.filter((w) => w.nXann >= 8).length / H1.length).toFixed(3) }
out.H1.nXdd = { ...dist(H1.map((w) => w.nXdd)), ge8: +(H1.filter((w) => w.nXdd >= 8).length / H1.length).toFixed(3) }
// 按 C′ 所属大跌分组（REVIEW-2 必改 2）：2015 股灾（C′ 起点 2015 年）、2018 熊市（2018 年）、2021–24 慢熊（2021 年）
const episode = (w) => (w.C[0] < '2016-01-01' ? '2015 股灾' : w.C[0] < '2019-01-01' ? '2018 熊市' : '2021–24 慢熊')
out.H1.byEpisode = Object.fromEntries(['2015 股灾', '2018 熊市', '2021–24 慢熊'].map((e) => { const ws = H1.filter((w) => episode(w) === e); return [e, { windows: ws.length, pCle010: ws.filter((w) => w.pC <= 0.1).length, pC: dist(ws.map((w) => w.pC)), nXann: dist(ws.map((w) => w.nXann)), nXdd: dist(ws.map((w) => w.nXdd)), nX: dist(ws.map((w) => w.nX)), grades: Object.fromEntries(GRADES.map((g) => [g, ws.filter((w) => w.grade === g).length])) }] }))
out.H1.drawdownOnlyWithPcLe010 = +(H1.filter((w) => w.grade === '回撤过·增量未证实' && w.pC <= 0.1).length / H1.length).toFixed(3)
out.H0.drawdownOnlyWithPcLe010 = +(H0sub.pcLe010_in_drawdownOnly / H0n).toFixed(3)
out.H0.pCle010 = +(h0pc.filter((x) => x <= 0.1).length / h0pc.length).toFixed(3)
out.H1.partialOrBetter = +(out.H1.gradeFreq['确认'] + out.H1.gradeFreq['部分确认']).toFixed(3)
out.H0.partialOrBetter = +(out.H0.gradeFreq['确认'] + out.H0.gradeFreq['部分确认']).toFixed(3)
fs.writeFileSync(`${HERE}/power-results.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify({ ...out, windows: `${H1.length} 个（见 power-results.json）` }, null, 1))
