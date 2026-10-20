import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SignalReview from './SignalReview'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const respond = (ledgers: Record<string, unknown>) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const year = /signal-ledger-(\d{4})/.exec(url)?.[1] ?? ''
  return ledgers[year] ? { ok: true, json: async () => ledgers[year] } : { ok: false, json: async () => null }
}))

describe('SignalReview', () => {
  it('样本期不足时只说明进度', async () => {
    const y = String(new Date().getFullYear())
    respond({ [y]: { schemaVersion: 1, snapshots: { [`${y}-10-20`]: {} } } })
    render(<SignalReview />)
    expect(await screen.findByText(new RegExp(`台账从 ${y}-10-20 开始记录，目前 1 期`))).toBeTruthy()
  })

  it('满 28 天后按市场列出各信号组表现', async () => {
    const y = new Date().getFullYear()
    const rows = (p: number) => Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`cn:A${i}`, [p, 0, null, null, null, -1]]))
    respond({ [String(y - 1)]: { schemaVersion: 1, snapshots: { [`${y - 1}-11-01`]: rows(100) } }, [String(y)]: { schemaVersion: 1, snapshots: { [`${y}-01-10`]: rows(110) } } })
    render(<SignalReview />)
    expect(await screen.findByText('评级：优先关注')).toBeTruthy()
    expect(screen.getByText(/A股 · 6 只/)).toBeTruthy()
  })
})
