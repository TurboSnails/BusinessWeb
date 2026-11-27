import React from 'react'
import { cx } from './Page'

/** 表格外壳：窄屏横向滚动（可用键盘聚焦滚动）；stickyFirst 首列吸附；stickyHeader/maxHeight 长表纵滚+表头吸顶 */
export function TableWrap({ label, stickyFirst, stickyHeader, maxHeight, children, className }: {
  label: string
  stickyFirst?: boolean
  /** 长表模式：容器纵向滚动，表头在容器内吸顶（默认高度见 CSS） */
  stickyHeader?: boolean
  /** 自定义最大高度；传入即启用长表模式。数字按 px */
  maxHeight?: string | number
  children: React.ReactNode
  className?: string
}): JSX.Element {
  const scroll = Boolean(stickyHeader) || maxHeight != null
  const style = maxHeight != null
    ? { ['--ui-table-max-h' as string]: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }
    : undefined
  return (
    <div
      className={cx('ui-table-wrap', stickyFirst && 'ui-table-wrap--sticky', scroll && 'ui-table-wrap--scroll', className)}
      role="region"
      aria-label={label}
      tabIndex={0}
      style={style}
    >
      {children}
    </div>
  )
}
