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
      <CandidatePool items={c.items} companies={companies} state={c.state} message={c.message} localError={c.localError} onRetryLocal={c.retryLocal} onMove={c.move} onDecision={(i, r) => c.addDecision(i.market, i.code, r)} onRemove={i => c.remove(i.market, i.code)} onNote={(i, t) => c.setNote(i.market, i.code, t)} onClear={c.clear} onConnect={c.connect} onRetry={c.retry} />
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
    expect(screen.getByText(/未开启同步/)).toBeTruthy()
    fireEvent.click(screen.getByText('add-A')); fireEvent.click(screen.getByText('add-B')); fireEvent.click(screen.getByText('add-C'))
    expect(order()).toEqual(['A', 'B', 'C'])

    fireEvent.change(screen.getByLabelText('同步口令'), { target: { value: TOKEN } })
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

  it('已连接时本机写入失败与云端成功分别反馈，恢复后可单独重试本机保存', async () => {
    localStorage.setItem('rn-candidates-token', TOKEN)
    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'A', addedAt: '2026-10-02T00:00:00.000Z', note: '旧备注' }]))
    render(<Harness />)
    await waitFor(() => expect(screen.getByText(/已同步到云端/)).toBeTruthy())
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const box = screen.getByLabelText('备注 A')
    fireEvent.change(box, { target: { value: '本机失败的新备注' } })
    fireEvent.blur(box)
    await waitFor(() => expect((cloud.items as { note?: string }[])[0].note).toBe('本机失败的新备注'))
    expect(screen.getByRole('alert').textContent).toContain('未保存到本机')
    expect(screen.getByText(/已同步到云端/)).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('rn-candidates') as string)[0].note).toBe('旧备注')
    setItem.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: '重试本机保存' }))
    expect(JSON.parse(localStorage.getItem('rn-candidates') as string)[0].note).toBe('本机失败的新备注')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/已同步到云端/)).toBeTruthy()
  })

  it('云端冲突仍刷新为最新并保留既有冲突提示，不把本地操作写成成功', async () => {
    localStorage.setItem('rn-candidates-token', TOKEN)
    cloud = { revision: 1, items: [{ market: 'us', code: 'A', addedAt: '2026-10-02T00:00:00.000Z', note: '云端旧备注' }] }
    render(<Harness />)
    await waitFor(() => expect(screen.getByLabelText('备注 A')).toBeTruthy())
    cloud = { revision: 2, items: [{ market: 'us', code: 'A', addedAt: '2026-10-02T00:00:00.000Z', note: '其他设备的新备注' }] }
    const box = screen.getByLabelText('备注 A')
    fireEvent.change(box, { target: { value: '本机冲突编辑' } })
    fireEvent.blur(box)
    await waitFor(() => expect(screen.getByText(/其他设备已更新候选池/)).toBeTruthy())
    expect((screen.getByLabelText('备注 A') as HTMLTextAreaElement).value).toBe('其他设备的新备注')
    expect(JSON.parse(localStorage.getItem('rn-candidates') as string)[0].note).toBe('其他设备的新备注')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('wrong token is rejected and asks again', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('同步口令'), { target: { value: 'x'.repeat(32) } })
    await act(async () => { fireEvent.click(screen.getByText('验证并同步')) })
    await waitFor(() => expect(screen.getByText(/Token 无效/)).toBeTruthy())
    expect(localStorage.getItem('rn-candidates-token')).toBeNull()
  })
})

describe('同步状态展示', () => {
  it.each([
    ['no-token', '未开启同步：数据仅保存在本机'],
    ['syncing', '☁ 同步中…'],
    ['synced', '☁ 已同步到云端'],
    ['error', '⚠ 云端同步失败，数据暂存本机'],
  ] as const)('空池且同步区收起时仍显示 %s 状态', (state, text) => {
    render(<MemoryRouter><CandidatePool items={[]} companies={companies} state={state} message="" onMove={() => {}} onDecision={() => {}} onRemove={() => {}} onNote={() => {}} onClear={() => {}} onConnect={() => true} onRetry={() => {}} /></MemoryRouter>)
    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.getByText('跨设备同步').closest('details')?.hasAttribute('open')).toBe(false)
    expect(screen.queryByRole('heading', { name: '我的候选池 · 0 家' })).toBeNull()
  })
})

