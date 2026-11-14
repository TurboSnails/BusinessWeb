// 一次性迁移：预览后本人确认；永不回写/删除 plan2026:* 与 start:v1。
import {
  LEGACY_CASHFLOW_KEY,
  LEGACY_KEYS,
  fingerprintOf,
  readLegacyPlan,
  type LegacyRow,
  type LegacySummary,
} from '../invest-start/legacyPlan'
import { evaluate } from '../invest-start/recommend'
import { loadStart, START_KEY } from '../invest-start/store'
import { QUESTIONNAIRE_VERSION, RULES_VERSION } from '../invest-start/types'
import { annualWanToMonthlyYuan, fenToYuan, moneyCny, percentToBps, wanToYuan, yuanToFen } from './money'
import type { PlanRepository, StorageLike } from './repository'
import { loadImportsReceipt, writeImportsReceipt } from './repository'
import type { Allocation, Day, Instant, Mark, Money, PlanDocument } from './types'
import { createEmptyPlan, DEFAULT_RELATIVE_BAND_BPS } from './types'
import { parsePlanDocument } from './validation'

export type MigrationIssue = { path: string; code: string; message: string }

export type LegacyBudgetCandidate = {
  core: Money
  research: Money
  reserve: Money
  totalYuan: Money
  roundingNote: string | null
}

export type MigrationChoices = {
  /** 必须含「这是我的记录…」确认 */
  ownershipConfirmed: boolean
  importLegacyTotalSplit: boolean
  importLegacyCap: boolean
  importLegacyHoldings: boolean
  importLegacyCashflowExpense: boolean
  /** 作为 reserveActual 导入；不覆盖预算 */
  importLegacyCashflowReserve: boolean
  importStartAssessment: boolean
  importStartReview: boolean
  importStartResearchCap: boolean
  /** 本人选择沿用推导路线 */
  selectDerivedRoute: boolean
  now: Instant
  id: string
  today: Day
}

export type MigrationPreview = {
  today: Day
  legacy: LegacySummary
  legacyRawFingerprint: string
  start: {
    status: 'missing' | 'unavailable' | 'corrupt' | 'ok'
    fingerprint: string
    questionnaireVersion: number | null
    rulesVersion: number | null
    questionnaireChanged: boolean
    hasAnswers: boolean
    derivedRoute: string | null
    researchCapBps: number | null
    reviewOk: boolean
    reviewIssue: string | null
    assessedAt: string | null
  }
  cashflow: {
    status: 'not-requested' | 'missing' | 'invalid' | 'ok'
    expense?: { annualYuan: Money; monthlyYuan: Money; rounded: boolean }
    reserve?: { value: Money }
    reserveVsBudgetNote: string | null
    rawFingerprint: string | null
  }
  candidates: {
    budgets: LegacyBudgetCandidate | null
    budgetsBlockedReason: string | null
    singleStockCapBps: number | null
    holdings: Allocation[]
    holdingsSkipped: { index: number; reason: string }[]
    sameAsDefaultNote: string[]
  }
  importsReceipt: { legacyConsumed: boolean; startConsumed: boolean } | 'missing' | 'corrupt' | 'unavailable'
  issues: MigrationIssue[]
  /** 含 cashflow（若展开）与 start 指纹 */
  combinedFingerprint: string
}

type StorageRW = StorageLike

function rawFingerprint(storage: StorageRW | null, keys: string[]): string {
  const parts: Record<string, string | null> = {}
  for (const k of keys) {
    try {
      parts[k] = storage?.getItem(k) ?? null
    } catch {
      parts[k] = null
    }
  }
  return fingerprintOf(parts)
}

function legacyId(raw: string, index: number): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (cleaned.length >= 1 && cleaned.length <= 56 && /^[a-z0-9-]+$/.test(cleaned)) return `legacy-${cleaned}`
  return `legacy-row-${index + 1}`
}

