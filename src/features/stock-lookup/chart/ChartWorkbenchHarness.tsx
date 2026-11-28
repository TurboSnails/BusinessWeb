/** 仅测试 / 截图用：真实 fixtures + ChartWorkbench */
import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useSearchParams } from 'react-router-dom'
import { __test as apiParse } from '../api'
import type { BarsPage, Timeframe } from '../types'
import { isTimeframe } from './time'
import ChartWorkbench from './ChartWorkbench'
import { saveChartSettings, DEFAULT_CHART_SETTINGS } from './settings'
import '../../../index.css'
import './chart-workbench.css'

import bars1d from '../fixtures/bars-MRVL-1d.json'
import bars1h from '../fixtures/bars-MRVL-1h.json'
import newsFix from '../fixtures/news-MRVL.json'
import { barsPageFromYahooChart } from './fixtureBars'
import yahoo1m from '../fixtures/yahoo-chart-MRVL-1m.json'

const page1m = barsPageFromYahooChart(yahoo1m as never, '1m')
const PAGES: Partial<Record<Timeframe, BarsPage>> = {
  '1d': bars1d as BarsPage,
  '1w': bars1d as BarsPage,
  '1mo': bars1d as BarsPage,
  '1h': bars1h as BarsPage,
  '4h': { ...(bars1h as BarsPage), tf: '4h' },
  '1m': page1m,
  // 无独立 5/15/30 样本时复用 1m 真实点列（仅截图页）
  '5m': { ...page1m, tf: '5m' },
  '15m': { ...page1m, tf: '15m' },
  '30m': { ...page1m, tf: '30m' },
}

function RealApi(): Pick<import('../types').StockLookupApi, 'bars'> {
  return {
    async bars(symbol: string, tf: Timeframe, before?: number): Promise<BarsPage> {
      const base = PAGES[tf] ?? PAGES['1d']!
      const all = base.bars
      if (!before) {
        return { ...base, symbol, tf, bars: all.slice(-Math.min(all.length, 120)), hasMore: all.length > 120 }
      }
      const older = all.filter(b => b.t < before)
      const page = older.slice(-80)
      return {
        ...base,
        symbol,
        tf,
        bars: page,
        hasMore: older.length > page.length,
      }
    },
  }
}

function App(): JSX.Element {
  const api = useMemo(() => RealApi(), [])
  const news = apiParse.parseNewsPage(newsFix).items
  const [selected, setSelected] = useState<string | null>(null)
  const [params] = useSearchParams()
  const raw = params.get('tf')
  const tfLabel = isTimeframe(raw) ? raw : '1d'

  return (
    <div className="sl-chart-harness">
      <h1 className="sl-chart-harness__title">K 线工作台截图页（真实样本 {tfLabel}）</h1>
      {selected && <p data-testid="selected-news">已选新闻：{selected}</p>}
      <ChartWorkbench
        symbol="MRVL"
        api={api}
        timezone="America/New_York"
        news={news}
        onSelectNews={setSelected}
      />
      <div className="sl-chart-harness__tools">
        <button
          type="button"
          data-testid="preset-vp"
          onClick={() => {
            saveChartSettings({ ...DEFAULT_CHART_SETTINGS, volumeProfile: true, macd: true, volume: true })
            window.location.reload()
          }}
        >
          开启价位成交量并刷新
        </button>
      </div>
    </div>
  )
}

const root = document.getElementById('root')
if (root) {
  // 截图默认打开价位成交量，避免手动点
  try {
    const raw = localStorage.getItem('stock-lookup.chart.settings')
    if (!raw) {
      saveChartSettings({ ...DEFAULT_CHART_SETTINGS, volumeProfile: false, macd: true, volume: true })
    }
  } catch { /* ignore */ }
  createRoot(root).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  )
}
