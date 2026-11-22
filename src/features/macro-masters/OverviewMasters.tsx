import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  LEAN_LABELS,
  LeanChip,
  MODE_HINTS,
  MODE_LABELS,
  PostureChip,
  TEMPERATURE_LABELS,
} from './chips'
import {
  ExpandChevron,
  Panel,
  PanelCol,
  rowKeyHandlers,
  useExpandSet,
} from './OverviewExpand'
import { MASTERS } from './masters'
import type { CycleView, Lean, MasterTake, TakeItem } from './types'

const MODE_ORDER: MasterTake['mode'][] = ['rule', 'checklist', 'reference']
const LEAN_ORDER: Lean[] = ['caution', 'support', 'neutral', 'unknown']

const SECTION_LEAD =
  '不打分、不排名。只列能不能检验、适合回答什么问题，以及公开记录里的失误。仍按有明确规则 / 逐项对照 / 只列线索分三组。'

function itemsByLean(take: MasterTake): string {
  if (take.mode === 'reference') {
    const labels = take.items.map(i => i.label).filter(Boolean)
    return labels.length ? `线索：${labels.join('、')}` : ''
  }
  const labels = take.slug === 'marks' ? TEMPERATURE_LABELS : LEAN_LABELS
  const parts: string[] = []
  for (const lean of LEAN_ORDER) {
    const names = take.items.filter(i => i.lean === lean).map(i => i.label)
    if (!names.length) continue
    parts.push(`${labels[lean]}：${names.join('、')}`)
  }
  return parts.join('　')
}

function basisLabel(basis: TakeItem['basis']): string {
  return basis === 'own' ? '他本人的说法' : '本站自定'
}

function ItemLeanChip({ take, item }: { take: MasterTake; item: TakeItem }): JSX.Element | null {
  if (take.mode === 'reference') return null
  const labels = take.slug === 'marks' ? TEMPERATURE_LABELS : LEAN_LABELS
  return <LeanChip lean={item.lean} labels={labels} />
}

function TrackPanel({ slug, oneLiner }: { slug: MasterTake['slug']; oneLiner: string }): JSX.Element {
  const master = MASTERS.find(m => m.slug === slug)!
  return (
    <PanelCol title="靠不靠谱">
      <p className="mm-overview__master-oneliner-panel">
        <span className="mm-panel__mini">一句话</span>
        {oneLiner}
      </p>
      <dl className="mm-panel__dl">
        <div><dt>能不能检验</dt><dd>{master.track.testability}</dd></div>
        <div><dt>适合回答</dt><dd>{master.track.bestFor}</dd></div>
        <div><dt>不适合回答</dt><dd>{master.track.notFor}</dd></div>
        <div><dt>公开失误</dt><dd>{master.track.misses}</dd></div>
      </dl>
      <p>
        <Link to={`/invest/macro-masters/${master.slug}`} className="mm-overview__master-cta">
          看他的完整方法
        </Link>
      </p>
    </PanelCol>
  )
}

