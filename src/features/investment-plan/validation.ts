// PlanDocument 严格白名单校验；issue 只带路径+固定错误码，不带原值。
import { isAnchorDay, isDay } from '../invest-start/validation.js'
import { sanitizeAnswers } from '../invest-start/recommend.js'
import { addMonths } from '../invest-start/checks.js'
import type { Answers, Day, Route } from '../invest-start/types.js'
import { isYuan } from './money.js'
import type {
  Allocation,
  AnnualReview,
  Budget,
  CheckSnapshot,
  Contribution,
  Instant,
  Mark,
  PlanDocument,
  PlanReview,
  ResearchPosition,
  ReviewRecord,
  ValidationIssue,
} from './types.js'
import { MAX_PLAN_BYTES } from './types.js'

const ID_RE = /^[a-z0-9-]{1,64}$/
const CODE_RE = /^[A-Za-z0-9.-]{1,24}$/
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const ROUTES: Route[] = ['foundation', 'simple', 'combined', 'research']
const OUTCOMES = ['no-action', 'cashflow', 'adjusted', 'deferred'] as const
const EARLIEST = ['under-3y', '3-to-5y', '5y-plus'] as const
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const utf8Len = (s: string): number => new TextEncoder().encode(s).length

export function isInstant(v: unknown): v is Instant {
  if (typeof v !== 'string' || !INSTANT_RE.test(v)) return false
  const t = Date.parse(v)
  if (!Number.isFinite(t)) return false
  return new Date(t).toISOString() === v
}

function issue(path: string, code: string): ValidationIssue {
  return { path, code }
}

function expectKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): boolean {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      issues.push(issue(`${path}.${k}`, 'unknown-field'))
      return false
    }
  }
  return true
}

function parseMoney(v: unknown, path: string, issues: ValidationIssue[]): { currency: 'CNY'; amount: string } | null {
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-money'))
    return null
  }
  if (!expectKeys(v, ['currency', 'amount'], path, issues)) return null
  if (v.currency !== 'CNY' || !isYuan(v.amount)) {
    issues.push(issue(path, 'invalid-money'))
    return null
  }
  return { currency: 'CNY', amount: v.amount }
}

function parseMark(v: unknown, path: string, issues: ValidationIssue[], today?: Day): Mark | null {
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-mark'))
    return null
  }
  if (!expectKeys(v, ['value', 'asOf', 'source', 'verifiedAt'], path, issues)) return null
  if (v.source !== 'manual' && v.source !== 'legacy') {
    issues.push(issue(`${path}.source`, 'invalid-enum'))
    return null
  }
  let value: Mark['value'] = null
  if (v.value !== null) {
    value = parseMoney(v.value, `${path}.value`, issues)
    if (!value) return null
  }
  if (v.asOf !== null && !isDay(v.asOf)) {
    issues.push(issue(`${path}.asOf`, 'invalid-day'))
    return null
  }
  if (v.verifiedAt !== null && !isInstant(v.verifiedAt)) {
    issues.push(issue(`${path}.verifiedAt`, 'invalid-instant'))
    return null
  }
  const asOf = v.asOf as Mark['asOf']
  const verifiedAt = v.verifiedAt as Mark['verifiedAt']
  if (today && asOf !== null && asOf > today) {
    issues.push(issue(`${path}.asOf`, 'asOf-future'))
    return null
  }
  if (value === null) {
    if (asOf !== null || verifiedAt !== null) {
      issues.push(issue(path, 'null-mark-fields'))
      return null
    }
  } else if (v.source === 'manual') {
    if (asOf === null || verifiedAt === null) {
      issues.push(issue(path, 'manual-mark-requires-dates'))
      return null
    }
  }
  // legacy 非空可无日期
  return { value, asOf, source: v.source, verifiedAt }
}

function parseBudget(v: unknown, path: string, issues: ValidationIssue[]): Budget | null {
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-budget'))
    return null
  }
  if (!expectKeys(v, ['core', 'research', 'reserve', 'confirmedAt'], path, issues)) return null
  const core = v.core === null ? null : parseMoney(v.core, `${path}.core`, issues)
  if (v.core !== null && !core) return null
  const research = v.research === null ? null : parseMoney(v.research, `${path}.research`, issues)
  if (v.research !== null && !research) return null
  const reserve = v.reserve === null ? null : parseMoney(v.reserve, `${path}.reserve`, issues)
  if (v.reserve !== null && !reserve) return null
  if (v.confirmedAt !== null && !isInstant(v.confirmedAt)) {
    issues.push(issue(`${path}.confirmedAt`, 'invalid-instant'))
    return null
  }
  return { core, research, reserve, confirmedAt: v.confirmedAt as Budget['confirmedAt'] }
}

