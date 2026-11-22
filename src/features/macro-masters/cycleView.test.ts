import { describe, expect, it } from 'vitest'
import { buildCycleView } from './cycleView'
import { MASTERS } from './masters'
import type { DimensionId, Lean, Master, Reading, ReadingKey } from './types'

type Inputs = Parameters<typeof buildCycleView>[0]

const fixtureLabels: Partial<Record<ReadingKey, string>> = {
  spxAbove200: '标普 500 成分股高于 200 日线占比',
  netNewHighs: '标普 500 净新高比例',
  hySpread: '高收益债利差',
  baaAaa: '穆迪 Baa − Aaa',
  policyRate: '准备金余额利率',
  nfci: '芝加哥联储金融条件指数',
  netLiquidity: '净流动性（近似）',
  epsRevision: '标普 500 盈利预期修正',
  sahm: '萨姆规则实时值',
  cape: '席勒 CAPE',
  fearGreed: 'CNN 恐慌贪婪指数',
  vix: 'VIX',
  debtService: '家庭偿债比',
  putCall: '期权 Put ÷ Call',
  advDecLine: '标普 500 累计涨跌线',
  equalWeightRel: '等权相对市值加权（近 3 个月）',
}

function reading(key: ReadingKey, value: number, extras: Partial<Reading> = {}): Reading {
  return { key, label: fixtureLabels[key] ?? key, value, unit: '%', date: '2026-11-20', source: '测试夹具', ...extras }
}

function values(entries: Partial<Record<ReadingKey, number>>): Inputs {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, reading(key as ReadingKey, value)]),
  )
}

function policy(from?: number, to = 3.9, date = '2026-09-17'): Reading {
  return reading('policyRate', to, { lastMove: from === undefined ? undefined : { from, to, date } })
}

function withPrior(key: ReadingKey, value: number, prior: number): Reading {
  return reading(key, value, { prior: { value: prior, date: '2026-10-20' } })
}

function run(direction: 'up' | 'down', count: number, total: number, startLevel: number): Reading {
  return {
    ...policy(3.65),
    moveRun: { direction, count, total, startLevel, since: '2026-09-17' },
  }
}

function master(input: Inputs, slug: Master['slug']) {
  return buildCycleView(input).masters.find((take) => take.slug === slug)!
}

const currentReadings: Inputs = {
  ...values({
    spxVs200dma: -5.96, spxDrawdown: -11.62, spxAbove200: 48.7, netNewHighs: -5.21,
  }),
  epsRevision: reading('epsRevision', 3.3, { date: '2026-11-13', frequency: 'daily' }),
  hySpread: { ...withPrior('hySpread', 352, 340), unit: 'bp', date: '2026-11-19' },
  baaAaa: reading('baaAaa', 0.47, {
    unit: 'pp', date: '2026-10-01', frequency: 'monthly', longPercentile: 19, longPercentileSince: 1919,
  }),
  policyRate: { ...run('up', 1, 0.25, 3.65), date: '2026-11-22' },
  nfci: reading('nfci', -0.478, { unit: '', frequency: 'weekly', date: '2026-11-13' }),
  netLiquidity: reading('netLiquidity', 5824.508, {
    unit: '十亿美元', frequency: 'weekly', date: '2026-11-18', direction: 'flat',
    prior: { value: 5801.365, date: '2026-10-21' },
  }),
  sahm: reading('sahm', 0, { unit: 'pp', frequency: 'monthly', date: '2026-10-01' }),
  cape: reading('cape', 36.44, {
    unit: '倍', frequency: 'monthly', date: '2026-11-01', longPercentile: 95.7, longPercentileSince: 1900,
  }),
  fearGreed: reading('fearGreed', 9.67, { unit: '点' }),
  vix: reading('vix', 35.89, { unit: '点' }),
  equalWeightRel: reading('equalWeightRel', 3.51),
  debtService: reading('debtService', 11.1114, {
    date: '2026-04-01', frequency: 'quarterly', percentile: 45,
  }),
}

