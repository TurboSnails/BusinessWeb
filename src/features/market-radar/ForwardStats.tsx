import React from 'react'
import { useOverflowFade } from '../../hooks/useOverflowFade'
import { TIER_LABEL, TIER_ORDER_DEFENSE_LEFT, formatPct1, visibleText } from './labels'
import type { RadarFile, RadarForwardStats } from './types'

const HEAT_ORDER = ['cold', 'mid', 'hot'] as const
/** 结论文案顺序：偏热 → 居中 → 偏冷 */
const HEAT_SUMMARY_ORDER = ['hot', 'mid', 'cold'] as const
const HEAT_LABEL = { cold: '偏冷', mid: '居中', hot: '偏热' } as const

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return visibleText(formatPct1(value))
}

function fmtShare(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return visibleText(formatPct1(value))
}

function MonthsCell({ stats }: { stats: RadarForwardStats }): JSX.Element {
  if (stats.months === 0) return <td className="num">—</td>
  return (
    <td className="num">
      {stats.months}
      {stats.months < 30 ? <small className="mr-fwd__sparse">样本少</small> : null}
    </td>
  )
}

function StatsCells({ stats }: { stats: RadarForwardStats }): JSX.Element {
  if (stats.months === 0) {
    return (
      <>
        <td className="num">—</td>
        <td className="num">—</td>
        <td className="num">—</td>
        <td className="num">—</td>
      </>
    )
  }
  return (
    <>
      <MonthsCell stats={stats} />
      <td className="num">{fmtPct(stats.fwd12)}</td>
      <td className="num">{fmtShare(stats.neg12)}</td>
      <td className="num">{fmtPct(stats.maxDd12)}</td>
    </>
  )
}

function valuePhrase(stats: RadarForwardStats): string {
  if (stats.months === 0) return '没有出现过'
  const pct = fmtPct(stats.fwd12)
  return stats.months < 30 ? `${pct}（样本少）` : pct
}

/** 数字前留空格，文字短语（「没有出现过」）直接接在名称后 */
function labelled(name: string, phrase: string): string {
  return /^[+\-−\d]/.test(phrase) ? `${name} ${phrase}` : `${name}${phrase}`
}

/** 冷热结论文案 */
export function heatSummarySentence(
  heatStats: RadarFile['backtest']['heatStats'],
): string {
  const by = new Map(heatStats.map(row => [row.heat, row]))
  const allParts = HEAT_SUMMARY_ORDER.map((heat, i) => {
    const row = by.get(heat)
    const phrase = row ? valuePhrase(row.all) : '—'
    if (i === 0) return `${HEAT_LABEL[heat]}的月份之后 12 个月平均 ${phrase}`
    return labelled(HEAT_LABEL[heat], phrase)
  })
  const sinceParts = HEAT_SUMMARY_ORDER.map(heat => {
    const row = by.get(heat)
    const phrase = row ? valuePhrase(row.since2000) : '没有出现过'
    return labelled(HEAT_LABEL[heat], phrase)
  })
  return `${allParts.join('，')}；2000 年以来${sinceParts.join('，')}。`
}

/** 档位结论文案（防守 → 进攻） */
export function tierSummarySentence(
  tierStats: RadarFile['backtest']['tierStats'],
): string {
  const by = new Map(tierStats.map(row => [row.tier, row]))
  const allParts = TIER_ORDER_DEFENSE_LEFT.map((tier, i) => {
    const row = by.get(tier)
    const phrase = row ? valuePhrase(row.all) : '—'
    if (i === 0) return `${TIER_LABEL[tier]}的月份之后 12 个月平均 ${phrase}`
    return labelled(TIER_LABEL[tier], phrase)
  })
  const sinceParts = TIER_ORDER_DEFENSE_LEFT.map(tier => {
    const row = by.get(tier)
    const phrase = row ? valuePhrase(row.since2000) : '没有出现过'
    return labelled(TIER_LABEL[tier], phrase)
  })
  return `${allParts.join('，')}；2000 年以来${sinceParts.join('，')}。`
}

function FadeTable({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): JSX.Element {
  const { ref } = useOverflowFade<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className="ui-table-wrap ui-table-wrap--sticky mr-fwd__scroll mr-bt__fade"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  )
}

export default function ForwardStats({
  tierStats,
  heatStats,
}: {
  tierStats: RadarFile['backtest']['tierStats']
  heatStats: RadarFile['backtest']['heatStats']
}): JSX.Element {
  const tierById = new Map(tierStats.map(row => [row.tier, row]))
  const heatById = new Map(heatStats.map(row => [row.heat, row]))

  return (
    <div className="mr-fwd" data-testid="mr-forward-stats">
      <h3 className="mr-subhead">之后 12 个月的标普表现</h3>
      <p className="mr-muted" data-testid="mr-fwd-note">
        信号月之后第 2 到第 13 个月的标普总回报（信号在下一个月末才执行）。
      </p>

      <h4 className="mr-fwd__title">按雷达档位</h4>
      <p className="mr-fwd__verdict" data-testid="mr-fwd-tier-summary">
        {tierSummarySentence(tierStats)}
      </p>
      <FadeTable label="按雷达档位的之后 12 个月表现">
        <table className="mr-table mr-fwd__table" data-testid="mr-fwd-tier">
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="mr-fwd__col--name">档位</th>
              <th scope="col" colSpan={4}>全样本</th>
              <th scope="col" colSpan={4}>2000 年以来</th>
            </tr>
            <tr>
              <th scope="col">月数</th>
              <th scope="col">平均回报</th>
              <th scope="col">为负比例</th>
              <th scope="col">平均最大回撤</th>
              <th scope="col">月数</th>
              <th scope="col">平均回报</th>
              <th scope="col">为负比例</th>
              <th scope="col">平均最大回撤</th>
            </tr>
          </thead>
          <tbody>
            {TIER_ORDER_DEFENSE_LEFT.map(tier => {
              const row = tierById.get(tier)
              if (!row) return null
              return (
                <tr key={tier} data-tier={tier}>
                  <th scope="row" className="mr-fwd__col--name">{TIER_LABEL[tier]}</th>
                  <StatsCells stats={row.all} />
                  <StatsCells stats={row.since2000} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </FadeTable>

      <h4 className="mr-fwd__title">按冷热（估值与拥挤度）</h4>
      <p className="mr-fwd__verdict" data-testid="mr-fwd-heat-summary">
        {heatSummarySentence(heatStats)}
      </p>
      <FadeTable label="按冷热的之后 12 个月表现">
        <table className="mr-table mr-fwd__table" data-testid="mr-fwd-heat">
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="mr-fwd__col--name">冷热</th>
              <th scope="col" colSpan={4}>全样本</th>
              <th scope="col" colSpan={4}>2000 年以来</th>
            </tr>
            <tr>
              <th scope="col">月数</th>
              <th scope="col">平均回报</th>
              <th scope="col">为负比例</th>
              <th scope="col">平均最大回撤</th>
              <th scope="col">月数</th>
              <th scope="col">平均回报</th>
              <th scope="col">为负比例</th>
              <th scope="col">平均最大回撤</th>
            </tr>
          </thead>
          <tbody>
            {HEAT_ORDER.map(heat => {
              const row = heatById.get(heat)
              if (!row) return null
              return (
                <tr key={heat} data-heat={heat}>
                  <th scope="row" className="mr-fwd__col--name">{HEAT_LABEL[heat]}</th>
                  <StatsCells stats={row.all} />
                  <StatsCells stats={row.since2000} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </FadeTable>
    </div>
  )
}
