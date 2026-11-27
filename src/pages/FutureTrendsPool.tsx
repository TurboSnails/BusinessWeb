import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Segmented } from '../components/ui/PageTabs'
import CompanyComparison from '../components/future-trends/CompanyComparison'
import { POOL, downloadJson } from '../data/futureTrendsPool'
import { RESEARCH_ASOF, RESEARCH_BY_KEY, RESEARCH_INDEX } from '../data/futureTrendsResearch'
import { byPriority, poolBucket } from '../data/futureTrendsPresentation'
import type { ResearchSummary } from '../data/futureTrendsResearch'
import '../styles/future-trends.css'
import { PageDataFreshness } from '../components/ui/PageDataFreshness'
const views = [
  { id: '1', label: '满足情景门槛', bucket: 'buy' },
  { id: '2', label: '其余入围公司', bucket: 'rich' },
  { id: '4', label: '全部观察', bucket: null },
] as const

const companies = POOL.flatMap(entry => {
  const research = RESEARCH_BY_KEY.get(entry.key)
  return research ? [{ market: entry.market, research, bucket: poolBucket(research) }] : []
})
const buyableInPool = companies.filter(entry => entry.bucket === 'buy').length
const buyableResearch = RESEARCH_INDEX.filter(research => poolBucket(research) === 'buy').length

export default function FutureTrendsPool({ loading = false, action, filter, toolbar }: { loading?: boolean; action?: (r: ResearchSummary) => React.ReactNode; filter?: (r: ResearchSummary) => boolean; toolbar?: React.ReactNode } = {}): JSX.Element {
  const [params, setParams] = useSearchParams()
  if (loading) return <p className="cand-buyable" role="status">正在加载…</p>

  const active = views.find(item => item.id === params.get('view')) ?? views[0]
  const market = ['中国','海外'].includes(params.get('market') ?? '') ? params.get('market')! : '全部'
  const sort = ['ratio','space'].includes(params.get('sort') ?? '') ? params.get('sort')! : 'priority'
  const query = params.get('q') ?? ''
  function change(key: string, value: string) { const next = new URLSearchParams(params); next.set(key,value); next.delete('page'); setParams(next, { replace: key === 'q' }) }
  const search = query.trim().toLowerCase()
  const matches = companies.filter(entry =>
    (market === '全部' || market === entry.market)
    && `${entry.research.name} ${entry.research.code}`.toLowerCase().includes(search)
    && (!filter || filter(entry.research))
  )
  const rows = matches.filter(entry => !active.bucket || entry.bucket === active.bucket)
    .map(entry => entry.research)
    .sort((a, b) => {
      if (sort === 'priority') return byPriority(a, b)
      const metric = sort === 'ratio' ? 'ratio' : 'up'
      return (b[metric] ?? -Infinity) - (a[metric] ?? -Infinity) || byPriority(a, b)
    })
  const pages = Math.max(1,Math.ceil(rows.length / 20))
  const rawPage = Number(params.get('page'))
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage,pages) : 1
  function paginate(n: number) { const next = new URLSearchParams(params); next.set('page',String(n)); setParams(next) }
  return <div className="ft">
    <PageDataFreshness checkedAt={rows.map(r => r.priceCheckedAt).filter(Boolean).sort().at(-1)} dataLabel="行情日期" dataDates={rows.map(r => r.priceDate)} researchAsOf={RESEARCH_ASOF} note="盈亏比按各公司的报价计算，盈利假设和情景价格沿用原研究。" />

    <header className="ft-heading"><div><h2>研究筛出</h2><p>在已入围公司中，筛选情景盈亏比 ≥ 0.75 且假设期望收益 ≥ 20% 的公司。期望收益采用主观概率。点开公司可核对原始假设、风险和报价日期。</p></div><button className="ft-export" type="button" onClick={() => downloadJson(`未来趋势候选研究-${RESEARCH_ASOF}.json`, rows)}>导出筛选结果 JSON</button></header>
    <p className="cand-buyable">入围池满足情景门槛 {buyableInPool} 家（研究全量 {buyableResearch} 家），共观察 {RESEARCH_INDEX.length} 家公司。</p>
    <div className="ft-views" role="group" aria-label="候选优先级">{views.map(({ id: v, label: t, bucket: b }) => <button key={v} type="button" aria-pressed={active.id === v} onClick={() => change('view',v)}>{t}<span>{b ? matches.filter(x => x.bucket === b).length : matches.length}</span></button>)}</div>
    {toolbar}
    <div className="ft-toolbar"><Segmented label="市场" value={market} onChange={v => change('market',v)} items={['全部','中国','海外'].map(id => ({id,label:id}))} /><label className="ft-sort">排序<select aria-label="排序" value={sort} onChange={e => change('sort',e.target.value)}><option value="priority">研究跟踪顺序</option><option value="ratio">情景盈亏比</option><option value="space">基准价格空间</option></select></label><label className="ft-search"><span className="visually-hidden">搜索公司或代码</span><input type="search" name="company" autoComplete="off" spellCheck={false} placeholder="公司名称或代码…" value={query} onChange={e => change('q',e.target.value)} /></label></div>
    <div className="ft-results"><h3>{active.label}</h3><span role="status" aria-live="polite">{rows.length} 家{pages > 1 ? ` · 第 ${page} / ${pages} 页` : ''}</span></div>
    <CompanyComparison rows={rows.slice((page-1)*20,page*20)} action={action} />
    {!rows.length && <div className="ft-empty"><p>没有找到匹配公司。</p><button className="ft-export" type="button" onClick={() => { const next = new URLSearchParams(params); ['market','q','sort','page','dcf'].forEach(k => next.delete(k)); next.set('view','4'); setParams(next) }}>查看全部观察公司</button></div>}
    {pages > 1 && <nav className="ft-pagination" aria-label="候选池分页"><button type="button" disabled={page === 1} onClick={() => paginate(page-1)}>上一页</button><span>{page} / {pages}</span><button type="button" disabled={page === pages} onClick={() => paginate(page+1)}>下一页</button></nav>}
    <p className="ft-method"><Link to="/future-trends?tab=solid-state#solid-core-review">固态电池 40 家公司的筛选依据</Link></p>
    <details className="ft-method"><summary>研究范围与计算口径</summary><p>625 家上市公司可查询，另有 26 家非上市或状态待核公司保留产业观察页。65 家（核心 12 家 + 入围候选 53 家）有公司披露摘录、情景草稿与主观概率，其余为初筛；所有情景尚待独立估值复核。实际胜率未经校准。</p><p>盈亏比 R=(基准价−现价)/(现价−悲观价)，仅悲观价＜现价＜基准价时有效。2:1 条件价=(基准价+2×悲观价)/3。悲观情景不是最大损失，条件价不等于合理价值。</p></details>
  </div>
}
