export type Market = 'us' | 'cn' | 'hk'
export type Window = 'fourWeeks' | 'twelveWeeks' | 'lastQuarter' | 'threeMonths'
export type Point = { date: string; value: number }
export type Metric = Point & {
  unit: string
  source?: string
  stale: boolean
  changes: Partial<Record<Window, { before: Point; difference: number }>>
}
export type MarketData = {
  metrics: Record<string, Metric | undefined>
  asOf: string | null
  failedSources: string[]
}
export type MacroData = Record<Market, MarketData>
export type DataState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: MacroData }

export type Tone = 'positive' | 'neutral' | 'caution' | 'negative' | 'unknown'
export type Signal = { label: string; tone: Tone; detail: string }
export type Evidence = { key: string; label: string; metric?: Metric }
export type SubIndex = Signal & { id: string; title: string; score: number | null; evidence: Evidence[] }
export type PostureReview = {
  guidance: string
  risk: string
  counterpoint: string
  counterEvidence: Evidence[]
  market: Signal & { evidence: Evidence[] }
  reassess: { label: string; detail: string }[]
}
export type MacroView = {
  market: Market
  asOf: string | null
  failedSources: string[]
  economy: Signal
  posture: Signal
  indices: SubIndex[]
  review?: PostureReview
}
export type Candidate = {
  name: string
  category: string
  coverage: '站内已有' | '历史待补' | '待接入'
  description: string
  source?: string
}
