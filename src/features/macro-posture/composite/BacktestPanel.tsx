import React, { useMemo } from 'react'
import { TableWrap } from '../../../components/ui'
import { formatNum1, formatNum2, formatPct1, singleSpreadLabel, TIER_ORDER_DEFENSE_LEFT } from './labels'
import TimelineChart from './TimelineChart'
import type { Backtest, CompositeFile, TierId, Variant } from './types'

const TIER_LABEL: Record<TierId, string> = {
  offense: '进攻',
  'lean-offense': '偏进攻',
  neutral: '中性',
  'lean-defense': '偏防守',
  defense: '防守',
}

const VARIANT_ORDER: Variant['id'][] = ['full', 'v20', 'macro', 'trend', 'static70', 'buyhold']

function orderVariants(rows: Variant[]): Variant[] {
  const rank = new Map(VARIANT_ORDER.map((id, i) => [id, i]))
  return [...rows].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))
}

function variantReadout(variants: Variant[]): string | null {
  const full = variants.find(v => v.id === 'full')
  const hold = variants.find(v => v.id === 'buyhold')
  if (!full || !hold) return null
  const cagrGap = full.cagr - hold.cagr
  const ddGap = full.maxDd - hold.maxDd
  const sharpeGap = full.sharpe - hold.sharpe
  const cagrTxt = formatPct1(cagrGap, { signed: true })
  const ddTxt = formatPct1(ddGap, { signed: true })
  const sharpeTxt = formatNum2(sharpeGap)
  const sharpeSigned = sharpeGap > 0 ? `+${sharpeTxt}` : sharpeTxt
  return `完整模型相对全程持有：年化差 ${cagrTxt}，最大回撤差 ${ddTxt}，夏普差 ${sharpeSigned}。`
}

