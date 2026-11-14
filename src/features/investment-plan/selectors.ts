// 状态 / 偏离 / 额度 / 待办；未知不是 0。比较用整数有理式。
import { isRelativeBandBreached, theoreticalGapFen, yuanToFen } from './money'
import { contributionDue, planReviewStatus } from './schedule'
import type { Allocation, Day, Instant, Money, PlanDocument, ResearchPosition } from './types'

export type DataQuality = 'ok' | 'missing' | 'undated' | 'stale' | 'invalid' | 'unknown'
export type BandState = 'within' | 'breached' | 'unknown'
export type CapState = 'within' | 'at-limit' | 'breached' | 'unknown'

export type AllocationRowView = {
  id: string
  label: string
  targetBps: number | null
  relativeBandBps: number | null
  amountFen: bigint | null
  weightBps: number | null
  band: BandState
  gapFen: bigint | null
  calculatedDeviation: boolean
}

export type AllocationView = {
  state: BandState
  dataState: DataQuality
  rows: AllocationRowView[]
  totalFen: bigint | null
  asOf: Day | null
  /** 仅历史数学；legacy/undated 时 true */
  historicalOnly: boolean
}

export type ReferenceTotal = {
  state: 'ok' | 'unknown'
  total: Money | null
  core: Money | null
  research: Money | null
  reserve: Money | null
}

export type LimitView = {
  research: CapState
  single: CapState
  researchHeadroomFen: bigint | null
  singleHeadroomFen: bigint | null
  budgetOverCap: boolean
}

export type TodoItem = { id: string; kind: string; label: string }

export type PlanStatus = {
  review: { due?: Day; next: Day | null; daysToNext: number | null; mode: PlanDocument['review'] extends null ? null : NonNullable<PlanDocument['review']>['mode'] | null }
  todos: TodoItem[]
  dataState: DataQuality
  allocationState: BandState
  limitState: CapState
  canSayNothingToDo: boolean
  referenceTotal: ReferenceTotal
  emergency: {
    needFen: bigint | null
    gapFen: bigint | null
    state: DataQuality
  }
  allocation: AllocationView
  limits: LimitView
}

function moneyFen(m: Money | null | undefined): bigint | null {
  if (!m) return null
  return yuanToFen(m.amount)
}

export function selectReferenceTotal(doc: PlanDocument): ReferenceTotal {
  const b = doc.funding.budgets
  if (!b.confirmedAt || !b.core || !b.research || !b.reserve) {
    return { state: 'unknown', total: null, core: b.core, research: b.research, reserve: b.reserve }
  }
  const c = moneyFen(b.core)!
  const r = moneyFen(b.research)!
  const v = moneyFen(b.reserve)!
  const sum = c + r + v
  const yuan = `${(sum / 100n).toString()}.${(sum % 100n).toString().padStart(2, '0')}`
  return {
    state: 'ok',
    total: { currency: 'CNY', amount: yuan },
    core: b.core,
    research: b.research,
    reserve: b.reserve,
  }
}

export function selectEmergency(doc: PlanDocument): PlanStatus['emergency'] {
  const months = doc.funding.emergencyMonths
  const expense = moneyFen(doc.funding.monthlyNecessaryExpense)
  if (months === null || expense === null) return { needFen: null, gapFen: null, state: 'missing' }
  const need = expense * BigInt(months)
  const reserve = doc.funding.reserveActual
  if (!reserve.value) return { needFen: need, gapFen: null, state: 'missing' }
  if (!reserve.asOf || !reserve.verifiedAt || reserve.source === 'legacy') {
    return { needFen: need, gapFen: null, state: 'undated' }
  }
  const actual = moneyFen(reserve.value)!
  const gap = need > actual ? need - actual : 0n
  return { needFen: need, gapFen: gap, state: 'ok' }
}

function markUsable(mark: Allocation['mark']): { fen: bigint | null; quality: DataQuality } {
  if (!mark.value) return { fen: null, quality: 'missing' }
  const fen = yuanToFen(mark.value.amount)
  if (fen === null) return { fen: null, quality: 'invalid' }
  if (mark.source === 'legacy' || !mark.asOf || !mark.verifiedAt) return { fen, quality: 'undated' }
  return { fen, quality: 'ok' }
}

