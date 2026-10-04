import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { QUOTES } from '../data/quotes'
import RecentUpdates from '../components/RecentUpdates'

const COLUMNS = [
  { to: '/invest', title: '正念投资', desc: '读书、方法、工具与研究。普通人用规则代替盯盘。' },
  { to: '/ai', title: 'AI 与独立开发', desc: '把书里的框架做成小产品，边学边做。' },
  { to: '/life', title: '自由生活实验', desc: '从 *** 到目标 400 万，再到自由生活的第一年。' },
]

export default function Home(): JSX.Element {
  return (
    <main className="container animate-fade-in">
      <section className="hero">
        <p className="hero__eyebrow">正念生活 · Mindful Life</p>
        <h1 className="hero__title">《正念投资》</h1>
        <p className="hero__subtitle">不盯盘、不预测的普通人投资方法</p>
        <div className="hero__actions">
          <Link to="/first-book" className="btn-primary">开始阅读</Link>
          <Link to="/first-book/slow-is-fast" className="btn-ghost">看目录</Link>
        </div>
      </section>

      <p className="manifesto">赚钱不是为了最终什么都不做，而是为了能自由选择值得做的事。</p>

      <section className="home-section">
        <h2>三个栏目</h2>
        <div className="hub-grid">
          {COLUMNS.map(c => (
            <Link key={c.to} to={c.to} className="hub-card">
              <span className="hub-card__title">{c.title}</span>
              <span className="hub-card__desc">{c.desc}</span>
              <ArrowRight size={16} className="hub-card__arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <RecentUpdates />

      <section className="home-section quotes">
        <h2>投资大师名句</h2>
        <div className="quotes__grid">
          {QUOTES.map(q => (
            <blockquote key={q.author} className="quote">
              <p>{q.text}</p>
              <footer>—— {q.author}</footer>
            </blockquote>
          ))}
        </div>
      </section>
    </main>
  )
}
