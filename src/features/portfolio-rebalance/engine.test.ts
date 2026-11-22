import { describe, expect, it } from 'vitest'
import {
  compareSet,
  equalWeightInput,
  leaveOneOutInputs,
  riseToBound,
  runBacktest,
} from './engine'
import { loadAdjustedPriceBook, loadPublicPriceBook } from './fixtures'
import type { RunInput } from './types'

const book = loadAdjustedPriceBook()
const windowBook = loadPublicPriceBook(['AAPL', 'MSFT', 'CB', 'RKLB', 'QQQ', 'QQQE'])

const W1: RunInput = {
  symbols: ['AVGO', 'META', 'CB', 'SOFI', 'RKLB'],
  weights: [0.25, 0.25, 0.25, 0.125, 0.125],
  rule: { kind: 'buyHold' },
  start: '2021-08-25',
  end: '2026-11-20',
  cost: 0.001,
  initial: 1,
}

const W2: RunInput = {
  symbols: ['AVGO', 'META', 'CB', 'TSLA', 'NVDA'],
  weights: [0.25, 0.25, 0.25, 0.125, 0.125],
  rule: { kind: 'buyHold' },
  start: '2016-01-04',
  end: '2026-11-20',
  cost: 0.001,
  initial: 1,
}

describe('portfolio-rebalance engine anchors', () => {
  it('A1 买入持有', () => {
    const r = runBacktest(book, W1)
    expect(r.final.toFixed(4)).toBe('3.1020')
    expect(r.tradeCount).toBe(0)
  })

  it('A2 相对偏离 40%', () => {
    const r = runBacktest(book, { ...W1, rule: { kind: 'relative', pct: 0.4 } })
    expect(r.final.toFixed(4)).toBe('3.6138')
    expect(r.tradeCount).toBe(17)
  })

  it('大跌切换主设定', () => {
    const r = runBacktest(book, {
      ...W1,
      rule: { kind: 'relative', pct: 0.4 },
      switch: { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05 },
    })
    expect(r.final.toFixed(4)).toBe('4.2821')
    expect(r.tradeCount).toBe(21)
    expect(r.maxDrawdown.value.toFixed(4)).toBe('-0.4739')
    expect(r.episodes.map((e) => e.enter)).toEqual(
      expect.arrayContaining(['2022-03-14', '2025-04-04']),
    )
  })

  it('A3/A4 长窗口', () => {
    const bh = runBacktest(book, W2)
    expect(bh.final.toFixed(4)).toBe('29.7227')
    const reb = runBacktest(book, { ...W2, rule: { kind: 'relative', pct: 0.4 } })
    expect(reb.final.toFixed(4)).toBe('18.1600')
    expect(reb.tradeCount).toBe(16)
  })

  it('A5 QQQ', () => {
    const r = runBacktest(book, {
      symbols: ['QQQ'],
      weights: [1],
      rule: { kind: 'buyHold' },
      start: '2021-08-25',
      end: '2026-11-20',
      cost: 0.001,
      initial: 1,
    })
    expect(r.final.toFixed(4)).toBe('1.6234')
  })

  it('起点早于上市日时自动调整', () => {
    const r = runBacktest(book, { ...W1, start: '2015-01-02' })
    expect(r.startAdjusted).toBe(true)
    expect(r.start).toBe('2021-08-25')
  })

  it('非法输入抛错', () => {
    expect(() => runBacktest(book, { ...W1, weights: [0.2, 0.2, 0.2, 0.2, 0.1] })).toThrow(
      /权重合计/,
    )
    expect(() =>
      runBacktest(book, {
        ...W1,
        symbols: ['AVGO', 'META', 'CB', 'SOFI', 'AVGO'],
        weights: [0.2, 0.2, 0.2, 0.2, 0.2],
      }),
    ).toThrow(/重复/)
    expect(() =>
      runBacktest(book, {
        ...W1,
        rule: { kind: 'relative', pct: 0.4 },
        switch: { stable: 'KO', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05 },
      }),
    ).toThrow(/稳定资产/)
  })

  it('剔除换算', () => {
    const base: RunInput = {
      symbols: ['A', 'B', 'C', 'D', 'E'],
      weights: [0.2, 0.2, 0.2, 0.2, 0.2],
      rule: { kind: 'absolute', points: 0.05 },
      cost: 0.001,
      initial: 1,
    }
    const loo = leaveOneOutInputs(base)
    expect(loo).toHaveLength(5)
    for (const item of loo) {
      expect(item.input.symbols).toHaveLength(4)
      expect(item.input.weights.every((w) => Math.abs(w - 0.25) < 1e-12)).toBe(true)
      expect(item.input.rule).toEqual({ kind: 'absolute', points: 0.0625 })
    }
    const eq = equalWeightInput({
      ...W1,
      rule: { kind: 'absolute', points: 0.05 },
    })
    expect(eq.weights.every((w) => Math.abs(w - 0.2) < 1e-12)).toBe(true)
    expect(eq.rule).toEqual({ kind: 'absolute', points: 0.05 })
  })

  it('距离公式', () => {
    expect(riseToBound(0.235, 0.35)).toBeCloseTo(0.75, 2)
  })

  it('大跌切换 cap 0.5（供 manager 复核）', () => {
    const r = runBacktest(book, {
      ...W1,
      rule: { kind: 'relative', pct: 0.4 },
      switch: {
        stable: 'CB',
        entry: 0.2,
        gap: 0.05,
        step: 0.25,
        recover: 0.05,
        cap: 0.5,
      },
    })
    expect(r.final.toFixed(4)).toBe('3.8173')
    expect(r.tradeCount).toBe(19)
  })

  it('大跌切换 timeout 18 个月（供 manager 复核）', () => {
    const r = runBacktest(book, {
      ...W1,
      rule: { kind: 'relative', pct: 0.4 },
      switch: {
        stable: 'CB',
        entry: 0.2,
        gap: 0.05,
        step: 0.25,
        recover: 0.05,
        timeoutMonths: 18,
      },
    })
    // W1 窗口内各轮均在 18 个月内恢复，结果与主设定相同
    expect(r.final.toFixed(4)).toBe('4.2821')
    expect(r.tradeCount).toBe(21)
  })

  it('calendar 每年一次（供 manager 复核）', () => {
    const r = runBacktest(book, {
      ...W1,
      rule: { kind: 'calendar', every: 'year' },
    })
    expect(r.final.toFixed(4)).toBe('3.7908')
    expect(r.tradeCount).toBe(5)
  })

  it('逐一剔除与等权反事实沿用原组合实际起止日', () => {
    const comparison = compareSet(windowBook, {
      symbols: ['AAPL', 'MSFT', 'RKLB'],
      weights: [0.4, 0.35, 0.25],
      rule: { kind: 'relative', pct: 0.4 },
      start: '2010-01-01',
      end: '2026-11-20',
      cost: 0.001,
      initial: 1,
    })
    expect(comparison.custom.active.start).toBe('2021-08-25')
    const dropped = comparison.leaveOneOut.find(row => row.dropped === 'RKLB')!
    expect(dropped.active.start).toBe('2021-08-25')
    expect(dropped.active.end).toBe(comparison.custom.active.end)
    expect(dropped.hold.start).toBe('2021-08-25')
    expect(comparison.equal.active.start).toBe('2021-08-25')
    expect(comparison.equal.hold.start).toBe('2021-08-25')
  })

  it('等权动态与等权不动共用原组合剔除信号缺日后的交易日', () => {
    const dates = ['2024-01-31', '2024-02-01', '2024-02-02', '2025-02-03']
    const series = { dates, adjClose: [100, 100, 100, 100] }
    const comparison = compareSet({
      AAPL: series, MSFT: series, CB: series,
      QQQ: { dates: dates.filter((_, i) => i !== 1), adjClose: [100, 100, 100] },
    }, {
      symbols: ['AAPL', 'MSFT', 'CB'], weights: [0.4, 0.35, 0.25],
      rule: { kind: 'relative', pct: 0.4 },
      switch: { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05 },
      cost: 0.001, initial: 1,
    })
    expect(comparison.equal.active.dates).toEqual(comparison.custom.active.dates)
    expect(comparison.equal.hold.dates).toEqual(comparison.custom.active.dates)
  })

  it('基准沿用组合实际窗口，QQQE 数据较晚时保留实际起点', () => {
    const comparison = compareSet(windowBook, {
      symbols: ['AAPL', 'MSFT', 'CB'],
      weights: [0.4, 0.35, 0.25],
      rule: { kind: 'relative', pct: 0.4 },
      start: '2010-01-01',
      end: '2026-11-20',
      cost: 0.001,
      initial: 1,
    })
    expect(comparison.custom.active.start).toBe('2010-01-04')
    expect(comparison.benchmarks.QQQ?.start).toBe('2010-01-04')
    expect(comparison.benchmarks.QQQ?.end).toBe(comparison.custom.active.end)
    expect(comparison.benchmarks.QQQE?.start).toBe('2012-03-21')
    expect(comparison.benchmarks.QQQE?.end).toBe(comparison.custom.active.end)
  })

  it('compareSet 使用 QQQE 作为纳指 100 等权基准，QQEW 不进入对比集', () => {
    const series = { dates: ['2024-01-02', '2025-01-02'], adjClose: [100, 110] }
    const comparison = compareSet({
      AVGO: series,
      META: series,
      QQQ: series,
      QQQE: series,
      QQEW: series,
    }, {
      symbols: ['AVGO', 'META'],
      weights: [0.5, 0.5],
      rule: { kind: 'buyHold' },
      cost: 0.001,
      initial: 1,
    })
    expect(Object.keys(comparison.benchmarks)).toEqual(['QQQ', 'QQQE'])
    expect(comparison.benchmarks.QQQE?.final).toBeCloseTo(1.1)
    expect(comparison.benchmarks.QQQ?.final).toBeCloseTo(1.1)
  })
})