function parseRiskTags(v: unknown, path: string, issues: ValidationIssue[]): string[] | null {
  if (!Array.isArray(v) || v.length > 8) {
    issues.push(issue(path, 'invalid-risk-tags'))
    return null
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < v.length; i++) {
    const t = v[i]
    if (typeof t !== 'string' || t.length < 1 || t.length > 32) {
      issues.push(issue(`${path}[${i}]`, 'invalid-risk-tag'))
      return null
    }
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function parseInstrument(
  v: unknown,
  path: string,
  issues: ValidationIssue[],
): { market: 'cn' | 'hk' | 'us'; code: string } | null | undefined {
  if (v === null) return null
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-instrument'))
    return undefined
  }
  if (!expectKeys(v, ['market', 'code'], path, issues)) return undefined
  if (v.market !== 'cn' && v.market !== 'hk' && v.market !== 'us') {
    issues.push(issue(`${path}.market`, 'invalid-enum'))
    return undefined
  }
  if (typeof v.code !== 'string' || !CODE_RE.test(v.code)) {
    issues.push(issue(`${path}.code`, 'invalid-code'))
    return undefined
  }
  return { market: v.market, code: v.code }
}

function parseAllocation(v: unknown, path: string, issues: ValidationIssue[], today?: Day): Allocation | null {
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-allocation'))
    return null
  }
  if (!expectKeys(v, ['id', 'label', 'targetBps', 'relativeBandBps', 'mark', 'riskTags'], path, issues)) return null
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) {
    issues.push(issue(`${path}.id`, 'invalid-id'))
    return null
  }
  if (typeof v.label !== 'string' || v.label.length < 1 || v.label.length > 80) {
    issues.push(issue(`${path}.label`, 'invalid-label'))
    return null
  }
  if (v.targetBps !== null && !(typeof v.targetBps === 'number' && Number.isInteger(v.targetBps) && v.targetBps >= 1 && v.targetBps <= 10000)) {
    issues.push(issue(`${path}.targetBps`, 'invalid-bps'))
    return null
  }
  if (
    v.relativeBandBps !== null &&
    !(typeof v.relativeBandBps === 'number' && Number.isInteger(v.relativeBandBps) && v.relativeBandBps >= 1 && v.relativeBandBps <= 10000)
  ) {
    issues.push(issue(`${path}.relativeBandBps`, 'invalid-bps'))
    return null
  }
  const mark = parseMark(v.mark, `${path}.mark`, issues, today)
  if (!mark) return null
  const riskTags = parseRiskTags(v.riskTags, `${path}.riskTags`, issues)
  if (!riskTags) return null
  return {
    id: v.id,
    label: v.label,
    targetBps: v.targetBps as number | null,
    relativeBandBps: v.relativeBandBps as number | null,
    mark,
    riskTags,
  }
}

function parseResearch(v: unknown, path: string, issues: ValidationIssue[], today?: Day): ResearchPosition | null {
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-research'))
    return null
  }
  if (!expectKeys(v, ['id', 'label', 'mark', 'instrument', 'candidateRef', 'riskTags'], path, issues)) return null
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) {
    issues.push(issue(`${path}.id`, 'invalid-id'))
    return null
  }
  if (typeof v.label !== 'string' || v.label.length < 1 || v.label.length > 80) {
    issues.push(issue(`${path}.label`, 'invalid-label'))
    return null
  }
  const mark = parseMark(v.mark, `${path}.mark`, issues, today)
  if (!mark) return null
  const instrument = parseInstrument(v.instrument, `${path}.instrument`, issues)
  if (instrument === undefined) return null
  const candidateRef = parseInstrument(v.candidateRef, `${path}.candidateRef`, issues)
  if (candidateRef === undefined) return null
  const riskTags = parseRiskTags(v.riskTags, `${path}.riskTags`, issues)
  if (!riskTags) return null
  return { id: v.id, label: v.label, mark, instrument, candidateRef, riskTags }
}

