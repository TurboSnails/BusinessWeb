// 今天几星 · 指数日报：纯函数（差异、进入/退出、缺前日为 null）。

/** 星级使用同一数据日。只有旧文档才允许使用原口径的当日 raw 快照。 */
export function resolveStar(starDoc, asOf, rawStar = null) {
  const valid = source => Number.isFinite(source?.star) && source.star >= 1 && source.star <= 5.9
  if (starDoc?.neutral != null) {
    const neutral = starDoc.neutral
    const star = neutral.asOf === asOf && valid(neutral) ? neutral.star : null
    return { star, starAsOf: neutral.asOf ?? null, starBasis: 'neutral' }
  }
  if (starDoc?.asOf === asOf && valid(starDoc)) {
    return { star: starDoc.star, starAsOf: asOf, starBasis: 'legacy' }
  }
  if (rawStar?.starBasis !== 'neutral' && valid(rawStar) && (rawStar.asOf == null || rawStar.asOf === asOf)) {
    return { star: rawStar.star, starAsOf: asOf, starBasis: 'legacy' }
  }
  return { star: null, starAsOf: starDoc?.asOf ?? null, starBasis: 'legacy' }
}

/** 状态集合差异：进入 = 今日有且昨日无；退出 = 昨日有且今日无。 */
export function enterExit(todayCodes, prevCodes) {
  const today = new Set(todayCodes ?? [])
  const prev = new Set(prevCodes ?? [])
  const entered = [...today].filter(c => !prev.has(c)).sort()
  const exited = [...prev].filter(c => !today.has(c)).sort()
  return { entered, exited }
}

export function codesByStatus(rows, status) {
  return (rows ?? []).filter(r => r.status === status).map(r => r.code)
}

/** 数值差：缺任一侧 → null（不拿更早日子顶替）。 */
export function delta(curr, prev) {
  if (curr === null || curr === undefined || prev === null || prev === undefined) return null
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null
  return curr - prev
}

/** 涨跌幅 %：两日收盘齐全才算。 */
export function changePct(close, prevClose) {
  if (!(close > 0) || !(prevClose > 0)) return null
  return (close / prevClose - 1) * 100
}

/**
 * 对比今日与前一交易日快照。
 * prev === null → 所有变化列为 null，并设 missingPrev=true。
 */
export function diffDaily(today, prev) {
  if (!today?.asOf) return null
  const missingPrev = !prev || prev.asOf == null
  const starBasis = today.starBasis ?? 'legacy'
  const sameStarBasis = !missingPrev && starBasis === (prev.starBasis ?? 'legacy')
  const prevByCode = new Map((prev?.rows ?? []).map(r => [r.code, r]))
  const rows = (today.rows ?? []).map(r => {
    const p = missingPrev ? null : prevByCode.get(r.code) ?? null
    return {
      code: r.code,
      name: r.name,
      group: r.group,
      close: r.close ?? null,
      changePct: missingPrev || !p ? null : changePct(r.close, p.close),
      pe: r.pe ?? null,
      pePct: r.pePct ?? null,
      pb: r.pb ?? null,
      pbPct: r.pbPct ?? null,
      status: r.status ?? null,
      peDelta: missingPrev || !p ? null : delta(r.pe, p.pe),
      pePctDelta: missingPrev || !p ? null : delta(r.pePct, p.pePct),
      pbDelta: missingPrev || !p ? null : delta(r.pb, p.pb),
      pbPctDelta: missingPrev || !p ? null : delta(r.pbPct, p.pbPct),
      statusPrev: missingPrev || !p ? null : (p.status ?? null),
    }
  })

  const count = (list, s) => list.filter(r => r.status === s).length
  const todayCounts = { low: count(today.rows ?? [], 'low'), normal: count(today.rows ?? [], 'normal'), high: count(today.rows ?? [], 'high') }
  const prevCounts = missingPrev ? null : {
    low: count(prev.rows ?? [], 'low'),
    normal: count(prev.rows ?? [], 'normal'),
    high: count(prev.rows ?? [], 'high'),
  }

  const transitions = missingPrev ? {
    enterLow: [], exitLow: [], enterHigh: [], exitHigh: [],
  } : {
    enterLow: enterExit(codesByStatus(today.rows, 'low'), codesByStatus(prev.rows, 'low')).entered,
    exitLow: enterExit(codesByStatus(today.rows, 'low'), codesByStatus(prev.rows, 'low')).exited,
    enterHigh: enterExit(codesByStatus(today.rows, 'high'), codesByStatus(prev.rows, 'high')).entered,
    exitHigh: enterExit(codesByStatus(today.rows, 'high'), codesByStatus(prev.rows, 'high')).exited,
  }

  return {
    asOf: today.asOf,
    prevDate: missingPrev ? null : prev.asOf,
    missingPrev,
    star: today.star ?? null,
    starBasis,
    starAsOf: today.starAsOf ?? null,
    starPrev: sameStarBasis ? (prev.star ?? null) : null,
    starChange: sameStarBasis ? delta(today.star, prev.star) : null,
    counts: todayCounts,
    countsDelta: missingPrev || !prevCounts ? null : {
      low: todayCounts.low - prevCounts.low,
      normal: todayCounts.normal - prevCounts.normal,
      high: todayCounts.high - prevCounts.high,
    },
    transitions,
    rows,
  }
}

/** 从估值表行 + 收盘价映射生成日报原始行。 */
export function snapshotRows(tableRows, closes) {
  return (tableRows ?? []).map(r => ({
    code: r.code,
    name: r.name,
    group: r.group,
    close: closes?.[r.code] ?? null,
    pe: r.pe ?? null,
    pePct: r.pePct ?? null,
    pb: r.pb ?? null,
    pbPct: r.pbPct ?? null,
    status: r.status ?? null,
  }))
}

/** 索引条目：最近 N 天。 */
export function buildIndex(entries, latest, keep = 30) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, keep)
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    dates: sorted.map(e => e.date),
    latest,
  }
}
