import { previousTradingDate, shanghaiDate } from '../../services/limitUp'
import { symbolOf } from '../grid-trading/types'
import { fetchPlanBars } from '../etf-signal-plans/bars'
import { PLAN_WARMUP, cybPlan, hsPlan, macdPlan, type PlanBar, type PlanKey, type PlanResult } from '../etf-signal-plans/plan-trades'
import { H1_CODES, R2_CODES, styleRatio } from '../etf-signal-plans/ratio'

export const HOLDING_CACHE_KEY = 'businessweb.etf-review.holdings.v1'
export const PLAN_VERSION = '2026-11-18-hfq-1'
const NEXT_BAR = '9999-12-31'
const PHASE_TIME_ZONE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const HOLDING_LABELS = {
  hold: '持有', buy: '明日买', sellToday: '今日卖', sellNext: '明日卖', empty: '空仓', failed: '取数失败',
} as const

type HoldingState = keyof typeof HOLDING_LABELS
export type Holding = { plan: PlanKey; state: HoldingState; reason?: string }
type Session = { date: string; phase: 'pre' | 'close' }
export type HoldingSnapshot = Session & { version: typeof PLAN_VERSION; statuses: Record<string, Holding> }
type LiveBar = PlanBar & { previousClose: number }

export function reviewSession(now: Date): Session {
  const today = shanghaiDate(now)
  const last = previousTradingDate(today)
  const time = PHASE_TIME_ZONE.format(now)
  if (last !== today || time >= '15:00') return { date: last, phase: 'close' }
  if (time < '09:30') {
    return { date: previousTradingDate(new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10)), phase: 'close' }
  }
  return { date: today, phase: 'pre' }
}

export function sessionBars(bars: PlanBar[], session: Session, quote?: LiveBar): PlanBar[] {
  const history = bars.filter(bar => bar.date <= session.date)
  if (session.phase === 'close') return history
  const prior = history.filter(bar => bar.date < session.date)
  const last = prior.at(-1)
  if (!last || !quote || quote.date !== session.date || !(quote.previousClose > 0)) throw new Error('当日盘中行情未取得')
  // 原始实时报价按昨收缩放，接回后复权日线。
  const scale = last.close / quote.previousClose
  return [...prior, {
    date: session.date, open: quote.open * scale, high: quote.high * scale,
    low: quote.low * scale, close: quote.close * scale,
  }]
}

export function holdingState(bars: PlanBar[], date: string, run: (bars: PlanBar[]) => PlanResult): Omit<Holding, 'plan'> {
  const last = bars.at(-1)
  if (!last || last.date !== date) return { state: 'failed' }
  const result = run(bars)
  const todaySell = result.signals.find(signal => signal.side === 'sell' && signal.date === date && signal.signalDate === date && !signal.forced)
  if (todaySell) return { state: 'sellToday', reason: todaySell.reason }
  if (result.pendingBuy?.signalDate === date) return { state: 'buy', reason: result.pendingBuy.reason }
  if (result.holding) {
    // 附加一根只用于识别已挂起的 T+1 次日开盘卖出，走势及持仓仍取实际日线。
    const next = { date: NEXT_BAR, open: last.close, high: last.close, low: last.close, close: last.close }
    const nextSell = run([...bars, next]).signals.find(signal => signal.side === 'sell' && signal.date === NEXT_BAR && signal.signalDate === date && !signal.forced)
    if (nextSell) return { state: 'sellNext', reason: nextSell.reason }
    return { state: 'hold' }
  }
  return { state: 'empty' }
}

export const isHolding = (holding?: Holding): boolean => holding?.state === 'hold' || holding?.state === 'sellNext'

export function loadHoldingCache(): HoldingSnapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(HOLDING_CACHE_KEY) ?? 'null') as HoldingSnapshot | null
    if (!value || value.version !== PLAN_VERSION || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
      || !['pre', 'close'].includes(value.phase) || !value.statuses || typeof value.statuses !== 'object'
      || Array.isArray(value.statuses) || !Object.entries(value.statuses).every(([code, entry]) =>
        /^\d{6}$/.test(code) && entry && ['cyb', 'hs', 'macd'].includes(entry.plan)
        && Object.hasOwn(HOLDING_LABELS, entry.state) && (entry.reason === undefined || typeof entry.reason === 'string'))) return null
    return value
  } catch { return null }
}