function sequenceDates(anchor: string, intervalMonths: 1 | 3 | 6, dates: string[], path: string, issues: ValidationIssue[]): boolean {
  const allowed = new Set<string>()
  for (let k = 0; k < 2000; k++) allowed.add(addMonths(anchor, k * intervalMonths))
  for (const d of dates) {
    if (!allowed.has(d)) {
      issues.push(issue(path, 'date-not-on-sequence'))
      return false
    }
  }
  return true
}

function parsePlanReview(v: unknown, path: string, issues: ValidationIssue[]): PlanReview | null {
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-review'))
    return null
  }
  if (!expectKeys(v, ['id', 'anchor', 'intervalMonths', 'completedDates', 'calendarSequence', 'mode'], path, issues)) return null
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) {
    issues.push(issue(`${path}.id`, 'invalid-id'))
    return null
  }
  if (!isAnchorDay(v.anchor)) {
    issues.push(issue(`${path}.anchor`, 'invalid-anchor'))
    return null
  }
  if (v.intervalMonths !== 3 && v.intervalMonths !== 6) {
    issues.push(issue(`${path}.intervalMonths`, 'invalid-interval'))
    return null
  }
  if (!Array.isArray(v.completedDates) || v.completedDates.length > 200 || !v.completedDates.every(isDay)) {
    issues.push(issue(`${path}.completedDates`, 'invalid-dates'))
    return null
  }
  const completedDates = [...new Set(v.completedDates as string[])].sort()
  if (
    typeof v.calendarSequence !== 'number' ||
    !Number.isInteger(v.calendarSequence) ||
    v.calendarSequence < 0 ||
    v.calendarSequence > 10000
  ) {
    issues.push(issue(`${path}.calendarSequence`, 'invalid-sequence'))
    return null
  }
  if (v.mode !== 'calendar-check-band-act' && v.mode !== 'calendar-rebalance') {
    issues.push(issue(`${path}.mode`, 'invalid-enum'))
    return null
  }
  if (!sequenceDates(v.anchor, v.intervalMonths, completedDates, `${path}.completedDates`, issues)) return null
  return {
    id: v.id,
    anchor: v.anchor,
    intervalMonths: v.intervalMonths,
    completedDates,
    calendarSequence: v.calendarSequence,
    mode: v.mode,
  }
}

function parseContribution(v: unknown, path: string, issues: ValidationIssue[]): Contribution | null {
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-contribution'))
    return null
  }
  if (!expectKeys(v, ['id', 'label', 'amount', 'intervalMonths', 'anchor', 'enabled', 'acknowledgedDates'], path, issues)) return null
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) {
    issues.push(issue(`${path}.id`, 'invalid-id'))
    return null
  }
  if (typeof v.label !== 'string' || v.label.length < 1 || v.label.length > 80) {
    issues.push(issue(`${path}.label`, 'invalid-label'))
    return null
  }
  const amount = parseMoney(v.amount, `${path}.amount`, issues)
  if (!amount) return null
  if (v.intervalMonths !== 1 && v.intervalMonths !== 3) {
    issues.push(issue(`${path}.intervalMonths`, 'invalid-interval'))
    return null
  }
  if (!isAnchorDay(v.anchor)) {
    issues.push(issue(`${path}.anchor`, 'invalid-anchor'))
    return null
  }
  if (typeof v.enabled !== 'boolean') {
    issues.push(issue(`${path}.enabled`, 'invalid-boolean'))
    return null
  }
  if (!Array.isArray(v.acknowledgedDates) || v.acknowledgedDates.length > 200 || !v.acknowledgedDates.every(isDay)) {
    issues.push(issue(`${path}.acknowledgedDates`, 'invalid-dates'))
    return null
  }
  const acknowledgedDates = [...new Set(v.acknowledgedDates as string[])].sort()
  if (!sequenceDates(v.anchor, v.intervalMonths, acknowledgedDates, `${path}.acknowledgedDates`, issues)) return null
  return {
    id: v.id,
    label: v.label,
    amount,
    intervalMonths: v.intervalMonths,
    anchor: v.anchor,
    enabled: v.enabled,
    acknowledgedDates,
  }
}

