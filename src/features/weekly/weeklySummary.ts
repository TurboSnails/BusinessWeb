// 「每周变化摘要」：上一个完整自然周（北京时间周一至周日）与再前一周相比，哪些可复核的事实变了。
// 纯函数，不读 DOM / localStorage / 网络；站内（候选池「本周变化」）与服务端每周邮件（server/weekly-digest.ts）共用。
// 只列确定性事实，每条带日期和来源；不做预测、不写方向性措辞，是复核提醒，不是买卖指令。
//
// 数据来源（都是站点自己的静态 JSON 或候选池记录）：
// - 信号台账 public/data/signal-ledger-YYYY.json：每周一期的研究评级档位与价格（评级变化）
// - 候选池记录：决策记录（新写的记录、下周到期的复查）、价位提醒规则 + 收盘价观测（本周触及条件价）
// - 牛熊周期自动周报 public/data/market-cycle-report.json：每周一条记录（周状态变化）
// - 宏观快照 public/data/macro-us.json：六项风险信号的历史观测，按阶段规则算周末阶段（阶段变化）
// - 财报前瞻 public/data/earnings-calendar.json：下周（摘要周的下一周）候选池与「条件关注」以上公司的财报日（下周财报）
import { computeStage, SIGNALS } from '../macro/stages.js'
import { codeKey, MARKET_LABEL, venueOf, type Venue } from '../candidates/markets.js'
import { reached, type PriceObservation } from '../candidates/priceAlert.js'
import { validAlertRule, type AlertDirection, type CandidateItem, type CandidateMarket } from '../candidates/validation.js'
import type { PlanWeeklyFacts } from '../investment-plan/weekly.js'

export const EMPTY_TEXT = '本周没有需要复核的变化'
export const FOOTER = '观察提醒，不是买卖指令；每条写明数据日期与来源。'
/** 公司库评级变化：每组最多列出这么多家，其余只计数 */
export const LIBRARY_TOP = 8

