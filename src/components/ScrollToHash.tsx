import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * 异步内容渲染后补一次 hash 定位（原生定位时常目标尚未挂载）。
 * 不拦截同页锚点点击：hash 变化时再滚，已有的 scroll-margin-top / 返回键行为照旧。
 */
export default function ScrollToHash(): null {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash || hash === '#') return
    let id = hash.slice(1)
    try {
      id = decodeURIComponent(id)
    } catch {
      /* 非法 escape 时用原串 */
    }
    if (!id) return

    let done = false
    const scroll = (): boolean => {
      const el = document.getElementById(id)
      if (!el) return false
      el.scrollIntoView()
      done = true
      return true
    }

    if (scroll()) return

    const mo = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => {
          if (!done && scroll()) mo?.disconnect()
        })
      : null
    mo?.observe(document.body, { childList: true, subtree: true })
    const raf = requestAnimationFrame(() => {
      if (!done) scroll()
    })
    const timer = window.setTimeout(() => {
      mo?.disconnect()
      if (!done) scroll()
    }, 3000)

    return () => {
      done = true
      mo?.disconnect()
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [pathname, hash])
  return null
}
