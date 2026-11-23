import React from 'react'
import { Link } from 'react-router-dom'
import SummaryCard from '../../macro-posture/composite/SummaryCard'
import { masterBySlug } from '../masters'
import type { ReadingsState } from '../readings'
import type { MasterTake } from '../types'
import type { TopMaster } from '../top'
import { consensusSummary } from './consensus'
import TakeGlance from './TakeGlance'

export default function ConsensusPanel({
  masters,
  takes,
  readings,
}: {
  masters: readonly TopMaster[]
  takes: MasterTake[] | null
  readings: ReadingsState
}): JSX.Element {
  const takeBySlug = new Map((takes ?? []).map(t => [t.slug, t]))
  const summary = takes ? consensusSummary(takes) : ''

  return (
    <section id="tm-now" className="tm-now" aria-labelledby="tm-now-title">
      <h2 id="tm-now-title">现在怎么看</h2>
      <SummaryCard />

      {readings.state === 'loading' && (
        <p className="tm-status" role="status">大师读数加载中，六位一览稍后给出。</p>
      )}
      {readings.state === 'error' && (
        <p className="tm-error" role="alert">
          大师读数加载失败（{readings.message}）。本站综合结论仍可看；下方六位一览暂不给出按方法的判断。
        </p>
      )}

      {masters.length === 0 ? (
        <p className="tm-empty" role="status">
          精选六位名单整理中。你可以先看
          {' '}
          <Link to="/invest/macro-masters">九位完整版</Link>
          。
        </p>
      ) : (
        <>
          <ol className="tm-glance" aria-label="六位一览">
            {masters.map(master => {
              const profile = masterBySlug(master.slug)
              const take = takeBySlug.get(master.slug)
              return (
                <li key={master.slug} className="tm-glance__row">
                  <div className="tm-glance__meta">
                    <span className="tm-rank" aria-label={`第 ${master.rank} 名`}>{master.rank}</span>
                    <div>
                      <a className="tm-glance__name" href={`#tm-${master.slug}`}>
                        {profile?.name ?? master.slug}
                      </a>
                      <p className="tm-glance__role">{master.role}</p>
                    </div>
                  </div>
                  {readings.state === 'ok' && take ? (
                    <TakeGlance take={take} temperature={master.slug === 'marks'} />
                  ) : readings.state === 'loading' ? (
                    <p className="tm-status">读数加载中</p>
                  ) : readings.state === 'error' ? (
                    <p className="tm-muted">读数暂不可用</p>
                  ) : (
                    <p className="tm-muted">暂无对照</p>
                  )}
                </li>
              )
            })}
          </ol>
          {summary && <p className="tm-consensus" data-testid="tm-consensus">{summary}</p>}
        </>
      )}
    </section>
  )
}
