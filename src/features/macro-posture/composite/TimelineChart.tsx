import React, { useMemo, useRef } from 'react'
import { useDaily } from './daily'
import TimelineView from './timeline/TimelineView'
import { toDailyPoints } from './timeline/dailyMath'
import type { Backtest } from './types'

export const DAILY_FALLBACK_NOTICE = '每日数据暂时无法读取，显示月度。'

/**
 * 回测时间线：进入视口（或所在折叠区展开）时才读取每日档位；
 * 读取前与读取失败时显示月度时间线（失败时提示）。
 */
export default function TimelineChart({ timeline, fetcher }: { timeline: Backtest['timeline']; fetcher?: typeof fetch }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const daily = useDaily(hostRef, { fetcher })
  const dailyData = daily.status === 'ready' ? daily.data : null
  const points = useMemo(() => (dailyData ? toDailyPoints(dailyData.rows) : null), [dailyData])
  const usable = !!points && points.length >= 2
  const failed = daily.status === 'error' || (daily.status === 'ready' && !usable)

  return (
    <div className="mp-timeline-host" ref={hostRef} data-daily-status={failed ? 'fallback' : daily.status}>
      {usable && dailyData ? (
        <>
          <TimelineView key="day" mode="day" points={points} changes={dailyData.changes} />
          {dailyData.disclosures.length ? (
            <ul className="mp-timeline__disclosures">
              {dailyData.disclosures.map(text => <li key={text}>{text}</li>)}
            </ul>
          ) : null}
        </>
      ) : (
        <>
          {/* 读取中先显示月度时间线，避免空白；失败时保留月度并提示。 */}
          <p className={`mp-timeline__notice${failed ? '' : ' is-loading'}`} role="status" aria-live="polite">
            {failed ? DAILY_FALLBACK_NOTICE : '正在读取每日档位，先显示月度。'}
          </p>
          <TimelineView key="month" mode="month" points={timeline} />
        </>
      )}
    </div>
  )
}
