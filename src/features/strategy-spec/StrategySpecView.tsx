import React, { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TableWrap } from '../../components/ui'
import { compareSpecs, parseCompare, type SectionDiff } from './compare'
import { STRATEGY_SPECS, currentSpec, findSpec } from './index'
import type { SpecBlock, SpecSection, StrategySpec } from './types'

const DIFF_LABEL: Record<SectionDiff['status'], string> = {
  same: '相同',
  changed: '有变化',
  added: '新增',
  removed: '删除',
}

function Block({ block }: { block: SpecBlock }): JSX.Element {
  if (block.type === 'p') return <p className="ss-p">{block.text}</p>
  if (block.type === 'note') return <p className="ss-note" role="note">{block.text}</p>
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul'
    return <Tag className="ss-list">{block.items.map(item => <li key={item}>{item}</li>)}</Tag>
  }
  return (
    <figure className="ss-table">
      {block.caption ? <figcaption className="ss-table__caption">{block.caption}</figcaption> : null}
      <TableWrap label={block.caption ?? block.head.join('、')}>
        <table className="cs-table">
          <thead>
            <tr>{block.head.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map(row => (
              <tr key={row.join('|')}>
                {row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </figure>
  )
}

function Section({ section }: { section: SpecSection }): JSX.Element {
  return (
    <section className="ss-section" id={`ss-${section.id}`} aria-labelledby={`ss-${section.id}-title`}>
      <h2 id={`ss-${section.id}-title`}>{section.title}</h2>
      {section.blocks.map((block, i) => <Block key={i} block={block} />)}
    </section>
  )
}

function VersionMeta({ spec }: { spec: StrategySpec }): JSX.Element {
  return (
    <dl className="ss-meta" data-testid="ss-meta">
      <div><dt>版本</dt><dd>v{spec.version}{spec.status === 'current' ? '（现行）' : '（已归档）'}</dd></div>
      <div><dt>成文日期</dt><dd>{spec.date}</dd></div>
      <div><dt>数据截至</dt><dd>{spec.dataThrough}</dd></div>
      <div>
        <dt>组成部件</dt>
        <dd>{spec.components.map(c => `${c.label} ${c.version}`).join(' · ')}</dd>
      </div>
    </dl>
  )
}

function Toc({ spec }: { spec: StrategySpec }): JSX.Element {
  return (
    <nav className="ss-toc" aria-label="说明书目录" data-testid="ss-toc">
      <ol>
        {spec.sections.map(section => (
          <li key={section.id}><a href={`#ss-${section.id}`}>{section.title}</a></li>
        ))}
      </ol>
    </nav>
  )
}

function VersionPicker({ specs, active, compare }: {
  specs: StrategySpec[]
  active: StrategySpec
  compare: [StrategySpec, StrategySpec] | null
}): JSX.Element {
  const [, setParams] = useSearchParams()
  const canCompare = specs.length >= 2
  return (
    <div className="ss-picker" data-testid="ss-picker">
      <label className="ss-picker__field">
        <span>查看版本</span>
        <select
          value={compare ? '' : active.version}
          onChange={event => setParams(event.target.value ? { v: event.target.value } : {})}
          data-testid="ss-version-select"
        >
          {compare ? <option value="">（对比中）</option> : null}
          {specs.map(spec => (
            <option key={spec.version} value={spec.version}>
              v{spec.version} · {spec.date}{spec.status === 'current' ? '（现行）' : ''}
            </option>
          ))}
        </select>
      </label>
      {canCompare ? (
        <button
          type="button"
          className="ss-picker__compare"
          data-testid="ss-compare-start"
          onClick={() => setParams({ compare: `${specs[1].version}..${specs[0].version}` })}
        >
          对比最近两个版本
        </button>
      ) : (
        <p className="ss-picker__hint" data-testid="ss-compare-hint">
          目前只有一个版本。以后升级后，可以在这里逐章对比任意两个版本。
        </p>
      )}
    </div>
  )
}

function CompareView({ left, right, specs }: { left: StrategySpec; right: StrategySpec; specs: StrategySpec[] }): JSX.Element {
  const [, setParams] = useSearchParams()
  const diffs = useMemo(() => compareSpecs(left, right), [left, right])
  const changed = diffs.filter(diff => diff.status !== 'same').length
  const pick = (side: 'left' | 'right', version: string) => {
    const next = side === 'left' ? `${version}..${right.version}` : `${left.version}..${version}`
    setParams({ compare: next })
  }
  return (
    <div className="ss-compare" data-testid="ss-compare">
      <div className="ss-compare__pickers">
        {(['left', 'right'] as const).map(side => (
          <label key={side} className="ss-picker__field">
            <span>{side === 'left' ? '旧版本' : '新版本'}</span>
            <select
              value={(side === 'left' ? left : right).version}
              onChange={event => pick(side, event.target.value)}
              data-testid={`ss-compare-${side}`}
            >
              {specs.map(spec => <option key={spec.version} value={spec.version}>v{spec.version} · {spec.date}</option>)}
            </select>
          </label>
        ))}
        <button type="button" className="ss-picker__compare" onClick={() => setParams({})}>退出对比</button>
      </div>
      <p className="ss-compare__summary" data-testid="ss-compare-summary">
        v{left.version} → v{right.version}：{diffs.length} 章里有 {changed} 章不同。
      </p>
      {right.changes.length ? (
        <div className="ss-changes">
          <h2>v{right.version} 的改动说明</h2>
          <ul className="ss-list">{right.changes.map(change => <li key={change}>{change}</li>)}</ul>
        </div>
      ) : null}
      {diffs.map(diff => (
        <details key={diff.id} className={`ss-diff ss-diff--${diff.status}`} open={diff.status !== 'same'} data-status={diff.status}>
          <summary>
            <span className="ss-diff__title">{diff.title}</span>
            <span className={`ss-diff__badge ss-diff__badge--${diff.status}`}>{DIFF_LABEL[diff.status]}</span>
          </summary>
          <div className="ss-diff__cols">
            <div className="ss-diff__col">
              <p className="ss-diff__side">v{left.version}</p>
              {diff.left ? diff.left.blocks.map((block, i) => <Block key={i} block={block} />) : <p className="ss-p ss-muted">（这一版没有这一章）</p>}
            </div>
            <div className="ss-diff__col">
              <p className="ss-diff__side">v{right.version}</p>
              {diff.right ? diff.right.blocks.map((block, i) => <Block key={i} block={block} />) : <p className="ss-p ss-muted">（这一版删除了这一章）</p>}
            </div>
          </div>
        </details>
      ))}
    </div>
  )
}

export default function StrategySpecView({ specs = STRATEGY_SPECS }: { specs?: StrategySpec[] }): JSX.Element {
  const [params] = useSearchParams()
  const compareVersions = parseCompare(params.get('compare'))
  const compare = compareVersions
    ? [findSpec(compareVersions[0], specs), findSpec(compareVersions[1], specs)] as const
    : null
  const comparePair = compare && compare[0] && compare[1] ? [compare[0], compare[1]] as [StrategySpec, StrategySpec] : null
  const requested = params.get('v')
  const active = findSpec(requested, specs) ?? currentSpec(specs)
  const missing = (requested && !findSpec(requested, specs)) || (compareVersions && !comparePair)
  const latest = currentSpec(specs)

  return (
    <div className="ss-body">
      <VersionPicker specs={specs} active={active} compare={comparePair} />
      {missing ? (
        <p className="ss-note" role="status" data-testid="ss-missing">找不到指定的版本，已显示现行版本 v{latest.version}。</p>
      ) : null}
      {comparePair ? (
        <CompareView left={comparePair[0]} right={comparePair[1]} specs={specs} />
      ) : (
        <>
          {active.status === 'archived' ? (
            <p className="ss-note" role="status" data-testid="ss-archived">
              这是已归档的 v{active.version}，现行版本是 <Link to={`?v=${latest.version}`}>v{latest.version}</Link>。
            </p>
          ) : null}
          <header className="ss-cover" data-testid="ss-cover">
            <p className="ss-cover__kicker">{active.title} · v{active.version}</p>
            <p className="ss-cover__summary">{active.summary}</p>
            <VersionMeta spec={active} />
            <div className="ss-changes">
              <h2>这一版的改动</h2>
              <ul className="ss-list">{active.changes.map(change => <li key={change}>{change}</li>)}</ul>
            </div>
          </header>
          <Toc spec={active} />
          {active.sections.map(section => <Section key={section.id} section={section} />)}
        </>
      )}
    </div>
  )
}
