import React from 'react'
import { EmptyState } from './Card'
import { cx } from './Page'

/** 把 loader 抛出的技术信息收成小字，避免正文直接出现「HTTP 500」 */
export function loadErrorDetail(message?: string | null): string | undefined {
  if (!message) return undefined
  const http = message.match(/HTTP\s*(\d{3})/i) ?? message.match(/^(\d{3})$/)
  if (http) return `HTTP ${http[1]}`
  return message
}

/** 给读者看的白话原因；技术细节走 detail */
export function plainLoadReason(message?: string | null): string {
  if (!message) return '网络不稳或数据暂时不可用，请稍后重试。'
  if (/abort|timeout|超时/i.test(message)) return '请求超时，服务响应太慢。'
  if (/格式|结构|解析/i.test(message)) return '数据文件格式异常，可能正在更新。'
  if (/HTTP|\d{3}|网络|fetch|Failed|Load failed|不可用/i.test(message)) {
    return '网络不稳或服务暂时不可用，请稍后重试。'
  }
  return '数据暂时不可用，请稍后重试。'
}

/**
 * 统一的数据加载失败块：标题固定「数据暂时取不到」+ 白话原因 + 可选小字技术细节 + 重试。
 * 参考公司库部分失败横幅，失败时保留顶栏/面包屑，不整页刷新。
 */
export function LoadError({
  reason,
  detail,
  onRetry,
  className,
  testId,
}: {
  /** 白话原因；不传则按 detail / message 推断 */
  reason?: React.ReactNode
  /** 技术细节（如 HTTP 500），只放小字 */
  detail?: string | null
  onRetry: () => void
  className?: string
  testId?: string
}): JSX.Element {
  const tech = loadErrorDetail(detail)
  const body = reason ?? plainLoadReason(typeof detail === 'string' ? detail : undefined)
  return (
    <div role="alert" className={cx('ui-load-error', className)} data-testid={testId}>
      <EmptyState
        title="数据暂时取不到"
        action={(
          <button type="button" className="tool-btn tool-btn--primary" onClick={onRetry}>
            重试
          </button>
        )}
      >
        <p className="ui-load-error__reason">{body}</p>
        {tech ? <p className="ui-load-error__detail"><small>{tech}</small></p> : null}
      </EmptyState>
    </div>
  )
}
