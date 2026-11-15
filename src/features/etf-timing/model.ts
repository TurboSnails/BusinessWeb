// /lab/etf-timing 的数据模型：public/data/etf-timing.json（scripts/research/etf-strategy-oos/publish.mjs 生成）。
// 观察中、未验证；页面只陈述规则状态与历史统计，不输出买卖指令。

export type Signal = { date: string; side: 'buy' | 'sell' }
export type RuleState = { holding: boolean; pending: 'buy' | 'sell' | null; lastSignal: Signal | null }
export type ShadowItem = { code: string; name: string; close: number; date: string; hs: RuleState; cyb: RuleState }
export type ShadowLatest = {
  asOf: string
  generatedAt: string
  complete: boolean
  universeVersion?: string
  timing: { hs300Bull: boolean | null; cybBull: boolean | null }
  summary: { n: number; hsHolding: number; cybHolding: number; missing: number }
  items: ShadowItem[]
  missing: Array<{ code: string; error: string }>
}
export type HistoryRow = { asOf: string; complete: boolean; hs300Bull: boolean | null; cybBull: boolean | null; n: number; hsHolding: number; cybHolding: number; missing: number }
export type WindowStat = { years: number; total: number; annual: number | null; dd: number } | null
export type StrategyKey = 'hold' | 'hs' | 'cyb' | 'macd' | 'ma20'
export type ResearchRow = { code: string; name: string; start: string; end: string; windows: Record<string, Record<StrategyKey, WindowStat>> }
export type Verdict = { code: string; name: string; ddPass: boolean; annualPass: boolean }
export type Research = { generatedAt: string; windows: Array<[string, string, string | null]>; verdict: Verdict[]; results: ResearchRow[]; errors: string[] }
export type EtfTiming = { version: 1; generatedAt: string; latest: ShadowLatest | null; history: HistoryRow[]; research: Research | null }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string'

function asRuleState(x: unknown): RuleState | null {
  if (!isObj(x) || typeof x.holding !== 'boolean') return null
  const ls = x.lastSignal
  const side = isObj(ls) ? ls.side : undefined
  const lastSignal: Signal | null = isObj(ls) && isStr(ls.date) && (side === 'buy' || side === 'sell') ? { date: ls.date, side } : null
  const pending = x.pending === 'buy' || x.pending === 'sell' ? x.pending : null
  return { holding: x.holding, pending, lastSignal }
}

/** 宽松校验：结构不对返回 null；单条坏数据丢弃，不让整页报错 */
export function asEtfTiming(body: unknown): EtfTiming | null {
  if (!isObj(body) || body.version !== 1 || !Array.isArray(body.history)) return null
  let latest: ShadowLatest | null = null
  const l = body.latest
  if (isObj(l) && isStr(l.asOf) && Array.isArray(l.items) && isObj(l.timing) && isObj(l.summary)) {
    const items: ShadowItem[] = []
    for (const it of l.items) {
      if (!isObj(it) || !isStr(it.code) || !isStr(it.name)) continue
      const hs = asRuleState(it.hs), cyb = asRuleState(it.cyb)
      if (hs && cyb) items.push({ code: it.code, name: it.name, close: Number(it.close), date: isStr(it.date) ? it.date : l.asOf, hs, cyb })
    }
    const t = l.timing as Record<string, unknown>, s = l.summary as Record<string, unknown>
    latest = {
      asOf: l.asOf, generatedAt: isStr(l.generatedAt) ? l.generatedAt : '', complete: l.complete === true, universeVersion: isStr(l.universeVersion) ? l.universeVersion : undefined,
      timing: { hs300Bull: typeof t.hs300Bull === 'boolean' ? t.hs300Bull : null, cybBull: typeof t.cybBull === 'boolean' ? t.cybBull : null },
      summary: { n: Number(s.n) || items.length, hsHolding: Number(s.hsHolding) || 0, cybHolding: Number(s.cybHolding) || 0, missing: Number(s.missing) || 0 },
      items, missing: Array.isArray(l.missing) ? (l.missing as Array<{ code: string; error: string }>).filter((m) => isObj(m) && isStr(m.code)) : [],
    }
  }
  const history = (body.history as unknown[]).filter((h): h is HistoryRow => isObj(h) && isStr(h.asOf))
  let research: Research | null = null
  const r = body.research
  if (isObj(r) && Array.isArray(r.windows) && Array.isArray(r.results) && Array.isArray(r.verdict)) {
    research = {
      generatedAt: isStr(r.generatedAt) ? r.generatedAt : '',
      windows: r.windows as Research['windows'],
      verdict: (r.verdict as unknown[]).filter((v): v is Verdict => isObj(v) && isStr(v.code)),
      results: (r.results as unknown[]).filter((x): x is ResearchRow => isObj(x) && isStr(x.code) && isObj(x.windows)),
      errors: Array.isArray(r.errors) ? (r.errors as unknown[]).filter(isStr) : [],
    }
  }
  return { version: 1, generatedAt: isStr(body.generatedAt) ? body.generatedAt : '', latest, history, research }
}

export type ItemFilter = 'all' | 'holding' | 'recent'

/** 最近一次信号是否在 asOf 前 7 天内（含） */
export function isRecent(sig: Signal | null, asOf: string): boolean {
  if (!sig) return false
  const d = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${sig.date}T00:00:00Z`)) / 864e5
  return d >= 0 && d <= 7
}

export function filterItems(items: ShadowItem[], f: ItemFilter, asOf: string): ShadowItem[] {
  const list = f === 'holding' ? items.filter((i) => i.hs.holding || i.cyb.holding) : f === 'recent' ? items.filter((i) => isRecent(i.hs.lastSignal, asOf) || isRecent(i.cyb.lastSignal, asOf)) : items
  return [...list].sort((a, b) => Number(b.hs.holding) - Number(a.hs.holding) || a.code.localeCompare(b.code))
}

/** 事先写定的验收标准：三段大跌回撤 ≤ 持有的 70%；全期年化 ≥ 持有 −1 个百分点 */
export const CRITERIA = '三段大跌（2015 股灾、2018 熊市、2021—2024 下跌）里，择时最大回撤都不超过一直持有的 70%；2011 年起全期扣费后年化不低于一直持有 −1 个百分点。'

export function verdictSummary(v: Verdict[]): { dd: number; annual: number; both: number; total: number } {
  return { dd: v.filter((x) => x.ddPass).length, annual: v.filter((x) => x.annualPass).length, both: v.filter((x) => x.ddPass && x.annualPass).length, total: v.length }
}

/** asOf 距今天数（北京时间日历日） */
export function staleDays(asOf: string, now: Date): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 864e5)
}

export const fmt1 = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(1))
export const signed = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}`)
