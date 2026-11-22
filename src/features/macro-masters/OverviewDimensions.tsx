import React, { useEffect, useMemo } from 'react'
import { TableWrap } from '../../components/ui'
import { HORIZON_LABELS, LeanChip } from './chips'
import {
  CollapseAllButton,
  ExpandChevron,
  Panel,
  PanelCol,
  flashElement,
  rowKeyHandlers,
  scrollToId,
  useExpandSet,
} from './OverviewExpand'
import { useOverviewJump } from './OverviewJump'
import { READING_LABELS } from './readings'
import type { CycleView, DimensionView, Horizon } from './types'

const HORIZON_ORDER: Horizon[] = ['short', 'medium', 'long', 'contrarian']
const COLS = 4

function DimensionNow({ dim }: { dim: DimensionView }): JSX.Element {
  return (
    <span className="mm-dim__now">
      <span className="mm-dim__now-main">
        <LeanChip lean={dim.lean} />
        <span className="mm-dim__state">{dim.state}</span>
      </span>
      {dim.horizon === 'contrarian' && <span className="mm-dim__contrarian">逆向</span>}
    </span>
  )
}

function DimensionPanel({
  dim,
  onJumpReading,
}: {
  dim: DimensionView
  onJumpReading: (key: DimensionView['evidence'][number]['key']) => void
}): JSX.Element {
  const skippedNames = dim.skipped.map(key => READING_LABELS[key])
  return (
    <Panel cols={skippedNames.length ? 3 : 2}>
      <PanelCol title="判定口径">
        <p>{dim.rule}</p>
      </PanelCol>
      <PanelCol title="用到的读数">
        {dim.evidence.length ? (
          <ul className="mm-panel__list">
            {dim.evidence.map(ev => (
              <li key={ev.key}>
                {ev.text}
                {' '}
                <button
                  type="button"
                  className="mm-panel__jump"
                  onClick={() => onJumpReading(ev.key)}
                >
                  在指标表里看
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mm-overview__muted">暂无可用读数</p>
        )}
      </PanelCol>
      {skippedNames.length > 0 && (
        <PanelCol title="未参与判定">
          <p>{skippedNames.join('、')}（已过期或暂无）</p>
        </PanelCol>
      )}
    </Panel>
  )
}

export default function OverviewDimensions({ dimensions }: { dimensions: CycleView['dimensions'] }): JSX.Element {
  const groups = useMemo(() => HORIZON_ORDER.map(horizon => ({
    horizon,
    items: dimensions.filter(d => d.horizon === horizon),
  })).filter(g => g.items.length > 0), [dimensions])

  const expand = useExpandSet()
  const jump = useOverviewJump()

  const { openOne } = expand
  const { registerDim, jumpToReading } = jump

  useEffect(() => {
    registerDim({
      openByName: (name: string) => {
        const dim = dimensions.find(d => name === d.name || name.startsWith(`${d.name}：`) || name.startsWith(d.name))
        if (!dim) return
        openOne(dim.id)
        scrollToId('mm-dim')
        window.requestAnimationFrame(() => {
          flashElement(document.getElementById(`mm-dim-row-${dim.id}`))
        })
      },
    })
    return () => registerDim(null)
  }, [dimensions, openOne, registerDim])

  return (
    <section id="mm-dim" className="mm-dim" aria-labelledby="mm-dim-title">
      <div className="mm-section__head">
        <h2 id="mm-dim-title">分维度的证据</h2>
        <CollapseAllButton visible={expand.anyOpen} onClick={expand.collapseAll} />
      </div>

      <TableWrap label="分维度证据表" className="mm-dim__table-wrap">
        <table className="ui-table mm-dim__table">
          <thead>
            <tr>
              <th scope="col">维度</th>
              <th scope="col">现在</th>
              <th scope="col">读数</th>
              <th scope="col" className="mm-expand__col"><span className="visually-hidden">展开</span></th>
            </tr>
          </thead>
          {groups.map(group => (
            <tbody key={group.horizon}>
              <tr className="mm-dim__group-head">
                <th scope="colgroup" colSpan={COLS}>{HORIZON_LABELS[group.horizon]}</th>
              </tr>
              {group.items.map(dim => {
                const open = expand.isOpen(dim.id)
                const panelId = `mm-dim-panel-${dim.id}`
                return (
                  <React.Fragment key={dim.id}>
                    <tr
                      id={`mm-dim-row-${dim.id}`}
                      className={`mm-expand-row${open ? ' is-open' : ''}`}
                      tabIndex={0}
                      aria-expanded={open}
                      aria-controls={panelId}
                      {...rowKeyHandlers(() => expand.toggle(dim.id))}
                    >
                      <th scope="row" className="mm-dim__name">{dim.name}</th>
                      <td><DimensionNow dim={dim} /></td>
                      <td className="mm-dim__summary">{dim.summary}</td>
                      <td className="mm-expand__col"><ExpandChevron open={open} /></td>
                    </tr>
                    {open && (
                      <tr className="mm-expand-panel-row" id={panelId}>
                        <td colSpan={COLS}>
                          <DimensionPanel dim={dim} onJumpReading={jumpToReading} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          ))}
        </table>
      </TableWrap>

      <ul className="mm-dim__cards" aria-label="分维度证据（窄屏）">
        {groups.flatMap(group => group.items.map(dim => {
          const open = expand.isOpen(dim.id)
          const panelId = `mm-dim-card-panel-${dim.id}`
          return (
            <li key={dim.id} id={`mm-dim-card-${dim.id}`} className={`mm-dim__card${open ? ' is-open' : ''}`}>
              <button
                type="button"
                className="mm-dim__card-toggle"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => expand.toggle(dim.id)}
              >
                <p className="mm-dim__card-horizon">{HORIZON_LABELS[group.horizon]}</p>
                <div className="mm-dim__card-head">
                  <span className="mm-dim__name">{dim.name}</span>
                  <DimensionNow dim={dim} />
                  <ExpandChevron open={open} />
                </div>
                <p className="mm-dim__summary">{dim.summary}</p>
              </button>
              {open && (
                <div id={panelId} className="mm-dim__card-panel">
                  <DimensionPanel dim={dim} onJumpReading={jumpToReading} />
                </div>
              )}
            </li>
          )
        }))}
      </ul>
    </section>
  )
}
