import React from 'react'
import { Link } from 'react-router-dom'
import ChapterComments from '../components/ChapterComments'
import { ExternalLink, AlertCircle } from 'lucide-react'

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  padding: '20px',
  borderRadius: 'var(--radius-lg)',
  marginBottom: '24px',
  border: '1px solid var(--border-subtle)',
}

export default function About(): JSX.Element {
  return (
    <main className="container" style={{ maxWidth: '1100px' }}>
      {/* 站点介绍 */}
      <section style={cardStyle}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--text-primary)' }}>
          关于「Live」
        </h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 20px' }}>
          这是《正念投资》作者的个人站：一个普通程序员关于钱、技术与自由生活的长期实验。
        </p>
        <h3 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 8px' }}>三个栏目</h3>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 20, margin: '0 0 20px' }}>
          <li><Link to="/invest" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>投资</Link>：书稿全文与 PDF、方法与框架、估值与网格工具、公司与产业研究</li>
          <li><Link to="/ai" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>AI实验室</Link>：用技术放大创造力，第一个作品从《正念投资》长出来</li>
          <li><Link to="/life" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>自由空间</Link>：记录从积累本金到自由生活的过程</li>
        </ul>
        <h3 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 8px' }}>方法论</h3>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 20px' }}>
          详见<Link to="/first-book/slow-is-fast" style={{ color: 'var(--system-blue)', textDecoration: 'none', fontWeight: 500 }}>《正念投资》</Link>：以彼得·林奇的分类选股为主，借鉴巴菲特的能力圈与安全边际，重视买入价格的性价比，用规则代替盯盘。
        </p>
        <div
          style={{
            background: 'color-mix(in srgb, var(--system-red) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--system-red) 20%, transparent)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            color: 'var(--system-red)',
            fontSize: '0.9rem',
            lineHeight: 1.6,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>内容仅为个人研究记录，不构成投资建议；过往业绩不代表未来表现。</span>
        </div>
        <a
          href="https://cuchiscastagne277-crypto.github.io/website"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '0.9rem',
            padding: '8px 16px',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <ExternalLink size={16} />
          <span style={{ fontWeight: 500 }}>Train 的网页</span>
        </a>
      </section>

      <section style={{ marginTop: '32px' }}>
        <ChapterComments slug="关于.md" title="留言" />
      </section>
    </main>
  )
}
