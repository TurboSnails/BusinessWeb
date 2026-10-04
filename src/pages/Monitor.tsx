import React, { useState } from 'react'
import { OverviewTab } from '../components/monitor/OverviewTab'
import { IndicatorsTab } from '../components/monitor/IndicatorsTab'
import { TemperatureTab } from '../components/monitor/TemperatureTab'
import { ChinaTemperatureTab } from '../components/monitor/ChinaTemperatureTab'
import { StagesTab } from '../components/monitor/StagesTab'
import { ExecutionTab } from '../components/monitor/ExecutionTab'
import { USMonitorTab } from '../components/monitor/USMonitorTab'
import { ChinaStockTab } from '../components/monitor/ChinaStockTab'

export default function Monitor(): JSX.Element {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'china-stock' | 'indicators' | 'temperature' | 'china-temperature' | 'stages' | 'execution' | 'us-monitor'>('execution')

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px', minHeight: '100vh' }}>
      {/* 子Tab导航 */}
      <div style={{ background: 'white', borderLeft: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border-subtle)' }}>
          {/* 计划执行类 */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--bg-secondary)', flexWrap: 'wrap' }}>
      <div style={{
              padding: '8px 12px', 
              fontSize: '0.75rem', 
              color: 'var(--text-secondary)', 
              fontWeight: '600',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minWidth: '80px'
            }}>
            📅 计划执行
          </div>
            {(['stages', 'execution', 'us-monitor'] as const).map((subTab) => {
              const subLabels: Record<typeof subTab, string> = {
                stages: '阶段划分',
                execution: '日常执行',
                'us-monitor': '美经监控'
              }
              const isActive = activeSubTab === subTab
              return (
                <button
                  key={subTab}
                  onClick={() => setActiveSubTab(subTab)}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontWeight: '500',
                    background: isActive ? 'var(--accent-soft)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    border: 'none',
                    borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--bg-secondary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {subLabels[subTab]}
                </button>
              )
            })}
        </div>

          {/* 决策策略类 */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--bg-secondary)', flexWrap: 'wrap' }}>
            <div style={{ 
              padding: '8px 12px', 
              fontSize: '0.75rem', 
              color: 'var(--text-secondary)', 
              fontWeight: '600',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minWidth: '80px'
            }}>
            ⚖️ 决策策略
          </div>
            {(['overview', 'china-stock'] as const).map((subTab) => {
              const subLabels: Record<typeof subTab, string> = {
                overview: '投资总纲',
                'china-stock': '中股投资'
              }
              const isActive = activeSubTab === subTab
              return (
                <button
                  key={subTab}
                  onClick={() => setActiveSubTab(subTab)}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontWeight: '500',
                    background: isActive ? 'var(--accent-soft)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    border: 'none',
                    borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--bg-secondary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {subLabels[subTab]}
                </button>
              )
            })}
        </div>

          {/* 监控分析类 */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--bg-secondary)', flexWrap: 'wrap' }}>
            <div style={{ 
              padding: '8px 12px', 
              fontSize: '0.75rem', 
              color: 'var(--text-secondary)', 
              fontWeight: '600',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minWidth: '80px'
            }}>
            📊 监控分析
          </div>
            {(['indicators', 'temperature', 'china-temperature'] as const).map((subTab) => {
              const subLabels: Record<typeof subTab, string> = {
                indicators: '指标体系',
                temperature: '美经温度',
                'china-temperature': '中经温度'
              }
              const isActive = activeSubTab === subTab
              return (
                <button
                  key={subTab}
                  onClick={() => setActiveSubTab(subTab)}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontWeight: '500',
                    background: isActive ? 'var(--accent-soft)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    border: 'none',
                    borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--bg-secondary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {subLabels[subTab]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 子Tab内容 */}
      <div style={{ background: 'white', border: '1px solid var(--border-subtle)', borderRadius: '0 0 12px 12px', padding: '24px' }}>
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
  )
}
