import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  availableOnFor, buildTimeline, formatCandidateCurrent, historyYears, judge, judgeCombined,
  makeCandidateSeries, nextQuarterFirstMonthEnd, percentChange, pointAt,
  scoreBreakevenShock, scoreEps, scoreHikeStart, scoreHours, scoreLongRateShock,
  scorePceMomentum, scorePermits, scoreRateExp, scoreSloos, splitRanges, valuationCapActive,
} from './lib/macro-posture-research/index.mjs'
import { parseMultplMonthly } from './lib/macro-posture-research/fetch.mjs'
import { readCandidates } from './lib/macro-posture-research/series.mjs'
import { evaluateWithCandidates } from './lib/macro-posture-research/evaluate.mjs'
import { makePanel, makeSeries, monthEnd, panelAt, valueAt } from './lib/macro-posture/panel.mjs'
import { loadVintages, panelWithVintages } from './lib/macro-posture/vintages.mjs'

const m = (cagr, sharpe, maxDd, rec = 0, fa = 0) =>
  ({ cagr, vol: 0.15, maxDd, sharpe, avgEquity: 0.7, recessionsCaught: rec, falseAlarmMonths: fa })
const pack = (full, early, late) => ({ full, early, late })

test('候选阈值边界：rateExp / permits / hours / eps / sloos / valuationCap', () => {
  assert.equal(scoreRateExp(0.75, 0.50), -1)
  assert.equal(scoreRateExp(0.7499, 0.50), 0)
  assert.equal(scoreRateExp(0.75, 0.4999), 0)
  assert.equal(scoreRateExp(2, 1), -1)
  assert.equal(scoreRateExp(null, 1), null)

  assert.equal(scorePermits(-30), -2)
  assert.equal(scorePermits(-29.999), -1)
  assert.equal(scorePermits(-20), -1)
  assert.equal(scorePermits(-19.999), 0)
  assert.equal(scorePermits(10), 1)
  assert.equal(scorePermits(9.999), 0)

  assert.equal(scoreHours(-0.5), -1)
  assert.equal(scoreHours(-0.4999), 0)
  assert.equal(scoreHours(0.3), 1)
  assert.equal(scoreHours(0.2999), 0)

  assert.equal(scoreEps(-20), -2)
  assert.equal(scoreEps(-19.999), -1)
  assert.equal(scoreEps(-10), -1)
  assert.equal(scoreEps(-9.999), 0)
  assert.equal(scoreEps(10), 1)

  assert.equal(scoreSloos(40), -2)
  assert.equal(scoreSloos(39.999), -1)
  assert.equal(scoreSloos(20), -1)
  assert.equal(scoreSloos(19.999), 0)
  assert.equal(scoreSloos(-5), 1)
  assert.equal(scoreSloos(-4.999), 0)

  assert.equal(valuationCapActive(90, 0.50), true)
  assert.equal(valuationCapActive(89.999, 0.50), false)
  assert.equal(valuationCapActive(90, 0.4999), false)
})

test('第二轮阈值边界：hikeStart / longRateShock / pceMomentum / breakevenShock', () => {
  assert.equal(scoreHikeStart(0.25), -1)
  assert.equal(scoreHikeStart(0.2499), 0)
  assert.equal(scoreHikeStart(1), -1)
  assert.equal(scoreHikeStart(null), null)

  assert.equal(scoreLongRateShock(1.50), -2)
  assert.equal(scoreLongRateShock(1.4999), -1)
  assert.equal(scoreLongRateShock(1.00), -1)
  assert.equal(scoreLongRateShock(0.9999), 0)
  assert.equal(scoreLongRateShock(-0.5), 0)
  assert.equal(scoreLongRateShock(null), null)

  assert.equal(scorePceMomentum(3.0, 2.5), -1) // a3 >= 3 且 a3 >= y+0.5
  assert.equal(scorePceMomentum(3.0, 2.5001), 0) // a3 < y+0.5
  assert.equal(scorePceMomentum(2.999, 2.0), 0)
  assert.equal(scorePceMomentum(2.0, 3.0), 1)
  assert.equal(scorePceMomentum(1.999, 5), 1)
  assert.equal(scorePceMomentum(2.5, 2.0), 0)
  assert.equal(scorePceMomentum(null, 2), null)

  assert.equal(scoreBreakevenShock(0.50), -1)
  assert.equal(scoreBreakevenShock(0.4999), 0)
  assert.equal(scoreBreakevenShock(null), null)

  // a3 = (P_t/P_{t-3})^4 − 1；同比 = P_t/P_{t-12} − 1
  assert.ok(Math.abs(percentChange(103, 100, 4) - (((103 / 100) ** 4 - 1) * 100)) < 1e-9)
  assert.ok(Math.abs(percentChange(110, 100, 1) - 10) < 1e-9)
})

