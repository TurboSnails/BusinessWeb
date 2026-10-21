import React from 'react'
import { Link } from 'react-router-dom'
import { ListChecks } from 'lucide-react'
import PageHero from '../components/PageHero'
import { Page } from '../components/ui'
import EtfTechCell from '../components/EtfTechCell'
import { ETF_TECHNICAL_FILE, useEtfTechnical } from '../data/etfTechnical'
import { OtherEtfList, BondFundList, OTHER_ETFS, BOND_FUNDS } from './EtfOtherList'
import '../styles/etf-notes.css'
import BroadEtfList from './BroadEtfList'
import EtfDocumentRemark from './EtfDocumentRemark'
import { latestEtfNote } from '../utils/etfJudgment'
import { BROAD_ETFS } from '../data/broadEtf'
import { INDUSTRY_GROUPS, TOTAL_ETF_COUNT, internalNoteSlug, type EtfItem } from '../data/industryEtf'

// 该 ETF 自己的研究笔记：笔记 slug 以「代码-」开头（如 159928-consumer-etf-analysis）。
const etfNoteOf = (item: EtfItem) => latestEtfNote(item.code)

function Reference({ item }: { item: EtfItem }): JSX.Element {
  const own = etfNoteOf(item)
  if (!item.referenceUrl) {
    return own ? (
      <Link to={`/notes/${own.slug}`} className="etf-ref-link" title={own.title}>
        {own.title}
      </Link>
    ) : (
      <span className="etf-empty-cell">—</span>
    )
  }
  const slug = internalNoteSlug(item.referenceUrl)
  const label = item.referenceTitle || '参考'
  if (slug) {
    return (
      <Link to={`/notes/${slug}`} className="etf-ref-link" title={label}>
        {label}
      </Link>
    )
  }
  return (
    <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" className="etf-ref-link">
      {label} ↗
    </a>
  )
}

function NoteCells({ item }: { item: EtfItem }): JSX.Element {
  // 有研究笔记就点代码/名称直接跳转；优先该 ETF 自己的分析笔记，其次是清单里登记的站内参考。
  const slug = etfNoteOf(item)?.slug ?? internalNoteSlug(item.referenceUrl)
  if (!slug) {
    return (
      <>
        <td className="etf-code-cell">{item.code}</td>
        <td className="etf-name-cell">{item.name}</td>
      </>
    )
  }
  const to = `/notes/${slug}`
  return (
    <>
      <td className="etf-code-cell">
        <Link to={to} className="etf-code-link" title="查看分析笔记">
          {item.code}
        </Link>
      </td>
      <td className="etf-name-cell">
        <Link to={to} className="etf-name-link" title="查看分析笔记">
          {item.name}
        </Link>
      </td>
    </>
  )
}

// 网格入口：跳到本站网格计算器并带上代码与名称。
const gridDetailHref = (item: EtfItem) => `/grid-trading?code=${item.code}&name=${encodeURIComponent(item.name)}`

function splitSubTheme(subTheme: string): string[] {
  if (subTheme.includes('%')) {
    const list = subTheme.split(/(?<=%)[、\s]*/).map(s => s.trim()).filter(Boolean)
    if (list.length > 0) return list
  }
  return subTheme.includes('、') ? subTheme.split('、').map(s => s.trim()).filter(Boolean) : [subTheme]
}

function SubThemeCell({ subTheme }: { subTheme: string }): JSX.Element {
  const items = splitSubTheme(subTheme)
  if (items.length <= 1) {
    return (
      <td className="etf-subtheme-cell">
        <span className="subtheme-tag">{subTheme}</span>
      </td>
    )
  }
  return (
    <td className="etf-subtheme-cell">
      <div className="subtheme-list">
        {items.map((text, idx) => (
          <span key={idx} className="subtheme-tag subtheme-tag--block">
            {text}
          </span>
        ))}
      </div>
    </td>
  )
}

