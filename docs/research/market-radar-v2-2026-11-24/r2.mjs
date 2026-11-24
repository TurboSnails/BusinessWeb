// 第二轮：新指标 + 快慢分层。先读 PREREG-round2.md。基线 = 线上 radar-v1（dump 里的市盈率已是修正后的值）。
import { D, M, DIM, avg, EQ, TIERS, run, perf } from './lib.mjs'
const X = D.extra
const ym = d => d.slice(0, 7)
const addM = (m, k) => { const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k; return `${y + Math.floor(mo / 12)}-${String(((mo % 12) + 12) % 12 + 1).padStart(2, '0')}` }
const pct = (v, ref) => (ref.filter(x => x < v).length + ref.filter(x => x === v).length / 2) / ref.length * 100
const band = (v, lo, hi, loScore = -1) => v <= lo ? loScore : v >= hi ? -loScore : 0
// 每月最后一个观测
const lastByMonth = rows => { const m = new Map(); for (const [d, v] of rows) if (v != null) m.set(ym(d), v); return m }
const i200 = lastByMonth(X.industry200), iNet = lastByMonth(X.industryNetHighs), iMom = lastByMonth(X.industryMomentum)
const gs = lastByMonth(X.goldSilver.filter(([d]) => d.slice(8) >= '28'))  // 只取月度行（月末日期），去掉末尾的最新日读数
const aaii = X.aaiiSpread
const quarterlyPct = (rows, t) => { const known = rows.filter(([, a]) => ym(a) <= t); if (known.length < 2) return null; return pct(known.at(-1)[2], known.map(r => r[2])) }

export const NEW_DIM = { industry200: 'trading', industryMomentum: 'trading', industryNetHighs: 'trading', aaiiSpread: 'crowding', goldSilver: 'liquidity' }
export function newScores(t) {
  const s = {}
  const f = addM(t, -2)                       // French 数据：第 2 个月末可得
  if (i200.has(f)) s.industry200 = band(i200.get(f), 40, 60)
  if (iMom.has(f)) s.industryMomentum = band(iMom.get(f), 40, 60)
  if (iNet.has(f)) s.industryNetHighs = band(iNet.get(f), -10, 10)
  const known = aaii.filter(([d]) => ym(d) <= t)
  if (known.length && ym(known.at(-1)[0]) === t && known[0][0] <= `${+t.slice(0, 4) - 5}-${t.slice(5)}-31`) {
    s.aaiiSpread = band(pct(known.at(-1)[1], known.map(r => r[1])), 20, 80, 1)
  }
  const g = t > '2000-08' ? t : addM(t, -1)
  if (gs.has(g) && gs.has(addM(g, -6))) s.goldSilver = band((gs.get(g) / gs.get(addM(g, -6)) - 1) * 100, -15, 15, 1)
  return s
}
export function baseScores(m) {
  const I = m.ind, s = {}
  if (I.baaChange) s.baaChange = band(I.baaChange.v, -0.15, 0.20, 1)
  if (I.pe?.p != null) s.pe = band(I.pe.p, 20, 80, 1)
  if (I.erp?.p != null) s.erp = band(I.erp.p, 20, 80)
  const eq = quarterlyPct(D.raw.equityShare, m.d), ca = quarterlyPct(D.raw.cashShare, m.d)
  if (eq != null) s.equityShare = band(eq, 20, 80, 1)
  if (ca != null) s.cashShare = band(ca, 20, 80)
  if (I.finraDebtYoy) s.finraDebtYoy = band(I.finraDebtYoy.v, -20, 30, 1)
  if (I.breadth) s.breadth = I.breadth.v <= 40 ? -1 : I.breadth.v >= 60 ? 1 : 0
  if (I.volume) s.volume = I.volume.v >= 1.10 ? (I.volume.below ? -1 : 1) : 0
  if (I.epsYoy) s.epsYoy = band(I.epsYoy.v, -10, 10)
  return s
}
const T0 = s => s == null ? null : s >= 0.5 ? 'offense' : s >= 0.15 ? 'lean-offense' : s <= -0.75 ? 'defense' : s <= -0.25 ? 'lean-defense' : 'neutral'
const T1 = s => s == null ? null : s >= 0.4 ? 'offense' : s >= 0.15 ? 'lean-offense' : s <= -0.4 ? 'defense' : s <= -0.15 ? 'lean-defense' : 'neutral'
const cache = new Map()
export function signal(m, { extra = false, layered = false } = {}) {
  const key = m.d + extra + layered; if (cache.has(key)) return cache.get(key)
  const s = { ...baseScores(m), ...(extra ? newScores(m.d) : {}) }
  const dims = {}
  for (const [id, v] of Object.entries(s)) (dims[DIM[id] ?? NEW_DIM[id]] ??= []).push(v)
  const dim = Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, avg(v)]))
  const mean = ks => avg(ks.map(k => dim[k]).filter(x => x != null))
  let out
  if (!layered) {
    const score = mean(['liquidity', 'valuation', 'crowding', 'trading', 'earnings'])
    out = { tier: T0(score == null ? null : Math.round(score * 1e10) / 1e10), score, s, dim }
  } else {
    const fast = mean(['liquidity', 'trading', 'earnings']), slow = mean(['valuation', 'crowding'])
    let i = fast == null ? null : TIERS.indexOf(T1(Math.round(fast * 1e10) / 1e10))
    if (i != null && slow != null) {
      if (slow <= -0.5) { i = Math.max(i, 1); if (m.below) i = Math.min(i + 1, 4) }
      else if (slow >= 0.5 && !m.below) i = Math.max(i - 1, 0)
    }
    out = { tier: i == null ? null : TIERS[i], fast, slow, s, dim }
  }
  cache.set(key, out); return out
}
export function evalCfg(cfg) {
  const rows = run(m => EQ[signal(m, cfg).tier])
  return { tr: perf(rows.filter(x => x.d < '2000-01')), te: perf(rows.filter(x => x.d >= '2000-01')), fu: perf(rows) }
}
export const fmt = p => `${(p.cagr * 100).toFixed(2)}% dd ${(p.maxDd * 100).toFixed(1)} sh ${p.sharpe.toFixed(3)} eq ${p.avgEq.toFixed(2)} sw ${p.sw.toFixed(1)}`
export const CANDS = { 'A 数据扩充': { extra: true }, 'B 快慢分层': { layered: true }, 'C 分层+扩充': { extra: true, layered: true } }
