import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fmt3g, growthOf, generatorGrowth, cyclePhase, pricingPower, marginStability, capitalReturn,
  earningsPersistence, financialHealth, demandResilience, moatScore, ttmWindows, fyWindows,
  isVolatile, isTroughRecovery, isTwoYearSurge, generatorType, generatorFlags, splitAdjust, buildInputs, peerMedianIndex,
} from './lynch-inputs.mjs'
import { normalizeSinaCn, normalizeEmUsQuarterly, normalizeSec } from './lynch-financials.mjs'

test('fmt3g 与 Python %.3g 一致', () => {
  assert.equal(fmt3g(5.08), '5.08')
  assert.equal(fmt3g(3), '3')
  assert.equal(fmt3g(153.2), '153')
  assert.equal(fmt3g(0.8349), '0.835')
  assert.equal(fmt3g(-1.3), '-1.3')
  assert.equal(fmt3g(3332e6), '3.33e+09')
  assert.equal(fmt3g(-833e6), '-8.33e+08')
  assert.equal(fmt3g(18e9), '1.8e+10')
  assert.equal(fmt3g(0.00005), '5e-05')
})

test('g/c/rg：AAPL 原证据 8.72/6.59/6.57 → +32% / +15%', () => {
  assert.deepEqual(growthOf([8.72, 6.59, 6.57], [466, 408]), { g: 32, c: 15, rg: 14 })
  // 两年前亏损：c 无定义；上一窗亏损：g 无定义
  assert.deepEqual(growthOf([3.33e9, 1.12e9, -8.33e8], [9.6, 4.0]), { g: 197, c: null, rg: 140 })
  assert.equal(growthOf([1, -1, 2]).g, null)
  assert.equal(generatorGrowth(199, null), 199)
  assert.equal(generatorGrowth(19, 3), 3)
})

test('周期位置阈值', () => {
  assert.equal(cyclePhase([5, 10, 8]), '盈利下行') // N/M 0.5
  assert.equal(cyclePhase([8.43, 3.92, 3.33]), '盈利高位')
  assert.equal(cyclePhase([6.01, 3.62, 5.8]), '盈利回升初期') // N/M 1.66, N/O 1.04
  assert.equal(cyclePhase([8.43, 6.9, 6.95]), '盈利回升初期')
  assert.equal(cyclePhase([0.529, 0.554, 2.58]), '盈利低位')
  assert.equal(cyclePhase([9.13, 8.91, 7.79]), '不明')
})

test('护城河六项：阈值与文字', () => {
  assert.deepEqual(pricingPower(53.8, 62.5), ['定价权', true, '毛利率 53.8%（同行业中位 62.5%）'])
  assert.equal(pricingPower(48.7, 58.8)[1], false)
  assert.equal(pricingPower(28.0, 23.0)[1], true) // ≥ 中位+5 且 ≥25
  assert.equal(pricingPower(24.7, 18.1)[1], false) // 低于 25% 绝对门槛
  assert.equal(pricingPower(null, 40)[1], null)
  assert.deepEqual(marginStability([53.8, 52.6, 54.4]), ['毛利稳定', true, '近三年毛利率区间 52.6%–54.4%（极差 1.8pt）'])
  assert.equal(marginStability([60, 55.9, 58])[1], false)
  assert.deepEqual(capitalReturn([150, 155, 150]), ['资本回报', true, '近三年 ROE 150%/155%/150%（要求最新 ≥15% 且三年最低 ≥12%）'])
  assert.equal(capitalReturn([27, -8, -15])[1], false)
  assert.equal(capitalReturn([20, null, 18])[1], null)
  assert.deepEqual(earningsPersistence([5.08, 4.26, 4.82]), ['盈利持续', true, '三个 TTM 窗口利润 5.08/4.26/4.82（要求全正、未萎缩、回撤 ≤30%）'])
  assert.equal(earningsPersistence([17.9, 16.1, 11.8])[1], false) // 最小/最大 0.66 < 0.7
  assert.equal(earningsPersistence([12.8, 10.3, 12.9])[1], false) // 未超过两年前
  assert.deepEqual(financialHealth({ debtRatio: 47.2, currentRatio: 2.049 }), ['财务稳健', true, '资产负债率 47%，流动比率 2.05'])
  assert.equal(financialHealth({ debtRatio: 72, currentRatio: 1.0 })[1], false)
  assert.equal(financialHealth({ debtRatio: 30 }, { financial: true })[1], null)
  assert.equal(demandResilience([3, 2, 1])[1], true)
  assert.equal(demandResilience([3, 4, 1])[2], '三个 TTM 窗口营收逐年未持续增长')
})

