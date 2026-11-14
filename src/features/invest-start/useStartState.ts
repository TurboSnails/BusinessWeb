import { useCallback, useEffect, useRef, useState } from 'react'
import { validCandidatesPayload } from '../candidates/validation'
import { readLegacyPlan, type LegacySummary } from './legacyPlan'
import { START_KEY, clearStart, loadStart, saveStart, type LoadMode } from './store'
import { RULES_VERSION, emptyState, type StartState } from './types'

// 只读候选池条数，用来显示「观察 M 家 ≠ 持仓」。不触发云同步，不写入；格式错返回 null（不可用），不伪称 0 家。
// 键与 src/features/candidates/store.ts 的 CANDIDATES_KEY 相同；不 import store，避免带入云同步代码。
export const CANDIDATES_KEY_READONLY = 'rn-candidates'

export function readCandidateCount(s: Pick<Storage, 'getItem'> | null): number | null {
  if (!s) return null
  try {
    const raw = s.getItem(CANDIDATES_KEY_READONLY)
    if (raw === null) return 0
    const items: unknown = JSON.parse(raw)
    return validCandidatesPayload({ schemaVersion: 1, items }) ? (items as unknown[]).length : null
  } catch {
    return null
  }
}

const safeStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * 入口页状态：内存为准，变更后写 start:v1。
 * - 只在本人操作后写入（打开页面不会生成键）；
 * - 数据无法识别（corrupt）时不覆盖原文，直到本人点「清除并重新开始」；
 * - 写入失败进入内存模式并常驻提示「当前未保存」；
 * - 其他标签页改了 start:v1 / plan2026:* / 候选池时刷新（storage 事件），不轮询。
 */
export function useStartState() {
  const initial = useRef(loadStart())
  const [state, setState] = useState<StartState>(() => initial.current.state ?? emptyState())
  const [mode, setMode] = useState<LoadMode>(initial.current.mode)
  const [questionnaireChanged, setQuestionnaireChanged] = useState(initial.current.questionnaireChanged)
  const [saveFailed, setSaveFailed] = useState(initial.current.mode === 'unavailable')
  const [deleteFailed, setDeleteFailed] = useState(false)
  const dirty = useRef(false)

  const [legacy, setLegacy] = useState<LegacySummary>(() => readLegacyPlan(safeStorage(), state.legacyConfirmation?.fingerprint))
  const [candidateCount, setCandidateCount] = useState<number | null>(() => readCandidateCount(safeStorage()))

  const update = useCallback((fn: (s: StartState) => StartState) => {
    dirty.current = true
    setState(prev => fn(prev))
  }, [])

  useEffect(() => {
    if (!dirty.current || mode === 'corrupt') return
    const ok = saveStart(state)
    setSaveFailed(!ok)
    if (ok && mode !== 'ok') setMode('ok')
  }, [state, mode])

  useEffect(() => {
    setLegacy(readLegacyPlan(safeStorage(), state.legacyConfirmation?.fingerprint))
  }, [state.legacyConfirmation?.fingerprint])

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === null || e.key === START_KEY) {
        const r = loadStart()
        dirty.current = false
        setMode(r.mode)
        setQuestionnaireChanged(r.questionnaireChanged)
        setState(r.state ?? emptyState())
      }
      if (e.key === null || e.key.startsWith('plan2026:') || e.key === START_KEY) {
        setLegacy(readLegacyPlan(safeStorage(), loadStart().state?.legacyConfirmation?.fingerprint))
      }
      if (e.key === null || e.key === CANDIDATES_KEY_READONLY) setCandidateCount(readCandidateCount(safeStorage()))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /**
   * 清除只清 start:v1；无法识别的原文也由这里清掉。返回是否真的删掉了。
   * 删除失败（removeItem 抛错）时不假装成功：本机记录原样保留，内存状态与「不覆盖无法识别记录」的保护都不变，并提示失败。
   */
  const reset = useCallback((): boolean => {
    if (!clearStart()) {
      setDeleteFailed(true)
      return false
    }
    dirty.current = false
    setDeleteFailed(false)
    setSaveFailed(false)
    setMode('empty')
    setQuestionnaireChanged(false)
    setState(emptyState())
    return true
  }, [])

  return {
    state,
    update,
    reset,
    mode,
    saveFailed,
    deleteFailed,
    questionnaireChanged,
    rulesOutdated: state.rulesVersion !== RULES_VERSION,
    legacy,
    candidateCount,
  }
}
