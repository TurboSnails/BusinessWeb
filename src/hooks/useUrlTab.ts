import { useSearchParams } from 'react-router-dom'

/**
 * 一级页签读写 URL 查询参数（与 ResearchNotes / InvestmentPlan2026 同款）。
 * 默认值不写进 URL；筛选类变化用 replace，避免每点一次占一条历史。
 */
export function useUrlTab<T extends string>(
  key: string,
  ids: readonly T[],
  defaultId: T,
  options?: { replace?: boolean },
): [T, (id: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const value = (ids as readonly string[]).includes(raw ?? '') ? (raw as T) : defaultId
  const replace = options?.replace ?? true

  const setValue = (id: T): void => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (id === defaultId) next.delete(key)
      else next.set(key, id)
      return next
    }, { replace })
  }

  return [value, setValue]
}