// ── 周的边界（北京时间，ISO 周：周一至周日） ──
const DAY_MS = 86_400_000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const utc = (day: string): number => Date.parse(`${day}T00:00:00Z`)
export const addDays = (day: string, n: number): string => new Date(utc(day) + n * DAY_MS).toISOString().slice(0, 10)
export const beijingDay = (now: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
/** ISO 时间戳 → 北京日期 */
export const beijingDayOf = (iso: string): string => { const t = Date.parse(iso); return Number.isFinite(t) ? beijingDay(new Date(t)) : '' }
/** 这一天所在周的周一 */
export const mondayOf = (day: string): string => addDays(day, -((new Date(utc(day)).getUTCDay() + 6) % 7))

/** ISO 周编号，如 2026-W46（周四所在的年份为周年） */
export function isoWeekId(day: string): string {
  const thursday = addDays(mondayOf(day), 3)
  const year = Number(thursday.slice(0, 4))
  const week = Math.floor((utc(thursday) - utc(`${year}-01-01`)) / DAY_MS / 7) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

export interface WeekRange {
  /** ISO 周编号，如 2026-W46 */
  id: string
  /** 本周（被总结的那一周）周一、周日 */
  start: string; end: string
  /** 再前一周，用来比较 */
  prevStart: string; prevEnd: string
  /** 下一周（列出「下周到期的复查」） */
  nextStart: string; nextEnd: string
}

export function weekRange(anyDay: string): WeekRange {
  const start = mondayOf(anyDay)
  return { id: isoWeekId(start), start, end: addDays(start, 6), prevStart: addDays(start, -7), prevEnd: addDays(start, -1), nextStart: addDays(start, 7), nextEnd: addDays(start, 13) }
}

/** 已经结束的最近一个完整周：北京时间今天所在周的前一周（周一早上看的是刚结束的上周） */
export const completedWeek = (now: Date): WeekRange => weekRange(addDays(mondayOf(beijingDay(now)), -7))

const inWeek = (day: string, start: string, end: string): boolean => DAY_RE.test(day) && day >= start && day <= end
const shortDay = (day: string): string => day.slice(5)

// ── 输入数据的最小形状（与各 JSON 一致，避免依赖页面数据层） ──
/** 信号台账一行：[价格, 评级档位下标|null, …]（src/features/signals/ledger.ts） */
export type LedgerRowLike = [number, number | null, ...unknown[]]
export interface LedgerLike { schemaVersion: 1; snapshots: Record<string, Record<string, LedgerRowLike>> }
/** 与 src/features/signals/ledger.ts 的 RATING_CODES 同序（有测试保证） */
export const RATING_CODES = ['优先关注', '条件关注', '观察', '回避', '未估值'] as const

export interface CycleShadowLike { trendState: string; riskGate: string; valuationZone: string }
export interface CycleRecordLike { weekEnding: string; decisionAt: string; ruleVersion: string; markets: Record<string, { legacyState: string; shadow: CycleShadowLike } | undefined> }
export interface CycleReportLike { schemaVersion: 1; records: CycleRecordLike[] }
export const CYCLE_MARKET_LABEL: Record<string, string> = { csi300: 'A股 · 沪深300', hsi: '港股 · 恒生指数', hstech: '港股 · 恒生科技', spx: '美股 · 标普500', ndx: '美股 · 纳指100' }

export interface MacroSeriesLike { latest?: { date: string; value: number }; history?: [string, number][] }
export interface MacroLike { generatedAt?: string; series: Record<string, MacroSeriesLike | undefined> }
/** 宏观阶段的六项信号（与 indicators.ts 的 signalValues 一致） */
export const MACRO_SIGNAL_IDS = ['sahm', 'claims', 'hy', 'vix', 'dd', 'kre'] as const

/** 财报前瞻 earnings-calendar.json 里这里用到的字段（scripts/earnings-calendar.mjs 生成） */
export interface EarningsEntryLike { market: CandidateMarket; code: string; name: string; date: string; time: string; confirmed: boolean | null; period: string | null; dateSource: string; research?: { rating?: string | null } | null }
export interface EarningsCalendarLike { schemaVersion: 1; generatedAt: string; items: EarningsEntryLike[]; sources?: Record<string, { label?: string } | undefined> }
/** 下周财报：最多列出这么多家（候选池在前，再补「条件关注」以上），其余只计数「另有 N 家」 */
export const EARNINGS_TOP = 12

/** 公司名称与链接：键为台账键 venue:CODE（大写） */
export interface CompanyInfo { name: string; market: CandidateMarket; code: string }
export type CompanyIndex = Map<string, CompanyInfo>
export const ledgerKey = (venue: Venue, code: string): string => `${venue}:${code.toUpperCase()}`

/** 公司参考数据（public/data/company-refs.json 的 items，键 market:code）→ 台账键索引；同一家先出现的市场优先 */
export function companyIndexFrom(entries: Iterable<{ market: CandidateMarket; code: string; name: string }>): CompanyIndex {
  const out: CompanyIndex = new Map()
  for (const c of entries) {
    const venue = venueOf(c.market)
    for (const k of new Set([ledgerKey(venue, c.code), ledgerKey(venue, codeKey(venue, c.code))])) if (!out.has(k)) out.set(k, { name: c.name, market: c.market, code: c.code })
  }
  return out
}

/** 本周触及条件价：一条收盘价观测满足了候选的价位条件 */
export interface PriceHit { market: CandidateMarket; code: string; date: string; kind: AlertDirection; threshold: number; currency?: string; price?: number; source: string }

export interface WeeklyInputs {
  week: WeekRange
  /** 我的候选（本机或云端快照）；不传或为空时不生成候选池一节 */
  candidates?: CandidateItem[]
  /** 本周触及条件价（weeklyPriceHits 的结果，服务端可并入每日提醒的发送记录） */
  priceHits?: PriceHit[]
  ledger?: LedgerLike | null
  cycle?: CycleReportLike | null
  macro?: MacroLike | null
  /** 财报前瞻；不传时不生成「下周财报」一节 */
  earnings?: EarningsCalendarLike | null
  companies?: CompanyIndex
  /** 站长计划检查日投影（无金额）；不传则访客摘要无此节 */
  plan?: PlanWeeklyFacts | null
}

export type SectionId = 'candidates' | 'library' | 'cycle' | 'macro' | 'earnings' | 'plan'
export interface WeeklyLine {
  kind: 'rating' | 'price-hit' | 'decision' | 'review-next' | 'library-up' | 'library-down' | 'cycle' | 'macro' | 'earnings' | 'plan-review'
  text: string
  /** 依据的数据日期 YYYY-MM-DD */
  date: string
  /** 来源说明（文件或记录） */
  source: string
  /** 站内相对链接 */
  href?: string
}
export interface WeeklySection {
  id: SectionId; title: string; lines: WeeklyLine[]
  /** 一句概括，如「共 12 家评级档位变化」 */ summary?: string
  /** 只计数未列出的条数 */ more?: number
  /** 背景信息（下周财报）：不是“变化”，不计入事项数、不决定是否发信 */ context?: boolean
}
export interface WeeklySummary {
  week: WeekRange; sections: WeeklySection[]
  /** 列出的变化事项数（不含 more，不含背景信息节） */ total: number
  /** 没有变化事项（背景信息节可能仍在 sections 里） */ empty: boolean
  emptyText: string
  /** 数据缺口说明，不计入事项 */ notes: string[]
}

const companyHref = (c: { market: string; code: string }): string => `/research-notes/${c.market}/${encodeURIComponent(c.code)}`
const label = (name: string | undefined, code: string, market: CandidateMarket): string => `${name ? `${name}（` : ''}${code} · ${MARKET_LABEL[market]}${name ? '）' : ''}`
const fmt = (n: number): string => n.toLocaleString('zh-CN', { maximumFractionDigits: 4 })

// ── 信号台账：选出本周一期与上一期 ──
export function ledgerPair(ledger: LedgerLike | null | undefined, week: WeekRange): { prev: string; cur: string } | null {
  if (!ledger?.snapshots) return null
  const dates = Object.keys(ledger.snapshots).filter(d => DAY_RE.test(d)).sort()
  const cur = dates.filter(d => inWeek(d, week.start, week.end)).at(-1)
  const prev = dates.filter(d => d < week.start).at(-1)
  return cur && prev ? { prev, cur } : null
}
const ratingName = (i: number | null | undefined): string | null => (i == null || !RATING_CODES[i] ? null : RATING_CODES[i])

interface RatingChange { key: string; before: number; after: number }
function ratingChanges(ledger: LedgerLike, pair: { prev: string; cur: string }): RatingChange[] {
  const a = ledger.snapshots[pair.prev] ?? {}, b = ledger.snapshots[pair.cur] ?? {}
  const out: RatingChange[] = []
  for (const key of Object.keys(b).sort()) {
    const before = a[key]?.[1], after = b[key]?.[1]
    if (before == null || after == null || before === after || !ratingName(before) || !ratingName(after)) continue
    out.push({ key, before, after })
  }
  return out
}

// ── 价位提醒：本周哪条收盘价观测触及了条件价 ──
/**
 * @param observations 每家候选的收盘价观测（market:code → 观测），与「今日待处理」同一来源
 * 只看规则是否开启与条件本身；暂停 / 已看过不影响「这一周确实触及过」这个事实。
 */
export function weeklyPriceHits(items: CandidateItem[], observations: Map<string, PriceObservation[]>, week: WeekRange): PriceHit[] {
  const out: PriceHit[] = []
  for (const item of items) {
    const rule = item.alert
    if (!rule || !rule.enabled || !validAlertRule(rule)) continue
    const hits = (observations.get(`${item.market}:${item.code}`) ?? [])
      .filter(o => !o.intraday && o.currency === rule.currency && Number.isFinite(o.price) && o.price > 0 && inWeek(o.date, week.start, week.end) && reached(rule.kind, o.price, rule.threshold))
    const latest = hits.reduce<PriceObservation | undefined>((best, o) => (!best || o.date > best.date ? o : best), undefined)
    if (latest) out.push({ market: item.market, code: item.code, date: latest.date, kind: rule.kind, threshold: rule.threshold, currency: rule.currency, price: latest.price, source: latest.source })
  }
  return out
}

/** 每日提醒发送记录的去重键 price-hit|market:code|收盘日|方向|条件价 → 触及记录（解析失败返回 null） */
export function priceHitFromFingerprint(fingerprint: string): Omit<PriceHit, 'source'> | null {
  const m = /^price-hit\|(us|cn|hk|adr|ndx):([^|]+)\|(\d{4}-\d{2}-\d{2})\|(price-below|price-above)\|([0-9.]+)$/.exec(fingerprint)
  if (!m) return null
  const threshold = Number(m[5])
  return Number.isFinite(threshold) && threshold > 0 ? { market: m[1] as CandidateMarket, code: m[2], date: m[3], kind: m[4] as AlertDirection, threshold } : null
}

/** 合并两份触及记录：同一家候选只留一条，优先带收盘价的那条（再取日期较晚的） */
export function mergePriceHits(primary: PriceHit[], extra: PriceHit[]): PriceHit[] {
  const out = new Map<string, PriceHit>()
  for (const h of [...primary, ...extra]) {
    const k = `${h.market}:${h.code}`
    const old = out.get(k)
    if (!old || (old.price == null && h.price != null) || (old.price == null) === (h.price == null) && h.date > old.date) out.set(k, h)
  }
  return [...out.values()]
}

// ── 宏观：某一天（含）之前各信号最近的观测 → 阶段 ──
export function macroStageAsOf(macro: MacroLike, day: string): { level: number; name: string; score: number; values: Record<string, { value: number; date: string }> } {
  const values: Record<string, { value: number; date: string }> = {}
  for (const id of MACRO_SIGNAL_IDS) {
    const s = macro.series[id]
    const points: [string, number][] = [...(s?.history ?? []), ...(s?.latest ? [[s.latest.date, s.latest.value] as [string, number]] : [])]
    let best: [string, number] | undefined
    for (const p of points) if (DAY_RE.test(p[0]) && Number.isFinite(p[1]) && p[0] <= day && (!best || p[0] > best[0])) best = p
    if (best) values[id] = { value: best[1], date: best[0] }
  }
  const { stage, score } = computeStage(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.value])))
  return { level: stage.level, name: stage.name, score, values }
}