describe('宏观大师当前位置', () => {
  const dimensionCases: [DimensionId, Lean, Inputs][] = [
    ['trend', 'caution', values({ spxVs200dma: -0.01 })],
    ['trend', 'support', values({ spxVs200dma: 0, spxDrawdown: -4.99 })],
    ['trend', 'neutral', values({ spxVs200dma: 1, spxDrawdown: -5 })],
    ['breadth', 'caution', values({ spxAbove200: 49.99, netNewHighs: -0.01 })],
    ['breadth', 'support', values({ spxAbove200: 60, netNewHighs: 0.01 })],
    ['breadth', 'neutral', values({ spxAbove200: 50, netNewHighs: -1 })],
    ['credit', 'caution', values({ hySpread: 500 })],
    ['credit', 'caution', { hySpread: withPrior('hySpread', 450, 400) }],
    ['credit', 'support', { hySpread: withPrior('hySpread', 450, 475) }],
    ['credit', 'neutral', { hySpread: withPrior('hySpread', 449, 400) }],
    ['policy', 'caution', { policyRate: policy(3.65, 3.9, '2025-11-20') }],
    ['policy', 'support', { policyRate: policy(4.15) }],
    ['policy', 'neutral', { policyRate: policy(3.65, 3.9, '2025-11-19') }],
    ['policy', 'unknown', { policyRate: policy() }],
    ['liquidity', 'caution', { netLiquidity: withPrior('netLiquidity', 98, 100) }],
    ['liquidity', 'caution', values({ nfci: 0.01 })],
    ['liquidity', 'support', { ...values({ nfci: -0.01 }), netLiquidity: currentReadings.netLiquidity }],
    ['liquidity', 'neutral', { ...values({ nfci: -0.01 }), netLiquidity: withPrior('netLiquidity', 99, 100) }],
    ['fundamentals', 'caution', values({ epsRevision: 1, sahm: 0.5 })],
    ['fundamentals', 'caution', values({ epsRevision: -1 })],
    ['fundamentals', 'support', values({ epsRevision: 1, sahm: 0.29 })],
    ['fundamentals', 'neutral', values({ epsRevision: 1, sahm: 0.3 })],
    ['valuation', 'caution', { cape: reading('cape', 25, { longPercentile: 80 }) }],
    ['valuation', 'support', { cape: reading('cape', 25, { longPercentile: 30 }) }],
    ['valuation', 'neutral', { cape: reading('cape', 25, { longPercentile: 31 }) }],
    ['valuation', 'unknown', { cape: reading('cape', 25, { percentile: 95 }) }],
    ['sentiment', 'caution', values({ fearGreed: 75, vix: 14.99 })],
    ['sentiment', 'support', values({ fearGreed: 25, vix: 30 })],
    ['sentiment', 'neutral', values({ fearGreed: 75, vix: 15 })],
  ]

  it.each(dimensionCases)('%s 在对应阈值下为 %s', (id, lean, readings) => {
    expect(buildCycleView(readings).dimensions.find((dimension) => dimension.id === id)?.lean).toBe(lean)
  })

  it('必需读数全缺时八个维度都未知，并保持指定顺序', () => {
    const { dimensions, asOf } = buildCycleView({})
    expect(dimensions.map(({ id }) => id)).toEqual([
      'trend', 'breadth', 'credit', 'policy', 'liquidity', 'fundamentals', 'valuation', 'sentiment',
    ])
    expect(dimensions.every(({ lean }) => lean === 'unknown')).toBe(true)
    expect(asOf).toBe('')
  })

  it('过期与 null 读数进入 skipped，观测日期和证据排除两者', () => {
    const { asOf, dimensions } = buildCycleView({
      ...values({ spxVs200dma: -5.96 }),
      spxDrawdown: reading('spxDrawdown', -3, { stale: true, date: '2026-12-01' }),
      spxAbove200: null,
      sahm: reading('sahm', 0.2, { frequency: 'monthly', unit: '个百分点', date: '2026-11-01' }),
    })
    expect(asOf).toBe('2026-11-20')
    expect(dimensions[0].skipped).toEqual(['spxDrawdown'])
    expect(dimensions[1].skipped).toContain('spxAbove200')
    expect(dimensions[0].evidence).toEqual([{ key: 'spxVs200dma', text: '标普 500 低于 200 日均线 5.96%（11-20）。' }])
    expect(dimensions[5].evidence[0].text).toContain('0.2 个百分点（11 月）')
  })

  it('最新判定日期来自参与规则的读数，单纯辅助的更新日期仍保留在证据中', () => {
    const view = buildCycleView({
      ...values({ spxVs200dma: 1 }),
      spxDrawdown: reading('spxDrawdown', -4, { date: '2026-11-21' }),
      realYield10: reading('realYield10', 2, { date: '2026-11-22' }),
    })
    expect(view.asOf).toBe('2026-11-21')
    expect(view.dimensions[3].evidence[0].text).toContain('（11-22）')
  })

  it('周日的政策利率不改变快照日期；有 lastMove 时证据不带观测日', () => {
    const view = buildCycleView(currentReadings)
    expect(view.asOf).toBe('2026-11-20')
    expect(view.dimensions[3].lean).toBe('caution')
    expect(view.dimensions[3].evidence[0].text).toBe(
      '准备金余额利率 3.9%，最近一次调整在 09-17，由 3.65% 上调到 3.9%。',
    )
    expect(view.dimensions[3].evidence[0].text).not.toContain('11-22')
    expect(buildCycleView({ policyRate: currentReadings.policyRate }).asOf).toBe('')
  })

  it('周频、月频和日频证据统一显示单位与小数精度', () => {
    const { dimensions } = buildCycleView(currentReadings)
    expect(dimensions[2].evidence.map(({ text }) => text)).toEqual([
      '高收益债利差 352 个基点（11-19），一个月前 340 个基点。',
      '穆迪 Baa − Aaa 0.47 个百分点（10 月），处于自 1919 年以来第 19 百分位。',
    ])
    expect(dimensions[4].evidence.map(({ text }) => text)).toEqual([
      '芝加哥联储金融条件指数 −0.478（11-13）。',
      '净流动性约 5.82 万亿美元（11-18），近一月持平。',
    ])
    expect(dimensions[5].evidence[0].text).toBe('标普 500 未来 12 个月盈利预期上修 3.3%（11-13）。')
    expect(dimensions[7].evidence[1].text).toBe('VIX 35.89 点（11-20）。')
    expect(master(currentReadings, 'dalio').items[5].text).toContain('家庭偿债比 11.11%（2026 年二季度）')
  })

  it('负数用数学负号，千位分组，无量纲读数不加点；情绪解释按偏向切换', () => {
    const inputs = {
      epsRevision: reading('epsRevision', -3.3),
      advDecLine: reading('advDecLine', -2302.125, { unit: '' }),
      putCall: reading('putCall', 0.98765, { unit: '' }),
    }
    expect(buildCycleView(inputs).dimensions[5].summary).toContain('盈利预期下修 3.3%')
    expect(buildCycleView(inputs).dimensions[7].summary).toBe(
      '期权 Put ÷ Call 0.988（11-20）。这是逆向线索，只在极端时才有参考价值。',
    )
    expect(master(inputs, 'druckenmiller').items[2].text).toContain('累计涨跌线 −2,302.13（11-20）')
    expect(buildCycleView(values({ fearGreed: 75, vix: 14 })).dimensions[7].summary).toContain(
      '贪婪只说明追涨已经较多，本身不是卖点',
    )
    expect(buildCycleView(values({ fearGreed: 25, vix: 30 })).dimensions[7].summary).toContain(
      '恐慌只说明抛压已经较重，本身不构成买点',
    )
  })

  const rising = values({ spxVs200dma: 1, spxDrawdown: -4, spxAbove200: 60, netNewHighs: 1 })
  const falling = values({ spxVs200dma: -1, spxDrawdown: -6, spxAbove200: 49, netNewHighs: -1 })
  const healthy = values({ epsRevision: 1, sahm: 0.1 })
  const weakening = values({ epsRevision: -1, sahm: 0.1 })
  const postureCases = [
    ['defense', 'medium', { ...falling, ...weakening, policyRate: policy(3.65) }],
    ['defense', 'low', { ...falling, ...weakening }],
    ['defense', 'low', { ...falling, ...healthy, policyRate: policy(3.65) }],
    ['offense', 'medium', { ...rising, ...healthy, policyRate: policy(4.15) }],
    ['offense', 'low', { ...rising, ...healthy }],
    ['neutral', 'low', { ...rising, policyRate: policy(3.65) }],
    ['unknown', 'low', values({ spxVs200dma: -1 })],
    ['unknown', 'low', {}],
  ] as const

  it.each(postureCases)('短线档位 %s 的置信度为 %s', (value, confidence, readings) => {
    expect(buildCycleView(readings).posture).toMatchObject({ value, confidence })
  })

  it('中性且短线缺项不少于两个时改为数据不足，其余缺项在 meaning 末尾标注', () => {
    const insufficient = buildCycleView(values({ spxVs200dma: -1 }))
    expect(insufficient.posture).toMatchObject({
      value: 'unknown',
      label: '数据不足',
      meaning: '趋势以外的短线读数不全（缺：宽度、信用、货币政策），暂不判定短线攻守。',
    })
    const offense = buildCycleView({
      ...values({ spxVs200dma: 1, spxDrawdown: -4 }),
      policyRate: policy(4.15),
    })
    expect(offense.posture.value).toBe('offense')
    expect(offense.posture.meaning).toContain('宽度、信用读数暂缺，未参与判定')
  })

  const phaseCases = [
    ['expansion', { ...rising, ...healthy }],
    ['correction', { ...falling, ...healthy }],
    ['bear', { ...falling, ...healthy, ...values({ hySpread: 500 }) }],
    ['bear', { ...falling, ...weakening }],
    ['repair', { ...rising, ...weakening }],
    ['unknown', { ...rising }],
    ['unknown', { ...healthy, ...values({ hySpread: 500 }) }],
  ] as const

  it.each(phaseCases)('市场趋势与基本面组合可判为 %s', (id, readings) => {
    expect(buildCycleView(readings).phase.id).toBe(id)
  })

  it('进攻档跌破均线后还须有一项短线证据偏谨慎才转防守', () => {
    expect(buildCycleView(rising).flips).toContainEqual(
      expect.stringMatching(/跌破 200 日均线.*中性.*宽度、信用或货币政策.*转为防守/u),
    )
  })

  it('宽度未知时可由降息支持进攻，档位说明不声称宽度向上', () => {
    const view = buildCycleView({
      ...values({ spxVs200dma: 1, spxDrawdown: -4 }),
      policyRate: policy(4.15),
    })
    expect(view.dimensions[1].lean).toBe('unknown')
    expect(view.posture.value).toBe('offense')
    expect(view.posture.meaning).toContain('宽度或货币政策至少一项偏积极')
    expect(view.posture.meaning).toContain('宽度、信用读数暂缺，未参与判定')
  })

  it('信用和货币政策的反证优先，并保留估值与逆向情绪的反证；非短线维度带期限标注', () => {
    const view = buildCycleView({
      ...currentReadings,
      hySpread: withPrior('hySpread', 350, 375),
      policyRate: policy(4.15),
      cape: reading('cape', 15, { longPercentile: 20 }),
    })
    expect(view.posture.value).toBe('defense')
    expect(view.counters).toEqual([2, 3, 6, 7].map((index) => {
      const { name, state, summary, horizon } = view.dimensions[index]
      const tag = horizon === 'medium' ? '（中期）'
        : horizon === 'long' ? '（长期背景）'
          : horizon === 'contrarian' ? '（逆向线索）' : ''
      return `${name}${tag}：${state}。${summary}`
    }))
    expect(view.counters[2]).toMatch(/^估值（长期背景）：/u)
    expect(view.counters[3]).toMatch(/^情绪（逆向线索）：/u)
  })

  it('给定夹具为低置信度防守与修正，保留反面证据和改判条件', () => {
    const view = buildCycleView(currentReadings)
    expect(view.posture).toMatchObject({ value: 'defense', confidence: 'low' })
    expect(view.phase.id).toBe('correction')
    expect(view.masters.map(({ slug }) => slug)).toEqual(MASTERS.map(({ slug }) => slug))
    expect(master(currentReadings, 'tudor-jones').posture).toBe('defense')
    expect(master(currentReadings, 'zweig').items[0].lean).toBe('neutral')
    expect(view.supports[0]).toBe('趋势：跌破 200 日线。标普 500 低于 200 日均线 5.96%，较近 52 周最高收盘回撤 11.62%（11-20）。')
    expect(view.supports[1]).toMatch(/^宽度：多数个股走弱。/u)
    expect(view.counters).toContain(`情绪（逆向线索）：极度恐慌。${view.dimensions[7].summary}`)
    expect(view.phase.summary).toBe('趋势已经转弱（标普 500 低于 200 日均线 5.96%），但基本面还没有转差：盈利预期上修 3.3%，萨姆规则 0，高收益债利差 352 个基点。')
    expect(view.flips).toContainEqual(expect.stringMatching(/重新站上.*5\.96%.*不再是防守/u))
    expect(view.flips).toContainEqual(expect.stringMatching(/改判熊市.*0\.5.*达到或超过 500 个基点（现在 352）/u))
    expect(view.flips).toContain('美联储再加息一次（本轮已加息 1 次、累计 0.25 个百分点）→ 茨威格的优惠利率规则给出卖出。')
  })

  it('基本面缺项但仍可判阶段时不写“没有转差”断言；过期写日期不写暂无', () => {
    const missingCredit = buildCycleView({
      ...values({ spxVs200dma: -1, spxDrawdown: -6 }),
      ...healthy,
    })
    expect(missingCredit.phase.id).toBe('correction')
    expect(missingCredit.phase.summary).toContain('已有的读数里没有看到转差')
    expect(missingCredit.phase.summary).toContain('（缺：高收益债利差）')
    expect(missingCredit.phase.summary).not.toMatch(/基本面还?没有转差/u)

    const staleCredit = buildCycleView({
      ...values({ spxVs200dma: -1, spxDrawdown: -6 }),
      ...healthy,
      hySpread: reading('hySpread', 400, { unit: 'bp', stale: true, date: '2026-10-01', frequency: 'monthly' }),
    })
    expect(staleCredit.phase.summary).toContain('高收益债利差已过期（10 月）')
    expect(staleCredit.phase.summary).not.toContain('暂无可用读数')
    expect(staleCredit.flips.join(' ')).toContain('高收益债利差已过期（10 月）')
    expect(staleCredit.flips.join(' ')).not.toContain('高收益债利差暂无可用读数')
  })

  it('均线贴着与一年以上无调息：证据与大师 lean 同步', () => {
    const flat = buildCycleView({
      spxVs200dma: reading('spxVs200dma', -0.0004),
    })
    expect(flat.dimensions[0].evidence[0].text).toContain('基本贴着 200 日均线')
    expect(flat.dimensions[0].evidence[0].text).not.toContain('低于 0%')

    const oldPolicy = policy(3.65, 3.9, '2024-11-01')
    oldPolicy.date = '2026-11-20'
    const view = buildCycleView({ policyRate: oldPolicy })
    expect(view.dimensions[3]).toMatchObject({ lean: 'neutral', state: '一年以上没有调整' })
    expect(view.dimensions[3].evidence[0].text).toContain('一年以上没有调整')
    expect(master({ policyRate: oldPolicy }, 'tudor-jones').items[2].lean).toBe('neutral')
    expect(master({ policyRate: oldPolicy }, 'druckenmiller').items[0].lean).toBe('neutral')
    expect(master({ policyRate: oldPolicy }, 'dalio').items[0].lean).toBe('neutral')
    expect(master({ policyRate: oldPolicy }, 'kostolany').items[0].text).toContain('一年以上没有调整')
    expect(master({ policyRate: run('up', 1, 0.25, 3.65) }, 'zweig').items[0].lean).toBe('neutral')
  })
})