export default function IndustryEtf(): JSX.Element {
  const tech = useEtfTechnical()
  const asOf = [...tech.values()][0]?.day.asOf
  return (
    <Page className="industry-etf-page">
      <PageHero
        icon={<ListChecks size={22} />}
        title="ETF 与债券基金清单"
        subtitle={`${BROAD_ETFS.length} 类宽基；${OTHER_ETFS.length} 只策略、商品与货币 ETF；${BOND_FUNDS.length} 只债券基金（场外）；${INDUSTRY_GROUPS.length} 个行业组，共 ${TOTAL_ETF_COUNT} 只行业 ETF。宽基、因子与主题的流派说明请看「ETF 流派地图」。${asOf ? `技术面按 ${asOf} 收盘（场外基金按实际披露净值日）计算。` : ''}`}
      />
      <p className="industry-etf-disclaimer" role="note">本页为公开资料整理与个人研究记录，不构成投资建议；ETF 价格会波动，决策请自行判断并承担风险。</p>
      <div>
        <nav className="industry-etf-nav" aria-label="行业目录">
          <div className="industry-etf-nav__group">
            <span className="industry-etf-nav__group-label">一级分类：</span>
            <a href="#broad-etf" className="industry-etf-nav__pill industry-etf-nav__pill--primary"><span>宽基 ETF</span><span className="industry-etf-nav__count">{BROAD_ETFS.length}</span></a>
            <a href="#other-etf" className="industry-etf-nav__pill industry-etf-nav__pill--primary"><span>策略/商品/货币 ETF</span><span className="industry-etf-nav__count">{OTHER_ETFS.length}</span></a>
            <a href="#bond-fund" className="industry-etf-nav__pill industry-etf-nav__pill--primary"><span>债券基金（场外）</span><span className="industry-etf-nav__count">{BOND_FUNDS.length}</span></a>
            <a href="#industry-etf" className="industry-etf-nav__pill industry-etf-nav__pill--primary"><span>行业 ETF</span><span className="industry-etf-nav__count">{TOTAL_ETF_COUNT}</span></a>
          </div>
          <div className="industry-etf-nav__subgroup" aria-label="行业 ETF 二级分类">
            <span className="industry-etf-nav__group-label">行业 ETF 二级分类：</span>
            {INDUSTRY_GROUPS.map(g => (
              <a key={g.id} href={`#${g.id}`} className="industry-etf-nav__pill">
                <span>{g.name}</span>
                <span className="industry-etf-nav__count">{g.items.length}</span>
              </a>
            ))}
          </div>
        </nav>
      </div>

      <BroadEtfList tech={tech} />
      <OtherEtfList tech={tech} />
      <BondFundList tech={tech} />

      <section id="industry-etf" className="industry-etf-main-section" aria-labelledby="industry-etf-main-title">
        <div className="industry-etf-main-header">
          <h2 id="industry-etf-main-title" className="industry-etf-main-title">
            行业 ETF
          </h2>
          <span className="industry-etf-main-count">{INDUSTRY_GROUPS.length} 个二级行业组 · 共 {TOTAL_ETF_COUNT} 只 ETF</span>
        </div>

        {INDUSTRY_GROUPS.map(group => (
          <section key={group.id} id={group.id} className="industry-group-section" aria-labelledby={`${group.id}-title`}>
            <div className="industry-group-card">
              <div className="industry-group-header">
                <h3 id={`${group.id}-title`} className="industry-group-title">
                  {group.name}
                </h3>
                <span className="industry-group-count">{group.items.length} 只 ETF</span>
              </div>
            <div className="industry-table-wrapper" role="region" aria-label={`${group.name} ETF 表格`} tabIndex={0}>
              <table className="report-table industry-etf-table">
                <colgroup>
                  <col /><col /><col /><col /><col /><col /><col />
                </colgroup>
                <thead>
                  <tr>
                    <th>代码</th>
                    <th>名称</th>
                    <th>行业分布</th>
                    <th>技术面</th>
                    <th>备注</th>
                    <th>参考</th>
                    <th>网格</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(item => (
                    <tr key={`${item.code}-${item.name}`}>
                      <NoteCells item={item} />
                      <SubThemeCell subTheme={item.subTheme} />
                      <td className="etf-tech-cell"><EtfTechCell rec={tech.get(item.code)} /></td>
                      <td className="etf-remark-cell"><EtfDocumentRemark code={item.code} /></td>
                      <td className="etf-ref-cell">
                        <Reference item={item} />
                      </td>
                      <td className="etf-grid-cell">
                        <Link to={gridDetailHref(item)} className="etf-ref-link" title="打开网格交易计算器并带入该 ETF">
                          行情·网格
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
      </section>

      <section id="etf-method" className="industry-group-section" aria-labelledby="etf-method-title">
        <div className="industry-group-card etf-method">
          <h2 id="etf-method-title" className="industry-group-title">指标依据</h2>
          <ul>
            <li><strong>均线</strong>：收盘价 &gt; MA5 &gt; MA10 &gt; MA20 为多头，反之为空头，其余为震荡；K 线不足 20 根不判断。</li>
            <li><strong>MACD</strong>：DIF = EMA12 − EMA26，DEA = EMA9(DIF)，柱 = 2 × (DIF − DEA)；DIF 在 DEA 之上为偏多，之下为偏空。</li>
            <li><strong>RSI</strong>：Wilder 14 周期；≥70 超买，≤30 超卖。债基净值走势平滑，RSI 常年偏高，参考价值有限。</li>
            <li><strong>周线、月线</strong>：由日线聚合，周线按周五收盘完成，月线本月未结束时随行情变化，悬停标签可看是否已完成。</li>
            <li><strong>数据来源</strong>：ETF 为腾讯行情前复权日线（无复权数据时用不复权）；场外债基为天天基金披露净值，按实际披露日计算，不用估算净值。</li>
          </ul>
          <p className="etf-other-note">技术指标只描述价格走势，不判断估值高低，也不构成投资建议。<a href={`${import.meta.env.BASE_URL}data/${ETF_TECHNICAL_FILE}`} target="_blank" rel="noopener noreferrer">查看行情复算数据 ↗</a></p>
        </div>
      </section>
    </Page>
  )
}
