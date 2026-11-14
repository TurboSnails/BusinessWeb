// start:v1 的运行时校验：JSON.parse 之后一律当 unknown，逐字段核对；不认识的数据不当成空状态覆盖。
import { sanitizeAnswers, validUserCapBps } from './recommend'
import { QUESTIONNAIRE_VERSION, SCHEMA_VERSION } from './types'
import type { Day, ReviewSchedule, StartState, StepProgress } from './types'

const MAX_STEPS = 200
const MAX_COMPLETED = 200
const ID_RE = /^[a-z0-9-]{1,64}$/

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

/** 严格的 YYYY-MM-DD 真实日期 */
export function isDay(v: unknown): v is Day {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 1900 && y <= 2200
}

/** 检查日首日：日号 1–28，避开月末重复歧义（arch-r2 §5） */
export const isAnchorDay = (v: unknown): v is Day => isDay(v) && Number(v.slice(8, 10)) <= 28

export function parseReview(v: unknown): ReviewSchedule | undefined {
  if (!isObj(v)) return undefined
  const { id, anchor, intervalMonths, completedDates, calendarSequence } = v
  if (!isStr(id) || !ID_RE.test(id)) return undefined
  if (!isAnchorDay(anchor)) return undefined
  if (intervalMonths !== 3 && intervalMonths !== 6) return undefined
  if (!Array.isArray(completedDates) || completedDates.length > MAX_COMPLETED || !completedDates.every(isDay)) return undefined
  if (typeof calendarSequence !== 'number' || !Number.isInteger(calendarSequence) || calendarSequence < 0 || calendarSequence > 10000) return undefined
  return { id, anchor, intervalMonths, completedDates: [...new Set(completedDates)].sort(), calendarSequence }
}

function parseSteps(v: unknown): Record<string, StepProgress> | null {
  if (!isObj(v)) return null
  const entries = Object.entries(v)
  if (entries.length > MAX_STEPS) return null
  const out: Record<string, StepProgress> = {}
  for (const [k, p] of entries) {
    if (!ID_RE.test(k) || !isObj(p) || typeof p.checked !== 'boolean' || !isStr(p.at)) return null
    out[k] = { checked: p.checked, at: p.at }
  }
  return out
}

export type ParseResult = { ok: true; state: StartState; questionnaireChanged: boolean } | { ok: false }

/**
 * 解析 start:v1。schemaVersion 不认识 → ok:false（调用方保留原文，不覆盖）。
 * questionnaireVersion 不同 → 丢弃答案（不能把旧答案当新题解释），保留清单进度和检查日。
 * rulesVersion 原样保留，由页面比较当前版本并提示重做。
 */
export function parseStartState(raw: unknown): ParseResult {
  if (!isObj(raw) || raw.schemaVersion !== SCHEMA_VERSION) return { ok: false }
  const steps = parseSteps(raw.steps ?? {})
  if (!steps) return { ok: false }
  const rulesVersion = typeof raw.rulesVersion === 'number' && Number.isInteger(raw.rulesVersion) && raw.rulesVersion > 0 ? raw.rulesVersion : null
  if (rulesVersion === null) return { ok: false }
  const questionnaireChanged = raw.questionnaireVersion !== QUESTIONNAIRE_VERSION
  const state: StartState = {
    schemaVersion: SCHEMA_VERSION,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    rulesVersion,
    answers: questionnaireChanged ? {} : sanitizeAnswers(raw.answers),
    steps,
  }
  if (!questionnaireChanged && isStr(raw.assessedAt)) state.assessedAt = raw.assessedAt
  const review = parseReview(raw.review)
  if (review) state.review = review
  const lc = raw.legacyConfirmation
  if (isObj(lc) && isStr(lc.fingerprint) && isStr(lc.confirmedAt)) state.legacyConfirmation = { fingerprint: lc.fingerprint, confirmedAt: lc.confirmedAt }
  if (validUserCapBps(raw.userResearchCapBps)) state.userResearchCapBps = raw.userResearchCapBps
  return { ok: true, state, questionnaireChanged }
}
