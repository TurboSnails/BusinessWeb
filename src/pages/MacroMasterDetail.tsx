import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Page, TableWrap } from '../components/ui'
import { MASTER_ARTICLES, renderMasterArticleMarkdown } from '../features/macro-masters/articles'
import { DetailTake, DetailTrack } from '../features/macro-masters/DetailTake'
import { indicatorCoverage, masterBySlug } from '../features/macro-masters/masters'
import ReadingCell from '../features/macro-masters/ReadingCell'
import { useReadings, type ReadingsState } from '../features/macro-masters/readings'
import type { Master, MasterIndicator, ReadingKey } from '../features/macro-masters/types'
import '../styles/macro-masters.css'
import '../styles/macro-masters-take.css'

const EVIDENCE_LABELS = { quote: '原话', paraphrase: '转述', unverified: '未证实' } as const

type IndicatorFilter = 'all' | 'exact' | 'proxy' | 'empty' | 'method'

const FILTER_LABELS: Record<IndicatorFilter, string> = {
  all: '全部',
  exact: '有同口径读数',
  proxy: '只有近似',
  empty: '本站暂无',
  method: '方法说明',
}

function indicatorFilter(indicator: MasterIndicator): Exclude<IndicatorFilter, 'all'> {
  if (indicator.kind === 'method') return 'method'
  if (indicator.readings?.length) return 'exact'
  if (indicator.proxyReadings?.length) return 'proxy'
  return 'empty'
}

function indicatorId(master: Master, index: number): string {
  return `mm-indicator-${master.slug}-${index}`
}

