import { useCallback, useId, useState, type KeyboardEvent } from 'react'

const EQUITY_CAP_KEY = 'mp-equity-cap'

/** 建议上限（2026-11-25 起，以降低波动为目标；依据见说明书）。用户自己设过的值优先。 */
export const RECOMMENDED_EQUITY_CAP = 80

const RANGE_HINT = '上限在 0–100 之间'

export function readEquityCap(): number {
  try {
    const raw = localStorage.getItem(EQUITY_CAP_KEY)
    if (raw == null) return RECOMMENDED_EQUITY_CAP
    const n = Number(raw)
    if (!Number.isFinite(n)) return RECOMMENDED_EQUITY_CAP
    return Math.min(100, Math.max(0, n))
  } catch {
    return RECOMMENDED_EQUITY_CAP
  }
}

export function writeEquityCap(value: number): void {
  try {
    localStorage.setItem(EQUITY_CAP_KEY, String(value))
  } catch {
    /* ignore quota / private mode */
  }
}

function parseCapDraft(raw: string): { kind: 'empty' | 'invalid' | 'oor' | 'ok'; value?: number } {
  const trimmed = raw.trim()
  if (trimmed === '') return { kind: 'empty' }
  const next = Number(trimmed)
  if (!Number.isFinite(next)) return { kind: 'invalid' }
  if (next < 0 || next > 100) return { kind: 'oor', value: next }
  return { kind: 'ok', value: next }
}

/**
 * 综合策略 / 宏观攻守共用的股票上限输入。
 * 合法值立即写入存储并换算；非法值保留原文、提示范围，失焦或回车才校正。
 */
export function useEquityCapInput() {
  const fieldId = useId()
  const errorId = `${fieldId}-err`
  const hintId = `${fieldId}-hint`
  const [cap, setCap] = useState(readEquityCap)
  const [draft, setDraft] = useState(() => String(readEquityCap()))
  const [error, setError] = useState<string | null>(null)
  const [correction, setCorrection] = useState<string | null>(null)

  const applyValid = useCallback((value: number) => {
    setCap(value)
    writeEquityCap(value)
    setError(null)
    setCorrection(null)
  }, [])

  const onChange = useCallback(
    (raw: string) => {
      setDraft(raw)
      setCorrection(null)
      const parsed = parseCapDraft(raw)
      if (parsed.kind === 'ok' && parsed.value != null) {
        applyValid(parsed.value)
        return
      }
      setError(RANGE_HINT)
    },
    [applyValid],
  )

  const commit = useCallback(() => {
    const parsed = parseCapDraft(draft)
    if (parsed.kind === 'ok' && parsed.value != null) {
      setDraft(String(parsed.value))
      applyValid(parsed.value)
      return
    }
    if (parsed.kind === 'oor' && parsed.value != null) {
      const clamped = Math.min(100, Math.max(0, parsed.value))
      setCap(clamped)
      writeEquityCap(clamped)
      setDraft(String(clamped))
      setError(null)
      setCorrection(`已改为 ${clamped}`)
      return
    }
    // 空 / 字母：恢复上次有效值，不改存储
    setDraft(String(cap))
    setError(null)
    setCorrection(null)
  }, [applyValid, cap, draft])

  const onBlur = useCallback(() => {
    commit()
  }, [commit])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        ;(e.target as HTMLInputElement).blur()
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setCap(RECOMMENDED_EQUITY_CAP)
    setDraft(String(RECOMMENDED_EQUITY_CAP))
    writeEquityCap(RECOMMENDED_EQUITY_CAP)
    setError(null)
    setCorrection(null)
  }, [])

  const describedBy = [hintId, error || correction ? errorId : null].filter(Boolean).join(' ') || undefined

  return {
    fieldId,
    errorId,
    hintId,
    describedBy,
    cap,
    draft,
    error,
    correction,
    isRecommended: cap === RECOMMENDED_EQUITY_CAP,
    invalid: error != null,
    onChange,
    onBlur,
    onKeyDown,
    reset,
  }
}
