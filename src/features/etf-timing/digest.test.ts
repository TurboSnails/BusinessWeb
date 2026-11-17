import { describe, expect, it } from 'vitest'
import { asEtfTiming } from './model'
import { fixture } from './fixtures'
import { buildTimingDigest, composeTimingEmail, previousWeekday, TIMING_FOOTER } from './digest'

const rule = (holding: boolean, date?: string, side: 'buy' | 'sell' = 'buy', pending: 'buy' | 'sell' | null = null) => ({ holding, pending, lastSignal: date ? { date, side } : null })

function data(over: Record<string, unknown> = {}) {
  const f = fixture()
  f.latest.items = [
    { code: '512760', name: '芯片ETF', close: 1.234, date: '2026-11-13', hs: rule(false, '2026-11-13', 'buy', 'buy'), cyb: rule(false) },
    { code: '510050', name: '上证50ETF', close: 3.1, date: '2026-11-13', hs: rule(false, '2026-11-13', 'sell'), cyb: rule(true) },
    { code: '159995', name: '芯片ETF华夏', close: 1.5, date: '2026-11-13', hs: rule(true, '2026-11-13', 'sell', 'sell'), cyb: rule(true) },
    { code: '159915', name: '创业板ETF', close: 2.5, date: '2026-11-13', hs: rule(true, '2026-11-05'), cyb: rule(false) },
  ] as never
  f.latest.timing.hs300Bull = true
  f.history = [
    { asOf: '2026-11-12', complete: true, hs300Bull: true, cybBull: true, n: 4, hsHolding: 1, cybHolding: 2, missing: 0 },
    { asOf: '2026-11-13', complete: true, hs300Bull: true, cybBull: true, n: 4, hsHolding: 2, cybHolding: 2, missing: 0 },
  ]
  return asEtfTiming({ ...f, ...over })!
}

describe('previousWeekday', () => {
  it('跳过周末', () => {
    expect(previousWeekday('2026-11-17')).toBe('2026-11-16') // 周二 → 周一
    expect(previousWeekday('2026-11-16')).toBe('2026-11-13') // 周一 → 周五
    expect(previousWeekday('2026-11-14')).toBe('2026-11-13') // 周六 → 周五
  })
})

