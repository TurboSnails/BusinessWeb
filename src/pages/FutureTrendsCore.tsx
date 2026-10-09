import React from 'react'
import CompanyComparison from '../components/future-trends/CompanyComparison'
import FutureCompanyLink from '../components/FutureCompanyLink'
import { CORE } from '../data/futureTrendsCore'
import { downloadJson } from '../data/futureTrendsPool'
import { RESEARCH_BY_KEY } from '../data/futureTrendsResearch'
import { byPriority, presentation, SELECTION } from '../data/futureTrendsPresentation'
import '../styles/future-trends.css'
export default function FutureTrendsCore(): JSX.Element {
  const rows = CORE.map(x => x.research).sort(byPriority)
  const first = rows.filter(x => presentation(x).priority === 1)
  const second = rows.filter(x => presentation(x).priority === 2)
  const groups = Object.entries(rows.reduce<Record<string,number>>((m,r) => { const sector=presentation(r).sector; m[sector]=(m[sector] ?? 0)+1; return m },{}))
  return <div className="ft">
    <header className="ft-heading"><div><div className="ft-eyebrow">精选 {rows.length} 家 · {groups.length} 个主营行业</div><h2>核心：先看这 {first.length} 家</h2><p>腾讯、宁德时代、舜宇光学、美敦力、微软、林德优先跟踪；其余 {second.length} 家作为备选。选择依据是经营壁垒、盈利质量与风险互补，下一步取决于各自价格和经营验证。</p></div><button className="ft-export" type="button" onClick={() => downloadJson('未来趋势核心研究-2026-10-09.json',rows)}>导出核心 JSON</button></header>
    <div className="ft-distribution" aria-label="核心主营业务分布">{groups.map(([name,count]) => <span key={name}><strong>{name}</strong>{count} 家</span>)}</div>
    <div className="ft-section-head"><h3>优先候选</h3><p>业务质量优先，价格条件逐家比较</p></div><CompanyComparison rows={first} />
    <div className="ft-section-head"><h3>备选</h3><p>保留跟踪，等待更好的价格或经营证据</p></div><CompanyComparison rows={second} />
    <p className="ft-method">当前情景估值均为待复核草稿；优先跟踪不等于现价买入。2:1 条件价仅说明给定假设下的赔率门槛，实际胜率尚未校准。报价截至 2026-10-09。</p>
    <details className="ft-method"><summary>为什么暂缓这 5 家？</summary><ul>{SELECTION.filter(x => x.priority === 3).map(x => { const r=RESEARCH_BY_KEY.get(x.key)!; return <li key={x.key}><strong><FutureCompanyLink name={r.name} code={r.code} /></strong>：{x.reason} {x.watch}</li> })}</ul></details>
    <details className="ft-method"><summary>行业分散之后，还要看哪些共同风险？</summary><p>单一行业最多 3 / 15 家（20%，按公司数量计算，并非持仓权重）。分类按主营业务：石头属于清洁电器，柏楚属于激光控制软件，美敦力属于医疗器械。</p><p>腾讯与舜宇共享中国消费风险；微软和腾讯受 AI 投入回报影响；柏楚与汽车供应链受制造业资本开支影响；空客与 RTX 共享航空供应链；医疗三家公司仍有政策风险。利率也会同时影响公用事业与工业气体，行业分散不等于风险独立。</p></details>
  </div>
}
