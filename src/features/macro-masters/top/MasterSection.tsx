import React from 'react'
import { Link } from 'react-router-dom'
import { LEAN_LABELS, LeanChip, MODE_HINTS, ModeChip, PostureChip, TEMPERATURE_LABELS } from '../chips'
import { masterBySlug } from '../masters'
import ReadingCell from '../ReadingCell'
import type { ReadingsState } from '../readings'
import type { MasterTake, TakeItem } from '../types'
import type { TopMaster } from '../top'

function TakeItems({ take, temperature }: { take: MasterTake; temperature: boolean }): JSX.Element {
  const showLean = take.mode !== 'reference'
  const labels = temperature ? TEMPERATURE_LABELS : LEAN_LABELS
  return (
    <ul className="tm-take-items">
      {take.items.map((item: TakeItem) => (
        <li key={item.label}>
          <p className="tm-take-items__head">
            <strong>{item.label}</strong>
            {showLean && <LeanChip lean={item.lean} labels={labels} />}
            <span className="tm-muted">{item.basis === 'own' ? '他本人的说法' : '本站自定'}</span>
          </p>
          <p>{item.text}</p>
        </li>
      ))}
    </ul>
  )
}

function IndicatorReadings({
  masterSlug,
  readings,
}: {
  masterSlug: TopMaster['slug']
  readings: ReadingsState
}): JSX.Element {
  const master = masterBySlug(masterSlug)
  if (!master) return <p className="tm-muted">找不到对应方法资料。</p>
  const loading = readings.state === 'loading'
  return (
    <ul className="tm-indicators">
      {master.indicators.map((indicator, index) => (
        <li key={`${indicator.name}-${index}`} className="tm-indicators__item">
          <div className="tm-indicators__meta">
            <strong>{indicator.name}</strong>
            <p>{indicator.howToRead}</p>
          </div>
          <div className="tm-indicators__readings">
            {indicator.kind === 'method' ? (
              <span className="tm-muted">方法说明，不对应数据</span>
            ) : (
              <>
                {(indicator.readings ?? []).map(key => (
                  <ReadingCell
                    key={key}
                    reading={readings.state === 'ok' ? readings.readings[key] : undefined}
                    loading={loading}
                  />
                ))}
                {(indicator.proxyReadings ?? []).map(key => (
                  <div key={`proxy-${key}`} className="tm-indicators__proxy">
                    <span className="tm-muted">本站近似（口径不同）</span>
                    <ReadingCell
                      reading={readings.state === 'ok' ? readings.readings[key] : undefined}
                      loading={loading}
                    />
                  </div>
                ))}
                {!indicator.readings?.length && !indicator.proxyReadings?.length && (
                  <ReadingCell reading={null} loading={loading} />
                )}
                {indicator.proxyNote && <p className="tm-muted">{indicator.proxyNote}</p>}
                {indicator.external && !indicator.readings?.length && !indicator.proxyReadings?.length && (
                  <p className="tm-muted">{indicator.external}</p>
                )}
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function MasterSection({
  master,
  take,
  readings,
}: {
  master: TopMaster
  take: MasterTake | undefined
  readings: ReadingsState
}): JSX.Element {
  const profile = masterBySlug(master.slug)
  const name = profile?.name ?? master.slug
  const temperature = master.slug === 'marks'
  const misses = profile?.track.misses

  return (
    <section id={`tm-${master.slug}`} className="tm-master" aria-labelledby={`tm-${master.slug}-title`}>
      <header className="tm-master__head">
        <span className="tm-rank tm-rank--lg" aria-label={`第 ${master.rank} 名`}>{master.rank}</span>
        <div>
          <h2 id={`tm-${master.slug}-title`}>{name}</h2>
          <p className="tm-master__role">{master.role}</p>
        </div>
      </header>

      <div className="tm-master__block">
        <h3>业绩</h3>
        <p>{master.record.summary}</p>
        <p className="tm-muted">{master.record.caveat}</p>
        {master.record.sources.length > 0 && (
          <ul className="tm-sources">
            {master.record.sources.map(source => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tm-master__block">
        <h3>他怎么看周期</h3>
        <p>{master.cycleView}</p>
      </div>

      <div className="tm-master__block">
        <h3>现在他会看的指标</h3>
        <IndicatorReadings masterSlug={master.slug} readings={readings} />
      </div>

      <div className="tm-master__block tm-master__take">
        <h3>按他方法的判断</h3>
        {readings.state === 'loading' && <p className="tm-status" role="status">读数加载中</p>}
        {readings.state === 'error' && <p className="tm-muted">读数暂时无法加载，无法对照</p>}
        {readings.state === 'ok' && take && (
          <>
            <div className="tm-glance__chips">
              <ModeChip mode={take.mode} />
              {take.mode === 'rule' && take.posture && (
                <PostureChip posture={take.posture} prefix="按他的规则：" />
              )}
            </div>
            <p className="tm-glance__headline">{take.headline}</p>
            <p className="tm-muted">{MODE_HINTS[take.mode]}这是本站读数对照他公开方法的结果，不是他本人现在的观点。</p>
            <TakeItems take={take} temperature={temperature} />
            {take.missing && (
              <p className="tm-muted">
                <strong>还缺什么：</strong>
                {take.missing}
              </p>
            )}
          </>
        )}
        {readings.state === 'ok' && !take && <p className="tm-muted">暂无对照结果</p>}
      </div>

      <div className="tm-master__cols">
        <div className="tm-master__block">
          <h3>成功判断</h3>
          <ul>{master.wins.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
        <div className="tm-master__block">
          <h3>公开失误</h3>
          <p>{misses ?? '暂无整理'}</p>
        </div>
      </div>

      <div className="tm-master__cols">
        <div className="tm-master__block">
          <h3>你能学的</h3>
          <ul>{master.learn.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
        <div className="tm-master__block">
          <h3>不要模仿的</h3>
          <ul>{master.avoid.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>

      <div className="tm-master__block">
        <h3>推荐材料</h3>
        <ul className="tm-resources">
          {master.resources.map(item => (
            <li key={item.title}>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
              ) : (
                <strong>{item.title}</strong>
              )}
              <span className="tm-muted"> — {item.note}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="tm-master__detail-link">
        <Link to={`/invest/macro-masters/${master.slug}`}>查看 {name} 的完整方法</Link>
      </p>
    </section>
  )
}
