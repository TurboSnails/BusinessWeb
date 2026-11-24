import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildHeadline, heatFromRadarCurrent } from './lib/combined-strategy/current.mjs'
import {
  buildFusionVerdict, fusionTier, passAdoptGate, passTrainGate, pickAdopted,
} from './lib/combined-strategy/fusion.mjs'
import { classifyHeat, heatScoreFromScores } from './lib/combined-strategy/heat.mjs'
import {
  buildEvidence, buildMatrix, CELL_ACTIONS, forward12, macroSide,
} from './lib/combined-strategy/matrix.mjs'

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
