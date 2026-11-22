import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PriceBook } from './types'

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
