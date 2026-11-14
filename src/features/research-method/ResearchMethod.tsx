import React from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { TableWrap } from '../../components/ui'
import RatingReview from '../signals/RatingReview'
import { researchStandard } from '../../data/notionNotes'
import { investmentMethod as M, BOOK, bookHref, type BookKey, type Lane } from '../../data/investmentMethod'

// 「研究方法」页签：林奇两主线（价值回归 + 快速增长）+ 巴菲特边界，选读三类，最后是所有类型通用的纪律与方法验证。
// 主体内容见 data/investmentMethod.ts（摘自书第15、18—24章）；通用纪律仍读 researchStandard。

function Table({ heads, rows, label }: { heads: string[]; rows: React.ReactNode[][]; label?: string }): JSX.Element {
  return (
    <TableWrap label={label ?? heads.join(' / ')}>
      <table className="ui-table rn-table">
        <thead><tr>{heads.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </TableWrap>
  )
}

const Check = ({ children, warn = false, accent }: { children: React.ReactNode; warn?: boolean; accent: string }): JSX.Element => (
  <div className="rn-check">
    {warn ? <AlertTriangle size={16} color={accent} aria-hidden="true" /> : <CheckCircle2 size={16} color={accent} aria-hidden="true" />}
    <span>{children}</span>
  </div>
)

const Step = ({ n, children }: { n: number; children: React.ReactNode }): JSX.Element => (
  <div className="rn-step">
    <span className="rn-step__num" aria-hidden="true">{n}</span>
    <div className="rn-step__body">{children}</div>
  </div>
)

const BookLinks = ({ keys }: { keys: BookKey[] }): JSX.Element => (
  <span className="rn-small rn-small--inline">
    读书：{keys.map((k, i) => <React.Fragment key={k}>{i > 0 && '、'}<Link to={bookHref(BOOK[k].file)} className="rn-link">{BOOK[k].label}</Link></React.Fragment>)}
  </span>
)

const Section = ({ id, children }: { id: string; children: React.ReactNode }): JSX.Element => (
  <p id={id} className="rn-eyebrow rn-eyebrow--gap">{children}</p>
)

function LaneCard({ lane }: { lane: Lane }): JSX.Element {
  return (
    <section className="ui-card rn-card rn-card--good" aria-label={`主线：${lane.name}`}>
      <h3 className="rn-card-title">
        <span className="ui-badge ui-badge--accent rn-badge-inline">{lane.role}</span> {lane.name}
      </h3>
      <p className="rn-lead">{lane.oneLiner}</p>
      <p className="rn-text">对应林奇类型：{lane.lynchTypes}</p>
      <h4 className="rn-card-title rn-card-title--sub">研究清单</h4>
      {lane.research.map((r, i) => (
        <Step key={r.title} n={i + 1}><strong className="rn-strong">{r.title}</strong><div>{r.text}</div></Step>
      ))}
      <h4 className="rn-card-title rn-card-title--sub">买卖纪律（19.4）</h4>
      <Table heads={['买入看什么', '卖出看什么']} rows={lane.buy.map((b, i) => [b, lane.sell[i] ?? ''])} label={`${lane.name}买卖纪律`} />
      <Check warn accent="var(--system-orange)">{lane.trap}</Check>
      <BookLinks keys={lane.book} />
    </section>
  )
}

export default function ResearchMethod(): JSX.Element {
  const [value, growth] = M.lanes
  return (
    <div>
      <p className="rn-eyebrow">{M.eyebrow}</p>

      {/* 1. 总纲 */}
      <section className="ui-card rn-card rn-card--lead" aria-label="总纲">
        <h3 className="rn-card-title">总纲：两主一辅</h3>
        <blockquote className="rn-quote">{M.oneLiner}</blockquote>
        <Table heads={['方法', '适用对象', '要证明什么']} rows={M.overview.map(r => [
          <span><span className={`ui-badge ${r[0] === '选读' ? 'ui-badge--muted' : r[0] === '辅助层' ? 'ui-badge--neutral' : 'ui-badge--accent'}`}>{r[0]}</span><br /><strong className="rn-strong">{r[1]}</strong><br /><span className="rn-small rn-small--inline">{r[4]}</span></span>,
          r[2],
          r[3],
        ])} label="两主一辅一览" />
        <p className="rn-text">{M.personal} <BookLinks keys={['ch18', 'ch19']} /></p>
        <p className="rn-footnote">{M.bookNote}</p>
        <nav className="ui-link-chips" aria-label="研究方法目录">
          <a href="#m-classify">先分类</a>
          <a href="#m-value">价值回归</a>
          <a href="#m-growth">快速增长</a>
          <a href="#m-buffett">巴菲特边界</a>
          <a href="#m-aside">选读</a>
          <a href="#m-common">通用纪律</a>
          <a href="#m-verify">方法验证</a>
        </nav>
      </section>

      <div className="ui-card rn-card">
        <h3 className="rn-card-title">筛选工具</h3>
        <p className="rn-text">
          <Link to="/radar" className="rn-link">机会雷达</Link> 按「价值回归」「快速增长」两条主线初筛候选；
          <Link to="/research-notes?tab=companies&v=lynch" className="rn-link">公司库 · 林奇分类</Link> 查看全部公司的类型、同类关注度与护城河财务证据。两者都只是线索，进入研究后按下面的清单逐项核对。
        </p>
      </div>

      {/* 2. 先分类 */}
      <Section id="m-classify">第一步 · 先分类</Section>
      <section className="ui-card rn-card" aria-label="先分类">
        <h3 className="rn-card-title">林奇六类 → 主线还是选读</h3>
        <p className="rn-text">{M.classify.lead}</p>
        <Table heads={['林奇类型', '研究重点', '本站处理']} rows={M.classify.rows.map(r => [<strong className="rn-strong">{r[0]}</strong>, r[1], <span className={`ui-badge ${r[3] === 'main' ? 'ui-badge--accent' : 'ui-badge--muted'}`}>{r[2]}</span>])} label="林奇六类与本站主线" />
        <p className="rn-footnote">{M.classify.caveat}</p>
        <h4 className="rn-card-title rn-card-title--sub">站内林奇分类怎样支持这一步</h4>
        {M.classify.siteRules.map(t => <Check key={t} accent="var(--system-blue)">{t}</Check>)}
        <p className="rn-text"><Link to="/research-notes?tab=companies&v=lynch" className="rn-link">打开公司库 · 林奇分类</Link> <BookLinks keys={['ch19']} /></p>
      </section>

      {/* 3–4. 两条主线 */}
      <Section id="m-value">主线一 · 价值回归</Section>
      <LaneCard lane={value} />
      <Section id="m-growth">主线二 · 快速增长</Section>
      <LaneCard lane={growth} />

      {/* 5. 巴菲特 */}
      <Section id="m-buffett">辅助层 · 巴菲特：能力圈、护城河、安全边际</Section>
      <section className="ui-card rn-card" aria-label="巴菲特辅助层">
        <h3 className="rn-card-title">巴菲特定边界</h3>
        <p className="rn-text">{M.buffett.lead}</p>
        <h4 className="rn-card-title rn-card-title--sub">能力圈：三句话检验</h4>
        {M.buffett.circle.map((t, i) => <Step key={t} n={i + 1}>{t}</Step>)}
        <h4 className="rn-card-title rn-card-title--sub">护城河：站内六项财务检验</h4>
        <Table heads={['检验', '通过条件']} rows={M.buffett.moatChecks.map(r => [<strong className="rn-strong">{r[0]}</strong>, r[1]])} label="护城河六项财务检验" />
        <p className="rn-footnote">{M.buffett.moatNote}</p>
        <h4 className="rn-card-title rn-card-title--sub">安全边际与长期持有</h4>
        {M.buffett.margin.map(t => <Check key={t} accent="var(--system-green)">{t}</Check>)}
        <h4 className="rn-card-title rn-card-title--sub">怎样叠加到两条主线</h4>
        <Table heads={['主线', '质量过滤（买前）', '长期持有（买后）']} rows={M.buffett.overlay.map(r => [<strong className="rn-strong">{r[0]}</strong>, r[1], r[2]])} label="巴菲特层叠加到两条主线" />
        <p className="rn-text">{M.buffett.combine}</p>
        <BookLinks keys={['ch23', 'ch24', 'ch15']} />
      </section>

      {/* 6. 选读 */}
      <Section id="m-aside">选读 · 困境反转、周期、资产</Section>
      <div className="ui-grid ui-grid--3">
        {M.asides.map(a => (
          <section key={a.name} className="ui-card rn-card" aria-label={`选读：${a.name}`}>
            <h3 className="rn-card-title"><span className="ui-badge ui-badge--muted rn-badge-inline">选读</span> {a.name}</h3>
            <p className="rn-text">{a.why}</p>
            <Check warn accent="var(--system-orange)"><strong className="rn-strong">关键检验：</strong>{a.test}</Check>
            <BookLinks keys={a.book} />
          </section>
        ))}
      </div>

      {/* 7. 通用 */}
      <Section id="m-common">所有类型通用</Section>
      <div className="ui-card rn-card">
        <h3 className="rn-card-title">数据与口径纪律</h3>
        {researchStandard.dataRules.map(t => <Check key={t} accent="var(--system-green)">{t}</Check>)}
        <h4 className="rn-card-title rn-card-title--sub">口径</h4>
        <Table heads={['项目', '要求']} rows={researchStandard.caliber} />
        <h4 className="rn-card-title rn-card-title--sub">常见数据陷阱</h4>
        <Table heads={['陷阱', '典型表现', '做法']} rows={researchStandard.traps} />
        <h4 className="rn-card-title rn-card-title--sub">各市场财报节奏与看点</h4>
        <Table heads={['市场', '披露节奏', '口径与看点']} rows={researchStandard.calendar} />
      </div>

      <div className="ui-card rn-card">
        <h3 className="rn-card-title">对抗检验</h3>
        {researchStandard.adversarial.map(t => <Check key={t} warn accent="var(--system-orange)">{t}</Check>)}
        <details className="rn-details">
          <summary className="rn-summary">估值工具细则（点开查看）</summary>
          {researchStandard.valuation.map(t => <Check key={t} accent="var(--system-blue)">{t}</Check>)}
        </details>
      </div>

      <div className="ui-card rn-card">
        <h3 className="rn-card-title">最终返回标准</h3>
        <p className="rn-text">每家公司成稿用统一股票分析 Skill（stock-analysis）按下表输出；对话里用「简版 + 三行结论」（评级、盈亏比、最大风险）。</p>
        <details className="rn-details">
          <summary className="rn-summary">模块 0–14 与深度分级（点开查看）</summary>
          <Table heads={['#', '模块', '必含内容', '最低要求']} rows={researchStandard.finalReport} />
          <Table heads={['形式', '包含', '什么时候用']} rows={researchStandard.depth} />
        </details>
        <div className="rn-gap">
          <span className="rn-inline-label">行动分类</span>
          {researchStandard.action.map(a => <span key={a} className="ui-badge ui-badge--muted">{a}</span>)}
        </div>
      </div>

      <div className="ui-card rn-card rn-card--warn">
        <h3 className="rn-card-title">仓位与风控</h3>
        {researchStandard.position.map(t => <Check key={t} warn accent="var(--system-red)">{t}</Check>)}
        <h4 className="rn-card-title rn-card-title--sub">红线</h4>
        {researchStandard.redlines.map(t => <Check key={t} warn accent="var(--system-red)">{t}</Check>)}
      </div>

      {/* 8. 方法验证 */}
      <Section id="m-verify">方法验证</Section>
      <div className="ui-card rn-card">
        <h3 className="rn-card-title">规则有没有用：用数据复盘</h3>
        <p className="rn-text">
          下面的评级复盘按周快照统计各评级之后的超额收益；大盘层面的规则另见
          <Link to="/monitor?tab=market-cycle" className="rn-link">牛熊周期规则回测</Link>。样本积累前，结论只作参考。
        </p>
      </div>
      <RatingReview />
      <details className="ui-card rn-card rn-details">
        <summary className="rn-summary">程序化研究页的规则（补全批，点开查看）</summary>
        <p className="rn-text">为补齐标普500 与沪深500 成分股，脚本对每家公司按同一套规则取数并计算；定性部分只做简述。它用于筛选与排序，不含公司特有催化与风险，不等同于逐家深度研究。</p>
        <Table heads={['项目', '规则']} rows={PROGRAM_RULES} />
      </details>
    </div>
  )
}

const PROGRAM_RULES: [string, string][] = [
  ['数据源', '美股：东方财富单季财务 + 新浪日线；A 股：同花顺财务摘要（累计口径还原为单季）+ 新浪日线 + 中证/巨潮行业分类。成分股：标普500 公开名单（2026-09-30）、中证500 成分。'],
  ['TTM 口径', '美股：最近四个单季稀释 EPS 之和（GAAP）；A 股：TTM 归母净利 ÷ 最新隐含股本（规避送转前后 EPS 新旧口径混用）。'],
  ['拆股/除权', '美股按隐含股本的持续阶跃与价格跳变折算；A 股按财报发布后的价格跳变（≥1.28 倍）折算。页面会标出折算记录，需核实。'],
  ['一次性项归一化', '最近四季中若有 1 个季度净利率明显偏离其余三季的紧密区间，用其余三季中位净利率替换；金融、地产不做。归一化前后 EPS 均列出。'],
  ['基准情景', 'EPS = 归一化 TTM ×(1+g)，g = 最新季营收同比 ×0.7，限 −5%~+20%；倍数 = 现倍数与板块中位的中点，但不高于现倍数 1.25 倍，限 7–40。'],
  ['悲观 / 乐观', '悲观：EPS ×(1−h)，h 为 15%（防御）/20%（一般）/25–30%（周期），倍数 = min(现倍数, 0.6×板块中位)，下限 5。乐观：EPS ×(1+2g+8%)，倍数 = 1.15×基准。'],
  ['买入区', '由 (Base−P)/(P−Bear)=2 反推 P=(Base+2Bear)/3，取 ±5%。'],
  ['评级', '盈亏比 ≥2 优先关注；1–2 条件关注；其余观察；TTM 亏损回避。封顶为观察的情形：数据不稳定（营收同比波动 >40–50%、股本变动 >25%、EPS 符号翻转）、悲观价 ≥ 现价；金融股最高条件关注；非金融负债率 >80% 最高条件关注。'],
  ['不做的事', 'REIT 不做 EPS 情景（需 FFO）；亏损公司不做 EPS 情景；未取到的一律标 [MISSING]。'],
  ['已知局限', '规则对高 PE 公司偏严（悲观倍数压到板块中位的 60%），对低 PE 公司偏宽；一次性项识别可能漏判或误判；FCF、分部占比、一致预期、下跌原因均未取到。盈亏比只比较情景价差：没有计入各情景发生的概率，也没有计入兑现需要的时间（同样 2:1，三年兑现和一年兑现的年化回报差很多），分红也未计入。'],
]
