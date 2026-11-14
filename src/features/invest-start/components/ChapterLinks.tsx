import React from 'react'
import { Link } from 'react-router-dom'
import { chapterHref, type ChapterRef } from '../content'

/** 一组书章节链接：「书：7.1 · 7.8 五条红线」 */
export function ChapterLinks({ refs, prefix = '书：' }: { refs?: ChapterRef[]; prefix?: string }): JSX.Element | null {
  if (!refs?.length) return null
  return (
    <span className="is-refs">
      {prefix}
      {refs.map((r, i) => (
        <React.Fragment key={`${r.file}-${r.section ?? ''}`}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <Link to={chapterHref(r)}>{r.label}</Link>
        </React.Fragment>
      ))}
    </span>
  )
}