test('护城河分级：>80% 宽、≥60% 窄、可评 ≤3 项数据不足', () => {
  const it = (t, f, nil = 0) => [...Array(t).fill(['x', true]), ...Array(f).fill(['x', false]), ...Array(nil).fill(['x', null])]
  assert.equal(moatScore(it(5, 1)).l, '宽护城河迹象')
  assert.equal(moatScore(it(4, 1, 1)).l, '窄护城河迹象') // 4/5 = 0.8 不算宽
  assert.equal(moatScore(it(4, 0, 2)).l, '宽护城河迹象')
  assert.equal(moatScore(it(3, 3)).l, '证据不足')
  assert.equal(moatScore(it(3, 0, 3)).l, '数据不足')
  assert.deepEqual([moatScore(it(4, 2)).s, moatScore(it(4, 2)).n], [4, 6])
})

const quarters = (n, f) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2023, 9 + i * 3, 0)) // 季末
  return { end: d.toISOString().slice(0, 10), ...f(i) }
})

test('TTM 窗口：12 个连续单季，新→旧，ROE 为四季合计', () => {
  const q = quarters(13, i => ({ revenue: 10 + i, grossProfit: 5, netIncome: 1 + i, eps: 0.1 * (i + 1), roe: 2 }))
  const w = ttmWindows(q, null)
  assert.equal(w.missing, false)
  assert.equal(w.windows.length, 3)
  assert.equal(w.windows[0].end, q[12].end)
  assert.equal(w.windows[0].netIncome, 10 + 11 + 12 + 13)
  assert.equal(w.windows[2].netIncome, 2 + 3 + 4 + 5)
  assert.equal(w.windows[0].roe, 8)
  assert.equal(ttmWindows(q.slice(0, 11), null).missing, true)
  const gap = [...q.slice(0, 5), ...q.slice(6)]
  assert.equal(ttmWindows(gap, null).missing, true)
  assert.equal(ttmWindows(q, q[11].end).windows[0].end, q[11].end) // cutoff
})

test('财年窗口：三个相邻财年', () => {
  const a = [2021, 2022, 2023, 2024].map(y => ({ end: `${y}-12-31`, netIncome: y - 2000, revenue: 1 }))
  const w = fyWindows(a, '2024-06-30')
  assert.deepEqual(w.windows.map(x => x.end), ['2023-12-31', '2022-12-31', '2021-12-31'])
  assert.equal(fyWindows(a.slice(0, 2), null).missing, true)
})

test('形态判定：波动、谷底回升、周期行业两年高增', () => {
  assert.equal(isVolatile([3.09, 7.98, 3.17]), true)
  assert.equal(isVolatile([1.66e9, 1.21e9, -1.97e8]), false) // 单边上升（由亏转盈）不算波动
  assert.equal(isVolatile([1.86, 1.12, 1.22]), false) // 旧→中仅 -8%，一段波动不算（原数据 002340）
  assert.equal(isVolatile([1.86, 1.5, 1.22]), false)
  assert.equal(isTroughRecovery([16.2, 1.95, 10.6]), true)
  assert.equal(isTroughRecovery([6.74, 5.6, 12.4]), false) // 回升不足 30%
  assert.equal(isTwoYearSurge([7.83, 3.92, 1.15], 49), true)
  assert.equal(isTwoYearSurge([1.63, 0.66, 0.08], 9), false) // 营收不足 15%
})