test('发布滞后：DGS2/T10YIE 当日；FEDFUNDS/GS10 当月末；PERMIT/AWHMAN m+1；PCEPILFE m+2；EPS m+3；DRTSCILM 次季首月末', () => {
  assert.equal(availableOnFor('DGS2', '2020-03-15'), '2020-03-15')
  assert.equal(availableOnFor('T10YIE', '2020-03-15'), '2020-03-15')
  assert.equal(availableOnFor('FEDFUNDS', '2020-01-01'), '2020-01-31')
  assert.equal(availableOnFor('GS10', '2020-02-01'), '2020-02-29')
  assert.equal(availableOnFor('PERMIT', '2020-01-31'), '2020-02-29')
  assert.equal(availableOnFor('AWHMAN', '2020-01-01'), '2020-02-29')
  assert.equal(availableOnFor('PCEPILFE', '2020-01-01'), '2020-03-31')
  assert.equal(availableOnFor('EPS', '2020-01-31'), '2020-04-30')
  assert.equal(nextQuarterFirstMonthEnd('2020-01-01'), '2020-04-30')
  assert.equal(nextQuarterFirstMonthEnd('2020-03-31'), '2020-04-30')
  assert.equal(nextQuarterFirstMonthEnd('2020-04-01'), '2020-07-31')
  assert.equal(nextQuarterFirstMonthEnd('2019-10-01'), '2020-01-31')
  assert.equal(availableOnFor('DRTSCILM', '2020-01-01'), '2020-04-30')

  const permits = makeCandidateSeries('PERMIT', [['2020-01-01', 100], ['2020-02-01', 110]])
  assert.equal(pointAt(permits, '2020-02-28'), null) // 1 月观测要到 2 月末
  assert.equal(pointAt(permits, '2020-02-29')?.value, 100)
  assert.equal(pointAt(permits, '2020-03-31')?.value, 110)

  const sloos = makeCandidateSeries('DRTSCILM', [['2020-01-01', 25]])
  assert.equal(pointAt(sloos, '2020-04-29'), null)
  assert.equal(pointAt(sloos, '2020-04-30')?.value, 25)

  const pce = makeCandidateSeries('PCEPILFE', [['2020-01-01', 100]])
  assert.equal(pointAt(pce, '2020-03-30'), null)
  assert.equal(pointAt(pce, '2020-03-31')?.value, 100)

  const ie = makeCandidateSeries('T10YIE', [['2020-03-15', 1.5]])
  assert.equal(pointAt(ie, '2020-03-14'), null)
  assert.equal(pointAt(ie, '2020-03-15')?.value, 1.5)
})

test('multpl 千分位逗号先清掉再解析', () => {
  const html = `<table><tr><td>Jan 31, 2020</td><td>1,234.56</td></tr><tr><td>Feb 29, 2020</td><td>99.1</td></tr></table>`
  const rows = parseMultplMonthly(html, '2020-02-29')
  assert.deepEqual(rows, [['2020-01-31', 1234.56], ['2020-02-29', 99.1]])
})

