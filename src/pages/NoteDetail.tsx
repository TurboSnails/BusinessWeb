import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, NotebookText } from 'lucide-react'
import PageHero from '../components/PageHero'
import { Page } from '../components/ui'
import '../styles/etf-notes.css'
import { renderMarkdown } from '../components/MarkdownView'
import { usePageSeo } from '../components/RouteSeo'
import { INDUSTRY_GROUPS, internalNoteSlug } from '../data/industryEtf'
import { findNote, NoteMeta } from '../data/notes'
import NotFound from './NotFound'

export function getNoteDisplayTitle(note: NoteMeta | undefined): string | undefined {
  if (!note) return undefined
  const match = note.slug.match(/^(\d{6})/)
  if (match) {
    const code = match[1]
    if (!note.title.includes(code)) {
      return `${note.title}（${code}）`
    }
  }
  return note.title
}

export function getEtfGridDetailHref(note: NoteMeta | undefined): string | undefined {
  if (!note) return undefined
  for (const group of INDUSTRY_GROUPS) {
    for (const item of group.items) {
      if (item.referenceUrl && internalNoteSlug(item.referenceUrl) === note.slug) {
        return `/grid-trading?code=${item.code}&name=${encodeURIComponent(item.name)}`
      }
    }
  }
  const match = note.slug.match(/^(\d{6})/)
  if (match) {
    const code = match[1]
    for (const group of INDUSTRY_GROUPS) {
      for (const item of group.items) {
        if (item.code === code) {
          return `/grid-trading?code=${item.code}&name=${encodeURIComponent(item.name)}`
        }
      }
    }
    const cleanName = note.title.replace(/（\d{6}）/, '').trim()
    return `/grid-trading?code=${code}&name=${encodeURIComponent(cleanName)}`
  }
  return undefined
}

export default function NoteDetail(): JSX.Element {
  const { slug } = useParams()
  const note = findNote(slug)
  const displayTitle = getNoteDisplayTitle(note)
  const gridHref = getEtfGridDetailHref(note)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)
  usePageSeo(displayTitle, note?.summary)

  useEffect(() => {
    if (!note) return
    let cancelled = false
    setContent(null); setError(false)
    fetch(`${import.meta.env.BASE_URL}notes/${note.slug}.md`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.text() })
      .then(text => { if (!cancelled) setContent(text) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [note])

  if (!note) return <NotFound />

  return (
    <Page>
      <Link to="/notes" className="btn-ghost notes-back">
        <ArrowLeft size={15} /> 全部笔记
      </Link>
      <PageHero icon={<NotebookText size={22} />} title={displayTitle ?? note.title} subtitle={`${note.date} · ${note.tags.join(' · ')}`} />
      <div className="note-actions">
        {gridHref && (
          <Link className="btn-primary" to={gridHref} title="行情曲线、支撑压力、斐波那契及网格回测">
            行情·网格 ↗
          </Link>
        )}
        {note.report && (
          <a className="btn-ghost" href={`${import.meta.env.BASE_URL}${note.report}`}>打开完整报告</a>
        )}
      </div>
      <article className="report-card">
        {!content && !error && <p>加载中……</p>}
        {error && <p role="alert">笔记正文加载失败，请稍后重试。</p>}
        {content && renderMarkdown(content)}
      </article>
    </Page>
  )
}
