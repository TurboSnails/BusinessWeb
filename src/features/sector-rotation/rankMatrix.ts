import type { SectorData } from './classify'

export type PlateRankRow = {
  name: string
  code: string
  /** 与 dates 一一对应；当天没有这个板块时为 null */
  changes: Array<number | null>
  hotDays: number
  sumChange: number
}
export type PlateRanking = { dates: string[]; rows: PlateRankRow[] }

export const HOT_THRESHOLD_PCT = 1
const EXCLUDED = /ST|^其他$/i

/** 近 N 日板块涨幅矩阵：日期从旧到新，按「涨幅 > 阈值」的天数降序，天数相同按区间累计涨幅降序 */
export function buildPlateRanking(byDate: Record<string, SectorData[]>, days: number, threshold = HOT_THRESHOLD_PCT): PlateRanking {
  const dates = Object.keys(byDate).filter(d => byDate[d]?.length).sort().slice(-days)
  const rows = new Map<string, PlateRankRow>()
  dates.forEach((date, col) => {
    for (const s of byDate[date]) {
      if (EXCLUDED.test(s.name)) continue
      const key = s.code || s.name
      let row = rows.get(key)
      if (!row) { row = { name: s.name, code: s.code, changes: dates.map(() => null), hotDays: 0, sumChange: 0 }; rows.set(key, row) }
      row.changes[col] = s.changePercent
      row.sumChange += s.changePercent
      if (s.changePercent > threshold) row.hotDays += 1
    }
  })
  return { dates, rows: [...rows.values()].sort((a, b) => b.hotDays - a.hotDays || b.sumChange - a.sumChange) }
}
