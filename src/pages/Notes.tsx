import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, ChevronDown, FileText } from 'lucide-react'
import { Page } from '../components/ui'
import { NOTES, allNoteTags } from '../data/notes'
import '../styles/etf-notes.css'

export default function Notes(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const tags = allNoteTags()
  const active = params.get('tag')
  const shown = [...NOTES].sort((a, b) => b.date.localeCompare(a.date)).filter(n => !active || n.tags.includes(active))
  const primaryTags = tags.slice(0, 8)
  const moreTags = tags.slice(8)
  const tagButton = ({ tag, count }: { tag: string; count: number }): JSX.Element => (
    <button key={tag} type="button" className={`notes-filter${active === tag ? ' is-active' : ''}`} aria-pressed={active === tag} onClick={() => setParams({ tag })}>
      {tag} <span>{count}</span>
    </button>
  )

  return (
    <Page className="notes-page">
      <header className="page-head notes-head">
        <h1>行业研究笔记</h1>
        <p>行业与方案的深度笔记，按日期倒序。单家公司的研究请看<Link to="/research-notes">「公司研究」</Link>。</p>
      </header>

      <nav className="notes-filters" aria-label="按标签筛选">
        <div className="notes-tags">
          <button type="button" className={`notes-filter${active ? '' : ' is-active'}`} aria-pressed={!active} onClick={() => setParams({})}>全部 <span>{NOTES.length}</span></button>
          {primaryTags.map(tagButton)}
        </div>
        {moreTags.length > 0 && (
          <details className="notes-more" open={moreTags.some(t => t.tag === active) || undefined}>
            <summary>更多标签 <span>{moreTags.length}</span><ChevronDown size={14} aria-hidden="true" /></summary>
            <div className="notes-tags">{moreTags.map(tagButton)}</div>
          </details>
        )}
      </nav>

      <section className="notes-results" aria-label="笔记列表">
        <div className="notes-results__head">
          <h2>{active || '全部笔记'} <span>{shown.length} 篇</span></h2>
          <span>按日期倒序</span>
        </div>
        <div className="notes-list">
          {shown.map(n => (
            <article className="notes-entry" key={n.slug}>
              <time className="notes-entry__date" dateTime={n.date}>{n.date}</time>
              <div className="notes-entry__body">
                <h3><Link to={`/notes/${n.slug}`}>{n.title}</Link></h3>
                <p className="notes-entry__summary">{n.summary}</p>
                <div className="notes-entry__meta">
                  <span>{n.tags.join(' · ')}</span>
                  {n.report && <span className="notes-entry__report"><FileText size={13} aria-hidden="true" />含完整报告</span>}
                </div>
              </div>
              <ArrowRight className="notes-entry__arrow" size={18} aria-hidden="true" />
            </article>
          ))}
          {shown.length === 0 && (
            <div className="notes-empty">
              <p>没有符合的笔记。</p>
              <button type="button" className="btn-ghost" onClick={() => setParams({})}>查看全部笔记</button>
            </div>
          )}
        </div>
      </section>
    </Page>
  )
}
