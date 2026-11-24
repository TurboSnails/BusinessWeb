import React from 'react'
import { useOverflowFade } from '../../hooks/useOverflowFade'
import { correlationSentence, heatHistorySentence } from './historyText'
import { TIER_LABEL, TIER_ORDER_DEFENSE_LEFT, formatPct1, visibleText } from './labels'
import type { RadarFile, RadarForwardStats, RadarPredictiveSet } from './types'

const HEAT_ORDER = ['hot', 'mid', 'cold'] as const
const HEAT_LABEL = { cold: '偏冷', mid: '居中', hot: '偏热' } as const
/** 独立样本少于这个数，月数旁标「样本少」 */
const SPARSE_INDEPENDENT = 5
/** 旧数据没有独立样本数时，按月数判断 */
const SPARSE_MONTHS = 30

type Era = { key: 'before2000' | 'since2000' | 'all'; label: string }

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return visibleText(formatPct1(value))
}

export function isSparse(stats: RadarForwardStats): boolean {
  if (stats.months === 0) return false
  return stats.independent != null ? stats.independent < SPARSE_INDEPENDENT : stats.months < SPARSE_MONTHS
}

function MonthsCell({ stats }: { stats: RadarForwardStats }): JSX.Element {
  return (
    <td className="num">
      {stats.months}
      {stats.independent != null ? <small className="mr-fwd__indep">≈{stats.independent} 个独立</small> : null}
      {isSparse(stats) ? <small className="mr-fwd__sparse">样本少</small> : null}
    </td>
  )
}

function StatsCells({ stats }: { stats: RadarForwardStats | undefined }): JSX.Element {
  if (!stats || stats.months === 0) {
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
      <td className="num">{fmtPct(stats.neg12)}</td>
      <td className="num">{fmtPct(stats.maxDd12)}</td>
    </>
  )
}

/** 有 1973–1999 段时按两段分列；旧数据退回全样本 + 2000 年以来 */
function erasOf(rows: { before2000?: RadarForwardStats }[]): Era[] {
  const split = rows.length > 0 && rows.every(row => row.before2000 != null)
  return split
    ? [{ key: 'before2000', label: '1973–1999' }, { key: 'since2000', label: '2000 年以来' }]
    : [{ key: 'all', label: '全样本' }, { key: 'since2000', label: '2000 年以来' }]
}

