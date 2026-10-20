import { describe, expect, it } from 'vitest'
import { calculateScenarios, exampleInputs } from './model'

describe('综合估值的情景收益口径', () => {
  it('未赋概率不计算期望，价差比不依赖期限，年化依赖期限', () => {
    const input = exampleInputs()
    const result = calculateScenarios(input)
    if (result.error) throw new Error(result.error)
    expect(result.ratio).toBeCloseTo(25 / 15)
    expect(result.threshold).toBeCloseTo(98.33333333)
    expect(result.expected).toBeNull()
    expect(result.scenarios[1].returnRate).toBeCloseTo(.25)
    expect(result.scenarios[1].annualized).toBeCloseTo(Math.sqrt(1.25) - 1)
  })

  it('分红进入终值，股权归零且无分红的年化损失为100%', () => {
    const input = exampleInputs()
    input.scenarios[0].price = '0'
    input.scenarios[1].dividend = '5'
    const result = calculateScenarios(input)
    if (result.error) throw new Error(result.error)
    expect(result.scenarios[0].annualized).toBe(-1)
    expect(result.scenarios[1].returnRate).toBeCloseTo(.3)
    expect(result.ratio).toBeCloseTo(.3)
  })

  it('概率有效才计算期望，部分或非法概率仍保留条件情景结果', () => {
    const input = exampleInputs()
    input.scenarios[0].probability = '25'
    const partial = calculateScenarios(input)
    if (partial.error) throw new Error(partial.error)
    expect(partial.expected).toBeNull()
    expect(partial.probabilityError).toBeTruthy()
    input.scenarios[1].probability = '50'
    input.scenarios[2].probability = '25'
    const complete = calculateScenarios(input)
    if (complete.error) throw new Error(complete.error)
    expect(complete.expected).toBeCloseTo(.2875)
    input.scenarios[2].probability = '-1'
    const invalid = calculateScenarios(input)
    if (invalid.error) throw new Error(invalid.error)
    expect(invalid.expected).toBeNull()
  })

  it('现价落在情景价外不报告无穷或负赔率', () => {
    for (const current of ['85', '80', '125', '150']) {
      const result = calculateScenarios({ ...exampleInputs(), current })
      if (result.error) throw new Error(result.error)
      expect(result.ratio).toBeNull()
    }
  })

  it('拒绝缺值、非有限输入、倒置情景与计算溢出', () => {
    for (const [field, value] of [['current', ''], ['current', '0'], ['current', 'Infinity'], ['years', '-1'], ['years', '0.000000001']] as const) {
      expect(calculateScenarios({ ...exampleInputs(), [field]: value }).error).toBeTruthy()
    }
    const inverted = exampleInputs()
    inverted.scenarios[0].price = '150'
    expect(calculateScenarios(inverted).error).toBeTruthy()
    inverted.scenarios[0].price = '-1'
    expect(calculateScenarios(inverted).error).toBeTruthy()
  })
})