describe('signalState', () => {
  const dates = [
    '2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07', '2020-01-08', '2020-01-09', '2020-01-10',
  ]
  const flat = (n: number) => Array.from({ length: n }, () => 100)
  const baseInput: RunInput = {
    symbols: ['GROW', 'CB'],
    weights: [0.5, 0.5],
    rule: { kind: 'buyHold' },
    switch: { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05 },
    cost: 0,
    initial: 1,
  }
  const bookOf = (signalPrices: number[], signalSym = 'QQQ') => ({
    GROW: { dates, adjClose: flat(dates.length) },
    CB: { dates, adjClose: flat(dates.length) },
    [signalSym]: { dates, adjClose: signalPrices },
  })

  it('未启用切换时无 signalState', () => {
    const r = runBacktest(bookOf([100, 100, 100, 100, 100, 100, 100]), {
      ...baseInput,
      switch: undefined,
    })
    expect(r.signalState).toBeUndefined()
  })

  it('未触发：inStress=false，下一步为进入阈值', () => {
    const r = runBacktest(bookOf([100, 100, 95, 95, 95, 95, 95]), baseInput)
    expect(r.signalState).toMatchObject({
      symbol: 'QQQ',
      asOf: '2020-01-10',
      peak: 100,
      peakDate: '2020-01-02',
      inStress: false,
      steps: 0,
      soldFraction: 0,
      nextStepDrawdown: -0.2,
      recoverDrawdown: -0.05,
      pendingAction: null,
    })
    expect(r.signalState!.drawdown).toBeCloseTo(-0.05)
  })

  it('大跌状态中：步数、累计卖出、下一步回撤', () => {
    // 100→79 进入并排定第一步；次日成交；之后维持约 −21%
    const r = runBacktest(bookOf([100, 100, 79, 79, 79, 79, 79]), baseInput)
    expect(r.signalState!.inStress).toBe(true)
    expect(r.signalState!.steps).toBe(1)
    expect(r.signalState!.soldFraction).toBeCloseTo(0.25)
    expect(r.signalState!.nextStepDrawdown).toBeCloseTo(-0.25)
    expect(r.signalState!.peak).toBe(100)
    expect(r.signalState!.peakDate).toBe('2020-01-02')
    expect(r.signalState!.drawdown).toBeCloseTo(-0.21)
    expect(r.signalState!.pendingAction).toBeNull()
  })

  it('到上限后 nextStepDrawdown 为 null', () => {
    const r = runBacktest(bookOf([100, 100, 79, 79, 74, 74, 69]), {
      ...baseInput,
      switch: { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05, cap: 0.5 },
    })
    expect(r.signalState!.inStress).toBe(true)
    expect(r.signalState!.steps).toBe(2)
    expect(r.signalState!.soldFraction).toBeCloseTo(0.5)
    expect(r.signalState!.nextStepDrawdown).toBeNull()
  })

  it('恢复方式为回到新高时 recoverDrawdown 为 0', () => {
    const r = runBacktest(bookOf([100, 100, 79, 79, 79, 79, 79]), {
      ...baseInput,
      switch: { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 'newHigh' },
    })
    expect(r.signalState!.recoverDrawdown).toBe(0)
    expect(r.signalState!.inStress).toBe(true)
  })

  it('恢复后高点重置', () => {
    // 进入→成交→回到高点恢复信号→次日调回；末日新高
    const r = runBacktest(bookOf([100, 100, 79, 79, 100, 100, 110]), {
      ...baseInput,
      switch: { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 'newHigh' },
    })
    expect(r.signalState!.inStress).toBe(false)
    expect(r.signalState!.peak).toBe(110)
    expect(r.signalState!.peakDate).toBe('2020-01-10')
    expect(r.signalState!.drawdown).toBeCloseTo(0)
    expect(r.signalState!.steps).toBe(0)
    expect(r.signalState!.soldFraction).toBe(0)
    expect(r.signalState!.recoverDrawdown).toBe(0)
  })

  it('信号指数为 SPY 时填充对应 symbol，compareSet 沿用同一信号', () => {
    const book = bookOf([100, 100, 79, 79, 79, 79, 79], 'SPY')
    book.QQQ = { dates, adjClose: flat(dates.length) }
    book.QQQE = { dates, adjClose: flat(dates.length) }
    const input: RunInput = { ...baseInput, signal: 'SPY', rule: { kind: 'relative', pct: 0.4 } }
    const r = runBacktest(book, input)
    expect(r.signalState!.symbol).toBe('SPY')
    expect(r.signalState!.inStress).toBe(true)
    const comparison = compareSet(book, input)
    expect(comparison.custom.active.signalState?.symbol).toBe('SPY')
    expect(comparison.equal.active.signalState?.symbol).toBe('SPY')
  })

  it('最后一天首次进入：pendingAction=step，steps=0', () => {
    const short = ['2020-01-02', '2020-01-03', '2020-01-06']
    const book = {
      GROW: { dates: short, adjClose: [100, 100, 100] },
      CB: { dates: short, adjClose: [100, 100, 100] },
      QQQ: { dates: short, adjClose: [100, 100, 79] },
    }
    const r = runBacktest(book, { ...baseInput, end: '2020-01-06' })
    expect(r.signalState).toMatchObject({
      inStress: true,
      steps: 0,
      pendingAction: 'step',
      soldFraction: 0,
      nextStepDrawdown: -0.25,
    })
    expect(r.tradeCount).toBe(0)
  })

  it('最后一天再下一档：pendingAction=step，已成交步数不变', () => {
    // 进入→成交一步→末日再穿一档（未成交）
    const short = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07', '2020-01-08']
    const book = {
      GROW: { dates: short, adjClose: [100, 100, 100, 100, 100] },
      CB: { dates: short, adjClose: [100, 100, 100, 100, 100] },
      QQQ: { dates: short, adjClose: [100, 100, 79, 79, 74] },
    }
    const r = runBacktest(book, { ...baseInput, end: '2020-01-08' })
    expect(r.signalState!.inStress).toBe(true)
    expect(r.signalState!.steps).toBe(1)
    expect(r.signalState!.pendingAction).toBe('step')
    expect(r.signalState!.soldFraction).toBeCloseTo(0.25)
    expect(r.signalState!.nextStepDrawdown).toBeCloseTo(-0.3)
  })

  it('最后一天满足恢复：pendingAction=recover', () => {
    const short = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07', '2020-01-08']
    const book = {
      GROW: { dates: short, adjClose: [100, 100, 100, 100, 100] },
      CB: { dates: short, adjClose: [100, 100, 100, 100, 100] },
      QQQ: { dates: short, adjClose: [100, 100, 79, 79, 96] },
    }
    const r = runBacktest(book, { ...baseInput, end: '2020-01-08' })
    expect(r.signalState!.inStress).toBe(true)
    expect(r.signalState!.steps).toBe(1)
    expect(r.signalState!.pendingAction).toBe('recover')
    expect(r.signalState!.drawdown).toBeCloseTo(-0.04)
  })

  it('最后一天触发但已到上限：pendingAction 为 null', () => {
    const r = runBacktest(bookOf([100, 100, 79, 79, 74, 74, 69]), {
      ...baseInput,
      switch: { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05, cap: 0.5 },
    })
    expect(r.signalState!.inStress).toBe(true)
    expect(r.signalState!.steps).toBe(2)
    expect(r.signalState!.soldFraction).toBeCloseTo(0.5)
    expect(r.signalState!.pendingAction).toBeNull()
    expect(r.signalState!.nextStepDrawdown).toBeNull()
  })
})
