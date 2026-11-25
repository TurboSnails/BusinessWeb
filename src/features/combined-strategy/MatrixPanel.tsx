import React, { useMemo, useState } from 'react'
import { TableWrap } from '../../components/ui'
import {
  HEAT_LABEL,
  HEAT_ORDER,
  MACRO_SIDE_LABEL,
  MACRO_SIDE_ORDER,
  formatPct1,
  visibleText,
} from './labels'
import type { CombinedStrategyFile, Heat, MacroSide, MatrixCell } from './types'

function cellKey(side: MacroSide, heat: Heat): string {
  return `${side}:${heat}`
}

function CellBody({
  cell,
  mode,
}: {
  cell: MatrixCell | undefined
  mode: 'all' | 'since2000'
}): JSX.Element {
  if (!cell) return <span className="cs-muted">—</span>
  const stats = mode === 'all' ? cell.all : cell.since2000
  if (stats.months === 0) {
    return (
      <div className="cs-matrix__stats">
        {cell?.name ? (
          <strong className="cs-matrix__name" data-testid="cs-matrix-name">{cell.name}</strong>
        ) : null}
        <span className="cs-muted">{mode === 'all' ? '没有出现过' : '— 没有出现过'}</span>
      </div>
    )
  }
  return (
    <div className="cs-matrix__stats">
      {cell?.name ? (
        <strong className="cs-matrix__name" data-testid="cs-matrix-name">{cell.name}</strong>
      ) : null}
      <span>{stats.months} 个月</span>
      <span>之后 12 个月均值 {formatPct1(stats.fwd12)}</span>
      <span>为负 {formatPct1(stats.neg12)}</span>
      <span>平均最大回撤 {formatPct1(stats.maxDd12)}</span>
      {mode === 'all' ? (
        <span className="cs-matrix__action">{visibleText(cell.action)}</span>
      ) : null}
      {mode === 'all' && cell.thin ? (
        <span className="cs-thin-badge cs-thin-badge--inline" data-testid="cs-matrix-thin">样本少</span>
      ) : null}
    </div>
  )
}

function MatrixTable({
  byKey,
  currentKey,
  mode,
  caption,
  testId,
}: {
  byKey: Map<string, MatrixCell>
  currentKey: string | null
  mode: 'all' | 'since2000'
  caption: string
  testId: string
}): JSX.Element {
  return (
    <TableWrap label={caption} className="cs-matrix__scroll">
      <table className="cs-table cs-matrix__table" data-testid={testId}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">宏观 \ 热度</th>
            {HEAT_ORDER.map(heat => (
              <th key={heat} scope="col">{HEAT_LABEL[heat]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MACRO_SIDE_ORDER.map(side => (
            <tr key={side}>
              <th scope="row">
                {MACRO_SIDE_LABEL[side]}
                {side === 'offense' ? (
                  <span className="cs-matrix__hint">进攻、偏进攻</span>
                ) : null}
                {side === 'defense' ? (
                  <span className="cs-matrix__hint">偏防守、防守</span>
                ) : null}
              </th>
              {HEAT_ORDER.map(heat => {
                const key = cellKey(side, heat)
                const cell = byKey.get(key)
                const current = currentKey === key
                const thin = mode === 'all' && Boolean(cell?.thin)
                return (
                  <td
                    key={heat}
                    className={[
                      current ? 'is-current' : '',
                      thin ? 'is-thin' : '',
                    ].filter(Boolean).join(' ') || undefined}
                    data-cell={key}
                    data-current={current ? 'true' : undefined}
                  >
                    <CellBody cell={cell} mode={mode} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function MatrixPanel({ data }: { data: CombinedStrategyFile }): JSX.Element {
  const byKey = useMemo(() => {
    const map = new Map<string, MatrixCell>()
    for (const cell of data.matrix) map.set(cellKey(cell.macroSide, cell.heat), cell)
    return map
  }, [data.matrix])

  const [mode, setMode] = useState<'all' | 'since2000'>('all')
  const currentKey = data.current.macroSide && data.current.heat
    ? cellKey(data.current.macroSide, data.current.heat)
    : null

  return (
    <section className="cs-matrix" id="cs-matrix" aria-labelledby="cs-matrix-title">
      <h2 id="cs-matrix-title">九种状态的历史表现</h2>
      <p className="cs-lead" data-testid="cs-matrix-lead">
        把每个月按宏观档位和雷达热度分成九格，看之后 12 个月标普的表现。这是历史统计，不是交易规则；仓位仍按宏观档位。
      </p>
      <div className="cs-seg" role="group" aria-label="统计区间">
        <button
          type="button"
          className="cs-seg__btn"
          aria-pressed={mode === 'all'}
          onClick={() => setMode('all')}
        >
          全样本（1973 年起）
        </button>
        <button
          type="button"
          className="cs-seg__btn"
          aria-pressed={mode === 'since2000'}
          onClick={() => setMode('since2000')}
        >
          2000 年以后
        </button>
        <span className="cs-seg__hint">进攻侧 = 进攻、偏进攻；防守侧 = 偏防守、防守。高亮格是现在所处的状态。</span>
      </div>

      <div hidden={mode !== 'all'}>
        <MatrixTable
          byKey={byKey}
          currentKey={currentKey}
          mode="all"
          caption="全样本状态矩阵"
          testId="cs-matrix-all"
        />
      </div>
      <div hidden={mode !== 'since2000'}>
        <MatrixTable
          byKey={byKey}
          currentKey={currentKey}
          mode="since2000"
          caption="2000 年以后状态矩阵"
          testId="cs-matrix-2000"
        />
      </div>
    </section>
  )
}