describe('本机保存失败', () => {
  it('备注保留在页面但不宣称已持久化，恢复后重试并重新挂载可读取', async () => {
    localStorage.setItem('rn-candidates', JSON.stringify([{ market: 'us', code: 'A', addedAt: '2026-10-02T00:00:00.000Z', note: '旧备注' }]))
    const view = render(<Harness />)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const box = screen.getByLabelText('备注 A')
    fireEvent.change(box, { target: { value: '待重试的新备注' } })
    fireEvent.blur(box)
    expect(screen.getByRole('alert').textContent).toContain('未保存到本机')
    expect((screen.getByLabelText('备注 A') as HTMLTextAreaElement).value).toBe('待重试的新备注')
    expect(JSON.parse(localStorage.getItem('rn-candidates') as string)[0].note).toBe('旧备注')
    expect(screen.queryByText('未开启同步：数据仅保存在本机')).toBeNull()
    setItem.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: '重试本机保存' }))
    expect(JSON.parse(localStorage.getItem('rn-candidates') as string)[0].note).toBe('待重试的新备注')
    view.unmount()
    render(<Harness />)
    expect((screen.getByLabelText('备注 A') as HTMLTextAreaElement).value).toBe('待重试的新备注')
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
    const auto = new Map(dcf.map(r => [`us:${r.code}`, { status: 'ok', fair: r.result.price, buyBelow: null, credibility: 'medium', current: r.result.price / (1 + r.result.mos!), currency: 'USD', priceDate: new Date().toLocaleDateString('en-CA') }]))
    render(<MemoryRouter><CandidatePool items={items} companies={companies} tools={{ dcf: dcf as never, valuation: [], grid: [], auto: auto as never }} state="no-token" message="" onMove={() => {}} onDecision={() => {}} onRemove={() => {}} onNote={() => {}} onClear={() => {}} onConnect={() => true} onRetry={() => {}} /></MemoryRouter>)
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

describe('价位提醒', () => {
  const valued: Company[] = [{ ...company('A'), valuation: { currency: 'USD', asOf: '2026-11-13', status: 'reviewed', price: { value: 100, date: '2026-11-13', currency: 'USD' }, methods: [{ name: 'PE', inputs: { epsForward: 10, epsTrailingTwelveMonths: 10 } }], value: { low: 90, base: 120, high: 150, kind: 'undated', date: null, primaryMethod: 'PE' } } as never,
    marketRefresh: { checkedAt: '2026-11-14', priceDate: '2026-11-13', price: 100, currency: 'USD', source: 'snap-us', originalAsOf: '' } }]
  function AlertHarness({ records = valued }: { records?: Company[] }): JSX.Element {
    const c = useCandidates(true)
    return (
      <MemoryRouter>
        <button onClick={() => c.toggle('us', 'A')}>add-A</button>
        <CandidatePool items={c.items} companies={records} state={c.state} message={c.message} localError={c.localError} onRetryLocal={c.retryLocal} onMove={c.move} onDecision={(i, r) => c.addDecision(i.market, i.code, r)} onRemove={i => c.remove(i.market, i.code)} onNote={(i, t) => c.setNote(i.market, i.code, t)} onClear={c.clear} onConnect={c.connect} onRetry={c.retry}
          onAlert={(i, rule) => c.setAlert(i.market, i.code, rule)} />
      </MemoryRouter>
    )
  }
  beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 }))) })
  afterEach(() => vi.unstubAllGlobals())

  it('候选行「提醒」打开对话框，按研究悲观价预填，保存后写进候选条目并显示条件', async () => {
    render(<AlertHarness />)
    fireEvent.click(screen.getByText('add-A'))
    fireEvent.click(screen.getByRole('button', { name: '设置价位提醒 A' }))
    expect(screen.getByText(/最新收盘价 USD 100/).textContent).toContain('2026-11-13')
    expect((screen.getByLabelText(/条件价（USD）/) as HTMLInputElement).value).toBe('90')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('未保存到本机'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    setItem.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const saved = JSON.parse(localStorage.getItem('rn-candidates') ?? '[]')
    expect(saved[0].alert).toMatchObject({ kind: 'price-below', threshold: 90, currency: 'USD', anchor: { type: 'research-bear', value: 90, asOf: '2026-11-13' } })
    expect(screen.getByRole('button', { name: '修改价位提醒 A' }).textContent).toContain('≤ 90')
  })

  it('综合估值待核时不提供研究锚点，仍可手动填写', () => {
    const unreliable = [{
      ...valued[0],
      marketRefresh: { ...valued[0].marketRefresh!, price: 300 },
      valuation: { ...valued[0].valuation!, price: { value: 300, date: '2026-11-13', currency: 'USD' } },
    }] as Company[]
    render(<AlertHarness records={unreliable} />)
    fireEvent.click(screen.getByText('add-A'))
    fireEvent.click(screen.getByRole('button', { name: '设置价位提醒 A' }))
    expect(screen.queryByText(/研究估值·悲观价/)).toBeNull()
    expect(screen.queryByText(/研究估值·基准价/)).toBeNull()
    expect(screen.getByRole('radio', { name: /手动填写/ })).toHaveProperty('checked', true)
  })

  it('决策记录完整版里可以勾选「把条件价设为提醒」', async () => {
    render(<AlertHarness />)
    fireEvent.click(screen.getByText('add-A'))
    fireEvent.click(screen.getByRole('button', { name: '写决策记录 A' }))
    fireEvent.change(screen.getByLabelText(/我为什么买/), { target: { value: '理由' } })
    fireEvent.change(screen.getByLabelText(/什么情况说明我错了/), { target: { value: '条件' } })
    fireEvent.change(screen.getByLabelText(/下次检查日/), { target: { value: '2027-04-30' } })
    fireEvent.click(screen.getByLabelText(/保存时设为价位提醒/))
    fireEvent.change(screen.getByLabelText(/条件价（USD）/), { target: { value: '88' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('rn-candidates') ?? '[]')[0].alert?.threshold).toBe(88))
    expect(JSON.parse(localStorage.getItem('rn-candidates') ?? '[]')[0].decisions).toHaveLength(1)
  })
})

