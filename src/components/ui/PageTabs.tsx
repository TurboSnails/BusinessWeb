import React, { useEffect, useRef } from 'react'
import { scrollChildIntoViewX, useOverflowFade } from '../../hooks/useOverflowFade'

export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: React.ReactNode
  /** 可选分组名：同组页签前显示小号分组标签，组与组之间细分隔 */
  group?: string
  /** 组内短名；完整名称放 aria-label / title。未传则显示 label */
  shortLabel?: string
}

/** 页面级一级页签：吸顶、下划线样式，全站子页面共用 */
export function PageTabs<T extends string>({ items, value, onChange, label }: {
  items: TabItem<NoInfer<T>>[]
  value: T
  onChange(id: NoInfer<T>): void
  label: string
}): JSX.Element {
  const activeRef = useRef<HTMLButtonElement | null>(null)
  const movedByKeyboard = useRef(false)
  const { ref: overflowRef, sync: syncOverflow } = useOverflowFade<HTMLDivElement>()
  const grouped = items.some(item => item.group)

  useEffect(() => {
    const child = activeRef.current
    const container = child?.parentElement
    if (child && container) scrollChildIntoViewX(container, child)
    // 键盘切换后父树可能重挂载，下一帧把焦点钉回当前页签
    if (movedByKeyboard.current) {
      movedByKeyboard.current = false
      child?.focus({ preventScroll: true })
    }
    syncOverflow()
    const id = requestAnimationFrame(syncOverflow)
    return () => cancelAnimationFrame(id)
  }, [value, syncOverflow])

  // 方向键、Home、End 在页签间移动并选中，只有当前页签在 Tab 顺序里（WAI-ARIA tabs 模式）
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key) || items.length === 0) return
    e.preventDefault()
    const cur = Math.max(0, items.findIndex(i => i.id === value))
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : (cur + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    movedByKeyboard.current = true
    onChange(items[next].id)
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons[next]?.focus({ preventScroll: true })
  }

  const nodes: React.ReactNode[] = []
  let prevGroup: string | undefined
  for (const item of items) {
    if (item.group && item.group !== prevGroup) {
      if (prevGroup !== undefined || nodes.length > 0) {
        nodes.push(<span key={`sep-${item.group}`} role="presentation" className="page-tabs__sep" aria-hidden="true" />)
      }
      nodes.push(
        <span key={`group-${item.group}`} role="presentation" className="page-tabs__group">
          {item.group}
        </span>,
      )
      prevGroup = item.group
    } else if (!item.group) {
      prevGroup = undefined
    }

    const active = item.id === value
    const text = item.shortLabel ?? item.label
    const fullName = item.shortLabel && item.shortLabel !== item.label ? item.label : undefined
    nodes.push(
      <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={fullName}
        title={fullName}
        tabIndex={active ? 0 : -1}
        ref={active ? activeRef : undefined}
        className={active ? 'page-tab is-active' : 'page-tab'}
        onClick={() => onChange(item.id)}
      >
        {item.icon}
        {text}
      </button>,
    )
  }

  return (
    <div className="page-tabs">
      <div
        className={grouped ? 'page-tabs__inner page-tabs__inner--grouped' : 'page-tabs__inner'}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        ref={overflowRef}
      >
        {nodes}
      </div>
    </div>
  )
}

/** 页内二级切换（市场、视图等）：胶囊按钮 */
export function Segmented<T extends string>({ items, value, onChange, label }: {
  items: TabItem<NoInfer<T>>[]
  value: T
  onChange(id: NoInfer<T>): void
  label: string
}): JSX.Element {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map(item => {
        const active = item.id === value
        return (
          <button key={item.id} type="button" aria-pressed={active}
            className={active ? 'seg__btn is-active' : 'seg__btn'} onClick={() => onChange(item.id)}>
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

/** 页面名由面包屑显示，这里只给读屏和搜索引擎一个标题 */
export function PageTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return <h1 className="visually-hidden">{children}</h1>
}