function TakePanel({ take }: { take: MasterTake }): JSX.Element {
  const master = MASTERS.find(m => m.slug === take.slug)!
  return (
    <Panel cols={2}>
      <PanelCol title="对照明细">
        {take.items.length ? (
          <ul className="mm-panel__list mm-panel__list--stack">
            {take.items.map(item => (
              <li key={`${item.label}-${item.text}`}>
                <p className="mm-overview__item-head">
                  <strong>{item.label}</strong>
                  <ItemLeanChip take={take} item={item} />
                  <span className="mm-overview__item-basis">{basisLabel(item.basis)}</span>
                </p>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mm-overview__muted">暂无观察项</p>
        )}
        {take.missing ? (
          <p className="mm-overview__missing">
            <span className="mm-panel__title">还缺什么：</span>
            {take.missing}
          </p>
        ) : null}
      </PanelCol>
      <TrackPanel slug={take.slug} oneLiner={master.oneLiner} />
    </Panel>
  )
}

function StaticRow({
  master,
  open,
  onToggle,
}: {
  master: (typeof MASTERS)[number]
  open: boolean
  onToggle: () => void
}): JSX.Element {
  const panelId = `mm-master-panel-${master.slug}`
  return (
    <li className={`mm-overview__master-row${open ? ' is-open' : ''}`}>
      <div
        className="mm-overview__master-line"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={panelId}
        {...rowKeyHandlers(onToggle)}
      >
        <div className="mm-overview__master-aside">
          <span className="mm-overview__master-name">{master.name}</span>
        </div>
        <div className="mm-overview__master-main">
          <span className="mm-overview__master-best">适合回答：{master.track.bestFor}</span>
          <Link to={`/invest/macro-masters/${master.slug}`} className="mm-overview__master-cta">
            看他的完整方法
          </Link>
        </div>
        <span className="mm-overview__master-toggle"><ExpandChevron open={open} /></span>
      </div>
      {open && (
        <div id={panelId} className="mm-overview__master-panel">
          <Panel cols={2}>
            <TrackPanel slug={master.slug} oneLiner={master.oneLiner} />
          </Panel>
        </div>
      )}
    </li>
  )
}

function MasterRow({
  take,
  open,
  onToggle,
}: {
  take: MasterTake
  open: boolean
  onToggle: () => void
}): JSX.Element {
  const master = MASTERS.find(m => m.slug === take.slug)!
  const grouping = itemsByLean(take)
  const panelId = `mm-master-panel-${take.slug}`
  return (
    <li className={`mm-overview__master-row${open ? ' is-open' : ''}`}>
      <div
        className="mm-overview__master-line"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={panelId}
        {...rowKeyHandlers(onToggle)}
      >
        <div className="mm-overview__master-aside">
          <span className="mm-overview__master-name">{master.name}</span>
          {take.mode === 'rule' && take.posture
            ? <span className="mm-overview__master-posture"><PostureChip posture={take.posture} /></span>
            : null}
        </div>
        <div className="mm-overview__master-main">
          <span className="mm-overview__master-headline">{take.headline}</span>
          {grouping ? <span className="mm-overview__master-counts">{grouping}</span> : null}
          <span className="mm-overview__master-best">适合回答：{master.track.bestFor}</span>
        </div>
        <span className="mm-overview__master-toggle"><ExpandChevron open={open} /></span>
      </div>
      {open && (
        <div id={panelId} className="mm-overview__master-panel">
          <TakePanel take={take} />
        </div>
      )}
    </li>
  )
}

export default function OverviewMasters({
  takes,
  staticOnly = false,
}: {
  takes?: CycleView['masters']
  staticOnly?: boolean
}): JSX.Element {
  const expand = useExpandSet()
  const allIds = useMemo(
    () => (takes ? takes.map(t => t.slug) : MASTERS.map(m => m.slug)),
    [takes],
  )
  const allOpen = allIds.length > 0 && allIds.every(id => expand.isOpen(id))

  const headActions = (
    <button
      type="button"
      className="mm-expand__collapse-all"
      onClick={() => (allOpen ? expand.collapseAll() : expand.expandAll(allIds))}
    >
      {allOpen ? '全部收起' : '全部展开'}
    </button>
  )

  if (staticOnly || !takes) {
    return (
      <section id="mm-masters" className="mm-overview__masters" aria-labelledby="mm-masters-title">
        <div className="mm-section__head">
          <h2 id="mm-masters-title">九位大师：现在怎么看，靠不靠谱</h2>
          {headActions}
        </div>
        <p className="mm-overview__section-lead">{SECTION_LEAD} 读数尚未就绪时，先看适合回答的问题与方法入口。</p>
        <ul className="mm-overview__master-list">
          {MASTERS.map(master => (
            <StaticRow
              key={master.slug}
              master={master}
              open={expand.isOpen(master.slug)}
              onToggle={() => expand.toggle(master.slug)}
            />
          ))}
        </ul>
      </section>
    )
  }

  const groups = MODE_ORDER.map(mode => ({
    mode,
    items: takes.filter(t => t.mode === mode),
  })).filter(g => g.items.length > 0)

  return (
    <section id="mm-masters" className="mm-overview__masters" aria-labelledby="mm-masters-title">
      <div className="mm-section__head">
        <h2 id="mm-masters-title">九位大师：现在怎么看，靠不靠谱</h2>
        {headActions}
      </div>
      <p className="mm-overview__section-lead">{SECTION_LEAD}</p>
      {groups.map(group => (
        <div key={group.mode} className="mm-overview__master-group">
          <h3 className="mm-overview__master-group-title">{MODE_LABELS[group.mode]}</h3>
          <p className="mm-overview__section-lead">{MODE_HINTS[group.mode]}</p>
          <ul className="mm-overview__master-list">
            {group.items.map(take => (
              <MasterRow
                key={take.slug}
                take={take}
                open={expand.isOpen(take.slug)}
                onToggle={() => expand.toggle(take.slug)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
