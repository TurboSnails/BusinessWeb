export interface ScenarioInput {
  price: string
  dividend: string
  probability: string
}

export interface ValuationInputs {
  current: string
  years: string
  scenarios: ScenarioInput[]
}

export const SCENARIO_NAMES = ['悲观', '基准', '乐观'] as const

export function exampleInputs(): ValuationInputs {
  return {
    current: '100', years: '2',
    scenarios: ['85', '125', '180'].map(price => ({ price, dividend: '0', probability: '' })),
  }
}

const number = (value: string): number => value.trim() === '' ? NaN : Number(value)

/** All prices are per share in one currency; dividends are cumulative and not reinvested. */
export function calculateScenarios(input: ValuationInputs) {
  const current = number(input.current)
  const years = number(input.years)
  if (!Number.isFinite(current) || current <= 0) return { error: '现价须为大于 0 的有限数值。' } as const
  if (!Number.isFinite(years) || years <= 0) return { error: '兑现期限须为大于 0 的年数。' } as const
  if (input.scenarios.length !== 3) return { error: '请填写悲观、基准、乐观三种情景。' } as const
  const rows = input.scenarios.map(row => ({ price: number(row.price), dividend: number(row.dividend) }))
  if (rows.some(row => !Number.isFinite(row.price) || row.price < 0 || !Number.isFinite(row.dividend) || row.dividend < 0)) {
    return { error: '情景价与累计每股分红须为不小于 0 的有限数值；无分红请填 0。' } as const
  }
  const wealth = rows.map(row => row.price + row.dividend)
  if (wealth.some(value => !Number.isFinite(value))) return { error: '输入超出可计算范围，请缩小数值。' } as const
  if (wealth[0] > wealth[1] || wealth[1] > wealth[2]) {
    return { error: '含分红的期末价值须满足：悲观 ≤ 基准 ≤ 乐观，请检查情景定义。' } as const
  }
  const scenarios = rows.map((row, i) => ({
    ...row,
    returnRate: wealth[i] / current - 1,
    annualized: Math.pow(wealth[i] / current, 1 / years) - 1,
  }))
  if (scenarios.some(row => !Number.isFinite(row.returnRate) || !Number.isFinite(row.annualized))) {
    return { error: '输入导致收益率超出可计算范围，请检查价格与期限。' } as const
  }
  const validRatio = wealth[0] < current && current < wealth[1]
  const ratio = validRatio ? (wealth[1] - current) / (current - wealth[0]) : null
  const threshold = wealth[0] / 3 * 2 + wealth[1] / 3
  const filled = input.scenarios.filter(row => row.probability.trim() !== '').length
  let probabilityError: string | null = null
  let expected: number | null = null
  let expectedAnnualEquivalent: number | null = null
  if (filled > 0) {
    const probabilities = input.scenarios.map(row => number(row.probability))
    if (filled !== 3 || probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 100)
      || Math.abs(probabilities.reduce((a, b) => a + b, 0) - 100) > 1e-6) {
      probabilityError = '计算期望收益需填齐三项概率（0–100%），且合计为 100%；也可全部留空。'
    } else {
      expected = scenarios.reduce((sum, row, i) => sum + probabilities[i] / 100 * row.returnRate, 0)
      expectedAnnualEquivalent = Math.pow(1 + expected, 1 / years) - 1
    }
  }
  return { error: null, current, years, scenarios, ratio, threshold, probabilityError, expected, expectedAnnualEquivalent } as const
}
