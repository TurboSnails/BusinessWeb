import React from 'react'
import { displayMissing } from './format'

// 数据层的 [MISSING] 只供程序判断；渲染前递归把它换成「未取得」
export function scrubMissing(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string') return displayMissing(node)
  if (Array.isArray(node)) return node.map(scrubMissing)
  if (React.isValidElement<{ children?: React.ReactNode }>(node) && node.props.children != null) {
    return React.cloneElement(node, undefined, ...React.Children.toArray(node.props.children).map(scrubMissing))
  }
  return node
}
