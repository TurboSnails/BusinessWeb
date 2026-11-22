import React, { createContext, useContext, useMemo, useRef } from 'react'
import type { ReadingKey } from './types'

type DimApi = { openByName: (name: string) => void }
type CompareApi = {
  openKey: (key: ReadingKey) => void
  clearFilters: () => void
}

type JumpContextValue = {
  registerDim: (api: DimApi | null) => void
  registerCompare: (api: CompareApi | null) => void
  jumpToDimension: (name: string) => void
  jumpToReading: (key: ReadingKey) => void
}

const JumpContext = createContext<JumpContextValue | null>(null)

export function OverviewJumpProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const dimRef = useRef<DimApi | null>(null)
  const compareRef = useRef<CompareApi | null>(null)

  const value = useMemo<JumpContextValue>(() => ({
    registerDim: (api) => { dimRef.current = api },
    registerCompare: (api) => { compareRef.current = api },
    jumpToDimension: (name) => {
      dimRef.current?.openByName(name)
    },
    jumpToReading: (key) => {
      compareRef.current?.clearFilters()
      // 等筛选清掉后再展开，避免被 filter 掉
      window.requestAnimationFrame(() => compareRef.current?.openKey(key))
    },
  }), [])

  return <JumpContext.Provider value={value}>{children}</JumpContext.Provider>
}

export function useOverviewJump(): JumpContextValue {
  const ctx = useContext(JumpContext)
  if (!ctx) {
    return {
      registerDim: () => {},
      registerCompare: () => {},
      jumpToDimension: () => {},
      jumpToReading: () => {},
    }
  }
  return ctx
}
