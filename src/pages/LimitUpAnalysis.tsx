import React, { useState, useEffect, useRef } from 'react'
import { PageTitle } from '../components/ui/PageTabs'
import {
  
  Calendar,
  RefreshCcw,
  AlertTriangle,
  BarChart2,
  TrendingDown,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight
} from 'lucide-react'
import { loadLimitUp, shanghaiDate, isClosedDate, type LimitUpResult } from '../services/limitUp'
import { getLimitUpCache, saveLimitUpCache, readLimitUpView, saveLimitUpView } from '../services/limitUpCache'
import type { LimitUpConcept } from '../types'

export default function LimitUpAnalysis(): JSX.Element {
  const [initial] = useState(() => { const view = readLimitUpView(shanghaiDate()); return { ...view, cached: getLimitUpCache(view.date, view.only) } })
  const [concepts, setConcepts] = useState<LimitUpConcept[]>(initial.cached?.result.concepts || [])
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null)
  const [loading, setLoading] = useState(!initial.cached?.fresh)
  const [error, setError] = useState<string | null>(null)
  const [onlyLimitUp, setOnlyLimitUp] = useState(initial.only) // 默认勾选"只看涨停"
  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set()) // 记录展开的股票代码
  const [selectedDate, setSelectedDate] = useState(initial.date)
  const [result, setResult] = useState<LimitUpResult | null>(initial.cached?.result || null)
  const [refresh, setRefresh] = useState(0)
  const lastRefresh = useRef(0)
  const fetchLimitUpData = (): void => setRefresh(n => n + 1)
  useEffect(() => {
    const cached = getLimitUpCache(selectedDate, onlyLimitUp)
    saveLimitUpView(selectedDate, onlyLimitUp, shanghaiDate())
    setError(null); setConcepts(cached?.result.concepts || []); setResult(cached?.result || null)
    setSelectedConcept(null); setExpandedStocks(new Set())
    const forceRefresh = lastRefresh.current !== refresh
    lastRefresh.current = refresh
    if (cached?.fresh && !forceRefresh) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    loadLimitUp(selectedDate, onlyLimitUp, controller.signal).then(data => {
      if (controller.signal.aborted) return
      saveLimitUpCache(selectedDate, onlyLimitUp, data)
      setConcepts(data.concepts); setResult(data)
    }).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '数据请求失败')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [selectedDate, onlyLimitUp, refresh])

  // API已经根据 up_limit 参数返回了对应的数据：
  // - up_limit=1: 只返回涨停股票
  // - up_limit=0: 返回所有股票（包括非涨停）
  // 所以不需要在前端再次过滤，直接使用API返回的数据
  const filteredConcepts = concepts

  const currentConcept = selectedConcept
    ? filteredConcepts.find(c => c.name === selectedConcept) || filteredConcepts[0]
    : filteredConcepts[0]

  return (
    <main className="container" style={{ padding: '20px 16px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageTitle>每日板块涨停分析</PageTitle>
        <div className="page-toolbar">
          <span className="page-toolbar__note">按概念展示 A 股涨停数据，休市使用最近有效交易日数据</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '500' }}>
            <input
              type="checkbox"
              checked={onlyLimitUp}
              onChange={(e) => setOnlyLimitUp(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            只看涨停
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '500' }}>
            <Calendar size={18} color="var(--text-secondary)" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="查询日期"
              max={shanghaiDate()}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--system-gray5)',
                borderRadius: '8px',
                fontSize: '0.95rem',
                cursor: 'pointer',
                outline: 'none',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
              }}
            />
          </label>
          <button
            onClick={fetchLimitUpData}
            disabled={loading}
            className="tool-btn tool-btn--primary"
          >
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
            {loading ? '刷新中...' : '刷新数据'}
          </button>
        </div>

      <div role="status" style={{ padding: '12px', marginBottom: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', lineHeight: 1.8 }}>
        {isClosedDate(selectedDate) && <div>{selectedDate} 为休市日，使用此前最近的有效交易日数据。</div>}
        {result && <div>数据日期：{result.dataDate || '未取得'} · 获取时间：{new Date(result.fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）</div>}
        {loading ? (result ? '正在刷新，继续显示已有数据…' : '正在获取数据…') : error ? (result ? '刷新失败，继续显示上次成功获取的数据；数据时间见上方。' : '接口失败，尚未取得可展示的数据；这不代表没有涨停股票。') : result?.status === 'empty' ? `${selectedDate} 为交易日，数据源返回空列表，当前暂无板块数据。` : result?.dataDate ? `数据日期：${result.dataDate}${result.status === 'closed' ? '（休市回退）' : ''}` : '休市：此前10个交易日内未找到有效数据。'}
      </div>

      {error && (
        <div style={{
          background: 'var(--system-red-light)',
          color: 'var(--up)',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {!selectedDate.startsWith('2026-') && <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>当前节假日表已核实2026年；其他年份仅识别周末，节假日请另行核实。</p>}
      {/* 概念分类标签 */}
      <div style={{
        background: 'white',
        padding: '16px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        marginBottom: '20px',
        overflowX: 'auto'
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {filteredConcepts.map((concept) => (
            <button
              key={concept.name}
              onClick={() => setSelectedConcept(concept.name)}
              style={{
                padding: '10px 20px',
                background: selectedConcept === concept.name || (!selectedConcept && concept.name === filteredConcepts[0]?.name)
                  ? 'var(--system-blue)'
                  : 'var(--system-gray6)',
                color: selectedConcept === concept.name || (!selectedConcept && concept.name === filteredConcepts[0]?.name)
                  ? 'white'
                  : 'var(--text-primary)',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: '600',
                whiteSpace: 'nowrap',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: selectedConcept === concept.name || (!selectedConcept && concept.name === filteredConcepts[0]?.name)
                  ? '0 4px 12px color-mix(in srgb, var(--system-blue) 30%, transparent)'
                  : 'none'
              }}
              onMouseEnter={(e) => {
                if (selectedConcept !== concept.name && (!selectedConcept && concept.name !== filteredConcepts[0]?.name)) {
                  e.currentTarget.style.background = 'var(--system-gray5)'
                }
              }}
              onMouseLeave={(e) => {
                if (selectedConcept !== concept.name && (!selectedConcept && concept.name !== filteredConcepts[0]?.name)) {
                  e.currentTarget.style.background = 'var(--system-gray6)'
                }
              }}
            >
              {concept.name}
              <span style={{
                marginLeft: '6px',
                opacity: 0.7,
                fontSize: '0.85em',
                fontWeight: '400'
              }}>
                {onlyLimitUp ? concept.stocks.length : concept.stockCount}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 当前概念详情 */}
      {currentConcept && (
        <div className="card" style={{
          background: 'var(--bg-card)',
          padding: '24px',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--glass-border)'
        }}>
          {/* 概念标题和表现 */}
          <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--system-gray5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)' }}>
                {currentConcept.name}
              </h2>
              <div style={{
                padding: '6px 16px',
                background: currentConcept.changePercent >= 0 ? 'var(--system-green-light)' : 'var(--system-red-light)',
                color: currentConcept.changePercent >= 0 ? 'var(--system-green)' : 'var(--system-red)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '1rem',
                fontWeight: '700',
                border: `1px solid ${currentConcept.changePercent >= 0 ? 'color-mix(in srgb, var(--system-green) 20%, transparent)' : 'color-mix(in srgb, var(--system-red) 20%, transparent)'}`
              }}>
                {currentConcept.changePercent >= 0 ? '+' : ''}{currentConcept.changePercent.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* 驱动因素 */}
          {currentConcept.drivingFactor && (
            <div style={{
              background: 'var(--system-blue-light)',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '24px',
              borderLeft: '4px solid var(--system-blue)',
              border: '1px solid color-mix(in srgb, var(--system-blue) 10%, transparent)'
            }}>
              <div style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--system-blue)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart2 size={20} /> 驱动因素
              </div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                {currentConcept.drivingFactor}
              </div>
            </div>
          )}

          {/* 股票列表 */}
          {currentConcept.stocks.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-subtle)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>简称</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>现价</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>涨幅</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>涨停时间</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>流通市值</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>连板</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', width: '80px' }}>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {currentConcept.stocks.map((stock, index) => {
                    const isExpanded = expandedStocks.has(stock.code)
                    return (
                      <React.Fragment key={stock.code}>
                        <tr
                          style={{
                            borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--bg-secondary)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'white'
                          }}
                        >
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                              {stock.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              {stock.code}
                            </div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {stock.currentPrice.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <span style={{
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              color: 'var(--up)'
                            }}>
                              +{stock.changePercent.toFixed(2)}%
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {stock.limitUpTime}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {stock.marketCap.toFixed(2)}亿
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {stock.consecutiveDays > 0 && (
                              <span style={{
                                padding: '4px 8px',
                                background: 'var(--system-red-light)',
                                color: 'var(--up)',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: '600'
                              }}>
                                {stock.consecutiveDays}天{stock.consecutiveDays}板
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {stock.description && (
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedStocks)
                                  if (isExpanded) {
                                    newExpanded.delete(stock.code)
                                  } else {
                                    newExpanded.add(stock.code)
                                  }
                                  setExpandedStocks(newExpanded)
                                }}
                                style={{
                                  padding: '4px 8px',
                                  background: isExpanded ? 'var(--accent)' : 'var(--bg-secondary)',
                                  color: isExpanded ? 'white' : 'var(--text-primary)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  transition: 'all 0.2s'
                                }}
                              >
                                {isExpanded ? '收起' : '详情'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {/* 展开的详细描述 */}
                        {isExpanded && stock.description && (
                          <tr>
                            <td colSpan={7} style={{ padding: '0', borderBottom: '1px solid var(--border-subtle)' }}>
                              <div style={{
                                padding: '12px',
                                background: 'var(--accent-soft)',
                                borderRadius: '0 0 8px 8px',
                                borderLeft: '3px solid var(--accent)',
                                margin: '0 12px 0 12px'
                              }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--accent-ink)', lineHeight: '1.6' }}>
                                  {stock.description}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: '0.9rem'
            }}>
              暂无涨停股票数据
            </div>
          )}
        </div>
      )}

      {/* 数据来源说明 */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        textAlign: 'center'
      }}>
        数据来源：财联社 | 数据日期：{result?.dataDate || '未取得'} | 获取时间：{result ? new Date(result.fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未取得'}（北京时间）
      </div>
    </main>
  )
}