describe('大师对照', () => {
  it.each([
    [-0.01, 'defense'], [0, 'neutral'], [null, 'unknown'],
  ] as const)('都铎在距离均线 %s 时为 %s', (distance, posture) => {
    expect(master({ spxVs200dma: distance === null ? null : reading('spxVs200dma', distance) }, 'tudor-jones').posture).toBe(posture)
  })

  const primeCases = [
    ['低区首次加息幅度不足', run('up', 1, 0.25, 3.65), 'neutral'],
    ['低区第二次加息', run('up', 2, 0.5, 3.65), 'caution'],
    ['低区首次加息满一点', run('up', 1, 1, 3.65), 'caution'],
    ['高区首次加息', run('up', 1, 0.25, 4.9), 'caution'],
    ['低区首次降息', run('down', 1, -0.25, 3.65), 'support'],
    ['高区首次降息幅度不足', run('down', 1, -0.25, 4.9), 'neutral'],
    ['高区第二次降息', run('down', 2, -0.5, 4.9), 'support'],
    ['高区首次降息满一点', run('down', 1, -1, 4.9), 'support'],
    ['缺连续调整记录', policy(3.65), 'unknown'],
    ['政策读数过期', { ...run('up', 1, 0.25, 3.65), stale: true }, 'unknown'],
  ] as const

  it.each(primeCases)('茨威格优惠利率规则在%s时为 %s', (_, policyRate, lean) => {
    expect(master({ policyRate }, 'zweig').items[0].lean).toBe(lean)
  })

  it.each(primeCases)('茨威格改判条件在%s时按条件显示', (scenario, policyRate) => {
    const hasFlip = buildCycleView({ policyRate }).flips.some((text) => text.includes('茨威格'))
    expect(hasFlip).toBe(scenario === '低区首次加息幅度不足')
  })

  const full: Inputs = {
    ...values({
      spxVs200dma: -1, spxDrawdown: -6, spxAbove200: 49, netNewHighs: -1,
      curve10y2y: -0.1, nfci: -0.4, marginDebtYoy: 20, equalWeightRel: -3.01,
      growthValueRel: -5.01, cyclicalDefensive: -0.01, smallCapRel: -1,
      fearGreed: 75, vix: 30, putCall: 1, retailBullBear: -8,
    }),
    policyRate: run('up', 2, 0.5, 3.65),
    hySpread: reading('hySpread', 349, { direction: 'up' }),
    advDecLine: reading('advDecLine', -1, { direction: 'down' }),
    copper: reading('copper', 5, { direction: 'down' }),
    netLiquidity: reading('netLiquidity', 5824.5, { direction: 'down' }),
    cape: reading('cape', 30, { longPercentile: 90 }),
    debtService: reading('debtService', 10, { percentile: 80 }),
  }
  const masterCases: [Master['slug'], Lean[]][] = [
    ['zweig', ['caution', 'caution', 'unknown', 'caution']],
    ['druckenmiller', ['caution', 'caution', 'caution', 'caution', 'caution', 'caution']],
    ['dalio', ['caution', 'caution', 'caution', 'caution', 'caution', 'caution']],
    ['marks', ['caution', 'caution', 'caution', 'caution', 'support']],
    ['grantham', ['caution', 'caution', 'caution', 'caution']],
    ['soros', ['neutral', 'neutral', 'neutral']],
    ['templeton', ['neutral', 'neutral']],
    ['kostolany', ['neutral', 'neutral']],
  ]

  it.each(masterCases)('%s 的各项判断随可用证据变化', (slug, leans) => {
    const take = master(full, slug)
    expect(take.items.map(({ lean }) => lean)).toEqual(leans)
    expect(take.posture).toBeUndefined()
    expect(master({}, slug).items.map(({ lean }) => lean)).toEqual(leans.map(() => 'unknown'))
  })

  it('过期的条目显示观测月份，辅助读数不能代替用于判断的主读数', () => {
    const take = master({
      ...values({ putCall: 1.5 }),
      vix: reading('vix', 30, { stale: true, frequency: 'monthly', date: '2026-10-01' }),
    }, 'marks')
    expect(take.items[4]).toMatchObject({ lean: 'unknown', text: '读数已过期（10 月）。' })
  })

  it.each([
    [-3.01, 'caution', '少数大市值股票在领涨，市场在变窄。'],
    [-3, 'neutral', '等权相对市值加权'],
    [3, 'neutral', '等权相对市值加权'],
    [3.01, 'neutral', '等权跑赢市值加权 3.01%，上涨没有集中在少数大市值股票'],
  ] as const)('等权相对表现 %s 时格兰瑟姆的宽度为 %s', (value, lean, text) => {
    const take = master(values({ equalWeightRel: value }), 'grantham')
    expect(take.items[1].lean).toBe(lean)
    expect(take.items[1].text).toContain(text)
  })

  it.each([
    [349, 50, false, false, 'caution'],
    [350, 20, false, false, 'caution'],
    [600, 80, false, false, 'support'],
    [601, 50, false, false, 'support'],
    [349, 80, false, false, 'neutral'],
    [601, 20, false, false, 'neutral'],
    [350, 21, false, false, 'neutral'],
    [600, 79, false, false, 'neutral'],
    [349, 80, true, false, 'support'],
    [349, 80, false, true, 'caution'],
    [null, 20, false, false, 'caution'],
    [601, null, false, false, 'support'],
    [null, null, false, false, 'unknown'],
  ] as const)('马克斯信用利差：高收益债 %s、穆迪分位 %s、过期 %s/%s → %s', (hy, baa, hyStale, baaStale, lean) => {
    const take = master({
      hySpread: hy === null ? null : reading('hySpread', hy, { unit: 'bp', stale: hyStale }),
      baaAaa: baa === null ? null : reading('baaAaa', 0.47, { longPercentile: baa, stale: baaStale }),
    }, 'marks')
    expect(take.items[0]).toMatchObject({ lean, keys: ['hySpread', 'baaAaa'] })
    if (hyStale) expect(take.items[0].text).not.toContain('349')
    if (baaStale) expect(take.items[0].text).not.toContain('0.47')
  })

  it('大师文案列出有效计数，读数和说明以完整句呈现', () => {
    const view = buildCycleView(currentReadings)
    const credit = master(currentReadings, 'marks').items[0].text
    expect(credit).toContain('高收益债利差 352 个基点')
    expect(credit).toContain('自 1919 年以来第 19 百分位')
    expect(master({}, 'marks').headline).toContain('缺数据 5 项')
    expect(master({}, 'druckenmiller').headline).toMatch(/^6 项里 6 项缺数据；/u)
    expect(master(currentReadings, 'zweig').items[0].text).toContain('本轮从 2026-09-17 开始加息 1 次、累计 0.25 个百分点。推算的优惠利率起点约 6.75%')
    expect(master(currentReadings, 'tudor-jones').items[2].text).toContain('上调到 3.9%。他说衰退期间')
    expect(view.masters.flatMap(({ items }) => items).every(({ text }) => /。(?:）)?$/u.test(text))).toBe(true)
  })
})
