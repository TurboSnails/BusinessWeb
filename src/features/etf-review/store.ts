import { CATALOG_GROUPS, type CatalogGroup, type CatalogId } from './catalog'

export const ETF_REVIEW_KEY = 'businessweb.etf-review.v1'

export const SENTIMENTS = ['冷静', '犹豫', 'FOMO', '恐慌'] as const
export const CONCLUSIONS = ['看多', '中性', '看空'] as const
export const ACTIONS = ['加仓', '减仓', '观望', '调参'] as const
export type Sentiment = (typeof SENTIMENTS)[number]
export type Conclusion = (typeof CONCLUSIONS)[number]
export type Action = (typeof ACTIONS)[number]

// group 保留为首个标签，兼容旧调用方；v2 的 groups 为完整多标签。
export type WatchItem = { code: string; name: string; group: string; groups?: string[] }
export type DailyNote = {
  id: string; code: string; date: string
  premium: number | null; sentiment: Sentiment | null; conclusion: Conclusion | null; action: Action | null
  risk: string; remark: string; updatedAt: string
}
type CatalogName = { name: string; customName?: true }
type CatalogNames = Partial<Record<CatalogId, CatalogName>>
export type ReviewState = { version: 1 | 2; groups: string[]; items: WatchItem[]; notes: DailyNote[]; catalogGroups?: CatalogNames }

export const emptyState = (): ReviewState => ({ version: 2, groups: [], items: [], notes: [] })
export const groupsOf = (item: WatchItem): string[] => item.groups ?? (item.group ? [item.group] : [])
const withGroups = (item: WatchItem, groups: string[]): WatchItem => ({ ...item, groups, group: groups[0] ?? '' })

const isCode = (code: unknown): code is string => typeof code === 'string' && /^\d{6}$/.test(code)
const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null => (list as readonly string[]).includes(value as string) ? (value as T) : null
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '')
const catalogMetadata = (catalogGroups: CatalogNames) => Object.keys(catalogGroups).length ? { catalogGroups } : {}

/** 读入或导入的数据一律经过这里清洗：丢弃非法条目，不信任字段类型 */
export function normalizeState(input: unknown): ReviewState {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const groups = [...new Set((Array.isArray(raw.groups) ? raw.groups : []).map(g => text(g, 20).trim()).filter(Boolean))]
  const seen = new Set<string>()
  const items: WatchItem[] = []
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    const o = it as Record<string, unknown>
    if (!isCode(o?.code) || seen.has(o.code)) continue
    seen.add(o.code)
    const tags = [...new Set((Array.isArray(o.groups) ? o.groups : [o.group]).map(g => text(g, 20).trim()).filter(g => groups.includes(g)))]
    items.push(withGroups({ code: o.code, name: text(o.name, 40).trim() || o.code, group: '' }, tags))
  }
  const notes: DailyNote[] = []
  const noteKeys = new Set<string>()
  for (const n of Array.isArray(raw.notes) ? raw.notes : []) {
    const o = n as Record<string, unknown>
    if (!isCode(o?.code) || !seen.has(o.code) || typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue
    const key = `${o.code}|${o.date}`
    if (noteKeys.has(key)) continue
    noteKeys.add(key)
    const premium = typeof o.premium === 'number' && Number.isFinite(o.premium) ? o.premium : null
    notes.push({
      id: text(o.id, 64) || key, code: o.code, date: o.date, premium,
      sentiment: oneOf(SENTIMENTS, o.sentiment), conclusion: oneOf(CONCLUSIONS, o.conclusion), action: oneOf(ACTIONS, o.action),
      risk: text(o.risk, 500), remark: text(o.remark, 2000), updatedAt: text(o.updatedAt, 40) || new Date(0).toISOString(),
    })
  }
  const catalogGroups: CatalogNames = {}
  const rawNames = raw.catalogGroups as Record<string, Record<string, unknown>> | undefined
  for (const def of CATALOG_GROUPS) {
    const entry = rawNames?.[def.id]
    const name = text(entry?.name, 20).trim()
    if (groups.includes(name)) catalogGroups[def.id] = entry?.customName === true && name !== def.name ? { name, customName: true } : { name }
  }
  return { version: 2, groups, items, notes, ...catalogMetadata(catalogGroups) }
}

export function loadState(): ReviewState {
  try {
    const raw = localStorage.getItem(ETF_REVIEW_KEY)
    return raw ? normalizeState(JSON.parse(raw)) : emptyState()
  } catch { return emptyState() }
}
/** 写入失败（隐私模式、配额）返回 false，由页面提示 */
export function saveState(state: ReviewState): boolean {
  try { localStorage.setItem(ETF_REVIEW_KEY, JSON.stringify(state)); return true } catch { return false }
}

export function addItem(state: ReviewState, code: string, name: string, group: string): ReviewState {
  const c = code.trim()
  if (!isCode(c) || state.items.some(i => i.code === c)) return state
  return { ...state, items: [...state.items, { code: c, name: name.trim() || c, group: state.groups.includes(group) ? group : '' }] }
}
export const removeItem = (state: ReviewState, code: string): ReviewState =>
  ({ ...state, items: state.items.filter(i => i.code !== code), notes: state.notes.filter(n => n.code !== code) })
