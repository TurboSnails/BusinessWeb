import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LimitUpAnalysis from './LimitUpAnalysis'
import LimitUpLadder from '../features/limit-up/LimitUpLadder'
import { buildLadder } from '../features/limit-up/ladder'

const valid = {
  code: 200,
  data: {
    plate_stock: [{
      secu_name: '医药',
      change: 0.02,
      plate_stock_up_num: 1,
      stock_list: [{ secu_code: 'sz000710', secu_name: '贝瑞基因', time: '2026-09-30 09:33:06', last_px: 10, change: 0.1, cmc: 100000000, up_num: '4天2板' }],
    }],
  },
}

afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('涨停复制反馈（L5）', () => {
  it('两个复制按钮文案区分梯队与全部板块；失败时提示手动选择', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T08:00:00Z'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(valid), { status: 200 })))
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn(async () => { throw new Error('denied') }) },
    })
    await act(async () => {
      render(<MemoryRouter><LimitUpAnalysis /></MemoryRouter>)
    })
    expect(screen.getByRole('button', { name: /复制全部板块/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /复制梯队/ })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /复制梯队/ })) })
    expect(screen.getByRole('button', { name: /复制失败，请手动选择/ })).toBeTruthy()
  })

  it('LimitUpLadder 单独：复制失败文案', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn(async () => { throw new Error('denied') }) },
    })
    const tiers = buildLadder([
      {
        name: '医药', changePercent: 2, stockCount: 1,
        stocks: [{
          code: 'sz000710', name: '贝瑞基因', currentPrice: 10, changePercent: 10,
          limitUpTime: '09:33:06', marketCap: 100, consecutiveDays: 2, description: '',
        }],
      },
    ], true)
    render(<LimitUpLadder tiers={tiers} onPickConcept={() => undefined} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /复制梯队/ })) })
    expect(screen.getByRole('button', { name: /复制失败，请手动选择/ })).toBeTruthy()
  })
})
