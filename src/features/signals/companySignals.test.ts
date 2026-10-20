import { describe, expect, it } from 'vitest'
import { companySignals, ratingBucket } from './companySignals'

const scen = (bear: string, base: string, bull = '200') => [{ name: '悲观', price: bear }, { name: '基准', price: base }, { name: '乐观', price: bull }]
const byId = (s: ReturnType<typeof companySignals>, id: string) => s.signals.find(x => x.id === id)!

describe('ratingBucket', () => {
  it('把各种评级用语归到五档', () => {
    expect(ratingBucket('逢低增持')).toBe('条件关注')
    expect(ratingBucket('首选')).toBe('优先关注')
    expect(ratingBucket('暂不考虑')).toBe('回避')
    expect(ratingBucket('未估值（数据不足）')).toBe('未估值')
    expect(ratingBucket('观察（事实已复核）')).toBe('观察')
  })
})

describe('companySignals', () => {
  it('情景按现价算基准涨幅；[MISSING] 与口径不符的价格不参与', () => {
    expect(byId(companySignals({ rating: '观察', price: 100, scenarios: scen('80 元', '120 元（估值初稿）'), today: '2026-10-20' }), 'scenario')).toMatchObject({ verdict: '基准 +20%', direction: 1 })
    expect(byId(companySignals({ rating: '观察', price: 100, scenarios: scen('[MISSING]（未认证）', '[MISSING]（未认证）'), today: '2026-10-20' }), 'scenario')).toMatchObject({ verdict: '情景价未认证', direction: null })
    expect(byId(companySignals({ rating: '观察', price: 100, scenarios: [{ name: '中性', price: '$5000' }], today: '2026-10-20' }), 'scenario').direction).toBeNull()
    expect(byId(companySignals({ rating: '观察', scenarios: scen('80', '120'), today: '2026-10-20' }), 'scenario').detail).toContain('缺少可交易的最新价')
  })

  it('DCF：安全边际 ≥20% 偏积极、低于 −10% 偏谨慎；低可信度与不适用不参与', () => {
    const dcf = (mos: number, extra = {}) => byId(companySignals({ rating: '观察', dcf: { price: 100, mos, source: 'auto', currency: 'USD', current: 90, buyBelow: 95, ...extra }, today: '2026-10-20' }), 'dcf')
    expect(dcf(0.25)).toMatchObject({ direction: 1 })
    expect(dcf(0.25).detail).toContain('现价已低于买入参考价 95.00')
    expect(dcf(-0.15).direction).toBe(-1)
    expect(dcf(-0.05).direction).toBe(0)
    expect(dcf(0.25, { credibility: 'low' }).direction).toBeNull()
    expect(byId(companySignals({ rating: '观察', dcf: { price: null, mos: null, status: 'financial' }, today: '2026-10-20' }), 'dcf').verdict).toBe('金融企业不适用')
  })

  it('有方向的信号相反时列出分歧，并提示过期价格与到期复查', () => {
    const s = companySignals({
      rating: '优先关注', price: 100, priceStale: true, priceDate: '2026-09-01', scenarios: scen('70', '90'),
      dcf: { price: 130, mos: 0.3, source: 'mine', currency: 'CNY' }, decision: { action: 'buy', nextCheck: '2026-10-01', count: 2 }, today: '2026-10-20',
    })
    expect(s.conflicts[0]).toContain('研究评级、DCF偏积极，而三情景偏谨慎')
    expect(s.notes.join()).toContain('价格锚点 2026-09-01已过期')
    expect(s.notes.join()).toContain('检查日 2026-10-01 已到')
    expect(byId(s, 'decision')).toMatchObject({ verdict: '买入', direction: null })
  })

  it('买入后评级转为回避时提示复查；方向一致时说明没有分歧', () => {
    expect(companySignals({ rating: '回避', decision: { action: 'buy', nextCheck: '2027-01-01', count: 1 }, today: '2026-10-20' }).conflicts[0]).toContain('最新研究评级为回避')
    const calm = companySignals({ rating: '优先关注', price: 100, scenarios: scen('90', '130'), today: '2026-10-20' })
    expect(calm.conflicts).toEqual([])
    expect(calm.notes[0]).toContain('都偏积极')
  })
})
