import React, { useMemo } from 'react'
import { TableWrap } from '../../../components/ui'
import { formatNum1, formatNum2, formatPct1, formatSharePct, singleSpreadLabel, TIER_ORDER_DEFENSE_LEFT } from './labels'
import TimelineChart from './TimelineChart'
import type { Backtest, CompositeFile, TierId, Variant } from './types'

const TIER_LABEL: Record<TierId, string> = {
  offense: '进攻',
  'lean-offense': '偏进攻',
  neutral: '中性',
  'lean-defense': '偏防守',
  defense: '防守',
}

function conservativeVariant(variants: Variant[]): Variant | undefined {
  return variants.find(variant => variant.id === 'noNfci')
}

function variantReadout(variants: Variant[]): string | null {
  const conservative = conservativeVariant(variants)
  const hold = variants.find(v => v.id === 'buyhold')
  if (!conservative || !hold || hold.maxDd === 0) return null
  const drawdownShare = Math.abs(conservative.maxDd / hold.maxDd) * 10
  return `按最保守口径，年化 ${formatPct1(conservative.cagr)}、最大回撤 ${formatPct1(conservative.maxDd)}，仍约为持有标普回撤的 ${drawdownShare.toFixed(1)} 成。`
}

function defenseNote(tiers: Backtest['tiers']): string | null {
  const defense = tiers.defense
  const leanOffense = tiers['lean-offense']
  if (!defense || !leanOffense) return null
  const med = formatPct1(defense.fwd12Median, { signed: true })
  const neg = formatPct1(defense.neg12)
  const ddDef = formatPct1(defense.maxDd12)
  const ddOff = formatPct1(leanOffense.maxDd12)
  return `为什么防守档之后的平均回报不低：防守档随后 12 个月中位数 ${med}、为负比例 ${neg}、平均最大回撤 ${ddDef}；偏进攻档平均最大回撤 ${ddOff}。本指标的价值主要在压低大回撤，而不是抬高平均回报。`
}

function formatReturnCell(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '待实现'
  return formatPct1(value, { signed: true })
}

export default function BacktestPanel({ data }: { data: CompositeFile }): JSX.Element {
  const bt: Backtest = data.backtest
  const tierDefs = new Map(data.tiers.map(t => [t.id, t]))
  const variants = bt.variants
  const conservative = conservativeVariant(variants)
  const buyhold = variants.find(variant => variant.id === 'buyhold')
  const readout = useMemo(() => variantReadout(bt.variants), [bt.variants])
  const singles = bt.singles ?? []
  const costs = bt.costs
  const live = bt.live
  const defenseExplain = useMemo(() => defenseNote(bt.tiers), [bt.tiers])

  return (
    <section className="mp-backtest" id="mp-backtest" aria-labelledby="mp-backtest-title">
      <h2 id="mp-backtest-title">回测</h2>
      <p className="mp-section-lead" data-testid="mp-backtest-summary">
        {bt.start} 至 {bt.end}，共 {bt.months} 个月。
        {conservative && buyhold ? (
          <>最保守口径（实时数据且去掉金融条件指数）：年化 {formatPct1(conservative.cagr)}、最大回撤 {formatPct1(conservative.maxDd)}；同期持有标普 {formatPct1(buyhold.cagr)}、{formatPct1(buyhold.maxDd)}。</>
        ) : '下方是完整模型相对几种简化规则的对照。'}
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
                className={row.id === 'noNfci' ? 'is-highlight' : undefined}
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
      <ul className="mp-backtest__variant-notes" data-testid="mp-variant-notes">
        <li><strong>完整模型</strong>＝修订后数据。</li>
        <li><strong>实时数据</strong>＝当时已发布版本（缺当时版本的早年月份沿用修订值）。</li>
        <li><strong>去掉金融条件指数</strong>＝再排除 2011 年前回推的金融条件指数（最保守口径）。</li>
      </ul>
      {readout ? (
        <p className="mp-backtest__readout" data-testid="mp-variants-readout">{readout}</p>
      ) : null}

      {costs?.rows?.length ? (
        <div className="mp-backtest__costs" data-testid="mp-backtest-costs">
          <h3>交易成本敏感度</h3>
          <p className="mp-section-lead">
            按完整模型年换手约 {formatNum1(costs.turnoverPerYear)} 次估算单边成本对年化的拖累。
          </p>
          <TableWrap label="交易成本敏感度">
            <table className="mp-table">
              <thead>
                <tr>
                  <th scope="col">单边成本</th>
                  <th scope="col">年化</th>
                  <th scope="col">年拖累</th>
                </tr>
              </thead>
              <tbody>
                {costs.rows.map(row => (
                  <tr key={row.cost}>
                    <th scope="row">{formatPct1(row.cost)}</th>
                    <td>{formatPct1(row.cagr)}</td>
                    <td>{formatPct1(row.drag, { signed: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
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
      {defenseExplain ? (
        <p className="mp-backtest__defense-note" data-testid="mp-defense-note">{defenseExplain}</p>
      ) : null}

      {live ? (
        <div className="mp-backtest__live" data-testid="mp-backtest-live">
          <h3>前推记录（规则冻结于 2026-11-23）</h3>
          <p className="mp-section-lead">
            这部分是真正的样本外记录，会逐月累积。规则自 {live.since} 起按 {live.ruleVersion} 冻结。
          </p>
          <TableWrap label="前推记录">
            <table className="mp-table">
              <thead>
                <tr>
                  <th scope="col">月份</th>
                  <th scope="col">档位</th>
                  <th scope="col">仓位</th>
                  <th scope="col">之后标普回报</th>
                  <th scope="col">之后组合回报</th>
                </tr>
              </thead>
              <tbody>
                {(live.rows ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5}>尚无前推行，待次月起累积。</td>
                  </tr>
                ) : (
                  live.rows.map(row => (
                    <tr key={row.d}>
                      <th scope="row">{row.d}</th>
                      <td>{row.final ? (tierDefs.get(row.final)?.label ?? TIER_LABEL[row.final]) : '—'}</td>
                      <td>{formatSharePct(row.equityShare) ?? '—'}</td>
                      <td>{formatReturnCell(row.spxReturn)}</td>
                      <td>{formatReturnCell(row.portfolioReturn)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableWrap>
        </div>
      ) : null}

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
