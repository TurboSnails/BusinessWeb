import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageTabs } from '../../components/ui/PageTabs'

// 「三方平台 · 今天几星」的一级页签：对照微信小程序「今天几星」（银行螺丝钉）的几个主要页面，每个页签一个子路由、各自一份数据文件
export const JIXING_TABS = [
  { id: '/jixing', label: '今日星级' },
  { id: '/jixing/table', label: 'A股估值表' },
  { id: '/jixing/global', label: '港股全球' },
  { id: '/jixing/signals', label: '牛熊信号板' },
] as const
export type JixingTab = (typeof JIXING_TABS)[number]['id']

export default function JixingTabs(): JSX.Element {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const value = (JIXING_TABS.find(t => t.id !== '/jixing' && pathname.startsWith(t.id))?.id ?? '/jixing') as JixingTab
  return <PageTabs label="今天几星页签" items={JIXING_TABS.map(t => ({ ...t }))} value={value} onChange={id => navigate(id)} />
}

/** 子页面通用的免责说明 */
export const JIXING_DISCLAIMER = '功能参照微信小程序「今天几星」（银行螺丝钉），数据来自公开行情、收盘后更新；星级与估值状态由本站按页面写明的方法自行计算，与银行螺丝钉官方无关，不构成投资建议。'
