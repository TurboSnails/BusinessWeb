// 只读旧投资计划页（/investment-plan-2026）的本机记录，绝不回写。
// 事实（arch-r2 §2、signoff-product #1）：旧页挂载时会把默认值无条件写进 localStorage，
// 所以「键存在」≠「本人填写」。等于默认值的一律视为「未填写」；金额只在本人确认后展示。
// 旧持仓没有估值日期：有效性一律 unknown；按原记录算出的偏离只放在 calculatedDeviation，不判「安全」，不给操作提示。

type StorageLike = Pick<Storage, 'getItem'>

export const LEGACY_KEYS = {
  total: 'plan2026:fund-total',
  split: 'plan2026:fund-split',
  cap: 'plan2026:fund-cap',
  holdings: 'plan2026:holdings',
} as const
/** 只在本人展开应急金算式、点击「用旧页填过的年支出预填」时才读 */
export const LEGACY_CASHFLOW_KEY = 'plan2026:cashflow'

/** 旧页默认值（src/pages/InvestmentPlan2026.tsx 第 230—232 行）；这里复制常量而不 import 旧页，避免把旧页代码带进首屏 */
export const LEGACY_DEFAULTS = {
  total: '100',
  split: { base: '75', active: '20', reserve: '5' },
  cap: '5',
} as const

const MAX_ROWS = 200

export interface LegacySplit { base: string; active: string; reserve: string }
export interface LegacyRow { id: string; name: string; role: string; target: string; band: string; amount: string }

export type Field<T> =
  | { state: 'missing' }
  | { state: 'invalid' }
  /** 等于旧页默认值或为空：视为未填写 */
  | { state: 'default' }
  | { state: 'filled'; value: T }

export interface DeviationRow { name: string; targetPct: number; weightPct: number; relativeDevPct: number; bandPct: number; beyond: boolean }
export interface CalculatedDeviation { rows: DeviationRow[]; beyondCount: number }

