import React, { useCallback, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/** 多行展开：id 集合 + 全部收起 / 全部展开 */
export function useExpandSet(initial: Iterable<string> = []) {
  const [open, setOpen] = useState(() => new Set(initial))

  const isOpen = useCallback((id: string) => open.has(id), [open])
  const anyOpen = open.size > 0

  const toggle = useCallback((id: string) => {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const openOne = useCallback((id: string) => {
    setOpen(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const collapseAll = useCallback(() => setOpen(new Set()), [])
  const expandAll = useCallback((ids: string[]) => setOpen(new Set(ids)), [])

  return { open, isOpen, anyOpen, toggle, openOne, collapseAll, expandAll, setOpen }
}

export function ExpandChevron({ open }: { open: boolean }): JSX.Element {
  const Icon = open ? ChevronDown : ChevronRight
  return (
    <span className="mm-expand__chevron" aria-hidden="true">
      <Icon size={16} strokeWidth={2} />
    </span>
  )
}

export function CollapseAllButton({
  visible,
  onClick,
  label = '全部收起',
}: {
  visible: boolean
  onClick: () => void
  label?: string
}): JSX.Element | null {
  if (!visible) return null
  return (
    <button type="button" className="mm-expand__collapse-all" onClick={onClick}>
      {label}
    </button>
  )
}

/** 行点击：忽略链接 / 按钮 / 表单控件 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('a, button, input, select, textarea, label'))
}

export function rowKeyHandlers(toggle: () => void) {
  return {
    onClick: (event: React.MouseEvent) => {
      if (isInteractiveTarget(event.target)) return
      toggle()
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (isInteractiveTarget(event.target)) return
      event.preventDefault()
      toggle()
    },
  }
}

export function Panel({
  id,
  cols = 3,
  children,
  className = '',
}: {
  id?: string
  cols?: 2 | 3
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div id={id} className={`mm-panel mm-panel--cols-${cols} ${className}`.trim()}>
      {children}
    </div>
  )
}

export function PanelCol({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="mm-panel__col">
      <h4 className="mm-panel__title">{title}</h4>
      <div className="mm-panel__body">{children}</div>
    </div>
  )
}

/** 短暂高亮目标行；尊重 prefers-reduced-motion */
export function flashElement(el: HTMLElement | null): void {
  if (!el) return
  el.classList.remove('mm-flash')
  // 强制重排以便重复触发
  void el.offsetWidth
  el.classList.add('mm-flash')
  window.setTimeout(() => el.classList.remove('mm-flash'), 1600)
}

export function scrollToId(id: string): void {
  const el = document.getElementById(id)
  if (!el || typeof el.scrollIntoView !== 'function') return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
