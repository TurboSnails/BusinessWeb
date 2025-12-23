export type ExampleData = {
  message: string
}

export type StockQuote = {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume?: number
  market?: string
}

export type MarketData = {
  usStocks: StockQuote[]
  chinaIndices: StockQuote[]
  hkIndices: StockQuote[]
  timestamp: string
}
