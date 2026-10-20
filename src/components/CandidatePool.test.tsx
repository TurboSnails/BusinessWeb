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
      <CandidatePool items={c.items} companies={companies} state={c.state} message={c.message} onMove={c.move} onDecision={(i, r) => c.addDecision(i.market, i.code, r)} onRemove={i => c.remove(i.market, i.code)} onNote={(i, t) => c.setNote(i.market, i.code, t)} onClear={c.clear} onConnect={c.connect} onRetry={c.retry} />
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

describe('CandidatePool：按 DCF 筛选', () => {
  it('只显示安全边际达标的公司，筛选时不能调整顺序', () => {
    const mk = (code: string, mos: number | null) => ({ price: 10, mos, currency: 'USD', savedAt: '2026-10-13T00:00:00Z', code })
    const dcf = [mk('A', 0.3), mk('B', 0.05)].map(r => ({
      key: `dcf|us|${r.code}|公司${r.code}`, market: 'us', code: r.code, company: `公司${r.code}`, savedAt: r.savedAt, schemaVersion: 1,
      input: { currency: 'USD' }, result: { price: r.price, mos: r.mos }, wacc: {}, multiples: [],
    }))
    const items = ['A', 'B', 'C'].map(code => ({ market: 'us' as const, code, addedAt: '2026-10-01T00:00:00Z' }))
    render(<MemoryRouter><CandidatePool items={items} companies={companies} tools={{ dcf: dcf as never, valuation: [], grid: [] }} state="no-token" message="" onMove={() => {}} onDecision={() => {}} onRemove={() => {}} onNote={() => {}} onClear={() => {}} onConnect={() => true} onRetry={() => {}} /></MemoryRouter>)
    expect(order()).toEqual(['A', 'B', 'C'])
    fireEvent.click(screen.getByRole('button', { name: '安全边际 ≥20%' }))
    expect(order()).toEqual(['A'])
    expect(screen.getByRole('button', { name: '下移 A' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '不适用/未覆盖' }))
    expect(order()).toEqual(['C'])
  })
})

describe('决策记录', () => {
  beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 }))) })
  afterEach(() => vi.unstubAllGlobals())

  it('三行必填，保存为新版本并显示最新动作与下次检查日；有记录后切换不再移出，移除需确认', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('add-A'))
    fireEvent.click(screen.getByRole('button', { name: '写决策记录 A' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByRole('alert').textContent).toContain('为什么买、什么情况说明我错了、下次检查日')

    fireEvent.change(screen.getByLabelText(/我为什么买/), { target: { value: '续约稳定，现金回款与利润匹配' } })
    fireEvent.change(screen.getByLabelText(/什么情况说明我错了/), { target: { value: '毛利率同比下降 5 个百分点以上' } })
    fireEvent.change(screen.getByLabelText(/下次检查日/), { target: { value: '2027-04-30' } })
    fireEvent.change(screen.getByLabelText('这次的决定'), { target: { value: 'buy' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(dialog.isConnected).toBe(false)
    expect(screen.getByText('下次检查 2027-04-30')).toBeTruthy()
    expect(screen.getByText('买入')).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem('rn-candidates') ?? '[]')
    expect(saved[0].decisions[0]).toMatchObject({ action: 'buy', why: '续约稳定，现金回款与利润匹配', nextCheck: '2027-04-30', snapshot: { rating: '观察' } })

    // 更新：沿用上一版内容，保存为第二个版本，旧版本保留
    fireEvent.click(screen.getByRole('button', { name: '查看与更新决策记录 A' }))
    expect((screen.getByLabelText(/我为什么买/) as HTMLTextAreaElement).value).toBe('续约稳定，现金回款与利润匹配')
    fireEvent.change(screen.getByLabelText(/下次检查日/), { target: { value: '2027-10-31' } })
    fireEvent.click(screen.getByRole('button', { name: '保存为新版本' }))
    expect(JSON.parse(localStorage.getItem('rn-candidates') ?? '[]')[0].decisions.map((r: { nextCheck: string }) => r.nextCheck)).toEqual(['2027-04-30', '2027-10-31'])

    fireEvent.click(screen.getByText('add-A'))
    expect(order()).toEqual(['A'])
    fireEvent.click(screen.getByRole('button', { name: '移除 A' }))
    expect(order()).toEqual(['A'])
    fireEvent.click(screen.getByRole('button', { name: '确认移除' }))
    expect(order()).toEqual([])
  })

  it('下次检查日已到时标出待复查', () => {
    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'B', addedAt: '2026-10-02T00:00:00.000Z', decisions: [{ at: '2026-01-01T00:00:00.000Z', action: 'watch', why: 'w', wrong: 'x', nextCheck: '2026-02-01' }] }]))
    render(<Harness />)
    expect(screen.getByText('待复查')).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看与更新决策记录 B' }).textContent).toContain('复查')
  })
})
