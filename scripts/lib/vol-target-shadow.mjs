// 波动率目标（VT3）影子读数：只记录、不操作。规则与 docs/research/vol-target-2026-11-25 的 VT3 相同：
// σ = 最近 20 个交易日标普价格对数收益的标准差 × √252；σ* = 1950 年以来全部 σ 的中位数；k = min(1, σ* ÷ σ)。
// 每个完整月份按最后一个交易日冻结一行，冻结后不再改动；当月只给预估。

export const SHADOW_SINCE = '2026-11'
export const RULE = 'VT3：k = min(1, 1950 年以来 20 日波动中位数 ÷ 最近 20 日波动)，按月末读数，次月第 3 个交易日按「档位仓位 × k」执行（仅影子记录）'

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sampleStd = xs => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) }

/** closes: [[日期, 收盘], ...] 升序。返回每个交易日的 { d, sigma, sigmaStar, k }（前 20 天无读数）。 */
export function volReadings(closes) {
  const out = []
  const sorted = []
  const insert = x => { let lo = 0; let hi = sorted.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (sorted[mid] < x) lo = mid + 1; else hi = mid } sorted.splice(lo, 0, x) }
  const lr = closes.map(([, c], i) => (i ? Math.log(c / closes[i - 1][1]) : null))
  for (let t = 20; t < closes.length; t += 1) {
    const sigma = sampleStd(lr.slice(t - 19, t + 1)) * Math.sqrt(252)
    insert(sigma)
    const n = sorted.length
    const sigmaStar = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    out.push({ d: closes[t][0], sigma, sigmaStar, k: Math.min(1, sigmaStar / sigma) })
  }
  return out
}

const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits

/**
 * 在已有记录上追加新完整月份（不改已有行），并更新当月预估。
 * - previous：已有文件内容（可为 null）
 * - closes：标普日收盘
 * - liveRows：macro-posture.json 的 backtest.live.rows（取月末正式档位）
 * - today：YYYY-MM-DD
 */
export function buildShadow({ previous, closes, liveRows = [], today, generatedAt }) {
  const readings = volReadings(closes)
  const byMonth = new Map()
  for (const r of readings) byMonth.set(r.d.slice(0, 7), r) // 每月最后一个交易日的读数
  const currentMonth = today.slice(0, 7)
  const rows = [...(previous?.rows ?? [])]
  const have = new Set(rows.map(r => r.month))
  const equity = { offense: 1, 'lean-offense': 0.85, neutral: 0.7, 'lean-defense': 0.5, defense: 0.3 }
  for (const [month, r] of [...byMonth].sort(([a], [b]) => a.localeCompare(b))) {
    if (month < SHADOW_SINCE || month >= currentMonth || have.has(month)) continue
    const live = liveRows.find(x => x.d === month && x.status === 'official')
    rows.push({
      month, lastDay: r.d, sigma: round(r.sigma), sigmaStar: round(r.sigmaStar), k: round(r.k),
      tier: live?.final ?? null,
      equityShare: live?.final ? round(equity[live.final] * r.k) : null,
      frozenAt: today,
    })
  }
  const latest = readings.at(-1)
  const estimateTier = liveRows.find(x => x.d === currentMonth)?.final ?? null
  return {
    generatedAt, rule: RULE, since: SHADOW_SINCE,
    note: '影子读数：只记录、不操作，用来在前推中检验波动率目标；现行仓位仍按宏观攻守执行。完整月份按最后一个交易日冻结，之后不再改动。',
    current: latest ? {
      date: latest.d, sigma: round(latest.sigma), sigmaStar: round(latest.sigmaStar), k: round(latest.k),
      tier: estimateTier, equityShare: estimateTier ? round(equity[estimateTier] * latest.k) : null,
    } : null,
    rows,
  }
}

/** 已冻结的行不能改、不能删：返回违规的月份列表。 */
export function frozenViolations(previous, next) {
  const after = new Map((next?.rows ?? []).map(r => [r.month, JSON.stringify(r)]))
  return (previous?.rows ?? []).filter(r => after.get(r.month) !== JSON.stringify(r)).map(r => r.month)
}
