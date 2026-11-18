// 今天几星 · 阀值表：从估值表行推导低估线 / 高估线与距线距离（纯函数，无网络）。
// 低估线 / 高估线 = 近 10 年窗口内判定指标（PE 或行业 PB）的 30% / 70% 分位对应值（与估值表 peRefs/pbRefs 同源）。

/** 阀值线最少样本：与估值表 PB/PE 门槛一致。 */
export const SAMPLE_MIN = 250

/** 分位线取值：与 jixing-table-lib buildRow 的 refsOf 一致。 */
export function quantileLine(sortedAsc, p) {
  if (!Array.isArray(sortedAsc) || !sortedAsc.length || !(p > 0 && p <= 1)) return null
  const idx = Math.ceil(p * sortedAsc.length) - 1
  const v = sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, idx))]
  return Number.isFinite(v) ? v : null
}

/** 样本 ≥ SAMPLE_MIN 且 since→asOf 至少满 1 年（365 天）。 */
export function sampleEnough(count, since, asOf) {
  if (!(count >= SAMPLE_MIN) || typeof since !== 'string' || typeof asOf !== 'string') return false
  const t0 = Date.parse(`${since}T00:00:00Z`)
  const t1 = Date.parse(`${asOf}T00:00:00Z`)
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return false
  return (t1 - t0) / 864e5 >= 365
}

/**
 * 距低估线比例 = 低估线 / 当前 − 1。
 * 已低估（当前 ≤ 低估线）返回 { already: true, pct: null }；否则 { already: false, pct }。
 */
export function distToLow(current, lowLine) {
  if (!(current > 0) || !(lowLine > 0)) return { already: false, pct: null }
  if (current <= lowLine) return { already: true, pct: null }
  return { already: false, pct: lowLine / current - 1 }
}

/**
 * 距高估线比例 = 高估线 / 当前 − 1。
 * 已高估（当前 ≥ 高估线）返回 { already: true, pct: null }。
 */
export function distToHigh(current, highLine) {
  if (!(current > 0) || !(highLine > 0)) return { already: false, pct: null }
  if (current >= highLine) return { already: true, pct: null }
  return { already: false, pct: highLine / current - 1 }
}

/** 从估值表单行生成阀值行；current 缺失则跳过（返回 null）。样本不足或退化线 → 线/距线 null。 */
export function buildThresholdRow(row) {
  if (!row || typeof row !== 'object') return null
  const basis = row.basis === 'pb' ? 'pb' : 'pe'
  const current = basis === 'pb' ? row.pb : row.pe
  const pct = basis === 'pb' ? row.pbPct : row.pePct
  const refs = basis === 'pb' ? row.pbRefs : row.peRefs
  const history = basis === 'pb' ? row.pbHistory : row.peHistory
  if (!(current > 0)) return null
  const sampleCount = history?.count ?? 0
  const sampleSince = history?.since ?? null
  const asOf = row.date
  const enough = sampleEnough(sampleCount, sampleSince, asOf)
  const lowRaw = Array.isArray(refs) && refs.length === 2 ? refs[0] : null
  const highRaw = Array.isArray(refs) && refs.length === 2 ? refs[1] : null
  // 样本不足，或 low===high（单点/退化分布）→ 不给线，也不判「已低估/已高估」
  const linesOk = enough && lowRaw > 0 && highRaw > 0 && lowRaw < highRaw
  const lowLine = linesOk ? lowRaw : null
  const highLine = linesOk ? highRaw : null
  const low = linesOk ? distToLow(current, lowLine) : { already: false, pct: null }
  const high = linesOk ? distToHigh(current, highLine) : { already: false, pct: null }
  // 双保险：即便 linesOk，也不允许两侧同时 already（相等线已在 linesOk 排除）
  let alreadyLow = low.already
  let alreadyHigh = high.already
  if (alreadyLow && alreadyHigh) {
    alreadyLow = false
    alreadyHigh = false
  }
  return {
    code: row.code,
    name: row.name,
    group: row.group,
    basis,
    current,
    lowLine,
    highLine,
    pct: Number.isFinite(pct) ? pct : null,
    distLowPct: low.pct,
    alreadyLow,
    distHighPct: high.pct,
    alreadyHigh,
    status: row.status ?? null,
    sampleCount,
    sampleSince,
    date: asOf,
    basisLabel: basis === 'pb'
      ? (row.pbIndustry ? `行业 PB（${row.pbIndustry.name}）` : 'PB')
      : '滚动市盈率',
  }
}

export function buildThresholdData(table) {
  if (!table?.asOf || !Array.isArray(table.rows)) return null
  const rows = table.rows.map(buildThresholdRow).filter(Boolean)
  if (!rows.length) return null
  return {
    version: 1,
    asOf: table.asOf,
    generatedAt: new Date().toISOString(),
    sourceAsOf: table.asOf,
    rows,
    method: {
      lines: `低估线 / 高估线取近 10 年窗口内判定指标（PE 或行业 PB）样本升序后的 30% / 70% 分位对应值（ceil 取位，与估值表参考线同源）。样本数 < ${SAMPLE_MIN} 或不满 1 年时线和距线均为空（页面标「样本不足」）。分位线随历史滚动窗口每天重算，不是固定常数。`,
      dist: '距低估线 % = 低估线 / 当前 − 1；当前已 ≤ 低估线则记「已低估」。距高估线 % = 高估线 / 当前 − 1；当前已 ≥ 高估线则记「已高估」。低估线与高估线相等时不判两侧「已」。',
      status: '估值状态与估值表一致：百分位 < 30% 低估，> 70% 高估，其余正常；样本不足时状态为空。',
    },
    sources: table.sources ?? [],
  }
}
