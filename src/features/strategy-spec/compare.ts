import type { SpecSection, StrategySpec } from './types'

export type SectionDiff = {
  id: string
  title: string
  status: 'same' | 'changed' | 'added' | 'removed'
  left: SpecSection | null
  right: SpecSection | null
}

/** 逐章对比：按章节 id 对齐；顺序以右侧（较新）版本为准，左侧独有的章节排在最后 */
export function compareSpecs(left: StrategySpec, right: StrategySpec): SectionDiff[] {
  const leftById = new Map(left.sections.map(section => [section.id, section]))
  const rightIds = new Set(right.sections.map(section => section.id))
  const diffs: SectionDiff[] = right.sections.map(section => {
    const before = leftById.get(section.id) ?? null
    const status = before == null ? 'added'
      : JSON.stringify(before) === JSON.stringify(section) ? 'same' : 'changed'
    return { id: section.id, title: section.title, status, left: before, right: section }
  })
  for (const section of left.sections) {
    if (!rightIds.has(section.id)) {
      diffs.push({ id: section.id, title: section.title, status: 'removed', left: section, right: null })
    }
  }
  return diffs
}

/** 解析 ?compare=1.0.0..1.1.0 */
export function parseCompare(value: string | null): [string, string] | null {
  if (!value) return null
  const parts = value.split('..').map(part => part.trim().replace(/^v/i, ''))
  return parts.length === 2 && parts[0] && parts[1] ? [parts[0], parts[1]] : null
}