/**
 * 底仓偏离（8.3）。coreTotalOnly 不能计算偏离。
 * 完整类别、目标合计 10000、每项金额明确含 0、同一 asOf、S>0 才可计算。
 */
export function selectAllocation(doc: PlanDocument, today: Day): AllocationView {
  if (doc.coreTotalOnly && doc.core.length === 0) {
    return {
      state: 'unknown',
      dataState: markUsable(doc.coreTotalOnly).quality === 'ok' ? 'ok' : markUsable(doc.coreTotalOnly).quality,
      rows: [],
      totalFen: moneyFen(doc.coreTotalOnly.value),
      asOf: doc.coreTotalOnly.asOf,
      historicalOnly: doc.coreTotalOnly.source === 'legacy' || !doc.coreTotalOnly.asOf,
    }
  }
  if (!doc.core.length) {
    return { state: 'unknown', dataState: 'missing', rows: [], totalFen: null, asOf: null, historicalOnly: false }
  }

  const rowsMeta = doc.core.map(a => ({ a, m: markUsable(a.mark) }))
  const anyUndated = rowsMeta.some(r => r.m.quality === 'undated')
  const anyMissing = rowsMeta.some(r => r.m.fen === null)
  const anyInvalid = rowsMeta.some(r => r.m.quality === 'invalid')
  const asOfs = rowsMeta.map(r => r.a.mark.asOf).filter((d): d is Day => !!d)
  const sameAsOf = asOfs.length === doc.core.length && new Set(asOfs).size === 1
  const targetsOk = doc.core.every(a => a.targetBps !== null && a.targetBps > 0)
  const targetSum = doc.core.reduce((s, a) => s + (a.targetBps ?? 0), 0)
  const bandsOk = doc.core.every(a => a.relativeBandBps !== null && a.relativeBandBps > 0)

  let dataState: DataQuality = 'ok'
  if (anyInvalid) dataState = 'invalid'
  else if (anyMissing) dataState = 'missing'
  else if (anyUndated || !sameAsOf) dataState = 'undated'
  else if (!targetsOk || targetSum !== 10000 || !bandsOk) dataState = 'unknown'

  // stale：已到最近检查日、却尚未在该检查日或之后核对（verifiedAt 本地日期）
  if (dataState === 'ok' && doc.review) {
    const st = planReviewStatus(doc.review, today)
    if (st.due) {
      const verifiedDays = doc.core.map(a => (a.mark.verifiedAt ? instantLocalDay(a.mark.verifiedAt) : null))
      const allVerifiedAfterDue = verifiedDays.every(d => d && d >= st.due!)
      if (!allVerifiedAfterDue) dataState = 'stale'
    }
  }

  const canCompute =
    !anyMissing &&
    !anyInvalid &&
    targetsOk &&
    targetSum === 10000 &&
    bandsOk &&
    rowsMeta.every(r => r.m.fen !== null)

  // 历史数学：即使 undated/legacy 也可算 calculatedDeviation
  const historicalOnly = anyUndated || rowsMeta.some(r => r.a.mark.source === 'legacy')
  const amounts = rowsMeta.map(r => r.m.fen)
  const S = canCompute || (amounts.every(a => a !== null) && targetsOk && targetSum === 10000)
    ? amounts.reduce<bigint>((s, a) => s + (a ?? 0n), 0n)
    : null

  if (S === null || S <= 0n || !targetsOk || targetSum !== 10000) {
    return {
      state: 'unknown',
      dataState: dataState === 'ok' ? 'unknown' : dataState,
      rows: doc.core.map(a => ({
        id: a.id,
        label: a.label,
        targetBps: a.targetBps,
        relativeBandBps: a.relativeBandBps,
        amountFen: markUsable(a.mark).fen,
        weightBps: null,
        band: 'unknown',
        gapFen: null,
        calculatedDeviation: false,
      })),
      totalFen: S,
      asOf: sameAsOf ? asOfs[0] : null,
      historicalOnly,
    }
  }

  const rows: AllocationRowView[] = doc.core.map((a, i) => {
    const amountFen = amounts[i]!
    const targetBps = a.targetBps!
    const bandBps = a.relativeBandBps!
    const breached = isRelativeBandBreached({
      amountFen,
      totalFen: S,
      targetBps,
      relativeBandBps: bandBps,
    })
    const weightBps = Number((amountFen * 10000n) / S)
    return {
      id: a.id,
      label: a.label,
      targetBps,
      relativeBandBps: bandBps,
      amountFen,
      weightBps,
      band: breached ? 'breached' : 'within',
      gapFen: theoreticalGapFen(amountFen, S, targetBps),
      calculatedDeviation: true,
    }
  })

  // 当前行动态：undated/stale/legacy → unknown（不给绿灯）；历史数学仍在 rows
  let state: BandState = 'unknown'
  if (dataState === 'ok' && !historicalOnly) {
    state = rows.some(r => r.band === 'breached') ? 'breached' : 'within'
  }

  return {
    state,
    dataState,
    rows,
    totalFen: S,
    asOf: sameAsOf ? asOfs[0] : null,
    historicalOnly,
  }
}

