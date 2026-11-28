import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildHeadline, buildInstruction, buildOfficial, buildSteps, heatFromRadarCurrent,
  lastUsTradingDayOfMonth, nextReviewDate,
} from './lib/combined-strategy/current.mjs'
import {
  buildFusionVerdict, fusionTier, passAdoptGate, passTrainGate, pickAdopted,
} from './lib/combined-strategy/fusion.mjs'
import { classifyHeat, heatScoreFromScores } from './lib/combined-strategy/heat.mjs'
import {
  buildEvidence, buildMatrix, CELL_ACTIONS, CELL_MEANINGS, CELL_NAMES, forward12,
  MATRIX_ORDER, macroSide,
} from './lib/combined-strategy/matrix.mjs'
import { buildRationale, RATIONALE_THEORY } from './lib/combined-strategy/rationale.mjs'
import {
  allocateMonthlyToWeeks, alignWeekly, monthEndNavDiff, weekEndsFromDaily, weekMonday,
  weeklyPerformance,
} from './lib/combined-strategy/weekly.mjs'

test('热度分档含边界：≤−0.5 偏热，≥+0.5 偏冷，缺值为 null', () => {
  assert.equal(classifyHeat(-0.5), 'hot')
  assert.equal(classifyHeat(-0.51), 'hot')
  assert.equal(classifyHeat(-0.49), 'mid')
  assert.equal(classifyHeat(0), 'mid')
  assert.equal(classifyHeat(0.5), 'cold')
  assert.equal(classifyHeat(0.51), 'cold')
  assert.equal(classifyHeat(0.49), 'mid')
  assert.equal(classifyHeat(null), null)
  assert.equal(heatScoreFromScores(-1, null), -1)
  assert.equal(heatScoreFromScores(null, 0.5), 0.5)
  assert.equal(heatScoreFromScores(null, null), null)
  assert.equal(heatScoreFromScores(-1, 1), 0)
})

test('m1–m6 档位变换：封顶、封底、below 为 null', () => {
  const base = { masters: 'offense', radar: 'neutral', heat: 'mid', below: false }
  assert.equal(fusionTier('macro', base), 'offense')
  assert.equal(fusionTier('radar', base), 'neutral')
  // m1 不走 fusionTier
  assert.equal(fusionTier('m1', base), null)

  // m2：偏热时最高到偏进攻
  assert.equal(fusionTier('m2', { ...base, heat: 'hot' }), 'lean-offense')
  assert.equal(fusionTier('m2', { ...base, masters: 'defense', heat: 'hot' }), 'defense')
  assert.equal(fusionTier('m2', { ...base, heat: 'mid' }), 'offense')

  // m3：偏热且破位再降；below null 不降
  assert.equal(fusionTier('m3', { ...base, heat: 'hot', below: true }), 'lean-offense')
  assert.equal(fusionTier('m3', { ...base, masters: 'defense', heat: 'hot', below: true }), 'defense')
  assert.equal(fusionTier('m3', { ...base, heat: 'hot', below: null }), 'offense')
  assert.equal(fusionTier('m3', { ...base, heat: 'hot', below: false }), 'offense')

  // m4：偏冷且未破位（below !== true）上调；below null 也上调；已在进攻则封顶
  assert.equal(fusionTier('m4', { ...base, masters: 'neutral', heat: 'cold', below: false }), 'lean-offense')
  assert.equal(fusionTier('m4', { ...base, masters: 'neutral', heat: 'cold', below: null }), 'lean-offense')
  assert.equal(fusionTier('m4', { ...base, masters: 'neutral', heat: 'cold', below: true }), 'neutral')
  assert.equal(fusionTier('m4', { ...base, masters: 'offense', heat: 'cold', below: false }), 'offense')

  // m5：hot 封顶再视 below；cold 未破位升档
  assert.equal(fusionTier('m5', { ...base, heat: 'hot', below: false }), 'lean-offense')
  assert.equal(fusionTier('m5', { ...base, heat: 'hot', below: true }), 'neutral')
  assert.equal(fusionTier('m5', { ...base, masters: 'defense', heat: 'hot', below: true }), 'defense')
  assert.equal(fusionTier('m5', { ...base, masters: 'neutral', heat: 'cold', below: false }), 'lean-offense')
  assert.equal(fusionTier('m5', { ...base, masters: 'neutral', heat: 'cold', below: true }), 'neutral')

  // m6：雷达偏防守/防守再降一档
  assert.equal(fusionTier('m6', { ...base, radar: 'lean-defense' }), 'lean-offense')
  assert.equal(fusionTier('m6', { ...base, radar: 'defense', masters: 'defense' }), 'defense')
  assert.equal(fusionTier('m6', { ...base, radar: 'neutral' }), 'offense')
})