function parseCashflow(
  storage: StorageRW | null,
  include: boolean,
): MigrationPreview['cashflow'] {
  if (!include) {
    return { status: 'not-requested', reserveVsBudgetNote: null, rawFingerprint: null }
  }
  let raw: string | null
  try {
    raw = storage?.getItem(LEGACY_CASHFLOW_KEY) ?? null
  } catch {
    return { status: 'missing', reserveVsBudgetNote: null, rawFingerprint: null }
  }
  if (raw === null) return { status: 'missing', reserveVsBudgetNote: null, rawFingerprint: fingerprintOf(null) }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'invalid', reserveVsBudgetNote: null, rawFingerprint: fingerprintOf(raw) }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { status: 'invalid', reserveVsBudgetNote: null, rawFingerprint: fingerprintOf(raw) }
  }
  const obj = parsed as Record<string, unknown>
  const out: MigrationPreview['cashflow'] = {
    status: 'ok',
    reserveVsBudgetNote: null,
    rawFingerprint: fingerprintOf(raw),
  }
  if (typeof obj.expense === 'string' && obj.expense.trim() !== '') {
    const m = annualWanToMonthlyYuan(obj.expense)
    if (m.ok) {
      out.expense = {
        annualYuan: moneyCny(m.annualYuan),
        monthlyYuan: moneyCny(m.yuan),
        rounded: m.rounded,
      }
    } else {
      out.status = 'invalid'
    }
  }
  if (typeof obj.reserve === 'string' && obj.reserve.trim() !== '') {
    const r = wanToYuan(obj.reserve)
    if (r.ok) out.reserve = { value: moneyCny(r.yuan) }
  }
  return out
}

function buildBudgets(legacy: LegacySummary): {
  budgets: LegacyBudgetCandidate | null
  blocked: string | null
  notes: string[]
} {
  const notes: string[] = []
  if (legacy.total.state === 'default') {
    notes.push('与旧示例相同，请在新计划手填确认')
    return { budgets: null, blocked: 'total-is-default', notes }
  }
  if (legacy.total.state !== 'filled') return { budgets: null, blocked: 'total-missing', notes }
  if (legacy.split.state === 'default') {
    notes.push('默认 split 不能配合填写 total 生成 75/20/5')
    return { budgets: null, blocked: 'split-is-default', notes }
  }
  if (legacy.split.state !== 'filled') return { budgets: null, blocked: 'split-missing', notes }

  const total = wanToYuan(legacy.total.value)
  if (!total.ok) return { budgets: null, blocked: 'total-invalid', notes }
  const base = Number(legacy.split.value.base)
  const active = Number(legacy.split.value.active)
  const tFen = yuanToFen(total.yuan)!
  // 先算 core/research 分，reserve = 总额 − 两项
  const baseBps = Math.round(base * 100)
  const activeBps = Math.round(active * 100)
  const coreFen = (tFen * BigInt(baseBps)) / 10000n
  const researchFen = (tFen * BigInt(activeBps)) / 10000n
  const reserveFen = tFen - coreFen - researchFen
  let roundingNote: string | null = null
  if (coreFen + researchFen + reserveFen !== tFen) roundingNote = '预览显示最多1分舍入差'
  if (total.rounded) roundingNote = (roundingNote ? `${roundingNote}；` : '') + '万元换算有分位舍入'

  return {
    budgets: {
      core: moneyCny(fenToYuan(coreFen)),
      research: moneyCny(fenToYuan(researchFen)),
      reserve: moneyCny(fenToYuan(reserveFen)),
      totalYuan: moneyCny(total.yuan),
      roundingNote,
    },
    blocked: null,
    notes,
  }
}