export const setItemGroup = (state: ReviewState, code: string, group: string): ReviewState =>
  setItemGroups(state, code, group ? [group] : [])
export const setItemGroups = (state: ReviewState, code: string, groups: string[]): ReviewState =>
  ({ ...state, version: 2, items: state.items.map(i => i.code === code ? withGroups(i, [...new Set(groups.filter(g => state.groups.includes(g)))]) : i) })

export function addGroup(state: ReviewState, name: string): ReviewState {
  const n = name.trim().slice(0, 20)
  return !n || state.groups.includes(n) ? state : { ...state, groups: [...state.groups, n] }
}
export function renameGroup(state: ReviewState, from: string, to: string): ReviewState {
  const n = to.trim().slice(0, 20)
  if (!n || n === from || state.groups.includes(n) || !state.groups.includes(from)) return state
  const catalogGroups = { ...state.catalogGroups }
  const catalog = CATALOG_GROUPS.find(def => (catalogGroups[def.id]?.name ?? def.name) === from)
  if (catalog) catalogGroups[catalog.id] = n === catalog.name ? { name: n } : { name: n, customName: true }
  return { ...state, version: 2, groups: state.groups.map(g => g === from ? n : g), items: state.items.map(i => withGroups(i, groupsOf(i).map(g => g === from ? n : g))), ...catalogMetadata(catalogGroups) }
}
/** 删除分组只移除标签，标的与笔记保留 */
export function deleteGroup(state: ReviewState, name: string): ReviewState {
  const { catalogGroups, ...rest } = state
  const retained = Object.fromEntries(Object.entries(catalogGroups ?? {}).filter(([, entry]) => entry.name !== name))
  return { ...rest, version: 2, groups: state.groups.filter(g => g !== name), items: state.items.map(i => withGroups(i, groupsOf(i).filter(g => g !== name))), ...catalogMetadata(retained) }
}

/** 仅由用户确认加入清单时调用，合并标签并保留自选名称和笔记。 */
export function seedCatalogGroups(state: ReviewState, catalog: CatalogGroup[]): ReviewState {
  const catalogGroups = { ...state.catalogGroups }
  let groups = [...state.groups]
  const items = new Map(state.items.map(item => [item.code, item]))
  for (const group of catalog) {
    const stored = catalogGroups[group.id]
    const name = stored?.customName ? stored.name : group.name
    if (stored && stored.name !== name) {
      groups = groups.map(tag => tag === stored.name ? name : tag)
      for (const [code, item] of items) {
        items.set(code, withGroups(item, [...new Set(groupsOf(item).map(tag => tag === stored.name ? name : tag))]))
      }
    }
    if (!groups.includes(name)) groups.push(name)
    catalogGroups[group.id] = stored?.customName ? stored : { name }
    for (const entry of group.items) {
      const item = items.get(entry.code) ?? { code: entry.code, name: entry.name, group: '' }
      items.set(entry.code, withGroups(item, [...new Set([...groupsOf(item), name])]))
    }
  }
  return { ...state, version: 2, groups: [...new Set(groups)], items: [...items.values()], ...catalogMetadata(catalogGroups) }
}

/** 合并导入保留当前同日笔记、名称与标签，并补入新标的/标签；替换需由 UI 单独确认。 */
export function mergeReviewState(current: ReviewState, incoming: ReviewState): ReviewState {
  const aliases = new Map<string, string>()
  for (const def of CATALOG_GROUPS) {
    const retained = current.catalogGroups?.[def.id]
    const imported = incoming.catalogGroups?.[def.id]?.name ?? (incoming.groups.includes(def.name) ? def.name : undefined)
    if (retained && imported) aliases.set(imported, retained.name)
  }
  const importedTags = (tags: string[]) => tags.map(tag => aliases.get(tag) ?? tag)
  const groups = [...new Set([...current.groups, ...importedTags(incoming.groups)])]
  const items = new Map(current.items.map(i => [i.code, i]))
  for (const item of incoming.items) {
    const existing = items.get(item.code)
    items.set(item.code, withGroups(existing ?? item, [...new Set([
      ...(existing ? groupsOf(existing) : []), ...importedTags(groupsOf(item)),
    ])]))
  }
  const notes = new Map(incoming.notes.map(n => [`${n.code}|${n.date}`, n]))
  for (const n of current.notes) notes.set(`${n.code}|${n.date}`, n)
  return normalizeState({ version: 2, groups, items: [...items.values()], notes: [...notes.values()],
    catalogGroups: { ...incoming.catalogGroups, ...current.catalogGroups } })
}

/** 同一标的同一天只保留一条笔记，再次保存即覆盖 */
export function upsertNote(state: ReviewState, note: Omit<DailyNote, 'id' | 'updatedAt'>, now = new Date()): ReviewState {
  if (!state.items.some(i => i.code === note.code)) return state
  const rest = state.notes.filter(n => !(n.code === note.code && n.date === note.date))
  return { ...state, notes: [...rest, { ...note, id: `${note.code}|${note.date}`, updatedAt: now.toISOString() }] }
}
export const deleteNote = (state: ReviewState, id: string): ReviewState => ({ ...state, notes: state.notes.filter(n => n.id !== id) })
export const notesOf = (state: ReviewState, code: string): DailyNote[] =>
  state.notes.filter(n => n.code === code).sort((a, b) => b.date.localeCompare(a.date))
