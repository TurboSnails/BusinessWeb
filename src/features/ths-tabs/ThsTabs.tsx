import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageTabs } from '../../components/ui/PageTabs'

// 「三方平台 · 同花顺」的一级页签：对照同花顺 App 的几个数据区，每个页签一个子路由、各自一份数据文件
export const THS_TABS = [
  { id: '/ths-mood', label: '市场情绪' },
  { id: '/ths-mood/market', label: '市场' },
  { id: '/ths-mood/cbond', label: '可转债' },
  { id: '/ths-mood/datacenter', label: '数据中心' },
  { id: '/ths-mood/hk', label: '港股通与AH' },
  { id: '/ths-mood/etf', label: 'ETF资金' },
] as const
export type ThsTab = (typeof THS_TABS)[number]['id']

export default function ThsTabs(): JSX.Element {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const value = (THS_TABS.find(t => t.id !== '/ths-mood' && pathname.startsWith(t.id))?.id ?? '/ths-mood') as ThsTab
  return <PageTabs label="同花顺页签" items={THS_TABS.map(t => ({ ...t }))} value={value} onChange={id => navigate(id)} />
}

/** 子页面通用的免责说明 */
export const THS_DISCLAIMER = '功能参照同花顺 App，数据来自公开行情、收盘后更新，与同花顺官方无关。'
