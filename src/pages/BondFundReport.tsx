import React from 'react'
import { Page } from '../components/ui'
import reportHtml from '../content/bond-fund-recommendation.html?raw'
import '../styles/bond-fund-report.css'

// 这份报告是随项目保存的静态原文；只提取 body，使其在站点导航内展示。
const reportBody = reportHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? ''

export default function BondFundReport(): JSX.Element {
  return (
    <Page className="bond-report-page">
      <p className="bond-report-notice" role="note">
        原始报告存档（2026-10-14）。文中的基金数据和结论来自用户提供的文件，页面未逐条复核；原文未附可直接核对的来源链接。请在决策前查看基金公司最新公告和基金合同。
      </p>
      <article className="bond-report" aria-label="债基推荐报告原文" dangerouslySetInnerHTML={{ __html: reportBody }} />
    </Page>
  )
}