test('原生成器类型与 w 文字', () => {
  const win = (profits, rg) => ({ profits, growth: growthOf(profits, rg == null ? [] : [100 + rg, 100]) })
  assert.deepEqual(generatorType(win([8.72, 6.59, 6.57], 14)).w, ['利润 +32%（两年年化 +15%）'])
  assert.equal(generatorType(win([8.72, 6.59, 6.57], 14)).t, '稳健型')
  assert.deepEqual(generatorType(win([5.08, 4.26, 4.82], 9)).w, ['有效增速 +3%（<8%）'])
  const fast = generatorType(win([2.0, 1.25, 0.835], 54))
  assert.equal(fast.t, '快速增长型')
  assert.deepEqual(fast.w, ['利润 +60%（两年年化 +55%）', '营收 +54%'])
  assert.equal(generatorType(win([17.2, 14.0, -2.03], 10)).w[0], '利润增速 23%')
  assert.deepEqual(generatorType(win([-1, 2, 3], 0)).w, ['TTM 归母亏损'])
  assert.equal(generatorType(win([1, -2, 3], 0)).w[0], 'TTM 刚由亏转盈（上年同期亏损）')
  assert.equal(generatorType(win([16.2, 1.95, 10.6], 0)).w[0], '利润从谷底回升：10.6→1.95→16.2')
  assert.deepEqual(generatorType(win([5, 4, 3], 0), { cyclical: true }).w, ['行业属强周期'])
  const surge = generatorType(win([7.83, 3.92, 1.15], 49), { cyclical: true })
  assert.equal(surge.t, '快速增长型')
  assert.match(surge.f[0], /所属行业有周期属性/)
  assert.equal(generatorType(win([5, 4, 3], 0), { reit: true }).t, '资产型')
  assert.equal(generatorType(win([5, 4.9, 4.8], 0), { pb: 0.6 }).w[0], 'PB 0.6× <1，疑似资产折价（资产是否真实需核实）')
  assert.equal(generatorType(null).t, '数据不足')
})

test('附加标记：财年窗口、中期、高增封顶、美股 EPS 波动/隐含股本', () => {
  const win = { profits: [3, 1, 0.5], growth: { g: 200, c: 145, rg: 30 } }
  const f = generatorFlags(win, { t: '快速增长型', basis: 'fy', fyEnd: '2025-12-31', interim: { end: '2026-06-30', yoy: 16.2 } })
  assert.deepEqual(f, ['按财年窗口（最新财年 2025-12-31）计算增速', '最新中期（2026-06-30）利润同比 +16%', '增速 >50% 不可外推，PEG 以 50% 封顶', '增速 >80% 多来自低基数或一次性因素，PEG 偏乐观，评级下调一档'])
  const q = quarters(9, i => ({ revenue: 100, netIncome: 10, eps: i === 8 ? -0.1 : 0.1 }))
  q[8].netIncome = -10
  const g2 = generatorFlags({ profits: [1, 1, 1], growth: { g: 0, c: 0, rg: 0 } }, { t: '缓慢增长型', epsMetric: true, quarters: q })
  assert.ok(g2.includes('近四季 EPS 波动过大或符号翻转'))
  assert.ok(!generatorFlags({ profits: [1, 1, 1], growth: { g: 0, c: 0, rg: 0 } }, { t: '缓慢增长型', epsMetric: false, quarters: q }).length)
})

test('拆股折算：最早连续 ≥2 季隐含股本为最新的 1/k（常见拆股比）才折算', () => {
  const q = [
    { end: '2025-12-31', netIncome: 100, eps: 50 }, // 2 股
    { end: '2026-03-31', netIncome: 110, eps: 55 }, // 2 股
    { end: '2026-06-30', netIncome: 100, eps: 2 }, // 50 股（25:1 拆股后）
  ]
  const r = splitAdjust(q)
  assert.equal(r.adjusted, true)
  assert.equal(r.ratio, 25)
  assert.equal(r.quarters[0].eps, 2)
  assert.equal(r.quarters[2].eps, 2)
  assert.equal(splitAdjust([{ end: 'a', netIncome: 100, eps: 1 }, { end: 'b', netIncome: 110, eps: 1.05 }]).adjusted, false)
  // 单季隐含股本异常（微利季 EPS 四舍五入）不算拆股
  assert.equal(splitAdjust([{ end: 'a', netIncome: 100, eps: 1 }, { end: 'b', netIncome: 5, eps: 0.01 }, { end: 'c', netIncome: 100, eps: 1 }]).adjusted, false)
  assert.equal(splitAdjust([{ end: 'a', netIncome: 100, eps: 10 }, { end: 'b', netIncome: 100, eps: 1 }, { end: 'c', netIncome: 100, eps: 1 }]).adjusted, false) // 只有 1 季
})

