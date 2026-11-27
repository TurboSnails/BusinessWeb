// 牛市后期预警影子读数：只记录、不操作。定义与 docs/research/late-cycle-warning-2026-11-26（L-023 至 L-025）相同，
// 那里的历史检验都没通过；这里把每月读数冻结下来，等真实行情检验它是否在高点之前亮过。
// 每个完整月份在所需数据齐全后冻结一行，冻结后不再改动；当月只给预估。

export const SHADOW_SINCE = '2026-11'
export const INDUSTRIES = ['Agric', 'Food', 'Soda', 'Beer', 'Smoke', 'Toys', 'Fun', 'Books', 'Hshld', 'Clths', 'Hlth', 'MedEq', 'Drugs', 'Chems', 'Rubbr', 'Txtls', 'BldMt', 'Cnstr', 'Steel', 'FabPr', 'Mach', 'ElcEq', 'Autos', 'Aero', 'Ships', 'Guns', 'Gold', 'Mines', 'Coal', 'Oil', 'Util', 'Telcm', 'PerSv', 'BusSv', 'Hardw', 'Softw', 'Chips', 'LabEq', 'Paper', 'Boxes', 'Trans', 'Whlsl', 'Rtail', 'Meals', 'Banks', 'Insur', 'RlEst', 'Fin', 'Other']
const DEFENSIVE = ['Food', 'Soda', 'Beer', 'Smoke', 'Hshld', 'Hlth', 'MedEq', 'Drugs', 'Util'].map(n => INDUSTRIES.indexOf(n))
// 超过这么多个月仍有缺项，就带着缺项冻结，避免永远留空
const FREEZE_ANYWAY_AFTER = 3

export const RULE = 'G 宏观非防守；H 雷达偏热；C1 Baa−Aaa 半年扩大 ≥ 0.10；C2 VIX 当月均值比前 6 个月均值高 ≥ 10%；'
  + 'C3 标普距 12 个月高点 5% 以内且新高行业占比 ≤ 近 12 个可得值最高的一半；C4 防守九行业近 3 个月跑赢 49 行业等权 ≥ 3 个百分点；'
  + 'C5 标普 6 个月涨幅 ≤ 2%；C5′ 2 个月涨幅 ≤ 0。W1 = G 且 H 且 C1–C5 ≥ 3。'
  + '另记 L-027 C2：月均价低于含当月 10 个月均线时档位最高到偏防守（只记录）。'

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const round = (x, digits = 4) => (x == null ? null : Math.round(x * 10 ** digits) / 10 ** digits)
export const monthAfter = (m, k) => { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }

/** L-022 / r4-episodes：利差半年扩大 ≥ 0.20 且 VIX 趋势 ≥ +20% */
export const PANIC_BAA_MIN = 0.20
export const PANIC_VOL_MIN = 0.20
/** CAPE 历史分位起点（market-radar shillerCape 样本自 1900-01） */
export const CAPE_PERCENTILE_SINCE = '1900-01'

/** [[日期, 值], ...] → Map(月 → 月均值) */
export function monthlyMean(rows) {
  const g = new Map()
  for (const [d, v] of rows) if (Number.isFinite(v)) { const m = d.slice(0, 7); if (!g.has(m)) g.set(m, []); g.get(m).push(v) }
  return new Map([...g].map(([m, a]) => [m, mean(a)]))
}
/** [[日期, 收盘], ...] 升序 → Map(月 → 当月最后一个收盘) */
export function lastByMonth(rows) { const m = new Map(); for (const [d, v] of rows) if (Number.isFinite(v)) m.set(d.slice(0, 7), v); return m }

/** CAPE 历史序列 → Map(月 → 值)；只保留 CAPE_PERCENTILE_SINCE 起的正值。 */
export function capeByMonth(rows) {
  const m = new Map()
  for (const [d, v] of rows ?? []) {
    if (!Number.isFinite(v) || v <= 0) continue
    const month = d.slice(0, 7)
    if (month < CAPE_PERCENTILE_SINCE) continue
    m.set(month, v)
  }
  return m
}

/**
 * 当月 CAPE 及其历史分位：只用当月及以前的样本（与 panel.mjs percentile 同式，无未来数据）。
 * cape：Map(月 → CAPE)。缺当月或样本不足 2 点时返回 null。
 */
export function capePercentileAt(t, cape) {
  const value = cape?.get(t)
  if (value == null || Number.isNaN(value)) return { cape: null, percentile: null }
  const sample = [...cape.entries()].filter(([m]) => m <= t).map(([, v]) => v)
  if (sample.length < 2) return { cape: value, percentile: null }
  const below = sample.filter(x => x < value).length
  const equal = sample.filter(x => x === value).length
  return { cape: value, percentile: (below + equal / 2) / sample.length * 100 }
}

/**
 * r4-episodes / L-022 恐慌极值：Baa−Aaa 半年变化与 VIX 月均相对前 6 个月均值。
 * 与 readingFor 的 C1/C2 同源；阈值 0.20 / 0.20（C1/C2 影子裂缝仍用 0.10）。
 */