function mapHoldings(rows: LegacyRow[]): {
  holdings: Allocation[]
  skipped: { index: number; reason: string }[]
} {
  const holdings: Allocation[] = []
  const skipped: { index: number; reason: string }[] = []
  rows.forEach((row, index) => {
    const amountTrim = row.amount.trim()
    if (amountTrim === '') {
      skipped.push({ index, reason: 'unknown-amount' })
      return
    }
    if (amountTrim.startsWith('-')) {
      skipped.push({ index, reason: 'negative' })
      return
    }
    const yuan = wanToYuan(amountTrim)
    if (!yuan.ok) {
      skipped.push({ index, reason: 'invalid' })
      return
    }
    let targetBps: number | null = null
    let relativeBandBps: number | null = null
    const t = percentToBps(row.target)
    if (t.ok && t.bps >= 1) targetBps = t.bps
    const b = percentToBps(row.band)
    if (b.ok && b.bps >= 1) relativeBandBps = b.bps
    else if (targetBps !== null) relativeBandBps = DEFAULT_RELATIVE_BAND_BPS

    const mark: Mark = {
      value: moneyCny(yuan.yuan),
      asOf: null,
      source: 'legacy',
      verifiedAt: null,
    }
    const label = row.name.trim().slice(0, 80) || `类别${index + 1}`
    holdings.push({
      id: legacyId(row.id, index),
      label,
      targetBps,
      relativeBandBps,
      mark,
      riskTags: [],
    })
  })
  return { holdings, skipped }
}

export function buildMigrationPreview(
  storage: StorageRW | null,
  today: Day,
  options?: { includeCashflow?: boolean },
): MigrationPreview {
  const legacy = readLegacyPlan(storage)
  const legacyRawFingerprint = rawFingerprint(storage, Object.values(LEGACY_KEYS))
  const startLoad = loadStart(storage)
  const issues: MigrationIssue[] = []

  let startFpPayload: unknown = null
  const startInfo: MigrationPreview['start'] = {
    status:
      startLoad.mode === 'ok'
        ? 'ok'
        : startLoad.mode === 'empty'
          ? 'missing'
          : startLoad.mode,
    fingerprint: fingerprintOf(null),
    questionnaireVersion: null,
    rulesVersion: null,
    questionnaireChanged: false,
    hasAnswers: false,
    derivedRoute: null,
    researchCapBps: null,
    reviewOk: false,
    reviewIssue: null,
    assessedAt: null,
  }

  if (startLoad.mode === 'ok' && startLoad.state) {
    const st = startLoad.state
    startInfo.questionnaireVersion = st.questionnaireVersion
    startInfo.rulesVersion = st.rulesVersion
    startInfo.questionnaireChanged = startLoad.questionnaireChanged
    startInfo.hasAnswers = Object.keys(st.answers).length > 0
    startInfo.assessedAt = st.assessedAt ?? null
    startInfo.researchCapBps = st.userResearchCapBps ?? null
    if (startLoad.questionnaireChanged) {
      issues.push({ path: 'start.answers', code: 'questionnaire-changed', message: '旧题目不能按新题解释，请重做' })
    }
    if (st.rulesVersion < RULES_VERSION) {
      issues.push({ path: 'start.rulesVersion', code: 'rules-outdated', message: '规则版本过旧，请重做' })
    }
    if (st.review) {
      startInfo.reviewOk = true
    } else if ((st as { review?: unknown }).review !== undefined) {
      startInfo.reviewIssue = 'review-unparsed'
      issues.push({ path: 'start.review', code: 'review-invalid', message: '检查日记录无法迁入' })
    }
    const result = evaluate(st.answers)
    if (result.status === 'complete' && result.route && st.rulesVersion === RULES_VERSION && !startLoad.questionnaireChanged) {
      startInfo.derivedRoute = result.route
    }
    startFpPayload = {
      v: st.questionnaireVersion,
      r: st.rulesVersion,
      a: st.answers,
      review: st.review ?? null,
      cap: st.userResearchCapBps ?? null,
      assessedAt: st.assessedAt ?? null,
    }
    startInfo.fingerprint = fingerprintOf(startFpPayload)
  } else if (startLoad.mode === 'corrupt') {
    issues.push({ path: 'start', code: 'corrupt', message: 'start:v1 无法识别' })
    try {
      startInfo.fingerprint = fingerprintOf(storage?.getItem(START_KEY) ?? null)
    } catch {
      startInfo.fingerprint = fingerprintOf(null)
    }
  }

  const cashflow = parseCashflow(storage, !!options?.includeCashflow)
  const { budgets, blocked, notes } = buildBudgets(legacy)
  const sameAsDefaultNote = [...notes]
  if (legacy.total.state === 'default' || legacy.split.state === 'default' || legacy.cap.state === 'default') {
    if (!sameAsDefaultNote.includes('与旧示例相同，请在新计划手填确认')) {
      sameAsDefaultNote.push('与旧示例相同，请在新计划手填确认')
    }
  }

  let singleStockCapBps: number | null = null
  if (legacy.cap.state === 'filled') {
    const p = percentToBps(legacy.cap.value)
    if (p.ok) singleStockCapBps = p.bps
    else issues.push({ path: 'legacy.cap', code: 'cap-precision', message: '单只上限精度无法转为整数 bps' })
  }

  let holdings: Allocation[] = []
  let holdingsSkipped: { index: number; reason: string }[] = []
  if (legacy.holdings.state === 'filled') {
    const mapped = mapHoldings(legacy.holdings.value)
    holdings = mapped.holdings
    holdingsSkipped = mapped.skipped
  }

  if (cashflow.status === 'ok' && cashflow.reserve && budgets) {
    if (cashflow.reserve.value.amount !== budgets.reserve.amount) {
      cashflow.reserveVsBudgetNote = '预算/实际余额口径不同，请核对'
    }
  }

  const receipt = loadImportsReceipt(storage)
  if (receipt === 'corrupt' || receipt === 'unavailable') {
    issues.push({ path: 'imports', code: 'receipt-untrusted', message: '导入收据不可用，禁止自动导入，仅显式预览' })
  }

  const combinedFingerprint = fingerprintOf({
    legacy: legacy.fingerprint,
    legacyRaw: legacyRawFingerprint,
    start: startInfo.fingerprint,
    cashflow: cashflow.rawFingerprint,
  })

  return {
    today,
    legacy,
    legacyRawFingerprint,
    start: startInfo,
    cashflow,
    candidates: {
      budgets,
      budgetsBlockedReason: blocked,
      singleStockCapBps,
      holdings,
      holdingsSkipped,
      sameAsDefaultNote,
    },
    importsReceipt: receipt === 'missing' || receipt === 'corrupt' || receipt === 'unavailable'
      ? receipt
      : { legacyConsumed: receipt.legacyConsumed, startConsumed: receipt.startConsumed },
    issues,
    combinedFingerprint,
  }
}

