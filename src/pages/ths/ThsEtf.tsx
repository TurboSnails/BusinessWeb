// 同花顺 · ETF资金（/ths-mood/etf）：占位，由对应任务实现
import React from 'react'
import { EmptyState, Page } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import ThsTabs, { THS_DISCLAIMER } from '../../features/ths-tabs/ThsTabs'
import '../../styles/market-mood.css'

export default function ThsEtf(): JSX.Element {
  return (
    <Page className="mm-page">
      <PageTitle>同花顺 · ETF资金</PageTitle>
      <ThsTabs />
      <p className="mm-disclaimer">{THS_DISCLAIMER}</p>
      <EmptyState title="ETF资金建设中">数据接入后在这里显示。</EmptyState>
    </Page>
  )
}
