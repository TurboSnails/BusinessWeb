import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp,
  Globe,
  BarChart2,
  Activity,
  Rocket,
  RefreshCw,
  Shield,
  Calendar,
  Lightbulb,
  Target,
  Car,
  Zap,
  Users,
  Star,
  ChevronRight,
  ExternalLink,
  ChevronDown
} from 'lucide-react'

export default function Home(): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    backdropFilter: 'blur(30px)',
    WebkitBackdropFilter: 'blur(30px)',
    padding: '32px',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md)',
    marginBottom: '24px',
    transition: 'all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)',
    border: '1px solid rgba(255, 255, 255, 0.7)'
  }

  const linkCardStyle: React.CSSProperties = {
    ...cardStyle,
    cursor: 'pointer',
    textDecoration: 'none',
    color: 'var(--text-primary)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    height: '100%',
    padding: 0,
    marginBottom: 0
  }

  const menuItems = [
    {
      to: '/investment-targets',
      icon: TrendingUp,
      title: '美股投资',
      description: '长期看好的公司',
      gradient: 'linear-gradient(135deg, #007AFF 0%, #00C6FF 100%)',
      color: 'var(--system-blue)'
    },
    {
      to: '/mainland-investment-targets',
      icon: Globe,
      title: '大陆投资',
      description: '2026AI投资组合',
      gradient: 'linear-gradient(135deg, #FF9500 0%, #FFCC00 100%)',
      color: 'var(--system-orange)'
    },
    {
      to: '/pulse',
      icon: BarChart2,
      title: '经济脉搏',
      description: '每日经济分析(机构+游资)',
      gradient: 'linear-gradient(135deg, #FF2D55 0%, #FF375F 100%)',
      color: 'var(--system-pink)'
    },
    {
      to: '/monitor',
      icon: Activity,
      title: '每日监控',
      description: '投资总纲、宏观假设、指标体系',
      gradient: 'linear-gradient(135deg, #5AC8FA 0%, #007AFF 100%)',
      color: 'var(--system-teal)'
    },
    {
      to: '/limit-up-analysis',
      icon: Rocket,
      title: '每日板块涨停',
      description: '实时追踪A股涨停板',
      gradient: 'linear-gradient(135deg, #AF52DE 0%, #5856D6 100%)',
      color: 'var(--system-purple)'
    },
    {
      to: '/sector-rotation',
      icon: RefreshCw,
      title: '板块轮动',
      description: '追踪各板块在不同日期的涨幅排名',
      gradient: 'linear-gradient(135deg, #FF3B30 0%, #FF2D55 100%)',
      color: 'var(--system-red)'
    },
    {
      to: '/trading-philosophy',
      icon: Shield,
      title: '短线的道与术',
      description: '完整的投资哲学与实战方案',
      gradient: 'linear-gradient(135deg, #5856D6 0%, #AF52DE 100%)',
      color: 'var(--system-indigo)'
    },
    {
      to: '/investment-plan-2026',
      icon: Calendar,
      title: '2026年美股投资计划',
      description: '基于经济衰退预警的风险管理',
      gradient: 'linear-gradient(135deg, #34C759 0%, #30B0C7 100%)',
      color: 'var(--system-green)'
    }
  ]

  return (
    <main className="container animate-fade-in" style={{ maxWidth: '1100px' }}>

      {/* 段永平思想精髓 - Collapsible Card */}
      <section style={cardStyle}>
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            padding: '4px 0',
            userSelect: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'rgba(255, 149, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--system-orange)'
            }}>
              <Lightbulb size={32} />
            </div>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              margin: 0,
              color: 'var(--text-primary)'
            }}>
              段永平30年思想精髓
            </h2>
          </div>
          <div style={{
            color: 'var(--system-gray)',
            transition: 'all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            background: 'var(--system-gray6)',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <ChevronDown size={20} />
          </div>
        </div>

        {isExpanded && (
          <div style={{
            marginTop: '32px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
            animation: 'fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {[
              {
                title: '以"本分"为核心',
                content: '诚信为本，不错过分之事。',
                bg: 'rgba(0, 122, 255, 0.05)',
                color: 'var(--system-blue)',
                icon: Target
              },
              {
                title: '资产保障',
                content: '稳健经营，不追求盲目扩张。',
                bg: 'rgba(255, 45, 85, 0.05)',
                color: 'var(--system-pink)',
                icon: Shield
              },
              {
                title: '焦点法则',
                content: '做对的事，把事做对。',
                bg: 'rgba(52, 199, 89, 0.05)',
                color: 'var(--system-green)',
                icon: Zap
              },
              {
                title: '消费者导向',
                content: '从长远看，用户价值高于短期利润。',
                bg: 'rgba(88, 86, 214, 0.05)',
                color: 'var(--system-indigo)',
                icon: Users
              },
              {
                title: '平常心',
                content: '保持松弛，不与他人攀比。',
                bg: 'rgba(255, 149, 0, 0.05)',
                color: 'var(--system-orange)',
                icon: Star
              }
            ].map((item, index) => {
              const Icon = item.icon
              return (
                <div
                  key={index}
                  style={{
                    padding: '24px',
                    background: 'var(--bg-card)',
                    borderRadius: '20px',
                    color: 'var(--text-primary)',
                    transition: 'all 0.3s ease',
                    border: '1px solid rgba(0, 0, 0, 0.05)',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <div style={{
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    color: item.color
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: item.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon size={20} />
                    </div>
                    <strong style={{ fontSize: '1.05rem', fontWeight: '700' }}>{item.title}</strong>
                  </div>
                  <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                    {item.content}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Grid Menu */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '48px 0 24px' }}>
        <h3 style={{
          fontSize: '1.25rem',
          color: 'var(--text-primary)',
          fontWeight: '700',
          margin: 0
        }}>
          探索投资领域
        </h3>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {menuItems.length} 个功能模块
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '24px'
      }}>
        {menuItems.map((item, index) => {
          const Icon = item.icon
          return (
            <Link
              key={index}
              to={item.to}
              className="card"
              style={linkCardStyle}
            >
              {/* Top Gradient Stripe */}
              <div style={{ height: '6px', background: item.gradient }} />

              <div style={{ padding: '32px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-primary)',
                    borderRadius: '16px',
                    color: item.color,
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)'
                  }}>
                    <Icon size={28} strokeWidth={1.5} />
                  </div>
                  <h2 style={{
                    fontSize: '1.2rem',
                    fontWeight: '700',
                    margin: 0,
                    color: 'var(--text-primary)'
                  }}>
                    {item.title}
                  </h2>
                </div>

                <p style={{
                  fontSize: '1rem',
                  color: 'var(--text-secondary)',
                  margin: '0 0 24px 0',
                  lineHeight: '1.6',
                  flex: 1
                }}>
                  {item.description}
                </p>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: item.color,
                  fontSize: '0.95rem',
                  fontWeight: '700',
                  gap: '4px'
                }}>
                  立即探索 <ChevronRight size={18} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Footer Links */}
      <footer style={{
        marginTop: '80px',
        textAlign: 'center',
        padding: '40px 0',
        borderTop: '0.5px solid rgba(0,0,0,0.1)'
      }}>
        <a
          href="https://cuchiscastagne277-crypto.github.io/website"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '1rem',
            padding: '12px 24px',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(0,0,0,0.05)',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--system-blue)'
            e.currentTarget.style.background = '#fff'
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = 'var(--shadow-md)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.background = 'var(--bg-card)'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
          }}
        >
          <ExternalLink size={18} />
          <span style={{ fontWeight: '600' }}>Train的网页</span>
        </a>
      </footer>
    </main>
  )
}
