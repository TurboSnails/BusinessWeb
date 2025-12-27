import React from 'react'
import { Link } from 'react-router-dom'

export default function Home(): JSX.Element {
  return (
    <main className="container">
      {/* 段永平思想精髓 - 警醒 */}
      <section style={{
        background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
        border: '2px solid #f59e0b',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '16px',
        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)'
      }}>
        <h2 style={{
          fontSize: '1.3rem',
          fontWeight: '700',
          marginBottom: '16px',
          color: '#92400e',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: '2px solid #f59e0b',
          paddingBottom: '12px'
        }}>
          <span style={{ fontSize: '1.8rem' }}>💡</span>
          段永平30年思想精髓
        </h2>
        <div style={{
          fontSize: '0.95rem',
          lineHeight: '1.8',
          color: '#78350f'
        }}>
          <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px' }}>
            <strong style={{ color: '#92400e' }}>以"本分"为核心：</strong>主张诚信为本、不做过分事
          </div>
          <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px' }}>
            <strong style={{ color: '#92400e' }}>"足够最小发展速度"理念：</strong>企业经营如开车不必飙150码
          </div>
          <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px' }}>
            <strong style={{ color: '#92400e' }}>焦点法则：</strong>强调做对的事、把事做对
          </div>
          <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px' }}>
            <strong style={{ color: '#92400e' }}>消费者导向 &gt; 赚钱导向</strong>
          </div>
          <div style={{ marginBottom: '0', padding: '12px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px' }}>
            <strong style={{ color: '#92400e' }}>人生哲学：</strong>应做喜欢且擅长的事，保持松弛心态，不与他人比较
          </div>
        </div>
      </section>

      <section className="card">
        <Link to="/investment-targets" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <h2>📈 长期看好的公司</h2>
          <p>投资标的列表</p>
        </Link>
      </section>

      <section className="card">
        <Link to="/pulse" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <h2>📊 经济脉搏</h2>
          <p>每日经济分析(机构+游资)</p>
        </Link>
      </section>

      <section className="card">
        <Link to="/investment-plan-2026" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <h2>📅 2026年美股投资计划</h2>
          <p>基于经济衰退预警的系统性风险管理方案</p>
        </Link>
      </section>

      <section className="card">
        <h2>跨设备支持</h2>
        <p>这是一个移动优先的响应式布局，适应手机和平板与桌面屏幕。</p>
      </section>
    </main>
  )
}
