import React, { useState } from 'react'
import { Link } from 'react-router-dom'

export default function Home(): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)

  const cardStyle: React.CSSProperties = {
    background: 'white',
    padding: '24px',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
    marginBottom: '20px',
    transition: 'all 0.3s ease',
    border: '1px solid rgba(0,0,0,0.05)'
  }

  const linkCardStyle: React.CSSProperties = {
    ...cardStyle,
    cursor: 'pointer',
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
    position: 'relative',
    overflow: 'hidden'
  }

  const linkCardHoverStyle: React.CSSProperties = {
    transform: 'translateY(-4px)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)'
  }

  const menuItems = [
    {
      to: '/investment-targets',
      icon: '📈',
      title: '美股投资',
      description: '长期看好的公司',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#667eea'
    },
    {
      to: '/mainland-investment-targets',
      icon: '🇨🇳',
      title: '大陆投资',
      description: '2026AI投资组合',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      color: '#f59e0b'
    },
    {
      to: '/pulse',
      icon: '📊',
      title: '经济脉搏',
      description: '每日经济分析(机构+游资)',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      color: '#f5576c'
    },
    {
      to: '/monitor',
      icon: '📈',
      title: '每日监控',
      description: '投资总纲、宏观假设、指标体系、阶段划分、日常之行',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      color: '#4facfe'
    },
    {
      to: '/limit-up-analysis',
      icon: '🚀',
      title: '每日板块涨停',
      description: '实时追踪A股涨停板，按概念分类展示',
      gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      color: '#fa709a'
    },
    {
      to: '/sector-rotation',
      icon: '🔄',
      title: '板块轮动',
      description: '追踪各板块在不同日期的涨幅排名，识别市场热点轮动',
      gradient: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)',
      color: '#ff6b6b'
    },
    {
      to: '/trading-philosophy',
      icon: '⚔️',
      title: '短线的道与术',
      description: '股票投资的"道与术"终极归总，完整的投资哲学与实战方案',
      gradient: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
      color: '#7c3aed'
    },
    {
      to: '/investment-plan-2026',
      icon: '📅',
      title: '2026年美股投资计划',
      description: '基于经济衰退预警的系统性风险管理方案',
      gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      color: '#43e97b'
    }
  ]

  return (
    <main className="container" style={{ padding: '20px 16px', maxWidth: '900px', margin: '0 auto' }}>
      {/* 段永平思想精髓 */}
      <section style={cardStyle}>
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            padding: '8px 0',
            userSelect: 'none'
          }}
        >
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            margin: 0,
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            <span style={{ fontSize: '2rem', WebkitTextFillColor: 'initial' }}>💡</span>
            段永平30年思想精髓
          </h2>
          <span style={{
            fontSize: '1.5rem',
            color: '#9ca3af',
            transition: 'transform 0.3s ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'inline-block'
          }}>
            ▼
          </span>
        </div>
        {isExpanded && (
          <div style={{
            marginTop: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            animation: 'fadeIn 0.3s ease-in'
          }}>
            {[
              { 
                title: '以"本分"为核心', 
                content: '主张诚信为本、不做过分事',
                gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                icon: '🎯'
              },
              { 
                title: '"足够最小发展速度"理念', 
                content: '企业经营如开车不必飙150码',
                gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                icon: '🚗'
              },
              { 
                title: '焦点法则', 
                content: '强调做对的事、把事做对',
                gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                icon: '🎯'
              },
              { 
                title: '消费者导向 > 赚钱导向', 
                content: '',
                gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                icon: '👥'
              },
              { 
                title: '人生哲学', 
                content: '应做喜欢且擅长的事，保持松弛心态，不与他人比较',
                gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                icon: '🌟'
              }
            ].map((item, index) => (
              <div
                key={index}
                style={{
                  padding: '20px',
                  background: item.gradient,
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  color: 'white',
                  transition: 'transform 0.2s ease',
                  cursor: 'default'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ 
                  fontSize: '1.5rem', 
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>{item.icon}</span>
                  <strong style={{ fontSize: '1rem', fontWeight: '600' }}>{item.title}</strong>
                </div>
                {item.content && (
                  <div style={{ 
                    fontSize: '0.9rem', 
                    lineHeight: '1.6',
                    opacity: 0.95,
                    marginTop: '8px'
                  }}>
                    {item.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 功能菜单卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '20px',
        marginTop: '8px'
      }}>
        {menuItems.map((item, index) => (
          <Link
            key={index}
            to={item.to}
            style={linkCardStyle}
            onMouseEnter={(e) => {
              Object.assign(e.currentTarget.style, linkCardHoverStyle)
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = cardStyle.boxShadow as string
            }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: item.gradient,
              borderRadius: '16px 16px 0 0'
            }} />
            <div style={{ paddingTop: '8px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '12px'
              }}>
                <span style={{
                  fontSize: '2rem',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: item.gradient,
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}>
                  {item.icon}
                </span>
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: '700',
                  margin: 0,
                  color: '#1f2937',
                  lineHeight: '1.3'
                }}>
                  {item.title}
                </h2>
              </div>
              <p style={{
                fontSize: '0.95rem',
                color: '#6b7280',
                margin: 0,
                lineHeight: '1.6'
              }}>
                {item.description}
              </p>
              <div style={{
                marginTop: '16px',
                display: 'flex',
                alignItems: 'center',
                color: item.color,
                fontSize: '0.9rem',
                fontWeight: '600'
              }}>
                查看详情
                <span style={{ marginLeft: '8px', transition: 'transform 0.2s' }}>
                  →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* 好友链接 */}
      <div style={{
        marginTop: '40px',
        padding: '20px',
        textAlign: 'center',
        borderTop: '1px solid #e5e7eb'
      }}>
        <a
          href="https://cuchiscastagne277-crypto.github.io/website"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: '#6b7280',
            textDecoration: 'none',
            fontSize: '0.9rem',
            transition: 'color 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#3b82f6'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#6b7280'
          }}
        >
          <span>🔗</span>
          <span>Train的网页</span>
        </a>
      </div>
    </main>
  )
}
