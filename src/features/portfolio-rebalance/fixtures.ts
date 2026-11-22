import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CompareSet, PriceBook, PriceIndex, RunInput, RunResult } from './types'

type RawFile = {
  series: Record<string, { dates: string[]; close: number[] }>
}

/** 测试夹具：腾讯拆股调整价，close 当作 adjClose（不含分红） */
export function loadAdjustedPriceBook(): PriceBook {
  const raw = JSON.parse(
    readFileSync(resolve('data-raw/portfolio-explore/prices-adjusted.json'), 'utf8'),
  ) as RawFile
  const book: PriceBook = {}
  for (const [symbol, series] of Object.entries(raw.series)) {
    book[symbol] = { dates: series.dates, adjClose: series.close }
  }
  return book
}

type RunResultFixture = Partial<Omit<RunResult, 'maxDrawdown'>> & { mdd?: number }

export function createRunResultFixture(options: RunResultFixture = {}): RunResult {
  const { mdd = -0.2, ...rest } = options
  const start = options.start ?? '2021-01-01'
  const end = options.end ?? '2026-01-01'
  const final = options.final ?? 1.5
  return {
    start,
    end,
    startAdjusted: false,
    dates: [start, end],
    equity: [1, final],
    final,
    finalAmount: final * 1_000_000,
    cagr: 0.1,
    vol: 0.15,
    maxDrawdown: { value: mdd, peak: start, trough: end },
    cer: 0.05,
    trades: [],
    tradeCount: 4,
    annualTurnover: 0.1,
    totalCost: 0.001,
    finalWeights: {},
    yearly: [],
    distance: [],
    episodes: [],
    ...rest,
  }
}

export function createConclusionFixture(): {
  comparison: CompareSet
  input: RunInput
  index: PriceIndex
} {
  const hold = createRunResultFixture({ cagr: 0.1, final: 1.5, mdd: -0.25, tradeCount: 0 })
  const active = createRunResultFixture({ cagr: 0.13, final: 1.9, mdd: -0.3, tradeCount: 4 })
  const comparison: CompareSet = {
    custom: { hold, active },
    equal: {
      hold: createRunResultFixture({ tradeCount: 0 }),
      active: createRunResultFixture(),
    },
    benchmarks: { QQQ: null, QQQE: null },
    leaveOneOut: [
      { dropped: 'AVGO', hold, active: createRunResultFixture({ cagr: 0.12, final: 1.7, mdd: -0.32 }) },
      { dropped: 'META', hold, active: createRunResultFixture({ cagr: 0.135, final: 1.85, mdd: -0.29 }) },
      { dropped: 'CB', hold, active: createRunResultFixture({ cagr: 0.14, final: 2, mdd: -0.38 }) },
    ],
  }
  const input: RunInput = {
    symbols: ['AVGO', 'META', 'CB'],
    weights: [0.4, 0.35, 0.25],
    rule: { kind: 'relative', pct: 0.4 },
    cost: 0.001,
    initial: 1_000_000,
  }
  const index: PriceIndex = {
    schemaVersion: 1,
    generatedAt: '2026-11-22T00:00:00Z',
    items: [
      { symbol: 'AVGO', name: '博通', group: 'growth', first: startDate(), last: endDate(), asOf: endDate(), status: 'ok', dividendStatus: 'ok' },
      { symbol: 'META', name: 'Meta', group: 'highVol', first: startDate(), last: endDate(), asOf: endDate(), status: 'ok', dividendStatus: 'ok' },
      { symbol: 'CB', name: '安达保险', group: 'stable', first: startDate(), last: endDate(), asOf: endDate(), status: 'ok', dividendStatus: 'ok' },
    ],
  }
  return { comparison, input, index }
}

function startDate(): string {
  return '2021-01-01'
}

function endDate(): string {
  return '2026-11-20'
}
