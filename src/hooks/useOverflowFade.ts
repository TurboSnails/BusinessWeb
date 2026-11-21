import { useCallback, useRef } from 'react'

const EPS = 1

function syncOverflowAttrs(el: HTMLElement): void {
  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  const start = el.scrollLeft > EPS
  const end = el.scrollLeft < max - EPS
  if (start) el.setAttribute('data-overflow-start', '')
  else el.removeAttribute('data-overflow-start')
  if (end) el.setAttribute('data-overflow-end', '')
  else el.removeAttribute('data-overflow-end')
}

/** 只滚横向容器，不调用 scrollIntoView（避免整页纵向跳动）。直接设 scrollLeft，无平滑动画。 */
export function scrollChildIntoViewX(container: HTMLElement, child: HTMLElement): void {
  const max = Math.max(0, container.scrollWidth - container.clientWidth)
  if (max === 0) return
  // offsetLeft 相对 offsetParent；容器常不是 offsetParent，回退到相对容器内容区的位置
  const childLeft = child.offsetParent === container
    ? child.offsetLeft
    : child.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft
  const target = childLeft + child.offsetWidth / 2 - container.clientWidth / 2
  container.scrollLeft = Math.max(0, Math.min(max, target))
}

/** 横向滚动容器：有未显示内容的一侧打上 data-overflow-start / data-overflow-end，供 CSS 渐隐遮罩 */
export function useOverflowFade<T extends HTMLElement = HTMLElement>(): {
  ref: (node: T | null) => void
  sync: () => void
} {
  const nodeRef = useRef<T | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const sync = useCallback((): void => {
    if (nodeRef.current) syncOverflowAttrs(nodeRef.current)
  }, [])

  const ref = useCallback((node: T | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    nodeRef.current = node
    if (!node) return

    const update = (): void => { syncOverflowAttrs(node) }
    update()
    node.addEventListener('scroll', update, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(node)
    const mo = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(update)
      : null
    mo?.observe(node, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', update)
    cleanupRef.current = () => {
      node.removeEventListener('scroll', update)
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return { ref, sync }
}
