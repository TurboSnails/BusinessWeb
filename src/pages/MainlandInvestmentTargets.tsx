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
      <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', marginBottom: '24px' }}>
        大陆投资
      </h1>

      <AIDiffusion />
    </div>
  )
}