test('passTrain / adopted 两个分支', () => {
  const metrics = (sharpe, maxDd, cagr = 0.1) => ({
    cagr, maxDd, sharpe, avgEquity: 0.7, switchesPerYear: 1,
  })
  const row = (id, train, test, full) => ({
    id, label: id, rule: '', train, test, full, passTrain: null,
  })
  const macro = row('macro', metrics(0.6, -0.2, 0.1), metrics(0.7, -0.18, 0.09), metrics(0.65, -0.2, 0.1))

  assert.equal(passTrainGate(metrics(0.61, -0.2), macro.train), true)
  assert.equal(passTrainGate(metrics(0.609, -0.2), macro.train), false)
  assert.equal(passTrainGate(metrics(0.62, -0.211), macro.train), false)
  assert.equal(passTrainGate(metrics(0.62, -0.21), macro.train), true)

  const failTrain = [
    macro,
    row('radar', metrics(0.5, -0.3), metrics(0.6, -0.25), metrics(0.55, -0.3)),
    row('m1', metrics(0.605, -0.2), metrics(0.75, -0.17), metrics(0.66, -0.2, 0.101)),
  ]
  assert.equal(pickAdopted(failTrain), null)

  const passButFailAdopt = [
    macro,
    row('m2', metrics(0.62, -0.2), metrics(0.71, -0.18), metrics(0.66, -0.2, 0.099)), // 验证夏普 +0.01 < 0.02
  ]
  assert.equal(pickAdopted(passButFailAdopt), null)

  const adopt = [
    macro,
    row('m3', metrics(0.61, -0.19), metrics(0.73, -0.17), metrics(0.67, -0.19, 0.101)),
    row('m4', metrics(0.63, -0.2), metrics(0.74, -0.17), metrics(0.68, -0.2, 0.102)),
  ]
  assert.equal(pickAdopted(adopt), 'm4') // 训练期夏普更高
  assert.equal(passAdoptGate(adopt[2], macro), true)

  const verdictNone = buildFusionVerdict(failTrain, null)
  assert.match(verdictNone, /没有一个达到采用门槛/)
  assert.match(verdictNone, /只按宏观攻守的档位定/)

  const verdictAdopt = buildFusionVerdict(
    adopt.map(r => ({ ...r, label: r.id === 'm4' ? 'M4 偏冷加码' : r.label })),
    'm4',
  )
  assert.match(verdictAdopt, /采用了「M4 偏冷加码」/)
  assert.match(verdictAdopt, /验证期夏普相对单用宏观攻守提高/)
})

