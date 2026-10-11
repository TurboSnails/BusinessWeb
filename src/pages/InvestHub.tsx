import React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BookOpen, Building2, Calculator, CalendarCheck, ChartLine, ChevronDown, Factory, Grid3x3, Landmark,
  PieChart, Rocket, Sparkles, Thermometer, type LucideIcon,
} from 'lucide-react'
import { INVEST_GROUPS, type HubGroup } from '../data/siteMap'
import '../styles/hub-pages.css'
import { Page } from '../components/ui'

const ICONS: Record<string, LucideIcon> = {
  '/research-notes': Building2,
  '/industry-landscape': Factory,
  '/future-trends': Rocket,
  '/invest/national-team': Landmark,
  '/invest/etf': PieChart,
  '/valuation': Calculator,
  '/dcf': ChartLine,
  '/grid-trading': Grid3x3,
  '/investment-plan-2026': CalendarCheck,
  '/monitor': Thermometer,
}

const group = (id: string): HubGroup => INVEST_GROUPS.find(g => g.id === id)!

/** 卡片组：图标 + 名称 + 一句短说明 */
function CardGroup({ g }: { g: HubGroup }): JSX.Element {
  const titleId = `invest-${g.id}-title`
  return (
    <section className="inv-group" aria-labelledby={titleId}>
      <div className="inv-group__head">
        <h2 id={titleId}>{g.title}</h2>
        {g.hint && <p className="inv-group__hint">{g.hint}</p>}
      </div>
      <ul className="inv-cards">
        {g.links.map(l => {
          const Icon = ICONS[l.path] ?? ArrowRight
          return (
            <li key={l.path}>
              <Link to={l.path} className="inv-card">
                <span className="inv-card__icon" aria-hidden="true"><Icon size={20} /></span>
                <span className="inv-card__text">
                  <span className="inv-card__title">{l.label}</span>
                  <span className="inv-card__desc">{l.short ?? l.desc}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function InvestHub(): JSX.Element {
  const read = group('read')
  const watch = group('watch')
  const related = group('related')
  const archived = group('archived')
  const book = read.links[0]

  return (
    <Page className="hub-page invest-hub">
      <header className="page-head">
        <h1>投资</h1>
        <p>不盯盘、不预测的普通人投资方法：用规则代替盯盘。</p>
      </header>

      {/* 读这本书：方法的起点，一条横幅 */}
      <Link to={book.path} className="inv-book" aria-describedby="invest-read-hint">
        <span className="inv-book__icon" aria-hidden="true"><BookOpen size={24} /></span>
        <span className="inv-book__text">
          <span className="inv-book__kicker">{read.title}</span>
          <span className="inv-book__title">《正念投资》全文与目录</span>
          <span id="invest-read-hint" className="inv-book__hint">{read.hint}</span>
        </span>
        <ArrowRight size={20} className="inv-book__arrow" aria-hidden="true" />
      </Link>

      <CardGroup g={group('research')} />
      <CardGroup g={group('tools')} />
      <CardGroup g={group('method')} />

      {/* 行情：书里主张少看，弱化成一行标签 */}
      <section className="inv-group inv-watch" aria-labelledby="invest-watch-title">
        <div className="inv-group__head">
          <h2 id="invest-watch-title">{watch.title}</h2>
          {watch.hint && <p className="inv-group__hint">{watch.hint}</p>}
        </div>
        <div className="ui-cluster">
          {watch.links.map(l => <Link key={l.path} to={l.path} className="ui-chip" title={l.desc}>{l.label}</Link>)}
        </div>
      </section>

      <p className="inv-related">
        <span className="inv-related__label">{related.title}</span>
        {related.links.map(l => (
          <Link key={l.path} to={l.path} className="inv-related__link" title={l.desc}>
            <Sparkles size={14} aria-hidden="true" />{l.label}
          </Link>
        ))}
      </p>

      <details className="hub-group hub-group--fold">
        <summary>{archived.title}<ChevronDown size={18} aria-hidden="true" /></summary>
        {archived.hint && <p className="hub-group__hint">{archived.hint}</p>}
        <div className="hub-grid">
          {archived.links.map(l => (
            <Link key={l.path} to={l.path} className="hub-card">
              <span className="hub-card__title">{l.label}</span>
              <span className="hub-card__desc">{l.desc}</span>
              <ArrowRight size={16} className="hub-card__arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </details>
    </Page>
  )
}
