import React from 'react'
import { Link } from 'react-router-dom'
import { buildCycleView } from './cycleView'
import { LEAN_LABELS, MODE_HINTS, LeanChip, ModeChip, PostureChip, TEMPERATURE_LABELS } from './chips'
import type { ReadingsState } from './readings'
import type { Master, MasterTake, ReadingKey } from './types'

function TakeItems({ master, take, readingTargets, onReadingTarget }: {
  master: Master
  take: MasterTake
  readingTargets: Partial<Record<ReadingKey, string>>
  onReadingTarget: (id: string) => void
}): JSX.Element {
  const showLean = take.mode !== 'reference'
  const leanLabels = master.slug === 'marks' ? TEMPERATURE_LABELS : LEAN_LABELS

  return (
    <table className={showLean ? 'mm-take__table' : 'mm-take__table mm-take__table--reference'} aria-label={`${master.name}方法与本站读数对照`}>
      <thead>
        <tr>
          <th scope="col">观察项</th>
          <th scope="col">现在</th>
          {showLean && <th scope="col">含义</th>}
          <th scope="col">口径</th>
        </tr>
      </thead>
      <tbody>
        {take.items.map(item => {
          const targetKey = item.keys.find(key => readingTargets[key])
          const target = targetKey ? readingTargets[targetKey] : undefined
          return (
            <tr key={item.label}>
              <th scope="row" data-label="观察项"><span className="mm-take__cell-value">{item.label}</span></th>
              <td data-label="现在">
                <span className="mm-take__cell-value">{item.text}</span>
                {target && (
                  <a
                    href={`#${target}`}
                    className="mm-take__reading-link"
                    onClick={event => { event.preventDefault(); onReadingTarget(target) }}
                  >看这项读数</a>
                )}
              </td>
              {showLean && (
                <td data-label="含义">
                  <span className="mm-take__cell-value"><LeanChip lean={item.lean} labels={leanLabels} /></span>
                </td>
              )}
              <td data-label="口径">
                <span className="mm-take__basis-prefix">口径：</span>
                <span className="mm-take__cell-value">{item.basis === 'own' ? '他本人的说法' : '本站自定'}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function DetailTake({ master, state, readingTargets, onReadingTarget }: {
  master: Master
  state: ReadingsState
  readingTargets: Partial<Record<ReadingKey, string>>
  onReadingTarget: (id: string) => void
}): JSX.Element {
  const take = state.state === 'ok'
    ? buildCycleView(state.readings).masters.find(item => item.slug === master.slug)
    : undefined

  return (
    <section id="mm-now" className="mm-detail__section mm-take" aria-labelledby="mm-take-title">
      <h2 id="mm-take-title">按他的方法，现在怎么看</h2>
      {state.state === 'loading' && <p className="mm-take__status" role="status">读数加载中</p>}
      {state.state === 'error' && <p className="mm-take__status">读数暂时无法加载，无法对照</p>}
      {state.state === 'ok' && take && (
        <>
          <div className="mm-take__chips">
            <ModeChip mode={take.mode} />
            {take.mode === 'rule' && take.posture && <PostureChip posture={take.posture} prefix="按他的规则：" />}
          </div>
          <p className="mm-take__headline">{take.headline}</p>
          <p className="mm-take__hint">{MODE_HINTS[take.mode]}这是本站读数对照他公开方法的结果，不是他本人现在的观点。</p>
          <TakeItems master={master} take={take} readingTargets={readingTargets} onReadingTarget={onReadingTarget} />
          {take.items.some(item => item.basis === 'own') && (
            <p className="mm-take__basis-note">口径一栏的「他本人的说法」，指判断的方向或规则出自他本人；读数怎么取、看多长的窗口（例如近一月的变化）是本站定的。</p>
          )}
          {take.missing && <p className="mm-take__missing"><strong>还缺什么：</strong>{take.missing}</p>}
          <Link to="/invest/macro-masters" className="mm-take__overview-link">看本站对当前位置的整体归纳</Link>
        </>
      )}
    </section>
  )
}

const TRACK_FIELDS = [
  ['testability', '能不能检验'],
  ['bestFor', '适合回答'],
  ['notFor', '不适合回答'],
  ['misses', '公开失误'],
] as const

export function DetailTrack({ master }: { master: Master }): JSX.Element {
  return (
    <section className="mm-detail__section mm-detail__limits mm-track" aria-labelledby="mm-limits">
      <h2 id="mm-limits">靠不靠谱与局限</h2>
      <dl className="mm-track__list">
        {TRACK_FIELDS.map(([key, label]) => (
          <div className="mm-track__item" key={key}>
            <dt>{label}</dt>
            <dd>{master.track[key]}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mm-track__limits-title">主要局限</h3>
      <p className="mm-track__limits">{master.limits}</p>
    </section>
  )
}
