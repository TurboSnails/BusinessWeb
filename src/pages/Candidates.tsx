import React, { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ListChecks, Microscope } from 'lucide-react'
import CandidatePool from '../components/CandidatePool'
import { PageTabs, PageTitle } from '../components/ui/PageTabs'
import { DcfCell, DcfFilterChips } from '../components/DcfCell'
import { matchDcfFilter, type DcfFilterId } from '../features/dcf/filter'
import { Page } from '../components/ui'
import { useCompanies } from '../data/companies'
import { RESEARCH_INDEX, type ResearchSummary } from '../data/futureTrendsResearch'
import { poolBucket } from '../data/futureTrendsPresentation'
import { useCandidates } from '../features/candidates/useCandidates'
import { MARKET_LABEL, researchToCandidate, toolProgress } from '../features/candidates/links'
import { useToolSources } from '../features/candidates/useToolSources'
import FutureTrendsPool from './FutureTrendsPool'
import '../styles/candidates.css'

type TabId = 'mine' | 'research'

export default function Candidates(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const tab: TabId = params.get('tab') === 'research' ? 'research' : 'mine'
  // 切页签时只保留各自的筛选参数，避免「研究筛出」的 view/market 残留在「我的候选」
  const setTab = (next: TabId): void => setParams(next === 'mine' ? {} : { tab: 'research' }, { replace: true })

  const cand = useCandidates(true)
  const { list: us } = useCompanies('us')
  const { list: cn } = useCompanies('cn')
  const { list: hk } = useCompanies('hk')
  const { list: adr } = useCompanies('adr')
  const { list: ndx } = useCompanies('ndx')
  const companies = useMemo(() => [...us, ...ndx, ...adr, ...hk, ...cn], [us, ndx, adr, hk, cn])
  const usLists = useMemo(() => ({ us: new Set(us.map(c => c.code)), ndx: new Set(ndx.map(c => c.code)), adr: new Set(adr.map(c => c.code)) }), [us, ndx, adr])

  // 从估值、DCF、网格页回来时重新读取本机记录，进度立即更新
  const tools = useToolSources()

  const [dcfF, setDcfF] = useState<DcfFilterId>('all')
  const valued = cand.items.filter(i => { const p = toolProgress(i.market, i.code, tools); return p.dcf || p.valuation }).length
  const buyable = useMemo(() => RESEARCH_INDEX.filter(r => poolBucket(r) === 'buy').length, [])

  // 研究筛出按 DCF 筛选：对应不上四个市场的公司没有 DCF 记录，只在「全部」和「未算」里出现
  const dcfFilter = (r: ResearchSummary): boolean => {
    if (dcfF === 'all') return true
    const t = researchToCandidate(r, usLists)
    return matchDcfFilter(dcfF, t ? toolProgress(t.market, t.code, tools).dcf : undefined)
  }

  const addAction = (r: ResearchSummary): React.ReactNode => {
    const target = researchToCandidate(r, usLists)
    if (!target) return <span className="cand-add cand-add--off" title="目前只支持美股、港股与 A 股">该市场暂不支持</span>
    const on = cand.items.some(i => i.market === target.market && i.code === target.code)
    return (
      <>
      <DcfCell market={target.market} code={target.code} name={r.name} tools={tools} />
      <button type="button" className="cand-add" aria-pressed={on} aria-label={`${on ? '移出我的池' : '加入我的池'} ${r.name}`}
        onClick={() => cand.toggle(target.market, target.code)}>
        {on ? '✓ 已在我的池' : '＋ 加入我的池'}
        <span className="visually-hidden">（{MARKET_LABEL[target.market]}）</span>
      </button>
      </>
    )
  }

  return (
    <Page className="cand-page">
      <PageTitle>候选池</PageTitle>
      <p className="cand-lead">分析筛选之后的落脚点：研究筛出的公司和你自己挑的公司都在这里。逐家估值、写下等待的条件，价格到了再按计划执行。筛选顺序见<Link to="/investment-plan-2026?tab=screening">投资计划 · 选股流程</Link>。</p>

      <dl className="cand-stats" aria-label="候选池概况">
        <div><dt>我的候选</dt><dd>{cand.items.length}<small> 家</small></dd></div>
        <div><dt>已做估值</dt><dd>{valued}<small> / {cand.items.length}</small></dd></div>
        <div><dt>研究筛出 · 可买卖</dt><dd>{buyable}<small> 家</small></dd></div>
      </dl>

      <PageTabs label="候选池视图" value={tab} onChange={setTab} items={[
        { id: 'mine', label: `我的候选 · ${cand.items.length}`, icon: <ListChecks size={14} /> },
        { id: 'research', label: '研究筛出', icon: <Microscope size={14} /> },
      ]} />

      {tab === 'mine' ? (
        <>
          <ol className="cand-flow" aria-label="使用流程">
            <li><strong>挑公司</strong>在<Link to="/research-notes">公司研究</Link>点「加入候选」，或在「研究筛出」里加入</li>
            <li><strong>写条件</strong>备注里写清楚等什么价格、什么情况放弃</li>
            <li><strong>算价格</strong>点「估值」「DCF」，代码和市场自动带入；结果回到这里显示</li>
            <li><strong>管节奏</strong>A 股和 ETF 可以直接进「网格」回测</li>
          </ol>
          <CandidatePool items={cand.items} companies={companies} tools={tools} state={cand.state} message={cand.message}
            onMove={cand.move} onRemove={i => cand.toggle(i.market, i.code)} onNote={(i, t) => cand.setNote(i.market, i.code, t)}
            onClear={cand.clear} onConnect={cand.connect} onRetry={cand.retry} />
        </>
      ) : (
        <div className="cand-research">
          <FutureTrendsPool action={addAction} filter={dcfFilter} toolbar={<div className="ui-cluster"><DcfFilterChips value={dcfF} onChange={setDcfF} className="ui-cluster" /></div>} />
        </div>
      )}
    </Page>
  )
}
