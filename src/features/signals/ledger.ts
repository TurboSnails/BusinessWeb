// 信号台账：每周留存一期「当时的评级、价格、DCF 与雷达信号」，事后检验这些信号有没有用。
// 由 scripts/signal-ledger.mjs 在工作日行情刷新后写入 public/data/signal-ledger-YYYY.json；网页只读。
import { ratingBucket, type RatingBucket } from './companySignals'

export const RATING_CODES: RatingBucket[] = ['优先关注', '条件关注', '观察', '回避', '未估值']
export type Venue = 'cn' | 'hk' | 'us'
/** [价格, 评级档位下标|null, 自动 DCF 合理价|null, 买入参考价|null, 可信度 h/m/l|null, 雷达加分信号数（不在雷达为 -1）] */
export type LedgerRow = [number, number | null, number | null, number | null, 'h' | 'm' | 'l' | null, number]
export type Snapshot = Record<string, LedgerRow>
export interface Ledger { schemaVersion: 1; snapshots: Record<string, Snapshot> }

export interface SnapshotInput {
  companies: { venue: Venue; code: string; rating: string; price?: number }[]
  /** 自动 DCF 与预填库价格，键为 venue:CODE */
  dcf: Map<string, { current: number; fair: number | null; buyBelow: number | null; credibility: 'high' | 'medium' | 'low' | null }>
  /** 机会雷达：键为 venue:CODE，值为加分信号数 */
  radar: Map<string, number>
}

const key = (venue: Venue, code: string): string => `${venue}:${code.toUpperCase()}`
const round = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(6)))

export function buildSnapshot({ companies, dcf, radar }: SnapshotInput): Snapshot {
  const out: Snapshot = {}
  const ratings = new Map<string, number>()
  for (const c of companies) ratings.set(key(c.venue, c.code), RATING_CODES.indexOf(ratingBucket(c.rating)))
  const prices = new Map<string, number>()
  for (const c of companies) if (c.price && Number.isFinite(c.price)) prices.set(key(c.venue, c.code), c.price)
  for (const [k, d] of dcf) prices.set(k, d.current) // 预填库价格与 DCF 同一时点，优先使用
  for (const [k, price] of prices) {
    const d = dcf.get(k)
    out[k] = [round(price)!, ratings.get(k) ?? null, round(d?.fair), round(d?.buyBelow), d?.credibility ? (d.credibility[0] as 'h' | 'm' | 'l') : null, radar.get(k) ?? -1]
  }
  return out
}

/** ISO 周的周一日期，用来保证每周只留一期 */
export function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export function mergeSnapshot(ledger: Ledger | null, date: string, snapshot: Snapshot): Ledger {
  const snapshots = Object.fromEntries(Object.entries(ledger?.snapshots ?? {}).filter(([d]) => weekOf(d) !== weekOf(date)))
  snapshots[date] = snapshot
  return { schemaVersion: 1, snapshots: Object.fromEntries(Object.entries(snapshots).sort(([a], [b]) => a.localeCompare(b))) }
}

export function validLedger(value: unknown): value is Ledger {
  const v = value as Ledger | null
  return !!v && v.schemaVersion === 1 && !!v.snapshots && typeof v.snapshots === 'object'
    && Object.entries(v.snapshots).every(([d, s]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !!s && typeof s === 'object')
}

// ── 复盘 ──
export const REVIEW_RULES = { minDays: 28, minSample: 5 } as const
export type GroupId = `rating:${number}` | 'radar' | 'radar2' | 'below-buy'
export const GROUP_LABEL = (id: GroupId): string =>
  id === 'radar' ? '进入机会雷达' : id === 'radar2' ? '雷达三项共振' : id === 'below-buy' ? '低于 DCF 买入参考价' : `评级：${RATING_CODES[Number(id.split(':')[1])]}`

export interface GroupStat { id: GroupId; n: number; mean: number | null; excess: number | null; beatRate: number | null }
export interface VenueReview { venue: Venue; n: number; mean: number; groups: GroupStat[] }
export interface Review { from: string; to: string; days: number; venues: VenueReview[] }

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const days = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** 某期快照到最新一期：按市场分组，比较各信号组与同市场全部公司（等权）的收益 */
export function reviewFrom(ledger: Ledger, from: string, to: string): Review {
  const start = ledger.snapshots[from], end = ledger.snapshots[to]
  const venues: VenueReview[] = []
  for (const venue of ['cn', 'hk', 'us'] as Venue[]) {
    const rows: { r: LedgerRow; ret: number }[] = []
    for (const [k, r] of Object.entries(start)) {
      const later = end[k]
      if (!k.startsWith(`${venue}:`) || !later || !(r[0] > 0) || !(later[0] > 0)) continue
      rows.push({ r, ret: later[0] / r[0] - 1 })
    }
    if (!rows.length) continue
    const all = rows.map(x => x.ret), base = mean(all), mid = median(all)
    const ids: GroupId[] = [...RATING_CODES.slice(0, 4).map((_, i) => `rating:${i}` as GroupId), 'radar', 'radar2', 'below-buy']
    const pick = (id: GroupId) => rows.filter(({ r }) => id === 'radar' ? r[5] >= 0 : id === 'radar2' ? r[5] === 2 : id === 'below-buy' ? r[3] != null && r[0] <= r[3] : r[1] === Number(id.split(':')[1]))
    const groups = ids.map(id => {
      const g = pick(id).map(x => x.ret)
      const enough = g.length >= REVIEW_RULES.minSample
      return { id, n: g.length, mean: enough ? mean(g) : null, excess: enough ? mean(g) - base : null, beatRate: enough ? g.filter(x => x > mid).length / g.length : null }
    }).filter(g => g.n > 0)
    venues.push({ venue, n: rows.length, mean: base, groups })
  }
  return { from, to, days: days(from, to), venues }
}

/** 满 minDays 的各期复盘（最近的在前），以及台账概况 */
export function reviewLedger(ledger: Ledger): { first: string | null; latest: string | null; count: number; reviews: Review[] } {
  const dates = Object.keys(ledger.snapshots).sort()
  const latest = dates[dates.length - 1] ?? null
  const reviews = latest ? dates.filter(d => days(d, latest) >= REVIEW_RULES.minDays).reverse().map(d => reviewFrom(ledger, d, latest)) : []
  return { first: dates[0] ?? null, latest, count: dates.length, reviews }
}