test('矩阵统计：不足 12 个月不计入、maxDd 从 1 起算、since2000 切分', () => {
  assert.equal(macroSide('offense'), 'offense')
  assert.equal(macroSide('lean-offense'), 'offense')
  assert.equal(macroSide('neutral'), 'neutral')
  assert.equal(macroSide('lean-defense'), 'defense')
  assert.equal(macroSide(null), null)

  const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`
  const returns = new Map()
  const seq = []
  // 1999-01 信号 → 收益月 1999-03 … 2000-02
  for (let i = 0; i < 12; i++) {
    const abs = 1999 * 12 + 2 + i // 1999-03 起
    const y = Math.floor(abs / 12)
    const m = abs % 12 + 1
    const spx = i < 6 ? 0.02 : -0.03
    returns.set(monthKey(y, m), { spx, cash: 0.001 })
    seq.push(spx)
  }
  const full = forward12(returns, '1999-01')
  assert.ok(full)
  let w = 1, pk = 1, worst = 0
  for (const r of seq) {
    w *= 1 + r
    pk = Math.max(pk, w)
    worst = Math.min(worst, w / pk - 1)
  }
  assert.ok(Math.abs(full.maxDd12 - worst) < 1e-12)
  assert.ok(Math.abs(full.fwd12 - (w - 1)) < 1e-12)
  assert.equal(forward12(new Map([...returns].slice(0, 11)), '1999-01'), null)

  // 铺满 1999–2002，保证 2000-01 / 2000-02 信号也能凑齐 12 个月
  for (let y = 1999; y <= 2002; y++) {
    for (let m = 1; m <= 12; m++) {
      const d = monthKey(y, m)
      if (!returns.has(d)) returns.set(d, { spx: 0.01, cash: 0.001 })
    }
  }

  const signals = [
    { d: '1999-01', masters: 'defense', heat: 'hot', radar: 'neutral', below: true, spx: 1 },
    { d: '2000-01', masters: 'defense', heat: 'hot', radar: 'neutral', below: true, spx: 1 },
    { d: '2000-02', masters: 'offense', heat: 'mid', radar: 'neutral', below: false, spx: 1 },
    { d: '2001-01', masters: null, heat: 'hot', radar: 'neutral', below: true, spx: 1 },
  ]
  const matrix = buildMatrix(signals, returns)
  const defenseHot = matrix.find(c => c.macroSide === 'defense' && c.heat === 'hot')
  assert.equal(defenseHot.all.months, 2)
  assert.equal(defenseHot.since2000.months, 1)
  assert.equal(defenseHot.thin, true)
  assert.equal(defenseHot.action, CELL_ACTIONS['defense|hot'])

  const offenseMid = matrix.find(c => c.macroSide === 'offense' && c.heat === 'mid')
  assert.equal(offenseMid.all.months, 1)
  assert.equal(offenseMid.since2000.months, 1)
})

test('evidence 与 headline 文字：thin、since2000 空、没出现过、缺一侧', () => {
  assert.equal(
    buildEvidence({ months: 0, fwd12: null, neg12: null, maxDd12: null }, { months: 0, fwd12: null, neg12: null, maxDd12: null }),
    '这一格历史上没有出现过。',
  )
  const thin = buildEvidence(
    { months: 3, fwd12: 0.009, neg12: 0, maxDd12: -0.041 },
    { months: 0, fwd12: null, neg12: null, maxDd12: null },
  )
  assert.equal(thin, '这一格历史上有 3 个月，之后 12 个月标普平均 0.9%，0% 的时候为负，期间平均最大回撤 −4.1%。样本少，仅供参考。')

  const full = buildEvidence(
    { months: 122, fwd12: 0.135, neg12: 0.1475, maxDd12: -0.075 },
    { months: 72, fwd12: 0.071, neg12: 0.22, maxDd12: -0.089 },
  )
  assert.match(full, /122 个月/)
  assert.match(full, /13\.5%/)
  assert.match(full, /15% 的时候为负/)
  assert.match(full, /−7\.5%/)
  assert.match(full, /2000 年以后 72 个月，平均 7\.1%。$/)
  assert.equal(full.includes('样本少'), false)

  assert.equal(
    buildHeadline({ macroTier: null, equityShare: 0.85, heat: 'hot', cell: null }),
    '宏观攻守或雷达读数暂缺，暂不给出综合结论。',
  )
  assert.equal(
    buildHeadline({ macroTier: 'lean-offense', equityShare: 0.85, heat: null, cell: null }),
    '宏观攻守或雷达读数暂缺，暂不给出综合结论。',
  )
  const cell = { action: CELL_ACTIONS['offense|hot'] }
  assert.equal(
    buildHeadline({ macroTier: 'lean-offense', equityShare: 0.85, heat: 'hot', cell }),
    `宏观偏进攻、市场偏热：股票仓位按自设上限的 85%。${CELL_ACTIONS['offense|hot']}`,
  )

  const fromRadar = heatFromRadarCurrent({
    dimensions: [
      { id: 'valuation', score: -0.5 },
      { id: 'crowding', score: -0.6666666666666666 },
    ],
  })
  assert.ok(Math.abs(fromRadar.heatScore - (-0.5 - 0.6666666666666666) / 2) < 1e-12)
  assert.equal(fromRadar.heat, 'hot')
})

test('九格名字与含义齐全，与设计第 9 节一致', () => {
  assert.equal(MATRIX_ORDER.length, 9)
  for (const [side, heat] of MATRIX_ORDER) {
    const key = `${side}|${heat}`
    assert.ok(CELL_NAMES[key], key)
    assert.ok(CELL_MEANINGS[key], key)
  }
  assert.equal(CELL_NAMES['offense|hot'], '扩张后段')
  assert.equal(CELL_MEANINGS['defense|hot'], '经济或信用转差，市场却还贵。历史上之后回报最差。')
  assert.equal(CELL_NAMES['defense|cold'], '衰退底部区')

  const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`
  const returns = new Map()
  for (let y = 1999; y <= 2002; y++) {
    for (let m = 1; m <= 12; m++) returns.set(monthKey(y, m), { spx: 0.01, cash: 0.001 })
  }
  const matrix = buildMatrix([
    { d: '2000-01', masters: 'offense', heat: 'hot', radar: 'neutral', below: false, spx: 1 },
  ], returns)
  assert.equal(matrix.find(c => c.macroSide === 'offense' && c.heat === 'hot').name, '扩张后段')
  assert.equal(matrix.every(c => c.name && c.meaning), true)
})