export function panicReading(t, { baa, vix }) {
  const baaChange = baa?.get(t) ?? null
  const prior = [1, 2, 3, 4, 5, 6].map(k => vix?.get(monthAfter(t, -k)))
  const volTrend = vix?.has(t) && prior.every(x => x != null) ? vix.get(t) / mean(prior) - 1 : null
  const hit = baaChange == null || volTrend == null ? null : baaChange >= PANIC_BAA_MIN && volTrend >= PANIC_VOL_MIN
  return { baaChange: round(baaChange, 2), volTrend: round(volTrend), hit }
}

/**
 * 某月的读数。inputs：
 * - tier、heat：该月宏观攻守档位与雷达冷热
 * - baa：Map(月 → Baa−Aaa 半年变化)
 * - vix：Map(月 → VIX 月均)
 * - close：Map(月 → 月末收盘)；当月为最新收盘
 * - highs：Map(月 → 49 行业中处于 12 个月新高的占比 %)
 * - industry：Map(月 → 49 行业月收益 %)
 * - avgPrice：Map(月 → 标普日收盘月均价)，用于 L-027 C2 破位封顶的影子读数
 * - cape：Map(月 → CAPE)，来自 market-radar shillerCape（1900-01 起）
 */
export function readingFor(t, { tier, heat, baa, vix, close, highs, industry, avgPrice, cape }) {
  const missing = []
  const need = (name, v) => { if (v == null || Number.isNaN(v)) missing.push(name); return v ?? null }
  need('档位', tier); need('冷热', heat)
  const G = tier == null ? null : ['offense', 'lean-offense', 'neutral'].includes(tier)
  const H = heat == null ? null : heat === 'hot'

  const baaChange = need('C1 利差', baa.get(t))
  const prior = [1, 2, 3, 4, 5, 6].map(k => vix.get(monthAfter(t, -k)))
  const volTrend = need('C2 VIX', vix.has(t) && prior.every(x => x != null) ? vix.get(t) / mean(prior) - 1 : null)

  const c0 = close.get(t)
  const past12 = Array.from({ length: 12 }, (_, k) => close.get(monthAfter(t, -k)))
  const hs = Array.from({ length: 12 }, (_, k) => highs.get(monthAfter(t, -2 - k)))
  const c3ok = past12.every(x => x != null) && hs.every(x => x != null)
  if (!c3ok) missing.push('C3 新高行业')
  const nearHigh = c3ok ? c0 / Math.max(...past12) : null

  const ew = (m, idx) => { const r = industry.get(m); if (!r) return null; const xs = (idx ?? r.map((_, i) => i)).map(i => r[i]).filter(v => v != null); return xs.length ? mean(xs) / 100 : null }
  const cum3 = idx => { let w = 1; for (let k = 2; k <= 4; k += 1) { const r = ew(monthAfter(t, -k), idx); if (r == null) return null; w *= 1 + r } return w - 1 }
  const def3 = cum3(DEFENSIVE); const all3 = cum3()
  const defRel3m = need('C4 防守轮动', def3 == null || all3 == null ? null : def3 - all3)

  const c6 = close.get(monthAfter(t, -6)); const c2 = close.get(monthAfter(t, -2))
  const spx6m = need('C5 6 个月涨幅', c0 != null && c6 != null ? c0 / c6 - 1 : null)
  const spx2m = c0 != null && c2 != null ? c0 / c2 - 1 : null

  const cracks = {
    C1: baaChange == null ? null : baaChange >= 0.10,
    C2: volTrend == null ? null : volTrend >= 0.10,
    C3: c3ok ? nearHigh >= 0.95 && hs[0] <= 0.5 * Math.max(...hs) : null,
    C4: defRel3m == null ? null : defRel3m >= 0.03,
    C5: spx6m == null ? null : spx6m <= 0.02,
    C5b: spx2m == null ? null : spx2m <= 0,
  }
  const cnt = ids => ids.filter(id => cracks[id] === true).length
  const counts = { n: cnt(['C1', 'C2', 'C3', 'C4', 'C5']), nA: cnt(['C1', 'C2', 'C3', 'C4']), nB: cnt(['C1', 'C2', 'C3', 'C4', 'C5b']), nD: cnt(['C1', 'C2', 'C4', 'C5']), nE: cnt(['C1', 'C2', 'C4']), nF: cnt(['C1', 'C2', 'C4', 'C5b']) }
  const flags = { W1: Boolean(G && H && counts.n >= 3), W2: Boolean(G && counts.n >= 3), B: Boolean(G && H && counts.nB >= 3) }
  // L-027 C2「破位封顶」（部分成立，只记录）：当月标普月均价低于含当月 10 个月均线时，档位最高到偏防守
  const avg = Array.from({ length: 10 }, (_, k) => avgPrice?.get(monthAfter(t, -k)))
  const trendBelow = avg.every(x => x != null) ? avg[0] < mean(avg) : null
  const TIERS = ['offense', 'lean-offense', 'neutral', 'lean-defense', 'defense']
  const ma10 = avg.every(x => x != null) ? mean(avg) : null
  const trendCap = {
    below: trendBelow,
    triggerPrice: avg.slice(1).every(x => x != null) ? round(mean(avg.slice(1)), 2) : null,
    monthAvg: avg[0] != null ? round(avg[0], 2) : null,
    c2Tier: tier == null || trendBelow == null ? null : trendBelow ? TIERS[Math.max(TIERS.indexOf(tier), 3)] : tier,
  }

  // 恐慌 + 估值 + 趋势：只记录。缺失只进 panicValueTrend.missing，不碰顶层 missing（冻结条件不变）。
  const panic = panicReading(t, { baa, vix })
  const { cape: capeValue, percentile: capePct } = capePercentileAt(t, cape ?? new Map())
  const pvtMissing = []
  if (panic.baaChange == null) pvtMissing.push('恐慌利差')
  if (panic.volTrend == null) pvtMissing.push('恐慌VIX')
  if (capeValue == null || Number.isNaN(capeValue)) pvtMissing.push('CAPE')
  else if (capePct == null) pvtMissing.push('CAPE分位')
  if (trendBelow == null) pvtMissing.push('趋势均线')
  const panicValueTrend = {
    panic,
    valuation: {
      cape: capeValue == null ? null : round(capeValue, 2),
      percentile: capePct == null ? null : round(capePct, 2),
      percentileSince: CAPE_PERCENTILE_SINCE,
      source: 'market-radar.shillerCape',
    },
    trend: {
      below: trendBelow,
      monthAvg: trendCap.monthAvg,
      ma10: ma10 == null ? null : round(ma10, 2),
      close: c0 == null ? null : round(c0, 2),
    },
    macroTier: tier ?? null,
    missing: pvtMissing,
  }

  return {
    month: t, tier: tier ?? null, heat: heat ?? null, G, H,
    values: { baaChange: round(baaChange, 2), volTrend: round(volTrend), nearHigh: round(nearHigh), highsLatest: c3ok ? round(hs[0], 1) : null, highsMax12: c3ok ? round(Math.max(...hs), 1) : null, defRel3m: round(defRel3m), spx6m: round(spx6m), spx2m: round(spx2m) },
    cracks, counts, flags, trendCap, panicValueTrend, missing,
  }
}