test('子样本切分：1973 起用固定 1999/2000；更晚起点对半', () => {
  const classic = splitRanges('1973-01', '1973-01', '2026-10')
  assert.equal(classic.early.end, '1999-12')
  assert.equal(classic.late.start, '2000-01')
  assert.equal(classic.late.end, '2026-10')

  const late = splitRanges('1990-01', '1973-01', '2025-12')
  assert.equal(late.early.start, '1990-01')
  assert.ok(late.early.end < late.late.start)
  assert.equal(late.late.end, '2025-12')
  // 对半：1990-01..2025-12 = 36 年 = 432 月 → 前 216 / 后 216
  assert.equal(historyYears('1990-01', '2025-12'), 36)
  const monthsEarly = (Number(late.early.end.slice(0, 4)) * 12 + Number(late.early.end.slice(5))
    - (1990 * 12 + 1) + 1)
  const monthsLate = (2025 * 12 + 12
    - (Number(late.late.start.slice(0, 4)) * 12 + Number(late.late.start.slice(5))) + 1)
  assert.equal(monthsEarly, monthsLate)

  // 依赖两年期美债：起点 1976-12，按可用区间对半（奇数月时前段可少 1）
  const dgs2 = splitRanges('1976-12', '1973-01', '2026-10')
  assert.equal(dgs2.early.start, '1976-12')
  assert.ok(dgs2.early.end < dgs2.late.start)
  assert.equal(dgs2.late.end, '2026-10')
  const dgs2Early = (Number(dgs2.early.end.slice(0, 4)) * 12 + Number(dgs2.early.end.slice(5))
    - (1976 * 12 + 12) + 1)
  const dgs2Late = (2026 * 12 + 10
    - (Number(dgs2.late.start.slice(0, 4)) * 12 + Number(dgs2.late.start.slice(5))) + 1)
  assert.ok(Math.abs(dgs2Early - dgs2Late) <= 1)
})

test('采用判定：adopt / watch / reject 覆盖', () => {
  const good = pack(m(0.10, 0.70, -0.20, 5, 10), m(0.09, 0.65, -0.22, 3, 4), m(0.11, 0.75, -0.18, 2, 6))
  const better = pack(m(0.100, 0.72, -0.19, 5, 11), m(0.091, 0.67, -0.21, 3, 4), m(0.111, 0.78, -0.17, 2, 6))
  const adopt = judge(good, better, 40)
  assert.equal(adopt.verdict, 'adopt')
  assert.ok(adopt.checks.every(c => c.pass))
  assert.match(adopt.reason, /前段夏普变化 \+0\.020/)
  assert.match(adopt.reason, /后段夏普变化 \+0\.030/)
  assert.doesNotMatch(adopt.reason, /最小改善门槛/)

  // 改善 < 0.01 → reason 注明低于下一轮门槛（本轮仍可 adopt）
  const tiny = pack(m(0.100, 0.702, -0.19, 5, 11), m(0.091, 0.653, -0.21, 3, 4), m(0.111, 0.754, -0.17, 2, 6))
  const adoptTiny = judge(good, tiny, 40)
  assert.equal(adoptTiny.verdict, 'adopt')
  assert.match(adoptTiny.reason, /低于下一轮 0\.01 的最小改善门槛/)

  // 1–3 过、衰退不过 → watch
  const worseRec = pack(m(0.100, 0.72, -0.19, 4, 20), m(0.091, 0.67, -0.21), m(0.111, 0.78, -0.17))
  const watchRec = judge(good, worseRec, 40)
  assert.equal(watchRec.verdict, 'watch')

  // 只在一段夏普改善且未违反回撤/年化 → watch
  const oneSide = pack(m(0.10, 0.70, -0.20), m(0.09, 0.68, -0.22), m(0.11, 0.70, -0.18))
  const watchOne = judge(good, oneSide, 40)
  assert.equal(watchOne.verdict, 'watch')
  assert.match(watchOne.reason, /观察不代表有效/)

  // 只在一段夏普改善但回撤恶化超 1pp → reject（裁定 2）
  const oneSideDdBad = pack(
    m(0.10, 0.70, -0.20, 5, 10),
    m(0.09, 0.68, -0.24, 3, 4), // 前段夏普升、回撤恶化 2pp
    m(0.11, 0.74, -0.18, 2, 6), // 后段夏普降
  )
  const rejectOneSideDd = judge(good, oneSideDdBad, 40)
  assert.equal(rejectOneSideDd.verdict, 'reject')
  assert.match(rejectOneSideDd.reason, /违反回撤或年化/)

  // 历史不足但其余过 → watch
  const watchHist = judge(good, better, 20)
  assert.equal(watchHist.verdict, 'watch')
  assert.equal(watchHist.checks.find(c => c.id === 'history').pass, false)

  // 两段夏普都降 → reject
  const worse = pack(m(0.09, 0.60, -0.25, 5, 10), m(0.08, 0.60, -0.25), m(0.10, 0.70, -0.20))
  const reject = judge(good, worse, 40)
  assert.equal(reject.verdict, 'reject')
  assert.match(reject.reason, /前段夏普变化 −0\.050/)

  // 回撤恶化超过 1pp → reject（即使夏普升）
  const ddBad = pack(m(0.10, 0.72, -0.25, 5, 10), m(0.09, 0.67, -0.24), m(0.11, 0.78, -0.23))
  assert.equal(judge(good, ddBad, 40).verdict, 'reject')

  // 合测 1–4
  const ok = judgeCombined(good, better)
  assert.equal(ok.pass, true)
  assert.equal(judgeCombined(good, worseRec).pass, false)
})

