import React from 'react'

interface CardProps {
  children: React.ReactNode
  title?: string
  icon?: string
  borderColor?: string
  bgColor?: string
  titleColor?: string
  style?: React.CSSProperties
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  title, 
  icon,
  borderColor = 'var(--border-subtle)',
  bgColor = 'white',
  titleColor = 'var(--text-primary)',
  style 
}) => {
  return (
    <div style={{ 
      background: bgColor, 
      border: `2px solid ${borderColor}`, 
      borderRadius: '12px', 
      padding: '24px',
      ...style 
    }}>
      {title && (
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: '700', 
          marginBottom: '20px', 
          color: titleColor, 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px' 
        }}>
          {icon && <span style={{ fontSize: '2rem' }}>{icon}</span>}
          {title}
        </h2>
      )}
      {children}
    </div>
  )
}

interface InfoBoxProps {
  children: React.ReactNode
  bgColor?: string
  borderColor?: string
  textColor?: string
  style?: React.CSSProperties
}

export const InfoBox: React.FC<InfoBoxProps> = ({ 
  children, 
  bgColor = 'var(--system-green-light)',
  borderColor = 'var(--system-green-light)',
  textColor = 'var(--down-ink)',
  style 
}) => {
  return (
    <div style={{ 
      background: bgColor, 
      border: `1px solid ${borderColor}`, 
      borderRadius: '8px', 
      padding: '16px',
      color: textColor,
      ...style 
    }}>
      {children}
    </div>
  )
}

