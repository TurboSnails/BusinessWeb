import React, { useEffect, useRef } from 'react'
import { QUESTIONS } from '../content'
import { answeredCount } from '../recommend'
import type { Answer, Answers, Qid } from '../types'
import { ChapterLinks } from './ChapterLinks'

/**
 * 自测：单一 fieldset 流程，一次一题，可前后退；手机与桌面同一套 DOM（不做两套可编辑 radio）。
 * index 为 null 表示已答完、显示摘要。
 */
export function Assessment({ answers, index, onIndex, onAnswer, onFinish, onRestart, assessedAt, focusRequest = 0 }: {
  answers: Answers
  index: number | null
  onIndex: (i: number | null) => void
  onAnswer: (qid: Qid, v: Answer) => void
  onFinish: () => void
  onRestart: () => void
  assessedAt?: string
  /** 父组件触发的跳题（全部重做、按另一笔钱重做、清除）每次加 1，把焦点交给新出现的题目 */
  focusRequest?: number
}): JSX.Element {
  const total = QUESTIONS.length
  const done = answeredCount(answers)
  const boxRef = useRef<HTMLFieldSetElement>(null)
  const navigated = useRef(false)

  // 只有本人点「上一题 / 下一题」后才移动焦点，首次渲染不抢焦点
  useEffect(() => {
    if (navigated.current && index !== null) boxRef.current?.focus()
    navigated.current = false
  }, [index])

  useEffect(() => {
    if (focusRequest > 0) boxRef.current?.focus()
  }, [focusRequest])

  const go = (i: number | null): void => {
    navigated.current = true
    onIndex(i)
  }

  if (index === null) {
    const complete = done === total
    return (
      <div className="is-assess-summary">
        <p>
          {complete ? `已完成全部 ${total} 题` : `已答 ${done} / ${total} 题`}
          {complete && assessedAt ? `（${assessedAt.slice(0, 10)}）` : ''}。答案只存在这台设备上。
        </p>
        <div className="is-actions">
          <button type="button" className="tool-btn is-btn" onClick={() => go(complete ? 0 : Math.max(0, QUESTIONS.findIndex(q => !answers[q.id])))}>
            {complete ? '修改答案' : done ? '继续自测' : '开始自测'}
          </button>
          {done > 0 && <button type="button" className="tool-btn is-btn" onClick={onRestart}>全部重做</button>}
        </div>
      </div>
    )
  }

  const q = QUESTIONS[index]
  const value = answers[q.id]
  const last = index === total - 1
  const legendId = `is-q-${q.id}-legend`

  return (
    <div className="is-assess">
      <p className="is-progress" aria-live="polite">第 {index + 1} / {total} 题 · 已答 {done} 题</p>
      <fieldset ref={boxRef} tabIndex={-1} className="is-fieldset">
        <legend id={legendId} className="is-legend">{q.title}</legend>
        {q.hint && <p className="is-hint">{q.hint}</p>}
        <div className="is-options">
          {q.options.map(o => (
            <label key={o.value} className={value === o.value ? 'is-option is-option--on' : 'is-option'}>
              <input type="radio" name={`is-${q.id}`} value={o.value} checked={value === o.value} onChange={() => onAnswer(q.id, o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <p className="is-muted"><ChapterLinks refs={q.refs} prefix="对应书中：" /></p>
      </fieldset>
      <div className="is-actions">
        <button type="button" className="tool-btn is-btn" disabled={index === 0} onClick={() => go(index - 1)}>上一题</button>
        {last ? (
          <button type="button" className="tool-btn tool-btn--primary is-btn" disabled={done < total} onClick={() => { navigated.current = false; onFinish() }}>
            查看结果
          </button>
        ) : (
          <button type="button" className="tool-btn tool-btn--primary is-btn" disabled={!value} onClick={() => go(index + 1)}>下一题</button>
        )}
      </div>
      {last && done < total && <p className="is-muted">还有题目没答，答完 {total} 题才给结果。</p>}
    </div>
  )
}
