import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { QUOTES } from '../data/quotes'
import RecentUpdates from '../components/RecentUpdates'
import '../styles/home.css'

const COLUMNS = [
  { to: '/invest', title: '投资', desc: '读书、方法、工具与研究。普通人用规则代替盯盘。' },
  { to: '/ai', title: 'AI实验室', desc: '把书里的框架做成小产品，边学边做。' },
  { to: '/life', title: '自由空间', desc: '从 *** 到目标 400 万，再到自由生活的第一年。' },
]

export default function Home(): JSX.Element {
  return (
    <main className="container home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__copy">
          <h1 id="home-title">《正念投资》</h1>
          <p className="home-hero__subtitle">不盯盘、不预测的普通人投资方法</p>
          <div className="home-hero__actions">
            <Link to="/first-book" className="home-read">开始阅读<ArrowRight size={18} aria-hidden="true" /></Link>
            <Link to="/first-book/slow-is-fast" className="home-contents">看目录<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <p className="home-manifesto">上班，是为了有一天不上班；<br />生活，从来不该被工作定义。</p>
        </div>
        <div className="home-book" aria-hidden="true">
          <div className="home-book__cover">
            <span className="home-book__brand">Live</span>
            <span className="home-book__title">正念投资</span>
            <span className="home-book__note">不盯盘 · 不预测</span>
          </div>
        </div>
      </section>

      <section className="home-columns" aria-labelledby="home-columns-title">
        <h2 id="home-columns-title">三个栏目</h2>
        <div className="home-columns__grid">
          {COLUMNS.map(c => (
            <Link key={c.to} to={c.to} className="home-column">
              <span className="home-column__heading">
                <span className="home-column__title">{c.title}</span>
                <ArrowRight size={20} aria-hidden="true" />
              </span>
              <span className="home-column__desc">{c.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-quotes quotes" aria-labelledby="home-quotes-title">
        <h2 id="home-quotes-title">投资大师名句</h2>
        <div className="home-quotes__grid">
          {QUOTES.map(q => (
            <blockquote key={q.author} className="home-quote">
              <p>{q.text}</p>
              <footer>—— {q.author}</footer>
            </blockquote>
          ))}
        </div>
      </section>

      <RecentUpdates />
    </main>
  )
}