test('instruction / steps：持平、换档、预估分歧、缺失', () => {
  const officialSame = { month: '2026-10', tier: 'lean-offense', previousTier: 'lean-offense' }
  assert.equal(
    buildInstruction({ macroTier: 'lean-offense', official: officialSame }),
    '股票仓位保持在你上限的 85%，本月不用调。',
  )
  const stepsSame = buildSteps({
    macroTier: 'lean-offense', official: officialSame,
    cell: { action: CELL_ACTIONS['offense|hot'] }, nextReview: '2026-11-30',
  })
  assert.equal(stepsSame.map(s => s.title).join(','), '仓位,做法,下次定档')
  assert.equal(stepsSame[0].text, '10 月底定档为偏进攻，对应上限的 85%，和上月相同，不用调仓。')
  assert.equal(stepsSame[1].text, CELL_ACTIONS['offense|hot'])
  assert.equal(stepsSame[2].text, '11 月 30 日收盘后（本月最后一个交易日）。档位如有变化，在下个月内调整到位；没变就不用动。')

  const officialChanged = { month: '2026-10', tier: 'lean-offense', previousTier: 'neutral' }
  assert.equal(
    buildInstruction({ macroTier: 'lean-offense', official: officialChanged }),
    '股票仓位调到你上限的 85%（上月是 70%），本月内完成。',
  )
  assert.equal(
    buildSteps({
      macroTier: 'lean-offense', official: officialChanged, cell: null, nextReview: null,
    })[0].text,
    '10 月底档位由中性变为偏进攻，本月内把股票仓位从上限的 70% 调到 85%。',
  )
  assert.match(
    buildSteps({
      macroTier: 'lean-offense', official: officialChanged, cell: null, nextReview: null,
    })[2].text,
    /^每月最后一个交易日收盘后/,
  )
  assert.equal(
    buildSteps({
      macroTier: 'lean-offense', official: officialChanged, cell: null, nextReview: null,
    })[1].text,
    '雷达读数暂缺，先只按仓位执行。',
  )

  const officialOld = { month: '2026-10', tier: 'lean-offense', previousTier: 'lean-offense' }
  assert.equal(
    buildInstruction({ macroTier: 'offense', official: officialOld }),
    '股票仓位先保持在你上限的 85%；按目前数据，月底可能变为 100%，等月底定档再调。',
  )
  assert.equal(
    buildSteps({
      macroTier: 'offense', official: officialOld, cell: { action: 'x' }, nextReview: '2026-11-30',
    })[0].text,
    '10 月底定档为偏进攻（上限的 85%）。按目前数据月底可能变为进攻，先不动。',
  )

  assert.equal(
    buildInstruction({ macroTier: null, official: officialSame }),
    '宏观攻守读数暂缺，暂不给出仓位。',
  )
})