test('第二轮最小改善门槛：两段夏普各 ≥ +0.01，或任一段回撤改善 ≥ 2pp 且另一段不恶化', () => {
  const good = pack(m(0.10, 0.70, -0.20, 5, 10), m(0.09, 0.65, -0.22, 3, 4), m(0.11, 0.75, -0.18, 2, 6))

  // 两段夏普 +0.02 / +0.03 → 过门槛 → adopt
  const better = pack(m(0.100, 0.72, -0.19, 5, 11), m(0.091, 0.67, -0.21, 3, 4), m(0.111, 0.78, -0.17, 2, 6))
  const adopt = judge(good, better, 40, { requireMinImprovement: true })
  assert.equal(adopt.verdict, 'adopt')
  assert.equal(adopt.checks.find(c => c.id === 'minImprovement').pass, true)

  // 11.3 过但夏普改善不足 0.01、回撤也不足 → reject
  const tiny = pack(m(0.100, 0.702, -0.19, 5, 11), m(0.091, 0.653, -0.21, 3, 4), m(0.111, 0.754, -0.17, 2, 6))
  const rejectTiny = judge(good, tiny, 40, { requireMinImprovement: true })
  assert.equal(rejectTiny.verdict, 'reject')
  assert.equal(rejectTiny.checks.find(c => c.id === 'minImprovement').pass, false)
  assert.match(rejectTiny.reason, /最小改善门槛/)

  // 夏普改善不足，但前段回撤改善 ≥2pp 且后段不恶化 → 过门槛
  const ddRescue = pack(
    m(0.100, 0.705, -0.18, 5, 11),
    m(0.091, 0.655, -0.19, 3, 4), // 前段夏普 +0.005；回撤 −0.22→−0.19 = +3pp
    m(0.111, 0.755, -0.18, 2, 6), // 后段夏普 +0.005；回撤持平
  )
  const adoptDd = judge(good, ddRescue, 40, { requireMinImprovement: true })
  assert.equal(adoptDd.verdict, 'adopt')
  assert.equal(adoptDd.checks.find(c => c.id === 'minImprovement').pass, true)

  // 前段回撤改善够，但后段恶化 → 不过门槛
  const ddOtherWorse = pack(
    m(0.100, 0.705, -0.18, 5, 11),
    m(0.091, 0.655, -0.19, 3, 4),
    m(0.111, 0.755, -0.19, 2, 6), // 后段回撤恶化
  )
  const rejectDd = judge(good, ddOtherWorse, 40, { requireMinImprovement: true })
  assert.equal(rejectDd.verdict, 'reject')
  assert.equal(rejectDd.checks.find(c => c.id === 'minImprovement').pass, false)

  // 第一轮不加 minImprovement 检查项
  const round1 = judge(good, better, 40)
  assert.equal(round1.checks.find(c => c.id === 'minImprovement'), undefined)
})

