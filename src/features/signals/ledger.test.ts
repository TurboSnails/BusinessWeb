import { describe, expect, it } from 'vitest'
import { buildSnapshot, mergeSnapshot, radarRuleOf, reviewLedger, validLedger, weekOf, type Ledger, type LedgerRow } from './ledger'

describe('信号台账', () => {
  it('快照：预填库价格优先，带评级档位、DCF 与雷达信号', () => {
    const snap = buildSnapshot({
      companies: [{ venue: 'cn', code: '600519', rating: '逢低增持', price: 1300 }, { venue: 'us', code: 'pep', rating: '回避', price: 130 }, { venue: 'us', code: 'X', rating: '观察' }],
      dcf: new Map([['cn:600519', { current: 1331.88, fair: 1890.17, buyBelow: 1512.13, credibility: 'medium' as const }]]),
      radar: new Map([['cn:600519', 1]]),
    })
    expect(snap['cn:600519']).toEqual([1331.88, 1, 1890.17, 1512.13, 'm', 1])
    expect(snap['us:PEP']).toEqual([130, 3, null, null, null, -1])
    expect(snap['us:X']).toBeUndefined()
  })

  it('每周只留一期（同周以最新为准），按日期排序', () => {
    expect(weekOf('2026-10-21')).toBe('2026-10-19')
    expect(weekOf('2026-10-19')).toBe('2026-10-19')
    let l = mergeSnapshot(null, '2026-10-13', {})
    l = mergeSnapshot(l, '2026-10-19', {})
    l = mergeSnapshot(l, '2026-10-21', { 'cn:1': [1, null, null, null, null, -1] })
    expect(Object.keys(l.snapshots)).toEqual(['2026-10-13', '2026-10-21'])
    expect(validLedger(l)).toBe(true)
    expect(validLedger({ schemaVersion: 1, snapshots: { bad: {} } })).toBe(false)
  })

  it('复盘：满 28 天才出结果；各组与同市场等权平均比较，样本不足 5 家不下结论', () => {
    const row = (price: number, rating: number, radar = -1, buyBelow: number | null = null): LedgerRow => [price, rating, null, buyBelow, null, radar]
    const start: Record<string, LedgerRow> = {}
    const end: Record<string, LedgerRow> = {}
    for (let i = 0; i < 6; i++) { start[`cn:A${i}`] = row(100, 0, 2, 120); end[`cn:A${i}`] = row(120, 0) } // 优先关注 +20%
    for (let i = 0; i < 6; i++) { start[`cn:B${i}`] = row(100, 3); end[`cn:B${i}`] = row(90, 3) } // 回避 −10%
    start['cn:C0'] = row(100, 2); end['cn:C0'] = row(100, 2)
    const ledger: Ledger = { schemaVersion: 1, snapshots: { '2026-09-01': start, '2026-09-20': start, '2026-10-01': end } }
    const { reviews, count, first } = reviewLedger(ledger)
    expect([count, first, reviews.length]).toEqual([3, '2026-09-01', 1])
    const cn = reviews[0].venues.find(v => v.venue === 'cn')!
    expect(cn.n).toBe(13)
    const g = (id: string) => cn.groups.find(x => x.id === id)!
    expect(g('rating:0').mean).toBeCloseTo(0.2)
    expect(g('rating:0').excess).toBeCloseTo(0.2 - cn.mean)
    expect(g('rating:0').beatRate).toBe(1)
    expect(g('rating:3').excess! < 0).toBe(true)
    expect(g('radar2').n).toBe(6)
    expect(g('below-buy').n).toBe(6)
    expect(g('rating:2')).toMatchObject({ n: 1, mean: null })
  })

  it('雷达规则版本：每期记下版本，同周覆盖时一并替换；缺省按第 1 版解读', () => {
    let l = mergeSnapshot(null, '2026-11-13', {})
    expect(l.radarRule).toBeUndefined()
    expect(radarRuleOf(l, '2026-11-13')).toBe(1)
    l = mergeSnapshot(l, '2026-11-20', {}, 2)
    expect(l.radarRule).toEqual({ '2026-11-20': 2 })
    l = mergeSnapshot(l, '2026-11-21', {}, 2) // 同周覆盖
    expect(Object.keys(l.snapshots)).toEqual(['2026-11-13', '2026-11-21'])
    expect(l.radarRule).toEqual({ '2026-11-21': 2 })
    expect(validLedger(l)).toBe(true)
    expect(validLedger({ ...l, radarRule: { '2026-11-21': 'x' } })).toBe(false)
  })

  it('复盘按起始快照的规则版本拆雷达分组：第 1 版三项共振，第 2 版两条主线', () => {
    const row = (price: number, radar = -1): LedgerRow => [price, null, null, null, null, radar]
    const start: Record<string, LedgerRow> = {}, end: Record<string, LedgerRow> = {}
    for (let i = 0; i < 5; i++) { start[`cn:V${i}`] = row(100, 1); end[`cn:V${i}`] = row(110) }
    for (let i = 0; i < 5; i++) { start[`cn:G${i}`] = row(100, 2); end[`cn:G${i}`] = row(90) }
    const v2: Ledger = { schemaVersion: 1, snapshots: { '2026-11-20': start, '2026-12-20': end }, radarRule: { '2026-11-20': 2 } }
    const review = reviewLedger(v2).reviews[0]
    expect(review.radarRule).toBe(2)
    const ids = review.venues[0].groups.map(g => g.id)
    expect(ids).toEqual(expect.arrayContaining(['radar', 'radar-value', 'radar-growth']))
    expect(ids).not.toContain('radar2')
    const g = (id: string) => review.venues[0].groups.find(x => x.id === id)!
    expect(g('radar-value').mean).toBeCloseTo(0.1)
    expect(g('radar-growth').mean).toBeCloseTo(-0.1)
    const v1 = reviewLedger({ schemaVersion: 1, snapshots: v2.snapshots }).reviews[0]
    expect(v1.radarRule).toBe(1)
    expect(v1.venues[0].groups.map(x => x.id)).toContain('radar2')
  })
})
