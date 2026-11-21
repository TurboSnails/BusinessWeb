// 站内「本周变化」的可比性检查（只用于页面判断，不改变每周邮件的摘要与发信规则）。
// 摘要里「没有列出变化」只说明已比较的部分没有变化；这里列出哪些部分其实没法按「上周 vs 再前一周」比较，
// 页面据此把「确实无变化」与「无法确认」分开。来源整体读不到由 useWeeklyData 的 failed 负责，这里不重复。
import { codeKey, venueOf } from '../candidates/markets.js'
import type { CandidateItem } from '../candidates/validation.js'
import { CYCLE_MARKET_LABEL, ledgerKey, ledgerPair, macroStageAsOf, RATING_CODES, type CycleReportLike, type LedgerLike, type MacroLike, type WeekRange } from './weeklySummary'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const inWeek = (day: string, start: string, end: string): boolean => DAY_RE.test(day) && day >= start && day <= end
const rated = (row: unknown): boolean => Array.isArray(row) && typeof row[1] === 'number' && !!RATING_CODES[row[1]]

export function comparisonGaps({ week, candidates = [], ledger, cycle, macro }: {
  week: WeekRange
  candidates?: CandidateItem[]
  ledger?: LedgerLike | null
  cycle?: CycleReportLike | null
  macro?: MacroLike | null
}): string[] {
  const gaps: string[] = []

  // 信号台账：上一期沿用摘要的规则（本周之前最近一期），但不在上一周时如实写出比较日期
  const pair = ledgerPair(ledger, week)
  if (ledger && pair) {
    const prev = ledger.snapshots[pair.prev] ?? {}, cur = ledger.snapshots[pair.cur] ?? {}
    if (!inWeek(pair.prev, week.prevStart, week.prevEnd)) gaps.push(`信号台账缺少上一周（${week.prevStart} 至 ${week.prevEnd}）的一期，评级按 ${pair.prev} → ${pair.cur} 比较，跨度不止一周。`)
    const both = (key: string): boolean => rated(prev[key]) && rated(cur[key])
    if (!Object.keys(cur).some(both)) gaps.push(`信号台账 ${pair.prev} 与 ${pair.cur} 两期没有共同有评级的公司，评级变化未比较。`)
    else if (candidates.length) {
      const unrated = candidates.filter(item => { const v = venueOf(item.market); return !both(ledgerKey(v, item.code)) && !both(ledgerKey(v, codeKey(v, item.code))) })
      if (unrated.length) gaps.push(`${unrated.length} 家候选在两期信号台账中缺少评级，这些公司的评级变化未比较。`)
    }
  }

  // 牛熊周期：两期都要有同一个指数才算比较过
  if (cycle) {
    const pick = (start: string, end: string) => cycle.records.filter(r => inWeek(r.weekEnding, start, end)).sort((a, b) => a.weekEnding.localeCompare(b.weekEnding)).at(-1)
    const cur = pick(week.start, week.end), prev = pick(week.prevStart, week.prevEnd)
    // 有记录但缺本周 / 上周时摘要已写明；周报里一条记录都没有时摘要不提示，这里补上
    if (!cycle.records.length) gaps.push('牛熊周期自动周报没有任何周记录，周状态未比较。')
    if (cur && prev) {
      const ids = Object.keys(CYCLE_MARKET_LABEL)
      const common = ids.filter(id => prev.markets[id] && cur.markets[id])
      const oneSided = ids.filter(id => !prev.markets[id] !== !cur.markets[id])
      if (!common.length) gaps.push('两期牛熊周期周报没有共同的指数记录，周状态未比较。')
      else if (oneSided.length) gaps.push(`牛熊周期周报只有一期含${oneSided.map(id => CYCLE_MARKET_LABEL[id]).join('、')}，这些指数未比较。`)
      if (cur.ruleVersion !== prev.ruleVersion) gaps.push(`两期牛熊周期周报规则版本不同（${prev.ruleVersion} → ${cur.ruleVersion}），状态变化可能来自规则调整。`)
    }
  }

  // 宏观温度：两个周末要有共同的有效信号
  if (macro?.series) {
    const a = macroStageAsOf(macro, week.prevEnd), b = macroStageAsOf(macro, week.end)
    const common = Object.keys(b.values).filter(id => a.values[id])
    if (!common.length) gaps.push(`宏观快照在 ${week.prevEnd} 与 ${week.end} 两个周末没有共同的有效信号，宏观阶段未比较。`)
  }
  return gaps
}
