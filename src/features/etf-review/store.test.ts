import { describe, expect, it } from 'vitest'
import { addGroup, addItem, deleteGroup, emptyState, normalizeState, removeItem, renameGroup, upsertNote, notesOf } from './store'

const base = () => addItem(addGroup(emptyState(), '宽基'), '510300', '沪深300ETF', '宽基')
const note = (over = {}) => ({ code: '510300', date: '2026-10-20', premium: 0.1, sentiment: '冷静' as const, conclusion: '中性' as const, action: '观望' as const, risk: '', remark: '', ...over })

describe('etf-review store', () => {
  it('只接受 6 位代码且不重复添加', () => {
    const s = base()
    expect(addItem(s, '510300', 'x', '').items).toHaveLength(1)
    expect(addItem(s, '12345', 'x', '').items).toHaveLength(1)
    expect(addItem(s, '159915', '', '不存在的分组').items[1]).toEqual({ code: '159915', name: '159915', group: '' })
  })
  it('同一标的同一天的笔记保存即覆盖，按日期倒序', () => {
    let s = upsertNote(base(), note())
    s = upsertNote(s, note({ conclusion: '看多' }))
    s = upsertNote(s, note({ date: '2026-10-21' }))
    expect(s.notes).toHaveLength(2)
    expect(notesOf(s, '510300').map(n => n.date)).toEqual(['2026-10-21', '2026-10-20'])
    expect(notesOf(s, '510300')[1].conclusion).toBe('看多')
  })
  it('删除分组只清标签；重命名同步标的；删除标的连带笔记', () => {
    let s = renameGroup(base(), '宽基', '核心')
    expect(s.items[0].group).toBe('核心')
    s = deleteGroup(s, '核心')
    expect(s.items).toHaveLength(1)
    expect(s.items[0].group).toBe('')
    s = removeItem(upsertNote(s, note()), '510300')
    expect(s.items).toHaveLength(0)
    expect(s.notes).toHaveLength(0)
  })
  it('导入数据清洗：丢弃非法条目与孤儿笔记，未知枚举置空', () => {
    const s = normalizeState({ groups: ['A', 'A', ''], items: [{ code: '510300', name: 'n', group: 'A' }, { code: 'bad' }, { code: '510300' }],
      notes: [{ code: '510300', date: '2026-10-20', sentiment: '乱写', premium: 'x' }, { code: '999999', date: '2026-10-20' }, { code: '510300', date: 'bad' }] })
    expect(s.groups).toEqual(['A'])
    expect(s.items).toHaveLength(1)
    expect(s.notes).toHaveLength(1)
    expect(s.notes[0]).toMatchObject({ sentiment: null, premium: null })
    expect(normalizeState('垃圾')).toEqual(emptyState())
  })
})
