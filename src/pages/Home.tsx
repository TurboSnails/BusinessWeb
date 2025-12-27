import React, { useState } from 'react'
import { Link } from 'react-router-dom'

export default function Home(): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <main className="container">
      {/* 段永平思想精髓 */}
      <section className="card">
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            padding: '4px 0'
          }}
        >
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            margin: 0,
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '1.5rem' }}>💡</span>
            段永平30年思想精髓
          </h2>
          <span style={{
            fontSize: '1.2rem',
            color: '#6b7280',
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }}>
            ▼
          </span>
        </div>
        {isExpanded && (
          <div style={{
            marginTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            animation: 'fadeIn 0.3s ease-in'
          }}>
            <div style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
              borderRadius: '10px',
              borderLeft: '4px solid #0ea5e9',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.95rem', lineHeight: '1.7', color: '#0c4a6e' }}>
                <strong style={{ color: '#075985', fontSize: '1rem' }}>以"本分"为核心：</strong>
                <span style={{ marginLeft: '4px' }}>主张诚信为本、不做过分事</span>
              </div>
            </div>
            <div style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              borderRadius: '10px',
              borderLeft: '4px solid #10b981',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.95rem', lineHeight: '1.7', color: '#14532d' }}>
                <strong style={{ color: '#166534', fontSize: '1rem' }}>"足够最小发展速度"理念：</strong>
                <span style={{ marginLeft: '4px' }}>企业经营如开车不必飙150码</span>
              </div>
            </div>
            <div style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              borderRadius: '10px',
              borderLeft: '4px solid #f59e0b',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.95rem', lineHeight: '1.7', color: '#78350f' }}>
                <strong style={{ color: '#92400e', fontSize: '1rem' }}>焦点法则：</strong>
                <span style={{ marginLeft: '4px' }}>强调做对的事、把事做对</span>
              </div>
            </div>
            <div style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
              borderRadius: '10px',
              borderLeft: '4px solid #8b5cf6',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.95rem', lineHeight: '1.7', color: '#581c87' }}>
                <strong style={{ color: '#6b21a8', fontSize: '1rem' }}>消费者导向 &gt; 赚钱导向</strong>
              </div>
            </div>
            <div style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
              borderRadius: '10px',
              borderLeft: '4px solid #ef4444',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.95rem', lineHeight: '1.7', color: '#7f1d1d' }}>
                <strong style={{ color: '#991b1b', fontSize: '1rem' }}>人生哲学：</strong>
                <span style={{ marginLeft: '4px' }}>应做喜欢且擅长的事，保持松弛心态，不与他人比较</span>
              </div>
            </div>
          </div>
        )}
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
        <Link to="/monitor" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <h2>📈 每日监控</h2>
          <p>投资总纲、宏观假设、指标体系、阶段划分、日常之行</p>
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