function FadeTable({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
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

type StatsRow = { key: string; label: string; stats: Record<Era['key'], RadarForwardStats | undefined> }

function EraTable({
  testId,
  label,
  nameHeader,
  dataAttr,
  eras,
  rows,
}: {
  testId: string
  label: string
  nameHeader: string
  dataAttr: 'data-heat' | 'data-tier'
  eras: Era[]
  rows: StatsRow[]
}): JSX.Element {
  return (
    <FadeTable label={label}>
      <table className="mr-table mr-fwd__table" data-testid={testId}>
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className="mr-fwd__col--name">{nameHeader}</th>
            {eras.map(era => <th key={era.key} scope="col" colSpan={4}>{era.label}</th>)}
          </tr>
          <tr>
            {eras.map(era => (
              <React.Fragment key={era.key}>
                <th scope="col">月数</th>
                <th scope="col">平均回报</th>
                <th scope="col">为负比例</th>
                <th scope="col">平均最大回撤</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} {...{ [dataAttr]: row.key }}>
              <th scope="row" className="mr-fwd__col--name">{row.label}</th>
              {eras.map(era => <StatsCells key={era.key} stats={row.stats[era.key]} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </FadeTable>
  )
}

function statsByEra(row: { all: RadarForwardStats; before2000?: RadarForwardStats; since2000: RadarForwardStats }) {
  return { all: row.all, before2000: row.before2000, since2000: row.since2000 }
}

/** 旧数据（没有 1973–1999 段）的冷热结论句 */
export function heatSummaryFallback(heatStats: RadarFile['backtest']['heatStats']): string {
  const by = new Map(heatStats.map(row => [row.heat, row]))
  const phrase = (stats: RadarForwardStats | undefined) => {
    if (!stats || stats.months === 0) return '没有出现过'
    return isSparse(stats) ? `${fmtPct(stats.fwd12)}（样本少）` : fmtPct(stats.fwd12)
  }
  const join = (key: 'all' | 'since2000') => HEAT_ORDER
    .map(heat => `${HEAT_LABEL[heat]} ${phrase(by.get(heat)?.[key])}`)
    .join('，')
  return `之后 12 个月平均：全样本${join('all')}；2000 年以来${join('since2000')}。`
}

export const RETURN_NOTE = '信号月之后第 2 到第 13 个月的标普总回报（含股息，月均价口径；信号在下一个月末才执行）。'
export const INDEPENDENT_NOTE = '12 个月窗口彼此重叠，相邻月份几乎是同一段行情，所以另列独立样本数：约为月数 ÷ 12，且不超过连续出现的段数。'

/** 主视图：按冷热（估值与持股拥挤度）分组，分两段 */
export default function HeatForwardStats({
  heatStats,
  predictive,
}: {
  heatStats: RadarFile['backtest']['heatStats']
  predictive?: RadarPredictiveSet
}): JSX.Element {
  const by = new Map(heatStats.map(row => [row.heat, row]))
  const eras = erasOf(heatStats)
  const rows: StatsRow[] = HEAT_ORDER.flatMap(heat => {
    const row = by.get(heat)
    return row ? [{ key: heat, label: HEAT_LABEL[heat], stats: statsByEra(row) }] : []
  })
  const sentence = heatHistorySentence(heatStats) ?? heatSummaryFallback(heatStats)
  return (
    <div className="mr-fwd" data-testid="mr-forward-stats">
      <h3 className="mr-subhead">冷热之后 12 个月的标普表现</h3>
      <p className="mr-muted" data-testid="mr-fwd-note">
        {RETURN_NOTE}
        {eras[0].key === 'before2000' ? INDEPENDENT_NOTE : ''}
      </p>
      <p className="mr-fwd__verdict" data-testid="mr-fwd-heat-summary">{sentence}</p>
      {predictive ? (
        <p className="mr-muted" data-testid="mr-fwd-heat-corr">{correlationSentence('冷热分（正数为偏冷）', predictive.heat, '越偏冷')}</p>
      ) : null}
      <EraTable
        testId="mr-fwd-heat"
        label="按冷热的之后 12 个月表现"
        nameHeader="冷热"
        dataAttr="data-heat"
        eras={eras}
        rows={rows}
      />
    </div>
  )
}

/** 折叠区：按综合分五档分组，只作历史检验 */
export function TierForwardStats({
  tierStats,
}: {
  tierStats: RadarFile['backtest']['tierStats']
}): JSX.Element {
  const by = new Map(tierStats.map(row => [row.tier, row]))
  const eras = erasOf(tierStats)
  const rows: StatsRow[] = TIER_ORDER_DEFENSE_LEFT.flatMap(tier => {
    const row = by.get(tier)
    return row ? [{ key: tier, label: TIER_LABEL[tier], stats: statsByEra(row) }] : []
  })
  return (
    <div className="mr-fwd" data-testid="mr-forward-tier">
      <h4 className="mr-fwd__title">按综合分五档之后 12 个月</h4>
      <p className="mr-muted" data-testid="mr-fwd-tier-note">
        五档沿用宏观攻守的刻度与名称，只是分数区间，不代表该进攻或防守。{RETURN_NOTE}
      </p>
      <EraTable
        testId="mr-fwd-tier"
        label="按综合分五档的之后 12 个月表现"
        nameHeader="档位"
        dataAttr="data-tier"
        eras={eras}
        rows={rows}
      />
    </div>
  )
}
