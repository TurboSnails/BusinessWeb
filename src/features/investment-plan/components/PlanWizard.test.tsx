import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyPlan, type PlanDocument } from '../types'
import { PlanWizard } from './PlanWizard'

afterEach(() => cleanup())

const NOW = '2026-11-14T12:00:00.000Z'
const TODAY = '2026-11-14'

describe('PlanWizard P1-2', () => {
  it('保存并继续会落盘本步资金用途', async () => {
    const user = userEvent.setup()
    let doc: PlanDocument = createEmptyPlan(NOW, 'plan-1')
    let rev = 1
    const onPatch = vi.fn(async (change: (d: PlanDocument) => PlanDocument) => {
      doc = { ...change(doc), localRevision: rev + 1 }
      rev = doc.localRevision
      return { ok: true }
    })
    const { rerender } = render(
      <MemoryRouter>
        <PlanWizard doc={doc} today={TODAY} now={NOW} onPatch={onPatch} onComplete={() => undefined} />
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/月必要支出/), '8000')
    await user.type(screen.getByLabelText(/应急月数/), '6')
    await user.click(screen.getByRole('button', { name: '保存并继续' }))
    await waitFor(() => expect(doc.funding.monthlyNecessaryExpense?.amount).toBe('8000.00'))
    expect(doc.funding.emergencyMonths).toBe(6)
    expect(doc.wizard.nextStep).toBe(2)
    expect(onPatch.mock.calls.length).toBeGreaterThanOrEqual(2)

    rerender(
      <MemoryRouter>
        <PlanWizard doc={doc} today={TODAY} now={NOW} onPatch={onPatch} onComplete={() => undefined} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /第 2 步：三笔投资预算/ })).toBeTruthy()
  })

  it('R-1: 确认预算后再保存并继续，保留 confirmedAt', async () => {
    const user = userEvent.setup()
    let doc: PlanDocument = {
      ...createEmptyPlan(NOW, 'plan-1'),
      wizard: { nextStep: 2, completed: false, skippedSteps: [] },
    }
    let rev = 1
    const onPatch = vi.fn(async (change: (d: PlanDocument) => PlanDocument) => {
      doc = { ...change(doc), localRevision: rev + 1 }
      rev = doc.localRevision
      return { ok: true, document: doc }
    })
    const { rerender } = render(
      <MemoryRouter>
        <PlanWizard doc={doc} today={TODAY} now={NOW} onPatch={onPatch} onComplete={() => undefined} />
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/配置底仓预算/), '100000')
    await user.type(screen.getByLabelText(/主动（研究）预算/), '0')
    await user.type(screen.getByLabelText(/备用金预算/), '50000')
    await user.click(screen.getByRole('button', { name: '确认这三笔预算' }))
    await waitFor(() => expect(doc.funding.budgets.confirmedAt).toBe(NOW))
    const confirmedAt = doc.funding.budgets.confirmedAt

    rerender(
      <MemoryRouter>
        <PlanWizard doc={doc} today={TODAY} now={NOW} onPatch={onPatch} onComplete={() => undefined} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: '保存并继续' }))
    await waitFor(() => expect(doc.wizard.nextStep).toBe(3))
    expect(doc.funding.budgets.confirmedAt).toBe(confirmedAt)
    expect(doc.funding.budgets.core?.amount).toBe('100000.00')
  })
})
