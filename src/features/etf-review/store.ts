export const ETF_REVIEW_KEY = 'businessweb.etf-review.v1'

export const SENTIMENTS = ['冷静', '犹豫', 'FOMO', '恐慌'] as const
export const CONCLUSIONS = ['看多', '中性', '看空'] as const
export const ACTIONS = ['加仓', '减仓', '观望', '调参'] as const
export type Sentiment = (typeof SENTIMENTS)[number]
export type Conclusion = (typeof CONCLUSIONS)[number]
export type Action = (typeof ACTIONS)[number]

export type WatchItem = { code: string; name: string; group: string }
export type DailyNote = {
  id: string; code: string; date: string
  premium: number | null; sentiment: Sentiment | null; conclusion: Conclusion | null; action: Action | null
  risk: string; remark: string; updatedAt: string
}
export type ReviewState = { version: 1; groups: string[]; items: WatchItem[]; notes: DailyNote[] }

export const emptyState = (): ReviewState => ({ version: 1, groups: [], items: [], notes: [] })

const isCode = (code: unknown): code is string => typeof code === 'string' && /^\d{6}$/.test(code)
const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null => (list as readonly string[]).includes(value as string) ? (value as T) : null
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '')

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
    const group = text(o.group, 20).trim()
    items.push({ code: o.code, name: text(o.name, 40).trim() || o.code, group: groups.includes(group) ? group : '' })
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
  return { version: 1, groups, items, notes }
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
  ({ ...state, items: state.items.map(i => i.code === code ? { ...i, group: state.groups.includes(group) ? group : '' } : i) })

export function addGroup(state: ReviewState, name: string): ReviewState {
  const n = name.trim().slice(0, 20)
  return !n || state.groups.includes(n) ? state : { ...state, groups: [...state.groups, n] }
}
export function renameGroup(state: ReviewState, from: string, to: string): ReviewState {
  const n = to.trim().slice(0, 20)
  if (!n || n === from || state.groups.includes(n) || !state.groups.includes(from)) return state
  return { ...state, groups: state.groups.map(g => g === from ? n : g), items: state.items.map(i => i.group === from ? { ...i, group: n } : i) }
}
/** 删除分组只移除标签，标的与笔记保留 */
export const deleteGroup = (state: ReviewState, name: string): ReviewState =>
  ({ ...state, groups: state.groups.filter(g => g !== name), items: state.items.map(i => i.group === name ? { ...i, group: '' } : i) })

/** 同一标的同一天只保留一条笔记，再次保存即覆盖 */
export function upsertNote(state: ReviewState, note: Omit<DailyNote, 'id' | 'updatedAt'>, now = new Date()): ReviewState {
  if (!state.items.some(i => i.code === note.code)) return state
  const rest = state.notes.filter(n => !(n.code === note.code && n.date === note.date))
  return { ...state, notes: [...rest, { ...note, id: `${note.code}|${note.date}`, updatedAt: now.toISOString() }] }
}
export const deleteNote = (state: ReviewState, id: string): ReviewState => ({ ...state, notes: state.notes.filter(n => n.id !== id) })
export const notesOf = (state: ReviewState, code: string): DailyNote[] =>
  state.notes.filter(n => n.code === code).sort((a, b) => b.date.localeCompare(a.date))
