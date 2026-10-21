import type { LimitUpConcept } from '../../types'

/** 某板块在某个交易日的表现（只含当天有涨停股的板块） */
export type PlateDay = { change: number; count: number; codes: string[] }
export type PlateCell = { change: number; count: number; /** 昨日涨停股今日继续涨停的比例，0~1；缺昨日或昨日为空时为 null */ rate: number | null }
export type PlateRankRow = { name: string; cells: Array<PlateCell | null> }
export type PlateRanking = { dates: string[]; rows: PlateRankRow[] }

export const HOT_THRESHOLD_PCT = 1
const EXCLUDED = /ST|^其他$/i

/** 概念列表 → 按板块名索引的当日表现；去掉 ST 与「其他」 */
export function plateDaysOf(concepts: LimitUpConcept[]): Map<string, PlateDay> {
  const map = new Map<string, PlateDay>()
  for (const c of concepts) {
    const name = c.name.trim()
    if (!name || EXCLUDED.test(name)) continue
    map.set(name, { change: c.changePercent, count: c.stocks.length, codes: c.stocks.map(s => s.code) })
  }
  return map
}

/**
 * 近 N 个交易日板块矩阵。日期从新到旧；
 * 排序：从最近一天起逐日比较，该日涨幅 > 阈值的板块排前（同为热门时涨幅高者在前，仍相同则看更早一天）；
 * 连板率 = |今日涨停 ∩ 前一交易日涨停| / |前一交易日涨停|，前一交易日指列表里下一个更早的日期。
 */
export function buildPlateRanking(byDate: Record<string, Map<string, PlateDay>>, days: number, threshold = HOT_THRESHOLD_PCT): PlateRanking {
  const dates = Object.keys(byDate).filter(d => byDate[d]?.size).sort().reverse().slice(0, days)
  const names = new Set<string>()
  for (const d of dates) for (const n of byDate[d].keys()) names.add(n)
  const rows: PlateRankRow[] = [...names].map(name => ({
    name,
    cells: dates.map((d, i) => {
      const today = byDate[d].get(name)
      if (!today) return null
      const prev = dates[i + 1] ? byDate[dates[i + 1]].get(name) : undefined
      let rate: number | null = null
      if (prev && prev.codes.length) {
        const set = new Set(today.codes)
        rate = prev.codes.filter(c => set.has(c)).length / prev.codes.length
      }
      return { change: today.change, count: today.count, rate }
    }),
  }))
  const hot = (c: PlateCell | null) => c !== null && c.change > threshold
  rows.sort((a, b) => {
    for (let i = 0; i < dates.length; i++) {
      const ca = a.cells[i], cb = b.cells[i]
      if (hot(ca) && !hot(cb)) return -1
      if (!hot(ca) && hot(cb)) return 1
      if (hot(ca) && hot(cb) && ca!.change !== cb!.change) return cb!.change - ca!.change
    }
    return a.name.localeCompare(b.name, 'zh-CN')
  })
  return { dates, rows }
}
