import { useEffect } from 'react'
import { useCompanies, type Company, type Market } from '../../data/companies'

export type MarketCompaniesSlice = {
  list: Company[]
  loading: boolean
  failed: boolean
}

/** 只在父组件挂载本市场时才调 useCompanies，避免空池/未出现市场仍发请求。 */
export default function MarketCompaniesLoader({
  market,
  onUpdate,
}: {
  market: Market
  onUpdate: (market: Market, slice: MarketCompaniesSlice | undefined) => void
}): null {
  const { list, loading, failed } = useCompanies(market)
  useEffect(() => {
    onUpdate(market, { list, loading, failed })
  }, [market, list, loading, failed, onUpdate])
  useEffect(() => () => onUpdate(market, undefined), [market, onUpdate])
  return null
}
