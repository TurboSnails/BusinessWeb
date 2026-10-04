import React from 'react'
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DailyInbox from './DailyInbox'
import type { KnowledgeApi, Note } from './api'

afterEach(() => { cleanup(); sessionStorage.clear() })
it('旧 Vault 的读取响应到达前已离开，不继续追加，也不回调新页面', async () => {
  let finish!: (note: Note) => void
  const read = new Promise<Note>(resolve => { finish = resolve })
  const inbox = vi.fn()
  const onSaved = vi.fn(), onError = vi.fn()
  const client = { read: () => read, inbox } as unknown as KnowledgeApi
  const page = render(<DailyInbox api={client} vaultKey="A" vaultId={'a'.repeat(64)} onSaved={onSaved} onError={onError} />)
  fireEvent.change(screen.getByLabelText('每日 Inbox'), { target: { value: 'A 的草稿' } })
  fireEvent.click(screen.getByRole('button', { name: '记入 Inbox' }))
  page.unmount()
  await act(async () => { finish({ path: '00-Inbox/today.md', title: 'today', content: '', version: 'b'.repeat(64), vaultId: 'a'.repeat(64) }) })
  expect(inbox).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledTimes(1)
})
it('旧 Vault 的写入响应到达后不更新已切换页面', async () => {
  let finish!: (note: Note) => void
  const response = new Promise<Note>(resolve => { finish = resolve })
  const inbox = vi.fn(() => response)
  const client = { read: async () => ({ version: 'b'.repeat(64) }), inbox } as unknown as KnowledgeApi
  const onSaved = vi.fn(), onError = vi.fn()
  const page = render(<DailyInbox api={client} vaultKey="A" vaultId={'a'.repeat(64)} onSaved={onSaved} onError={onError} />)
  fireEvent.change(screen.getByLabelText('每日 Inbox'), { target: { value: 'A 的想法' } })
  fireEvent.click(screen.getByRole('button', { name: '记入 Inbox' }))
  await act(async () => { await Promise.resolve() })
  expect(inbox).toHaveBeenCalled()
  page.unmount()
  await act(async () => { finish({ path: '00-Inbox/today.md', title: 'today', content: 'old', version: 'c'.repeat(64), vaultId: 'a'.repeat(64) }) })
  expect(onSaved).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledTimes(1)
})