/** 生成摘要：各节没有事项时省略；全部为空时 empty = true，显示 EMPTY_TEXT */
/**
 * 下周财报：摘要周的下一周（week.nextStart–nextEnd）内，只限候选池公司与站内评级「优先关注 / 优先跟踪 / 条件关注」的公司；
 * 候选池在前，合计最多列 EARNINGS_TOP 家，其余写「另有 N 家」。
 * 只写日期、时段、报告期与日期是否确认；不写一致预期数字（摘要里不判断“好坏”）。
 * 这一节是背景信息（context）：不计入事项数，也不会单独触发每周邮件。
 */
export function earningsSection(earnings: EarningsCalendarLike, week: WeekRange, candidates: CandidateItem[]): WeeklySection | null {
  const venueKey = (market: CandidateMarket, code: string): string => { const v = venueOf(market); return `${v}:${codeKey(v, code)}` }
  const pool = new Set(candidates.map(c => venueKey(c.market, c.code)))
  const rows = earnings.items.filter(i => inWeek(i.date, week.nextStart, week.nextEnd))
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))
  const mine = rows.filter(i => pool.has(venueKey(i.market, i.code)))
  const rated = rows.filter(i => !pool.has(venueKey(i.market, i.code)) && /优先关注|优先跟踪|条件关注/.test(i.research?.rating ?? ''))
  if (!mine.length && !rated.length) return null
  const generated = earnings.generatedAt.slice(0, 10)
  const line = (i: EarningsEntryLike, inPool: boolean): WeeklyLine => {
    const time = i.time === 'bmo' ? ' 盘前' : i.time === 'amc' ? ' 盘后' : ''
    const conf = i.confirmed === true ? '日期已确认' : i.confirmed === false ? '日期为预估' : '确认状态未知'
    const tag = inPool ? '候选池' : `站内评级「${i.research?.rating}」`
    return {
      kind: 'earnings', date: i.date, href: companyHref(i),
      source: `财报前瞻 earnings-calendar.json（${earnings.sources?.[i.dateSource]?.label ?? i.dateSource}，生成于 ${generated}）`,
      text: `${label(i.name, i.code, i.market)}：${shortDay(i.date)}${time}公布${i.period ? ` ${i.period}` : ''}（${conf}；${tag}）`,
    }
  }
  const all = [...mine.map(i => line(i, true)), ...rated.map(i => line(i, false))]
  const listed = all.slice(0, EARNINGS_TOP)
  const more = all.length - listed.length
  return {
    id: 'earnings', title: '下周财报', lines: listed, more, context: true,
    summary: `${shortDay(week.nextStart)} 至 ${shortDay(week.nextEnd)}：候选池 ${mine.length} 家、条件关注以上 ${rated.length} 家有财报${more > 0 ? `；另有 ${more} 家未逐条列出` : ''}。背景信息，不计入变化项数；详见 /earnings。`,
  }
}

