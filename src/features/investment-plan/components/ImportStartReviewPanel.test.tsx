import React, { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { START_KEY } from '../../invest-start/store'
import { QUESTIONNAIRE_VERSION, RULES_VERSION } from '../../invest-start/types'
import { createEmptyPlan } from '../types'
import {
  IMPORT_START_REVIEW_WARNINGS,
  ImportStartReviewPanel,
  type ImportStartReviewDone,
} from './ImportStartReviewPanel'

const confirmMock = vi.fn()

vi.mock('../migration', async importOriginal => {
  const actual = await importOriginal<typeof import('../migration')>()
  return {
    ...actual,
    confirmStartReviewIntoExistingPlan: (...args: unknown[]) => confirmMock(...args),
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  confirmMock.mockReset()
})

beforeEach(() => {
  localStorage.setItem(
    START_KEY,
    JSON.stringify({
      schemaVersion: 1,
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      rulesVersion: RULES_VERSION,
      answers: { q1: 'c', q2: 'b', q3: 'c', q4: 'b', q5: 'b', q6: 'b', q7: 'b', q8: 'b', q9: 'b' },
      steps: {},
      assessedAt: '2026-11-14T00:00:00.000Z',
      review: {
        id: 'abc-1',
        anchor: '2026-06-15',
        intervalMonths: 6,
        completedDates: ['2026-06-15', '2026-12-15'],
        calendarSequence: 2,
      },
    }),
  )
  const urlApi = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void }
  urlApi.createObjectURL = vi.fn(() => 'blob:x')
  urlApi.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

/** 模拟 MyPlan：onDone 后卸面板，警告进 saveError/live */
function ParentHarness(): JSX.Element {
  const doc = createEmptyPlan('2026-11-14T00:00:00.000Z', 'p1')
  const [mode, setMode] = useState<'import' | 'home'>('import')
  const [saveError, setSaveError] = useState('')
  const [live, setLive] = useState('')
  return (
    <div>
      {mode === 'import' ? (
        <ImportStartReviewPanel
          storage={localStorage}
          repository={
            {
              getSnapshot: () => ({ document: doc, mode: 'ready', unsaved: false }),
              patch: vi.fn(),
            } as never
          }
          doc={doc}
          today="2026-11-14"
          now="2026-11-14T12:00:00.000Z"
          onDone={(result?: ImportStartReviewDone) => {
            setMode('home')
            if (result?.warning) {
              setSaveError(result.warning)
              setLive(result.warning)
            } else {
              setSaveError('')
              setLive('已带入自测检查日')
            }
          }}
          onCancel={() => setMode('home')}
        />
      ) : (
        <>
          {saveError && (
            <p className="ip-error" role="alert">
              {saveError}
            </p>
          )}
          <p aria-live="polite">{live}</p>
        </>
      )}
    </div>
  )
}

async function confirmFlow(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: '下载现有计划备份' }))
  await user.click(screen.getByLabelText(/这是我的自测检查日/))
  await user.click(screen.getByRole('button', { name: '确认带入检查日' }))
}

describe('ImportStartReviewPanel → 父级警告可见', () => {
  const docOk = createEmptyPlan('2026-11-14T00:00:00.000Z', 'ok')

  it('sourceChangedAfterWrite：home 的 alert/live 显示警告，不是仅「已带入」', async () => {
    confirmMock.mockResolvedValue({
      ok: true,
      document: { ...docOk, review: { id: 'abc-1' } },
      persisted: true,
      receiptWritten: true,
      sourceChangedAfterWrite: true,
    })
    const user = userEvent.setup()
    render(<ParentHarness />)
    await confirmFlow(user)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(IMPORT_START_REVIEW_WARNINGS.sourceChanged)
    })
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      IMPORT_START_REVIEW_WARNINGS.sourceChanged,
    )
    expect(screen.queryByText('已带入自测检查日')).toBeNull()
  })

  it('persisted:false：home 显示内存警告，不误报已带入成功', async () => {
    confirmMock.mockResolvedValue({
      ok: true,
      document: { ...docOk, review: { id: 'abc-1' } },
      persisted: false,
      receiptWritten: false,
    })
    const user = userEvent.setup()
    render(<ParentHarness />)
    await confirmFlow(user)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(IMPORT_START_REVIEW_WARNINGS.notPersisted)
    })
    expect(screen.queryByText('已带入自测检查日')).toBeNull()
  })

  it('receiptWritten:false：home 显示收据警告，不误报干净成功', async () => {
    confirmMock.mockResolvedValue({
      ok: true,
      document: { ...docOk, review: { id: 'abc-1' } },
      persisted: true,
      receiptWritten: false,
    })
    const user = userEvent.setup()
    render(<ParentHarness />)
    await confirmFlow(user)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(IMPORT_START_REVIEW_WARNINGS.receiptFailed)
    })
    expect(screen.queryByText('已带入自测检查日')).toBeNull()
  })

  it('干净成功：live 为已带入，无 alert', async () => {
    confirmMock.mockResolvedValue({
      ok: true,
      document: { ...docOk, review: { id: 'abc-1' } },
      persisted: true,
      receiptWritten: true,
    })
    const user = userEvent.setup()
    render(<ParentHarness />)
    await confirmFlow(user)
    await waitFor(() => {
      expect(screen.getByText('已带入自测检查日')).toBeTruthy()
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
