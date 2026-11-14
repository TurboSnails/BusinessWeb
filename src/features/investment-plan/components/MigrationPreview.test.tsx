import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_KEYS } from '../../invest-start/legacyPlan'
import { createPlanRepository } from '../repository'
import { MigrationPreviewPanel } from './MigrationPreview'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const NOW = '2026-11-14T12:00:00.000Z'
const TODAY = '2026-11-14'

describe('MigrationPreview R-5 leftovers', () => {
  it('unknown-amount 映射中文；预览旧现金流不重新遮蔽', async () => {
    const user = userEvent.setup()
    localStorage.setItem(LEGACY_KEYS.total, JSON.stringify('50'))
    localStorage.setItem(LEGACY_KEYS.split, JSON.stringify({ base: '70', active: '20', reserve: '10' }))
    localStorage.setItem(
      LEGACY_KEYS.holdings,
      JSON.stringify([
        { id: 'a', name: '空金额类', role: 'r', target: '40', band: '25', amount: '' },
        { id: 'b', name: '有金额', role: 'r', target: '60', band: '25', amount: '10' },
      ]),
    )
    localStorage.setItem('plan2026:cashflow', JSON.stringify({ expense: '12', reserve: '3' }))
    const repo = createPlanRepository({
      storage: localStorage,
      clock: () => NOW,
      idFactory: () => 'mig-1',
      today: () => TODAY,
    })
    render(
      <MigrationPreviewPanel
        storage={localStorage}
        repository={repo}
        today={TODAY}
        now={NOW}
        idFactory={() => 'mig-1'}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: '开始预览' }))
    await user.click(screen.getByRole('button', { name: '显示本机记录并核对' }))
    expect(screen.getByText(/金额为空，已跳过/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/unknown-amount/)
    await user.click(screen.getByRole('button', { name: '预览旧现金流' }))
    // 保持已揭示：预算勾选仍可见，无需再点「显示本机记录」
    expect(screen.getByLabelText(/导入三笔预算/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '显示本机记录并核对' })).toBeNull()
  })
})
