import React from 'react'

declare const __BUILD_TIME__: string
declare const __VERSION__: string

export default function Footer(): JSX.Element {
  return (
    <footer className="footer">
      © 2025 Study01 
      <span style={{ marginLeft: '12px', fontSize: '0.75rem', color: '#9ca3af' }}>
        v{__VERSION__} · {__BUILD_TIME__}
      </span>
    </footer>
  )
}
