import React from 'react'
import { EmptyState, LoadError } from '../../../components/ui'
import { lookupErrorMessage } from './format'

export function BlockLoading({ label }: { label: string }): JSX.Element {
  return (
    <div className="sl-block-state" role="status" aria-label={`正在加载${label}`}>
      <div className="skeleton-line sl-skel sl-skel--a" />
      <div className="skeleton-line sl-skel sl-skel--b" />
      <div className="skeleton-line sl-skel sl-skel--c" />
    </div>
  )
}

export function BlockError({ error, onRetry }: { error: unknown; onRetry: () => void }): JSX.Element {
  return <LoadError reason={lookupErrorMessage(error)} onRetry={onRetry} className="sl-block-error" />
}

export function BlockEmpty({ title, children }: { title: string; children?: React.ReactNode }): JSX.Element {
  return <EmptyState title={title}>{children}</EmptyState>
}

export function BlockUnsupported({ reason }: { reason: string }): JSX.Element {
  return (
    <EmptyState title="暂不支持">
      <p>{reason}</p>
    </EmptyState>
  )
}