function researchActualFen(doc: PlanDocument): { total: bigint | null; singles: { id: string; fen: bigint }[]; quality: DataQuality } {
  if (doc.researchTotalOnly) {
    const m = markUsable(doc.researchTotalOnly)
    return { total: m.fen, singles: [], quality: m.quality }
  }
  if (!doc.research.length) return { total: 0n, singles: [], quality: 'ok' }
  const rows = doc.research.map(r => ({ id: r.id, m: markUsable(r.mark) }))
  if (rows.some(r => r.m.fen === null)) return { total: null, singles: [], quality: 'missing' }
  if (rows.some(r => r.m.quality === 'undated')) {
    const total = rows.reduce((s, r) => s + r.m.fen!, 0n)
    return { total, singles: rows.map(r => ({ id: r.id, fen: r.m.fen! })), quality: 'undated' }
  }
  const total = rows.reduce((s, r) => s + r.m.fen!, 0n)
  return { total, singles: rows.map(r => ({ id: r.id, fen: r.m.fen! })), quality: 'ok' }
}

export function selectLimits(doc: PlanDocument): LimitView {
  const ref = selectReferenceTotal(doc)
  const T = ref.state === 'ok' && ref.total ? yuanToFen(ref.total.amount)! : null
  const research = researchActualFen(doc)
  const caps = doc.limits
  const confirmed = !!caps.confirmedAt

  let researchState: CapState = 'unknown'
  let singleState: CapState = 'unknown'
  let researchHeadroomFen: bigint | null = null
  let singleHeadroomFen: bigint | null = null
  let budgetOverCap = false

  // 未声明记录完整不得说额度内；零行且未声明 → unknown（不能 within）
  if (
    T !== null &&
    confirmed &&
    caps.researchCapBps !== null &&
    research.quality === 'ok' &&
    research.total !== null &&
    !!doc.researchCompleteAt
  ) {
    // 有理式：research*10000 ? cap*T（避免 floor 误报 at-limit）
    const left = research.total * 10000n
    const right = BigInt(caps.researchCapBps) * T
    if (left > right) researchState = 'breached'
    else if (left === right) researchState = 'at-limit'
    else researchState = 'within'
    researchHeadroomFen = right > left ? (right - left) / 10000n : 0n
  }

  // 预算 research/T 超过本人 cap 也单列待核
  if (T !== null && confirmed && caps.researchCapBps !== null && doc.funding.budgets.research) {
    const budgetFen = yuanToFen(doc.funding.budgets.research.amount)!
    if (budgetFen * 10000n > BigInt(caps.researchCapBps) * T) budgetOverCap = true
  }

  if (
    T !== null &&
    confirmed &&
    caps.singleStockCapBps !== null &&
    research.quality === 'ok' &&
    research.singles.length > 0 &&
    !!doc.researchCompleteAt
  ) {
    let worst: CapState = 'within'
    let minHead = (BigInt(caps.singleStockCapBps) * T) / 10000n
    for (const s of research.singles) {
      const left = s.fen * 10000n
      const right = BigInt(caps.singleStockCapBps) * T
      if (left > right) worst = 'breached'
      else if (left === right && worst !== 'breached') worst = 'at-limit'
      const head = right > left ? (right - left) / 10000n : 0n
      if (head < minHead) minHead = head
    }
    singleState = worst
    singleHeadroomFen = minHead
  } else if (doc.research.length > 0 || doc.researchTotalOnly) {
    if (!doc.researchCompleteAt || caps.singleStockCapBps === null) singleState = 'unknown'
  }

  return { research: researchState, single: singleState, researchHeadroomFen, singleHeadroomFen, budgetOverCap }
}