function parseSnapshot(v: unknown, path: string, issues: ValidationIssue[], today?: Day): CheckSnapshot | null {
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-snapshot'))
    return null
  }
  if (!expectKeys(v, ['funding', 'core', 'coreTotalOnly', 'research', 'researchTotalOnly', 'reserve'], path, issues)) return null
  const funding = parseBudget(v.funding, `${path}.funding`, issues)
  if (!funding) return null
  if (!Array.isArray(v.core) || !Array.isArray(v.research)) {
    issues.push(issue(path, 'invalid-snapshot-arrays'))
    return null
  }
  if (v.core.length + v.research.length > 200) {
    issues.push(issue(path, 'too-many-rows'))
    return null
  }
  const core: Allocation[] = []
  for (let i = 0; i < v.core.length; i++) {
    const row = parseAllocation(v.core[i], `${path}.core[${i}]`, issues, today)
    if (!row) return null
    core.push(row)
  }
  const research: ResearchPosition[] = []
  for (let i = 0; i < v.research.length; i++) {
    const row = parseResearch(v.research[i], `${path}.research[${i}]`, issues, today)
    if (!row) return null
    research.push(row)
  }
  const coreTotalOnly = v.coreTotalOnly === null ? null : parseMark(v.coreTotalOnly, `${path}.coreTotalOnly`, issues, today)
  if (v.coreTotalOnly !== null && !coreTotalOnly) return null
  const researchTotalOnly = v.researchTotalOnly === null ? null : parseMark(v.researchTotalOnly, `${path}.researchTotalOnly`, issues, today)
  if (v.researchTotalOnly !== null && !researchTotalOnly) return null
  const reserve = parseMark(v.reserve, `${path}.reserve`, issues, today)
  if (!reserve) return null
  return { funding, core, coreTotalOnly, research, researchTotalOnly, reserve }
}

function parseHistory(v: unknown, path: string, issues: ValidationIssue[], today?: Day): ReviewRecord | null {
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-history'))
    return null
  }
  if (
    !expectKeys(
      v,
      ['id', 'scheduleId', 'scheduledDate', 'checkedAt', 'asOf', 'outcome', 'note', 'snapshot'],
      path,
      issues,
    )
  )
    return null
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) {
    issues.push(issue(`${path}.id`, 'invalid-id'))
    return null
  }
  if (v.scheduleId !== null && (typeof v.scheduleId !== 'string' || !ID_RE.test(v.scheduleId))) {
    issues.push(issue(`${path}.scheduleId`, 'invalid-id'))
    return null
  }
  if (v.scheduledDate !== null && !isDay(v.scheduledDate)) {
    issues.push(issue(`${path}.scheduledDate`, 'invalid-day'))
    return null
  }
  if (!isInstant(v.checkedAt)) {
    issues.push(issue(`${path}.checkedAt`, 'invalid-instant'))
    return null
  }
  if (!isDay(v.asOf)) {
    issues.push(issue(`${path}.asOf`, 'invalid-day'))
    return null
  }
  if (today && (v.asOf as string) > today) {
    issues.push(issue(`${path}.asOf`, 'asOf-future'))
    return null
  }
  if (!OUTCOMES.includes(v.outcome as (typeof OUTCOMES)[number])) {
    issues.push(issue(`${path}.outcome`, 'invalid-enum'))
    return null
  }
  if (typeof v.note !== 'string' || v.note.length > 1000) {
    issues.push(issue(`${path}.note`, 'invalid-note'))
    return null
  }
  const snapshot = parseSnapshot(v.snapshot, `${path}.snapshot`, issues, today)
  if (!snapshot) return null
  return {
    id: v.id,
    scheduleId: v.scheduleId as string | null,
    scheduledDate: v.scheduledDate as string | null,
    checkedAt: v.checkedAt,
    asOf: v.asOf,
    outcome: v.outcome as ReviewRecord['outcome'],
    note: v.note,
    snapshot,
  }
}

