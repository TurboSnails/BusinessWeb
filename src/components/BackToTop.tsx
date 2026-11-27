import React, { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

const THRESHOLD = (): number => Math.max(window.innerHeight * 2, 800)

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function focusMainContent(): void {
  const target =
    document.getElementById('main-content') ??
    document.querySelector<HTMLElement>('main, [role="main"]') ??
    document.querySelector<HTMLElement>('h1')
  if (!target) return
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
}

/** 全站回到顶部：滚过约两屏后出现；尊重 reduced-motion；手机页脚预留空间以免遮挡 */
export default function BackToTop(): JSX.Element | null {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = (): void => setVisible(window.scrollY >= THRESHOLD())
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      className="back-to-top"
      aria-label="回到顶部"
      onClick={() => {
        const reduce = prefersReducedMotion()
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
        if (reduce) {
          focusMainContent()
          return
        }
        // 平滑滚动结束后再移焦点；超时兜底（浏览器未触发 scrollend 时）
        let done = false
        const finish = (): void => {
          if (done) return
          done = true
          window.removeEventListener('scrollend', finish)
          focusMainContent()
        }
        window.addEventListener('scrollend', finish, { once: true })
        window.setTimeout(finish, 600)
      }}
    >
      <ArrowUp size={20} strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
