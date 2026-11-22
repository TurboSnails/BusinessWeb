import React, { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Page, TableWrap } from '../components/ui'
import { renderBlogMarkdown } from '../features/blog/markdown'
import { MASTER_ARTICLES } from '../features/macro-masters/articles'
import { masterBySlug } from '../features/macro-masters/masters'
import ReadingCell from '../features/macro-masters/ReadingCell'
import { useReadings, type ReadingsState } from '../features/macro-masters/readings'
import type { MasterIndicator, ReadingKey } from '../features/macro-masters/types'
import '../styles/macro-masters.css'

const EVIDENCE_LABELS = { quote: '原话', paraphrase: '转述', unverified: '未证实' } as const

const DRUCKENMILLER_COMPARISON: Array<{
  name: string
  january: string
  november: string
  readings?: ReadingKey[]
  external?: string
}> = [
  {
    name: '政策利率对名义增速',
    january: '联邦基金利率 3.5%，名义增速 6%，他据此判断货币政策极度宽松。',
    november: '美联储没有继续降息，反而加息；他强调政策方向已经改变。',
    external: 'FRED：DFF 与 A191RP1Q027SBEA；本站实际利率不是同一口径。',
  },
  {
    name: '点阵图',
    january: '点阵图预示年内继续降息。',
    november: '原先的降息路径没有兑现，政策转为加息。',
    external: 'FRED：FEDTARMD（SEP 中位数，季度）。',
  },
  {
    name: '铜与大宗商品',
    january: '铜等大宗商品向上突破并创新高。',
    november: '这些品种已经见顶回落，他披露 Duquesne 已做空铜。',
    readings: ['copper'],
  },
  {
    name: '涨跌家数线',
    january: '涨跌家数线等市场宽度指标创新高。',
    november: '涨跌线在 8 月 14 日见顶，早于 10 月的大盘指数顶部。',
    readings: ['advDecLine'],
    external: '原话没有指定市场口径；本站为标普 500 当前成分股回算。',
  },
  {
    name: '信用利差',
    january: '信用利差非常窄。',
    november: '信用利差正在走阔。',
    readings: ['hySpread', 'baaAaa'],
  },
  {
    name: 'AI 资本开支',
    january: '对 AI 资本开支的乐观支撑着对未来 6–12 个月经济的信心。',
    november: '他的关注重点从 AI 基础设施转向应用，并非宣称 AI 创新已经反转。',
    external: 'SEC EDGAR：超大型科技公司的资本开支披露。',
  },
]

function ReadingsForIndicator({ indicator, state }: { indicator: MasterIndicator; state: ReadingsState }): JSX.Element {
  const loading = state.state === 'loading'
  if (!indicator.readings?.length) return <ReadingCell reading={null} loading={loading} />
  return (
    <div className="mm-detail__reading-list">
      {indicator.readings.map(key => (
        <ReadingCell key={key} reading={state.state === 'ok' ? state.readings[key] : undefined} loading={loading} />
      ))}
    </div>
  )
}