export interface LegacySummary {
  status: 'missing' | 'invalid' | 'unfilled' | 'unconfirmed' | 'confirmed'
  total: Field<string>
  split: Field<LegacySplit>
  cap: Field<string>
  holdings: Field<LegacyRow[]>
  /** 有效性：旧记录没有估值日期，永远 unknown */
  deviation: 'unknown'
  /** 只是「按原记录计算」的数学结果；只有本人确认后才展示 */
  calculatedDeviation?: CalculatedDeviation
  hasValuationDate: false
  issues: string[]
  /** 已填写字段的规范化指纹（本机比较用，不上报） */
  fingerprint: string
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const numStr = (s: string): number => (/^\s*-?\d+(\.\d+)?\s*$/.test(s) ? Number(s) : NaN)
const nonNeg = (s: string): boolean => Number.isFinite(numStr(s)) && numStr(s) >= 0

function readRaw(s: StorageLike, key: string): { kind: 'missing' } | { kind: 'invalid' } | { kind: 'ok'; value: unknown } {
  let raw: string | null
  try {
    raw = s.getItem(key)
  } catch {
    return { kind: 'missing' }
  }
  if (raw === null) return { kind: 'missing' }
  try {
    return { kind: 'ok', value: JSON.parse(raw) as unknown }
  } catch {
    return { kind: 'invalid' }
  }
}

function parseTotal(v: unknown): Field<string> {
  if (typeof v !== 'string') return { state: 'invalid' }
  if (v.trim() === '' || v.trim() === LEGACY_DEFAULTS.total) return { state: 'default' }
  return nonNeg(v) ? { state: 'filled', value: v.trim() } : { state: 'invalid' }
}

function parseCap(v: unknown): Field<string> {
  if (typeof v !== 'string') return { state: 'invalid' }
  if (v.trim() === '' || v.trim() === LEGACY_DEFAULTS.cap) return { state: 'default' }
  return nonNeg(v) && numStr(v) <= 100 ? { state: 'filled', value: v.trim() } : { state: 'invalid' }
}

function parseSplit(v: unknown): Field<LegacySplit> {
  if (!isObj(v) || typeof v.base !== 'string' || typeof v.active !== 'string' || typeof v.reserve !== 'string') return { state: 'invalid' }
  const value = { base: v.base.trim(), active: v.active.trim(), reserve: v.reserve.trim() }
  const d = LEGACY_DEFAULTS.split
  if (value.base === d.base && value.active === d.active && value.reserve === d.reserve) return { state: 'default' }
  if (!value.base && !value.active && !value.reserve) return { state: 'default' }
  // 每项 0—100 的有限数，合计 100（容差 0.01）；本人确认归属也不能让不可能的分配变有效
  const nums = [value.base, value.active, value.reserve].map(numStr)
  if (!nums.every(n => Number.isFinite(n) && n >= 0 && n <= 100)) return { state: 'invalid' }
  if (Math.abs(nums.reduce((a, b) => a + b, 0) - 100) > 0.01) return { state: 'invalid' }
  return { state: 'filled', value }
}

function parseHoldings(v: unknown): Field<LegacyRow[]> {
  if (!Array.isArray(v) || v.length > MAX_ROWS) return { state: 'invalid' }
  const rows: LegacyRow[] = []
  for (const r of v) {
    if (!isObj(r)) return { state: 'invalid' }
    const fields = ['id', 'name', 'role', 'target', 'band', 'amount'] as const
    if (!fields.every(f => typeof r[f] === 'string' && (r[f] as string).length <= 200)) return { state: 'invalid' }
    rows.push({ id: r.id as string, name: r.name as string, role: r.role as string, target: r.target as string, band: r.band as string, amount: r.amount as string })
  }
  // 金额全空：只是模板（旧页任何一档模板都不带金额），视为未填写
  if (rows.every(r => r.amount.trim() === '')) return { state: 'default' }
  return { state: 'filled', value: rows }
}

/**
 * 按旧页同一公式（相对偏离 = (当前权重 − 目标) ÷ 目标 × 100，严格 |偏离| > 阈值才算越过）计算，
 * 但比旧页更严格：任一金额为空、目标合计不为 100、阈值不合理、id 重复或总额为 0 都不计算（不把空值当 0）。
 */
export function calculateDeviation(rows: LegacyRow[]): { ok: true; value: CalculatedDeviation } | { ok: false; issue: string } {
  if (!rows.length) return { ok: false, issue: '没有配置类别' }
  if (new Set(rows.map(r => r.id)).size !== rows.length) return { ok: false, issue: '有重复的配置类别' }
  if (rows.some(r => r.amount.trim() === '')) return { ok: false, issue: '有类别还没填金额，不能计算偏离' }
  if (!rows.every(r => nonNeg(r.amount))) return { ok: false, issue: '有金额不是有效数字' }
  const targets = rows.map(r => numStr(r.target))
  if (!targets.every(t => Number.isFinite(t) && t > 0)) return { ok: false, issue: '有目标占比不是正数' }
  if (Math.abs(targets.reduce((a, b) => a + b, 0) - 100) > 0.01) return { ok: false, issue: '目标占比合计不是 100%' }
  const bands = rows.map(r => numStr(r.band))
  if (!bands.every(b => Number.isFinite(b) && b > 0 && b <= 100)) return { ok: false, issue: '有偏离阈值不合理' }
  const amounts = rows.map(r => numStr(r.amount))
  const total = amounts.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return { ok: false, issue: '金额合计为 0' }
  const out = rows.map((r, i) => {
    const weightPct = (amounts[i] / total) * 100
    const relativeDevPct = ((weightPct - targets[i]) / targets[i]) * 100
    return { name: r.name, targetPct: targets[i], weightPct, relativeDevPct, bandPct: bands[i], beyond: Math.abs(relativeDevPct) > bands[i] }
  })
  return { ok: true, value: { rows: out, beyondCount: out.filter(r => r.beyond).length } }
}

/** FNV-1a 32 位；只用于本机比较「确认后数据是否变了」 */
export function fingerprintOf(value: unknown): string {
  const text = JSON.stringify(value)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const filledValue = <T>(f: Field<T>): T | null => (f.state === 'filled' ? f.value : null)

export function readLegacyPlan(s: StorageLike | null, confirmedFingerprint?: string): LegacySummary {
  const blank: LegacySummary = {
    status: 'missing',
    total: { state: 'missing' },
    split: { state: 'missing' },
    cap: { state: 'missing' },
    holdings: { state: 'missing' },
    deviation: 'unknown',
    hasValuationDate: false,
    issues: [],
    fingerprint: fingerprintOf(null),
  }
  if (!s) return blank
  const parse = <T>(key: string, fn: (v: unknown) => Field<T>): Field<T> => {
    const r = readRaw(s, key)
    return r.kind === 'missing' ? { state: 'missing' } : r.kind === 'invalid' ? { state: 'invalid' } : fn(r.value)
  }
  const total = parse(LEGACY_KEYS.total, parseTotal)
  const split = parse(LEGACY_KEYS.split, parseSplit)
  const cap = parse(LEGACY_KEYS.cap, parseCap)
  const holdings = parse(LEGACY_KEYS.holdings, parseHoldings)
  const fields = [total, split, cap, holdings]
  const issues: string[] = []
  if (total.state === 'invalid') issues.push('参考总额无法识别')
  if (split.state === 'invalid') issues.push('资金分配比例无法识别')
  if (cap.state === 'invalid') issues.push('单只上限无法识别')
  if (holdings.state === 'invalid') issues.push('配置底仓记录无法识别')

  const fingerprint = fingerprintOf({ t: filledValue(total), s: filledValue(split), c: filledValue(cap), h: filledValue(holdings) })
  let calculatedDeviation: CalculatedDeviation | undefined
  if (holdings.state === 'filled') {
    const r = calculateDeviation(holdings.value)
    if (r.ok) calculatedDeviation = r.value
    else issues.push(r.issue)
  }

  let status: LegacySummary['status']
  if (fields.every(f => f.state === 'missing')) status = 'missing'
  else if (!fields.some(f => f.state === 'filled')) status = fields.some(f => f.state === 'invalid') ? 'invalid' : 'unfilled'
  else status = confirmedFingerprint && confirmedFingerprint === fingerprint ? 'confirmed' : 'unconfirmed'

  return { status, total, split, cap, holdings, deviation: 'unknown', calculatedDeviation, hasValuationDate: false, issues, fingerprint }
}

/** 旧页现金流工具里的「年必要开支（万元）」换算成元 / 月；没有或无效返回 null。只读，不回写 */
export function readLegacyMonthlyExpenseYuan(s: StorageLike | null): number | null {
  if (!s) return null
  const r = readRaw(s, LEGACY_CASHFLOW_KEY)
  if (r.kind !== 'ok' || !isObj(r.value) || typeof r.value.expense !== 'string') return null
  const wan = numStr(r.value.expense)
  if (!Number.isFinite(wan) || wan <= 0) return null
  return Math.round((wan * 10000) / 12)
}
