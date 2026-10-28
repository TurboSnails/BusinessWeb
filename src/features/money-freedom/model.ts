export interface FreedomInput {
  /** 月开销，元/月 */ monthly: number
  /** 还需支出的年数 */ years: number
  /** 每个孩子的成本，万元 */ childCost: number
  /** 小孩数 */ children: number
  /** 健康开销，万元 */ health: number
  /** 重大投入，万元 */ major: number
}

export interface FreedomBreakdown { daily: number; children: number; health: number; major: number; total: number }

export interface ProgressInput { age: number; savings: number; income: number; rate: number }
export interface Progress {
  monthlySaving: number
  /** 0–1 */ ratio: number
  /** 还需年数；null 表示按当前储蓄无法达成 */ yearsNeeded: number | null
  freedomAge: number | null
}

export const TEMPLATES: Array<{ id: string; label: string; value: FreedomInput }> = [
  { id: 'tier1', label: '一线城市', value: { monthly: 8000, years: 40, childCost: 100, children: 1, health: 100, major: 500 } },
  { id: 'tier2', label: '二线城市', value: { monthly: 5000, years: 40, childCost: 60, children: 1, health: 80, major: 200 } },
  { id: 'town', label: '小城慢生活', value: { monthly: 3000, years: 40, childCost: 30, children: 1, health: 60, major: 80 } },
  { id: 'dink', label: '丁克', value: { monthly: 6000, years: 40, childCost: 0, children: 0, health: 100, major: 300 } },
]

export const EMPTY_INPUT: FreedomInput = { monthly: 0, years: 40, childCost: 0, children: 0, health: 0, major: 0 }

const WAN = 10000

/** 总额（万元）= 12·年·X/1万 + K·n + M + H，各项均为万元 */
export function calcFreedom(input: FreedomInput): FreedomBreakdown {
  const daily = (input.monthly * 12 * input.years) / WAN
  const children = input.childCost * input.children
  return { daily, children, health: input.health, major: input.major, total: daily + children + input.health + input.major }
}

/** 4% 法则：年开销 ×25，万元 */
export function fourPercentRule(monthly: number): number {
  return (monthly * 12 * 25) / WAN
}

/** 复利逐月累积：目标 target（万元），已有 savings（万元），每月存 income − monthly（元） */
export function calcProgress(target: number, monthly: number, p: ProgressInput): Progress {
  const monthlySaving = p.income - monthly
  const gap = target - p.savings
  const ratio = target > 0 ? Math.min(1, Math.max(0, p.savings / target)) : 0
  const done = (): Progress => ({ monthlySaving, ratio: 1, yearsNeeded: 0, freedomAge: p.age })
  if (target <= 0) return { monthlySaving, ratio: 0, yearsNeeded: null, freedomAge: null }
  if (gap <= 0) return done()
  const gapYuan = gap * WAN
  const s = monthlySaving
  const i = Math.pow(1 + p.rate / 100, 1 / 12) - 1
  let months: number
  if (i <= 1e-12) {
    if (s <= 0) return { monthlySaving, ratio, yearsNeeded: null, freedomAge: null }
    months = gapYuan / s
  } else {
    const start = p.savings * WAN * i + s
    const end = target * WAN * i + s
    if (start <= 0 || end <= 0 || end <= start) return { monthlySaving, ratio, yearsNeeded: null, freedomAge: null }
    months = Math.log(end / start) / Math.log(1 + i)
  }
  if (!Number.isFinite(months) || months < 0) return { monthlySaving, ratio, yearsNeeded: null, freedomAge: null }
  const yearsNeeded = months / 12
  return { monthlySaving, ratio, yearsNeeded, freedomAge: p.age + yearsNeeded }
}

export const wan = (value: number): string => `${value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 万`
