import { describe, expect, it } from 'vitest'
import { QUESTIONS, QIDS, REASONS } from './content'
import { answeredCount, evaluate, isEligible, isResearch, sanitizeAnswers, validUserCapBps } from './recommend'
import type { Answer, Answers, AssessmentResult, Qid } from './types'

type Full = Record<Qid, Answer>

/** 枚举全部合法答案组合：3×2×3×4×4×4×3×4×2 = 27648 */
function allCombos(): Full[] {
  let acc: Array<Partial<Full>> = [{}]
  for (const q of QUESTIONS) {
    acc = acc.flatMap(a => q.options.map(o => ({ ...a, [q.id]: o.value })))
  }
  return acc as Full[]
}

const SAFE: Full = { q1: 'c', q2: 'b', q3: 'c', q4: 'c', q5: 'b', q6: 'c', q7: 'b', q8: 'b', q9: 'b' }
const with_ = (patch: Partial<Full>): Full => ({ ...SAFE, ...patch })

/** 独立写一遍规格（docs/reviews/2026-11-14-newcomer-entry.md + 2026-11-14 走查修订），与实现交叉核对 */
function specRoute(a: Full): AssessmentResult['route'] {
  // Q3：a 不到 3 年 → 不放权益（底座.5）；b 3—5 年 → 9.10 最保守档的适用情形，不研究个股
  if (a.q1 !== 'c' || a.q2 === 'a' || a.q3 === 'a') return 'foundation'
  if (a.q4 === 'a') return 'simple'
  if (a.q3 === 'b' || a.q4 === 'b' || a.q6 === 'a' || a.q6 === 'b' || a.q7 === 'a' || a.q5 === 'a' || a.q5 === 'd' || a.q8 === 'a') return 'simple'
  if (a.q6 === 'd' && a.q7 === 'c' && a.q8 === 'c') return 'research'
  return 'combined'
}

describe('evaluate · 全部合法组合', () => {
  const combos = allCombos()

  it('组合数为 27648（Q4 / Q5 / Q6 / Q8 各 4 个选项）', () => {
    expect(combos).toHaveLength(27648)
  })

  it('每个组合都得到唯一、完整、与规格一致的结果', () => {
    const counts: Record<string, number> = {}
    for (const a of combos) {
      const r = evaluate(a)
      expect(r.status).toBe('complete')
      expect(r.route).toBe(specRoute(a))
      expect(r.allocation).toBe('needs-confirmation')
      expect(r.safetyWarning).toBe(a.q9 === 'a')
      expect(r.reasonIds.length).toBeGreaterThan(0)
      for (const id of r.reasonIds) expect(REASONS[id], id).toBeTruthy()
      counts[r.route!] = (counts[r.route!] ?? 0) + 1
    }
    // 四条路线都可达
    expect(Object.keys(counts).sort()).toEqual(['combined', 'foundation', 'research', 'simple'])
  })

  it('R1 不可绕过：任何资金规模、经验、时间都不能让先打底的人进入市场', () => {
    for (const a of combos) {
      if (a.q1 !== 'c' || a.q2 === 'a' || a.q3 === 'a') {
        const r = evaluate(a)
        expect(r.route).toBe('foundation')
        expect(r.suggestedResearchCapBps).toBeUndefined()
      }
    }
  })

  it('额度：省心 0；结合 / 研究 500；先打底没有比例；从不出现 1000', () => {
    for (const a of combos) {
      const r = evaluate(a)
      if (r.route === 'simple') expect(r.suggestedResearchCapBps).toBe(0)
      if (r.route === 'combined' || r.route === 'research') expect(r.suggestedResearchCapBps).toBe(500)
      if (r.route === 'foundation') expect(r.suggestedResearchCapBps).toBeUndefined()
      expect(r.suggestedResearchCapBps).not.toBe(1000)
    }
  })

  it('期限：3 年内要用（Q3=a）永远先打底；3—5 年（Q3=b）永远不进结合 / 研究，额度 0，理由第一条写期限', () => {
    for (const a of combos.filter(c => c.q3 === 'a')) expect(evaluate(a).route).toBe('foundation')
    for (const a of combos.filter(c => c.q3 === 'b')) {
      const r = evaluate(a)
      expect(['foundation', 'simple']).toContain(r.route)
      if (r.route === 'simple') {
        expect(r.suggestedResearchCapBps).toBe(0)
        if (a.q4 !== 'a') expect(r.reasonIds[0]).toBe('horizon-mid')
      }
    }
  })

  it('Q5=d（没经历过，不确定）按保守处理：永远不进结合 / 研究', () => {
    for (const a of combos.filter(c => c.q5 === 'd')) expect(['foundation', 'simple']).toContain(evaluate(a).route)
  })

  it('Q8=d（还没开始 / 不足一年）永远不进研究路线', () => {
    for (const a of combos.filter(c => c.q8 === 'd')) expect(evaluate(a).route).not.toBe('research')
  })

  it('结果对象里没有保守 / 均衡 / 积极这类档位字段', () => {
    for (const a of combos.slice(0, 500)) {
      const r = evaluate(a) as unknown as Record<string, unknown>
      expect(Object.keys(r).sort()).toEqual(expect.arrayContaining(['allocation']))
      expect(JSON.stringify(r)).not.toMatch(/conservative|balanced|aggressive|保守|均衡|积极/)
    }
  })
})