function DruckenmillerComparison({ state }: { state: ReadingsState }): JSX.Element {
  return (
    <section className="mm-detail__section" aria-labelledby="mm-druckenmiller-comparison">
      <h2 id="mm-druckenmiller-comparison">他 2026 年 1 月看多的理由 vs 现在</h2>
      <p className="mm-detail__intro">这里的“现在”指研究文档记录的 2026 年 11 月观点，不代表他的实时立场。流传的五条清单混合了不同场合的说法，本节只按第五节核对的六项市场信号对照。</p>
      <TableWrap label="德鲁肯米勒 2026 年 1 月看多理由与 11 月观点对照" className="mm-detail__table-wrap">
        <table className="ui-table mm-detail__table mm-detail__table--comparison">
          <thead><tr><th scope="col">观察项</th><th scope="col">2026 年 1 月</th><th scope="col">2026 年 11 月</th><th scope="col">本站对应读数</th></tr></thead>
          <tbody>
            {DRUCKENMILLER_COMPARISON.map(item => (
              <tr key={item.name}>
                <th scope="row">{item.name}</th>
                <td>{item.january}</td>
                <td>{item.november}</td>
                <td>
                  <ReadingsForIndicator indicator={{ name: item.name, howToRead: '', readings: item.readings, evidence: 'paraphrase' }} state={state} />
                  {item.external && <span className="mm-detail__external">{item.external}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </section>
  )
}

function splitMaintenanceArticle(markdown: string): { before: string; maintenance: string; after: string } {
  const heading = /^## [^\n]*可映射到本站数据的指标清单[\t ]*$/m.exec(markdown)
  if (!heading || heading.index === undefined) return { before: markdown, maintenance: '', after: '' }
  const bodyStart = heading.index + heading[0].length
  const rest = markdown.slice(bodyStart)
  const nextHeading = /^## /m.exec(rest)
  return {
    before: markdown.slice(0, heading.index),
    maintenance: rest.slice(0, nextHeading?.index ?? rest.length),
    after: nextHeading ? rest.slice(nextHeading.index) : '',
  }
}

function ResearchArticle({ markdown }: { markdown: string }): JSX.Element {
  const rendered = useMemo(() => {
    const parts = splitMaintenanceArticle(markdown)
    const baseUrl = import.meta.env.BASE_URL || '/'
    return {
      before: renderBlogMarkdown(parts.before, baseUrl).html,
      maintenance: parts.maintenance ? renderBlogMarkdown(parts.maintenance, baseUrl).html : '',
      after: parts.after ? renderBlogMarkdown(parts.after, baseUrl).html : '',
    }
  }, [markdown])

  return (
    <section className="mm-detail__section mm-detail__research" aria-labelledby="mm-research-title">
      <h2 id="mm-research-title">完整研究文档</h2>
      <div className="mm-detail__markdown" dangerouslySetInnerHTML={{ __html: rendered.before }} />
      {rendered.maintenance && (
        <details className="mm-detail__maintenance">
          <summary>与本站数据的对应（维护参考）</summary>
          <div className="mm-detail__markdown" dangerouslySetInnerHTML={{ __html: rendered.maintenance }} />
        </details>
      )}
      {rendered.after && <div className="mm-detail__markdown" dangerouslySetInnerHTML={{ __html: rendered.after }} />}
    </section>
  )
}

export default function MacroMasterDetail(): JSX.Element {
  const { slug } = useParams()
  const master = masterBySlug(slug)
  const readingsState = useReadings()

  if (!master) {
    return (
      <Page className="mm-detail">
        <header className="page-head">
          <h1>这一页不存在</h1>
          <p>链接可能写错了，或者这位大师的研究页还没有收录。</p>
        </header>
        <div className="hero__actions ui-cluster">
          <Link to="/invest/macro-masters" className="btn-primary">返回宏观大师总览</Link>
        </div>
      </Page>
    )
  }

  return (
    <Page className="mm-detail">
      <Link to="/invest/macro-masters" className="mm-detail__back"><ArrowLeft size={17} aria-hidden="true" />返回宏观大师总览</Link>
      <header className="mm-detail__header">
        <p className="mm-detail__eyebrow">宏观大师 / CYCLE RESEARCH</p>
        <h1>{master.name}</h1>
        <p className="mm-detail__name-en">{master.nameEn}</p>
        <p className="mm-detail__one-liner">{master.oneLiner}</p>
        <ul className="mm-detail__tags" aria-label="风格标签">
          {master.tags.map(tag => <li key={tag}>{tag}</li>)}
          <li>{master.kind === 'quant' ? '偏定量' : '偏定性'}</li>
        </ul>
      </header>

      <section className="mm-detail__section" aria-labelledby="mm-core-ideas">
        <h2 id="mm-core-ideas">核心思路</h2>
        <ol className="mm-detail__ideas">
          {master.ideas.map((idea, index) => <li key={idea}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><p>{idea}</p></li>)}
        </ol>
      </section>

      <section className="mm-detail__section" aria-labelledby="mm-master-readings">
        <div className="mm-detail__section-heading">
          <div>
            <h2 id="mm-master-readings">他看的指标 · 本站当前读数</h2>
            <p className="mm-detail__intro">读数只是研究框架与本站数据的对应，不等同于大师本人的实时判断。</p>
          </div>
          {readingsState.state === 'ok' && readingsState.asOf && <span className="mm-detail__as-of">数据快照：{readingsState.asOf}</span>}
        </div>
        {readingsState.state === 'error' && <p className="mm-detail__error" role="alert">读数暂时无法加载，下方以“本站暂无”显示；研究内容仍可阅读。{readingsState.message && `（${readingsState.message}）`}</p>}
        <TableWrap label={`${master.name}关注的指标与本站读数`} className="mm-detail__table-wrap">
          <table className="ui-table mm-detail__table">
            <thead><tr><th scope="col">指标</th><th scope="col">他怎么读</th><th scope="col">本站当前读数</th><th scope="col">证据等级</th></tr></thead>
            <tbody>
              {master.indicators.map(indicator => (
                <tr key={indicator.name}>
                  <th scope="row">{indicator.name}</th>
                  <td>{indicator.howToRead}</td>
                  <td>
                    <ReadingsForIndicator indicator={indicator} state={readingsState} />
                    {indicator.external && <span className="mm-detail__external">{indicator.external}</span>}
                  </td>
                  <td><span className={`mm-detail__evidence mm-detail__evidence--${indicator.evidence}`}>{EVIDENCE_LABELS[indicator.evidence]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>

      {master.slug === 'druckenmiller' && <DruckenmillerComparison state={readingsState} />}

      <section className="mm-detail__section mm-detail__limits" aria-labelledby="mm-limits">
        <h2 id="mm-limits">局限</h2>
        <p>{master.limits}</p>
      </section>

      <ResearchArticle markdown={MASTER_ARTICLES[master.slug]} />

      <footer className="mm-detail__footer">整理自公开访谈、演讲与书信，原话注明出处；各人观点会变，读数只是本站数据的映射，不代表他们本人的判断，也不构成买卖建议。</footer>
    </Page>
  )
}
