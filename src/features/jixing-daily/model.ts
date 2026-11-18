export type DailyRow = {
  code: string
  name: string
  group: string
  close: number | null
  changePct: number | null
  pe: number | null
  pePct: number | null
  pb: number | null
  pbPct: number | null
  status: 'low' | 'normal' | 'high' | null
  peDelta: number | null
  pePctDelta: number | null
  pbDelta: number | null
  pbPctDelta: number | null
  statusPrev: 'low' | 'normal' | 'high' | null
}

export type JixingDailyReport = {
  version: 1
  asOf: string
  prevDate: string | null
  missingPrev: boolean
  star: number | null
  starPrev: number | null
  starChange: number | null
  counts: { low: number; normal: number; high: number }
  countsDelta: { low: number; normal: number; high: number } | null
  transitions: {
    enterLow: string[]
    exitLow: string[]
    enterHigh: string[]
    exitHigh: string[]
  }
  rows: DailyRow[]
  note: string | null
  truncated?: boolean
}

export type JixingDailyIndex = {
  version: 1
  generatedAt: string
  dates: string[]
  latest: JixingDailyReport
}

export const METHOD = {
  change: '涨跌幅、PE/PB 与百分位变化均相对「确切前一交易日」快照；缺前日数据时变化列为空，不拿更早日期顶替。',
  status: '进入 / 退出低估（或高估）= 今日处于该状态且昨日不在（或昨日在且今日不在）。估值状态口径与估值表相同。',
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const numOrNull = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isFinite(v))
const statusOk = (v: unknown): boolean => v === null || v === 'low' || v === 'normal' || v === 'high'

function isRow(v: unknown): v is DailyRow {
  if (!record(v) || typeof v.code !== 'string' || typeof v.name !== 'string') return false
  return numOrNull(v.close) && numOrNull(v.changePct) && numOrNull(v.pe) && numOrNull(v.pePct)
    && numOrNull(v.pb) && numOrNull(v.pbPct) && statusOk(v.status)
    && numOrNull(v.peDelta) && numOrNull(v.pePctDelta) && numOrNull(v.pbDelta) && numOrNull(v.pbPctDelta)
    && statusOk(v.statusPrev)
}

export function asJixingDailyReport(v: unknown): JixingDailyReport | null {
  if (!record(v) || v.version !== 1 || !date(v.asOf) || typeof v.missingPrev !== 'boolean') return null
  if (!(v.prevDate === null || date(v.prevDate))) return null
  if (!record(v.counts) || !Array.isArray(v.rows)) return null
  if (!v.rows.every(isRow)) return null
  if (!record(v.transitions)) return null
  return v as unknown as JixingDailyReport
}

export function asJixingDailyIndex(v: unknown): JixingDailyIndex | null {
  if (!record(v) || v.version !== 1 || !Array.isArray(v.dates) || !v.dates.every(date)) return null
  const latest = asJixingDailyReport(v.latest)
  if (!latest) return null
  return { version: 1, generatedAt: String(v.generatedAt ?? ''), dates: v.dates as string[], latest }
}

export const fmt = (v: number | null, d = 2): string => v === null ? '—' : v.toFixed(d)
export const fmtPctPts = (v: number | null): string => v === null ? '—' : `${(v * 100).toFixed(1)}pt`
export const signed = (v: number | null, d = 2): string => {
  if (v === null) return '—'
  const s = v.toFixed(d)
  return v > 0 ? `+${s}` : s
}
