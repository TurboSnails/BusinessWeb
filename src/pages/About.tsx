import React from 'react'
import { Link } from 'react-router-dom'
import ChapterComments from '../components/ChapterComments'
import RecentUpdates from '../components/RecentUpdates'
import { ExternalLink, AlertCircle } from 'lucide-react'
import { QUOTES } from '../data/quotes'
import { Callout, Page } from '../components/ui'

export default function About(): JSX.Element {
  return (
    <Page className="about-page">
      {/* 站点介绍 */}
      <section className="ui-card about-intro">
        <h1 className="about-title">关于「Live」</h1>
        <p className="about-lead">这是《正念投资》作者的个人站：一个普通程序员关于钱、技术与自由生活的长期实验。</p>
        <h2 className="about-subhead">三个栏目</h2>
        <ul className="about-list">
          <li><Link to="/invest" className="about-link">投资</Link>：书稿全文与 PDF、方法与框架、估值与网格工具、公司与产业研究</li>
          <li><Link to="/ai" className="about-link">AI实验室</Link>：用技术放大创造力，第一个作品从《正念投资》长出来</li>
          <li><Link to="/life" className="about-link">自由空间</Link>：记录从积累本金到自由生活的过程</li>
        </ul>
        <h2 className="about-subhead">方法论</h2>
        <p className="about-lead">
          详见<Link to="/first-book/slow-is-fast" className="about-link">《正念投资》</Link>：以彼得·林奇的分类选股为主，借鉴巴菲特的能力圈与安全边际，重视买入价格的性价比，用规则代替盯盘。
        </p>
        <Callout tone="danger" icon={<AlertCircle size={18} />} className="about-gap">
          内容仅为个人研究记录，不构成投资建议；过往业绩不代表未来表现。
        </Callout>
        <a href="https://cuchiscastagne277-crypto.github.io/website" target="_blank" rel="noopener noreferrer" className="tool-btn about-ext">
          <ExternalLink size={16} aria-hidden="true" />
          Train 的网页
        </a>
      </section>

      <RecentUpdates />

      <section className="about-quotes quotes" aria-labelledby="about-quotes-title">
        <h2 id="about-quotes-title">投资大师名句</h2>
        <div className="about-quotes__grid">
          {QUOTES.map(q => (
            <blockquote key={q.author} className="about-quote">
              <p>{q.text}</p>
              <footer>—— {q.author}</footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section id="about-comments" className="about-comments">
        <ChapterComments slug="关于.md" title="留言" />
      </section>
    </Page>
  )
}
