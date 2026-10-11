import React from 'react'
import { PageTitle } from '../components/ui/PageTabs'
import AIDiffusion from '../components/AIDiffusion'
import { Page } from '../components/ui'

export default function MainlandInvestmentTargets(): JSX.Element {
  return (
    <Page>
      <PageTitle>A 股观察池</PageTitle>

      <AIDiffusion />
    </Page>
  )
}
