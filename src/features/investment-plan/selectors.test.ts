import { describe, expect, it } from 'vitest'
import { isRelativeBandBreached } from './money'
import {
  selectAllocation,
  selectLimits,
  selectPlanStatus,
  selectReferenceTotal,
} from './selectors'
import { createEmptyPlan, type Allocation, type PlanDocument } from './types'

const NOW = '2026-11-14T12:00:00.000Z'
const TODAY = '2026-11-14'

function mark(amount: string, asOf: string | null = '2026-11-10', source: 'manual' | 'legacy' = 'manual') {
  return {
    value: amount === '' ? null : { currency: 'CNY' as const, amount },
    asOf: amount === '' ? null : asOf,
    source,
    verifiedAt: source === 'manual' && asOf ? NOW : null,
  }
}

function coreRows(specs: { id: string; target: number; band: number; amount: string; asOf?: string | null; source?: 'manual' | 'legacy' }[]): Allocation[] {
  return specs.map(s => ({
    id: s.id,
    label: s.id,
    targetBps: s.target,
    relativeBandBps: s.band,
    mark: mark(s.amount, s.asOf === undefined ? '2026-11-10' : s.asOf, s.source ?? 'manual'),
    riskTags: [],
  }))
}

describe('15±25% 边界 oracle', () => {
  it('独立算术验证', () => {
    const S = 10000n
    expect(isRelativeBandBreached({ amountFen: 1125n, totalFen: S, targetBps: 1500, relativeBandBps: 2500 })).toBe(false)
    expect(isRelativeBandBreached({ amountFen: 1875n, totalFen: S, targetBps: 1500, relativeBandBps: 2500 })).toBe(false)
    expect(isRelativeBandBreached({ amountFen: 1124n, totalFen: S, targetBps: 1500, relativeBandBps: 2500 })).toBe(true)
    expect(isRelativeBandBreached({ amountFen: 1876n, totalFen: S, targetBps: 1500, relativeBandBps: 2500 })).toBe(true)
  })
})

describe('selectAllocation', () => {
  it('空/S0/缺目标/异日/无日期 → unknown', () => {
    const doc = createEmptyPlan(NOW, 'p1')
    expect(selectAllocation(doc, TODAY).state).toBe('unknown')

    doc.core = coreRows([
      { id: 'a', target: 1500, band: 2500, amount: '0.00' },
      { id: 'b', target: 8500, band: 2500, amount: '0.00' },
    ])
    expect(selectAllocation(doc, TODAY).state).toBe('unknown') // S=0

    doc.core = coreRows([
      { id: 'a', target: 1500, band: 2500, amount: '15.00' },
      { id: 'b', target: null as unknown as number, band: 2500, amount: '85.00' },
    ])
    doc.core[1].targetBps = null
    expect(selectAllocation(doc, TODAY).state).toBe('unknown')

    doc.core = coreRows([
      { id: 'a', target: 1500, band: 2500, amount: '15.00', asOf: '2026-11-01' },
      { id: 'b', target: 8500, band: 2500, amount: '85.00', asOf: '2026-11-02' },
    ])
    expect(selectAllocation(doc, TODAY).dataState).toBe('undated')
    expect(selectAllocation(doc, TODAY).state).toBe('unknown')

    doc.core = coreRows([
      { id: 'a', target: 1500, band: 2500, amount: '15.00', source: 'legacy', asOf: null },
      { id: 'b', target: 8500, band: 2500, amount: '85.00', source: 'legacy', asOf: null },
    ])
    const hist = selectAllocation(doc, TODAY)
    expect(hist.state).toBe('unknown')
    expect(hist.historicalOnly).toBe(true)
    expect(hist.rows.some(r => r.calculatedDeviation)).toBe(true)
  })

  it('仅合计 → unknown 偏离', () => {
    const doc = createEmptyPlan(NOW, 'p1')
    doc.coreTotalOnly = mark('100.00')
    expect(selectAllocation(doc, TODAY).state).toBe('unknown')
  })

  it('有效同日 within/breached；过去日期非检查期不 stale', () => {
    const doc = createEmptyPlan(NOW, 'p1')
    doc.core = coreRows([
      { id: 'a', target: 1500, band: 2500, amount: '15.00', asOf: '2026-10-01' },
      { id: 'b', target: 8500, band: 2500, amount: '85.00', asOf: '2026-10-01' },
    ])
    // 无 review → 不 stale
    expect(selectAllocation(doc, TODAY).dataState).toBe('ok')
    expect(selectAllocation(doc, TODAY).state).toBe('within')

    doc.core = coreRows([
      { id: 'a', target: 1500, band: 2500, amount: '11.24', asOf: '2026-10-01' },
      { id: 'b', target: 8500, band: 2500, amount: '88.76', asOf: '2026-10-01' },
    ])
    // 11.24 on S=100 → amount 11.24 yuan = 1124 fen, S=10000 fen
    expect(selectAllocation(doc, TODAY).state).toBe('breached')
  })

  it('到期未核对才 stale', () => {
    const doc = createEmptyPlan(NOW, 'p1')
    doc.review = {
      id: 'r1',
      anchor: '2026-05-14',
      intervalMonths: 6,
      completedDates: [],
      calendarSequence: 0,
      mode: 'calendar-check-band-act',
    }
    doc.core = coreRows([
      { id: 'a', target: 5000, band: 2500, amount: '50.00', asOf: '2026-05-01' },
      { id: 'b', target: 5000, band: 2500, amount: '50.00', asOf: '2026-05-01' },
    ])
    // verifiedAt=NOW (2026-11-14) >= due 2026-11-14 → 已核对
    // 把 verifiedAt 调到 due 之前
    for (const c of doc.core) c.mark.verifiedAt = '2026-05-01T00:00:00.000Z'
    expect(selectAllocation(doc, TODAY).dataState).toBe('stale')
  })
})

