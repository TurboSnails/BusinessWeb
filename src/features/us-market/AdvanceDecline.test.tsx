import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AdvanceDecline from './AdvanceDecline'
import { ADV_DEC_FOOTNOTE, ADV_DEC_HISTORY_PENDING } from './advDec'
import type { Breadth, Point } from './model'

const weekdays = (n: number, from = '2025-06-02') => {
  const start = new Date(`${from}T12:00:00Z`)
  const out: string[] = []
  let i = 0
  while (out.length < n) {
    const cur = new Date(start)
    cur.setUTCDate(start.getUTCDate() + i++)
    if (cur.getUTCDay() === 0 || cur.getUTCDay() === 6) continue
    out.push(cur.toISOString().slice(0, 10))
  }
  return out
}

function makeAdvDec(n: number, bias = 0): Breadth {
  const dates = weekdays(n)
  return {
    date: dates.at(-1)!, covered: 500, total: 503, above200: 55,
    source: 'test', scope: '标普 500',
    advDec: dates.map((date, i) => {
      const adv = 220 + bias + Math.floor(i / 3)
      const dec = 260 - bias - Math.floor(i / 4)
      return [date, adv, Math.max(dec, 1), 10, adv + Math.max(dec, 1) + 10]
    }),
  }
}

function indexFrom(breadth: Breadth): Point[] {
  return (breadth.advDec ?? []).map(([date], i) => [date, 5000 + i * 3])
}

describe('AdvanceDecline', () => {
  it('defaults to 标普 500 and switches to 纳指 100', () => {
    const spx = makeAdvDec(60, 20)
    const ndx = makeAdvDec(60, -40)
    ndx.scope = '纳指 100'
    // Force distinct latest advancers for assertion
    const ndxLast = ndx.advDec!.at(-1)!
    ndx.advDec![ndx.advDec!.length - 1] = [ndxLast[0], 88, 300, 5, 393]

    render(<AdvanceDecline
      asOf={spx.date}
      breadth={{ spx, ndx }}
      indexes={{ spx: indexFrom(spx), ndx: indexFrom(ndx) }}
    />)

    const region = screen.getByRole('region', { name: '市场宽度：涨跌家数' })
    expect(within(region).getByText('上涨占比', { selector: 'dt' })).toBeTruthy()
    expect(within(region).getByText(`${spx.advDec!.at(-1)![1]} 家`)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '纳指 100' }))
    expect(within(region).getByText('88 家')).toBeTruthy()
    expect(within(region).getByText('300 家')).toBeTruthy()
  })

  it('falls back to highsLows and shows history pending copy', () => {
    const spx: Breadth = {
      date: '2026-11-20', covered: 500, total: 503, above200: 48,
      source: 'test', scope: '标普 500',
      highsLows: {
        date: '2026-11-20', covered: 500, newHighs: 0, newLows: 10,
        advancers: 122, decliners: 375, netHighsPct: -5,
      },
    }
    render(<AdvanceDecline asOf="2026-11-20" breadth={{ spx }} indexes={{}} />)
    const region = screen.getByRole('region', { name: '市场宽度：涨跌家数' })
    expect(within(region).getByText('122 家')).toBeTruthy()
    expect(within(region).getByText('375 家')).toBeTruthy()
    expect(within(region).getAllByText(ADV_DEC_HISTORY_PENDING).length).toBeGreaterThan(0)
    expect(within(region).getByText(ADV_DEC_FOOTNOTE)).toBeTruthy()
    expect(within(region).queryByRole('img')).toBeNull()
  })

  it('shows stale warning when data lags more than one session', () => {
    const spx = makeAdvDec(50)
    // Last advDec date is the series end; set asOf two weekdays later.
    const last = spx.date
    const asOf = (() => {
      const cur = new Date(`${last}T12:00:00Z`)
      let added = 0
      while (added < 2) {
        cur.setUTCDate(cur.getUTCDate() + 1)
        if (cur.getUTCDay() !== 0 && cur.getUTCDay() !== 6) added++
      }
      return cur.toISOString().slice(0, 10)
    })()
    render(<AdvanceDecline asOf={asOf} breadth={{ spx }} indexes={{ spx: indexFrom(spx) }} />)
    expect(screen.getByText(/更新已落后超过一个交易日/)).toBeTruthy()
  })

  it('renders reading copy when breadth and index both print highs', () => {
    const dates = weekdays(40)
    const spx: Breadth = {
      date: dates.at(-1)!, covered: 500, total: 503, above200: 60,
      source: 'test', scope: '标普 500',
      advDec: dates.map((date, i) => [date, 300 + i, 200, 5, 505]),
    }
    const index = dates.map((date, i) => [date, 1000 + i] as Point)
    render(<AdvanceDecline asOf={spx.date} breadth={{ spx }} indexes={{ spx: index }} />)
    expect(screen.getByText('参与度广，上涨有多数股票跟随。')).toBeTruthy()
    expect(screen.getByText(ADV_DEC_FOOTNOTE)).toBeTruthy()
  })

  it('returns null when no breadth payload exists', () => {
    const { container } = render(<AdvanceDecline asOf="2026-11-20" breadth={{}} indexes={{}} />)
    expect(container.firstChild).toBeNull()
  })
})
