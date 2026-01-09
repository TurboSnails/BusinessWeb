import React from 'react'

// 共享的表格样式
export const tableWrapperStyle: React.CSSProperties = {
  overflowX: 'auto',
  marginTop: '24px',
  WebkitOverflowScrolling: 'touch',
  borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  border: '1px solid #e5e7eb'
}

export const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  marginTop: '0',
  fontSize: '0.9rem',
  background: 'white',
  borderRadius: '12px',
  overflow: 'hidden'
}

export const thStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  color: '#fff',
  padding: '16px 12px',
  textAlign: 'left',
  fontWeight: '600',
  fontSize: '0.9rem',
  border: 'none',
  position: 'sticky',
  top: 0,
  zIndex: 10,
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  whiteSpace: 'nowrap'
}

export const tdStyle: React.CSSProperties = {
  padding: '14px 12px',
  border: 'none',
  borderBottom: '1px solid #f0f0f0',
  textAlign: 'left',
  background: 'white',
  transition: 'all 0.2s ease'
}

export const trHoverStyle: React.CSSProperties = {
  background: '#f8f9fa',
  cursor: 'pointer',
  transform: 'scale(1.01)'
}

export const highlightStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
  fontWeight: '600',
  color: '#92400e',
  borderRadius: '6px',
  padding: '4px 8px',
  display: 'inline-block'
}

export const contentStyle: React.CSSProperties = {
  background: 'white',
  padding: '32px',
  borderRadius: '16px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  lineHeight: '1.8'
}

// 表格行样式（带 hover 效果）
export const getTrStyle = (isEven: boolean): React.CSSProperties => ({
  background: isEven ? '#fafafa' : 'white',
  transition: 'all 0.2s ease'
})

export const getTrHoverStyle = (): React.CSSProperties => ({
  background: '#f0f4ff',
  transform: 'scale(1.002)',
  boxShadow: '0 2px 8px rgba(102, 126, 234, 0.1)'
})
