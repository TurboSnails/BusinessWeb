export type Candle = { date: string; close: number; high: number; low: number }

export type Trade = {
  manual?: boolean
  id?: string
  date: string
  side: string
  price: number
  amount: number
  shares: number
  capitalUsed?: number
  pnl: number
  quantity?: number
  modelPrice?: number
  modelAmount?: number
  modelQuantity?: number
}

export type EquityPoint = {
  date: string
  current: number
  positionValue: number
  capitalUsed: number
  pnl: number
}

export type GridParams = {
  name: string
  code: string
  date: string
  initialPrice: number
  initialAmount: number
  step: number
  rebound: number
  pullback: number
  gridAmount: number
  id?: number
}

export type GridResult = {
  range: string
  current: number
  lastTradeDate: string
  lastTrade: number
  nextBuy: number
  nextSell: number
  buyTrigger: number
  sellTrigger: number
  lowSince?: number
  highSince?: number
  pnl: number
  value: number
  realized: number
  maxCapital: number
  buys: number
  sells: number
  trades: Trade[]
  series: EquityPoint[]
  position?: number
  warnings?: string[]
}

export type Overrides = Record<string, number>
export type ParamStage = { until: string; step: number; rebound: number; pullback: number }
export type ManualTrade = { id: string; date: string; side: '买入' | '卖出'; price: number; shares: number }
export type Adjustments = {
  price?: Overrides
  amount?: Overrides
  shares?: Overrides
  params?: ParamStage[]
  manual?: ManualTrade[]
  removed?: string[]
  anchor?: { after: string; price: number }
}

export type Backup = {
  id: string
  at: string
  date: string
  price: number
  pnl: number
  holding: number
  position: number
  capital: number
  maxCapital: number
  buys: number
  sells: number
  lastTrade: number
  lastTradeDate: string
  row: GridParams
  priceOverrides?: Overrides
  amountOverrides?: Overrides
  sharesOverrides?: Overrides
  paramHistory?: ParamStage[]
  manualTrades?: ManualTrade[]
  removedTrades?: string[]
}

export type SavedRecord = {
  id: string
  savedAt: string
  updatedAt?: string
  schemaVersion?: number
  dataSource?: string
  dataFetchedAt?: string
  algorithmVersion?: string
  feeVersion?: string
  endDate?: string
  priceOverrides?: Overrides
  amountOverrides?: Overrides
  sharesOverrides?: Overrides
  paramHistory?: ParamStage[]
  manualTrades?: ManualTrade[]
  removedTrades?: string[]
  backups?: Backup[]
  row: GridParams
  result: GridResult
}

export type Quote = { code: string; name: string; price: number; high: number; low: number; date: string }

export const isEtf = (code: string): boolean => /^(5\d{5}|1[5-8]\d{4})$/.test(code.trim())
export const symbolOf = (code: string): string => `${/^[569]/.test(code.trim()) ? 'sh' : 'sz'}${code.trim()}`