function shouldShowBandAction(doc: PlanDocument, today: Day, allocation: AllocationView): boolean {
  if (!doc.review) return false
  const st = planReviewStatus(doc.review, today)
  if (!st.due) {
    // 平日越界仅提示记录待核，不生成交易量——仍可有 todo，但不展开差额行动
    return false
  }
  if (doc.review.mode === 'calendar-rebalance') {
    // 到检查日按事先目标复核，不能偷偷再加越界条件
    return allocation.dataState === 'ok' && !allocation.historicalOnly
  }
  // calendar-check-band-act：到检查日核对且严格越界才显示条件计算
  return allocation.state === 'breached' && allocation.dataState === 'ok' && !allocation.historicalOnly
}

export function selectPlanStatus(doc: PlanDocument, today: Day): PlanStatus {
  const referenceTotal = selectReferenceTotal(doc)
  const emergency = selectEmergency(doc)
  const allocation = selectAllocation(doc, today)
  const limits = selectLimits(doc)
  const review = doc.review
    ? { ...planReviewStatus(doc.review, today), mode: doc.review.mode }
    : { due: undefined, next: null as Day | null, daysToNext: null as number | null, mode: null }

  const todos: TodoItem[] = []
  const add = (id: string, kind: string, label: string) => {
    if (!todos.some(t => t.id === id)) todos.push({ id, kind, label })
  }

  // 优先级：保存/冲突→资金用途/近期用款→缺预算/未确认上限→数据待核→检查日→预算日
  if (doc.funding.earliestUse === 'under-3y') {
    add('horizon-under-3y', 'horizon', '这笔钱不到 3 年可能要用，先核对底座警示')
  }
  if (doc.funding.highInterestDebt === true) {
    add('high-interest-debt', 'debt', '有高息欠款待核对')
  }
  if (emergency.state === 'ok' && emergency.gapFen !== null && emergency.gapFen > 0n) {
    add('emergency-gap', 'emergency', '应急需求相对备用金仍有缺口，待核对')
  } else if (emergency.state === 'missing' || emergency.state === 'undated') {
    add('emergency-unknown', 'emergency', '应急需求或备用金实际余额待核')
  }
  if (doc.funding.recentNeedAmount && yuanToFen(doc.funding.recentNeedAmount.amount)! > 0n) {
    add('recent-need', 'cashflow', '有近期确定支出，待核对用途')
  }
  if (referenceTotal.state === 'unknown') {
    add('budgets-unconfirmed', 'budget', '三笔投资预算未确认或未填齐')
  }
  if (!doc.limits.confirmedAt && (doc.limits.researchCapBps !== null || doc.limits.singleStockCapBps !== null || doc.research.length > 0)) {
    add('limits-unconfirmed', 'limits', '主动/单只上限待确认')
  }
  if (limits.budgetOverCap) {
    add('budget-over-cap', 'limits', '研究预算超过已选主动上限，待核')
  }
  if (allocation.dataState === 'undated' || allocation.dataState === 'stale' || allocation.dataState === 'missing') {
    add('data-pending', 'data', '配置市值日期或记录待核')
  }
  if (allocation.state === 'breached') {
    add('band-breached', 'band', '记录显示超出事先带宽，待核对')
  }
  if (review.due) {
    add('review-due', 'review', '检查日已到，先核对日期与资金用途')
  }
  for (const c of doc.contributions) {
    const due = contributionDue(c, today)
    if (due) add(`contrib-${c.id}`, 'contribution', '核对本期预算')
  }

  const showBand = shouldShowBandAction(doc, today, allocation)
  void showBand // UI 用；此处不产出交易指令

  const limitState: CapState =
    limits.research === 'breached' || limits.single === 'breached'
      ? 'breached'
      : limits.research === 'unknown' || limits.single === 'unknown'
        ? 'unknown'
        : limits.research === 'at-limit' || limits.single === 'at-limit'
          ? 'at-limit'
          : 'within'

  const canSayNothingToDo = computeNothingToDo(doc, today, {
    referenceTotal,
    emergency,
    allocation,
    limits,
    reviewDue: !!review.due,
    todos,
  })

  // 稳定排序
  const order = ['horizon', 'debt', 'emergency', 'cashflow', 'budget', 'limits', 'data', 'band', 'review', 'contribution']
  todos.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.id.localeCompare(b.id))

  return {
    review,
    todos,
    dataState: allocation.dataState,
    allocationState: allocation.state,
    limitState,
    canSayNothingToDo,
    referenceTotal,
    emergency,
    allocation,
    limits,
  }
}

