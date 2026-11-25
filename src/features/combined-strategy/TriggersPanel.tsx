import React from 'react'
import { useCompositePosture, tierDef } from '../macro-posture/composite/load'
import { formatSharePct, tierLabel, visibleText } from './labels'

const CHANGE_NOTE =
  '档位变了怎么办：以月末最后一个交易日的档位为准，下个月内把仓位调到新档位对应的比例。雷达的冷热变化不触发调仓，只改变「这个月要做的事」里的做法。'

export default function TriggersPanel(): JSX.Element {
  const composite = useCompositePosture()
  const distance = composite.status === 'ready' ? composite.data.current.distance : null
  const file = composite.status === 'ready' ? composite.data : null

  return (
    <section className="cs-triggers" id="cs-triggers" aria-labelledby="cs-triggers-title">
      <h2 id="cs-triggers-title">什么情况下要动</h2>

      {!distance || !file ? (
        <p className="cs-muted" data-testid="cs-triggers-missing">暂缺</p>
      ) : (
        <div data-testid="cs-triggers-body">
          <div className="cs-triggers__pair">
          {distance.down ? (
            <div className="cs-triggers__block cs-triggers__block--down" data-testid="cs-triggers-down">
              <h3 className="cs-triggers__heading">
                会降一档（到{tierLabel(distance.down.tier)}，仓位 {formatSharePct(tierDef(file, distance.down.tier)?.equityShare) ?? '—'}）
              </h3>
              <p>{visibleText(distance.down.text)}</p>
              {distance.tactical ? (
                <p className="cs-triggers__tactical" data-testid="cs-triggers-tactical">
                  <strong>本月均线</strong>：{visibleText(distance.tactical)}
                </p>
              ) : null}
            </div>
          ) : null}

          {distance.up ? (
            <div className="cs-triggers__block cs-triggers__block--up" data-testid="cs-triggers-up">
              <h3 className="cs-triggers__heading">
                会升一档（到{tierLabel(distance.up.tier)}，仓位 {formatSharePct(tierDef(file, distance.up.tier)?.equityShare) ?? '—'}）
              </h3>
              <p>{visibleText(distance.up.text)}</p>
            </div>
          ) : null}
          </div>

          <div className="cs-triggers__block cs-triggers__block--nearest" data-testid="cs-triggers-nearest">
            <h3 className="cs-triggers__heading">离翻档最近的指标</h3>
            <ul>
              {distance.nearest.map(item => (
                <li key={item.componentId}>{visibleText(item.text)}</li>
              ))}
            </ul>
          </div>

          <p className="cs-triggers__note" data-testid="cs-triggers-note">{CHANGE_NOTE}</p>
        </div>
      )}
    </section>
  )
}
