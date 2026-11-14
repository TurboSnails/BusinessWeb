import { describe, expect, it } from 'vitest'
import { LEGACY_KEYS, calculateDeviation, readLegacyMonthlyExpenseYuan, readLegacyPlan, type LegacyRow } from './legacyPlan'

/** 记录读写的假存储：断言只读白名单键、从不写 */
function fakeStorage(data: Record<string, string>) {
  const reads: string[] = []
  const writes: string[] = []
  return {
    reads,
    writes,
    getItem: (k: string) => { reads.push(k); return k in data ? data[k] : null },
    setItem: (k: string) => { writes.push(k) },
    removeItem: (k: string) => { writes.push(k) },
  }
}

// 旧页挂载时自动写入的默认值（InvestmentPlan2026.tsx usePersisted）
const balanced = (amount = ''): LegacyRow[] => [
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

describe('readLegacyPlan', () => {
  it('没有任何旧键 → missing', () => {
    expect(readLegacyPlan(fakeStorage({})).status).toBe('missing')
    expect(readLegacyPlan(null).status).toBe('missing')
  })

  it('等于旧页默认值（100 万、75/20/5、5%、金额全空）一律视为未填写', () => {
    const s = fakeStorage(DEFAULTS)
    const r = readLegacyPlan(s)
    expect(r.status).toBe('unfilled')
    expect([r.total.state, r.split.state, r.cap.state, r.holdings.state]).toEqual(['default', 'default', 'default', 'default'])
    expect(r.calculatedDeviation).toBeUndefined()
  })

  it('只读四个白名单键，从不写入（不读 cashflow、冷静期或复盘日志）', () => {
    const s = fakeStorage({ ...DEFAULTS, 'plan2026:cashflow': '{}', 'plan2026:pretrade-log': '[]' })
    readLegacyPlan(s)
    expect(s.reads.sort()).toEqual(Object.values(LEGACY_KEYS).sort())
    expect(s.writes).toEqual([])
  })

  it('有本人填写的数据但未确认 → unconfirmed；确认指纹一致 → confirmed；数据一变确认失效', () => {
    const data = { ...DEFAULTS, [LEGACY_KEYS.total]: JSON.stringify('50') }
    const r = readLegacyPlan(fakeStorage(data))
    expect(r.status).toBe('unconfirmed')
    expect(r.total).toEqual({ state: 'filled', value: '50' })
    expect(readLegacyPlan(fakeStorage(data), r.fingerprint).status).toBe('confirmed')
    const changed = { ...data, [LEGACY_KEYS.total]: JSON.stringify('60') }
    expect(readLegacyPlan(fakeStorage(changed), r.fingerprint).status).toBe('unconfirmed')
  })

  it('无日期的旧持仓：有效性永远 unknown；按原记录算出的偏离只放在 calculatedDeviation', () => {
    const rows = balanced('10')
    const r = readLegacyPlan(fakeStorage({ ...DEFAULTS, [LEGACY_KEYS.holdings]: JSON.stringify(rows) }))
    expect(r.status).toBe('unconfirmed')
    expect(r.deviation).toBe('unknown')
    expect(r.hasValuationDate).toBe(false)
    expect(r.calculatedDeviation?.rows).toHaveLength(4)
  })

  it('损坏的 JSON / 结构 → invalid，不显示', () => {
    const r = readLegacyPlan(fakeStorage({ [LEGACY_KEYS.total]: '{bad', [LEGACY_KEYS.split]: JSON.stringify({ base: 1 }) }))
    expect(r.status).toBe('invalid')
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('getItem 抛错（隐私模式）时当作没有数据', () => {
    const throwing = { getItem: () => { throw new Error('denied') } }
    expect(readLegacyPlan(throwing).status).toBe('missing')
  })
})

describe('calculateDeviation（与旧页公式一致，但空值不当 0）', () => {
  it('相对偏离 = (权重 − 目标) / 目标，严格大于阈值才算越过', () => {
    // 目标 50/50，金额 62.5/37.5 → 权重 62.5% / 37.5%，相对偏离 +25% / −25%，等于阈值不越过
    const rows: LegacyRow[] = [
      { id: 'a', name: 'A', role: '', target: '50', band: '25', amount: '62.5' },
      { id: 'b', name: 'B', role: '', target: '50', band: '25', amount: '37.5' },
    ]
    const r = calculateDeviation(rows)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.rows.map(x => Math.round(x.relativeDevPct))).toEqual([25, -25])
      expect(r.value.beyondCount).toBe(0)
    }
    const r2 = calculateDeviation([{ ...rows[0], amount: '63' }, { ...rows[1], amount: '37' }])
    expect(r2.ok && r2.value.beyondCount).toBe(2)
  })

  it('任一金额为空、目标合计不为 100、id 重复、总额为 0 都不计算', () => {
    const ok: LegacyRow = { id: 'a', name: 'A', role: '', target: '100', band: '25', amount: '1' }
    expect(calculateDeviation([{ ...ok, amount: '' }]).ok).toBe(false)
    expect(calculateDeviation([{ ...ok, target: '90' }]).ok).toBe(false)
    expect(calculateDeviation([{ ...ok, target: '50' }, { ...ok, target: '50' }]).ok).toBe(false)
    expect(calculateDeviation([{ ...ok, amount: '0' }]).ok).toBe(false)
    expect(calculateDeviation([{ ...ok, band: 'abc' }]).ok).toBe(false)
    expect(calculateDeviation([ok]).ok).toBe(true)
  })
})

describe('readLegacyMonthlyExpenseYuan', () => {
  it('年必要开支（万元）→ 元 / 月；没有或无效返回 null；只读', () => {
    const s = fakeStorage({ 'plan2026:cashflow': JSON.stringify({ expense: '12', reserve: '', yields: {} }) })
    expect(readLegacyMonthlyExpenseYuan(s)).toBe(10000)
    expect(s.writes).toEqual([])
    expect(readLegacyMonthlyExpenseYuan(fakeStorage({ 'plan2026:cashflow': JSON.stringify({ expense: '' }) }))).toBeNull()
    expect(readLegacyMonthlyExpenseYuan(fakeStorage({}))).toBeNull()
  })
})

// ───── 回归：code-review #5（不合理的资金分配比例不能当成已确认数据显示） ─────
describe('fund-split 校验', () => {
  const withSplit = (split: unknown) => readLegacyPlan(fakeStorage({ [LEGACY_KEYS.split]: JSON.stringify(split) }))
  it('单项超过 100、合计不为 100、合计为 0 → invalid，确认也不显示', () => {
    for (const s of [
      { base: '150', active: '20', reserve: '5' },
      { base: '70', active: '20', reserve: '5' },
      { base: '0', active: '0', reserve: '0' },
      { base: 'abc', active: '20', reserve: '80' },
    ]) {
      const r = withSplit(s)
      expect(r.split.state, JSON.stringify(s)).toBe('invalid')
      expect(r.status).toBe('invalid')
      expect(readLegacyPlan(fakeStorage({ [LEGACY_KEYS.split]: JSON.stringify(s) }), r.fingerprint).status).not.toBe('confirmed')
      expect(r.issues.join()).toContain('资金分配比例')
    }
  })
  it('合法的小数比例（合计 100）→ filled', () => {
    const r = withSplit({ base: '72.5', active: '22.5', reserve: '5' })
    expect(r.split).toEqual({ state: 'filled', value: { base: '72.5', active: '22.5', reserve: '5' } })
    expect(r.status).toBe('unconfirmed')
  })
})
