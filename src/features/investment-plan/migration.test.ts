import { describe, expect, it } from 'vitest'
import { LEGACY_CASHFLOW_KEY, LEGACY_KEYS } from '../invest-start/legacyPlan'
import { START_KEY } from '../invest-start/store'
import { QUESTIONNAIRE_VERSION, RULES_VERSION } from '../invest-start/types'
import { buildMigrationPreview, confirmMigration, type MigrationChoices } from './migration'
import { createPlanRepository, type StorageLike } from './repository'
import { PLAN_KEYS } from './types'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: k => {
      delete data[k]
    },
  }
}

const balanced = (amount = '') => [
  { id: 'h1', name: 'A股宽基', role: 'r', target: '30', band: '25', amount },
  { id: 'h2', name: '标普500', role: 'r', target: '15', band: '25', amount },
  { id: 'h3', name: '红利低波', role: 'r', target: '5', band: '25', amount },
  { id: 'h4', name: '中短债/纯债', role: 'r', target: '50', band: '25', amount },
]

const DEFAULTS = {
  [LEGACY_KEYS.total]: JSON.stringify('100'),
  [LEGACY_KEYS.split]: JSON.stringify({ base: '75', active: '20', reserve: '5' }),
  [LEGACY_KEYS.cap]: JSON.stringify('5'),
  [LEGACY_KEYS.holdings]: JSON.stringify(balanced()),
}

const NOW = '2026-11-14T12:00:00.000Z'
const TODAY = '2026-11-14'

function baseChoices(over: Partial<MigrationChoices> = {}): MigrationChoices {
  return {
    ownershipConfirmed: true,
    importLegacyTotalSplit: false,
    importLegacyCap: false,
    importLegacyHoldings: false,
    importLegacyCashflowExpense: false,
    importLegacyCashflowReserve: false,
    importStartAssessment: false,
    importStartReview: false,
    importStartResearchCap: false,
    selectDerivedRoute: false,
    now: NOW,
    id: 'migrated-1',
    today: TODAY,
    ...over,
  }
}

describe('migration preview', () => {
  it('全默认→无资金候选', () => {
    const s = memoryStorage(DEFAULTS)
    const p = buildMigrationPreview(s, TODAY)
    expect(p.legacy.status).toBe('unfilled')
    expect(p.candidates.budgets).toBeNull()
    expect(p.candidates.holdings).toEqual([])
    expect(p.candidates.sameAsDefaultNote.length).toBeGreaterThan(0)
  })

  it('真实值恰等默认不猜', () => {
    // 本人真填了 100，仍等于默认 → default 状态，不进候选
    const s = memoryStorage(DEFAULTS)
    const p = buildMigrationPreview(s, TODAY)
    expect(p.candidates.budgetsBlockedReason).toBe('total-is-default')
  })

  it('total 缺 split / split 缺 total', () => {
    const onlyTotal = memoryStorage({
      [LEGACY_KEYS.total]: JSON.stringify('50'),
      [LEGACY_KEYS.split]: JSON.stringify({ base: '75', active: '20', reserve: '5' }),
    })
    expect(buildMigrationPreview(onlyTotal, TODAY).candidates.budgets).toBeNull()

    const onlySplit = memoryStorage({
      [LEGACY_KEYS.total]: JSON.stringify('100'),
      [LEGACY_KEYS.split]: JSON.stringify({ base: '70', active: '20', reserve: '10' }),
    })
    expect(buildMigrationPreview(onlySplit, TODAY).candidates.budgets).toBeNull()
  })

  it('非默认混合生成预算；万元→元', () => {
    const s = memoryStorage({
      [LEGACY_KEYS.total]: JSON.stringify('50'),
      [LEGACY_KEYS.split]: JSON.stringify({ base: '70', active: '20', reserve: '10' }),
    })
    const p = buildMigrationPreview(s, TODAY)
    expect(p.candidates.budgets).toBeTruthy()
    expect(p.candidates.budgets!.totalYuan.amount).toBe('500000.00')
    expect(p.candidates.budgets!.core.amount).toBe('350000.00')
    expect(p.candidates.budgets!.research.amount).toBe('100000.00')
    expect(p.candidates.budgets!.reserve.amount).toBe('50000.00')
  })

  it('holdings 为资产类别非证券；无日期 legacy', () => {
    const s = memoryStorage({
      ...DEFAULTS,
      [LEGACY_KEYS.holdings]: JSON.stringify(balanced('10')),
    })
    const p = buildMigrationPreview(s, TODAY)
    expect(p.candidates.holdings.length).toBe(4)
    expect(p.candidates.holdings[0].mark.source).toBe('legacy')
    expect(p.candidates.holdings[0].mark.asOf).toBeNull()
    expect(p.candidates.holdings[0].id.startsWith('legacy-')).toBe(true)
  })

  it('cashflow 两 reserve 不覆盖；默认不读 cashflow', () => {
    const s = memoryStorage({
      [LEGACY_KEYS.total]: JSON.stringify('50'),
      [LEGACY_KEYS.split]: JSON.stringify({ base: '70', active: '20', reserve: '10' }),
      [LEGACY_CASHFLOW_KEY]: JSON.stringify({ expense: '12', reserve: '3' }),
    })
    expect(buildMigrationPreview(s, TODAY).cashflow.status).toBe('not-requested')
    const p = buildMigrationPreview(s, TODAY, { includeCashflow: true })
    expect(p.cashflow.expense?.monthlyYuan.amount).toBe('10000.00')
    expect(p.cashflow.reserve?.value.amount).toBe('30000.00')
    expect(p.cashflow.reserveVsBudgetNote).toBeTruthy()
  })

  it('旧作者日志不读', () => {
    const reads: string[] = []
    const base = memoryStorage({
      ...DEFAULTS,
      'plan2026:pretrade-log': '[]',
      'plan2026:review-log': '[]',
    })
    const s: StorageLike = {
      getItem: k => {
        reads.push(k)
        return base.getItem(k)
      },
      setItem: base.setItem,
      removeItem: base.removeItem,
    }
    buildMigrationPreview(s, TODAY)
    expect(reads.some(k => k.includes('pretrade') || k.includes('review'))).toBe(false)
  })
})

