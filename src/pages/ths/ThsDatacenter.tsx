// 同花顺 · 数据中心（/ths-mood/datacenter）：占位，由对应任务实现
import React from 'react'
import { EmptyState, Page } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import ThsTabs, { THS_DISCLAIMER } from '../../features/ths-tabs/ThsTabs'
import '../../styles/market-mood.css'

export default function ThsDatacenter(): JSX.Element {
  return (
    <Page className="mm-page">
      <PageTitle>同花顺 · 数据中心</PageTitle>
      <ThsTabs />
      <p className="mm-disclaimer">{THS_DISCLAIMER}</p>
      <EmptyState title="数据中心建设中">数据接入后在这里显示。</EmptyState>
    </Page>
  )
}
