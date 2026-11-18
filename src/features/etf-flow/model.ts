export interface FlowPoint {
  date: string
  flow_all: number
  flow_broad: number | null
  index: number | null
}

export interface EtfFlowData {
  series: FlowPoint[]
  kpi: { all: { yesterday: number; cum60: number }; broad: { yesterday: number; cum60: number } }
  note: string
  updated: string
  sample?: boolean
}

export const EMPTY_FLOW: EtfFlowData = {
  series: [],
  kpi: { all: { yesterday: 0, cum60: 0 }, broad: { yesterday: 0, cum60: 0 } },
  note: '',
  updated: '',
}

export function asEtfFlow(body: unknown): EtfFlowData | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  if (!Array.isArray(o.series)) return null
  return {
    series: o.series as FlowPoint[],
    kpi: (o.kpi as EtfFlowData['kpi']) ?? EMPTY_FLOW.kpi,
    note: typeof o.note === 'string' ? o.note : '',
    updated: typeof o.updated === 'string' ? o.updated : '',
    sample: Boolean(o.sample),
  }
}

export const fmtYi = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