/** 站长计划检查日：context 节，不计变化项数，不单独触发发信 */
export function planReviewSection(facts: PlanWeeklyFacts): WeeklySection | null {
  if (!facts.dueDate && !facts.upcomingDate) return null
  const date = facts.dueDate ?? (facts.upcomingDate as string)
  const text = facts.dueDate
    ? `我的计划：检查日 ${facts.dueDate} 已到，仍待核对。`
    : `我的计划：未来 7 天内有检查日 ${facts.upcomingDate}。`
  const lines: WeeklyLine[] = [{
    kind: 'plan-review',
    date,
    source: `站长已同步的计划（同步日期 ${facts.snapshotDate}）`,
    href: '/invest/my-plan',
    text: facts.deferred ? `${text}上次记为暂缓，仍待复核。` : text,
  }]
  return {
    id: 'plan',
    title: '我的计划',
    lines,
    context: true,
    summary: '仅检查日与待核事实，无金额；背景信息，不计入变化项数。',
  }
}

export function buildWeeklySummary({ week, candidates = [], priceHits = [], ledger, cycle, macro, earnings, companies = new Map(), plan = null }: WeeklyInputs): WeeklySummary {
  const sections: WeeklySection[] = []
  const notes: string[] = []
  const pair = ledgerPair(ledger, week)
  if (ledger && !pair) notes.push(`信号台账没有 ${shortDay(week.start)} 至 ${shortDay(week.end)} 这一周的一期（或缺少上一期），评级变化未比较。`)
  const changes = ledger && pair ? ratingChanges(ledger, pair) : []
  const ledgerSource = pair ? `信号台账 ${pair.prev} → ${pair.cur}` : ''
  const nameOf = (venue: Venue, code: string): CompanyInfo | undefined => companies.get(ledgerKey(venue, code)) ?? companies.get(ledgerKey(venue, codeKey(venue, code)))

  // (a) 候选池
  if (candidates.length) {
    const lines: WeeklyLine[] = []
    const changeByKey = new Map(changes.map(c => [c.key, c]))
    for (const item of candidates) {
      const venue = venueOf(item.market)
      const c = changeByKey.get(ledgerKey(venue, item.code)) ?? changeByKey.get(ledgerKey(venue, codeKey(venue, item.code)))
      if (!c || !pair) continue
      lines.push({ kind: 'rating', date: pair.cur, source: ledgerSource, href: companyHref(item), text: `${label(nameOf(venue, item.code)?.name, item.code, item.market)}：研究评级「${RATING_CODES[c.before]}」→「${RATING_CODES[c.after]}」` })
    }
    const inPool = new Set(candidates.map(i => `${i.market}:${i.code}`))
    for (const h of [...priceHits].filter(h => inPool.has(`${h.market}:${h.code}`)).sort((a, b) => a.date.localeCompare(b.date) || `${a.market}:${a.code}`.localeCompare(`${b.market}:${b.code}`))) {
      const dir = h.kind === 'price-below' ? '≤' : '≥'
      const close = h.price != null ? `收盘价 ${h.currency ? `${h.currency} ` : ''}${fmt(h.price)} ${dir} 条件价 ${fmt(h.threshold)}` : `收盘价触及条件价（${dir} ${fmt(h.threshold)}）`
      lines.push({ kind: 'price-hit', date: h.date, source: h.source, href: companyHref(h), text: `${label(nameOf(venueOf(h.market), h.code)?.name, h.code, h.market)}：${close}，该复核一眼` })
    }
    for (const item of candidates) {
      const name = nameOf(venueOf(item.market), item.code)?.name
      for (const d of item.decisions ?? []) {
        const day = beijingDayOf(d.at)
        if (!inWeek(day, week.start, week.end)) continue
        const action = { watch: '观察', hold: '暂缓', buy: '买入', adjust: '调整', sell: '卖出' }[d.action]
        lines.push({ kind: 'decision', date: day, source: '候选池决策记录', href: companyHref(item), text: `${label(name, item.code, item.market)}：写了决策记录「${action}」，下次检查日 ${d.nextCheck}` })
      }
    }
    for (const item of candidates) {
      const latest = item.decisions?.at(-1)
      if (!latest || !inWeek(latest.nextCheck, week.nextStart, week.nextEnd)) continue
      lines.push({ kind: 'review-next', date: latest.nextCheck, source: `候选池决策记录（记于 ${beijingDayOf(latest.at)}）`, href: companyHref(item), text: `${label(nameOf(venueOf(item.market), item.code)?.name, item.code, item.market)}：下周到期复查，检查日 ${latest.nextCheck}` })
    }
    if (lines.length) sections.push({ id: 'candidates', title: '候选池', lines })
  }

  // (b) 公司库：评级档位进出「优先关注」「条件关注」
  if (changes.length && pair) {
    const up = changes.filter(c => c.after <= 1 && c.after < c.before)
    const down = changes.filter(c => c.before <= 1 && c.after > c.before)
    const line = (c: RatingChange, kind: 'library-up' | 'library-down'): WeeklyLine => {
      const [venue, code] = c.key.split(':') as [Venue, string]
      const info = nameOf(venue, code)
      const market: CandidateMarket = info?.market ?? venue
      const verb = kind === 'library-up' ? `新进「${RATING_CODES[c.after]}」` : `跌出「${RATING_CODES[c.before]}」`
      return { kind, date: pair.cur, source: ledgerSource, href: info ? companyHref(info) : undefined, text: `${label(info?.name, info?.code ?? code, market)}：${verb}（${RATING_CODES[c.before]} → ${RATING_CODES[c.after]}）` }
    }
    const listed = [...up.slice(0, LIBRARY_TOP).map(c => line(c, 'library-up')), ...down.slice(0, LIBRARY_TOP).map(c => line(c, 'library-down'))]
    const more = changes.length - listed.length
    sections.push({
      id: 'library', title: '公司库', lines: listed, more,
      summary: `共 ${changes.length} 家研究评级档位变化（${ledgerSource}）：新进「优先关注 / 条件关注」${up.length} 家，跌出 ${down.length} 家${more > 0 ? `；其余 ${more} 家未逐条列出` : ''}。`,
    })
  }

  // (c) 牛熊周期：本周记录与上周记录的状态
  if (cycle?.records?.length) {
    const cur = cycle.records.filter(r => inWeek(r.weekEnding, week.start, week.end)).sort((a, b) => a.weekEnding.localeCompare(b.weekEnding)).at(-1)
    const prev = cycle.records.filter(r => inWeek(r.weekEnding, week.prevStart, week.prevEnd)).sort((a, b) => a.weekEnding.localeCompare(b.weekEnding)).at(-1)
    if (!cur || !prev) notes.push('牛熊周期自动周报缺少本周或上周的记录，周状态未比较。')
    else {
      const lines: WeeklyLine[] = []
      for (const id of Object.keys(CYCLE_MARKET_LABEL)) {
        const a = prev.markets[id], b = cur.markets[id]
        if (!a || !b) continue
        const diffs = [
          ['总体状态', a.legacyState, b.legacyState], ['趋势', a.shadow.trendState, b.shadow.trendState],
          ['风险闸门', a.shadow.riskGate, b.shadow.riskGate], ['估值区域', a.shadow.valuationZone, b.shadow.valuationZone],
        ].filter(([, x, y]) => x !== y)
        if (!diffs.length) continue
        lines.push({ kind: 'cycle', date: cur.weekEnding, source: `牛熊周期自动周报（周末 ${prev.weekEnding} → ${cur.weekEnding}，规则 ${cur.ruleVersion}）`, href: '/monitor?tab=market-cycle', text: `${CYCLE_MARKET_LABEL[id]}：${diffs.map(([n, x, y]) => `${n}「${x}」→「${y}」`).join('；')}` })
      }
      if (lines.length) sections.push({ id: 'cycle', title: '牛熊周期', lines })
    }
  }

  // (d) 宏观温度：周末的阶段与上周末相比
  if (macro?.series) {
    const a = macroStageAsOf(macro, week.prevEnd), b = macroStageAsOf(macro, week.end)
    const sameInputs = Object.keys(a.values).sort().join() === Object.keys(b.values).sort().join()
    if (a.level !== b.level && sameInputs && Object.keys(b.values).length) {
      const changed = MACRO_SIGNAL_IDS.filter(id => a.values[id] && b.values[id] && a.values[id].date !== b.values[id].date)
        .map(id => `${SIGNALS.find(x => x.id === id)?.name ?? id} ${fmt(a.values[id].value)}（${a.values[id].date}）→ ${fmt(b.values[id].value)}（${b.values[id].date}）`)
      sections.push({ id: 'macro', title: '宏观温度', lines: [{ kind: 'macro', date: week.end, source: `宏观快照 macro-us.json（各信号截至 ${week.prevEnd} / ${week.end} 的最近观测）`, href: '/monitor', text: `宏观阶段「${a.name}」（${a.score} 分）→「${b.name}」（${b.score} 分）${changed.length ? `；更新的读数：${changed.join('，')}` : ''}` }] })
    } else if (a.level !== b.level) notes.push('宏观阶段两个周末可用的信号项不同，未比较。')
  }

  // (e) 下周财报
  if (earnings?.items) {
    const sec = earningsSection(earnings, week, candidates)
    if (sec) sections.push(sec)
  }

  // (f) 站长计划检查日（无金额，context）
  if (plan) {
    const sec = planReviewSection(plan)
    if (sec) sections.push(sec)
  }

  const total = sections.reduce((n, s) => n + (s.context ? 0 : s.lines.length), 0)
  return { week, sections, total, empty: total === 0, emptyText: EMPTY_TEXT, notes }
}

