// 立项评估：恐慌极值 + 估值偏低 + 趋势企稳——只数事件次数。
// 纪律：只读仓库已有数据；不计算任何信号之后的收益、回撤或绩效（输出里没有任何「之后」的价格变化）。
// 口径事先写在 ASSESS.md 第三节，本脚本逐条实现；运行：node docs/research/panic-value-trend-2026-11-27/count.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const ROOT = new URL('../../../', import.meta.url)
const rd = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'))
const avg = a => a.reduce((s, x) => s + x, 0) / a.length
const ym = d => d.slice(0, 7)
const addM = (m, k) => { const t = +m.slice(0, 4) * 12 + +m.slice(5, 7) - 1 + k; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}` }
const range = (a, b) => { const xs = []; for (let t = a; t <= b; t = addM(t, 1)) xs.push(t); return xs }
const gap = (a, b) => { const f = m => +m.slice(0, 4) * 12 + +m.slice(5, 7); return f(b) - f(a) }
const monthlyMean = rows => { const g = new Map(); for (const [d, v] of rows) if (Number.isFinite(v)) { const k = ym(d); if (!g.has(k)) g.set(k, []); g.get(k).push(v) } return new Map([...g].map(([k, a]) => [k, avg(a)])) }
const LAST = '2026-10' // 最后一个完整月
const DEF = new Set(['defense', 'lean-defense'])

// ---------- 通用读数 ----------
/** r4 口径：S(t) ÷ 前 6 个月 S 的均值 − 1。 */
const trendIn = (S, t) => { const prior = [1, 2, 3, 4, 5, 6].map(k => S.get(addM(t, -k))); return S.has(t) && prior.every(x => x != null) ? S.get(t) / avg(prior) - 1 : null }
/** 近 20 个交易日日对数收益年化标准差（与 r4.mjs 同式），按月取均值。 */
function realizedVolMonthly(daily) {
  const rv = []
  for (let i = 20; i < daily.length; i++) {
    const r = []; for (let k = i - 19; k <= i; k++) r.push(Math.log(daily[k][1] / daily[k - 1][1]))
    const m = avg(r); rv.push([daily[i][0], Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / 19) * Math.sqrt(252) * 100])
  }
  return monthlyMean(rv)
}
/** 扩张窗口分位：值 x 在 [起点, t] 全部已知值中的位置（≤ x 的比例）。少于 minN 个返回 null。 */
function expandingPct(series, months, minN) {
  const out = new Map(); const seen = []
  for (const t of months) {
    const x = series.get(t); if (x == null) continue
    seen.push(x)
    if (seen.length >= minN) out.set(t, seen.filter(v => v <= x).length / seen.length)
  }
  return out
}
/** 十个月均线（L-027 belowMA）：P_t < 含当月 10 个月均值。 */
const belowMA = (P, t) => { const xs = range(addM(t, -9), t).map(m => P.get(m)); return xs.some(x => x == null) ? null : P.get(t) < avg(xs) }
/** 相邻命中间隔 ≤ g 个月归为一段。 */
function cluster(months, g) { const ep = []; for (const m of months) { const last = ep.at(-1); if (last && gap(last.at(-1), m) <= g) last.push(m); else ep.push([m]) } return ep }

// ---------- 美国数据 ----------
const rob = rd('docs/research/robustness-2026-11-25/inputs.json') // 1950–1972 留出读数（修订后）、1973 起实时读数
const holdTiers = new Map(rd('docs/research/multi-asset-2026-11-25/holdout-tiers.json').tiers) // v2.2 留出档位 1959-09 至 1972-12
const US = new Map()
for (const h of rob.holdout) US.set(h.d, { baa: h.components.baaChange?.value ?? null, below: h.below, tier: holdTiers.get(h.d) ?? null })
for (const r of rob.realtime) US.set(r.d, { baa: r.components.baaChange?.value ?? null, below: r.below, tier: r.pageFinal })
const VIX = monthlyMean(rd('data-raw/market-radar/VIX.json'))
const spxDaily = rd('data-raw/macro-posture-daily/spx-daily.json').rows
const RV_US = realizedVolMonthly(spxDaily)
const VIX_FROM = '1990-07'
const volTrendUS = t => (t >= VIX_FROM ? trendIn(VIX, t) : trendIn(RV_US, t))

// 席勒月表：P（月均价）、E、CPI → CAPE = 实际价格 ÷ 过去 120 个月实际盈利均值
const shiller = readFileSync(new URL('data-raw/sp500-backtest/shiller.csv', ROOT), 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','))
const SP = new Map(), SE = new Map(), SCPI = new Map()
for (const [d, P, , E, CPI] of shiller) { if (+P > 0) SP.set(d, +P); if (E !== '' && +E > 0) SE.set(d, +E); if (CPI !== '' && +CPI > 0) SCPI.set(d, +CPI) }
const sMonths = [...SP.keys()].sort()
const CAPE = new Map()
for (const t of sMonths) {
  const win = range(addM(t, -119), t)
  if (!SCPI.has(t) || win.some(m => !SE.has(m) || !SCPI.has(m))) continue
  CAPE.set(t, (SP.get(t) / SCPI.get(t)) / avg(win.map(m => SE.get(m) / SCPI.get(m))))
}
const capeMonths = [...CAPE.keys()].sort()
const CAPE_PCT = expandingPct(CAPE, capeMonths, 60) // 1881 起扩张，至少 5 年
// 交叉核对：仓库生产口径的 Multpl CAPE（dump.json 不入库，存在才核对）
let capeCheck = null
const dumpPath = new URL('docs/research/market-radar-v2-2026-11-24/dump.json', ROOT)
if (existsSync(dumpPath)) {
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8'))
  const diffs = dump.months.filter(m => m.ind.cape && CAPE.has(m.d)).map(m => Math.abs(m.ind.cape.v - CAPE.get(m.d)))
  const tierSame = dump.months.filter(m => US.get(m.d)?.tier === m.mastersRt).length
  const baaSame = dump.months.filter(m => US.get(m.d)?.baa === m.ind.baaChange?.v).length
  capeCheck = { n: diffs.length, maxAbs: Math.max(...diffs), meanAbs: avg(diffs), tierMatch: `${tierSame}/${dump.months.length}`, baaMatch: `${baaSame}/${dump.months.length}` }
}

// ---------- 恐慌口径 ----------
const panicR4 = t => { const u = US.get(t); const v = volTrendUS(t); return u?.baa != null && v != null && u.baa >= 0.2 && v >= 0.2 }
// 代用 M（只有月均价时）：近 3 个月月度对数收益的均方根 ÷ 再往前 12 个月的均方根 − 1 ≥ k，且月均价低于 6 个月前
function proxyM(P) {
  const r = new Map(); for (const t of P.keys()) { const p0 = P.get(addM(t, -1)); if (p0) r.set(t, Math.log(P.get(t) / p0)) }
  const rms = ms => { const xs = ms.map(m => r.get(m)); return xs.some(x => x == null) ? null : Math.sqrt(avg(xs.map(x => x * x))) }
  return (t, k) => { const a = rms(range(addM(t, -2), t)), b = rms(range(addM(t, -14), addM(t, -3))); const p6 = P.get(addM(t, -6)); return a != null && b && p6 != null && a / b - 1 >= k && P.get(t) < p6 }
}
// 代用 D（有日线、无信用利差时）：日线已实现波动趋势（r4 式）≥ +20%，且月均价低于 6 个月前
const proxyD = (RV, P) => t => { const v = trendIn(RV, t); const p6 = P.get(addM(t, -6)); return v != null && p6 != null && P.has(t) && v >= 0.2 && P.get(t) < p6 }

// ---------- 事件计数 ----------
/**
 * months：信号月范围；P(t) 恐慌；V(t) 估值偏低；T(t) 重新站上十个月均线（上月破位、本月不破位）；tier(t) 宏观档位。
 * 联合信号：T(t) ∧ V(t) ∧ [t−W, t] 内有恐慌月。相隔 ≤ 12 个月的联合信号归为同一独立事件，事件日期 = 首个联合信号月。
 */
function countJoint({ months, P, V, T, tier, W = 6 }) {
  const sig = months.filter(t => T(t) && V(t) && range(addM(t, -W), t).some(P))
  return cluster(sig, 12).map(e => ({ date: e[0], months: e, tier: tier ? tier(e[0]) : null, panic: range(addM(e[0], -W), e[0]).filter(P) }))
}
function panicEpisodes(months, P) { return cluster(months.filter(P), 3) }
const fmtPct = x => (x == null ? '—' : `${Math.round(x * 100)}`)

function analyse(name, { months, P, Vpct, T, tier }) {
  const V = q => t => Vpct(t) != null && Vpct(t) < q
  const episodes = panicEpisodes(months, P).map(e => {
    const s = e[0], end = e.at(-1)
    const tMonth = range(s, addM(end, 6)).find(t => months.includes(t) && T(t)) ?? null
    return { start: s, end, months: e.length, capePctAtStart: Vpct(s), anyVinEpisode: e.some(V(0.5)), tierAtStart: tier ? tier(s) : null, firstRecrossWithin6: tMonth, capePctAtRecross: tMonth ? Vpct(tMonth) : null, tierAtRecross: tMonth && tier ? tier(tMonth) : null }
  })
  const grid = {}
  for (const [vName, Vf] of [['V<50', V(0.5)], ['V<60', V(0.6)], ['无V', () => true]])
    for (const W of [3, 6, 12]) {
      const ev = countJoint({ months, P, V: Vf, T, tier, W })
      grid[`${vName} W=${W}`] = { events: ev.length, defense: tier ? ev.filter(e => DEF.has(e.tier)).length : null, tierKnown: tier ? ev.filter(e => e.tier).length : null }
    }
  // 受影响月数：从信号月起，v2.2 仍在防守 / 偏防守、自己尚未回到中性的连续月数（只看档位路径，不看价格）
  const run = t => { if (!tier || !DEF.has(tier(t))) return null; let k = 0; while (k < 36 && DEF.has(tier(addM(t, k)))) k++; return k }
  const primary = countJoint({ months, P, V: V(0.5), T, tier, W: 6 }).map(e => ({ ...e, capePct: Vpct(e.date), defenseRun: run(e.date) }))
  const noV6 = countJoint({ months, P, V: () => true, T, tier, W: 6 }).map(e => ({ date: e.date, tier: e.tier, capePct: Vpct(e.date), defenseRun: run(e.date) }))
  const recrosses = months.filter(T).length
  return { name, range: [months[0], months.at(-1)], panicMonths: months.filter(P).length, panicEpisodes: episodes, recrosses, vMonthsShare: months.filter(V(0.5)).length / months.filter(t => Vpct(t) != null).length, grid, primary, noV6 }
}

// S1 美国 1973–2026：r4 口径
const m1 = range('1973-01', LAST)
const S1 = analyse('美国 1973–2026（利差 + VIX/已实现波动，r4 口径）', {
  months: m1, P: panicR4, Vpct: t => CAPE_PCT.get(t) ?? null,
  T: t => US.get(addM(t, -1))?.below === true && US.get(t)?.below === false, tier: t => US.get(t)?.tier ?? null,
})
// S3 美国 1950–1972：同一 r4 口径（1990 前本来就用已实现波动），档位 1959-09 起
const m3 = range('1950-01', '1972-12')
const S3 = analyse('美国 1950–1972（利差 + 已实现波动，r4 口径；档位 1959-09 起）', {
  months: m3, P: panicR4, Vpct: t => CAPE_PCT.get(t) ?? null,
  T: t => US.get(addM(t, -1))?.below === true && US.get(t)?.below === false, tier: t => US.get(t)?.tier ?? null,
})

// 代用 M 的 k：在美国 1973–2026 上让「代用命中月数」最接近 r4 恐慌月数（只用信号频率，不看任何之后的价格）
const pm = proxyM(SP)
const r4Count = m1.filter(panicR4).length
let best = null
for (let k = 0; k <= 4.0001; k += 0.05) { const n = m1.filter(t => pm(t, k)).length; if (!best || Math.abs(n - r4Count) < Math.abs(best.n - r4Count)) best = { k: +k.toFixed(2), n } }
const K = best.k
const r4Eps = panicEpisodes(m1, panicR4)
const pmEps1973 = panicEpisodes(m1, t => pm(t, K))
const overlap = (A, B) => A.filter(a => B.some(b => gap(addM(b[0], -3), a[0]) >= 0 && gap(a[0], addM(b.at(-1), 3)) >= 0)).length
const proxyDiagM = { k: K, r4PanicMonths: r4Count, proxyMonths: best.n, r4Episodes: r4Eps.length, proxyEpisodes: pmEps1973.length, r4CaughtByProxy: overlap(r4Eps, pmEps1973), proxyEpisodeStarts: pmEps1973.map(e => e[0]) }
// 1973–2026 只用代用 M 的联合事件数（说明 1871–1934 的计数与 1973 后不可直接比）
const S1m = analyse('美国 1973–2026（只用代用 M，对照）', {
  months: m1, P: t => pm(t, K), Vpct: t => CAPE_PCT.get(t) ?? null,
  T: t => US.get(addM(t, -1))?.below === true && US.get(t)?.below === false, tier: t => US.get(t)?.tier ?? null,
})

// S2 美国 1871–1934：席勒月均价 + CAPE（1881 起）；恐慌只有代用 M；没有宏观档位
const m2 = range('1872-01', '1934-12')
const S2 = analyse('美国 1871–1934（CAPE + 席勒月均价；恐慌 = 代用 M）', {
  months: m2, P: t => pm(t, K), Vpct: t => CAPE_PCT.get(t) ?? null,
  T: t => belowMA(SP, addM(t, -1)) === true && belowMA(SP, t) === false, tier: null,
})

// S4 A 股：沪深 300（乐咕股债利差文件的指数列）2005-04 起；估值 = 股债利差高于扩张中位数（至少 24 个月）；恐慌 = 代用 D
const ebs = rd('public/data/equity-bond-spread.json').rows
const CSI = monthlyMean(ebs.map(([d, , c]) => [d, c]))
const ERP = monthlyMean(ebs.map(([d, s]) => [d, s]))
const RV_CN = realizedVolMonthly(ebs.map(([d, , c]) => [d, c]))
const m4 = range('2005-04', LAST)
const ERP_PCT = expandingPct(ERP, m4, 24)
const S4 = analyse('A 股 2005–2026（沪深 300；估值 = 股债利差；恐慌 = 代用 D）', {
  months: m4, P: proxyD(RV_CN, CSI), Vpct: t => (ERP_PCT.has(t) ? 1 - ERP_PCT.get(t) : null), // 利差越高越便宜，换成「贵的分位」
  T: t => belowMA(CSI, addM(t, -1)) === true && belowMA(CSI, t) === false, tier: null,
})
// 代用 D 在美国 1973–2026 的对照（日线已实现波动 + 6 个月下跌，不用利差、不用 VIX）
const usMonthlyPrice = new Map(rob.price)
const pdUS = proxyD(RV_US, usMonthlyPrice)
const pdEps = panicEpisodes(m1, pdUS)
const proxyDiagD = { proxyMonths: m1.filter(pdUS).length, proxyEpisodes: pdEps.length, r4CaughtByProxy: overlap(r4Eps, pdEps) }

// ---------- 输出（没有任何之后的收益） ----------
const out = { generatedBy: 'count.mjs', note: '只数事件次数；不含任何信号之后的收益、回撤或绩效。', capeCheck, proxyDiagM, proxyDiagD, samples: [S1, S3, S2, S1m, S4] }
writeFileSync(new URL('./counts.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')

console.log('CAPE 核对（自算 vs Multpl）', capeCheck)
console.log('代用 M', proxyDiagM)
console.log('代用 D（美国 1973–2026 对照）', proxyDiagD)
for (const S of out.samples) {
  console.log(`\n== ${S.name} ${S.range.join('–')}`)
  console.log(`恐慌月 ${S.panicMonths}，恐慌段 ${S.panicEpisodes.length}，重新站上均线 ${S.recrosses} 次，估值偏低月份占比 ${(S.vMonthsShare * 100).toFixed(0)}%`)
  for (const e of S.panicEpisodes) console.log(`  恐慌段 ${e.start}→${e.end}（${e.months}月）估值分位 ${fmtPct(e.capePctAtStart)} 段内曾<50 ${e.anyVinEpisode ? '是' : '否'} 档位 ${e.tierAtStart ?? '—'} | 6 月内站回 ${e.firstRecrossWithin6 ?? '无'} 分位 ${fmtPct(e.capePctAtRecross)} 档位 ${e.tierAtRecross ?? '—'}`)
  console.log('  计数表', Object.entries(S.grid).map(([k, v]) => `${k}: ${v.events}${v.defense != null ? `（防守 ${v.defense}）` : ''}`).join(' | '))
  console.log('  主口径事件', S.primary.map(e => `${e.date}[分位${fmtPct(e.capePct)} 档位${e.tier ?? '—'} 防守还剩${e.defenseRun ?? '—'}月 恐慌${e.panic.join(',')}]`).join('；') || '无')
  console.log('  无估值条件 W=6', S.noV6.map(e => `${e.date}[分位${fmtPct(e.capePct)} ${e.tier ?? '—'} ${e.defenseRun ?? '—'}月]`).join('；') || '无')
}