export default function BacktestPanel({ data }: { data: CompositeFile }): JSX.Element {
  const bt: Backtest = data.backtest
  const tierDefs = new Map(data.tiers.map(t => [t.id, t]))
  const variants = useMemo(() => orderVariants(bt.variants), [bt.variants])
  const readout = useMemo(() => variantReadout(bt.variants), [bt.variants])
  const singles = bt.singles ?? []

  return (
    <section className="mp-backtest" id="mp-backtest" aria-labelledby="mp-backtest-title">
      <h2 id="mp-backtest-title">回测</h2>
      <p className="mp-section-lead">
        {bt.start} 至 {bt.end}，共 {bt.months} 个月。下方是完整模型相对几种简化规则的对照。
      </p>

      <h3>时间线</h3>
      <TimelineChart timeline={bt.timeline} />

      <h3>变体对比</h3>
      <TableWrap label="回测变体对比">
        <table className="mp-table" data-testid="mp-backtest-variants">
          <thead>
            <tr>
              <th scope="col">变体</th>
              <th scope="col">年化</th>
              <th scope="col">波动</th>
              <th scope="col">最大回撤</th>
              <th scope="col">夏普</th>
              <th scope="col">卡玛</th>
              <th scope="col">平均仓位</th>
              <th scope="col">年换档</th>
            </tr>
          </thead>
          <tbody>
            {variants.map(row => (
              <tr
                key={row.id}
                className={row.id === 'full' ? 'is-highlight' : undefined}
                data-variant={row.id}
              >
                <th scope="row">{row.label}</th>
                <td>{formatPct1(row.cagr)}</td>
                <td>{formatPct1(row.vol)}</td>
                <td>{formatPct1(row.maxDd)}</td>
                <td>{formatNum2(row.sharpe)}</td>
                <td>{formatNum2(row.calmar)}</td>
                <td>{formatPct1(row.avgEquity)}</td>
                <td>{formatNum1(row.switchesPerYear)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {readout ? (
        <p className="mp-backtest__readout" data-testid="mp-variants-readout">{readout}</p>
      ) : null}

      {singles.length > 0 && (
        <>
          <h3>单个指标转差后 12 个月</h3>
          <p className="mp-section-lead mp-backtest__singles-note">
            同步指标转差时市场常已接近底部，这正是 v2.1 加修复确认的原因。
          </p>
          <TableWrap label="单个指标转差后十二个月">
            <table className="mp-table" data-testid="mp-backtest-singles">
              <thead>
                <tr>
                  <th scope="col">指标</th>
                  <th scope="col">转差月数</th>
                  <th scope="col">与未转差时的 12 个月回报差</th>
                  <th scope="col">解读</th>
                  <th scope="col">12 个月为负的比例</th>
                </tr>
              </thead>
              <tbody>
                {singles.map(row => (
                  <tr key={row.componentId}>
                    <th scope="row">{row.label}</th>
                    <td>{row.negMonths}</td>
                    <td>{formatPct1(row.spread12, { signed: true })}</td>
                    <td>{singleSpreadLabel(row.spread12)}</td>
                    <td>{formatPct1(row.negHit12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}

      <h3>分档统计</h3>
      <TableWrap label="分档统计">
        <table className="mp-table" data-testid="mp-backtest-tiers">
          <thead>
            <tr>
              <th scope="col">档位</th>
              <th scope="col">月数</th>
              <th scope="col">占比</th>
              <th scope="col">后 3 月</th>
              <th scope="col">后 6 月</th>
              <th scope="col">后 12 月</th>
              <th scope="col">12 月中位</th>
              <th scope="col">12 月为负</th>
              <th scope="col">12 月回撤</th>
            </tr>
          </thead>
          <tbody>
            {TIER_ORDER_DEFENSE_LEFT.map(id => {
              const stats = bt.tiers[id]
              if (!stats) return null
              const label = tierDefs.get(id)?.label ?? TIER_LABEL[id]
              return (
                <tr key={id}>
                  <th scope="row">{label}</th>
                  <td>{stats.months}</td>
                  <td>{formatPct1(stats.share)}</td>
                  <td>{formatPct1(stats.fwd3, { signed: true })}</td>
                  <td>{formatPct1(stats.fwd6, { signed: true })}</td>
                  <td>{formatPct1(stats.fwd12, { signed: true })}</td>
                  <td>{formatPct1(stats.fwd12Median, { signed: true })}</td>
                  <td>{formatPct1(stats.neg12)}</td>
                  <td>{formatPct1(stats.maxDd12)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>

      <h3>衰退捕捉</h3>
      <TableWrap label="衰退捕捉">
        <table className="mp-table" data-testid="mp-backtest-recessions">
          <thead>
            <tr>
              <th scope="col">衰退起止</th>
              <th scope="col">首次偏防守</th>
              <th scope="col">
                提前月数
                <span className="mp-th-note">（最多计 12 个月）</span>
              </th>
              <th scope="col">说明</th>
            </tr>
          </thead>
          <tbody>
            {bt.recessions.map(row => (
              <tr key={`${row.start}-${row.end}`}>
                <th scope="row">{row.start} — {row.end}</th>
                <td>{row.firstDefensive ?? '—'}</td>
                <td>{row.leadMonths == null ? '—' : row.leadMonths}</td>
                <td>{row.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <h3>误报段落</h3>
      <TableWrap label="误报列表">
        <table className="mp-table">
          <thead>
            <tr>
              <th scope="col">起止</th>
              <th scope="col">月数</th>
              <th scope="col">其后 12 月回报</th>
              <th scope="col">其后 12 月回撤</th>
            </tr>
          </thead>
          <tbody>
            {bt.falseAlarms.map(row => (
              <tr key={`${row.start}-${row.end}`}>
                <th scope="row">{row.start} — {row.end}</th>
                <td>{row.months}</td>
                <td>{formatPct1(row.spxFwd12, { signed: true })}</td>
                <td>{formatPct1(row.maxDd12)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <h3>披露</h3>
      <ul className="mp-disclosures" data-testid="mp-disclosures">
        {bt.disclosures.map(text => <li key={text}>{text}</li>)}
      </ul>
    </section>
  )
}
