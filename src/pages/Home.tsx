import React, { useState } from 'react'
import { Link } from 'react-router-dom'

export default function Home(): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <main className="container">
      {/* 段永平思想精髓 - 警醒 */}
      <section style={{
        background: 'linear-gradient(135deg, #fff9e6 0%, #fff4d6 100%)',
        border: 'none',
        borderRadius: '16px',
        padding: isExpanded ? '32px 24px' : '20px 24px',
        marginBottom: '24px',
        boxShadow: '0 8px 24px rgba(245, 158, 11, 0.15), 0 2px 8px rgba(245, 158, 11, 0.1)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'padding 0.3s ease'
      }}>
        {/* 装饰性背景元素 */}
        <div style={{
          position: 'absolute',
          top: '-50px',
          right: '-50px',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.1) 0%, transparent 70%)',
          borderRadius: '50%'
        }} />
        
        {/* 标题区域 - 可点击 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: isExpanded ? '24px' : '0',
            paddingBottom: isExpanded ? '20px' : '0',
            borderBottom: isExpanded ? '2px solid rgba(245, 158, 11, 0.3)' : 'none',
            position: 'relative',
            zIndex: 1,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flex: 1
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
              fontSize: '24px'
            }}>
              💡
            </div>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              color: '#78350f',
              margin: 0,
              letterSpacing: '0.5px'
            }}>
              段永平30年思想精髓
            </h2>
          </div>
          <div style={{
            fontSize: '1.2rem',
            color: '#92400e',
            transition: 'transform 0.3s ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }}>
            ▼
          </div>
        </button>

        {/* 内容区域 - 可折叠 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          position: 'relative',
          zIndex: 1,
          maxHeight: isExpanded ? '2000px' : '0',
          overflow: 'hidden',
          opacity: isExpanded ? 1 : 0,
          transition: 'max-height 0.4s ease, opacity 0.3s ease'
        }}>
          <div style={{
            padding: '18px 20px',
            background: 'rgba(255, 255, 255, 0.85)',
            borderRadius: '12px',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            transition: 'all 0.3s ease',
            cursor: 'default'
          }}>
            <div style={{
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#92400e',
              marginBottom: '6px',
              letterSpacing: '0.3px'
            }}>
              以"本分"为核心
            </div>
            <div style={{
              fontSize: '0.95rem',
              color: '#78350f',
              lineHeight: '1.7'
            }}>
              主张诚信为本、不做过分事
            </div>
          </div>

          <div style={{
            padding: '18px 20px',
            background: 'rgba(255, 255, 255, 0.85)',
            borderRadius: '12px',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            transition: 'all 0.3s ease',
            cursor: 'default'
          }}>
            <div style={{
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#92400e',
              marginBottom: '6px',
              letterSpacing: '0.3px'
            }}>
              "足够最小发展速度"理念
            </div>
            <div style={{
              fontSize: '0.95rem',
              color: '#78350f',
              lineHeight: '1.7'
            }}>
              企业经营如开车不必飙150码
            </div>
          </div>

          <div style={{
            padding: '18px 20px',
            background: 'rgba(255, 255, 255, 0.85)',
            borderRadius: '12px',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            transition: 'all 0.3s ease',
            cursor: 'default'
          }}>
            <div style={{
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#92400e',
              marginBottom: '6px',
              letterSpacing: '0.3px'
            }}>
              焦点法则
            </div>
            <div style={{
              fontSize: '0.95rem',
              color: '#78350f',
              lineHeight: '1.7'
            }}>
              强调做对的事、把事做对
            </div>
          </div>

          <div style={{
            padding: '18px 20px',
            background: 'rgba(255, 255, 255, 0.85)',
            borderRadius: '12px',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            transition: 'all 0.3s ease',
            cursor: 'default'
          }}>
            <div style={{
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#92400e',
              marginBottom: '6px',
              letterSpacing: '0.3px'
            }}>
              消费者导向 &gt; 赚钱导向
            </div>
          </div>

          <div style={{
            padding: '18px 20px',
            background: 'rgba(255, 255, 255, 0.85)',
            borderRadius: '12px',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            transition: 'all 0.3s ease',
            cursor: 'default'
          }}>
            <div style={{
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#92400e',
              marginBottom: '6px',
              letterSpacing: '0.3px'
            }}>
              人生哲学
            </div>
            <div style={{
              fontSize: '0.95rem',
              color: '#78350f',
              lineHeight: '1.7'
            }}>
              应做喜欢且擅长的事，保持松弛心态，不与他人比较
            </div>
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
