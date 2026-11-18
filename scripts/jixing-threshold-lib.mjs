// 今天几星 · 阀值表：从估值表行推导低估线 / 高估线与距线距离（纯函数，无网络）。
// 低估线 / 高估线 = 近 10 年窗口内判定指标（PE 或行业 PB）的 30% / 70% 分位对应值（与估值表 peRefs/pbRefs 同源）。

/** 分位线取值：与 jixing-table-lib buildRow 的 refsOf 一致。 */
export function quantileLine(sortedAsc, p) {
  if (!Array.isArray(sortedAsc) || !sortedAsc.length || !(p > 0 && p <= 1)) return null
  const idx = Math.ceil(p * sortedAsc.length) - 1
  const v = sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, idx))]
  return Number.isFinite(v) ? v : null
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

/** 从估值表单行生成阀值行；refs 缺失则跳过该行（返回 null）。 */
export function buildThresholdRow(row) {
  if (!row || typeof row !== 'object') return null
  const basis = row.basis === 'pb' ? 'pb' : 'pe'
  const current = basis === 'pb' ? row.pb : row.pe
  const pct = basis === 'pb' ? row.pbPct : row.pePct
  const refs = basis === 'pb' ? row.pbRefs : row.peRefs
  const history = basis === 'pb' ? row.pbHistory : row.peHistory
  if (!(current > 0) || !Array.isArray(refs) || refs.length !== 2) return null
  const [lowLine, highLine] = refs
  if (!(lowLine > 0) || !(highLine > 0) || lowLine > highLine) return null
  const low = distToLow(current, lowLine)
  const high = distToHigh(current, highLine)
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
    alreadyLow: low.already,
    distHighPct: high.pct,
    alreadyHigh: high.already,
    status: row.status ?? null,
    sampleCount: history?.count ?? 0,
    sampleSince: history?.since ?? null,
    date: row.date,
    basisLabel: basis === 'pb'
      ? (row.pbIndustry ? `行业 PB（${row.pbIndustry.name}）` : 'PB')
      : 'PE(TTM)',
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
      lines: '低估线 / 高估线取近 10 年窗口内判定指标（PE 或行业 PB）样本升序后的 30% / 70% 分位对应值（ceil 取位，与估值表参考线同源）。分位线随历史滚动窗口每天重算，不是固定常数。',
      dist: '距低估线 % = 低估线 / 当前 − 1；当前已 ≤ 低估线则记「已低估」。距高估线 % = 高估线 / 当前 − 1；当前已 ≥ 高估线则记「已高估」。',
      status: '估值状态与估值表一致：百分位 < 30% 低估，> 70% 高估，其余正常。',
    },
    sources: table.sources ?? [],
  }
}
