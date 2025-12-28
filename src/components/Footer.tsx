import React from 'react'

declare const __BUILD_TIME__: string
declare const __VERSION__: string

export default function Footer(): JSX.Element {
  return (
    <footer className="footer">
      © Hassan投资 v1.0.0
      <span style={{ marginLeft: '12px', fontSize: '0.75rem', color: '#9ca3af' }}>
        {__BUILD_TIME__}
      </span>
    </footer>
  )
}