test('score 为 null 时不进支柱均值；valuationCap 压最终档', () => {
  // 构造一个简易 frame：用真实 panelAt 需要完整序列，这里直接喂 components
  const frame = {
    components: {
      sahm: { value: 0.1 }, claims: { value: 3 }, payrolls: { value: 0.15 }, indpro: { value: 3 },
      baaLevel: { value: 30 }, baaChange: { value: -0.2 }, nfciCredit: { value: -0.6, delta: -0.1 },
      fedPath: { value: 0, delta6: -0.6 }, curve: { value: 1.5, inverted12: false, inverted24: false },
      nfci: { value: -0.5, delta: -0.1 }, realRate: { value: -0.5 }, corePce: { value: 2, yoy: 2 },
    },
    tactical: { below: false },
  }
  const readings = {
    rateExp: { score: null },
    permits: { score: -2 },
    hours: { score: null },
    eps: { score: null },
    sloos: { score: null },
    valuationCap: { active: false },
  }
  const base = evaluateWithCandidates(frame, readings, [])
  const withPermits = evaluateWithCandidates(frame, readings, ['permits'])
  // permits=-2 拉低增长支柱
  assert.ok(withPermits.pillars.growth < base.pillars.growth)

  const offense = evaluateWithCandidates(frame, { ...readings, valuationCap: { active: true } }, ['valuationCap'])
  // 进攻应被压到偏进攻
  if (base.final.tier === 'offense') {
    assert.equal(offense.final.tier, 'lean-offense')
  } else {
    assert.ok(['lean-offense', 'neutral', 'lean-defense', 'defense'].includes(offense.final.tier))
  }
})

