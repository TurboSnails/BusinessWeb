import React from 'react'

export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: React.ReactNode
}

/** 页面级一级页签：吸顶、下划线样式，全站子页面共用 */
export function PageTabs<T extends string>({ items, value, onChange, label, width }: {
  items: TabItem<NoInfer<T>>[]
  value: T
  onChange(id: NoInfer<T>): void
  label: string
  width?: number
}): JSX.Element {
  return (
    <div className="page-tabs">
      <div className="page-tabs__inner" role="tablist" aria-label={label} style={width ? { maxWidth: width } : undefined}>
        {items.map(item => {
          const active = item.id === value
          return (
            <button key={item.id} type="button" role="tab" aria-selected={active}
              className={active ? 'page-tab is-active' : 'page-tab'} onClick={() => onChange(item.id)}>
              {item.icon}
              {item.label}
            </button>
          )
        })}
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