const DRUCKENMILLER_COMPARISON: Array<{
  name: string
  january: string
  november: string
  readings?: ReadingKey[]
  proxyReadings?: ReadingKey[]
  proxyNote?: string
  external?: string
}> = [
  {
    name: '政策利率对名义增速',
    january: '联邦基金利率 3.5%，名义增速 6%，他据此判断货币政策极度宽松。',
    november: '美联储没有继续降息，反而加息；他强调政策方向已经改变。',
    readings: ['fedFunds', 'nominalGdpYoy'],
  },
  {
    name: '点阵图',
    january: '点阵图预示年内继续降息。',
    november: '原先的降息路径没有兑现，政策转为加息。',
    readings: ['dotMedian'],
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
    proxyReadings: ['advDecLine'],
    proxyNote: '原话没有指定市场口径；本站为标普 500 当前成分股回算，不是同一条全市场涨跌线。',
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

function ReadingList({ keys, state }: { keys: ReadingKey[]; state: ReadingsState }): JSX.Element {
  const loading = state.state === 'loading'
  return (
    <div className="mm-detail__reading-list">
      {keys.map(key => (
        <ReadingCell key={key} reading={state.state === 'ok' ? state.readings[key] : undefined} loading={loading} />
      ))}
    </div>
  )
}

function ReadingsForIndicator({ indicator, state }: { indicator: MasterIndicator; state: ReadingsState }): JSX.Element {
  if (indicator.kind === 'method') return <span className="mm-detail__method-note">方法说明，不对应数据</span>
  const hasExact = Boolean(indicator.readings?.length)
  const hasProxy = Boolean(indicator.proxyReadings?.length)
  if (!hasExact && !hasProxy) return <ReadingCell reading={null} loading={state.state === 'loading'} />
  return (
    <div className="mm-detail__reading-groups">
      {hasExact && (
        <div className="mm-detail__reading-group">
          <ReadingList keys={indicator.readings!} state={state} />
        </div>
      )}
      {hasProxy && (
        <div className="mm-detail__reading-group mm-detail__reading-group--proxy">
          <span className="mm-detail__reading-group-title">本站近似（口径不同）</span>
          <ReadingList keys={indicator.proxyReadings!} state={state} />
          {indicator.proxyNote && <p className="mm-detail__proxy-note">{indicator.proxyNote}</p>}
        </div>
      )}
    </div>
  )
}

function DruckenmillerComparison({ state }: { state: ReadingsState }): JSX.Element {
  return (
    <section className="mm-detail__section" aria-labelledby="mm-druckenmiller-comparison">
      <h2 id="mm-druckenmiller-comparison">他 2026 年 1 月与 2026 年 11 月的说法对照</h2>
      <p className="mm-detail__intro">来源：研究文档第五节所列 2026-11-17 TomorrowX 峰会英文记录稿 [S12]（疑似转译，日期标注前后不一致）、Bloomberg 报道 [S13]，以及 2026-02-27 发布的 1 月访谈基准 [S10][S11]。这里只对照两处历史说法，不代表他的实时立场。</p>
      <TableWrap label="德鲁肯米勒 2026 年 1 月与 2026 年 11 月说法对照" className="mm-detail__table-wrap">
        <table className="ui-table mm-detail__table mm-detail__table--comparison">
          <thead><tr><th scope="col">观察项</th><th scope="col">2026 年 1 月</th><th scope="col">2026 年 11 月</th><th scope="col">本站对应读数</th></tr></thead>
          <tbody>
            {DRUCKENMILLER_COMPARISON.map(item => (
              <tr key={item.name}>
                <th scope="row">{item.name}</th>
                <td>{item.january}</td>
                <td>{item.november}</td>
                <td>
                  <span className="mm-detail__reading-disclaimer">本站当前读数（不是他的判断）</span>
                  <ReadingsForIndicator indicator={{ name: item.name, howToRead: '', readings: item.readings, proxyReadings: item.proxyReadings, proxyNote: item.proxyNote, evidence: 'paraphrase' }} state={state} />
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

function ResearchArticle({ slug, markdown }: { slug: Master['slug']; markdown: string }): JSX.Element {
  const rendered = useMemo(() => {
    const parts = splitMaintenanceArticle(markdown)
    return {
      before: renderMasterArticleMarkdown(slug, parts.before).html,
      maintenance: parts.maintenance ? renderMasterArticleMarkdown(slug, parts.maintenance).html : '',
      after: parts.after ? renderMasterArticleMarkdown(slug, parts.after).html : '',
    }
  }, [markdown, slug])

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

function KnownMacroMasterDetail({ master }: { master: Master }): JSX.Element {
  const readingsState = useReadings()
  const [filter, setFilter] = useState<IndicatorFilter>('all')
  const [highlighted, setHighlighted] = useState<{ id: string; token: number } | null>(null)
  const failedSources = readingsState.state === 'ok' && 'failedSources' in readingsState && Array.isArray(readingsState.failedSources)
    ? readingsState.failedSources
    : []
  const { counts, readingTargets } = useMemo(() => {
    const coverage = indicatorCoverage(master)
    const counts: Record<IndicatorFilter, number> = { all: master.indicators.length, ...coverage }
    const readingTargets: Partial<Record<ReadingKey, string>> = {}
    master.indicators.forEach((indicator, index) => {
      const id = indicatorId(master, index)
      for (const key of [...indicator.readings ?? [], ...indicator.proxyReadings ?? []]) {
        if (!readingTargets[key]) readingTargets[key] = id
      }
    })
    return { counts, readingTargets }
  }, [master])
  const visibleIndicators = master.indicators
    .map((indicator, index) => ({ indicator, index }))
    .filter(({ indicator }) => filter === 'all' || indicatorFilter(indicator) === filter)

  useEffect(() => {
    if (!highlighted) return
    const target = document.getElementById(highlighted.id)
    if (!target) return
    window.history.replaceState(null, '', `#${highlighted.id}`)
    target.scrollIntoView?.({ block: 'start' })
    const timer = window.setTimeout(() => setHighlighted(null), 1200)
    return () => window.clearTimeout(timer)
  }, [highlighted])

  function goToIndicator(id: string): void {
    setFilter('all')
    setHighlighted({ id, token: Date.now() })
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

      <nav className="mm-toc" aria-label="页内目录">
        <ol className="mm-toc__list">
          <li><a href="#mm-now">现在怎么看</a></li>
          <li><a href="#mm-core-ideas">核心思路</a></li>
          <li><a href="#mm-master-readings">他看的指标</a></li>
          <li><a href="#mm-limits">靠不靠谱与局限</a></li>
          <li><a href="#mm-research-title">完整研究文档</a></li>
        </ol>
      </nav>

      <DetailTake master={master} state={readingsState} readingTargets={readingTargets} onReadingTarget={goToIndicator} />

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
            <p className="mm-detail__intro">同口径读数与“本站近似（口径不同）”分组展示。这是本站测量，不是他的当前信号；不等同于大师本人的实时判断。</p>
          </div>
          <div className="mm-detail__reading-tools">
            {readingsState.state === 'ok' && readingsState.asOf && <span className="mm-detail__as-of">数据快照：{readingsState.asOf}</span>}
            <div className="mm-detail__filters" role="group" aria-label="按读数类型筛选">
              {(Object.keys(FILTER_LABELS) as IndicatorFilter[])
                .filter(value => value !== 'method' || counts[value] > 0)
                .map(value => (
                <button
                  type="button"
                  key={value}
                  className={filter === value ? 'mm-detail__filter mm-detail__filter--active' : 'mm-detail__filter'}
                  aria-pressed={filter === value}
                  onClick={() => { setFilter(value); setHighlighted(null) }}
                >
                  {FILTER_LABELS[value]} {counts[value]}
                </button>
              ))}
            </div>
          </div>
        </div>
        {readingsState.state === 'error' && <p className="mm-detail__error" role="alert">读数暂时无法加载，下方以“本站暂无”显示；研究内容仍可阅读。{readingsState.message && `（${readingsState.message}）`}</p>}
        {readingsState.state === 'ok' && failedSources.length > 0 && <p className="mm-detail__error" role="alert">部分数据来源暂时不可用，其余来源的读数仍保留显示。</p>}
        {visibleIndicators.length > 0 ? (
          <TableWrap label={`${master.name}关注的指标与本站读数`} className="mm-detail__table-wrap">
            <table className="ui-table mm-detail__table mm-detail__table--indicators">
              <thead><tr><th scope="col">指标</th><th scope="col">他怎么读</th><th scope="col">本站当前读数</th></tr></thead>
              <tbody>
                {visibleIndicators.map(({ indicator, index }) => {
                  const id = indicatorId(master, index)
                  return (
                    <tr
                      id={id}
                      key={indicator.name}
                      className={highlighted?.id === id ? 'mm-detail__indicator mm-detail__indicator--highlighted' : 'mm-detail__indicator'}
                    >
                      <th scope="row">
                        <span className="mm-detail__indicator-name">{indicator.name}</span>
                        <span className={`mm-detail__evidence mm-detail__evidence--${indicator.evidence}`}>{EVIDENCE_LABELS[indicator.evidence]}</span>
                      </th>
                      <td>{indicator.howToRead}</td>
                      <td>
                        <ReadingsForIndicator indicator={indicator} state={readingsState} />
                        {indicator.external && <span className="mm-detail__external">{indicator.external}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        ) : <p className="mm-detail__filter-empty">这个分类没有指标。</p>}
      </section>

      {master.slug === 'druckenmiller' && <DruckenmillerComparison state={readingsState} />}

      <DetailTrack master={master} />

      <ResearchArticle slug={master.slug} markdown={MASTER_ARTICLES[master.slug]} />

      <footer className="mm-detail__footer">整理自公开访谈、演讲与书信，原话注明出处；各人观点会变，读数只是本站数据的映射，不代表他们本人的判断，也不构成买卖建议。</footer>
    </Page>
  )
}

export default function MacroMasterDetail(): JSX.Element {
  const { slug } = useParams()
  const master = masterBySlug(slug)

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

  return <KnownMacroMasterDetail master={master} />
}