describe('buildTimingDigest', () => {
  it('只列数据日当天的新信号，区分卖出执行时点', () => {
    const r = buildTimingDigest(data(), '2026-11-14')
    if (!('digest' in r)) throw new Error('expected digest')
    const d = r.digest
    expect(d.key).toBe('timing|2026-11-13')
    expect(d.buys.map(b => b.code)).toEqual(['512760'])
    expect(d.sells.map(s => [s.code, s.nextOpen])).toEqual([['159995', true], ['510050', false]])
    expect(d.flipped).toBe(false)
    expect(d.empty).toBe(false)
  })

  it('上一份快照之后的信号都算新信号；上一份缺数据时把那天也算进来', () => {
    const base = data()
    base.latest!.items[3].hs = rule(true, '2026-11-12') as never // 上一份当天的信号
    const ok = buildTimingDigest(base, '2026-11-14')
    if (!('digest' in ok)) throw new Error('expected digest')
    expect(ok.digest.buys.map(b => b.code)).toEqual(['512760'])
    base.history[0].complete = false
    const gap = buildTimingDigest(base, '2026-11-14')
    if (!('digest' in gap)) throw new Error('expected digest')
    expect(gap.digest.buys.map(b => [b.code, b.date])).toEqual([['512760', '2026-11-13'], ['159915', '2026-11-12']])
    expect(composeTimingEmail(gap.digest, 'https://x.test').text).toContain('信号日 2026-11-12')
    expect(composeTimingEmail(gap.digest, 'https://x.test').text).toContain('（2026-11-12 起）')
    expect(composeTimingEmail(ok.digest, 'https://x.test').text).toContain('（2026-11-12 之后）')
  })

  it('上一天运行失败时，跨两天的信号都列出', () => {
    const base = data()
    base.history = base.history.filter(h => h.asOf !== '2026-11-12')
    base.history.unshift({ asOf: '2026-11-11', complete: true, hs300Bull: true, cybBull: true, n: 4, hsHolding: 1, cybHolding: 2, missing: 0 })
    base.latest!.items[3].hs = rule(true, '2026-11-12') as never
    const r = buildTimingDigest(base, '2026-11-14')
    if (!('digest' in r)) throw new Error('expected digest')
    expect(r.digest.prevAsOf).toBe('2026-11-11')
    expect(r.digest.buys.map(b => b.code)).toEqual(['512760', '159915'])
  })

  it('择时状态翻转也算有事', () => {
    const base = data()
    base.latest!.items = base.latest!.items.filter(i => i.code === '159915')
    base.latest!.timing.hs300Bull = false
    const r = buildTimingDigest(base, '2026-11-14')
    if (!('digest' in r)) throw new Error('expected digest')
    expect(r.digest).toMatchObject({ flipped: true, prevBull: true, bull: false, empty: false })
  })

  it('没有新信号也没翻转时为空', () => {
    const base = data()
    base.latest!.items = base.latest!.items.filter(i => i.code === '159915')
    const r = buildTimingDigest(base, '2026-11-14')
    expect('digest' in r && r.digest.empty).toBe(true)
  })

  it('快照早于前一个工作日时跳过，不把旧信号当新信号', () => {
    expect(buildTimingDigest(data(), '2026-11-18')).toEqual({ skip: 'stale' })
    expect(buildTimingDigest(data(), '2026-11-16')).toHaveProperty('digest') // 周一早上看上周五
  })

  it('无数据时跳过', () => {
    expect(buildTimingDigest(null, '2026-11-14')).toEqual({ skip: 'no-data' })
    expect(buildTimingDigest(data({ latest: null }), '2026-11-14')).toEqual({ skip: 'no-data' })
  })
})

describe('composeTimingEmail', () => {
  it('标题列计数，正文带免责与实验页链接，HTML 转义', () => {
    const r = buildTimingDigest(data(), '2026-11-14')
    if (!('digest' in r)) throw new Error('expected digest')
    r.digest.buys[0].name = '<芯片>'
    const m = composeTimingEmail(r.digest, 'https://x.test')
    expect(m.subject).toBe('ETF 择时观察 · 11-13 · 买入信号 1、卖出信号 2')
    expect(m.text).toContain(TIMING_FOOTER)
    expect(m.text).toContain('https://x.test/lab/etf-timing')
    expect(m.text).toContain('（已按当日收盘离场）')
    expect(m.html).toContain('&lt;芯片&gt;')
    expect(m.html).not.toContain('<芯片>')
  })

  it('数据不完整时写明名单总数与实际取到的只数', () => {
    const base = data()
    base.latest!.summary.missing = 2
    base.latest!.complete = false
    const r = buildTimingDigest(base, '2026-11-14')
    if (!('digest' in r)) throw new Error('expected digest')
    const m = composeTimingEmail(r.digest, 'https://x.test')
    expect(m.text).toContain(`冻结名单 ${r.digest.n + 2} 只（本次取到 ${r.digest.n} 只）`)
    expect(m.text).toContain('数据不完整：缺 2 只')
  })

  it('翻转写进标题，偏防守时说明不开新仓', () => {
    const base = data()
    base.latest!.items = base.latest!.items.filter(i => i.code === '159915')
    base.latest!.timing.hs300Bull = false
    const r = buildTimingDigest(base, '2026-11-14')
    if (!('digest' in r)) throw new Error('expected digest')
    const m = composeTimingEmail(r.digest, 'https://x.test')
    expect(m.subject).toBe('ETF 择时观察 · 11-13 · 择时转偏防守')
    expect(m.text).toContain('与 2026-11-12 相比由偏进攻转为偏防守')
    expect(m.text).toContain('不开新仓')
  })
})
