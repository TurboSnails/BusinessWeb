import React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyPlan } from '../types'
import { parsePlanDocument } from '../validation'
import { AllocationEditor } from './AllocationEditor'

afterEach(() => cleanup())

const NOW = '2026-11-14T12:00:00.000Z'
const TODAY = '2026-11-14'

describe('AllocationEditor P1', () => {
  it('P1-1: 输入市值并核对后，落盘文档不含 stray amount，mark 有值', async () => {
    const user = userEvent.setup()
    let doc = createEmptyPlan(NOW, 'plan-1')
    doc = {
      ...doc,
      core: [
        {
          id: 'core-1',
          label: '股票类',
          targetBps: 5000,
          relativeBandBps: 2500,
          mark: { value: null, asOf: null, source: 'manual', verifiedAt: null },
          riskTags: [],
        },
      ],
    }
    const onPatch = vi.fn(async (change: (d: typeof doc) => typeof doc) => {
      const next = change(doc)
      const parsed = parsePlanDocument(next, TODAY)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) doc = parsed.value
      return { ok: parsed.ok, reason: parsed.ok ? undefined : 'invalid' }
    })

    render(
      <MemoryRouter>
        <AllocationEditor doc={doc} today={TODAY} now={NOW} onPatch={onPatch} />
      </MemoryRouter>,
    )

    const amount = screen.getByLabelText(/本类别市值/)
    await user.clear(amount)
    await user.type(amount, '50000')
    const date = screen.getByLabelText(/^估值日期$/)
    await user.clear(date)
    await user.type(date, '2026-11-14')
    await user.click(screen.getAllByLabelText(/这些金额已按该日核对/)[0]!)
    await user.click(screen.getByRole('button', { name: '保存本类市值' }))

    await waitFor(() => expect(onPatch).toHaveBeenCalled())
    expect(doc.core[0].mark.value?.amount).toBe('50000.00')
    // 顶层无 stray amount/asOf 键（校验白名单会拒）
    expect('amount' in doc.core[0]).toBe(false)
    expect('asOf' in doc.core[0]).toBe(false)
    const parsed = parsePlanDocument(doc, TODAY)
    expect(parsed.ok).toBe(true)
  })

  it('P1-4: 切换视图不抹掉另一侧；保存合计才确认替换', async () => {
    const user = userEvent.setup()
    let doc = createEmptyPlan(NOW, 'plan-1')
    doc = {
      ...doc,
      core: [
        {
          id: 'core-1',
          label: '股票类',
          targetBps: 5000,
          relativeBandBps: 2500,
          mark: {
            value: { currency: 'CNY', amount: '80000.00' },
            asOf: '2026-11-14',
            source: 'manual',
            verifiedAt: NOW,
          },
          riskTags: [],
        },
      ],
    }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onPatch = vi.fn(async (change: (d: typeof doc) => typeof doc) => {
      doc = change(doc)
      return { ok: true }
    })
    render(
      <MemoryRouter>
        <AllocationEditor doc={doc} today={TODAY} now={NOW} onPatch={onPatch} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /仅填底仓合计/ }))
    expect(doc.core).toHaveLength(1)
    expect(onPatch).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText(/底仓合计/), '90000')
    const asOfInputs = screen.getAllByLabelText(/估值日期/)
    await user.clear(asOfInputs[0]!)
    await user.type(asOfInputs[0]!, '2026-11-14')
    await user.click(screen.getAllByLabelText(/这些金额已按该日核对/)[0]!)
    await user.click(screen.getByRole('button', { name: '保存合计' }))
    expect(confirm).toHaveBeenCalled()
    expect(doc.core).toHaveLength(1)
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '保存合计' }))
    await waitFor(() => expect(doc.core).toHaveLength(0))
    expect(doc.coreTotalOnly?.value?.amount).toBe('90000.00')
  })

  it('P1-3: 教学模板保留已有金额类别', async () => {
    const user = userEvent.setup()
    let doc = createEmptyPlan(NOW, 'plan-1')
    doc = {
      ...doc,
      core: [
        {
          id: 'legacy-1',
          label: '沪深300',
          targetBps: 6000,
          relativeBandBps: 2500,
          mark: {
            value: { currency: 'CNY', amount: '120000.00' },
            asOf: null,
            source: 'legacy',
            verifiedAt: null,
          },
          riskTags: [],
        },
      ],
    }
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onPatch = vi.fn(async (change: (d: typeof doc) => typeof doc) => {
      doc = change(doc)
      return { ok: true }
    })
    render(
      <MemoryRouter>
        <AllocationEditor doc={doc} today={TODAY} now={NOW} onPatch={onPatch} />
      </MemoryRouter>,
    )
    await user.click(screen.getByText(/教学模板/))
    await user.click(screen.getByLabelText(/我明白模板不等于适合本人/))
    await user.click(screen.getByRole('button', { name: '股票 50 / 债券 50' }))
    await waitFor(() => expect(onPatch).toHaveBeenCalled())
    expect(doc.core.some(c => c.label === '沪深300' && c.mark.value?.amount === '120000.00')).toBe(true)
    expect(doc.core.find(c => c.label === '沪深300')?.targetBps).toBeNull()
  })

  it('R-2: 研究持仓可用草稿+核对+保存写入市值（与 blur 顺序无关）', async () => {
    const user = userEvent.setup()
    let doc = createEmptyPlan(NOW, 'plan-1')
    doc = {
      ...doc,
      research: [
        {
          id: 'r1',
          label: '研究A',
          mark: { value: null, asOf: null, source: 'manual', verifiedAt: null },
          instrument: null,
          candidateRef: null,
          riskTags: [],
        },
      ],
    }
    const onPatch = vi.fn(async (change: (d: typeof doc) => typeof doc) => {
      const next = change(doc)
      const parsed = parsePlanDocument(next, TODAY)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) doc = parsed.value
      return { ok: parsed.ok }
    })
    render(
      <MemoryRouter>
        <AllocationEditor doc={doc} today={TODAY} now={NOW} onPatch={onPatch} />
      </MemoryRouter>,
    )
    await user.click(screen.getByText(/主动（研究）持仓/))
    const row = screen.getByDisplayValue('研究A').closest('li')!
    await user.type(within(row).getByLabelText(/^市值（元）$/), '20000')
    const date = within(row).getByLabelText(/^估值日期$/) as HTMLInputElement
    await user.clear(date)
    await user.type(date, '2026-11-10')
    await user.click(within(row).getByLabelText(/这些金额已按该日核对/))
    await user.click(within(row).getByRole('button', { name: '保存本条市值' }))
    await waitFor(() => expect(doc.research[0]?.mark.value?.amount).toBe('20000.00'))
    expect(doc.research[0]?.mark.asOf).toBe('2026-11-10')
  })

  it('R-3: 模板后目标输入跟文档；未改动 blur 不写回旧值', async () => {
    const user = userEvent.setup()
    let doc = createEmptyPlan(NOW, 'plan-1')
    doc = {
      ...doc,
      core: [
        {
          id: 'legacy-1',
          label: '沪深300',
          targetBps: 4000,
          relativeBandBps: 2500,
          mark: {
            value: { currency: 'CNY', amount: '120000.00' },
            asOf: null,
            source: 'legacy',
            verifiedAt: null,
          },
          riskTags: [],
        },
      ],
      localRevision: 1,
    }
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onPatch = vi.fn(async (change: (d: typeof doc) => typeof doc, expected?: number) => {
      expect(expected).toBe(doc.localRevision)
      doc = { ...change(doc), localRevision: doc.localRevision + 1 }
      return { ok: true, document: doc }
    })
    const { rerender } = render(
      <MemoryRouter>
        <AllocationEditor doc={doc} today={TODAY} now={NOW} onPatch={onPatch} />
      </MemoryRouter>,
    )
    await user.click(screen.getByText(/教学模板/))
    await user.click(screen.getByLabelText(/我明白模板不等于适合本人/))
    await user.click(screen.getByRole('button', { name: '股票 50 / 债券 50' }))
    await waitFor(() => expect(doc.core.find(c => c.label === '沪深300')?.targetBps).toBeNull())

    rerender(
      <MemoryRouter>
        <AllocationEditor doc={doc} today={TODAY} now={NOW} onPatch={onPatch} />
      </MemoryRouter>,
    )
    const targetInputs = screen.getAllByLabelText(/目标比例/)
    // 沪深300 目标应为空（受控跟文档 null），不是旧的 40
    const hs = doc.core.findIndex(c => c.label === '沪深300')
    expect((targetInputs[hs] as HTMLInputElement).value).toBe('')
    const callsBefore = onPatch.mock.calls.length
    await user.click(targetInputs[hs]!)
    await user.tab()
    expect(onPatch.mock.calls.length).toBe(callsBefore)
    expect(doc.core.find(c => c.label === '沪深300')?.targetBps).toBeNull()
  })

  it('R-6: 已改名的 core-stock 再套模板用新 id，不撞车', async () => {
    const user = userEvent.setup()
    let doc = createEmptyPlan(NOW, 'plan-1')
    doc = {
      ...doc,
      core: [
        {
          id: 'core-stock',
          label: '宽基ETF',
          targetBps: 5000,
          relativeBandBps: 2500,
          mark: { value: null, asOf: null, source: 'manual', verifiedAt: null },
          riskTags: [],
        },
      ],
    }
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onPatch = vi.fn(async (change: (d: typeof doc) => typeof doc) => {
      const next = change(doc)
      const parsed = parsePlanDocument(next, TODAY)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) doc = parsed.value
      return { ok: parsed.ok }
    })
    render(
      <MemoryRouter>
        <AllocationEditor doc={doc} today={TODAY} now={NOW} onPatch={onPatch} />
      </MemoryRouter>,
    )
    await user.click(screen.getByText(/教学模板/))
    await user.click(screen.getByLabelText(/我明白模板不等于适合本人/))
    await user.click(screen.getByRole('button', { name: '股票 50 / 债券 50' }))
    await waitFor(() => expect(doc.core.some(c => c.label === '股票类')).toBe(true))
    const ids = doc.core.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(doc.core.find(c => c.label === '宽基ETF')?.id).toBe('core-stock')
    expect(doc.core.find(c => c.label === '股票类')?.id).not.toBe('core-stock')
  })
})
