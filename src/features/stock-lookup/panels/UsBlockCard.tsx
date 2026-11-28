import React from 'react'
import { Card } from '../../../components/ui'
import { BlockEmpty, BlockError, BlockLoading, BlockUnsupported } from './BlockState'
import { isLookupError } from './format'

/** 美股专项面板外壳：非美股 → 暂不支持；加载 / 出错 / 空 / 正文四态 */
export function UsBlockCard<T>({
  title,
  className,
  description,
  actions,
  usOnly,
  label,
  state,
  isEmpty,
  emptyTitle,
  emptyText,
  children,
}: {
  title: string
  className: string
  description?: React.ReactNode
  /** 标题行右侧的操作（如期权到期日选择） */
  actions?: React.ReactNode
  /** false = 沪深港等不支持的市场 */
  usOnly: boolean
  label: string
  state: { data: T | null; loading: boolean; error: unknown; retry: () => void }
  isEmpty: (d: T) => boolean
  emptyTitle: string
  emptyText?: string
  children: (d: T) => React.ReactNode
}): JSX.Element {
  let body: React.ReactNode = null
  if (!usOnly) body = <BlockUnsupported reason={`暂不支持该市场：${label}目前只覆盖美股，沪深与港股暂不提供。`} />
  else if (state.loading) body = <BlockLoading label={label} />
  else if (state.error) {
    body = isLookupError(state.error) && state.error.reason === 'unsupported'
      ? <BlockUnsupported reason={state.error.error} />
      : <BlockError error={state.error} onRetry={state.retry} />
  } else if (state.data && !isEmpty(state.data)) body = children(state.data)
  else body = <BlockEmpty title={emptyTitle}>{emptyText ? <p>{emptyText}</p> : null}</BlockEmpty>
  return (
    <Card as="section" title={title} className={`sl-us ${className}`} description={description} actions={usOnly ? actions : undefined}>
      {body}
    </Card>
  )
}
