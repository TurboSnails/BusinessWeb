import { describe, expect, it } from 'vitest'
import {
  asEarningsCalendar, bandPosition, candidateKeys, fmtAmount, fmtEps, fmtPct, groupByDay, isMegaCap, isRatedUp, matches, mostWatched,
  staleDays, surpriseClass, surpriseTone, venueKey, watchScore, weekDays, DEFAULT_FILTERS,
} from './model'
import { calendar, item } from './fixtures'
import type { CandidateItem } from '../candidates/validation'

const cand = (market: CandidateItem['market'], code: string): CandidateItem => ({ market, code, addedAt: '2026-11-01T00:00:00Z' })

describe('财报前瞻模型', () => {
  it('形状检查：坏文件返回 null，坏条目被过滤', () => {
    expect(asEarningsCalendar(null)).toBeNull()
    expect(asEarningsCalendar({ schemaVersion: 2, generatedAt: 'x', items: [] })).toBeNull()
    const ok = asEarningsCalendar({ ...calendar(), items: [item(), { code: 'X', date: 'bad' }], cnNotices: undefined })
    expect(ok?.items).toHaveLength(1)
    expect(ok?.cnNotices).toEqual([])
  })

  it('周：工作日取本周一至周五；周末取下一周', () => {
    expect(weekDays('2026-11-12')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'])
    expect(weekDays('2026-11-14')[0]).toBe('2026-11-16')
    expect(weekDays('2026-11-15', 1)[0]).toBe('2026-11-23')
  })

  it('候选池按交易地 + 统一代码匹配：ndx / us 同一家，港股 0700 = 00700', () => {
    const pool = candidateKeys([cand('ndx', 'NVDA'), cand('hk', '0700')])
    expect(pool.has(venueKey('us', 'NVDA'))).toBe(true)
    expect(pool.has(venueKey('hk', '00700'))).toBe(true)
    expect(pool.has(venueKey('cn', '600519'))).toBe(false)
  })

  it('筛选：市场、只看候选池、只看条件关注以上、搜索名称或代码', () => {
    const pool = candidateKeys([cand('us', 'WMT')])
    const all = calendar().items
    expect(all.filter(i => matches(i, { ...DEFAULT_FILTERS, venue: 'hk' }, pool)).map(i => i.code)).toEqual(['00700'])
    expect(all.filter(i => matches(i, { ...DEFAULT_FILTERS, onlyCandidates: true }, pool)).map(i => i.code)).toEqual(['WMT'])
    expect(all.filter(i => matches(i, { ...DEFAULT_FILTERS, onlyRated: true }, pool)).map(i => i.code)).toEqual(['NVDA', '00700', 'CSCO', '600519'])
    expect(all.filter(i => matches(i, { ...DEFAULT_FILTERS, query: '腾讯' }, pool)).map(i => i.code)).toEqual(['00700'])
    expect(all.filter(i => matches(i, { ...DEFAULT_FILTERS, query: 'csco' }, pool)).map(i => i.code)).toEqual(['CSCO'])
    expect(isRatedUp('优先跟踪')).toBe(true)
    expect(isRatedUp('中性观察')).toBe(false)
    expect(isRatedUp(null)).toBe(false)
  })

  it('按日 + 盘前 / 盘后 / 其他分组，窗口外的日子不收', () => {
    const g = groupByDay(calendar().items, weekDays('2026-11-14'))
    expect(g.get('2026-11-17')!.amc.map(i => i.code)).toEqual(['NVDA'])
    expect(g.get('2026-11-19')!.bmo.map(i => i.code)).toEqual(['WMT'])
    expect(g.get('2026-11-18')!.other.map(i => i.code)).toEqual(['ZZZ', '00700'])
    expect(g.has('2026-11-12')).toBe(false)
  })

  it('本周最受关注：候选池 +3、优先 +2 / 条件 +1、大市值 +1；0 分不入选', () => {
    const pool = candidateKeys([cand('us', 'WMT')])
    const items = calendar().items.filter(i => weekDays('2026-11-14').includes(i.date))
    expect(watchScore(items.find(i => i.code === 'WMT')!, pool)).toBe(4)
    expect(watchScore(items.find(i => i.code === '00700')!, pool)).toBe(3)
    expect(watchScore(items.find(i => i.code === 'NVDA')!, pool)).toBe(2)
    expect(mostWatched(items, pool).map(i => i.code)).toEqual(['WMT', '00700', 'NVDA'])
    expect(isMegaCap({ value: 1.5e11, currency: 'USD' })).toBe(false)
    expect(isMegaCap({ value: 5e12, currency: 'CNY' })).toBe(false)
  })

  it('超预期颜色：美股与 A / 港股用不同类；缺失单列', () => {
    expect(surpriseTone(5)).toBe('beat')
    expect(surpriseTone(-0.1)).toBe('miss')
    expect(surpriseTone(null)).toBeNull()
    expect(surpriseClass('us', 3)).toBe('ec-surprise is-beat is-us')
    expect(surpriseClass('adr', -3)).toBe('ec-surprise is-miss is-us')
    expect(surpriseClass('hk', 3)).toBe('ec-surprise is-beat is-hk')
    expect(surpriseClass('cn', null)).toBe('ec-surprise is-missing')
  })

  it('情景带位置：夹在 0..1，写明相对基准幅度；没有价格时为 null', () => {
    expect(bandPosition({ bear: 100, base: 150, bull: 200, price: 125, priceDate: null, currency: null })).toEqual({ position: 0.25, vsBase: 20, zone: 'bear-base' })
    expect(bandPosition({ bear: 100, base: 150, bull: 200, price: 250, priceDate: null, currency: null })?.position).toBe(1)
    expect(bandPosition({ bear: 100, base: 150, bull: 200, price: 90, priceDate: null, currency: null })?.zone).toBe('below-bear')
    expect(bandPosition({ bear: 100, base: 150, bull: 200, price: null, priceDate: null, currency: null })).toBeNull()
  })

  it('格式：缺失写“缺失”，大额用亿 / 万亿', () => {
    expect(fmtEps(null)).toBe('缺失')
    expect(fmtEps(2.4712, 'USD')).toBe('$2.47')
    expect(fmtEps(-0.32, 'USD')).toBe('−$0.32')
    expect(fmtAmount(108731903900, 'USD')).toBe('$1087 亿')
    expect(fmtAmount(3.4e12, 'HKD')).toBe('HK$3.40 万亿')
    expect(fmtPct(5.64)).toBe('+5.6%')
    expect(fmtPct(undefined)).toBe('缺失')
  })

  it('过期：生成超过 2 天提示', () => {
    expect(staleDays('2026-11-14T08:00:00Z', new Date('2026-11-15T08:00:00Z'))).toBeNull()
    expect(staleDays('2026-11-14T08:00:00Z', new Date('2026-11-17T09:00:00Z'))).toBe(3)
    expect(staleDays('bad', new Date())).toBeNull()
  })
})
