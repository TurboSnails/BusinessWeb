import type { Company } from './companies'
import { CN_SECTOR_BOOKLET_BY_CODE, type CnSectorBookletId } from './details/cnSectorBookletIndex'

type ResearchMap = Record<string, Partial<Company>>
type Apply = (company: Company) => Company

const DIRECTORY: Record<CnSectorBookletId, string> = {
  chem: 'cn-chem-goldman-2026-10-07',
  finance: 'cn-finance-property-industrial-2026-10-07',
  four: 'cn-four-sectors-2026-10-07',
  sectors: 'cn-sectors-2026-10-07',
}

/** 查找优先级：化工/高盛 → 金融地产工业 → 四板块 → 产业分类 */
const PRIORITY: readonly CnSectorBookletId[] = ['chem', 'finance', 'four', 'sectors']

const LOADERS: Record<CnSectorBookletId, () => Promise<ResearchMap>> = {
  chem: () => import('./details/cnChemGoldmanResearch').then(m => m.cnChemGoldmanResearch),
  finance: () => import('./details/cnFinancePropertyIndustrialResearch').then(m => m.cnFinancePropertyIndustrialResearch),
  four: () => import('./details/cnFourSectorResearch').then(m => m.cnFourSectorResearch),
  sectors: () => import('./details/cnSectorResearch').then(m => m.cnSectorResearch),
}

const bookletCache = new Map<CnSectorBookletId, Promise<ResearchMap>>()

const loadBooklet = (id: CnSectorBookletId): Promise<ResearchMap> => {
  let p = bookletCache.get(id)
  if (!p) {
    p = LOADERS[id]()
    bookletCache.set(id, p)
    p.catch(() => { if (bookletCache.get(id) === p) bookletCache.delete(id) })
  }
  return p
}

const bookletsFor = (codes?: readonly string[]): CnSectorBookletId[] => {
  if (!codes) return [...PRIORITY]
  const need = new Set<CnSectorBookletId>()
  for (const code of codes) {
    const id = CN_SECTOR_BOOKLET_BY_CODE[code]
    if (id) need.add(id)
  }
  return PRIORITY.filter(id => need.has(id))
}

const applyFrom = (byId: Partial<Record<CnSectorBookletId, ResearchMap>>): Apply => company => {
  if (company.market !== 'cn') return company
  for (const id of PRIORITY) {
    const research = byId[id]?.[company.code]
    if (research) {
      return { ...company, ...research, researchReport: `research/${DIRECTORY[id]}/${company.code}.md` }
    }
  }
  return company
}

/**
 * 按需加载 A 股分板块研究分册。
 * - 不传 codes：公司库全量，拉齐四个分册
 * - 传入 codes：详情页只拉这些代码所属分册（无分册则零下载）
 */
export async function loadApplyCnSectorResearch(codes?: readonly string[]): Promise<Apply> {
  const ids = bookletsFor(codes)
  if (!ids.length) return company => company
  const loaded = await Promise.all(ids.map(async id => [id, await loadBooklet(id)] as const))
  return applyFrom(Object.fromEntries(loaded))
}
