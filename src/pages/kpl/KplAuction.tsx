// 开盘啦 · 竞价尾盘（/market-mood/auction）：占位，由对应任务实现
import React from 'react'
import { EmptyState, Page } from '../../components/ui'
import { PageTitle } from '../../components/ui/PageTabs'
import KplTabs, { KPL_DISCLAIMER } from '../../features/market-mood/KplTabs'
import '../../styles/market-mood.css'

export default function KplAuction(): JSX.Element {
  return (
    <Page className="mm-page">
      <PageTitle>开盘啦 · 竞价尾盘</PageTitle>
      <KplTabs />
      <p className="mm-disclaimer">{KPL_DISCLAIMER}</p>
      <EmptyState title="竞价尾盘建设中">数据接入后在这里显示。</EmptyState>
    </Page>
  )
}