export function saveHoldingCache(snapshot: HoldingSnapshot): boolean {
  try { localStorage.setItem(HOLDING_CACHE_KEY, JSON.stringify(snapshot)); return true } catch { return false }
}

async function liveBar(code: string, fetcher: typeof fetch): Promise<LiveBar> {
  const symbol = /^(sh|sz)\d{6}$/.test(code) ? code : symbolOf(code)
  const url = import.meta.env.VITE_MARKET_DIRECT === 'true' ? `https://qt.gtimg.cn/q=${symbol}`
    : `/api/grid-market?${new URLSearchParams({ kind: 'quotes', symbols: symbol })}`
  const response = await fetcher(url)
  if (!response.ok) throw new Error('实时报价暂不可用')
  const text = new TextDecoder('gbk').decode(await response.arrayBuffer())
  const fields = text.match(/v_(?:sh|sz)\d{6}="([^"]*)"/)?.[1].split('~') ?? []
  const stamp = fields[30] ?? ''
  const [open, high, low, close, previousClose] = [5, 33, 34, 3, 4].map(index => Number(fields[index]))
  if (!/^\d{8}/.test(stamp) || ![open, high, low, close, previousClose].every(value => Number.isFinite(value) && value > 0)
      || low > high) throw new Error('实时报价暂不可用')
  return {
    date: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
    open, high: Math.max(high, open, close), low: Math.min(low, open, close), close, previousClose,
  }
}

const ratiosFor = { cyb: R2_CODES, hs: H1_CODES } as const
const MAX_CONCURRENT = 4

export async function calculateHoldings(plans: Map<string, PlanKey>, session: Session, signal: AbortSignal): Promise<HoldingSnapshot> {
  const symbols = new Set(plans.keys())
  for (const plan of new Set(plans.values())) {
    if (plan === 'macd') continue
    symbols.add(ratiosFor[plan].growth)
    symbols.add(ratiosFor[plan].defensive)
  }
  const jobs = [...symbols].values()
  const prices = new Map<string, PlanBar[]>()
  const fetcher: typeof fetch = (input, init) => fetch(input, {
    ...init, cache: 'no-cache', signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  })
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, symbols.size) }, async () => {
    for (const symbol of jobs) {
      if (signal.aborted) return
      try {
        const { bars } = await fetchPlanBars(symbol, fetcher)
        if (signal.aborted) return
        const quote = session.phase === 'pre' ? await liveBar(symbol, fetcher) : undefined
        prices.set(symbol, sessionBars(bars, session, quote))
      } catch { /* Missing data will mark only dependent symbols as failed. */ }
    }
  }))

  const ratios = new Map<PlanKey, ReturnType<typeof styleRatio>>()
  for (const plan of ['cyb', 'hs'] as const) {
    const { growth, defensive } = ratiosFor[plan]
    const ratio = styleRatio(prices.get(growth) ?? [], prices.get(defensive) ?? [])
    if (ratio.at(-1)?.date === session.date && ratio.at(-1)?.bull != null) ratios.set(plan, ratio)
  }
  const statuses: HoldingSnapshot['statuses'] = {}
  for (const [code, plan] of plans) {
    const bars = prices.get(code)
    const ratio = ratios.get(plan)
    if (!bars || bars.length <= PLAN_WARMUP || (plan !== 'macd' && !ratio)) statuses[code] = { plan, state: 'failed' }
    else {
      const run = plan === 'macd' ? macdPlan : plan === 'cyb' ? (input: PlanBar[]) => cybPlan(input, ratio!) : (input: PlanBar[]) => hsPlan(input, ratio!)
      statuses[code] = { plan, ...holdingState(bars, session.date, run) }
    }
  }
  return { ...session, version: PLAN_VERSION, statuses }
}
