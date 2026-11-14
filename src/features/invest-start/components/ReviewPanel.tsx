import React, { useEffect, useState } from 'react'
import { SITE_ORIGIN } from '../../../utils/seo'
import { ICS_CAVEAT, buildIcs, downloadIcs, publicPageUrl } from '../calendar'
import { BETWEEN_CHECKS } from '../content'
import { completeReview, reviewStatus } from '../checks'
import { isAnchorDay } from '../validation'
import type { Day, ReviewSchedule } from '../types'

const newId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* 忽略 */ }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 回链：当前部署 origin + BASE_URL（子路径部署也正确）；本机开发地址改用正式站。点击时计算 */
const pageUrl = (): string => publicPageUrl(window.location.origin, import.meta.env.BASE_URL ?? '/', SITE_ORIGIN)

/** 检查日：季度 / 半年，首日限定每月 1—28 日；可导出 .ics。站内倒计时按本地日历日 */
export function ReviewPanel({ review, today, onChange }: {
  review?: ReviewSchedule
  today: Day
  onChange: (r: ReviewSchedule | undefined) => void
}): JSX.Element {
  // 只有「改已有的检查日」需要 editing；没有检查日时表单总是显示（被清除或其他标签页删掉后也能马上重设）
  const [editing, setEditing] = useState(false)
  const [anchor, setAnchor] = useState(review?.anchor ?? '')
  const [interval, setIntervalMonths] = useState<3 | 6>(review?.intervalMonths ?? 6)
  const [error, setError] = useState('')
  const [downloaded, setDownloaded] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  // 外部变化（全页清除、其他标签页替换或删除）时，草稿跟着当前计划走
  const key = review ? `${review.id}|${review.anchor}|${review.intervalMonths}|${review.calendarSequence}` : ''
  useEffect(() => {
    setAnchor(review?.anchor ?? '')
    setIntervalMonths(review?.intervalMonths ?? 6)
    setEditing(false)
    setError('')
    setDownloaded(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const startEdit = (): void => {
    setAnchor(review?.anchor ?? '')
    setIntervalMonths(review?.intervalMonths ?? 6)
    setError('')
    setEditing(true)
  }
  const showForm = !review || editing

  const save = (): void => {
    const thisYear = Number(today.slice(0, 4))
    const yearText = /^(\d+)-/.exec(anchor)?.[1]
    if (yearText && (yearText.length !== 4 || Number(yearText) < thisYear || Number(yearText) > thisYear + 2)) {
      setError(`年份看起来不对：请选 ${thisYear}—${thisYear + 2} 年之间的日期。`)
      return
    }
    if (!isAnchorDay(anchor)) {
      setError('请选择一个日期，日号在 1—28 日之间（避开月末，日历重复更可靠）。')
      return
    }
    setError('')
    setCancelled(false)
    const changed = !review || review.anchor !== anchor || review.intervalMonths !== interval
    onChange({
      id: review?.id ?? newId(),
      anchor,
      intervalMonths: interval,
      completedDates: changed ? [] : review.completedDates,
      calendarSequence: review ? review.calendarSequence + (changed ? 1 : 0) : 0,
    })
    setEditing(false)
    setDownloaded(false)
  }

  const status = review ? reviewStatus(review, today) : null

  return (
    <div className="is-review">
      {review && status && !showForm && (
        <>
          <p className="is-review__line" aria-live="polite">
            {status.due
              ? `检查日 ${status.due} 已到：先更新金额，再看是否达到事先定的调整条件。`
              : `下次检查日 ${status.next}（还有 ${status.daysToNext} 天）。${BETWEEN_CHECKS}`}
          </p>
          <p className="is-muted">每 {review.intervalMonths === 3 ? '季度' : '半年'}一次，从 {review.anchor} 起。</p>
          <div className="is-actions">
            {status.due && (
              <button type="button" className="tool-btn is-btn" onClick={() => onChange(completeReview(review, status.due as Day))}>
                本次已检查（只记录检查过）
              </button>
            )}
            <button
              type="button"
              className="tool-btn tool-btn--primary is-btn"
              onClick={() => {
                downloadIcs(buildIcs({ review, today, now: new Date(), pageUrl: pageUrl() }))
                setDownloaded(true)
              }}
            >
              下载日历文件（.ics）
            </button>
            <button type="button" className="tool-btn is-btn" onClick={startEdit}>改检查日</button>
            <button type="button" className="tool-btn is-btn" onClick={() => { setCancelled(true); onChange(undefined) }}>取消检查日</button>
          </div>
          {downloaded && <p className="is-muted" role="status">已生成文件。是否导入成功、会不会提醒，以你的日历为准。</p>}
          <p className="is-muted">{ICS_CAVEAT} 文件包含从下一次检查日起约两年的检查日；之后回来重新下载，会按今天往后重新生成。</p>
        </>
      )}
      {showForm && (
        <div className="is-review__form">
          {cancelled && !review && <p className="is-muted" role="status">已取消。已经导入日历的检查日需要在日历里自己删除。</p>}
          <label className="is-field">
            <span>第一个检查日（每月 1—28 日）</span>
            <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} />
          </label>
          <fieldset className="is-inline-fieldset">
            <legend>多久检查一次</legend>
            <label className="is-option is-option--inline">
              <input type="radio" name="is-interval" checked={interval === 3} onChange={() => setIntervalMonths(3)} />
              <span>每季度</span>
            </label>
            <label className="is-option is-option--inline">
              <input type="radio" name="is-interval" checked={interval === 6} onChange={() => setIntervalMonths(6)} />
              <span>每半年</span>
            </label>
          </fieldset>
          {error && <p className="is-error" role="alert">{error}</p>}
          <div className="is-actions">
            <button type="button" className="tool-btn tool-btn--primary is-btn" onClick={save}>保存检查日</button>
            {review && <button type="button" className="tool-btn is-btn" onClick={() => { setEditing(false); setError('') }}>取消</button>}
          </div>
          {review && <p className="is-muted">改期后请在日历里删除旧的整个系列，再导入新文件。</p>}
        </div>
      )}
    </div>
  )
}
