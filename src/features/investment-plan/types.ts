// PlanDocument v1：唯一领域契约（docs/reviews/2026-11-14-my-plan-spec.md §3）。
// Day / Answers / Route 复用 invest-start，不另定义冲突名。
import type { Answers, Day, Route } from '../invest-start/types'
import type { Money, Yuan } from './money'

export type { Answers, Day, Route, Money, Yuan }
export type Instant = string // YYYY-MM-DDTHH:mm:ss.sssZ

export type Mark = {
  value: Money | null
  asOf: Day | null
  source: 'manual' | 'legacy'
  verifiedAt: Instant | null
}

export type Budget = {
  core: Money | null
  research: Money | null
  reserve: Money | null
  confirmedAt: Instant | null
}

export type PlanReview = {
  id: string
  anchor: Day
  intervalMonths: 3 | 6
  completedDates: Day[]
  calendarSequence: number
  mode: 'calendar-check-band-act' | 'calendar-rebalance'
}

export type Allocation = {
  id: string
  label: string
  targetBps: number | null
  relativeBandBps: number | null
  mark: Mark
  riskTags: string[]
}

export type ResearchPosition = {
  id: string
  label: string
  mark: Mark
  instrument: { market: 'cn' | 'hk' | 'us'; code: string } | null
  candidateRef: { market: 'cn' | 'hk' | 'us'; code: string } | null
  riskTags: string[]
}

export type Contribution = {
  id: string
  label: string
  amount: Money
  intervalMonths: 1 | 3
  anchor: Day
  enabled: boolean
  acknowledgedDates: Day[]
}

export type CheckSnapshot = {
  funding: Budget
  core: Allocation[]
  coreTotalOnly: Mark | null
  research: ResearchPosition[]
  researchTotalOnly: Mark | null
  reserve: Mark
}

export type ReviewRecord = {
  id: string
  scheduleId: string | null
  scheduledDate: Day | null
  checkedAt: Instant
  asOf: Day
  outcome: 'no-action' | 'cashflow' | 'adjusted' | 'deferred'
  note: string
  snapshot: CheckSnapshot
}

export type AnnualReview = {
  id: string
  year: number
  at: Instant
  followedRules: string
  changedNeeds: string
  nextVerification: string
}

export interface PlanDocument {
  schemaVersion: 1
  id: string
  localRevision: number
  createdAt: Instant
  updatedAt: Instant
  wizard: {
    nextStep: 1 | 2 | 3 | 4
    completed: boolean
    skippedSteps: (1 | 2 | 3 | 4)[]
  }
  assessment: {
    questionnaireVersion: number
    rulesVersion: number
    answers: Answers
    assessedAt: Instant | null
    selectedRoute: Route | null
    importedAt: Instant
  } | null
  funding: {
    monthlyNecessaryExpense: Money | null
    emergencyMonths: number | null
    recentNeedAmount: Money | null
    earliestUse: 'under-3y' | '3-to-5y' | '5y-plus' | null
    highInterestDebt: boolean | null
    budgets: Budget
    reserveActual: Mark
    legacyAnnualExpense: Money | null
  }
  limits: {
    researchCapBps: number | null
    singleStockCapBps: number | null
    confirmedAt: Instant | null
    increaseAcknowledgedAt: Instant | null
  }
  core: Allocation[]
  coreTotalOnly: Mark | null
  research: ResearchPosition[]
  researchTotalOnly: Mark | null
  researchCompleteAt: Instant | null
  review: PlanReview | null
  contributions: Contribution[]
  history: ReviewRecord[]
  annualReviews: AnnualReview[]
  migration: {
    confirmedAt: Instant
    legacy: { fingerprint: string; imported: boolean } | null
    start: { fingerprint: string; imported: boolean } | null
  } | null
  notifications: { ownerWeeklyEnabled: boolean }
}

export type ValidationIssue = { path: string; code: string }

export const PLAN_KEYS = {
  document: 'businessweb:investment-plan:v1',
  sync: 'businessweb:investment-plan:sync:v1',
  conflict: 'businessweb:investment-plan:conflict:v1',
  imports: 'businessweb:investment-plan:imports:v1',
} as const

export const MAX_PLAN_BYTES = 262144
export const DEFAULT_RELATIVE_BAND_BPS = 2500

export function createEmptyPlan(now: Instant, id: string): PlanDocument {
  const emptyMark: Mark = { value: null, asOf: null, source: 'manual', verifiedAt: null }
  return {
    schemaVersion: 1,
    id,
    localRevision: 1,
    createdAt: now,
    updatedAt: now,
    wizard: { nextStep: 1, completed: false, skippedSteps: [] },
    assessment: null,
    funding: {
      monthlyNecessaryExpense: null,
      emergencyMonths: null,
      recentNeedAmount: null,
      earliestUse: null,
      highInterestDebt: null,
      budgets: { core: null, research: null, reserve: null, confirmedAt: null },
      reserveActual: { ...emptyMark },
      legacyAnnualExpense: null,
    },
    limits: {
      researchCapBps: null,
      singleStockCapBps: null,
      confirmedAt: null,
      increaseAcknowledgedAt: null,
    },
    core: [],
    coreTotalOnly: null,
    research: [],
    researchTotalOnly: null,
    researchCompleteAt: null,
    review: null,
    contributions: [],
    history: [],
    annualReviews: [],
    migration: null,
    notifications: { ownerWeeklyEnabled: false },
  }
}