test('nextReview：月中、月末当天、已过；official 取时间线最后一月', () => {
  // 2026-11-30 是周一且非休市
  assert.equal(lastUsTradingDayOfMonth('2026-11-15'), '2026-11-30')
  assert.equal(nextReviewDate('2026-11-15'), '2026-11-30') // 月中
  assert.equal(nextReviewDate('2026-11-30'), '2026-11-30') // 月末当天
  assert.equal(nextReviewDate('2026-12-01'), '2026-12-31') // 已过 → 下月
  assert.equal(nextReviewDate(null), null)
  assert.equal(nextReviewDate('bad'), null)

  const timeline = [
    { d: '2026-09', final: 'neutral' },
    { d: '2026-10', final: 'lean-offense' },
  ]
  assert.deepEqual(buildOfficial(timeline), {
    month: '2026-10', tier: 'lean-offense', previousTier: 'neutral',
  })
  assert.equal(buildOfficial([]), null)
})

test('rationale 四条：道理原文 + 证据数字；fwd12≤0 去掉「仍涨」', () => {
  assert.equal(RATIONALE_THEORY[0].title, '仓位跟着宏观周期走')
  assert.equal(RATIONALE_THEORY[1].title, '贵不是减仓的理由')
  assert.equal(RATIONALE_THEORY[2].title, '贵加上宏观转差才危险')
  assert.equal(RATIONALE_THEORY[3].title, '按月操作，不追日线')

  const metrics = (sharpe, maxDd, cagr, switchesPerYear = 3.9) => ({
    cagr, maxDd, sharpe, avgEquity: 0.7, switchesPerYear,
  })
  const row = (id, trainSharpe) => ({
    id, label: id, rule: '',
    train: metrics(trainSharpe, -0.2, 0.1),
    test: metrics(trainSharpe, -0.2, 0.1),
    full: metrics(0.715, -0.2, 0.1018, 3.913),
    passTrain: null,
  })
  const fusion = {
    rows: [
      row('macro', 0.82),
      row('radar', 0.6),
      row('m1', 0.81),
      row('m2', 0.815),
      row('m3', 0.808),
      row('m4', 0.819),
      row('m5', 0.812),
      row('m6', 0.805),
    ],
  }
  const cell = (side, heat, all, since2000) => ({
    macroSide: side, heat, all, since2000,
    name: CELL_NAMES[`${side}|${heat}`],
    meaning: CELL_MEANINGS[`${side}|${heat}`],
    action: CELL_ACTIONS[`${side}|${heat}`],
    evidence: '', thin: all.months < 30,
  })
  const matrix = MATRIX_ORDER.map(([side, heat]) => {
    if (side === 'offense' && heat === 'hot') {
      return cell(side, heat, { months: 122, fwd12: 0.135, neg12: 0.15, maxDd12: -0.075 },
        { months: 72, fwd12: 0.071, neg12: 0.22, maxDd12: -0.089 })
    }
    if (side === 'defense' && heat === 'hot') {
      return cell(side, heat, { months: 23, fwd12: -0.035, neg12: 0.57, maxDd12: -0.158 },
        { months: 17, fwd12: -0.102, neg12: 0.76, maxDd12: -0.201 })
    }
    return cell(side, heat, { months: 0, fwd12: null, neg12: null, maxDd12: null },
      { months: 0, fwd12: null, neg12: null, maxDd12: null })
  })

  const rationale = buildRationale({
    matrix, fusion,
    buyholdFull: { cagr: 0.1109, maxDd: -0.49, sharpe: 0.55, avgEquity: 1, switchesPerYear: 0 },
  })
  assert.equal(rationale.length, 4)
  assert.equal(rationale[0].title, '仓位跟着宏观周期走')
  assert.match(rationale[0].evidence, /最大回撤 −20\.0%/)
  assert.match(rationale[0].evidence, /全程持有标普是 −49\.0%/)
  assert.match(rationale[0].evidence, /年化收益 10\.2% 对 11\.1%/)
  assert.match(rationale[1].evidence, /平均仍涨 13\.5%/)
  assert.match(rationale[1].evidence, /没有一种更好/)
  assert.match(rationale[2].evidence, /23 个月/)
  assert.match(rationale[2].evidence, /平均 −3\.5%/)
  assert.match(rationale[2].evidence, /57% 的时候为负/)
  assert.match(rationale[2].evidence, /2000 年以后 17 个月，平均 −10\.2%/)
  assert.match(rationale[3].evidence, /平均每年换档 3\.9 次/)
  assert.match(rationale[3].evidence, /每天按档位调仓/)
  assert.match(rationale[3].evidence, /扣成本后夏普 0\.586 → 0\.571/)
  assert.match(rationale[3].evidence, /只来自 2020 年一次/)
  assert.match(RATIONALE_THEORY[3].theory, /按日执行/)

  // fwd12 ≤ 0：去掉「仍涨」
  const negMatrix = matrix.map(c => (
    c.macroSide === 'offense' && c.heat === 'hot'
      ? { ...c, all: { ...c.all, fwd12: -0.02 } }
      : c
  ))
  const neg = buildRationale({
    matrix: negMatrix, fusion,
    buyholdFull: { cagr: 0.11, maxDd: -0.49, sharpe: 0.55, avgEquity: 1, switchesPerYear: 0 },
  })
  assert.match(neg[1].evidence, /平均 −2\.0%/)
  assert.equal(neg[1].evidence.includes('仍涨'), false)

  // since2000 空：第 3 条省略后半句
  const no2000 = matrix.map(c => (
    c.macroSide === 'defense' && c.heat === 'hot'
      ? { ...c, since2000: { months: 0, fwd12: null, neg12: null, maxDd12: null } }
      : c
  ))
  const e3 = buildRationale({
    matrix: no2000, fusion,
    buyholdFull: { cagr: 0.11, maxDd: -0.49, sharpe: 0.55, avgEquity: 1, switchesPerYear: 0 },
  })[2].evidence
  assert.equal(e3.includes('2000 年以后'), false)
  assert.match(e3, /23 个月/)
})