/** 计数（含公司库未列出的条数；不含背景信息节「下周财报」），站内标题「本周变化 · N 项」与邮件标题用 */
export const weeklyCount = (s: WeeklySummary): number => s.sections.reduce((n, x) => n + (x.context ? 0 : x.lines.length + (x.more ?? 0)), 0)
/** 变化事项节与背景信息节 */
export const changeSections = (s: WeeklySummary): WeeklySection[] => s.sections.filter(x => !x.context)
export const contextSections = (s: WeeklySummary): WeeklySection[] => s.sections.filter(x => x.context)
const sectionCount = (sec: WeeklySection): string => {
  if (sec.id === 'plan') return `${sec.lines.length} 项`
  return sec.context ? `${sec.lines.length} 家` : `${sec.lines.length} 项`
}

// ── 邮件正文：纯文本 + 简单 HTML ──
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export function composeWeeklyEmail(s: WeeklySummary, site: string): { subject: string; text: string; html: string } {
  const w = s.week
  const range = `${w.start} 至 ${w.end}`
  const subject = `每周变化摘要 · ${w.id}（${shortDay(w.start)}–${shortDay(w.end)}）· ${s.empty ? '无变化' : `${weeklyCount(s)} 项`}`
  const lead = `上周（北京时间 ${range}）与再前一周相比的可复核变化。每条附数据日期与来源。`
  const abs = (href?: string): string | null => (href ? `${site}${href}` : null)
  const text = [
    lead, '',
    ...(s.empty ? [s.emptyText, ''] : []),
    ...(s.empty ? contextSections(s) : s.sections).flatMap(sec => [
      `【${sec.title}】${sectionCount(sec)}`, ...(sec.summary ? [sec.summary] : []),
      ...sec.lines.flatMap(l => [`- ${l.text}`, `  日期 ${l.date} · 来源：${l.source}`, ...(abs(l.href) ? [`  ${abs(l.href)}`] : [])]), '',
    ]),
    ...(s.notes.length ? [...s.notes, ''] : []),
    `打开候选池：${site}/candidates`, '', '—', FOOTER,
  ].join('\n')
  const html = `<!doctype html><html lang="zh-CN"><body style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.6;color:#1f2328;max-width:640px">
<p>${escapeHtml(lead)}</p>
${s.empty ? `<p>${escapeHtml(s.emptyText)}</p>` : ''}${(s.empty ? contextSections(s) : s.sections).map(sec => `<h3 style="font-size:16px;margin:20px 0 8px">${escapeHtml(sec.title)} · ${sectionCount(sec)}</h3>
${sec.summary ? `<p style="margin:0 0 8px">${escapeHtml(sec.summary)}</p>` : ''}<ul style="padding-left:20px;margin:0">${sec.lines.map(l => `<li style="margin-bottom:10px">${abs(l.href) ? `<a href="${escapeHtml(abs(l.href) as string)}">${escapeHtml(l.text)}</a>` : escapeHtml(l.text)}<br><span style="color:#59636e;font-size:13px">日期 ${escapeHtml(l.date)} · 来源：${escapeHtml(l.source)}</span></li>`).join('')}</ul>`).join('\n')}
${s.notes.map(n => `<p style="color:#59636e">${escapeHtml(n)}</p>`).join('')}
<p><a href="${escapeHtml(site)}/candidates">打开候选池</a></p>
<hr style="border:none;border-top:1px solid #d1d9e0;margin:20px 0 8px"><p style="color:#59636e;font-size:13px">${escapeHtml(FOOTER)}</p>
</body></html>`
  return { subject, text, html }
}

