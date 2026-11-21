export interface FlowPoint {
  date: string
  flow_all: number | null
  flow_broad: number | null
  index: number | null
}

export function kpiOf(series: FlowPoint[], key: 'flow_all' | 'flow_broad') {
  const window = series.slice(-60)
  const values = window.map(row => row[key]).filter((v): v is number => v !== null && Number.isFinite(v))
  return {
    yesterday: window.at(-1)?.[key] ?? null,
    cum60: values.length === 60 ? Number(values.reduce((sum, v) => sum + v, 0).toFixed(2)) : null,
    covered: values.length,
  }
}

export interface EtfFlowData {
  series: FlowPoint[]
  kpi: Record<'all' | 'broad', ReturnType<typeof kpiOf>>
  note: string
  updated: string
  sample?: boolean
}

const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null

export function asEtfFlow(body: unknown): EtfFlowData | null {
  if (!body || typeof body !== 'object' || !('series' in body) || !Array.isArray(body.series)) return null
  const series: FlowPoint[] = []
  for (const row of body.series) {
    if (!row || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null
    if (series.length && series[series.length - 1].date >= row.date) return null
    series.push({ date: row.date, flow_all: finite(row.flow_all), flow_broad: finite(row.flow_broad), index: finite(row.index) })
  }
  return {
    series,
    kpi: { all: kpiOf(series, 'flow_all'), broad: kpiOf(series, 'flow_broad') },
    note: 'note' in body && typeof body.note === 'string' ? body.note : '',
    updated: 'updated' in body && typeof body.updated === 'string' ? body.updated : '',
    sample: 'sample' in body && body.sample === true,
  }
}

export const fmtYi = (v: number | null): string => v == null ? '暂无数据' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`
