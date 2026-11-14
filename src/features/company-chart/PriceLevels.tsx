import React from 'react'
import { Link } from 'react-router-dom'
import type { Market } from '../../data/companies'
import { buildPriceLevels, formatChange, positionOf, type LevelKey, type PriceLevelsInput, type PriceLevelsModel } from './levelsModel'
import './company-chart.css'

/** 刻度位置只通过 CSS 变量 --cc-pos 传给样式表（left: var(--cc-pos)） */
const posVar = (pct: number): React.CSSProperties => ({ '--cc-pos': `${pct}%` } as React.CSSProperties)

const SHORT: Record<LevelKey, string> = { bear: '悲观', base: '基准', bull: '乐观', 'dcf-buy': 'DCF 买入', 'dcf-fair': 'DCF 合理' }

const fmt = (n: number): string => n.toLocaleString('zh-CN', { maximumFractionDigits: n >= 100 ? 1 : 2 })

/** 涨跌色按市场：美股绿涨红跌，沪深/港股红涨绿跌；同时带正负号，不只靠颜色 */
export const changeTone = (market: Market, change: number): string =>
  change === 0 ? '' : (change > 0) === (market === 'cn' || market === 'hk') ? 'cc-tone-red' : 'cc-tone-green'

/** 刻度标记；同一行（情景在上，DCF 与现价在下）相距不足 12% 的标签省略，完整数值见下方列表 */
function scaleMarks(levels: PriceLevelsModel['levels'], anchor: PriceLevelsModel['anchor'], scale: { min: number; max: number }): { key: string; pos: number; label?: string }[] {
  const marks = [
    ...levels.filter(l => l.comparable).map(l => ({ key: l.key as string, pos: positionOf(l.value, scale), label: SHORT[l.key], row: l.key.startsWith('dcf') ? 1 : 0 })),
    ...(anchor ? [{ key: 'anchor', pos: positionOf(anchor.price, scale), label: '现价', row: 1 }] : []),
  ].sort((a, b) => (a.key === 'anchor' ? -1 : b.key === 'anchor' ? 1 : a.pos - b.pos))
  const placed: { pos: number; row: number }[] = []
  return marks.map(m => {
    const clash = placed.some(p => p.row === m.row && Math.abs(p.pos - m.pos) < 12)
    if (!clash) placed.push(m)
    return { key: m.key, pos: m.pos, label: clash ? undefined : m.label }
  })
}

export function PriceLevelsView({ model, market, scenariosHref }: { model: PriceLevelsModel; market: Market; scenariosHref?: string }): JSX.Element {
  const { anchor, levels, scale, skipped } = model
  if (model.state === 'empty') {
    return (
      <div className="cc-levels cc-levels--empty" role="note">
        <p>本公司还没有三情景价或 DCF 价位，刻度条不画默认值。{' '}
          <Link to="/research-notes?tab=method" className="rn-link">研究标准</Link>
        </p>
        {skipped.length > 0 && <p className="cc-levels__skipped">情景价写有多个价格，无法读出单一数值：{skipped.join('；')}</p>}
        {anchor && <p className="cc-levels__anchor-only">价格锚点 {fmt(anchor.price)}{anchor.date ? `（${anchor.date}）` : ''}</p>}
      </div>
    )
  }
  const stale = !!anchor?.stale
  return (
    <figure className={`cc-levels${stale ? ' is-stale' : ''}`}>
      <figcaption className="cc-levels__caption">
        研究价位刻度{anchor ? `：价格锚点 ${fmt(anchor.price)}${anchor.date ? `（${anchor.date}）` : ''}` : '：缺价格锚点，不计算距现价'}
        {stale && anchor && <span className="cc-levels__stale">价格锚点 {anchor.days} 天前，百分比按旧价算</span>}
      </figcaption>
      {scale && (
        <div className="cc-scale" aria-hidden="true">
          <div className="cc-scale__track" />
          {scaleMarks(levels, anchor, scale).map(m => (
            <span key={m.key} className={`cc-scale__mark cc-scale__mark--${m.key}`} style={posVar(m.pos)}>
              {m.label && <span className="cc-scale__label">{m.label}</span>}
            </span>
          ))}
        </div>
      )}
      <dl className="cc-levels__list">
        {levels.map(l => (
          <div key={l.key} className={`cc-levels__row${l.comparable ? '' : ' is-muted'}`}>
            <dt>{l.label}{l.note && <small>（{l.note}）</small>}</dt>
            <dd>
              <span className="cc-levels__value">{fmt(l.value)}{l.currency ? ` ${l.currency}` : ''}</span>
              {l.comparable && l.change != null
                ? <span className={`cc-levels__change ${stale ? 'is-stale' : changeTone(market, l.change)}`}>距现价 {formatChange(l.change)}</span>
                : l.reason && <span className="cc-levels__reason">{l.reason}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {skipped.length > 0 && <p className="cc-levels__skipped">未画出：{skipped.join('；')}（写有多个价格，无法读出单一数值）</p>}
      {scenariosHref && <p className="cc-levels__foot"><a href={scenariosHref} className="rn-link">核对三情景假设 →</a></p>}
    </figure>
  )
}

export default function PriceLevels({ input, scenariosHref }: { input: PriceLevelsInput; scenariosHref?: string }): JSX.Element {
  return <PriceLevelsView model={buildPriceLevels(input)} market={input.market} scenariosHref={scenariosHref} />
}
