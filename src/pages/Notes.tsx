import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { NotebookText } from 'lucide-react'
import PageHero from '../components/PageHero'
import { Page } from '../components/ui'
import { NOTES, allNoteTags } from '../data/notes'
import '../styles/etf-notes.css'

export default function Notes(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const tags = allNoteTags()
  const active = params.get('tag')
  const shown = [...NOTES].sort((a, b) => b.date.localeCompare(a.date)).filter(n => !active || n.tags.includes(active))

  return (
    <Page className="notes-page">
      <PageHero icon={<NotebookText size={22} />} title="行业研究笔记" subtitle="行业与方案的深度笔记，按日期倒序。单家公司的研究请看「公司研究」。" />

      <nav className="notes-tags" aria-label="按标签筛选">
        <button type="button" className={`tag${active ? '' : ' tag--active'}`} aria-pressed={!active} onClick={() => setParams({})}>全部 {NOTES.length}</button>
        {tags.map(({ tag, count }) => (
          <button key={tag} type="button" className={`tag${active === tag ? ' tag--active' : ''}`} aria-pressed={active === tag} onClick={() => setParams({ tag })}>{tag} {count}</button>
        ))}
      </nav>

      <section className="skill-grid" aria-label="笔记列表">
        {shown.map(n => (
          <article className="skill-card" key={n.slug}>
            <span className="tag">{n.date}</span>
            <h3><Link to={`/notes/${n.slug}`}>{n.title}</Link></h3>
            <p>{n.summary}</p>
            <p className="skill-card__alias">{n.tags.join(' · ')}{n.report ? ' · 含完整报告' : ''}</p>
          </article>
        ))}
        {shown.length === 0 && <p>没有符合的笔记。</p>}
      </section>
    </Page>
  )
}