export type ConfirmMigrationResult =
  | { ok: true; document: PlanDocument; persisted: boolean; receiptWritten?: boolean }
  | { ok: false; reason: 'cancelled' | 'ownership' | 'stale' | 'create-failed' | 'invalid'; detail?: string }

export async function confirmMigration(
  preview: MigrationPreview,
  choices: MigrationChoices,
  repository: PlanRepository,
  storage: StorageRW | null,
): Promise<ConfirmMigrationResult> {
  if (!choices.ownershipConfirmed) return { ok: false, reason: 'ownership' }

  // 再次读取源并比对指纹
  const again = buildMigrationPreview(storage, preview.today, {
    includeCashflow: preview.cashflow.status !== 'not-requested',
  })
  if (again.combinedFingerprint !== preview.combinedFingerprint) {
    return { ok: false, reason: 'stale', detail: 'source-changed' }
  }

  const doc = createEmptyPlan(choices.now, choices.id)
  let usedLegacy = false
  let usedStart = false

  if (choices.importLegacyTotalSplit && preview.candidates.budgets) {
    usedLegacy = true
    const b = preview.candidates.budgets
    doc.funding.budgets = {
      core: b.core,
      research: b.research,
      reserve: b.reserve,
      confirmedAt: null,
    }
  }
  if (choices.importLegacyCap && preview.candidates.singleStockCapBps !== null) {
    usedLegacy = true
    doc.limits.singleStockCapBps = preview.candidates.singleStockCapBps
  }
  if (choices.importLegacyHoldings && preview.candidates.holdings.length) {
    usedLegacy = true
    doc.core = preview.candidates.holdings.map(h => ({ ...h, mark: { ...h.mark } }))
  }
  if (choices.importLegacyCashflowExpense && preview.cashflow.expense) {
    usedLegacy = true
    doc.funding.monthlyNecessaryExpense = preview.cashflow.expense.monthlyYuan
    doc.funding.legacyAnnualExpense = preview.cashflow.expense.annualYuan
  }
  if (choices.importLegacyCashflowReserve && preview.cashflow.reserve) {
    usedLegacy = true
    doc.funding.reserveActual = {
      value: preview.cashflow.reserve.value,
      asOf: null,
      source: 'legacy',
      verifiedAt: null,
    }
  }

  if (choices.importStartAssessment && preview.start.status === 'ok') {
    usedStart = true
    const startLoad = loadStart(storage)
    if (startLoad.mode === 'ok' && startLoad.state) {
      doc.assessment = {
        questionnaireVersion: startLoad.questionnaireChanged ? QUESTIONNAIRE_VERSION : startLoad.state.questionnaireVersion,
        rulesVersion: startLoad.state.rulesVersion,
        answers: startLoad.state.answers,
        assessedAt: startLoad.questionnaireChanged ? null : (startLoad.state.assessedAt as Instant | undefined) ?? null,
        selectedRoute: choices.selectDerivedRoute && preview.start.derivedRoute
          ? (preview.start.derivedRoute as NonNullable<PlanDocument['assessment']>['selectedRoute'])
          : null,
        importedAt: choices.now,
      }
    }
  }
  if (choices.importStartReview && preview.start.reviewOk) {
    usedStart = true
    const startLoad = loadStart(storage)
    if (startLoad.mode === 'ok' && startLoad.state?.review) {
      const r = startLoad.state.review
      doc.review = {
        id: r.id,
        anchor: r.anchor,
        intervalMonths: r.intervalMonths,
        completedDates: [...r.completedDates],
        calendarSequence: r.calendarSequence,
        mode: 'calendar-check-band-act',
      }
    }
  }
  if (choices.importStartResearchCap && preview.start.researchCapBps !== null) {
    usedStart = true
    doc.limits.researchCapBps = preview.start.researchCapBps
  }

  if (usedLegacy || usedStart) {
    doc.migration = {
      confirmedAt: choices.now,
      legacy: usedLegacy ? { fingerprint: preview.legacy.fingerprint, imported: true } : null,
      start: usedStart ? { fingerprint: preview.start.fingerprint, imported: true } : null,
    }
  } else {
    doc.migration = null
  }

  const parsed = parsePlanDocument(doc)
  if (!parsed.ok) return { ok: false, reason: 'invalid', detail: parsed.issues[0]?.code }

  // 快照旧键原文，确认后比对逐字不变
  const legacySnapshots: Record<string, string | null> = {}
  for (const k of [...Object.values(LEGACY_KEYS), LEGACY_CASHFLOW_KEY, START_KEY]) {
    try {
      legacySnapshots[k] = storage?.getItem(k) ?? null
    } catch {
      legacySnapshots[k] = null
    }
  }

  const created = await repository.create(parsed.value)
  // 再次确认旧键未变
  for (const [k, before] of Object.entries(legacySnapshots)) {
    let after: string | null = null
    try {
      after = storage?.getItem(k) ?? null
    } catch {
      after = null
    }
    if (after !== before) {
      return { ok: false, reason: 'create-failed', detail: 'source-mutated' }
    }
  }

  if (!created.ok) {
    return { ok: false, reason: 'create-failed', detail: created.reason }
  }

  // 成功后写 imports 收据
  if (created.persisted && (usedLegacy || usedStart)) {
    const existing = loadImportsReceipt(storage)
    const receipt = {
      schemaVersion: 1 as const,
      legacyConsumed: (existing !== 'missing' && existing !== 'corrupt' && existing !== 'unavailable' && existing.legacyConsumed) || usedLegacy,
      startConsumed: (existing !== 'missing' && existing !== 'corrupt' && existing !== 'unavailable' && existing.startConsumed) || usedStart,
    }
    const ok = writeImportsReceipt(storage, receipt)
    if (!ok) {
      return { ok: true, document: created.document, persisted: true, receiptWritten: false }
    }
    return { ok: true, document: created.document, persisted: created.persisted, receiptWritten: true }
  }

  return { ok: true, document: created.document, persisted: created.persisted, receiptWritten: true }
}