test('weekMonday：周一至周日自然周', () => {
  assert.equal(weekMonday('2020-03-02'), '2020-03-02') // 周一
  assert.equal(weekMonday('2020-03-06'), '2020-03-02') // 周五
  assert.equal(weekMonday('2020-03-08'), '2020-03-02') // 周日
  assert.equal(weekMonday('2020-03-09'), '2020-03-09')
})

test('weekEndsFromDaily：短周、跨月周、首尾不完整周', () => {
  // 感恩节短周：2020-11-23 周一 … 26 周四交易，27 周五休市 → 周末日 11-25（实际日历；这里用人造数据）
  const daily = [
    ['2020-11-16', 100], // 周一
    ['2020-11-17', 101],
    ['2020-11-18', 102],
    ['2020-11-19', 103],
    ['2020-11-20', 104], // 周五，完整周
    ['2020-11-23', 105], // 周一
    ['2020-11-24', 106],
    ['2020-11-25', 107], // 周三，短周最后交易日
    // 跨月周：11-30 周一 … 12-04 周五
    ['2020-11-30', 108],
    ['2020-12-01', 109],
    ['2020-12-02', 110],
    ['2020-12-03', 111],
    ['2020-12-04', 112],
  ]
  const weeks = weekEndsFromDaily(daily)
  assert.deepEqual(weeks.map(w => [w.date, w.tradingDays, w.month]), [
    ['2020-11-20', 5, '2020-11'],
    ['2020-11-25', 3, '2020-11'], // 短周
    ['2020-12-04', 5, '2020-12'], // 跨月周归到周末日所在月
  ])

  // 首周不完整：从周三开始 → 仍有周末日，但无更早收盘时 allocate 会丢掉第一周收益
  const midStart = weekEndsFromDaily([
    ['2020-11-18', 100],
    ['2020-11-19', 101],
    ['2020-11-20', 102],
    ['2020-11-23', 103],
    ['2020-11-24', 104],
    ['2020-11-25', 105],
  ])
  assert.equal(midStart[0].date, '2020-11-20')
  assert.equal(midStart[0].tradingDays, 3)
})

