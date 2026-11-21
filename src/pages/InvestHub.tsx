import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import SmartLink from '../components/SmartLink'
import {
  Activity, ArrowRight, BookOpen, Building2, Calculator, Calendar, CalendarCheck, CalendarClock, ChartLine, ChevronDown, Factory, Globe,
  Gauge, Grid3x3, Landmark, ListChecks, MessagesSquare, PieChart, Rocket, RotateCw, Sparkles, Thermometer, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { INVEST_GROUPS, type HubGroup, type HubLink } from '../data/siteMap'
import { loadLocal } from '../features/candidates/store'
import '../styles/hub-pages.css'
import { Page } from '../components/ui'

const ICONS: Record<string, LucideIcon> = {
  '/first-book': BookOpen,
  '/invest/my-plan': CalendarCheck,
  '/investment-plan-2026': CalendarClock,
  '/watch': Gauge,
  '/monitor': Thermometer,
  '/pulse': Globe,
  '/sector-rotation': RotateCw,
  '/daily-analysis': Calendar,
  '/limit-up-analysis': TrendingUp,
  '/market-mood': Activity,
  '/ths-mood': Gauge,
  '/industry-landscape': Factory,
  '/future-trends': Rocket,
  '/research-notes': Building2,
  '/invest/national-team': Landmark,
  '/invest/etf': PieChart,
  '/invest/bond-fund-report': Landmark,
  '/candidates': ListChecks,
  '/earnings': CalendarClock,
  '/valuation': Calculator,
  '/invest/comprehensive-valuation': Calculator,
  '/invest/ai-token-economics': TrendingUp,
  '/invest/fundamental-quant': BookOpen,
  '/dcf': ChartLine,
  '/index-panorama/': Globe,
  '/grid-trading': Grid3x3,
  '/invest/blogger-views': MessagesSquare,
}

const group = (id: string): HubGroup => INVEST_GROUPS.find(g => g.id === id)!

function Card({ l }: { l: HubLink }): JSX.Element {
  const Icon = ICONS[l.path] ?? ArrowRight
  return (
    <SmartLink to={l.path} className="inv-card">
      <span className="inv-card__icon" aria-hidden="true"><Icon size={20} /></span>
      <span className="inv-card__text">
        <span className="inv-card__title">{l.label}</span>
        <span className="inv-card__desc">{l.short ?? l.desc}</span>
      </span>
    </SmartLink>
  )
}

/** 卡片组：主入口是卡片；次要入口（minor）收进组内折叠区 */
function CardGroup({ g, step, foldTitle }: { g: HubGroup; step?: string; foldTitle?: string }): JSX.Element {
  const titleId = `invest-${g.id}-title`
  const main = g.links.filter(l => !l.minor)
  const minor = g.links.filter(l => l.minor)
  return (
    <section className="inv-group" aria-labelledby={titleId}>
      <div className="inv-group__head">
        {step && <span className="inv-group__step" aria-hidden="true">{step}</span>}
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
        <p>从公司研究出发，核对估值假设，记录下次复查的条件。</p>
        <nav className="hub-jump-nav" aria-label="常用投资任务">
          <Link to="/research-notes">查一家公司</Link>
          <Link to="/candidates">复查我的候选{mine > 0 ? `（本机 ${mine} 家）` : ''}</Link>
          <Link to="/invest/start">第一次来？从这里开始 →</Link>
        </nav>
      </header>

      {/* 规则：书、我的计划、作者示例计划 */}
      <section className="inv-rules" aria-labelledby="invest-rules-title">
        <h2 id="invest-rules-title" className="visually-hidden">{rules.title}</h2>
        {rules.links.map(l => {
          const Icon = ICONS[l.path] ?? BookOpen
          const kicker =
            l.path === '/first-book'
              ? '规则 · 读这本书'
              : l.path === '/invest/my-plan'
                ? '规则 · 我的计划'
                : '规则 · 作者示例'
          const title = l.path === '/first-book' ? '《正念投资》全文与目录' : l.label
          const hint = l.path === '/first-book' ? rules.hint : l.short
          return (
            <Link key={l.path} to={l.path} className="inv-book">
              <span className="inv-book__icon" aria-hidden="true"><Icon size={24} /></span>
              <span className="inv-book__text">
                <span className="inv-book__kicker">{kicker}</span>
                <span className="inv-book__title">{title}</span>
                <span className="inv-book__hint">{hint}</span>
              </span>
              <ArrowRight size={20} className="inv-book__arrow" aria-hidden="true" />
            </Link>
          )
        })}
      </section>

      <CardGroup g={group('watch')} step="1" foldTitle="细节页：宏观温度、全球行情、A股复盘、板块与涨停" />
      <p className="inv-related"><Link to="/monitor?tab=market-cycle">牛熊周期</Link><span>按周 / 月复核沪深300、恒生指数、恒生科技、标普500、纳指100的六维证据、趋势与策略风险预算</span></p>
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
            <span className="inv-card__desc">按情景盈亏比和假设期望收益筛选</span>
          </Link>
          {radar && (
            <Link to={radar.path} className="inv-pool__side">
              <span className="inv-pool__title">{radar.label}</span>
              <span className="inv-card__desc">价值回归与快速增长两条线的研究短名单</span>
            </Link>
          )}
        </div>
      </section>

      <CardGroup g={group('tools')} step="4" />

      {/* 实验观察：研究中的独立观察页，未验证，不编号 */}
      <CardGroup g={group('lab-observe')} />

      {/* 三方平台：参照第三方 App 做的页面，不属于 1–4 的流程，不编号 */}
      <CardGroup g={group('third-party')} />

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