describe('手机摘要（≤640px）', () => {
  const stubNarrow = (matches: boolean): void => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {}, onchange: null, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })))
  }
  const seed = (): void => localStorage.setItem('rn-candidates', JSON.stringify([
    { market: 'us', code: 'A', addedAt: '2026-10-01T00:00:00.000Z', note: '等回调' },
    { market: 'us', code: 'B', addedAt: '2026-10-02T00:00:00.000Z', decisions: [{ at: '2026-01-01T00:00:00.000Z', action: 'watch', why: '续约稳定', wrong: '毛利下滑', nextCheck: '2026-02-01' }] },
  ]))
  const cards = (): string[] => screen.queryAllByRole('listitem').map(li => /公司(\w)/.exec(li.textContent ?? '')?.[1] ?? '')
  beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 }))) })
  afterEach(() => vi.unstubAllGlobals())

  it('窄屏不渲染表格，摘要显示公司、下次复查与原因，详情默认收起', () => {
    stubNarrow(true); seed()
    render(<Harness />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(cards()).toEqual(['A', 'B'])
    expect(screen.getByRole('link', { name: '公司B B' })).toBeTruthy()
    expect(screen.getByText('下次复查 2026-02-01')).toBeTruthy()
    expect(screen.getByText('续约稳定')).toBeTruthy()
    expect(screen.getByText('待复查')).toBeTruthy()
    expect(screen.getByText(/还没有决策记录/)).toBeTruthy()
    expect(screen.queryByLabelText('备注 A')).toBeNull()
    expect(screen.queryByLabelText('上移 B')).toBeNull()
  })

  it('展开后可编辑备注、排序与移除，收起按钮带 aria-expanded', () => {
    stubNarrow(true); seed()
    render(<Harness />)
    const toggle = screen.getByRole('button', { name: '展开 A 详情' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: '收起 A 详情' }).getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toBeTruthy()
    const box = screen.getByLabelText('备注 A') as HTMLTextAreaElement
    expect(box.value).toBe('等回调')
    fireEvent.change(box, { target: { value: '等回调到 150' } }); fireEvent.blur(box)
    expect(JSON.parse(localStorage.getItem('rn-candidates') as string)[0].note).toBe('等回调到 150')
    fireEvent.click(screen.getByRole('button', { name: '下移 A' }))
    expect(cards()).toEqual(['B', 'A'])
    fireEvent.click(screen.getByRole('button', { name: '移除 A' }))
    expect(cards()).toEqual(['B'])
  })

  it('到期时「写复查」打开同一个决策弹窗，保存后持久化为新版本并更新摘要', () => {
    stubNarrow(true); seed()
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '写复查 B' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(screen.getByLabelText(/我为什么买/), { target: { value: '复查后：回款改善' } })
    fireEvent.change(screen.getByLabelText(/下次检查日/), { target: { value: '2099-05-31' } })
    fireEvent.click(screen.getByRole('button', { name: '保存为新版本' }))
    expect(dialog.isConnected).toBe(false)
    const saved = JSON.parse(localStorage.getItem('rn-candidates') as string)
    expect(saved[1].decisions.map((r: { nextCheck: string }) => r.nextCheck)).toEqual(['2026-02-01', '2099-05-31'])
    expect(screen.getByText('下次复查 2099-05-31')).toBeTruthy()
    expect(screen.getByText('复查后：回款改善')).toBeTruthy()
    expect(screen.queryByText('待复查')).toBeNull()
    expect(screen.getByRole('button', { name: '更新决策记录 B' })).toBeTruthy()
  })

  it('没有记录时「写决策记录」可直接新建', () => {
    stubNarrow(true); seed()
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '写决策记录 A' }))
    fireEvent.change(screen.getByLabelText(/我为什么买/), { target: { value: '理由' } })
    fireEvent.change(screen.getByLabelText(/什么情况说明我错了/), { target: { value: '条件' } })
    fireEvent.change(screen.getByLabelText(/下次检查日/), { target: { value: '2099-01-31' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(JSON.parse(localStorage.getItem('rn-candidates') as string)[0].decisions).toHaveLength(1)
    expect(screen.getByText('下次复查 2099-01-31')).toBeTruthy()
  })

  it('宽屏仍是表格', () => {
    stubNarrow(false); seed()
    render(<Harness />)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '展开 A 详情' })).toBeNull()
  })
})