function parseAnnual(v: unknown, path: string, issues: ValidationIssue[]): AnnualReview | null {
  if (!isObj(v)) {
    issues.push(issue(path, 'invalid-annual'))
    return null
  }
  if (!expectKeys(v, ['id', 'year', 'at', 'followedRules', 'changedNeeds', 'nextVerification'], path, issues)) return null
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) {
    issues.push(issue(`${path}.id`, 'invalid-id'))
    return null
  }
  if (typeof v.year !== 'number' || !Number.isInteger(v.year) || v.year < 1900 || v.year > 2200) {
    issues.push(issue(`${path}.year`, 'invalid-year'))
    return null
  }
  if (!isInstant(v.at)) {
    issues.push(issue(`${path}.at`, 'invalid-instant'))
    return null
  }
  for (const f of ['followedRules', 'changedNeeds', 'nextVerification'] as const) {
    if (typeof v[f] !== 'string' || (v[f] as string).length > 1000) {
      issues.push(issue(`${path}.${f}`, 'invalid-text'))
      return null
    }
  }
  return {
    id: v.id,
    year: v.year,
    at: v.at,
    followedRules: v.followedRules as string,
    changedNeeds: v.changedNeeds as string,
    nextVerification: v.nextVerification as string,
  }
}

function uniqueIds(ids: string[], path: string, issues: ValidationIssue[]): boolean {
  if (new Set(ids).size !== ids.length) {
    issues.push(issue(path, 'duplicate-id'))
    return false
  }
  return true
}

export type ParsePlanResult = { ok: true; value: PlanDocument } | { ok: false; issues: ValidationIssue[] }

/**
 * 解析 PlanDocument。可接受 unknown 或原始 JSON 字符串（先限长再 parse）。
 * 未知 schema/字段拒绝；不 `as PlanDocument`。
 */
