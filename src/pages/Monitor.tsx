import React, { useState } from 'react'
import { OverviewTab } from '../components/monitor/OverviewTab'
import { IndicatorsTab } from '../components/monitor/IndicatorsTab'
import { TemperatureTab } from '../components/monitor/TemperatureTab'
import { ChinaTemperatureTab } from '../components/monitor/ChinaTemperatureTab'
import { StagesTab } from '../components/monitor/StagesTab'
import { ExecutionTab } from '../components/monitor/ExecutionTab'
import { USMonitorTab } from '../components/monitor/USMonitorTab'
import { ChinaStockTab } from '../components/monitor/ChinaStockTab'
import { PageTabs, PageTitle, type TabItem } from '../components/ui/PageTabs'

type SubTab = 'overview' | 'china-stock' | 'indicators' | 'temperature' | 'china-temperature' | 'stages' | 'execution' | 'us-monitor'

// 原来分三排（计划执行 / 决策策略 / 监控分析），合成一排，顺序保持分组
const TABS: TabItem<SubTab>[] = [
  { id: 'execution', label: '日常执行' },
  { id: 'stages', label: '阶段划分' },
  { id: 'us-monitor', label: '美经监控' },
  { id: 'overview', label: '投资总纲' },
  { id: 'china-stock', label: '中股投资' },
  { id: 'indicators', label: '指标体系' },
  { id: 'temperature', label: '美经温度' },
  { id: 'china-temperature', label: '中经温度' },
]

export default function Monitor(): JSX.Element {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('execution')

  return (
    <div style={{ minHeight: '100vh' }}>
      <PageTitle>宏观温度</PageTitle>
      <PageTabs label="宏观温度栏目" items={TABS} value={activeSubTab} onChange={setActiveSubTab} />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px 32px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
          {activeSubTab === 'overview' && <OverviewTab />}
          {activeSubTab === 'china-stock' && <ChinaStockTab />}
          {activeSubTab === 'indicators' && <IndicatorsTab />}
          {activeSubTab === 'temperature' && <TemperatureTab />}
          {activeSubTab === 'china-temperature' && <ChinaTemperatureTab />}
          {activeSubTab === 'stages' && <StagesTab />}
          {activeSubTab === 'execution' && <ExecutionTab />}
          {activeSubTab === 'us-monitor' && <USMonitorTab />}
        </div>
      </div>
    </div>
  )
}