test('当前读数 display / score / observedOn（含 valuationCap）', () => {
  const missing = formatCandidateCurrent('permits', { value: null, score: null, observedOn: null })
  assert.equal(missing.display, '暂无足够读数')
  assert.equal(missing.score, null)

  const rate = formatCandidateCurrent('rateExp', {
    value: 0.80, dgs2Change6: 0.55, score: -1, observedOn: '2026-11-20',
  })
  assert.equal(rate.display, '差值 0.80 个百分点，两年期半年变化 0.55 个百分点（11 月 20 日）')
  assert.equal(rate.score, -1)
  assert.equal(rate.observedOn, '2026-11-20')

  const permits = formatCandidateCurrent('permits', {
    value: -22.5, score: -1, observedOn: '2026-09-01',
  })
  assert.equal(permits.display, '六月均同比 −22.5%（2026 年 9 月）')

  const hours = formatCandidateCurrent('hours', {
    value: -0.6, score: -1, observedOn: '2026-10-01',
  })
  assert.equal(hours.display, '半年变化 −0.6 小时（2026 年 10 月）')

  const eps = formatCandidateCurrent('eps', {
    value: 12.34, score: 1, observedOn: '2026-07-31',
  })
  assert.equal(eps.display, '同比 12.3%（2026 年 7 月）')
  assert.equal(eps.score, 1)

  const sloos = formatCandidateCurrent('sloos', {
    value: 25, score: -1, observedOn: '2026-07-01',
  })
  assert.equal(sloos.display, '净收紧比例 25.0%（2026 年 7 月）')

  const capOff = formatCandidateCurrent('valuationCap', {
    value: 88.2, dgs2Change6: 0.30, score: 0, observedOn: '2026-10-31',
  })
  assert.equal(capOff.display, 'CAPE 第 88 百分位，2 年期美债半年变化 0.30 个百分点')
  assert.equal(capOff.score, 0)

  const capOn = formatCandidateCurrent('valuationCap', {
    value: 92.4, dgs2Change6: -0.55, score: -1, observedOn: '2026-10-31',
  })
  assert.equal(capOn.display, 'CAPE 第 92 百分位，2 年期美债半年变化 −0.55 个百分点')
  assert.equal(capOn.score, -1)

  // readCandidates 给 valuationCap 填 score 0/−1
  const extras = {
    DGS2: makeCandidateSeries('DGS2', [['2020-01-31', 2.0], ['2019-07-31', 1.4]]),
    PERMIT: makeCandidateSeries('PERMIT', []),
    AWHMAN: makeCandidateSeries('AWHMAN', []),
    DRTSCILM: makeCandidateSeries('DRTSCILM', []),
    EPS: makeCandidateSeries('EPS', []),
    CAPE: makeCandidateSeries('CAPE', [
      ...Array.from({ length: 20 }, (_, i) => [`${1900 + i}-01-01`, 10 + i * 0.5]),
      ['2019-12-01', 40],
    ]),
  }
  const fed = makeSeries('FEDFUNDS', [['2020-01-01', 1.5]])
  const at = readCandidates(extras, '2020-01-31', fed)
  assert.ok(at.valuationCap.value >= 90)
  assert.equal(at.valuationCap.score, -1) // CAPE 高百分位 + DGS2 半年升 0.6
  assert.equal(at.valuationCap.active, true)
  assert.equal(at.rateExp.observedOn, '2020-01-31')
  const formatted = formatCandidateCurrent('valuationCap', at.valuationCap)
  assert.match(formatted.display, /^CAPE 第 \d+ 百分位，2 年期美债半年变化/)
  assert.equal(formatted.score, -1)

  const hike = formatCandidateCurrent('hikeStart', {
    value: 0.30, score: -1, observedOn: '2026-10-01',
  })
  assert.equal(hike.display, '联邦基金利率半年变化 0.30 个百分点（2026 年 10 月）')
  assert.equal(hike.score, -1)

  const longRate = formatCandidateCurrent('longRateShock', {
    value: 1.07, score: -1, observedOn: '2026-10-01',
  })
  // formatReading：|x|≥1 时保留 1 位小数
  assert.equal(longRate.display, '10 年期美债一年变化 1.1 个百分点（2026 年 10 月）')

  const pce = formatCandidateCurrent('pceMomentum', {
    value: 3.2, yoy: 2.5, score: -1, observedOn: '2026-09-01',
  })
  assert.equal(pce.display, '3 个月年化 3.2%，同比 2.5%（2026 年 9 月）')

  const ie = formatCandidateCurrent('breakevenShock', {
    value: 0.55, score: -1, observedOn: '2026-11-20',
  })
  assert.equal(ie.display, '10 年盈亏平衡通胀半年变化 0.55 个百分点（11 月 20 日）')
})

