import { describe, expect, it } from 'vitest'
import { ownStage, researchStage } from './maturity'

describe('研究成熟度', () => {
  it('核读过原件的为事实已复核；有数字情景价的手工页为情景草案；其余为初筛', () => {
    expect(researchStage({ reviewed: true })).toBe('verified')
    expect(researchStage({ researchReport: 'research/x.md', scenarios: [{ name: '基准', price: '[MISSING]', assumption: '', change: '', trigger: '' }] })).toBe('verified')
    expect(researchStage({ scenarios: [{ name: '基准', price: '$120', assumption: '', change: '', trigger: '' }] })).toBe('draft')
    expect(researchStage({ auto: true, scenarios: [{ name: '基准', price: '$120', assumption: '', change: '', trigger: '' }] })).toBe('screen')
    expect(researchStage({ scenarios: [{ name: '基准', price: '[MISSING]（未认证）', assumption: '', change: '', trigger: '' }] })).toBe('screen')
    expect(researchStage({})).toBe('screen')
  })
  it('本人层：决策记录优先于自行估值', () => {
    expect(ownStage(true, false)).toBe('recorded')
    expect(ownStage(false, true)).toBe('valued')
    expect(ownStage(false, false)).toBe('none')
  })
})
