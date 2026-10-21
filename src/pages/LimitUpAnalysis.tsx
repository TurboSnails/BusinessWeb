import React, { useState, useEffect, useRef } from 'react'
import { PageTabs, PageTitle } from '../components/ui/PageTabs'
import LimitUpLadder from '../features/limit-up/LimitUpLadder'
import { buildLadder } from '../features/limit-up/ladder'
import {
  
  Calendar,
  RefreshCcw,
  AlertTriangle,
  BarChart2
} from 'lucide-react'
import { loadLimitUp, shanghaiDate, isClosedDate, type LimitUpResult } from '../services/limitUp'
import { getLimitUpCache, saveLimitUpCache, readLimitUpView, saveLimitUpView } from '../services/limitUpCache'
import type { LimitUpConcept } from '../types'
import { EmptyState, Page, TableWrap } from '../components/ui'
import '../styles/a-share.css'

type View = 'ladder' | 'plates'
const VIEWS: Array<{ id: View; label: string }> = [{ id: 'ladder', label: '涨停梯队' }, { id: 'plates', label: '板块明细' }]

export default function LimitUpAnalysis(): JSX.Element {
  const [view, setView] = useState<View>('ladder')
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

  const activeName = currentConcept?.name // 高亮跟随实际显示的概念
  const toggleExpanded = (code: string) => {
    const next = new Set(expandedStocks)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    setExpandedStocks(next)
  }

  return (
    <Page className="limitup-page">
      <PageTitle>每日板块涨停分析</PageTitle>
      <div className="page-toolbar">
        <span className="page-toolbar__note">按概念展示 A 股涨停数据，休市使用最近有效交易日数据</span>
        <label className="limitup-toggle">
          <input type="checkbox" checked={onlyLimitUp} onChange={(e) => setOnlyLimitUp(e.target.checked)} />
          只看涨停
        </label>
        <label className="limitup-date">
          <Calendar size={18} aria-hidden="true" />
          <input type="date" className="ui-input" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} aria-label="查询日期" max={shanghaiDate()} />
        </label>
        <button type="button" onClick={fetchLimitUpData} disabled={loading} className="tool-btn tool-btn--primary">
          <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          {loading ? '刷新中...' : '刷新数据'}
        </button>
      </div>

      <div role="status" className="ui-callout ui-callout--muted limitup-status">
        <div className="ui-callout__body">
          {isClosedDate(selectedDate) && <div>{selectedDate} 为休市日，使用此前最近的有效交易日数据。</div>}
          {result && <div>数据日期：{result.dataDate || '未取得'} · 获取时间：{new Date(result.fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）</div>}
          {loading ? (result ? '正在刷新，继续显示已有数据…' : '正在获取数据…') : error ? (result ? '刷新失败，继续显示上次成功获取的数据；数据时间见上方。' : '接口失败，尚未取得可展示的数据；这不代表没有涨停股票。') : result?.status === 'empty' ? `${selectedDate} 为交易日，数据源返回空列表，当前暂无板块数据。` : result?.dataDate ? `数据日期：${result.dataDate}${result.status === 'closed' ? '（休市回退）' : ''}` : '休市：此前10个交易日内未找到有效数据。'}
        </div>
      </div>

      {error && (
        <div role="alert" className="ui-callout ui-callout--danger limitup-status">
          <AlertTriangle size={16} aria-hidden="true" className="ui-callout__icon" />
          <div className="ui-callout__body">{error}</div>
        </div>
      )}

      {!selectedDate.startsWith('2026-') && <p className="limitup-note">当前节假日表已核实2026年；其他年份仅识别周末，节假日请另行核实。</p>}

      <PageTabs label="涨停视图" items={VIEWS} value={view} onChange={setView} />

      {view === 'ladder' && filteredConcepts.length > 0 && (
        <LimitUpLadder tiers={buildLadder(filteredConcepts, onlyLimitUp)} onPickConcept={name => { setSelectedConcept(name); setView('plates') }} />
      )}

      {/* 概念分类标签 */}
      {view === 'plates' && filteredConcepts.length > 0 && (
        <div className="ui-cluster ui-cluster--scroll limitup-concepts" role="group" aria-label="概念板块">
          {filteredConcepts.map((concept) => (
            <button type="button" key={concept.name} onClick={() => setSelectedConcept(concept.name)}
              aria-pressed={concept.name === activeName} className={concept.name === activeName ? 'ui-chip is-active' : 'ui-chip'}>
              {concept.name}
              <span className="ui-chip__count">{onlyLimitUp ? concept.stocks.length : concept.stockCount}</span>
            </button>
          ))}
        </div>
      )}

      {/* 当前概念详情 */}
      {view === 'plates' && currentConcept && (
        <section className="ui-card limitup-detail" aria-label={currentConcept.name}>
          <div className="limitup-detail__head">
            <h2 className="limitup-detail__title">{currentConcept.name}</h2>
            <span className={currentConcept.changePercent >= 0 ? 'limitup-change is-up' : 'limitup-change is-down'}>
              {currentConcept.changePercent >= 0 ? '+' : ''}{currentConcept.changePercent.toFixed(2)}%
            </span>
          </div>

          {currentConcept.drivingFactor && (
            <div className="ui-callout ui-callout--info limitup-driver">
              <BarChart2 size={18} aria-hidden="true" className="ui-callout__icon" />
              <div className="ui-callout__body">
                <div className="ui-callout__title">驱动因素</div>
                {currentConcept.drivingFactor}
              </div>
            </div>
          )}

          {currentConcept.stocks.length > 0 ? (
            <TableWrap label={`${currentConcept.name}涨停股`} stickyFirst>
              <table className="ui-table limitup-table">
                <thead>
                  <tr>
                    <th scope="col">简称</th>
                    <th scope="col" className="num">现价</th>
                    <th scope="col" className="num">涨幅</th>
                    <th scope="col" className="limitup-center">涨停时间</th>
                    <th scope="col" className="num">流通市值</th>
                    <th scope="col" className="limitup-center">连板</th>
                    <th scope="col" className="limitup-center">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {currentConcept.stocks.map((stock) => {
                    const isExpanded = expandedStocks.has(stock.code)
                    return (
                      <React.Fragment key={stock.code}>
                        <tr className={isExpanded ? 'is-expanded' : undefined}>
                          <td>
                            <div className="limitup-name">{stock.name}</div>
                            <div className="limitup-code">{stock.code}</div>
                          </td>
                          <td className="num limitup-strong">{stock.currentPrice.toFixed(2)}</td>
                          <td className="num limitup-up">+{stock.changePercent.toFixed(2)}%</td>
                          <td className="limitup-center limitup-muted limitup-nowrap">{stock.limitUpTime}</td>
                          <td className="num limitup-muted">{stock.marketCap.toFixed(2)}亿</td>
                          <td className="limitup-center">
                            {stock.consecutiveDays > 0 && <span className="ui-badge ui-badge--up">{stock.consecutiveDays}天{stock.consecutiveDays}板</span>}
                          </td>
                          <td className="limitup-center">
                            {stock.description && (
                              <button type="button" aria-expanded={isExpanded} onClick={() => toggleExpanded(stock.code)}
                                className={isExpanded ? 'tool-btn tool-btn--primary limitup-more' : 'tool-btn limitup-more'}>
                                {isExpanded ? '收起' : '详情'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && stock.description && (
                          <tr className="limitup-desc-row">
                            <td colSpan={7}><div className="limitup-desc">{stock.description}</div></td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <EmptyState title="暂无涨停股票数据" />
          )}
        </section>
      )}

      <p className="limitup-source">
        数据来源：财联社 | 数据日期：{result?.dataDate || '未取得'} | 获取时间：{result ? new Date(result.fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未取得'}（北京时间）
      </p>
    </Page>
  )
}