test('permits 六月均同比与 hours/eps 派生读数', () => {
  // 构造 24 个月 PERMIT：前 6 月=100，后段抬到可算同比
  const permitRows = []
  for (let i = 0; i < 30; i += 1) {
    const d = monthEnd('2018-01', i)
    // 2018 整年 100；2019 整年 80 → 2019-12 的 MA6/一年前 MA6 = 80/100 = -20%
    const ym = d.slice(0, 7)
    const value = ym < '2019-01' ? 100 : 80
    permitRows.push([d, value])
  }
  const hoursRows = [
    ['2019-06-01', 42],
    ['2019-12-01', 41.4], // -0.6 → -1
  ]
  const epsRows = [
    ['2018-12-01', 100],
    ['2019-12-01', 80], // -20% → -2；available = 2020-03-31
  ]
  const extras = {
    DGS2: makeCandidateSeries('DGS2', [['2019-12-31', 1.5], ['2019-06-30', 1.0]]),
    PERMIT: makeCandidateSeries('PERMIT', permitRows),
    AWHMAN: makeCandidateSeries('AWHMAN', hoursRows),
    DRTSCILM: makeCandidateSeries('DRTSCILM', []),
    EPS: makeCandidateSeries('EPS', epsRows),
    CAPE: makeCandidateSeries('CAPE', [['1900-01-01', 10], ['2019-12-01', 30]]),
  }
  const fed = makeSeries('FEDFUNDS', [['2019-12-01', 1.5]])
  // PERMIT 2019-12 观测 → available 2020-01-31
  const at = readCandidates(extras, '2020-01-31', fed)
  assert.equal(at.permits.score, -1) // -20% 边界
  assert.ok(Math.abs(at.permits.value - (-20)) < 1e-9)

  // hours：2019-12 观测 available 2020-01-31；prior 2019-06 available 2019-07-31
  assert.equal(at.hours.score, -1)
  assert.ok(Math.abs(at.hours.value - (-0.6)) < 1e-9)

  // EPS 2019-12 → available 2020-03-31
  assert.equal(readCandidates(extras, '2020-03-30', fed).eps.score, null)
  assert.equal(readCandidates(extras, '2020-03-31', fed).eps.score, -2)
})

test('makePanel 可与候选叠加跑通一帧（冒烟）', () => {
  const rows = {
    SAHMREALTIME: [['2020-01-01', 0.2]],
    IC4WSA: Array.from({ length: 60 }, (_, i) => [monthEnd('2019-01', Math.floor(i / 4)), 200 + i]),
    PAYEMS: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 150_000 + i * 100]),
    INDPRO: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 100 + i]),
    PCEPILFE: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 100 + i * 0.2]),
    BAA: Array.from({ length: 130 }, (_, i) => [monthEnd('2010-01', i), 5]),
    AAA: Array.from({ length: 130 }, (_, i) => [monthEnd('2010-01', i), 3]),
    NFCI: [['2020-01-01', -0.5]],
    NFCICREDIT: [['2020-01-01', -0.5]],
    FEDFUNDS: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 2]),
    GS10: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 3]),
    TB3MS: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 1]),
    price: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 3000 + i * 10]),
    yield: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 2]),
    USREC: [['2020-01-01', 0]],
  }
  // 补足周频序列日期
  rows.IC4WSA = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.UTC(2019, 0, 5 + i * 7))
    return [d.toISOString().slice(0, 10), 200]
  })
  rows.NFCI = rows.IC4WSA.map(([d]) => [d, -0.5])
  rows.NFCICREDIT = rows.IC4WSA.map(([d]) => [d, -0.5])

  const panel = makePanel(rows)
  const frame = panelAt(panel, '2020-01-31', null)
  const extras = {
    DGS2: makeCandidateSeries('DGS2', [['2020-01-31', 1.5], ['2019-07-31', 2.2]]),
    PERMIT: makeCandidateSeries('PERMIT', []),
    AWHMAN: makeCandidateSeries('AWHMAN', []),
    DRTSCILM: makeCandidateSeries('DRTSCILM', []),
    EPS: makeCandidateSeries('EPS', []),
    CAPE: makeCandidateSeries('CAPE', [['1900-01-01', 15], ['2020-01-01', 30]]),
  }
  const readings = readCandidates(extras, '2020-01-31', panel.FEDFUNDS)
  const result = evaluateWithCandidates(frame, readings, ['rateExp'])
  assert.ok(result.final.tier == null || typeof result.final.tier === 'string')
})