describe('evaluate · 规则顺序与边界（表驱动）', () => {
  const table: Array<{ name: string; a: Full; route: string; rules: string[] }> = [
    { name: '应急金不到 3 个月', a: with_({ q1: 'a' }), route: 'foundation', rules: ['R1-emergency'] },
    { name: '应急金 3—6 个月同样先打底（不只拦 Q1=a）', a: with_({ q1: 'b' }), route: 'foundation', rules: ['R1-emergency'] },
    { name: '高息欠款', a: with_({ q2: 'a' }), route: 'foundation', rules: ['R1-debt'] },
    { name: '3 年内要用，即使 100 万以上', a: with_({ q3: 'a', q4: 'd' }), route: 'foundation', rules: ['R1-horizon'] },
    { name: '3—5 年内可能动用 → 省心（不研究个股）', a: with_({ q3: 'b' }), route: 'simple', rules: ['R3-horizon'] },
    { name: '3—5 年且满足研究条件也只到省心', a: with_({ q3: 'b', q4: 'd', q6: 'd', q7: 'c', q8: 'c', q5: 'c' }), route: 'simple', rules: ['R3-horizon'] },
    { name: '没经历过大跌、不确定 → 省心', a: with_({ q5: 'd' }), route: 'simple', rules: ['R3-unknown'] },
    { name: 'R1 多条同时命中全部列出', a: with_({ q1: 'a', q2: 'a', q3: 'a' }), route: 'foundation', rules: ['R1-emergency', 'R1-debt', 'R1-horizon'] },
    { name: '不到 1 万 → 省心', a: with_({ q4: 'a' }), route: 'simple', rules: ['R2-small'] },
    { name: 'R2 先于 R3', a: with_({ q4: 'a', q6: 'a' }), route: 'simple', rules: ['R2-small'] },
    { name: '1—10 万 → 省心', a: with_({ q4: 'b' }), route: 'simple', rules: ['R3-amount'] },
    { name: 'Q6=b（≥1 且 <2 小时）→ 省心', a: with_({ q6: 'b' }), route: 'simple', rules: ['R3-time'] },
    { name: 'Q6=c（≥2 且 <5 小时）→ 可以结合', a: with_({ q6: 'c' }), route: 'combined', rules: ['R4-combined'] },
    { name: '看不懂财报', a: with_({ q7: 'a' }), route: 'simple', rules: ['R3-ability'] },
    { name: '跌 30% 会卖', a: with_({ q5: 'a' }), route: 'simple', rules: ['R3-sell'] },
    { name: '经常追涨', a: with_({ q8: 'a' }), route: 'simple', rules: ['R3-chase'] },
    { name: 'R3 多条命中全部列出（期限排第一）', a: with_({ q3: 'b', q4: 'b', q6: 'a', q7: 'a', q5: 'a', q8: 'a' }), route: 'simple', rules: ['R3-horizon', 'R3-amount', 'R3-time', 'R3-ability', 'R3-sell', 'R3-chase'] },
    { name: 'R5 可达（先于 R4 判断）', a: with_({ q6: 'd', q7: 'c', q8: 'c' }), route: 'research', rules: ['R5-research'] },
    { name: 'R5 缺 Q7=c → 结合', a: with_({ q6: 'd', q7: 'b', q8: 'c' }), route: 'combined', rules: ['R4-combined'] },
    { name: 'R5 缺 Q6=d → 结合', a: with_({ q6: 'c', q7: 'c', q8: 'c' }), route: 'combined', rules: ['R4-combined'] },
    { name: 'Q8=d 满足其余研究条件也只到结合', a: with_({ q6: 'd', q7: 'c', q8: 'd' }), route: 'combined', rules: ['R4-combined'] },
  ]
  for (const t of table) {
    it(t.name, () => {
      const r = evaluate(t.a)
      expect(r.route).toBe(t.route)
      expect(r.ruleIds).toEqual(t.rules)
    })
  }

  it('仅因 Q3 命中先打底时标记 foundationOnlyHorizon（文案：按另一笔钱重做）', () => {
    expect(evaluate(with_({ q3: 'a' })).foundationOnlyHorizon).toBe(true)
    expect(evaluate(with_({ q3: 'a', q1: 'b' })).foundationOnlyHorizon).toBe(false)
    expect(evaluate(with_({ q2: 'a' })).foundationOnlyHorizon).toBe(false)
  })

  it('Q8=d 的结合结果附带「没有记录不等于守得住纪律」理由；Q4=d 附带过度自信提醒', () => {
    expect(evaluate(with_({ q8: 'd' })).reasonIds).toContain('newbie-no-record')
    expect(evaluate(with_({ q4: 'd' })).reasonIds).toContain('large-amount')
    expect(evaluate(with_({ q4: 'd', q6: 'd', q7: 'c', q8: 'c' })).reasonIds).toEqual(['research-ready', 'large-amount'])
  })

  it('isEligible / isResearch 与规格一致', () => {
    expect(isEligible(SAFE)).toBe(true)
    expect(isEligible(with_({ q4: 'b' }))).toBe(false)
    expect(isEligible(with_({ q3: 'b' }))).toBe(false)
    expect(isEligible(with_({ q5: 'd' }))).toBe(false)
    expect(isResearch(with_({ q6: 'd', q7: 'c', q8: 'c' }))).toBe(true)
  })
})