export function parsePlanDocument(input: unknown, today?: Day): ParsePlanResult {
  const issues: ValidationIssue[] = []

  let raw: unknown = input
  if (typeof input === 'string') {
    if (utf8Len(input) > MAX_PLAN_BYTES) {
      return { ok: false, issues: [issue('$', 'payload-too-large')] }
    }
    try {
      raw = JSON.parse(input) as unknown
    } catch {
      return { ok: false, issues: [issue('$', 'invalid-json')] }
    }
  } else if (isObj(input)) {
    // 对象已 parse：再查序列化体积
    try {
      if (utf8Len(JSON.stringify(input)) > MAX_PLAN_BYTES) {
        return { ok: false, issues: [issue('$', 'payload-too-large')] }
      }
    } catch {
      return { ok: false, issues: [issue('$', 'invalid-json')] }
    }
  }

  if (!isObj(raw)) return { ok: false, issues: [issue('$', 'not-object')] }
  if (raw.schemaVersion !== 1) return { ok: false, issues: [issue('schemaVersion', 'unsupported-schema')] }

  const topKeys = [
    'schemaVersion',
    'id',
    'localRevision',
    'createdAt',
    'updatedAt',
    'wizard',
    'assessment',
    'funding',
    'limits',
    'core',
    'coreTotalOnly',
    'research',
    'researchTotalOnly',
    'researchCompleteAt',
    'review',
    'contributions',
    'history',
    'annualReviews',
    'migration',
    'notifications',
  ] as const
  if (!expectKeys(raw, topKeys, '$', issues)) return { ok: false, issues }

  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) issues.push(issue('id', 'invalid-id'))
  if (
    typeof raw.localRevision !== 'number' ||
    !Number.isInteger(raw.localRevision) ||
    raw.localRevision < 1 ||
    !Number.isSafeInteger(raw.localRevision)
  ) {
    issues.push(issue('localRevision', 'invalid-revision'))
  }
  if (!isInstant(raw.createdAt)) issues.push(issue('createdAt', 'invalid-instant'))
  if (!isInstant(raw.updatedAt)) issues.push(issue('updatedAt', 'invalid-instant'))

  if (!isObj(raw.wizard) || !expectKeys(raw.wizard, ['nextStep', 'completed', 'skippedSteps'], 'wizard', issues)) {
    return { ok: false, issues: issues.length ? issues : [issue('wizard', 'invalid')] }
  }
  const step = raw.wizard.nextStep
  if (step !== 1 && step !== 2 && step !== 3 && step !== 4) issues.push(issue('wizard.nextStep', 'invalid-step'))
  if (typeof raw.wizard.completed !== 'boolean') issues.push(issue('wizard.completed', 'invalid-boolean'))
  if (
    !Array.isArray(raw.wizard.skippedSteps) ||
    !raw.wizard.skippedSteps.every((s: unknown) => s === 1 || s === 2 || s === 3 || s === 4)
  ) {
    issues.push(issue('wizard.skippedSteps', 'invalid-steps'))
  }

  let assessment: PlanDocument['assessment'] = null
  if (raw.assessment !== null) {
    if (!isObj(raw.assessment) || !expectKeys(raw.assessment, ['questionnaireVersion', 'rulesVersion', 'answers', 'assessedAt', 'selectedRoute', 'importedAt'], 'assessment', issues)) {
      return { ok: false, issues }
    }
    const a = raw.assessment
    if (typeof a.questionnaireVersion !== 'number' || !Number.isInteger(a.questionnaireVersion) || a.questionnaireVersion < 1) {
      issues.push(issue('assessment.questionnaireVersion', 'invalid-version'))
    }
    if (typeof a.rulesVersion !== 'number' || !Number.isInteger(a.rulesVersion) || a.rulesVersion < 1) {
      issues.push(issue('assessment.rulesVersion', 'invalid-version'))
    }
    const answers: Answers = sanitizeAnswers(a.answers)
    if (a.assessedAt !== null && !isInstant(a.assessedAt)) issues.push(issue('assessment.assessedAt', 'invalid-instant'))
    if (a.selectedRoute !== null && !ROUTES.includes(a.selectedRoute as Route)) {
      issues.push(issue('assessment.selectedRoute', 'invalid-route'))
    }
    if (!isInstant(a.importedAt)) issues.push(issue('assessment.importedAt', 'invalid-instant'))
    if (issues.length === 0) {
      assessment = {
        questionnaireVersion: a.questionnaireVersion as number,
        rulesVersion: a.rulesVersion as number,
        answers,
        assessedAt: a.assessedAt as Instant | null,
        selectedRoute: a.selectedRoute as Route | null,
        importedAt: a.importedAt as Instant,
      }
    }
  }

  if (!isObj(raw.funding)) {
    issues.push(issue('funding', 'invalid'))
    return { ok: false, issues }
  }
  if (
    !expectKeys(
      raw.funding,
      [
        'monthlyNecessaryExpense',
        'emergencyMonths',
        'recentNeedAmount',
        'earliestUse',
        'highInterestDebt',
        'budgets',
        'reserveActual',
        'legacyAnnualExpense',
      ],
      'funding',
      issues,
    )
  ) {
    return { ok: false, issues }
  }
  const f = raw.funding
  const monthlyNecessaryExpense = f.monthlyNecessaryExpense === null ? null : parseMoney(f.monthlyNecessaryExpense, 'funding.monthlyNecessaryExpense', issues)
  if (f.monthlyNecessaryExpense !== null && !monthlyNecessaryExpense) return { ok: false, issues }
  if (
    f.emergencyMonths !== null &&
    !(typeof f.emergencyMonths === 'number' && Number.isInteger(f.emergencyMonths) && f.emergencyMonths >= 1 && f.emergencyMonths <= 60)
  ) {
    issues.push(issue('funding.emergencyMonths', 'invalid-months'))
  }
  const recentNeedAmount = f.recentNeedAmount === null ? null : parseMoney(f.recentNeedAmount, 'funding.recentNeedAmount', issues)
  if (f.recentNeedAmount !== null && !recentNeedAmount) return { ok: false, issues }
  if (f.earliestUse !== null && !EARLIEST.includes(f.earliestUse as (typeof EARLIEST)[number])) {
    issues.push(issue('funding.earliestUse', 'invalid-enum'))
  }
  if (f.highInterestDebt !== null && typeof f.highInterestDebt !== 'boolean') {
    issues.push(issue('funding.highInterestDebt', 'invalid-boolean'))
  }
  const budgets = parseBudget(f.budgets, 'funding.budgets', issues)
  if (!budgets) return { ok: false, issues }
  const reserveActual = parseMark(f.reserveActual, 'funding.reserveActual', issues, today)
  if (!reserveActual) return { ok: false, issues }
  const legacyAnnualExpense = f.legacyAnnualExpense === null ? null : parseMoney(f.legacyAnnualExpense, 'funding.legacyAnnualExpense', issues)
  if (f.legacyAnnualExpense !== null && !legacyAnnualExpense) return { ok: false, issues }

  if (!isObj(raw.limits) || !expectKeys(raw.limits, ['researchCapBps', 'singleStockCapBps', 'confirmedAt', 'increaseAcknowledgedAt'], 'limits', issues)) {
    return { ok: false, issues }
  }
  const lim = raw.limits
  if (
    lim.researchCapBps !== null &&
    !(typeof lim.researchCapBps === 'number' && Number.isInteger(lim.researchCapBps) && lim.researchCapBps >= 0 && lim.researchCapBps <= 2000)
  ) {
    issues.push(issue('limits.researchCapBps', 'invalid-bps'))
  }
  if (
    lim.singleStockCapBps !== null &&
    !(typeof lim.singleStockCapBps === 'number' && Number.isInteger(lim.singleStockCapBps) && lim.singleStockCapBps >= 1 && lim.singleStockCapBps <= 10000)
  ) {
    issues.push(issue('limits.singleStockCapBps', 'invalid-bps'))
  }
  if (lim.confirmedAt !== null && !isInstant(lim.confirmedAt)) issues.push(issue('limits.confirmedAt', 'invalid-instant'))
  if (lim.increaseAcknowledgedAt !== null && !isInstant(lim.increaseAcknowledgedAt)) {
    issues.push(issue('limits.increaseAcknowledgedAt', 'invalid-instant'))
  }
  if (
    typeof lim.researchCapBps === 'number' &&
    lim.researchCapBps > 500 &&
    lim.increaseAcknowledgedAt === null
  ) {
    // 提高主动上限至>500须两项本人声明并保存 increaseAcknowledgedAt——校验层要求有确认时刻
    issues.push(issue('limits.increaseAcknowledgedAt', 'required-for-high-cap'))
  }

  if (!Array.isArray(raw.core) || !Array.isArray(raw.research)) {
    issues.push(issue('core', 'invalid-array'))
    return { ok: false, issues }
  }
  if (raw.core.length + raw.research.length > 200) {
    issues.push(issue('core', 'too-many-rows'))
    return { ok: false, issues }
  }
  const core: Allocation[] = []
  for (let i = 0; i < raw.core.length; i++) {
    const row = parseAllocation(raw.core[i], `core[${i}]`, issues, today)
    if (!row) return { ok: false, issues }
    core.push(row)
  }
  const research: ResearchPosition[] = []
  for (let i = 0; i < raw.research.length; i++) {
    const row = parseResearch(raw.research[i], `research[${i}]`, issues, today)
    if (!row) return { ok: false, issues }
    research.push(row)
  }
  if (!uniqueIds(core.map(c => c.id), 'core', issues)) return { ok: false, issues }
  if (!uniqueIds(research.map(c => c.id), 'research', issues)) return { ok: false, issues }

  const coreTotalOnly = raw.coreTotalOnly === null ? null : parseMark(raw.coreTotalOnly, 'coreTotalOnly', issues, today)
  if (raw.coreTotalOnly !== null && !coreTotalOnly) return { ok: false, issues }
  if (core.length > 0 && coreTotalOnly !== null) {
    issues.push(issue('coreTotalOnly', 'mutex-with-core'))
    return { ok: false, issues }
  }
  const researchTotalOnly = raw.researchTotalOnly === null ? null : parseMark(raw.researchTotalOnly, 'researchTotalOnly', issues, today)
  if (raw.researchTotalOnly !== null && !researchTotalOnly) return { ok: false, issues }
  if (research.length > 0 && researchTotalOnly !== null) {
    issues.push(issue('researchTotalOnly', 'mutex-with-research'))
    return { ok: false, issues }
  }
  if (raw.researchCompleteAt !== null && !isInstant(raw.researchCompleteAt)) {
    issues.push(issue('researchCompleteAt', 'invalid-instant'))
  }

  const review = raw.review === null ? null : parsePlanReview(raw.review, 'review', issues)
  if (raw.review !== null && !review) return { ok: false, issues }

  if (!Array.isArray(raw.contributions) || raw.contributions.length > 30) {
    issues.push(issue('contributions', 'too-many'))
    return { ok: false, issues }
  }
  const contributions: Contribution[] = []
  for (let i = 0; i < raw.contributions.length; i++) {
    const row = parseContribution(raw.contributions[i], `contributions[${i}]`, issues)
    if (!row) return { ok: false, issues }
    contributions.push(row)
  }
  if (!uniqueIds(contributions.map(c => c.id), 'contributions', issues)) return { ok: false, issues }

  if (!Array.isArray(raw.history) || raw.history.length > 100) {
    issues.push(issue('history', 'too-many'))
    return { ok: false, issues }
  }
  const history: ReviewRecord[] = []
  for (let i = 0; i < raw.history.length; i++) {
    const row = parseHistory(raw.history[i], `history[${i}]`, issues, today)
    if (!row) return { ok: false, issues }
    history.push(row)
  }

  if (!Array.isArray(raw.annualReviews) || raw.annualReviews.length > 20) {
    issues.push(issue('annualReviews', 'too-many'))
    return { ok: false, issues }
  }
  const annualReviews: AnnualReview[] = []
  for (let i = 0; i < raw.annualReviews.length; i++) {
    const row = parseAnnual(raw.annualReviews[i], `annualReviews[${i}]`, issues)
    if (!row) return { ok: false, issues }
    annualReviews.push(row)
  }
  const allIds = [...history.map(h => h.id), ...annualReviews.map(a => a.id)]
  if (!uniqueIds(allIds, 'history+annualReviews', issues)) return { ok: false, issues }

  let migration: PlanDocument['migration'] = null
  if (raw.migration !== null) {
    if (!isObj(raw.migration) || !expectKeys(raw.migration, ['confirmedAt', 'legacy', 'start'], 'migration', issues)) {
      return { ok: false, issues }
    }
    const migrationRaw = raw.migration as Record<string, unknown>
    if (!isInstant(migrationRaw.confirmedAt)) issues.push(issue('migration.confirmedAt', 'invalid-instant'))
    const parseSrc = (key: 'legacy' | 'start'): { fingerprint: string; imported: boolean } | null => {
      const src = migrationRaw[key]
      if (src === null) return null
      if (!isObj(src) || !expectKeys(src, ['fingerprint', 'imported'], `migration.${key}`, issues)) return null
      if (typeof src.fingerprint !== 'string' || src.fingerprint.length < 1 || src.fingerprint.length > 128) {
        issues.push(issue(`migration.${key}.fingerprint`, 'invalid'))
        return null
      }
      if (typeof src.imported !== 'boolean') {
        issues.push(issue(`migration.${key}.imported`, 'invalid-boolean'))
        return null
      }
      return { fingerprint: src.fingerprint, imported: src.imported }
    }
    const legacy = parseSrc('legacy')
    const start = parseSrc('start')
    if (issues.some(i => i.path.startsWith('migration'))) return { ok: false, issues }
    migration = {
      confirmedAt: migrationRaw.confirmedAt as Instant,
      legacy,
      start,
    }
  }

  if (!isObj(raw.notifications) || !expectKeys(raw.notifications, ['ownerWeeklyEnabled'], 'notifications', issues)) {
    return { ok: false, issues }
  }
  if (typeof raw.notifications.ownerWeeklyEnabled !== 'boolean') {
    issues.push(issue('notifications.ownerWeeklyEnabled', 'invalid-boolean'))
  }

  if (issues.length) return { ok: false, issues }

  const value: PlanDocument = {
    schemaVersion: 1,
    id: raw.id as string,
    localRevision: raw.localRevision as number,
    createdAt: raw.createdAt as Instant,
    updatedAt: raw.updatedAt as Instant,
    wizard: {
      nextStep: raw.wizard.nextStep as 1 | 2 | 3 | 4,
      completed: raw.wizard.completed as boolean,
      skippedSteps: [...(raw.wizard.skippedSteps as (1 | 2 | 3 | 4)[])],
    },
    assessment,
    funding: {
      monthlyNecessaryExpense,
      emergencyMonths: f.emergencyMonths as number | null,
      recentNeedAmount,
      earliestUse: f.earliestUse as PlanDocument['funding']['earliestUse'],
      highInterestDebt: f.highInterestDebt as boolean | null,
      budgets,
      reserveActual,
      legacyAnnualExpense,
    },
    limits: {
      researchCapBps: lim.researchCapBps as number | null,
      singleStockCapBps: lim.singleStockCapBps as number | null,
      confirmedAt: lim.confirmedAt as Instant | null,
      increaseAcknowledgedAt: lim.increaseAcknowledgedAt as Instant | null,
    },
    core,
    coreTotalOnly,
    research,
    researchTotalOnly,
    researchCompleteAt: raw.researchCompleteAt as Instant | null,
    review,
    contributions,
    history,
    annualReviews,
    migration,
    notifications: { ownerWeeklyEnabled: raw.notifications.ownerWeeklyEnabled as boolean },
  }
  return { ok: true, value }
}
