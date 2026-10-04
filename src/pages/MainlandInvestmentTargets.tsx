import React from 'react'
import AIDiffusion from '../components/AIDiffusion'

export default function MainlandInvestmentTargets(): JSX.Element {
  const containerStyle: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px 16px'
  }

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

      <AIDiffusion />
    </div>
  )
}