describe('回归：模拟走查「陈阿姨」（30 万元 3 年内要用作生活费）', () => {
  // 原题「1—5 年」不拦截，她拿到了「省心：宽基加债券」。书：底座.5「近期确定支出 3年内 … 不放权益」
  const retiree: Full = { q1: 'c', q2: 'b', q3: 'a', q4: 'c', q5: 'a', q6: 'a', q7: 'a', q8: 'd', q9: 'b' }
  it('选「不到 3 年」→ 先打底，不给任何比例，理由引用家庭财务底座 · 按日期分开装', () => {
    const r = evaluate(retiree)
    expect(r.route).toBe('foundation')
    expect(r.suggestedResearchCapBps).toBeUndefined()
    expect(r.reasonIds).toContain('foundation-horizon')
    expect(REASONS['foundation-horizon'].text).toMatch(/3 年内.*不放股票类资产/)
    expect(REASONS['foundation-horizon'].refs.map(x => x.heading)).toContain('底座.5')
  })
  it('即使她选了「3 年到不足 5 年」，也只到省心、额度 0，第一条理由是期限', () => {
    const r = evaluate({ ...retiree, q3: 'b' })
    expect(r.route).toBe('simple')
    expect(r.suggestedResearchCapBps).toBe(0)
    expect(r.reasonIds[0]).toBe('horizon-mid')
    expect(REASONS['horizon-mid'].refs.map(x => x.heading)).toContain('9.10')
  })
})

describe('回归：文案审读 P1（不像批准或许可）', () => {
  it('结合 / 研究理由不说「过了门槛」「可以走研究路线」，并声明不是资格审核', () => {
    const all = Object.values(REASONS).map(r => r.text).join('\n')
    expect(all).not.toMatch(/过了起步门槛|可以走研究路线|建议起点/)
    expect(REASONS['eligible-combined'].text).toContain('不是资格审核')
    expect(REASONS['research-ready'].text).toContain('不是能力认证')
  })
})

describe('evaluate · 未答完与非法输入', () => {
  it('空答案 → incomplete，没有路线、没有任何比例', () => {
    const r = evaluate({})
    expect(r).toEqual({ rulesVersion: 2, status: 'incomplete', ruleIds: [], reasonIds: [], safetyWarning: false, allocation: 'needs-confirmation' })
  })

  it('缺任意一题都是 incomplete，不给入市比例（包括明显会先打底的答案）', () => {
    for (const q of QIDS) {
      const a: Answers = { ...SAFE }
      delete a[q]
      const r = evaluate(a)
      expect(r.status).toBe('incomplete')
      expect(r.route).toBeUndefined()
      expect(r.suggestedResearchCapBps).toBeUndefined()
    }
  })

  it('红线不等全部答完：只答了 Q9=有 也立即为 true', () => {
    const r = evaluate({ q9: 'a' })
    expect(r.status).toBe('incomplete')
    expect(r.safetyWarning).toBe(true)
  })

  it('非法选项 fail closed（不会默认成研究）', () => {
    const r = evaluate({ ...SAFE, q2: 'c' as Answer })
    expect(r.status).toBe('incomplete')
    expect(evaluate({ ...SAFE, q6: 'd', q7: 'c', q8: 'e' as Answer }).status).toBe('incomplete')
  })

  it('sanitizeAnswers 按每题自己的选项过滤', () => {
    expect(sanitizeAnswers({ q1: 'd', q2: 'b', q6: 'd', q8: 'd', q9: 'x', extra: 'a' })).toEqual({ q2: 'b', q6: 'd', q8: 'd' })
    expect(sanitizeAnswers(null)).toEqual({})
    expect(answeredCount({ q1: 'a', q2: 'z' as Answer })).toBe(1)
  })
})

describe('本人研究额度', () => {
  it('只接受 0–2000 的整数 bps', () => {
    for (const v of [0, 500, 1250, 2000]) expect(validUserCapBps(v)).toBe(true)
    for (const v of [-1, 2001, 500.5, NaN, '500', null, undefined]) expect(validUserCapBps(v)).toBe(false)
  })
})