describe('start:v1 migration', () => {
  it('v1 题目不重释', () => {
    const start = {
      schemaVersion: 1,
      questionnaireVersion: 1,
      rulesVersion: 1,
      answers: { q1: 'c', q2: 'b', q3: 'a', q4: 'c', q5: 'b', q6: 'c', q7: 'b', q8: 'b', q9: 'b' },
      steps: {},
      assessedAt: NOW,
    }
    const s = memoryStorage({ [START_KEY]: JSON.stringify(start) })
    const p = buildMigrationPreview(s, TODAY)
    expect(p.start.questionnaireChanged).toBe(true)
    expect(p.issues.some(i => i.code === 'questionnaire-changed')).toBe(true)
  })

  it('v2 cap 0/500/2000', () => {
    for (const cap of [0, 500, 2000]) {
      const start = {
        schemaVersion: 1,
        questionnaireVersion: QUESTIONNAIRE_VERSION,
        rulesVersion: RULES_VERSION,
        answers: {},
        steps: {},
        userResearchCapBps: cap,
      }
      const p = buildMigrationPreview(memoryStorage({ [START_KEY]: JSON.stringify(start) }), TODAY)
      expect(p.start.researchCapBps).toBe(cap)
    }
  })
})

describe('confirmMigration', () => {
  it('源变化拒确认；旧键逐字不变', async () => {
    const s = memoryStorage({
      [LEGACY_KEYS.total]: JSON.stringify('50'),
      [LEGACY_KEYS.split]: JSON.stringify({ base: '70', active: '20', reserve: '10' }),
    })
    const preview = buildMigrationPreview(s, TODAY)
    s.data[LEGACY_KEYS.total] = JSON.stringify('60')
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1' })
    const r = await confirmMigration(preview, baseChoices({ importLegacyTotalSplit: true }), repo, s)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('stale')
    expect(s.data[LEGACY_KEYS.total]).toBe(JSON.stringify('60'))
    expect(s.data[PLAN_KEYS.document]).toBeUndefined()
  })

  it('导入一次；写失败不标成功；旧键不变', async () => {
    const s = memoryStorage({
      [LEGACY_KEYS.total]: JSON.stringify('50'),
      [LEGACY_KEYS.split]: JSON.stringify({ base: '70', active: '20', reserve: '10' }),
      [LEGACY_KEYS.holdings]: JSON.stringify(balanced('10')),
    })
    const before = { ...s.data }
    const preview = buildMigrationPreview(s, TODAY)
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'migrated-1' })
    const r = await confirmMigration(
      preview,
      baseChoices({ importLegacyTotalSplit: true, importLegacyHoldings: true }),
      repo,
      s,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.funding.budgets.core?.amount).toBe('350000.00')
    expect(r.document.core[0].mark.source).toBe('legacy')
    for (const k of Object.values(LEGACY_KEYS)) {
      expect(s.data[k]).toBe(before[k])
    }

    // 再 create 应拒绝（已有文档）
    const preview2 = buildMigrationPreview(s, TODAY)
    const r2 = await confirmMigration(preview2, baseChoices({ importLegacyTotalSplit: true }), repo, s)
    expect(r2.ok).toBe(false)
  })

  it('无 ownership 拒；取消无写入', async () => {
    const s = memoryStorage({
      [LEGACY_KEYS.total]: JSON.stringify('50'),
      [LEGACY_KEYS.split]: JSON.stringify({ base: '70', active: '20', reserve: '10' }),
    })
    const preview = buildMigrationPreview(s, TODAY)
    const repo = createPlanRepository({ storage: s, clock: () => NOW, idFactory: () => 'id-1' })
    const r = await confirmMigration(preview, baseChoices({ ownershipConfirmed: false, importLegacyTotalSplit: true }), repo, s)
    expect(r.ok).toBe(false)
    expect(s.data[PLAN_KEYS.document]).toBeUndefined()
  })

  it('storage 写失败 → persisted false；旧键不变', async () => {
    const s = memoryStorage({
      [LEGACY_KEYS.total]: JSON.stringify('50'),
      [LEGACY_KEYS.split]: JSON.stringify({ base: '70', active: '20', reserve: '10' }),
    })
    const beforeTotal = s.data[LEGACY_KEYS.total]
    const preview = buildMigrationPreview(s, TODAY)
    const failing: StorageLike = {
      getItem: s.getItem,
      setItem: (k, v) => {
        if (k === PLAN_KEYS.document) throw new Error('quota')
        s.setItem(k, v)
      },
      removeItem: s.removeItem,
    }
    const repo = createPlanRepository({ storage: failing, clock: () => NOW, idFactory: () => 'id-1' })
    const r = await confirmMigration(preview, baseChoices({ importLegacyTotalSplit: true }), repo, failing)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.persisted).toBe(false)
    expect(s.data[LEGACY_KEYS.total]).toBe(beforeTotal)
  })
})
