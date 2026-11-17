import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageTabs } from '../../components/ui/PageTabs'

// 「三方平台 · 开盘啦」的一级页签：对照开盘啦 App 行情区的几个标签，每个标签一个子路由、各自一份数据文件
export const KPL_TABS = [
  { id: '/market-mood', label: '市场情绪' },
  { id: '/market-mood/daban', label: '打板' },
  { id: '/market-mood/lhb', label: '龙虎榜' },
  { id: '/market-mood/plates', label: '板块题材' },
  { id: '/market-mood/funds', label: '资金' },
  { id: '/market-mood/abnormal', label: '异动监管' },
  { id: '/market-mood/review', label: '复盘' },
  { id: '/market-mood/rank', label: '人气排行' },
  { id: '/market-mood/auction', label: '竞价尾盘' },
  { id: '/market-mood/disclosure', label: '财报避雷' },
  { id: '/market-mood/timeline', label: '时间线' },
  { id: '/market-mood/holders', label: '持仓两融' },
  { id: '/market-mood/irm', label: '互动问答' },
] as const
export type KplTab = (typeof KPL_TABS)[number]['id']

export default function KplTabs(): JSX.Element {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const value = (KPL_TABS.find(t => t.id !== '/market-mood' && pathname.startsWith(t.id))?.id ?? '/market-mood') as KplTab
  return <PageTabs label="开盘啦页签" items={KPL_TABS.map(t => ({ ...t }))} value={value} onChange={id => navigate(id)} />
}

/** 子页面通用的免责说明 */
export const KPL_DISCLAIMER = '功能参照开盘啦 App，数据来自公开行情、收盘后更新，与开盘啦官方无关。'
