import { describe, expect, it } from 'vitest'
import { candidateAlerts, countAlerts, priceAlertStates } from './alerts'
import type { ToolSources } from './links'
import type { AutoDcf } from '../dcf/autoDcf'
import type { CandidateAlertRule, CandidateItem, DecisionRecord } from './validation'

const TODAY = '2026-10-20'
const record = (over: Partial<DecisionRecord> = {}): DecisionRecord => ({ at: '2026-06-01T00:00:00.000Z', action: 'watch', why: 'w', wrong: 'x', nextCheck: '2026-12-01', ...over })
const item = (code: string, over: Partial<CandidateItem> = {}): CandidateItem => ({ market: 'cn', code, addedAt: '2026-01-01T00:00:00.000Z', ...over })
const auto = (entries: [string, Partial<AutoDcf>][]): ToolSources => ({
  dcf: [], valuation: [], grid: [],
  auto: new Map(entries.map(([k, v]) => [k, { status: 'ok', fair: 100, buyBelow: 80, credibility: 'medium', current: 90, currency: 'CNY', ...v } as AutoDcf])),
})

describe('candidateAlerts', () => {
  it('决策到期：最新一条的检查日已到', () => {
    const alerts = candidateAlerts([item('600519', { decisions: [record({ nextCheck: '2026-10-20' })] }), item('000001', { decisions: [record()] })], auto([]), TODAY)
    expect(alerts.map(a => [a.code, a.kind])).toEqual([['600519', 'review']])
  })

  it('进入买入区：现价低于自动 DCF 买入参考价（低可信度除外），没有决策记录时提醒先写', () => {
    const tools = auto([['cn:600519', { current: 75 }], ['cn:000001', { current: 75, credibility: 'low' }], ['cn:000002', { current: 85 }]])
    const alerts = candidateAlerts([item('600519'), item('000001'), item('000002')], tools, TODAY)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ code: '600519', kind: 'buy-zone' })
    expect(alerts[0].text).toContain('还没有决策记录')
  })

  it('评级相对决策快照变化时提醒；只比较归档后的档位', () => {
    const items = [
      item('600519', { decisions: [record({ snapshot: { rating: '逢低增持' } })] }),
      item('000001', { decisions: [record({ snapshot: { rating: '条件关注' } })] }),
    ]
    const ratings = new Map([['cn:600519', '回避'], ['cn:000001', '逢低增持']])
    const alerts = candidateAlerts(items, auto([]), TODAY, ratings)
    expect(alerts.map(a => a.code)).toEqual(['600519'])
    expect(alerts[0].text).toContain('从「条件关注」变为「回避」')
    expect(candidateAlerts(items, auto([]), TODAY)).toEqual([])
  })

  it('本人 DCF 超过 180 天提示过期；安全边际 ≥20% 记为进入买入区', () => {
    const tools: ToolSources = {
      dcf: [{ market: 'cn', code: '600519', savedAt: '2026-01-01T00:00:00.000Z', input: { currency: 'CNY' }, result: { price: 130, mos: 0.3 } } as never],
      valuation: [], grid: [],
    }
    const alerts = candidateAlerts([item('600519')], tools, TODAY)
    expect(alerts.map(a => a.kind)).toEqual(['buy-zone', 'stale-dcf'])
    expect(countAlerts(alerts)).toEqual({ 'buy-zone': 1, 'stale-dcf': 1 })
  })

  describe('触及条件价', () => {
    const rule = (over: Partial<CandidateAlertRule> = {}): CandidateAlertRule => ({ kind: 'price-below', threshold: 90, currency: 'CNY', anchor: { type: 'research-bear', value: 90, asOf: '2026-10-16' }, enabled: true, createdAt: '2026-10-01T00:00:00.000Z', ...over })
    const priced = (current: number, priceDate = '2026-10-19'): ToolSources => auto([['cn:600519', { current, priceDate, buyBelow: null }]])

    it('用预填库收盘价判断：触及时写明触发价、行情日期、来源和条件价来源，措辞是复核不是买入', () => {
      const alerts = candidateAlerts([item('600519', { alert: rule() })], priced(90), TODAY)
      expect(alerts).toHaveLength(1)
      expect(alerts[0]).toMatchObject({ kind: 'price-hit', price: { price: 90, date: '2026-10-19' } })
      expect(alerts[0].text).toContain('到了你设的价位，该复核一眼')
      expect(alerts[0].text).toContain('2026-10-19')
      expect(alerts[0].text).toContain('研究估值·悲观价')
      expect(alerts[0].text).not.toMatch(/买入信号/)
      expect(countAlerts(alerts)).toEqual({ 'price-hit': 1 })
    })
    it('高于条件价、旧版摘要没有行情日期、暂停中都不列出', () => {
      expect(candidateAlerts([item('600519', { alert: rule() })], priced(91), TODAY)).toEqual([])
      expect(candidateAlerts([item('600519', { alert: rule() })], auto([['cn:600519', { current: 80, buyBelow: null }]]), TODAY)).toEqual([])
      expect(candidateAlerts([item('600519', { alert: rule({ snoozedUntil: '2026-10-27' }) })], priced(80), TODAY)).toEqual([])
    })
    it('调用方补充的价格锚点也参与（取同币种最新）；判断结果给页面说明暂停原因', () => {
      const items = [item('600519', { alert: rule() })]
      const extra = new Map([['cn:600519', [{ price: 85, currency: 'CNY', date: '2026-10-20', source: '公司页价格锚点' }]]])
      expect(candidateAlerts(items, priced(95, '2026-10-16'), TODAY, undefined, extra)[0]?.price?.source).toBe('公司页价格锚点')
      expect(priceAlertStates(items, priced(80, '2026-10-01'), TODAY).get('cn:600519')).toMatchObject({ status: 'skipped', reason: 'stale' })
      expect(priceAlertStates(items, auto([['cn:600519', { current: 80, currency: 'USD', priceDate: '2026-10-19' }]]), TODAY).get('cn:600519')).toMatchObject({ reason: 'currency-mismatch' })
    })
  })
})