test('A 股累计报表拆单季，年报口径毛利率/ROE', () => {
  const rows = []
  for (const y of [2023, 2024, 2025, 2026]) {
    for (const [md, k] of [['0331', 1], ['0630', 2], ['0930', 3], ['1231', 4]]) {
      if (y === 2026 && k > 2) continue
      rows.push({ 报告期: `${y}${md}`, 归母净利润: k * 10 * (y - 2022), 营业总收入: k * 100, 毛利率: 30 + (y - 2023), '净资产收益率(ROE)': 10 + (y - 2023), 资产负债率: 40, 流动比率: 1.5 })
    }
  }
  const s = normalizeSinaCn({ rows })
  assert.equal(s.quarters.find(q => q.end === '2025-06-30').netIncome, 30) // 60 − 30
  const out = buildInputs(s, { key: 'cn:000001', sector: '工业', cutoff: '2026-06-30', peerMedian: 23.1 })
  assert.deepEqual(out.windowEnds, ['2026-06-30', '2025-06-30', '2024-06-30'])
  assert.equal(out.profits[0], 20 * 4 + 40 * 3 - 20 * 3) // H1 2026 + FY2025 − H1 2025
  assert.equal(out.m.i[0][2], '毛利率 32.0%（同行业中位 23.1%）') // 最新财年 2025
  assert.equal(out.m.i[2][2], '近三年 ROE 12%/11%/10%（要求最新 ≥15% 且三年最低 ≥12%）')
})

test('东方财富美股单季 → 输入，EPS 口径与 ROE 四季合计', () => {
  const rows = quarters(12, _i => ({})).map((q, i) => ({
    REPORT_DATE: `${q.end} 00:00:00`, OPERATE_INCOME: 100 + i, GROSS_PROFIT: 60, PARENT_HOLDER_NETPROFIT: 10, DILUTED_EPS: 1 + i * 0.1,
    ROE_AVG: 5, DEBT_ASSET_RATIO: 50, CURRENT_RATIO: 1.2,
  }))
  const s = normalizeEmUsQuarterly({ rows })
  const out = buildInputs(s, { key: 'us:X', sector: '信息技术', peerMedian: 58.8 })
  assert.equal(out.m.i[2][2], '近三年 ROE 20%/20%/20%（要求最新 ≥15% 且三年最低 ≥12%）')
  assert.equal(out.profitMetric, '稀释 EPS（四季合计）')
  assert.equal(out.m.i[4][1], true)
  assert.equal(out.m.i[5][1], true)
})

test('SEC companyfacts：第四季 = 全年 − 9 个月累计', () => {
  const f = (start, end, val, filed = '2026-01-01') => ({ start, end, val, filed })
  const raw = {
    facts: {
      'us-gaap:NetIncomeLoss': { USD: [f('2025-01-01', '2025-03-31', 1), f('2025-01-01', '2025-09-30', 6), f('2025-01-01', '2025-12-31', 10), f('2025-04-01', '2025-06-30', 2), f('2025-07-01', '2025-09-30', 3)] },
      'us-gaap:Assets': { USD: [{ end: '2025-12-31', val: 100, filed: 'x' }] },
      'us-gaap:Liabilities': { USD: [{ end: '2025-12-31', val: 40, filed: 'x' }] },
    },
  }
  const s = normalizeSec(raw)
  assert.equal(s.quarters.find(q => q.end === '2025-12-31').netIncome, 4)
  assert.equal(s.balance.debtRatio, 40)
})

test('同行业中位：市场+板块（≥4 家）否则全市场退回值', () => {
  const e = med => ({ m: { i: [['定价权', true, `毛利率 50.0%（同行业中位 ${med}%）`]] } })
  const lynch = { 'us:A': e('62.5'), 'us:B': e('62.5'), 'us:C': e('62.5'), 'us:D': e('62.5'), 'us:E': e('47.2'), 'us:F': e('47.2') }
  const sector = { 'us:A': '医疗', 'us:B': '医疗', 'us:C': '医疗', 'us:D': '医疗', 'us:E': '材料', 'us:F': '公用' }
  const idx = peerMedianIndex(lynch, k => ({ sector: sector[k] }))
  assert.equal(idx.lookup('us', '医疗').median, 62.5)
  assert.equal(idx.lookup('ndx', '医疗').median, 62.5)
  assert.equal(idx.lookup('us', '能源').median, 47.2)
})
