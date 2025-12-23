import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

export default function Header(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const showBack = location.pathname !== '/'

  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            aria-label="返回"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              marginRight: 12,
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            ←
          </button>
        )}
        <h1 className="title">Study01 — 响应式 React 应用 (TS)</h1>
      </div>

      <nav className="nav">
        <Link to="/" style={{ color: 'rgba(255,255,255,0.95)', marginLeft: 12, textDecoration: 'none' }}>首页</Link>
        <Link to="/about" style={{ color: 'rgba(255,255,255,0.95)', marginLeft: 12, textDecoration: 'none' }}>关于</Link>
      </nav>
    </header>
  )
}
