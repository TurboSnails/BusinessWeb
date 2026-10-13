import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BookMarked, Building2, Calculator, ChartLine, Grid3x3, ListChecks, Network, Search, Thermometer,
  type LucideIcon,
} from 'lucide-react'
import { WORKBENCH_TOOLS, findSearchablePage, type SearchablePage } from '../data/siteMap'
import { readRecent } from '../features/recent-pages/store'
import { summarizeLocalRecords } from '../features/workbench/localRecords'
import { useCommandPalette } from '../components/CommandPalette'
import '../styles/home.css'
import { Page } from '../components/ui'
import { paletteShortcut } from '../utils/shortcut'

const SHORTCUT = paletteShortcut()

const TOOL_ICONS: Record<string, LucideIcon> = {
  '/candidates': ListChecks,
  '/research-notes': Building2,
  '/valuation': Calculator,
  '/dcf': ChartLine,
  '/grid-trading': Grid3x3,
  '/watch': Thermometer,
  '/knowledge': Network,
  '/first-book': BookMarked,
}

const COLUMNS = [
  { to: '/invest', title: '投资', desc: '规则、观察盘、分析筛选、候选池与工具。普通人用规则代替盯盘。' },
  { to: '/ai', title: 'AI实验室', desc: '把书里的框架做成小产品，边学边做。' },
  { to: '/life', title: '自由空间', desc: '从 *** 到目标 400 万，再到自由生活的第一年。' },
]

export default function Home(): JSX.Element {
  const palette = useCommandPalette()
  // 首页不预渲染、不水合，首次渲染直接同步读本机数据，避免闪烁
  const [recent] = useState(() => readRecent().map(findSearchablePage).filter((p): p is SearchablePage => p !== null))
  const [records] = useState(() => summarizeLocalRecords())

  return (
    <Page className="home">
      <header className="home-desk">
        <h1>工作台</h1>
        <button type="button" className="home-jump" aria-label="跳转到页面" onClick={palette.open}>
          <Search size={18} aria-hidden="true" />
          <span className="home-jump__text">跳转到页面…</span>
          <kbd className="home-jump__kbd">{SHORTCUT.keys}</kbd>
        </button>
      </header>

      <section className="home-block" aria-labelledby="home-tools-title">
        <h2 id="home-tools-title" className="home-block__title">常用工具</h2>
        <ul className="home-tools">
          {WORKBENCH_TOOLS.map(tool => {
            const Icon = TOOL_ICONS[tool.path] ?? ArrowRight
            return (
              <li key={tool.path}>
                <Link to={tool.path} className="home-tool">
                  <span className="home-tool__icon" aria-hidden="true"><Icon size={20} /></span>
                  <span className="home-tool__text">
                    <span className="home-tool__label">{tool.label}</span>
                    <span className="home-tool__desc">{tool.desc}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      {(recent.length > 0 || records.length > 0) && (
        <div className="home-personal">
          {recent.length > 0 && (
            <section className="home-block" aria-labelledby="home-recent-title">
              <h2 id="home-recent-title" className="home-block__title">最近访问</h2>
              <ul className="home-recent">
                {recent.map(page => (
                  <li key={page.path}>
                    <Link to={page.path} className="home-recent__link">{page.label}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {records.length > 0 && (
            <section className="home-block" aria-labelledby="home-records-title">
              <h2 id="home-records-title" className="home-block__title">我的记录</h2>
              <ul className="home-records">
                {records.map(r => (
                  <li key={r.kind}>
                    <Link to={r.path} className="home-record">
                      <span className="home-record__head">
                        <span className="home-record__label">{r.label}</span>
                        <span className="home-record__count">{r.count} 条</span>
                      </span>
                      <span className="home-record__latest">
                        最近：{r.latestName}
                        {r.latestDate && <> · <time dateTime={r.latestDate}>{r.latestDate}</time></>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <section className="home-book-band" aria-labelledby="home-book-title">
        <div className="home-book-band__copy">
          <h2 id="home-book-title">《正念投资》</h2>
          <p className="home-book-band__subtitle">不盯盘、不预测的普通人投资方法</p>
          <div className="home-book-band__actions">
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

      <section className="home-block" aria-labelledby="home-blog-title">
        <h2 id="home-blog-title" className="home-block__title">写在路上</h2>
        <p>投资、AI 与自由生活的实践笔记。把思考写下来，把日子过明白。</p>
        <Link to="/blog" className="home-read">走进博客 <ArrowRight size={18} aria-hidden="true" /></Link>
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
    </Page>
  )
}