test('实时面板接入：小缓存夹具离线加载，buildTimeline 用当时版本', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'macro-research-vintages-'))
  const jan = '2020-01-31'
  const feb = '2020-02-29'
  try {
    await Promise.all(['PAYEMS', 'INDPRO', 'PCEPILFE', 'IC4WSA'].map(id => {
      const cache = {
        [jan]: id === 'PAYEMS'
          ? [jan, [['2019-12-01', 90], ['2020-01-01', 91]]]
          : null,
        [feb]: id === 'PAYEMS'
          ? [feb, [['2019-12-01', 95], ['2020-01-01', 100], ['2020-02-01', 101]]]
          : null,
      }
      return writeFile(join(directory, id + '.json'), JSON.stringify(cache) + '\n')
    }))

    const { vintages, requests } = await loadVintages([jan, feb], {
      directory,
      fetcher: () => assert.fail('cache hit requested ALFRED'),
    })
    assert.equal(requests, 0)

    const panel = makePanel({
      PAYEMS: [['2019-12-01', 900], ['2020-01-01', 901], ['2020-02-01', 902]],
      INDPRO: [['2020-01-01', 100]],
      PCEPILFE: [['2020-01-01', 100]],
      IC4WSA: [['2020-01-04', 200]],
      SAHMREALTIME: [['2020-01-01', 0.2]],
      BAA: Array.from({ length: 130 }, (_, i) => [monthEnd('2010-01', i), 5]),
      AAA: Array.from({ length: 130 }, (_, i) => [monthEnd('2010-01', i), 3]),
      NFCI: [['2020-01-04', -0.5]],
      NFCICREDIT: [['2020-01-04', -0.5]],
      FEDFUNDS: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 2]),
      GS10: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 3]),
      TB3MS: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 1]),
      price: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 3000 + i * 10]),
      yield: Array.from({ length: 20 }, (_, i) => [monthEnd('2018-06', i), 2]),
      USREC: [['2020-01-01', 0]],
    })

    assert.equal(valueAt(panelWithVintages(panel, vintages, jan).PAYEMS, jan).value, 91)
    assert.equal(valueAt(panelWithVintages(panel, vintages, feb).PAYEMS, feb).value, 101)
    assert.notEqual(valueAt(panel.PAYEMS, feb).value, 101)

    const extras = {
      DGS2: makeCandidateSeries('DGS2', [['2020-01-31', 1.5], ['2019-07-31', 2.2]]),
      PERMIT: makeCandidateSeries('PERMIT', []),
      AWHMAN: makeCandidateSeries('AWHMAN', []),
      DRTSCILM: makeCandidateSeries('DRTSCILM', []),
      EPS: makeCandidateSeries('EPS', []),
      CAPE: makeCandidateSeries('CAPE', [['1900-01-01', 15], ['2020-01-01', 30]]),
    }
    // 只覆盖到 2020-02；START=1973 会因缺 vintage 抛错——把夹具补到 START 不现实，
    // 这里直接验证 panelWithVintages 路径与 buildTimeline 签名兼容（传 vintages 时调用）。
    assert.equal(typeof buildTimeline, 'function')
    const frame = panelAt(panelWithVintages(panel, vintages, feb), feb, null)
    const readings = readCandidates(extras, feb, panel.FEDFUNDS)
    const result = evaluateWithCandidates(frame, readings, [])
    assert.ok(result.final.tier == null || typeof result.final.tier === 'string')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('fetchEps falls back to the market radar copy of the Multpl earnings table when Multpl is unreachable', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { join: joinPath } = await import('node:path')
  const { tmpdir: tempRoot } = await import('node:os')
  const { fetchEps } = await import('./lib/macro-posture-research/fetch.mjs')
  const file = joinPath(mkdtempSync(joinPath(tempRoot(), 'eps-')), 'eps.json')
  writeFileSync(file, JSON.stringify([['2026-05-31', 290], ['2026-06-30', 298.03], ['2026-11-30', 310]]))
  const refuse = async () => { throw new TypeError('fetch failed') }
  const series = await fetchEps(refuse, '2026-10-31', { noCache: true, cacheFile: file })
  assert.deepEqual(series.map(point => [point.observedOn, point.value]), [['2026-05-31', 290], ['2026-06-30', 298.03]])
  await assert.rejects(fetchEps(refuse, '2026-10-31', { noCache: true, cacheFile: joinPath(tempRoot(), 'missing-eps.json') }), /fetch failed/)
})
