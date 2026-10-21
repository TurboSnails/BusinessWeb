import React from 'react'
import type { EtfTechRecord, TechPeriod } from '../data/etfTechnical'
import { fmt } from '../data/etfTechnical'

const PERIODS: Array<['day' | 'week' | 'month', string]> = [['day', '日'], ['week', '周'], ['month', '月']]
const tone = (p: TechPeriod): string => (p.ma === '多头' ? 'up' : p.ma === '空头' ? 'down' : 'flat')

function detail(label: string, p: TechPeriod): string {
  if (p.ma == null) return `${label}线：K 线不足 20 根，不判断`
  const unfinished = p.complete ? '' : '（本周期未结束，随行情变化）'
  return `${label}线${unfinished}：均线${p.ma}；MACD ${p.macd ?? '—'}（DIF ${fmt(p.dif, 4)} / DEA ${fmt(p.dea, 4)} / 柱 ${fmt(p.histogram, 4)}）；RSI14 ${fmt(p.rsi, 1)}${p.rsiState ? `（${p.rsiState}）` : ''}`
}

export default function EtfTechCell({ rec }: { rec: EtfTechRecord | undefined }): JSX.Element {
  if (!rec) return <span className="etf-empty-cell">—</span>
  return (
    <div className="etf-tech">
      {PERIODS.map(([key, label]) => {
        const p = rec[key]
        return (
          <span key={key} className={`etf-tech__chip etf-tech__chip--${tone(p)}`} title={detail(label, p)}>
            <b>{label}</b>{p.ma ?? '—'}{p.macd ? <i>· {p.macd}</i> : null}
          </span>
        )
      })}
      <span className="etf-tech__rsi" title="日线 RSI14：≥70 超买，≤30 超卖">RSI {fmt(rec.day.rsi, 0)}{rec.day.rsiState && rec.day.rsiState !== '中性' ? ` ${rec.day.rsiState}` : ''}</span>
    </div>
  )
}
