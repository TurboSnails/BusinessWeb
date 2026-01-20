import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Home,
  TrendingUp,
  Globe,
  BarChart2,
  Activity,
  Rocket,
  RefreshCw,
  Shield,
  Calendar,
  Info,
  Menu,
  X
} from 'lucide-react'

export default function Header(): JSX.Element {
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Handle scroll effect for glass header
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = [
    { path: '/', label: '首页', icon: Home },
    { path: '/investment-targets', label: '美股投资', icon: TrendingUp },
    { path: '/mainland-investment-targets', label: '大陆投资', icon: Globe },
    { path: '/pulse', label: '经济脉搏', icon: BarChart2 },
    { path: '/monitor', label: '每日监控', icon: Activity },
    { path: '/limit-up-analysis', label: '涨停分析', icon: Rocket },
    { path: '/sector-rotation', label: '板块轮动', icon: RefreshCw },
    { path: '/trading-philosophy', label: '道与术', icon: Shield },
    { path: '/investment-plan-2026', label: '投资计划', icon: Calendar },
    { path: '/about', label: '关于', icon: Info }
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
    <>
      <header
        className={`glass-panel ${scrolled ? 'scrolled' : ''}`}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          transition: 'all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)',
          padding: scrolled ? '8px 0' : '16px 0',
          background: scrolled ? 'var(--glass-bg)' : 'transparent',
          borderBottom: scrolled ? '0.5px solid rgba(0, 0, 0, 0.1)' : '0.5px solid transparent',
        }}
      >
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Logo / Home */}
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              textDecoration: 'none',
              color: scrolled ? 'var(--system-blue)' : 'var(--text-primary)',
              background: scrolled ? 'rgba(0, 122, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              transition: 'all 0.3s ease',
            }}
          >
            <Home size={20} />
          </Link>

          {/* Mobile Title */}
          <div className="page-title-mobile" style={{
            flex: 1,
            textAlign: 'center',
            fontWeight: 600,
            fontSize: '1rem',
            color: 'var(--text-primary)',
            opacity: isMobileMenuOpen ? 0 : 1,
            transition: 'opacity 0.2s'
          }}>
            {getCurrentPageTitle()}
          </div>

          {/* Desktop Nav */}
          <nav className="desktop-nav" style={{ gap: '2px' }}>
            {navItems.map((item) => {
              const active = isActive(item.path)
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  style={{
                    color: active ? '#fff' : 'var(--text-secondary)',
                    background: active ? 'var(--system-blue)' : 'transparent',
                    textDecoration: 'none',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'
                      e.currentTarget.style.color = 'var(--text-primary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }
                  }}
                >
                  <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="mobile-menu-btn"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '8px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              zIndex: 1100,
            }}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Dropdown */}
        <div
          className="mobile-nav"
          style={{
            display: isMobileMenuOpen ? 'block' : 'none',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(30px)',
            WebkitBackdropFilter: 'blur(30px)',
            padding: '80px 24px 24px',
            zIndex: 1050,
            animation: 'fadeIn 0.3s ease-out'
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {navItems.map((item) => {
              const active = isActive(item.path)
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '20px 12px',
                    borderRadius: '20px',
                    textDecoration: 'none',
                    color: active ? '#fff' : 'var(--text-primary)',
                    background: active ? 'var(--system-blue)' : 'rgba(255, 255, 255, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    boxShadow: active ? '0 8px 16px rgba(0, 122, 255, 0.3)' : 'var(--shadow-sm)',
                  }}
                >
                  <Icon size={24} strokeWidth={2} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </header>

      <style>{`
        @media (min-width: 1024px) {
          .desktop-nav { display: flex !important; }
          .mobile-menu-btn, .mobile-nav, .page-title-mobile { display: none !important; }
        }
        @media (max-width: 1023px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn, .page-title-mobile { display: flex !important; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(1.05); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  )
}