function computeNothingToDo(
  doc: PlanDocument,
  today: Day,
  ctx: {
    referenceTotal: ReferenceTotal
    emergency: PlanStatus['emergency']
    allocation: AllocationView
    limits: LimitView
    reviewDue: boolean
    todos: TodoItem[]
  },
): boolean {
  void today
  if (!doc.wizard.completed) return false
  if (ctx.todos.length > 0) return false
  if (ctx.reviewDue) return false
  if (doc.funding.monthlyNecessaryExpense === null) return false
  if (doc.funding.emergencyMonths === null) return false
  if (doc.funding.recentNeedAmount === null) return false
  if (doc.funding.earliestUse === null) return false
  if (doc.funding.highInterestDebt === null) return false
  if (doc.funding.earliestUse === 'under-3y') return false
  if (doc.funding.highInterestDebt === true) return false
  if (ctx.referenceTotal.state !== 'ok' || !ctx.referenceTotal.total || yuanToFen(ctx.referenceTotal.total.amount)! <= 0n) return false
  if (ctx.emergency.state !== 'ok' || (ctx.emergency.gapFen !== null && ctx.emergency.gapFen > 0n)) return false
  if (!doc.review) return false
  if (!doc.limits.confirmedAt) return false
  // 仅录总额也可完成向导，但不能说类别已在区间 → nothing-to-do 要求类别可判断或明确仅合计且无越界待办
  if (doc.coreTotalOnly && doc.core.length === 0) return false
  if (ctx.allocation.state !== 'within' || ctx.allocation.dataState !== 'ok' || ctx.allocation.historicalOnly) return false
  if (ctx.limits.research === 'breached' || ctx.limits.single === 'breached') return false
  if (ctx.limits.budgetOverCap) return false
  // 有研究持仓时：质量须 ok，单只未知则不可 nothing-to-do；未声明完整也不可
  const hasResearch = doc.research.length > 0 || !!doc.researchTotalOnly
  if (hasResearch) {
    if (!doc.researchCompleteAt) return false
    const rq = researchActualFen(doc).quality
    if (rq !== 'ok') return false
    if (ctx.limits.single === 'unknown') return false
    if (ctx.limits.research === 'unknown') return false
  }
  return true
}

/** 共同风险暴露：人工 riskTags，不含基金间接敞口声明 */
export function selectSharedRisk(doc: PlanDocument): { tag: string; labels: string[] }[] {
  const map = new Map<string, string[]>()
  const add = (tags: string[], label: string) => {
    for (const t of tags) {
      const list = map.get(t) ?? []
      list.push(label)
      map.set(t, list)
    }
  }
  for (const a of doc.core) add(a.riskTags, a.label)
  for (const r of doc.research) add(r.riskTags, r.label)
  return [...map.entries()]
    .filter(([, labels]) => labels.length >= 2)
    .map(([tag, labels]) => ({ tag, labels }))
}

export function instantLocalDay(instant: Instant): Day {
  // verifiedAt 是 UTC ISO；本地日期比较由调用方用本地 today。这里取 UTC 日期仅作兜底；
  // stale 比较规格要求「verifiedAt 的本地日期」——浏览器环境用 Date 本地。
  const d = new Date(instant)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 供测试直接验证 15±25% 边界的纯函数出口
export { isRelativeBandBreached }

export type { ResearchPosition }
