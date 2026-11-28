export type UsDataTab = 'movers' | 'ipo' | 'sectors' | 'putcall'
export type MoverMode = 'gainers' | 'losers' | 'active' | 'surge'

export interface MoverRow {
  symbol: string
  name: string
  price: number
  changePct: number
  volume: number
  volumeRatio: number | null
  marketCap: number
}

export interface MoversData {
  mode: MoverMode
  /** 成交量激增榜：部分筛选来源取数失败时为 true */
  partial?: boolean
  rows: MoverRow[]
  asOf: string | null
  delayedBy: number | null
  source: string
  fetchedAt: string
}

export interface IpoRow {
  symbol: string | null
  company: string
  exchange: string | null
  date: string | null
  filedDate: string | null
  price: string | null
  shares: number | null
  amount: number | null
  status: string | null
}

export type IpoGroup = 'upcoming' | 'priced' | 'filed' | 'withdrawn'

export interface IpoData {
  month: string
  groups: Record<IpoGroup, IpoRow[]>
  sourceUpdated: string | null
  source: string
  sourceUrl: string
  fetchedAt: string
}

export type ReturnPeriod = 'day' | 'week' | 'month' | 'quarter' | 'ytd'

export interface SectorRow {
  symbol: string
  name: string
  group: 'benchmark' | 'sector' | 'theme'
  returns: Record<ReturnPeriod, number | null>
  date: string
  time: string | null
  delayedBy: number | null
}

export interface SectorData {
  rows: SectorRow[]
  source: string
  fetchedAt: string
}

export interface PutCallRatio {
  ratio: number
  callVolume: number
  putVolume: number
}

export interface PutCallRow {
  date: string
  total: PutCallRatio
  equity: PutCallRatio
  index: PutCallRatio
}

export interface PricePoint {
  date: string
  close: number
}

export interface PutCallData {
  rows: PutCallRow[]
  spy: PricePoint[]
  asOf: string
  source: string
  sourceUrl: string
  fetchedAt: string
  requestedDays: number
  missingDays: number
}
