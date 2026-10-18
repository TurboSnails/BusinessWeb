import { z } from 'zod'
import { safeUrl, validDate, type Market, type ManualDimension, type Observation } from './engine'
import { parseAutomaticSnapshot, parseBreadthSnapshot, type AutomaticSnapshot, type BreadthSnapshot } from './automation'

export const automaticSchema = z.custom<AutomaticSnapshot>(value => { try { parseAutomaticSnapshot(value); return true } catch { return false } })
export const breadthSchema = z.custom<BreadthSnapshot>(value => { try { parseBreadthSnapshot(value); return true } catch { return false } })

const date = z.string().refine(validDate)
const bar = z.object({ date, close: z.number().positive().finite(), volume: z.number().nonnegative().finite() })
const price = z.object({ week: z.array(bar).max(1000), month: z.array(bar).max(1000), source: z.string().refine(safeUrl), fetchedAt: z.string().datetime() })
export const snapshotSchema = z.object({ schemaVersion: z.literal(1), generatedAt: z.string().datetime(), markets: z.object({ csi300: price.optional(), hsi: price.optional(), hstech: price.optional() }), warnings: z.array(z.string()) })
const series = z.object({ latest: z.object({ date, value: z.number().finite() }), history: z.array(z.tuple([date, z.number().finite()])), source: z.string().optional() })
export const macroSchema = z.object({ series: z.record(z.string(), series) })
const observation = z.object({ date: z.string(), source: z.string().max(2000), values: z.record(z.string(), z.number().finite()) })
const observations = z.object({ valuation: observation.optional(), funding: observation.optional(), breadth: observation.optional() })
const budgetSchema = z.object({ capital: z.number().nonnegative().finite().nullable(), maxDrawdown: z.number().min(0).max(100).nullable(), maxPosition: z.number().min(0).max(100).nullable(), currentPosition: z.number().min(0).max(100).nullable() })
const evidence = z.object({ id: z.string(), name: z.string(), signal: z.enum(['bottom', 'positive', 'risk', 'neutral', 'missing']), detail: z.string(), date: z.string().optional(), source: z.string().optional(), available: z.boolean() })
const shadow = z.object({ version: z.literal('cycle-shadow-v2'), valuationZone: z.string(), trendState: z.string(), riskGate: z.string(), dataQuality: z.string(), confirmations: z.number().int().min(0).max(2), weakWeeks: z.number().int().min(0).max(2) })
const reportMarket = z.object({ legacyState: z.string(), shadow, rows: z.array(evidence).length(6) })
export const reportSchema = z.object({ schemaVersion: z.literal(1), generatedAt: z.string().datetime(), issues: z.array(z.string()), records: z.array(z.object({ weekEnding: date, decisionAt: z.string().datetime(), ruleVersion: z.literal('cycle-shadow-v2'), inputHash: z.string().regex(/^[a-f0-9]{64}$/), markets: z.object({ csi300: reportMarket, hsi: reportMarket, hstech: reportMarket }) })).max(52) })
export type AutomaticReport = z.infer<typeof reportSchema>
const logSchema = z.object({ id: z.string(), savedAt: z.string().datetime(), market: z.enum(['csi300', 'hsi', 'hstech']), version: z.string(), state: z.string(), note: z.string().max(2000), rows: z.array(evidence).length(6), budget: budgetSchema, observations, inputs: z.object({ price: price.optional(), cn: macroSchema.nullable(), us: macroSchema.nullable(), automatic: automaticSchema.nullable().optional(), breadth: breadthSchema.nullable().optional(), manualOnly: z.array(z.enum(['valuation', 'funding', 'breadth'])).optional() }) })
const stateSchema = z.object({ schemaVersion: z.literal(1), observations: z.object({ csi300: observations.optional(), hsi: observations.optional(), hstech: observations.optional() }), budgets: z.object({ csi300: budgetSchema.optional(), hsi: budgetSchema.optional(), hstech: budgetSchema.optional() }), logs: z.array(logSchema).max(52) })
export type Budget = z.infer<typeof budgetSchema>
export type ReviewLog = z.infer<typeof logSchema>
export interface LocalState { schemaVersion: 1; observations: Partial<Record<Market, Partial<Record<ManualDimension, Observation>>>>; budgets: Partial<Record<Market, Budget>>; logs: ReviewLog[] }
export const EMPTY_BUDGET: Budget = { capital: null, maxDrawdown: null, maxPosition: null, currentPosition: null }
export const EMPTY_STATE: LocalState = { schemaVersion: 1, observations: {}, budgets: {}, logs: [] }
const KEY = 'businessweb.market-cycle.v1'
export function loadState(): { state: LocalState; error: string } {
  try {
    const raw = localStorage.getItem(KEY)
    return { state: raw ? stateSchema.parse(JSON.parse(raw)) : EMPTY_STATE, error: '' }
  } catch { return { state: EMPTY_STATE, error: '本机记录无法读取；原记录未覆盖。可先导出浏览器中的原数据，再重新保存。' } }
}
export function persistState(state: LocalState): void { localStorage.setItem(KEY, JSON.stringify(stateSchema.parse(state))) }
export function parseBackup(raw: string): LocalState { return stateSchema.parse(JSON.parse(raw)) }
