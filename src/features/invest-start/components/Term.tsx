import React, { useId, useState } from 'react'
import { TERMS } from '../content'

/** 术语就地解释：术语后一个小「?」按钮，点开在原地显示白话说明（第一次出现的位置用） */
export function Term({ k, children }: { k: keyof typeof TERMS; children?: React.ReactNode }): JSX.Element {
  const t = TERMS[k]
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="is-term">
      {children ?? t.term}
      <button
        type="button"
        className="is-term__btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`什么是${t.term}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="is-term__dot" aria-hidden="true">?</span>
      </button>
      <span id={id} className="is-term__text" hidden={!open}>{t.term}：{t.text}</span>
    </span>
  )
}
