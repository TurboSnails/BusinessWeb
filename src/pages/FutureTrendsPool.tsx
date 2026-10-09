import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Segmented } from '../components/ui/PageTabs'
import CompanyComparison from '../components/future-trends/CompanyComparison'
import { POOL, downloadJson } from '../data/futureTrendsPool'
import { RESEARCH_BY_KEY } from '../data/futureTrendsResearch'
import { byPriority, presentation, priorityNames, Priority } from '../data/futureTrendsPresentation'
import '../styles/future-trends.css'
export default function FutureTrendsPool(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const view = ['1','2','3','4'].includes(params.get('view') ?? '') ? params.get('view')! : '1'
  const market = ['中国','海外'].includes(params.get('market') ?? '') ? params.get('market')! : '全部'
  const sort = ['ratio','space'].includes(params.get('sort') ?? '') ? params.get('sort')! : 'priority'
  const query = params.get('q') ?? ''
  function change(key: string, value: string) { const next = new URLSearchParams(params); next.set(key,value); next.delete('page'); setParams(next, { replace: key === 'q' }) }
  const all = POOL.map(x => ({ market: x.market, r: RESEARCH_BY_KEY.get(x.key)! }))
  const rows = all.filter(({market:m,r}) => (market === '全部' || market === m) && (view === '4' || presentation(r).priority === Number(view)) && `${r.name} ${r.code}`.toLowerCase().includes(query.trim().toLowerCase())).map(x => x.r).sort((a,b) => sort === 'ratio' ? (b.ratio ?? -Infinity) - (a.ratio ?? -Infinity) || byPriority(a,b) : sort === 'space' ? (b.up ?? -Infinity) - (a.up ?? -Infinity) || byPriority(a,b) : byPriority(a,b))
  const pages = Math.max(1,Math.ceil(rows.length / 20))
  const rawPage = Number(params.get('page'))
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage,pages) : 1
  function paginate(n: number) { const next = new URLSearchParams(params); next.set('page',String(n)); setParams(next) }
  return <div className="ft">
    <header className="ft-heading"><div><div className="ft-eyebrow">从公司质量，到价格条件</div><h2>候选池</h2><p>先看优先候选，再比较备选。每家公司都说明入选理由与等待条件，点击名称查看详细分析。</p></div><button className="ft-export" type="button" onClick={() => downloadJson('未来趋势候选研究-2026-10-09.json', rows)}>导出筛选结果 JSON</button></header>
    <div className="ft-views" role="group" aria-label="候选优先级">{([1,2,3,4] as Priority[]).map(v => <button key={v} type="button" aria-pressed={view === String(v)} onClick={() => change('view',String(v))}>{priorityNames[v]}<span>{v === 4 ? all.length : all.filter(x => presentation(x.r).priority === v).length}</span></button>)}</div>
    <div className="ft-toolbar"><Segmented label="市场" value={market} onChange={v => change('market',v)} items={['全部','中国','海外'].map(id => ({id,label:id}))} /><label className="ft-sort">排序<select aria-label="排序" value={sort} onChange={e => change('sort',e.target.value)}><option value="priority">推荐顺序</option><option value="ratio">情景盈亏比</option><option value="space">基准价格空间</option></select></label><label className="ft-search"><span className="visually-hidden">搜索公司或代码</span><input type="search" name="company" autoComplete="off" spellCheck={false} placeholder="公司名称或代码…" value={query} onChange={e => change('q',e.target.value)} /></label></div>
    <div className="ft-results"><h3>{priorityNames[Number(view) as Priority]}</h3><span role="status" aria-live="polite">{rows.length} 家{pages > 1 ? ` · 第 ${page} / ${pages} 页` : ''}</span></div>
    <CompanyComparison rows={rows.slice((page-1)*20,page*20)} />
    {!rows.length && <div className="ft-empty"><p>没有找到匹配公司。</p><button className="ft-export" type="button" onClick={() => setParams({tab:'pool',view:'4'})}>查看全部观察公司</button></div>}
    {pages > 1 && <nav className="ft-pagination" aria-label="候选池分页"><button type="button" disabled={page === 1} onClick={() => paginate(page-1)}>上一页</button><span>{page} / {pages}</span><button type="button" disabled={page === pages} onClick={() => paginate(page+1)}>下一页</button></nav>}
    <p className="ft-method">优先级表示跟踪顺序，当前仍需等待价格与经营验证。情景盈亏比和 2:1 条件价为估值草稿，不是买入指令。报价截至 2026-10-09，具体时点见公司页。</p>
    <details className="ft-method"><summary>研究范围与计算口径</summary><p>465 家上市公司可查询，另有 26 家非上市或状态待核公司保留产业观察页。20 家有公司披露摘录与情景草稿，其余为初筛；所有情景尚待独立估值复核。实际胜率未经校准。</p><p>盈亏比 R=(基准价−现价)/(现价−悲观价)，仅悲观价＜现价＜基准价时有效。2:1 条件价=(基准价+2×悲观价)/3。悲观情景不是最大损失，条件价不等于合理价值。</p></details>
  </div>
}
