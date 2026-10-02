import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CandidatePool from './CandidatePool'
import { useCandidates } from '../features/candidates/useCandidates'
import type { Company } from '../data/companies'

const TOKEN = 't'.repeat(32)
const company = (code: string, market: Company['market'] = 'us'): Company => ({ code, name: `公司${code}`, market, sector: 's', batch: 'b', rating: '观察', headline: `结论${code}`, metrics: [], thesis: [], risk: [], next: [], asOf: '' })
const companies = [company('A'), company('B'), company('C')]

function Harness(): JSX.Element {
  const c = useCandidates(true)
  return (
    <MemoryRouter>
      {companies.map(x => <button key={x.code} onClick={() => c.toggle(x.market, x.code)}>add-{x.code}</button>)}
      <CandidatePool items={c.items} companies={companies} state={c.state} message={c.message} onMove={c.move} onRemove={i => c.toggle(i.market, i.code)} onNote={(i, t) => c.setNote(i.market, i.code, t)} onClear={c.clear} onConnect={c.connect} onRetry={c.retry} />
    </MemoryRouter>
  )
}
const order = (): string[] => screen.queryAllByRole('row').slice(1).map(r => /公司(\w)/.exec(r.textContent ?? '')?.[1] ?? '')

describe('CandidatePool with cloud sync', () => {
  let cloud: { revision: number; items: unknown[] }
  let puts: unknown[]
  beforeEach(() => {
    localStorage.clear(); cloud = { revision: 0, items: [] }; puts = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      if (auth !== `Bearer ${TOKEN}`) return new Response(JSON.stringify({ error: '同步 token 无效' }), { status: 401 })
      if (init?.method === 'PUT') {
        const match = (init.headers as Record<string, string>)['If-Match']
        if (match !== `"${cloud.revision}"`) return new Response(JSON.stringify({ error: 'conflict' }), { status: 409 })
        cloud = { revision: cloud.revision + 1, items: JSON.parse(init.body as string).items }; puts.push(cloud.items)
        return new Response('{"ok":true}', { status: 200 })
      }
      return new Response(JSON.stringify({ schemaVersion: 1, items: cloud.items }), { status: 200, headers: { ETag: `"${cloud.revision}"` } })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('works locally before auth, then verifies once, uploads local items, reorders and syncs', async () => {
    render(<Harness />)
    expect(screen.getByText(/未验证身份/)).toBeTruthy()
    fireEvent.click(screen.getByText('add-A')); fireEvent.click(screen.getByText('add-B')); fireEvent.click(screen.getByText('add-C'))
    expect(order()).toEqual(['A', 'B', 'C'])

    fireEvent.change(screen.getByLabelText('同步 Token'), { target: { value: TOKEN } })
    fireEvent.click(screen.getByText('验证并同步'))
    await waitFor(() => expect(screen.getByText(/已同步到云端/)).toBeTruthy())
    expect(cloud.items).toHaveLength(3) // 本机项首次连接时补传
    expect(localStorage.getItem('rn-candidates-token')).toBe(TOKEN)

    fireEvent.click(screen.getByLabelText('置顶 C'))
    await waitFor(() => expect((cloud.items as { code: string }[]).map(i => i.code)).toEqual(['C', 'A', 'B']))
    fireEvent.click(screen.getByLabelText('下移 C'))
    await waitFor(() => expect((cloud.items as { code: string }[]).map(i => i.code)).toEqual(['A', 'C', 'B']))
    expect(order()).toEqual(['A', 'C', 'B'])
    fireEvent.click(screen.getByLabelText('移除 C'))
    await waitFor(() => expect(cloud.items).toHaveLength(2))
  })

  it('edits a note, persists it to the cloud, and clears it when emptied', async () => {
    localStorage.setItem('rn-candidates-token', TOKEN)
    render(<Harness />)
    fireEvent.click(screen.getByText('add-A'))
    await waitFor(() => expect(screen.getByText(/已同步到云端/)).toBeTruthy())
    const box = screen.getByLabelText('备注 A')
    fireEvent.change(box, { target: { value: '  等回调到 150 再看  ' } }); fireEvent.blur(box)
    await waitFor(() => expect((cloud.items as { note?: string }[])[0].note).toBe('等回调到 150 再看'))
    expect(JSON.parse(localStorage.getItem('rn-candidates') as string)[0].note).toBe('等回调到 150 再看')
    fireEvent.change(screen.getByLabelText('备注 A'), { target: { value: '   ' } }); fireEvent.blur(screen.getByLabelText('备注 A'))
    await waitFor(() => expect('note' in (cloud.items as object[])[0]).toBe(false))
  })

  it('Escape discards an edited note without saving it', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('add-A'))
    const box = screen.getByLabelText('备注 A')
    box.focus()
    fireEvent.change(box, { target: { value: '不应保存的草稿' } })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect((screen.getByLabelText('备注 A') as HTMLTextAreaElement).value).toBe('')
    expect(JSON.parse(localStorage.getItem('rn-candidates') as string)[0].note).toBeUndefined()
  })

  it('a fresh device picks the saved order up from the cloud using the saved token', async () => {
    cloud = { revision: 3, items: [{ market: 'us', code: 'B', addedAt: '2026-10-02T00:00:00.000Z' }, { market: 'us', code: 'A', addedAt: '2026-10-02T00:00:00.000Z' }] }
    localStorage.setItem('pulse_sync_config', JSON.stringify({ endpoint: 'https://x/api/pulse-sync', token: TOKEN })) // 复用复盘 token
    render(<Harness />)
    await waitFor(() => expect(order()).toEqual(['B', 'A']))
    expect(puts).toHaveLength(0)
  })

  it('wrong token is rejected and asks again', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('同步 Token'), { target: { value: 'x'.repeat(32) } })
    await act(async () => { fireEvent.click(screen.getByText('验证并同步')) })
    await waitFor(() => expect(screen.getByText(/Token 无效/)).toBeTruthy())
    expect(localStorage.getItem('rn-candidates-token')).toBeNull()
  })
})