/** 数据是否在合理形状：只做最小检查，避免坏文件让整个摘要报错 */
export const asLedger = (v: unknown): LedgerLike | null => {
  const x = v as LedgerLike | null
  return x && x.schemaVersion === 1 && x.snapshots && typeof x.snapshots === 'object' && !Array.isArray(x.snapshots) ? x : null
}
export const asCycleReport = (v: unknown): CycleReportLike | null => {
  const x = v as CycleReportLike | null
  return x && x.schemaVersion === 1 && Array.isArray(x.records) && x.records.every(r => r && typeof r.weekEnding === 'string' && r.markets && typeof r.markets === 'object') ? x : null
}
export const asMacro = (v: unknown): MacroLike | null => {
  const x = v as MacroLike | null
  return x && x.series && typeof x.series === 'object' && !Array.isArray(x.series) ? x : null
}
export const asEarningsCalendar = (v: unknown): EarningsCalendarLike | null => {
  const x = v as EarningsCalendarLike | null
  return x && x.schemaVersion === 1 && typeof x.generatedAt === 'string' && Array.isArray(x.items) ? { ...x, items: x.items.filter(i => i && typeof i.code === 'string' && typeof i.date === 'string') } : null
}
/** 信号台账按年分文件：本周与上一周可能跨年，合并两个年份的快照 */
export function mergeLedgers(...ledgers: (LedgerLike | null | undefined)[]): LedgerLike | null {
  const ok = ledgers.filter((l): l is LedgerLike => !!l)
  return ok.length ? { schemaVersion: 1, snapshots: Object.assign({}, ...ok.map(l => l.snapshots)) } : null
}
/** 本周与上一周涉及的台账年份 */
export const ledgerYears = (week: WeekRange): number[] => [...new Set([Number(week.prevStart.slice(0, 4)), Number(week.end.slice(0, 4))])]
