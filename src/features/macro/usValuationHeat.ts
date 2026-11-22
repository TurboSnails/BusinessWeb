// 美股个股估值热力图的取数与布局：按 GICS 一级行业分组，面积 ∝ 市值，颜色 = Forward PE 分档。
// 布局复用板块资金热力图的 squarify（先切行业，再在行业内切个股）。
import { squarify, type Rect } from '../kpl-plates/model'
import type { Member } from './valuation'

export const SECTOR_ZH: Record<string, string> = {
  'Information Technology': '信息技术',
  'Communication Services': '通信服务',
  'Consumer Discretionary': '可选消费',
  'Consumer Staples': '必需消费',
  'Health Care': '医疗保健',
  Financials: '金融',
  Industrials: '工业',
  Energy: '能源',
  Materials: '原材料',
  Utilities: '公用事业',
  'Real Estate': '房地产',
}
export const sectorZh = (s: string): string => SECTOR_ZH[s] ?? s

/** Forward PE 分档：绿 = 便宜，红 = 贵（美股习惯，与 Finviz 一致）；亏损 / 无预期单独一档 */
export const PE_STEPS: Array<{ id: string; label: string }> = [
  { id: 'g3', label: '< 12x' }, { id: 'g2', label: '12–16x' }, { id: 'g1', label: '16–20x' }, { id: 'n', label: '20–25x' },
  { id: 'r1', label: '25–35x' }, { id: 'r2', label: '35–50x' }, { id: 'r3', label: '≥ 50x' }, { id: 'na', label: '亏损/无预期' },
]
export function peStep(fwd: number | null | undefined): string {
  if (fwd == null || !Number.isFinite(fwd) || fwd <= 0) return 'na'
  if (fwd < 12) return 'g3'
  if (fwd < 16) return 'g2'
  if (fwd < 20) return 'g1'
  if (fwd < 25) return 'n'
  if (fwd < 35) return 'r1'
  if (fwd < 50) return 'r2'
  return 'r3'
}

export interface SectorGroup {
  sector: string
  zh: string
  /** 十亿美元 */
  mcap: number
  /** 分组 PE：市值加权调和平均（总市值 ÷ 总盈利），亏损股不计；全部亏损为 null */
  fwd: number | null
  members: Member[]
}

export type PeField = 'fwd' | 'ttm'

/** 市值加权调和平均 PE，口径同 server/indexes.mjs 的 weightedPe；field 缺省为 Forward PE */
export function weightedFwd(rows: Member[], field: PeField = 'fwd'): number | null {
  const ok = rows.filter(r => r.mcap > 0 && r[field] != null && r[field]! > 0)
  if (!ok.length) return null
  return ok.reduce((a, r) => a + r.mcap, 0) / ok.reduce((a, r) => a + r.mcap / r[field]!, 0)
}

/** 有 PE 的成员的中位数 */
export function medianPe(rows: Member[], field: PeField = 'fwd'): number | null {
  const v = rows.map(r => r[field]).filter((x): x is number => x != null && x > 0).sort((a, b) => a - b)
  if (!v.length) return null
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
}

/** 按行业分组；没有市值的公司画不出面积，不计入；缺行业的归入「其他」 */
export function groupBySector(members: Member[], field: PeField = 'fwd'): SectorGroup[] {
  const map = new Map<string, Member[]>()
  for (const m of members) {
    if (!(m.mcap > 0)) continue
    const k = m.sector || '其他'
    map.set(k, [...(map.get(k) ?? []), m])
  }
  return [...map.entries()]
    .map(([sector, rows]) => {
      const sorted = [...rows].sort((a, b) => b.mcap - a.mcap)
      return { sector, zh: sector === '其他' ? '其他' : sectorZh(sector), mcap: sorted.reduce((a, r) => a + r.mcap, 0), fwd: weightedFwd(sorted, field), members: sorted }
    })
    .sort((a, b) => b.mcap - a.mcap)
}

export interface Tile { m: Member; sector: string; r: Rect }
export interface SectorBox { g: SectorGroup; r: Rect; head: boolean }

/** 两层布局：行业矩形顶部留 header 高的标题条（行业块太矮时不留），其余空间按个股市值切分 */
export function layoutHeat(groups: SectorGroup[], w: number, h: number, header = 18): { sectors: SectorBox[]; tiles: Tile[] } {
  const outer = squarify(groups.map(g => g.mcap), w, h)
  const sectors: SectorBox[] = []
  const tiles: Tile[] = []
  groups.forEach((g, i) => {
    const r = outer[i]
    const head = r.h > header * 2.5 && r.w > 48
    sectors.push({ g, r, head })
    const top = head ? header : 0
    const inner = squarify(g.members.map(m => m.mcap), r.w, r.h - top)
    g.members.forEach((m, j) => tiles.push({ m, sector: g.sector, r: { x: r.x + inner[j].x, y: r.y + top + inner[j].y, w: inner[j].w, h: inner[j].h } }))
  })
  return { sectors, tiles }
}
