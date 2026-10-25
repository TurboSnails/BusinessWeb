import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BookOpen, Building2, Calculator, Calendar, CalendarCheck, ChartLine, ChevronDown, Factory, Globe,
  Gauge, Grid3x3, Landmark, ListChecks, PieChart, Rocket, RotateCw, Sparkles, Thermometer, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { INVEST_GROUPS, type HubGroup, type HubLink } from '../data/siteMap'
import { loadLocal } from '../features/candidates/store'
import '../styles/hub-pages.css'
import { Page } from '../components/ui'

const ICONS: Record<string, LucideIcon> = {
  '/first-book': BookOpen,
  '/investment-plan-2026': CalendarCheck,
  '/watch': Gauge,
  '/monitor': Thermometer,
  '/pulse': Globe,
  '/sector-rotation': RotateCw,
  '/daily-analysis': Calendar,
  '/limit-up-analysis': TrendingUp,
  '/industry-landscape': Factory,
  '/future-trends': Rocket,
  '/research-notes': Building2,
  '/invest/national-team': Landmark,
  '/invest/etf': PieChart,
  '/invest/bond-fund-report': Landmark,
  '/candidates': ListChecks,
  '/valuation': Calculator,
  '/invest/comprehensive-valuation': Calculator,
  '/invest/ai-token-economics': TrendingUp,
  '/invest/fundamental-quant': BookOpen,
  '/dcf': ChartLine,
  '/grid-trading': Grid3x3,
}

const group = (id: string): HubGroup => INVEST_GROUPS.find(g => g.id === id)!

function Card({ l }: { l: HubLink }): JSX.Element {
  const Icon = ICONS[l.path] ?? ArrowRight
  return (
    <Link to={l.path} className="inv-card">
      <span className="inv-card__icon" aria-hidden="true"><Icon size={20} /></span>
      <span className="inv-card__text">
        <span className="inv-card__title">{l.label}</span>
        <span className="inv-card__desc">{l.short ?? l.desc}</span>
      </span>
    </Link>
  )
}

/** 卡片组：主入口是卡片；次要入口（minor）收进组内折叠区 */
function CardGroup({ g, step, foldTitle }: { g: HubGroup; step: string; foldTitle?: string }): JSX.Element {
  const titleId = `invest-${g.id}-title`
  const main = g.links.filter(l => !l.minor)
  const minor = g.links.filter(l => l.minor)
  return (
    <section className="inv-group" aria-labelledby={titleId}>
      <div className="inv-group__head">
        <span className="inv-group__step" aria-hidden="true">{step}</span>
        <h2 id={titleId}>{g.title}</h2>
        {g.hint && <p className="inv-group__hint">{g.hint}</p>}
      </div>
      <ul className={main.length === 1 ? 'inv-cards inv-cards--single' : 'inv-cards'}>
        {main.map(l => <li key={l.path}><Card l={l} /></li>)}
      </ul>
      {minor.length > 0 && (
        <details className="inv-minor">
          <summary>{foldTitle ?? '更多'}<span className="inv-minor__count">{minor.length}</span><ChevronDown size={16} aria-hidden="true" /></summary>
          <ul className="inv-cards inv-cards--minor">
            {minor.map(l => <li key={l.path}><Card l={l} /></li>)}
          </ul>
        </details>
      )}
    </section>
  )
}

export default function InvestHub(): JSX.Element {
  const rules = group('rules')
  const pool = group('candidates').links[0]
  const radar = group('candidates').links.find(l => l.path === '/radar')
  const related = group('related')
  const archived = group('archived')
  // 只读本机缓存的条数，不触发云同步；读不到就当 0
  const [mine] = useState(() => { try { return loadLocal().length } catch { return 0 } })

  return (
    <Page className="hub-page invest-hub">
      <header className="page-head">
        <h1>投资</h1>
        <p>不盯盘、不预测的普通人投资方法：用规则代替盯盘。</p>
      </header>

      {/* 规则：书与年度计划，所有决策的前提 */}
      <section className="inv-rules" aria-labelledby="invest-rules-title">
        <h2 id="invest-rules-title" className="visually-hidden">{rules.title}</h2>
        {rules.links.map((l, i) => {
          const Icon = ICONS[l.path] ?? BookOpen
          return (
            <Link key={l.path} to={l.path} className="inv-book">
              <span className="inv-book__icon" aria-hidden="true"><Icon size={24} /></span>
              <span className="inv-book__text">
                <span className="inv-book__kicker">{i === 0 ? '规则 · 读这本书' : '规则 · 今年怎么投'}</span>
                <span className="inv-book__title">{i === 0 ? '《正念投资》全文与目录' : l.label}</span>
                <span className="inv-book__hint">{i === 0 ? rules.hint : l.short}</span>
              </span>
              <ArrowRight size={20} className="inv-book__arrow" aria-hidden="true" />
            </Link>
          )
        })}
      </section>

      <CardGroup g={group('watch')} step="1" foldTitle="细节页：宏观温度、全球行情、A股复盘、板块与涨停" />
      <p className="inv-related"><Link to="/monitor?tab=market-cycle">牛熊周期</Link><span>按周 / 月复核 A 股与港股的六维证据、趋势与策略风险预算</span></p>
      <CardGroup g={group('research')} step="2" />

      {/* 候选池：分析筛选的落脚点，也是进入工具的主入口 */}
      <section className="inv-group" aria-labelledby="invest-candidates-title">
        <div className="inv-group__head">
          <span className="inv-group__step" aria-hidden="true">3</span>
          <h2 id="invest-candidates-title">{group('candidates').title}</h2>
          <p className="inv-group__hint">{group('candidates').hint}</p>
        </div>
        <div className="inv-pool">
          <Link to={pool.path} className="inv-pool__main">
            <span className="inv-card__icon" aria-hidden="true"><ListChecks size={22} /></span>
            <span className="inv-pool__text">
              <span className="inv-pool__title">我的候选池</span>
              <span className="inv-pool__count">{mine > 0 ? `${mine} 家` : '还没有公司'}</span>
              <span className="inv-card__desc">排序、写备注、云同步；每家一键进入估值、DCF、网格</span>
            </span>
            <ArrowRight size={18} className="inv-book__arrow" aria-hidden="true" />
          </Link>
          <Link to="/candidates?tab=research" className="inv-pool__side">
            <span className="inv-pool__title">研究筛出</span>
            <span className="inv-card__desc">可买卖 · 好公司价格太贵 · 全部观察</span>
          </Link>
          {radar && (
            <Link to={radar.path} className="inv-pool__side">
              <span className="inv-pool__title">{radar.label}</span>
              <span className="inv-card__desc">低于买入参考价，且比自身历史与同行便宜</span>
            </Link>
          )}
        </div>
      </section>

      <CardGroup g={group('tools')} step="4" />

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
        <div className="ui-cluster">
          {archived.links.map(l => (
            <Link key={l.path} to={l.path} className="ui-chip" title={l.desc}>
              {l.label}
            </Link>
          ))}
        </div>
      </details>
    </Page>
  )
}
