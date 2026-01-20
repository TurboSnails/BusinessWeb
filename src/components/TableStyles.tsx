import React from 'react'

// 共享的表格样式
export const tableWrapperStyle: React.CSSProperties = {
  overflowX: 'auto',
  marginTop: '24px',
  WebkitOverflowScrolling: 'touch',
  borderRadius: '16px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.05)',
  background: 'white'
}

export const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  marginTop: '0',
  fontSize: '0.9rem',
  background: 'transparent',
  overflow: 'hidden'
}

export const thStyle: React.CSSProperties = {
  background: 'var(--system-gray6)',
  color: 'var(--text-secondary)',
  padding: '16px 20px',
  textAlign: 'left',
  fontWeight: '600',
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid rgba(0,0,0,0.05)',
  position: 'sticky',
  top: 0,
  zIndex: 10,
  whiteSpace: 'nowrap'
}

export const tdStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid rgba(0,0,0,0.05)',
  textAlign: 'left',
  color: 'var(--text-primary)',
  background: 'transparent',
  transition: 'background 0.2s ease',
  verticalAlign: 'middle'
}

export const trHoverStyle: React.CSSProperties = {
  cursor: 'default'
}

export const highlightStyle: React.CSSProperties = {
  background: 'rgba(255, 149, 0, 0.1)', // System Orange low opacity
  fontWeight: '600',
  color: 'var(--system-orange)',
  borderRadius: '6px',
  padding: '4px 8px',
  display: 'inline-block'
}

export const contentStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  padding: '32px',
  borderRadius: '24px',
  boxShadow: '0 2px 20px rgba(0,0,0,0.02)',
  lineHeight: '1.6',
  border: '1px solid rgba(0,0,0,0.04)'
}

// Helper to get row style
export const getTrStyle = (isEven: boolean): React.CSSProperties => ({
  background: isEven ? 'rgba(0,0,0,0.01)' : 'transparent',
  transition: 'all 0.2s ease'
})

// Using a class for hover would be better, but if inline is needed:
export const getTrHoverStyle = (): React.CSSProperties => ({
  background: 'var(--system-gray6)', // subtle highlight
})
