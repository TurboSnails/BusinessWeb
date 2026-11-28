import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPlans, reviewCatalog } from './catalog'
import {
  HOLDING_CACHE_KEY, PLAN_VERSION, calculateHoldings, holdingState, isHolding, loadHoldingCache, reviewSession,
  saveHoldingCache, sessionBars, type HoldingSnapshot,
} from './holdings'
import type { PlanResult, PlanSignal } from '../etf-signal-plans/plan-trades'

const day = '2026-11-27'
const bar = (date: string, close = 10) => ({ date, open: close, high: close, low: close, close })
const result = (values: Partial<PlanResult> = {}): PlanResult => ({
  key: 'cyb', name: '创业板择时', holding: false, signals: [], ...values,
})
const sell = (date: string): PlanSignal => ({ date, side: 'sell', price: 10, signalDate: day, reason: '死叉' })

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })

describe('ETF review holdings', () => {
  it('maps the first catalogue match and leaves arbitrary codes unassigned', () => {
    const item = (code: string) => ({ code, name: code })
    const plans = defaultPlans(reviewCatalog(
      [item('159967')], [item('159967'), item('512480')],
      [{ ...item('512880'), plan: 'hs' }, { ...item('512480'), plan: 'cyb' }, { ...item('512400'), plan: 'cyb' }],
    ))
    expect(Object.fromEntries(plans)).toEqual({ '159967': 'cyb', '512480': 'hs', '512400': 'cyb', '512880': 'hs' })
    expect(plans.get('510300')).toBeUndefined()
  })

  it('distinguishes holding, pending buy, both sell times and empty', () => {
    const bars = [bar(day)]
    expect(holdingState(bars, day, () => result({ holding: true }))).toEqual({ state: 'hold' })
    expect(holdingState(bars, day, () => result({ pendingBuy: { signalDate: day, reason: '金叉' } }))).toEqual({ state: 'buy', reason: '金叉' })
    expect(holdingState(bars, day, () => result({ signals: [sell(day)] }))).toEqual({ state: 'sellToday', reason: '死叉' })
    const pending = holdingState(bars, day, input => input.length === 1 ? result({ holding: true }) : result({ signals: [sell(input[1].date)] }))
    expect(pending).toEqual({ state: 'sellNext', reason: '死叉' })
    expect(isHolding({ plan: 'cyb', ...pending })).toBe(true)
    expect(isHolding({ plan: 'cyb', state: 'sellToday' })).toBe(false)
    expect(holdingState(bars, day, () => result())).toEqual({ state: 'empty' })
    expect(holdingState([bar('2026-11-26')], day, () => result())).toEqual({ state: 'failed' })
  })

  it('uses Beijing time with a closing bar on weekends, holidays and before the session', () => {
    const at = (value: string) => reviewSession(new Date(value))
    expect(at('2026-11-27T06:59:59Z')).toEqual({ date: day, phase: 'pre' })
    expect(at('2026-11-27T07:00:00Z')).toEqual({ date: day, phase: 'close' })
    expect(at('2026-11-27T00:30:00Z')).toEqual({ date: '2026-11-26', phase: 'close' })
    expect(at('2026-11-28T06:00:00Z')).toEqual({ date: day, phase: 'close' })
    expect(at('2026-10-06T06:00:00Z')).toEqual({ date: '2026-09-30', phase: 'close' })
  })

  it('scales intraday OHLC to the adjusted series and uses the daily close after 15:00', () => {
    const bars = [bar('2026-11-26', 20), bar(day, 21), bar('2026-11-30', 99)]
    const quote = { ...bar(day, 11), open: 10.5, high: 12, low: 10, previousClose: 10 }
    expect(sessionBars(bars, { date: day, phase: 'pre' }, quote)).toEqual([
      bars[0], { date: day, open: 21, high: 24, low: 20, close: 22 },
    ])
    expect(sessionBars(bars, { date: day, phase: 'close' }, quote)).toEqual(bars.slice(0, 2))
    expect(() => sessionBars(bars, { date: day, phase: 'pre' }, { ...quote, date: '2026-11-26' })).toThrow()
  })

  it('keeps invalid or inaccessible local storage from breaking rendering or calculation results', () => {
    const snapshot: HoldingSnapshot = { date: day, phase: 'close', version: PLAN_VERSION, statuses: { '159967': { plan: 'cyb', state: 'hold' } } }
    expect(saveHoldingCache(snapshot)).toBe(true)
    expect(loadHoldingCache()).toEqual(snapshot)
    localStorage.setItem(HOLDING_CACHE_KEY, '{')
    expect(loadHoldingCache()).toBeNull()
    localStorage.setItem(HOLDING_CACHE_KEY, JSON.stringify({ ...snapshot, version: 'old' }))
    expect(loadHoldingCache()).toBeNull()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    expect(loadHoldingCache()).toBeNull()
    expect(saveHoldingCache(snapshot)).toBe(false)
  })

  it('shares benchmark requests and isolates failed instruments', async () => {
    const bars = Array.from({ length: 135 }, (_, i) => [
      new Date(Date.parse(day) - (134 - i) * 86_400_000).toISOString().slice(0, 10), '10', '10', '10', '10',
    ])
    const active = new Set<string>()
    let peak = 0
    const requested: string[] = []
    vi.stubEnv('VITE_MARKET_DIRECT', 'false')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const symbol = new URL(url, 'https://example.test').searchParams.get('symbol')!
      requested.push(symbol)
      active.add(symbol)
      peak = Math.max(peak, active.size)
      await Promise.resolve()
      active.delete(symbol)
      return { ok: symbol !== 'sz159967', json: async () => ({ data: { [symbol]: { hfqday: bars } } }) }
    }))
    const plan = new Map([['159967', 'cyb'], ['512760', 'cyb'], ['512480', 'hs']] as const)
    const answer = await calculateHoldings(plan, { date: day, phase: 'close' }, new AbortController().signal)
    expect(answer.statuses).toMatchObject({
      '159967': { state: 'failed' }, '512760': { state: 'empty' }, '512480': { state: 'empty' },
    })
    expect(requested.filter(symbol => symbol === 'sh510880')).toHaveLength(1)
    expect(peak).toBeLessThanOrEqual(4)
    vi.unstubAllEnvs()
  })
})
