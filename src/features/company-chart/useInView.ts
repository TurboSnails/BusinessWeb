import { useEffect, useState, type RefObject } from 'react'

/** 元素进入视口（或附近 200px）后返回 true，之后保持 true；不支持 IntersectionObserver 时不自动触发，等用户点击 */
export function useInView(ref: RefObject<Element>, resetKey?: unknown): boolean {
  const [seen, setSeen] = useState(false)
  useEffect(() => { setSeen(false) }, [resetKey])
  useEffect(() => {
    const el = ref.current
    if (!el || seen || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { rootMargin: '200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, seen, resetKey])
  return seen
}
