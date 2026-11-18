// 今天几星 · 今日星级（/jixing）：占位，由对应任务实现
import React from 'react'
import { EmptyState, Page } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import JixingTabs, { JIXING_DISCLAIMER } from '../../features/jixing-tabs/JixingTabs'
import '../../styles/market-mood.css'

export default function JixingStar(): JSX.Element {
  return (
    <Page className="mm-page">
      <PageTitle>今天几星 · 今日星级</PageTitle>
      <JixingTabs />
      <p className="mm-disclaimer">{JIXING_DISCLAIMER}</p>
      <EmptyState title="今日星级建设中">数据接入后在这里显示。</EmptyState>
    </Page>
  )
}
