// 预注册附录 B：在已用过的 1951–2026 年数据上用同一 lib.mjs 计算全部门槛指标，并标定月均价偏差 δ_L。
// 只用已用数据；与 PREREG.md 同一次提交，在打开 1871–1934 年结果之前运行。
// 用法：node docs/research/trend-1871-2026-11-26/calibrate.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { belowMA, gates, makeSameVol, mAfter, metrics, range, returnsOf, sd, targetWeights, navOf } from './lib.mjs'
const here = p => new URL(p, import.meta.url)
const shiller = readFileSync(here('../../../data-raw/sp500-backtest/shiller.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','))
const P = new Map(shiller.map(r => [r[0], +r[1]])); const D = new Map(shiller.map(r => [r[0], r[2] === '' ? null : +r[2]]))
const daily = JSON.parse(readFileSync(here('../../../data-raw/macro-posture-daily/spx-daily.json'))).rows
const C = new Map(); for (const [d, c] of daily) C.set(d.slice(0, 7), c)
const cashM = new Map(JSON.parse(readFileSync(here('../macro-significance-2026-11-25/inputs.json'))).returns.filter(r => r[2] != null).map(([d, , c]) => [d, c]))
const months = range('1951-01', '2026-06') // D 截至 2026-06
const rA = months.map(t => (P.get(t) + D.get(t) / 12) / P.get(mAfter(t, -1)) - 1)
const rE = months.map(t => (C.get(t) + D.get(t) / 12) / C.get(mAfter(t, -1)) - 1)
const c = months.map(t => cashM.get(t))
const W0 = 0.85
// 事件：月末含息总收益指数回撤 ≥ 20%（高点月 → 谷底月）
const idx = navOf(rE); const raw = []; { let pk = 0; let cur = null
  for (let j = 1; j < idx.length; j++) { if (idx[j] >= idx[pk]) { if (cur) { raw.push(cur); cur = null } pk = j; continue } if (!cur) cur = { p: pk, t: j }; if (idx[j] < idx[cur.t]) cur.t = j }
  if (cur) raw.push(cur) }
const events = raw.filter(e => idx[e.t] / idx[e.p] - 1 <= -0.20).map((e, i) => ({ id: `U${i + 1}`, p: e.p === 0 ? mAfter(months[0], -1) : months[e.p - 1], q: months[e.t - 1], sub: 'all', depth: idx[e.t] / idx[e.p] - 1 }))
const RULES = { C1: 0.70, C2: 0.50 }
const out = { note: '已用数据：收益月 1951-01 至 2026-06，A2（席勒月均价）与月末口径（日收盘月末，信号次月生效）。只用来判断门槛难度，不是 1871–1934 年的结果。', base: W0, events: events.map(e => [e.p, e.q, +e.depth.toFixed(4)]) }
for (const [id, low] of Object.entries(RULES)) {
  const drop = W0 - low
  const ctxA = { months, r: rA, c, events, w0: W0 }
  const wA = targetWeights(months, s => (belowMA(P, s) ? low : W0))
  const mA = metrics(ctxA, wA, 0.001); const mA30 = metrics(ctxA, wA, 0.003)
  // 月末口径：信号 s = t−1，用月末收盘的 10 个月均值
  const ctxE = { months, r: rE, c, events, w0: W0 }
  const wE = months.map(t => (belowMA(C, mAfter(t, -1)) ? low : W0))
  const mE = metrics(ctxE, wE, 0.001)
  const strip = m => ({ wM: +m.wM.toFixed(4), L: +m.L.toFixed(4), wins: m.wins, dE: +m.dE.toFixed(4), posE: m.posE, nEvents: m.nEvents, calmVsM: +m.calmVsM.toFixed(4), calmVsB0: +m.calmVsB0.toFixed(4), dCER: +m.dCER.toFixed(5), sharpe: +m.sharpe.toFixed(4), sharpeM: +m.sharpeM.toFixed(4), switchesPerYear: +m.switchesPerYear.toFixed(3), turnoverPerYear: +m.turnoverPerYear.toFixed(3), avgW: +m.avgW.toFixed(4) })
  const g = gates(mA, mA30, W0, drop)
  out[id] = { A2: strip(mA), A2cost30: strip(mA30), monthEnd: strip(mE), deltaL: +(mE.L - mA.L).toFixed(4), gatesOnUsedData: { ...g, Lstar: +g.Lstar.toFixed(4), note: 'G4 无子期、G5 未算、L₋₂₉ 不适用' } }
}
writeFileSync(here('./calibration.json'), JSON.stringify(out, null, 2) + '\n')
for (const id of Object.keys(RULES)) console.log(id, JSON.stringify(out[id].A2), 'δL', out[id].deltaL, JSON.stringify(out[id].gatesOnUsedData))
