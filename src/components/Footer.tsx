import React from 'react'

declare const __BUILD_TIME__: string

export default function Footer(): JSX.Element {
  return (
    <footer style={{
      padding: '32px 20px',
      textAlign: 'center',
      color: 'var(--text-secondary)',
      fontSize: '0.85rem',
      borderTop: '1px solid rgba(0,0,0,0.05)',
      marginTop: '40px',
      background: 'var(--bg-primary)'
    }}>
      <div style={{ marginBottom: '8px', fontWeight: 500, color: 'var(--text-primary)' }}>
        © Hassan投资 v1.0.0
      </div>
      <div style={{ opacity: 0.7 }}>
        Build Time: {typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toLocaleDateString()}
      </div>
    </footer>
  )
}
