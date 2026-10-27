import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { Stars, VerdictBadge } from '../components/lab/LabDirectionCard'
import { findDirection, type LabDirection } from '../data/aiLab'
import { usePageSeo } from '../components/RouteSeo'
import NotFound from './NotFound'
import SkillCatalog from '../components/skills/SkillCatalog'
import { Page } from '../components/ui'
import DropshippingStrategy from '../components/lab/DropshippingStrategy'

function limitRows(d: LabDirection): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  if (d.hoursPerWeek !== undefined) rows.push(['每周时间', `${d.hoursPerWeek} 小时`])
  if (d.startCost) rows.push(['启动成本', d.startCost])
  if (d.limits?.budget) rows.push(['预算上限', d.limits.budget])
  if (d.limits?.deadline) rows.push(['期限', d.limits.deadline])
  if (d.limits?.stopWhen) rows.push(['停止条件', d.limits.stopWhen])
  return rows
}

export default function AiLabDirection(): JSX.Element {
  const { slug = '' } = useParams()
  const d = findDirection(slug)
  usePageSeo(d && d.slug !== 'ai-skills' ? `${d.title}｜AI实验室` : undefined, d?.reason)
  if (!d) return <NotFound />

  const avoid = d.verdict === 'avoid'
  const rows = avoid ? [] : limitRows(d)
  const logs = [...d.logs].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <Page variant={d.slug === 'dropshipping' ? 'reading' : 'default'} className="animate-fade-in lab-page">
      <Link to="/ai" className="lab-back">← AI实验室</Link>
      <header className="page-head">
        <h1>{d.title}</h1>
        {d.slug === 'ai-skills' && <p>思考与提问、开发协作、投资分析、视频创作与小说写作 Skills，按任务挑选。下载包包含 SKILL.md，部分附配套参考资料。</p>}
        {d.slug === 'dropshipping' && <p>供应商一件代发 · 30 天低成本试验</p>}
        <div className="lab-detail__meta">
          <VerdictBadge verdict={d.verdict} />
          <Stars fit={d.fit} />
          <span className="tag">{d.status}</span>
        </div>
      </header>

      {d.slug === 'ai-skills' && <SkillCatalog />}

      <section id={d.slug === 'ai-skills' ? 'skill-experiment' : undefined} className="lab-section">
        <h2>{avoid ? '为什么不做' : '为什么做'}</h2>
        <p>{d.why}</p>
      </section>

      {!avoid && d.plan && <section className="lab-section">
        <h2>怎样验证这门小生意</h2>
        <p className="hub-group__hint">以下是待验证的假设，预算和目标是建议边界，开始前再确认。</p>
        <dl className="lab-limits">
          {([['服务谁', d.plan.audience], ['做什么', d.plan.product], ['怎样获客', d.plan.acquisition], ['怎样收费', d.plan.monetization], ['看什么结果', d.plan.validation]] as const).map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}
        </dl>
        <h3>主要难点</h3>
        <ul>{d.plan.cautions.map(text => <li key={text}>{text}</li>)}</ul>
      </section>}

      {rows.length > 0 && (
        <section className="lab-section">
          <h2>{d.plan ? '建议实验边界' : '实验边界'}</h2>
          <dl className="lab-limits">
            {rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      )}

      {!avoid && d.firstStep && (
        <section className="lab-section">
          <h2>第一步</h2>
          <p>{d.firstStep}</p>
        </section>
      )}

      {d.slug === 'dropshipping' && <DropshippingStrategy />}

      {!avoid && (
        <section className="lab-section">
          <h2>实验日志</h2>
          {logs.length === 0 ? (
            <p className="hub-group__hint">还没开始。开始后会在这里公开记录。</p>
          ) : (
            <ol className="lab-log">
              {logs.map(l => (
                <li key={l.date + l.did}>
                  <div className="lab-log__date">{l.date}</div>
                  <div>{l.did}</div>
                  <div className="hub-group__hint">{l.result}</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </Page>
  )
}
