// 推荐规则：纯函数、表驱动（docs/reviews/2026-11-14-newcomer-entry.md「推荐规则」；arch-r2 §4 + 签字修正）。
// 不读金额、时钟、行情或存储；同一答案永远得到同一结果。
//
// 判断顺序：
//   R0 红线（独立，不参与路线）
//   不完整 → incomplete（不给任何入市比例）
//   R1 先打底：Q1≠c OR Q2=a OR Q3=a（3 年内要用，底座.5：不放权益；资金规模不能覆盖期限）
//   R2 Q4=a → 省心，额度 0
//   R3 Q3=b（3—5 年，9.10 最保守档的适用情形）/ Q4=b / Q6∈{a,b} / Q7=a / Q5∈{a,d} / Q8=a → 省心，额度 0
//   eligible：Q3=c 且 Q4∈{c,d} 且 Q6∈{c,d} 且 Q7∈{b,c} 且 Q5∈{b,c} 且 Q8∈{b,c,d}
//     R5（先判）Q6=d 且 Q7=c 且 Q8=c → 研究，建议起点 500bps
//     R4 其余 → 结合，建议起点 500bps
//   任何意外输入 fail closed 为 incomplete，绝不默认为研究
import { QIDS, allowedAnswers } from './content'
import { RULES_VERSION, SUGGESTED_CAP_BPS, USER_CAP_MAX_BPS } from './types'
import type { Answer, Answers, AssessmentResult, Qid, Route } from './types'

type Full = Record<Qid, Answer>

interface Rule {
  id: string
  when: (a: Full) => boolean
  reasonId: string
}

/** R1：任一命中即先打底；三条都列出，便于解释与测试 */
export const R1_RULES: Rule[] = [
  { id: 'R1-emergency', when: a => a.q1 !== 'c', reasonId: 'foundation-emergency' },
  { id: 'R1-debt', when: a => a.q2 === 'a', reasonId: 'foundation-debt' },
  { id: 'R1-horizon', when: a => a.q3 === 'a', reasonId: 'foundation-horizon' },
]

export const R2_RULES: Rule[] = [
  { id: 'R2-small', when: a => a.q4 === 'a', reasonId: 'small-amount' },
]

export const R3_RULES: Rule[] = [
  { id: 'R3-horizon', when: a => a.q3 === 'b', reasonId: 'horizon-mid' },
  { id: 'R3-amount', when: a => a.q4 === 'b', reasonId: 'amount-mid' },
  { id: 'R3-time', when: a => a.q6 === 'a' || a.q6 === 'b', reasonId: 'time-short' },
  { id: 'R3-ability', when: a => a.q7 === 'a', reasonId: 'ability-none' },
  { id: 'R3-sell', when: a => a.q5 === 'a', reasonId: 'behavior-sell' },
  { id: 'R3-unknown', when: a => a.q5 === 'd', reasonId: 'behavior-unknown' },
  { id: 'R3-chase', when: a => a.q8 === 'a', reasonId: 'behavior-chase' },
]

export const isEligible = (a: Full): boolean =>
  a.q3 === 'c' &&
  (a.q4 === 'c' || a.q4 === 'd') &&
  (a.q6 === 'c' || a.q6 === 'd') &&
  (a.q7 === 'b' || a.q7 === 'c') &&
  (a.q5 === 'b' || a.q5 === 'c') &&
  (a.q8 === 'b' || a.q8 === 'c' || a.q8 === 'd')

export const isResearch = (a: Full): boolean => a.q6 === 'd' && a.q7 === 'c' && a.q8 === 'c'

const isValid = (qid: Qid, v: unknown): v is Answer => typeof v === 'string' && (allowedAnswers(qid) as string[]).includes(v)

/** 只保留合法答案（每题按自己的选项校验）；非法值当作未答 */
export function sanitizeAnswers(input: unknown): Answers {
  const out: Answers = {}
  if (!input || typeof input !== 'object') return out
  const src = input as Record<string, unknown>
  for (const qid of QIDS) if (isValid(qid, src[qid])) out[qid] = src[qid] as Answer
  return out
}

export function answeredCount(answers: Answers): number {
  return QIDS.filter(q => isValid(q, answers[q])).length
}

const base = (safetyWarning: boolean): AssessmentResult => ({
  rulesVersion: RULES_VERSION,
  status: 'incomplete',
  ruleIds: [],
  reasonIds: [],
  safetyWarning,
  allocation: 'needs-confirmation',
})

function hits(rules: Rule[], a: Full): Rule[] {
  return rules.filter(r => r.when(a))
}

function complete(route: Route, matched: Rule[], safetyWarning: boolean, extra: Partial<AssessmentResult> = {}, extraReasons: string[] = []): AssessmentResult {
  return {
    ...base(safetyWarning),
    status: 'complete',
    route,
    ruleIds: matched.map(r => r.id),
    reasonIds: [...matched.map(r => r.reasonId), ...extraReasons],
    ...extra,
  }
}

export function evaluate(input: Answers): AssessmentResult {
  // R0 只看 Q9 是否已答「有」，不等全部答完
  const safetyWarning = input.q9 === 'a'
  if (!QIDS.every(q => isValid(q, input[q]))) return base(safetyWarning)
  const a = input as Full

  const r1 = hits(R1_RULES, a)
  if (r1.length) {
    return complete('foundation', r1, safetyWarning, {
      foundationOnlyHorizon: r1.length === 1 && r1[0].id === 'R1-horizon',
    })
  }

  const r2 = hits(R2_RULES, a)
  if (r2.length) return complete('simple', r2, safetyWarning, { suggestedResearchCapBps: 0 })

  const r3 = hits(R3_RULES, a)
  if (r3.length) return complete('simple', r3, safetyWarning, { suggestedResearchCapBps: 0 })

  // 走到这里，Q4/Q5/Q6/Q7/Q8 都已排除 R2/R3 的值；仍按 eligible 显式核对，意外输入 fail closed
  if (!isEligible(a)) return base(safetyWarning)

  const large = a.q4 === 'd' ? ['large-amount'] : []
  if (isResearch(a)) {
    return complete('research', [{ id: 'R5-research', when: () => true, reasonId: 'research-ready' }], safetyWarning,
      { suggestedResearchCapBps: SUGGESTED_CAP_BPS }, large)
  }
  const newbie = a.q8 === 'd' ? ['newbie-no-record'] : []
  return complete('combined', [{ id: 'R4-combined', when: () => true, reasonId: 'eligible-combined' }], safetyWarning,
    { suggestedResearchCapBps: SUGGESTED_CAP_BPS }, [...newbie, ...large])
}

/** 本人选择的研究额度：只接受 0–2000 的整数 bps；其他一律视为未设置 */
export function validUserCapBps(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= USER_CAP_MAX_BPS
}
