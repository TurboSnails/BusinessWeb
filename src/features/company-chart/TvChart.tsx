// TradingView 官方 Advanced Chart（Web Component）走势图，只用于美股 / ADR / 纳指。
// 依据（2026-11-14 读取）：
// - https://www.tradingview.com/widget-docs/whats-new/ ：Advanced Chart 已改为 Web Component，
//   嵌入为 <script type="module" src="https://widgets.tradingview-widget.com/w/en/tv-advanced-chart.js"> + <tv-advanced-chart symbol interval>
// - https://www.tradingview.com/widget-docs/tutorials/web-components/styling-and-themes/ ：theme="light|dark"（不写则跟随系统），
//   涨跌色 CSS 变量 --tv-widget-positive-color / --tv-widget-negative-color 可设在任意祖先元素上
// - https://www.tradingview.com/widget-docs/tutorials/web-components/custom-links/ ：数据来源署名、TradingView 标志与法律/品牌链接固定，不能覆盖
// - 属性名（kebab-case）与 studies 的 JSON 格式取自上面脚本本身（chart-type、hide-volume、allow-symbol-change、studies='[...]'）
// - https://www.tradingview.com/widget-docs/markets/north-america/ ：NASDAQ/NYSE 为延迟行情
// 边界：只做展示，不读取 widget 内部数据，图中价格不进入本站任何研究计算。
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Market } from '../../data/companies'
import { useInView } from './useInView'
import './company-chart.css'

export const TV_SCRIPT_SRC = 'https://widgets.tradingview-widget.com/w/zh_CN/tv-advanced-chart.js'
export const TV_ELEMENT = 'tv-advanced-chart'
const LOAD_TIMEOUT_MS = 12_000

/** 默认指标：MA50 / MA200（成交量为 widget 默认显示）；其余指标留在 widget 菜单里 */
export const TV_STUDIES = JSON.stringify([
  { id: 'MASimple@tv-basicstudies', inputs: { length: 50 } },
  { id: 'MASimple@tv-basicstudies', inputs: { length: 200 } },
])

let pending: Promise<void> | null = null

/** 仅测试用：清掉脚本加载缓存 */
export function resetTvLoaderForTest(): void { pending = null }

/** 只注入一次脚本；失败后清掉缓存，允许重试 */
export function loadTvScript(timeoutMs = LOAD_TIMEOUT_MS): Promise<void> {
  if (typeof window === 'undefined' || !('customElements' in window)) return Promise.reject(new Error('unsupported'))
  if (customElements.get(TV_ELEMENT)) return Promise.resolve()
  if (pending) return pending
  const p = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[data-tv-advanced-chart]`)
    if (!script) {
      script = document.createElement('script')
      script.type = 'module'
      script.src = TV_SCRIPT_SRC
      script.dataset.tvAdvancedChart = ''
      document.head.appendChild(script)
    }
    const timer = window.setTimeout(() => fail(new Error('timeout')), timeoutMs)
    function fail(e: Error): void {
      window.clearTimeout(timer)
      script?.remove()
      reject(e)
    }
    script.addEventListener('error', () => fail(new Error('script-error')), { once: true })
    customElements.whenDefined(TV_ELEMENT).then(() => { window.clearTimeout(timer); resolve() }, fail)
  })
  pending = p
  p.catch(() => { if (pending === p) pending = null })
  return p
}

/** 站点主题：目前只有浅色；若以后在 <html data-theme="dark"> 上切换，图会跟着重新挂载 */
function useSiteTheme(): 'light' | 'dark' {
  const read = (): 'light' | 'dark' => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const mo = new MutationObserver(() => setTheme(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return theme
}

type Status = 'idle' | 'loading' | 'ready' | 'failed'

export default function TvChart({ tvSymbol, externalUrl, market, name, exchangeKnown }: {
  tvSymbol: string
  externalUrl: string
  market: Market
  name: string
  exchangeKnown: boolean
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const inView = useInView(box, tvSymbol)
  const [requested, setRequested] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const theme = useSiteTheme()
  const skipId = `cc-after-chart-${tvSymbol.replace(/[^A-Za-z0-9]/g, '-')}`

  // 换公司时回到初始状态（旧图随 key 卸载）
  useEffect(() => { setRequested(false); setStatus('idle') }, [tvSymbol])

  const start = useCallback(() => {
    setStatus('loading')
    loadTvScript().then(() => setStatus('ready'), () => setStatus('failed'))
  }, [])

  useEffect(() => {
    if ((inView || requested) && status === 'idle') start()
  }, [inView, requested, status, start])

  const usColors = market === 'us' || market === 'adr' || market === 'ndx'
  const style = {
    // 美股绿涨红跌；沪深/港股红涨绿跌（本组件目前只用于美股，保留判断以防误用）
    '--tv-widget-positive-color': usColors ? 'var(--down)' : 'var(--up)',
    '--tv-widget-negative-color': usColors ? 'var(--up)' : 'var(--down)',
  } as React.CSSProperties

  return (
    <figure className="cc-chart" aria-label={`${name} 走势图`}>
      <a className="cc-skip" href={`#${skipId}`}>跳过走势图</a>
      <div ref={box} className="cc-chart__frame" style={style}>
        {status === 'ready' && React.createElement(TV_ELEMENT, {
          key: `${tvSymbol}:${theme}`,
          symbol: tvSymbol,
          interval: '1D',
          theme,
          timezone: 'America/New_York',
          'chart-type': 'candles',
          studies: TV_STUDIES,
        })}
        {status === 'idle' && (
          <div className="cc-chart__placeholder">
            <button type="button" className="tool-btn" onClick={() => setRequested(true)}>加载走势图</button>
            <span>滚动到这里时自动加载 TradingView 图表</span>
          </div>
        )}
        {status === 'loading' && <div className="cc-chart__placeholder" role="status">正在加载走势图…</div>}
        {status === 'failed' && (
          <div className="cc-chart__placeholder" role="alert">
            <p>走势图没有加载出来（可能被浏览器扩展拦截，或网络无法访问 TradingView）。页面其他内容不受影响。</p>
            <p>
              <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="rn-link">在 TradingView 打开 {tvSymbol} ↗</a>
              {' '}<button type="button" className="tool-btn" onClick={start}>重试</button>
            </p>
          </div>
        )}
      </div>
      <figcaption className="cc-chart__caption">
        {name}（{tvSymbol}）日线，默认叠加 MA50 / MA200 与成交量；TradingView 延迟行情，图中价格不进入本站研究计算，研究价位以下方刻度条为准。
        {!exchangeKnown && ' 本站资料未记录该股交易所，符号由 TradingView 自动解析，请核对图表标题。'}
        {' '}<a href={externalUrl} target="_blank" rel="noopener noreferrer" className="rn-link">在 TradingView 查看 ↗</a>
      </figcaption>
      <span id={skipId} tabIndex={-1} />
    </figure>
  )
}