test('allocateMonthlyToWeeks + alignWeekly：月末净值与月度口径误差 < 1e-9', () => {
  // 人造三周：两周在 2020-03，一周跨到边界已在 03
  const weekEnds = [
    { date: '2020-02-28', close: 100, month: '2020-02' },
    { date: '2020-03-06', close: 90, month: '2020-03' },
    { date: '2020-03-13', close: 80, month: '2020-03' },
    { date: '2020-03-20', close: 70, month: '2020-03' },
    { date: '2020-03-27', close: 85, month: '2020-03' },
  ]
  const monthly = new Map([
    ['2020-03', { spx: -0.12, cash: 0.001 }],
  ])
  const weekly = allocateMonthlyToWeeks(weekEnds, monthly)
  const dates = [...weekly.keys()].sort()
  assert.equal(dates.length, 4)
  let compound = 1
  for (const d of dates) compound *= 1 + weekly.get(d).spx
  assert.ok(Math.abs(compound - (1 - 0.12)) < 1e-12)
  let cashC = 1
  for (const d of dates) cashC *= 1 + weekly.get(d).cash
  assert.ok(Math.abs(cashC - 1.001) < 1e-12)

  const signals = [{ d: '2020-01', masters: 'offense', radar: 'offense', heat: 'mid', below: false }]
  // EXECUTION_LAG=2 → 持仓月 2020-03；offense equity=1
  const rows = alignWeekly(signals, weekly, () => 0.7, '2020-03')
  assert.equal(rows.length, 4)
  assert.ok(rows.every(r => r.equity === 0.7 && r.month === '2020-03'))

  const monthlyAligned = [{
    d: '2020-03',
    equity: 0.7,
    cash: 0.001,
    portfolio: 0.7 * -0.12 + 0.3 * 0.001,
  }]
  const check = monthEndNavDiff(rows, monthlyAligned)
  assert.ok(check.maxAbsDiff < 1e-9, `maxAbsDiff=${check.maxAbsDiff}`)

  // 月内不调仓：财富 = 0.7*∏(1+spx) + 0.3*∏(1+cash)
  let eq = 0.7
  let cash = 0.3
  for (const d of dates) {
    eq *= 1 + weekly.get(d).spx
    cash *= 1 + weekly.get(d).cash
  }
  assert.ok(Math.abs(eq + cash - (1 + monthlyAligned[0].portfolio)) < 1e-12)
})

test('weeklyPerformance：年化波动用 √52，最差一周/一月', () => {
  const rows = [
    { portfolio: 0.01, cash: 0.001, equity: 1, month: '2020-01' },
    { portfolio: -0.05, cash: 0.001, equity: 1, month: '2020-01' },
    { portfolio: 0.02, cash: 0.001, equity: 1, month: '2020-02' },
    { portfolio: -0.02, cash: 0.001, equity: 0.7, month: '2020-02' },
  ]
  const m = weeklyPerformance(rows)
  assert.equal(m.weeks, 4)
  assert.equal(m.worstWeek, -0.05)
  assert.ok(m.worstMonth < 0)
  assert.ok(m.vol > 0)
  assert.ok(m.maxDd < 0)
  assert.ok(m.switchesPerYear > 0)
})