describe('referenceTotal / limits', () => {
  it('T=core+research+reserve；预算与 mark 不重复', () => {
    const doc = createEmptyPlan(NOW, 'p1')
    doc.funding.budgets = {
      core: { currency: 'CNY', amount: '700000.00' },
      research: { currency: 'CNY', amount: '200000.00' },
      reserve: { currency: 'CNY', amount: '100000.00' },
      confirmedAt: NOW,
    }
    const ref = selectReferenceTotal(doc)
    expect(ref.state).toBe('ok')
    expect(ref.total?.amount).toBe('1000000.00')
  })

  it('cap0 / at-limit / breached；研究分母是 T 不是 research 预算', () => {
    const doc = createEmptyPlan(NOW, 'p1')
    doc.funding.budgets = {
      core: { currency: 'CNY', amount: '800000.00' },
      research: { currency: 'CNY', amount: '100000.00' },
      reserve: { currency: 'CNY', amount: '100000.00' },
      confirmedAt: NOW,
    }
    doc.limits = { researchCapBps: 0, singleStockCapBps: null, confirmedAt: NOW, increaseAcknowledgedAt: null }
    doc.researchTotalOnly = mark('0.00')
    // 未声明完整 → 不得说额度内/at-limit
    expect(selectLimits(doc).research).toBe('unknown')
    doc.researchCompleteAt = NOW
    expect(selectLimits(doc).research).toBe('at-limit')

    doc.limits.researchCapBps = 1000 // 10% of 1e6 = 100000
    doc.researchTotalOnly = mark('100000.00')
    expect(selectLimits(doc).research).toBe('at-limit')
    doc.researchTotalOnly = mark('100000.01')
    expect(selectLimits(doc).research).toBe('breached')
  })
})

describe('two modes + nothing-to-do', () => {
  it('calendar-check-band-act 平日越界不给交易指令；到检查日才条件计算', () => {
    const doc = createEmptyPlan(NOW, 'p1')
    doc.wizard.completed = true
    doc.review = {
      id: 'r1',
      anchor: '2027-05-14',
      intervalMonths: 6,
      completedDates: [],
      calendarSequence: 0,
      mode: 'calendar-check-band-act',
    }
    doc.core = coreRows([
      { id: 'a', target: 1500, band: 2500, amount: '11.24' },
      { id: 'b', target: 8500, band: 2500, amount: '88.76' },
    ])
    const status = selectPlanStatus(doc, TODAY)
    expect(status.allocationState).toBe('breached')
    expect(status.todos.some(t => t.kind === 'band')).toBe(true)
    expect(status.todos.map(t => t.label).join('\n')).not.toMatch(/买入|卖出|需买|需卖/)
  })

  it('calendar-rebalance 到检查日不要求越界', () => {
    const doc = createEmptyPlan(NOW, 'p1')
    doc.review = {
      id: 'r1',
      anchor: '2026-05-14',
      intervalMonths: 6,
      completedDates: [],
      calendarSequence: 0,
      mode: 'calendar-rebalance',
    }
    doc.core = coreRows([
      { id: 'a', target: 5000, band: 2500, amount: '50.00' },
      { id: 'b', target: 5000, band: 2500, amount: '50.00' },
    ])
    for (const c of doc.core) c.mark.verifiedAt = NOW
    const st = selectPlanStatus(doc, TODAY)
    expect(st.review.due).toBe('2026-11-14')
    expect(st.allocationState).toBe('within')
  })

  it('空计划永不 nothing-to-do；应急优先', () => {
    const doc = createEmptyPlan(NOW, 'p1')
    expect(selectPlanStatus(doc, TODAY).canSayNothingToDo).toBe(false)
    doc.funding.earliestUse = 'under-3y'
    doc.funding.highInterestDebt = false
    const st = selectPlanStatus(doc, TODAY)
    expect(st.todos[0].kind).toBe('horizon')
  })

  it('nothing-to-do 严格条件', () => {
    const doc = fullyReadyPlan()
    expect(selectPlanStatus(doc, TODAY).canSayNothingToDo).toBe(true)
  })
})

function fullyReadyPlan(): PlanDocument {
  const doc = createEmptyPlan(NOW, 'p1')
  doc.wizard = { nextStep: 4, completed: true, skippedSteps: [] }
  doc.funding.monthlyNecessaryExpense = { currency: 'CNY', amount: '5000.00' }
  doc.funding.emergencyMonths = 6
  doc.funding.recentNeedAmount = { currency: 'CNY', amount: '0.00' }
  doc.funding.earliestUse = '5y-plus'
  doc.funding.highInterestDebt = false
  doc.funding.budgets = {
    core: { currency: 'CNY', amount: '700000.00' },
    research: { currency: 'CNY', amount: '0.00' },
    reserve: { currency: 'CNY', amount: '300000.00' },
    confirmedAt: NOW,
  }
  doc.funding.reserveActual = mark('300000.00')
  doc.limits = { researchCapBps: 0, singleStockCapBps: null, confirmedAt: NOW, increaseAcknowledgedAt: null }
  doc.researchCompleteAt = NOW
  doc.review = {
    id: 'r1',
    anchor: '2027-05-14',
    intervalMonths: 6,
    completedDates: [],
    calendarSequence: 0,
    mode: 'calendar-check-band-act',
  }
  doc.core = coreRows([
    { id: 'a', target: 5000, band: 2500, amount: '50000.00' },
    { id: 'b', target: 5000, band: 2500, amount: '50000.00' },
  ])
  return doc
}
