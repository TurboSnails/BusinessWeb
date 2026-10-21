import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, ArrowUpRight, Search } from 'lucide-react'
import { Page } from '../components/ui'
import {
  BOOKS, CATEGORIES, FACTORS, LYNCH_FIT, METHODS, PROVENANCE_LABELS, RESEARCH_STATUS,
  SOURCES, STRATEGIES, UPDATED_AT, VALIDATION_CHECKS, filterFactors,
  type Category, type Provenance, type SourceId,
} from '../features/fundamental-quant/content'
import '../styles/fundamental-quant.css'

function Evidence({ provenance, sources }: { provenance: Provenance; sources: SourceId[] }): JSX.Element {
  return <p className="fq-evidence"><span className="fq-label">{PROVENANCE_LABELS[provenance]}</span><span>依据：{sources.map((source, index) => <React.Fragment key={source}>{index > 0 && '、'}<a href={`#fq-source-${source}`} aria-label={SOURCES[source].title}>{SOURCES[source].short}</a></React.Fragment>)}</span></p>
}

export default function FundamentalQuant(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const rawCategory = params.get('category')
  const category: Category = CATEGORIES.find(item => item === rawCategory) ?? '全部'
  const [checked, setChecked] = useState<string[]>([])
  const factors = filterFactors(query, category)
  const updateFilter = (key: 'q' | 'category', value: string) => {
    const next = new URLSearchParams(params)
    if (!value.trim() || value === '全部') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true, preventScrollReset: true })
  }
  const reset = () => {
    const next = new URLSearchParams(params)
    next.delete('q'); next.delete('category')
    setParams(next, { replace: true, preventScrollReset: true })
  }

  return (
    <Page className="fq-page">
      <header className="fq-header">
        <div>
          <h1>基本面量化</h1>
          <p className="fq-lead">把选股想法写成规则，再用证据检验。</p>
          <p>从《投资策略实战分析》出发，积累因子、策略与验证方法。量化研究一类公司的共同特征，林奇式研究继续追问每家公司为什么赚钱。</p>
        </div>
        <aside className="fq-status" aria-label="模块当前进度">
          <BookOpen size={22} aria-hidden="true" />
          <strong>方法库 · 第一版</strong>
          <p>已建立方法导读与研究规则。<br />尚未接入真实筛选与回测。</p>
          <small>内容更新：{UPDATED_AT}</small>
        </aside>
      </header>

      <nav className="fq-nav" aria-label="基本面量化页内导航">
        <a href="#fq-methods">方法与书籍</a><a href="#fq-factors">因子手册</a><a href="#fq-strategies">策略规则</a><a href="#fq-lynch">衔接公司研究</a><a href="#fq-validation">验证路径</a>
      </nav>

      <section id="fq-methods" className="fq-section" aria-labelledby="fq-methods-title">
        <h2 id="fq-methods-title">从书籍到研究方法</h2>
        <p className="fq-intro">先把方法变成可核对的定义，再决定是否应用。以下导读依据公开书目、简介、目录及机构研究整理，正文尚未逐章核对；项目规则与原书结论分别标注。</p>
        <div className="fq-books">
          {BOOKS.map((book, index) => <details key={book.id} className="fq-book" open={index === 0 ? true : undefined}>
            <summary><span><small>{book.role}</small><strong>{book.title}</strong><span>{book.author}</span></span></summary>
            <div className="fq-details-body">
              <p className="fq-original">{book.original}</p>
              <dl><div><dt>研究方向</dt><dd>{book.idea}</dd></div><div><dt>本站如何采用</dt><dd>{book.adoption}</dd></div><div><dt>核实范围</dt><dd>{book.limit}</dd></div></dl>
              <Evidence provenance={book.provenance} sources={book.sources} />
            </div>
          </details>)}
        </div>
        <h3 className="fq-subheading">首批五个方法要点</h3>
        <div className="fq-methods">{METHODS.map(method => <article key={method.title}>
          <h4>{method.title}</h4><p>{method.idea}</p><p className="fq-action">{method.action}</p>
          <Evidence provenance={method.provenance} sources={method.sources} />
        </article>)}</div>
      </section>

      <section id="fq-factors" className="fq-section" aria-labelledby="fq-factors-title">
        <div className="fq-section-head"><div><h2 id="fq-factors-title">因子手册</h2><p>每项都说明公式、字段、时间口径与失效情形。指标命中只是研究线索。</p></div><span className="fq-label">{FACTORS.length} 项研究定义</span></div>
        <p className="fq-note">统一口径：财务数据从实际公告时点起可用；报告期不等于可得日。TTM 使用已披露单季数据，累计报表须先转换为单季；价格、市值、币种与股本须对齐。缺失不补零，异常分母单列。</p>
        <div className="fq-filter">
          <label className="fq-search"><span>搜索因子</span><span className="fq-search-input"><Search size={17} aria-hidden="true" /><input type="search" value={query} onChange={event => updateFilter('q', event.target.value)} placeholder="名称、公式或关键词，如 EP、应计" /></span></label>
          <fieldset className="fq-categories"><legend>因子类别</legend><div>{CATEGORIES.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => updateFilter('category', item)}>{item}</button>)}</div></fieldset>
        </div>
        <div className="fq-filter-result"><p role="status">显示 {factors.length} / {FACTORS.length} 项{category !== '全部' ? ` · ${category}` : ''}</p>{(query || category !== '全部') && <button className="fq-button" type="button" onClick={reset}>清空筛选</button>}</div>
        {factors.length ? <div className="fq-factors">{factors.map(factor => <details key={factor.id} className="fq-factor">
          <summary><span><strong>{factor.name}</strong><small>{factor.alias}</small></span><span className="fq-factor-category">{factor.category}</span></summary>
          <div className="fq-details-body"><p>{factor.meaning}</p><p className="fq-formula">{factor.formula}</p>
            <dl><div><dt>所需字段</dt><dd>{factor.fields}</dd></div><div><dt>观察方向</dt><dd>{factor.direction}</dd></div><div><dt>可得时间</dt><dd>{factor.timing}</dd></div><div><dt>适用范围</dt><dd>{factor.scope}</dd></div><div><dt>口径与陷阱</dt><dd>{factor.pitfall}</dd></div></dl>
            <Evidence provenance={factor.provenance} sources={factor.sources} />
          </div>
        </details>)}</div> : <div className="fq-empty"><h3>没有匹配的因子</h3><p>试试更短的关键词，或清空类别和搜索条件。</p><button type="button" className="fq-button" onClick={reset}>显示全部因子</button></div>}
      </section>

      <section id="fq-strategies" className="fq-section" aria-labelledby="fq-strategies-title">
        <h2 id="fq-strategies-title">把方法写成策略规则</h2>
        <p className="fq-intro">两张策略研究卡，一张单因子实验卡。分位、过滤与调仓都是待检验起点，当前没有历史收益或真实选股名单。</p>
        <details className="fq-common"><summary>三张卡共用的股票池与成交约束</summary><div className="fq-details-body">
          <p>研究范围：沪深主板、创业板、科创板的非金融普通股；北交所、金融股另立模型。按历史当时状态排除风险警示、退市整理及上市不足 252 个交易日的证券，保留排除日志与退市历史。</p>
          <p>流动性研究起点：近 60 个交易日日均成交额不低于同板块中位数，停牌日按零成交计；数据不足则单列。阈值和规模偏向必须做扰动及对照。</p>
          <p>信号用可得财报与收盘信息，随后交易日尝试成交。开盘遇停牌或按保守规则不可成交的涨跌停，连续最多尝试 5 个交易日；未完成的新建仓资金保留现金，未退出持仓继续计值并记录。以同一执行规则比较各卡。</p>
          <p>上述执行政策属于待验证假设。交易单位、价格限制、税费及其他交易规则须按板块和历史当期核实；未完成核验前只做规则研究。基准应包含现金与无法成交的影响。</p>
          <p>共同事件规则：已持有证券触发风险警示或退市整理，在信息公开后的下一交易日开始尝试退出；采用相同不可成交判定，未完成的退出继续逐日尝试并保留估值记录，直至成交或按实际退市处置结算。财报更正从公开日起更新，不倒改旧信号。</p>
        </div></details>
        <div className="fq-strategies">{STRATEGIES.map(strategy => <details key={strategy.id} className="fq-strategy">
          <summary><span><small>{strategy.kind}</small><strong>{strategy.name}</strong></span><span className="fq-label">{strategy.status}</span></summary>
          <div className="fq-details-body"><p className="fq-question">{strategy.question}</p><dl>
            <div><dt>信号与排序</dt><dd>{strategy.signal}</dd></div><div><dt>组合假设</dt><dd>{strategy.portfolio}</dd></div><div><dt>调仓时点</dt><dd>{strategy.rebalance}</dd></div><div><dt>退出规则</dt><dd>{strategy.exit}</dd></div><div><dt>对照实验</dt><dd>{strategy.control}</dd></div><div><dt>可能失效</dt><dd>{strategy.failure}</dd></div>
          </dl><p className="fq-note">纯规则组合单独记账。人工复核、择时或剔除公司的结果另记，不回填本策略绩效。</p><Evidence provenance={strategy.provenance} sources={strategy.sources} /></div>
        </details>)}</div>
        <p className="fq-note">后续对照：先完成综合价值基线，再检验增加 12−1 价格动量是否改善结果，以 6−1 作为参数变体，同时记录成本与换手。当前三张卡均未加入该信号。</p>
      </section>

      <section id="fq-lynch" className="fq-section" aria-labelledby="fq-lynch-title">
        <h2 id="fq-lynch-title">与林奇式公司研究衔接</h2>
        <p className="fq-intro">量化特征帮助组织研究，公司分类帮助解释读数。价值或质量规则会偏向某些类型，未命中不等于公司差。</p>
        <dl className="fq-lynch">{LYNCH_FIT.map(([name, description]) => <div key={name}><dt>{name}</dt><dd>{description}</dd></div>)}</dl>
        <Evidence provenance="adaptation" sources={['project']} />
        <aside className="fq-bridge"><h3>从一项信号回到一家公司</h3><p>先确定林奇类型，再找主导变量：便宜是否来自周期高点？现金是否可持续？并购或一次性损益解释了多少变化？哪个事件会推翻判断？</p><div className="fq-links"><Link to="/research-notes">公司研究 <ArrowUpRight size={15} aria-hidden="true" /></Link><Link to="/invest/comprehensive-valuation">综合估值 <ArrowUpRight size={15} aria-hidden="true" /></Link><Link to="/candidates">我的候选池 <ArrowUpRight size={15} aria-hidden="true" /></Link></div></aside>
      </section>

      <section id="fq-validation" className="fq-section" aria-labelledby="fq-validation-title">
        <h2 id="fq-validation-title">A 股验证路径</h2>
        <ol className="fq-roadmap"><li><strong>当前：建立方法</strong><span>公式、规则、来源与边界。</span></li><li><strong>接着：核对数据</strong><span>正文核对、历史时点与覆盖审计。</span></li><li><strong>然后：分层验证</strong><span>单因子、组合、成本与样本外。</span></li><li><strong>最后：模拟跟踪</strong><span>冻结规则，持续记录偏差和失效。</span></li></ol>
        <fieldset className="fq-checklist"><legend>开始验证前，逐项检查准备情况</legend><p>这份清单只记录本次自查，勾选不会改变策略的“{RESEARCH_STATUS}”状态，刷新后重置。</p><p role="status">本次自查：{checked.length} / {VALIDATION_CHECKS.length} 项</p>{VALIDATION_CHECKS.map(check => <label key={check}><input type="checkbox" checked={checked.includes(check)} onChange={event => setChecked(previous => event.target.checked ? [...previous, check] : previous.filter(item => item !== check))} /><span>{check}</span></label>)}</fieldset>
        <p className="fq-note">验证后再按证据标记“稳健 / 有条件 / 脆弱 / 不支持”。缺少样本外或关键历史数据时降低结论强度，失败结果同样归档。</p>
      </section>

      <footer className="fq-sources" aria-labelledby="fq-sources-title"><h2 id="fq-sources-title">来源与核实范围</h2><p>“方法导读”说明可核材料的研究方向；“项目改编”是本站统一的研究定义；“待验证假设”尚无本地实证。机构公开研究与原书正文分别对待。</p><ul>{Object.entries(SOURCES).map(([id, source]) => <li id={`fq-source-${id}`} key={id}>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span className="visually-hidden">（新窗口打开）</span></a> : <strong>{source.title}</strong>}<p>{source.scope}</p></li>)}</ul><p>本页仅供研究与学习参考，不构成个人投资建议。当前为方法库，尚未完成原书逐章核对、A 股策略验证或自动选股。</p></footer>
    </Page>
  )
}
