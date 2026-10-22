import { beforeEach, expect, it, vi } from 'vitest'
import { emptyDraft, loadDraft, saveDraft } from './draft'
beforeEach(() => localStorage.clear())
it('保存完整草稿并恢复，损坏的数据安全回退', () => {
  const draft = emptyDraft()
  draft.notes[0] = '经营证据'
  draft.multiples.evidence.pb = 'ROE与资产质量'
  expect(saveDraft(draft)).toBe(true)
  expect(loadDraft()).toEqual(draft)
  localStorage.setItem('businessweb.comprehensive-valuation.v1', JSON.stringify({ ...draft, multiples: { rows: null } }))
  expect(loadDraft()).toEqual(emptyDraft())
})
it('存储满时明确报告失败', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(saveDraft(emptyDraft())).toBe(false)
  vi.restoreAllMocks()
})
