import React from 'react'
import { PageTitle } from '../components/ui/PageTabs'
import AIDiffusion from '../components/AIDiffusion'

export default function MainlandInvestmentTargets(): JSX.Element {
  const containerStyle: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px 16px'
  }

  return (
    <div style={containerStyle}>
      <PageTitle>A 股观察池</PageTitle>

      <AIDiffusion />
    </div>
  )
}
