import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

export default function Header(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const navItems = [
    { path: '/', label: '首页', icon: '🏠' },
    { path: '/investment-targets', label: '投资标的', icon: '📈' },
    { path: '/pulse', label: '经济脉搏', icon: '📊' },
    { path: '/monitor', label: '每日监控', icon: '📈' },
    { path: '/limit-up-analysis', label: '涨停分析', icon: '🚀' },
    { path: '/trading-philosophy', label: '道与术', icon: '⚔️' },
    { path: '/investment-plan-2026', label: '投资计划', icon: '📅' },
    { path: '/about', label: '关于', icon: 'ℹ️' }
  ]

  // 获取当前页面标题
  const getCurrentPageTitle = () => {
    const currentItem = navItems.find(item => {
      if (item.path === '/') {
        return location.pathname === '/'
      }
      return location.pathname.startsWith(item.path)
    })
    return currentItem ? currentItem.label : 'Hassan投资'
  }

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <header style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#fff',
      padding: '0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative'
      }}>
        {/* 首页图标 - 左侧 */}
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            textDecoration: 'none',
            color: 'white',
            transition: 'all 0.2s ease',
            borderRadius: '8px',
            background: location.pathname === '/' 
              ? 'rgba(255,255,255,0.15)' 
              : 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(8px)',
            border: location.pathname === '/' 
              ? '1px solid rgba(255,255,255,0.2)' 
              : '1px solid rgba(255,255,255,0.08)'
          }}
          onMouseEnter={(e) => { 
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
            e.currentTarget.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => { 
            e.currentTarget.style.background = location.pathname === '/' 
              ? 'rgba(255,255,255,0.15)' 
              : 'rgba(255,255,255,0.05)'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          <span style={{
            fontSize: '1.4rem',
            display: 'inline-block'
          }}>
            🏠
          </span>
        </Link>

        {/* 当前页面标题 - 居中显示（仅移动端） */}
        {location.pathname !== '/' && (
          <div className="page-title-mobile" style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 12px'
          }}>
            <div style={{
              fontSize: '0.9rem',
              fontWeight: '600',
              color: 'white',
              whiteSpace: 'nowrap',
              textAlign: 'center',
              letterSpacing: '0.2px'
            }}>
              {getCurrentPageTitle()}
            </div>
          </div>
        )}

        {/* Desktop Navigation */}
        <nav style={{
          display: 'none',
          alignItems: 'center',
          gap: '8px',
          flex: 1,
          justifyContent: 'center'
        }}
        className="desktop-nav"
        >
          {navItems.map((item) => {
            const active = isActive(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  color: active ? '#fff' : 'rgba(255,255,255,0.9)',
                  textDecoration: 'none',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: active ? '600' : '500',
                  background: active 
                    ? 'rgba(255,255,255,0.15)' 
                    : 'rgba(255,255,255,0.05)',
                  backdropFilter: 'blur(8px)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: active 
                    ? '1px solid rgba(255,255,255,0.2)' 
                    : '1px solid rgba(255,255,255,0.08)'
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.15)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                  }
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            background: isMobileMenuOpen 
              ? 'rgba(255,255,255,0.15)' 
              : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            padding: '8px',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.2s ease',
            width: '36px',
            height: '36px',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          className="mobile-menu-btn"
          aria-label="菜单"
          onMouseEnter={(e) => {
            if (!isMobileMenuOpen) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isMobileMenuOpen) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            }
          }}
        >
          <span style={{
            width: '24px',
            height: '2px',
            background: 'white',
            borderRadius: '2px',
            transition: 'all 0.3s',
            transform: isMobileMenuOpen ? 'rotate(45deg) translate(6px, 6px)' : 'none'
          }} />
          <span style={{
            width: '24px',
            height: '2px',
            background: 'white',
            borderRadius: '2px',
            transition: 'all 0.3s',
            opacity: isMobileMenuOpen ? 0 : 1
          }} />
          <span style={{
            width: '24px',
            height: '2px',
            background: 'white',
            borderRadius: '2px',
            transition: 'all 0.3s',
            transform: isMobileMenuOpen ? 'rotate(-45deg) translate(6px, -6px)' : 'none'
          }} />
        </button>
      </div>

      {/* Mobile Navigation Menu */}
      <div
        style={{
          display: isMobileMenuOpen ? 'block' : 'none',
          background: 'rgba(102, 126, 234, 0.98)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(255,255,255,0.2)',
          padding: '16px 20px',
          animation: isMobileMenuOpen ? 'slideDown 0.3s ease-out' : 'none'
        }}
        className="mobile-nav"
      >
        {navItems.map((item) => {
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setIsMobileMenuOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: active ? '#fff' : 'rgba(255,255,255,0.9)',
                textDecoration: 'none',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.95rem',
                fontWeight: active ? '600' : '500',
                background: active 
                  ? 'rgba(255,255,255,0.15)' 
                  : 'rgba(255,255,255,0.05)',
                marginBottom: '8px',
                transition: 'all 0.2s ease',
                border: active 
                  ? '1px solid rgba(255,255,255,0.2)' 
                  : '1px solid rgba(255,255,255,0.08)'
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>

      <style>{`
        @media (min-width: 768px) {
          .desktop-nav {
            display: flex !important;
          }
          .mobile-menu-btn {
            display: none !important;
          }
          .mobile-nav {
            display: none !important;
          }
          .page-title-mobile {
            display: none !important;
          }
        }
        @media (max-width: 767px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-menu-btn {
            display: flex !important;
          }
          .page-title-mobile {
            display: flex !important;
          }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </header>
  )
}