/**
 * 在已有记录上追加新的完整月份（不改已有行），并更新当月预估。
 * timeline：combined-strategy.json 的 timeline（d、macro、heat）；estimateTier：当月宏观攻守预估档位。
 */
export function buildShadow({ previous, timeline = [], estimateTier = null, series, today, generatedAt }) {
  const currentMonth = today.slice(0, 7)
  const byMonth = new Map(timeline.map(r => [r.d, r]))
  const rows = [...(previous?.rows ?? [])]
  const have = new Set(rows.map(r => r.month))
  for (let t = SHADOW_SINCE; t < currentMonth; t = monthAfter(t, 1)) {
    if (have.has(t)) continue
    const tl = byMonth.get(t)
    const r = readingFor(t, { tier: tl?.macro, heat: tl?.heat, ...series })
    const overdue = monthAfter(t, FREEZE_ANYWAY_AFTER) <= currentMonth
    if (r.missing.length && !overdue) continue
    rows.push({ ...r, frozenAt: today })
  }
  rows.sort((a, b) => a.month.localeCompare(b.month))
  const current = readingFor(currentMonth, { tier: estimateTier, heat: timeline.at(-1)?.heat ?? null, ...series })
  return {
    generatedAt, rule: RULE, since: SHADOW_SINCE,
    note: '影子读数：只记录、不操作。L-023 至 L-025 的历史检验都没通过（裂缝多在回调开始后才出现），这里只为在真实行情里检验它亮在高点之前还是之后；现行仓位仍按宏观攻守执行。完整月份在数据齐全后冻结，之后不再改动。',
    current: { ...current, estimate: true, heatFrom: timeline.at(-1)?.d ?? null },
    rows,
  }
}

/** 比较用：旧行若无 panicValueTrend，则忽略新行同名字段（不回填、缺新字段不算改写）。 */
function freezeKey(row, baseline) {
  if (baseline && !('panicValueTrend' in baseline) && row && 'panicValueTrend' in row) {
    const { panicValueTrend: _, ...rest } = row
    return JSON.stringify(rest)
  }
  return JSON.stringify(row)
}

/** 已冻结的行不能改、不能删：返回违规的月份列表。旧行缺 panicValueTrend 时，新行多出该字段不算改写。 */
export function frozenViolations(previous, next) {
  const after = new Map((next?.rows ?? []).map(r => [r.month, r]))
  return (previous?.rows ?? []).filter(r => {
    const n = after.get(r.month)
    if (n == null) return true
    return freezeKey(n, r) !== freezeKey(r, r)
  }).map(r => r.month)
}
