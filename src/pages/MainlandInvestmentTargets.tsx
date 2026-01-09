import React, { useState } from 'react'
import Investment2026AI from '../components/Investment2026AI'
import AIDiffusion from '../components/AIDiffusion'

export default function MainlandInvestmentTargets(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'2026AI' | 'AIDiffusion'>('2026AI')

  const containerStyle: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px 16px'
  }

  const tabStyle: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '12px'
  }

  const tabButtonStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    background: isActive ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
    color: isActive ? '#fff' : '#6b7280',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: isActive ? '600' : '500',
    transition: 'all 0.2s ease'
  })

  return (
    <div style={containerStyle}>
      <h1 style={{
        fontSize: '2rem',
        fontWeight: '700',
        marginBottom: '24px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text'
      }}>
        大陆投资
      </h1>

      <div style={tabStyle}>
        <button
          style={tabButtonStyle(activeTab === '2026AI')}
          onClick={() => setActiveTab('2026AI')}
        >
          2026AI
        </button>
        <button
          style={tabButtonStyle(activeTab === 'AIDiffusion')}
          onClick={() => setActiveTab('AIDiffusion')}
        >
          AI扩散
        </button>
      </div>

      {activeTab === '2026AI' && <Investment2026AI />}
      {activeTab === 'AIDiffusion' && <AIDiffusion />}
    </div>
  )
}
