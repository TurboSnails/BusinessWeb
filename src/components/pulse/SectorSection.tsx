import type { SectorCategory, SectorData } from '../../types'
import { TrendingUp, TrendingDown } from 'lucide-react'
import '../../styles/pulse.css'

interface SectorSectionProps {
  category: SectorCategory
}

const formatPercent = (percent: number): string => `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`

// amount 单位是万元，转换为合适的显示
const formatAmount = (amount: number): string => {
  if (amount >= 10000) return `${(amount / 10000).toFixed(1)}亿`
  if (amount >= 1) return `${amount.toFixed(1)}万`
  return `${(amount * 10000).toFixed(0)}元`
}

function SectorCard({ sector }: { sector: SectorData }): JSX.Element {
  const isPositive = sector.changePercent >= 0
  const rsiTone = sector.rsi === undefined ? '' : sector.rsi >= 70 ? ' is-hot' : sector.rsi <= 30 ? ' is-cold' : ''
  return (
    <div className={isPositive ? 'pulse-sector-card is-up' : 'pulse-sector-card is-down'}>
      <div className="pulse-sector-card__head">
        <span className="pulse-sector-card__name">{sector.name}</span>
        <div className="pulse-sector-card__right">
          {sector.rsi !== undefined && <span className={`pulse-sector-card__rsi${rsiTone}`}>RSI {sector.rsi.toFixed(0)}</span>}
          <span className="pulse-sector-card__pct">{formatPercent(sector.changePercent)}</span>
        </div>
      </div>
      <div className="pulse-sector-card__meta">
        <span>成交额: <strong>{formatAmount(sector.amount)}</strong></span>
        {sector.stockCount > 0 && <><span aria-hidden="true">•</span><span>成分股: <strong>{sector.stockCount}</strong></span></>}
      </div>
    </div>
  )
}

export const SectorSection: React.FC<SectorSectionProps> = ({ category }) => {
  const upSectors = category.data
    .filter(s => s.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 15)
  const downSectors = category.data
    .filter(s => s.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 15)

  return (
    <section className="ui-card pulse-sector" aria-label={category.title}>
      <div className="pulse-category__head" style={{ background: category.bgColor, borderLeftColor: category.color }}>
        <span className="pulse-category__icon" aria-hidden="true">{category.icon}</span>
        <span className="pulse-category__title" style={{ color: category.color }}>{category.title}</span>
      </div>

      {upSectors.length > 0 && (
        <>
          <div className="pulse-sector__group is-up"><TrendingUp size={16} aria-hidden="true" /> 涨幅前15</div>
          <div className="pulse-sector__grid">{upSectors.map(s => <SectorCard key={s.code} sector={s} />)}</div>
        </>
      )}

      {downSectors.length > 0 && (
        <>
          <div className="pulse-sector__group is-down"><TrendingDown size={16} aria-hidden="true" /> 跌幅前15</div>
          <div className="pulse-sector__grid">{downSectors.map(s => <SectorCard key={s.code} sector={s} />)}</div>
        </>
      )}

      {upSectors.length === 0 && downSectors.length === 0 && (
        <div className="pulse-category__empty">{category.data.length === 0 ? '暂无数据' : '加载中…'}</div>
      )}
      {upSectors.length > 0 && downSectors.length === 0 && <p className="pulse-note">暂无下跌板块数据</p>}
      {upSectors.length === 0 && downSectors.length > 0 && <p className="pulse-note">暂无上涨板块数据</p>}
    </section>
  )
}
